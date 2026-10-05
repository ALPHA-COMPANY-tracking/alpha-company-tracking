// ─────────────────────────────────────────────────────────────
// Previsão do Mês: quanto deve entrar e quanto deve sobrar até o último
// dia do mês — o que a Demonstração de Resultados "Este mês" deve mostrar
// nesse dia. Tudo sai do histórico REAL da operação:
//
//   · Quanto paga: dos pedidos que já se resolveram (pago ou frustração)
//     nos últimos 120 dias, quantos pagaram — conforme a etapa em que o
//     pedido está hoje. Pedido já entregue paga mais que pedido a enviar,
//     porque já passou do risco de roubo, devolução e cancelamento.
//   · Quando paga: quantos dias os pagamentos levaram, do agendamento ao
//     pagamento. Um pedido de 10 dias só conta com os pagamentos que
//     levaram 10 dias ou mais.
//   · Vendas que ainda vão ser agendadas: o ritmo dos últimos 14 dias.
//   · Anúncios dos dias que faltam: a média dos últimos 7 dias.
//
// Negociação/jurídico fica de fora (sem previsão), e pedido parado há
// mais tempo do que qualquer pagamento já visto também.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, IsoDate, Pedido } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { addDias, diasInclusivos, isDentro, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';
import { calcularPnl, custoNoPeriodo } from '@/lib/pnl';
import { dataAprovacaoPedido, pedidosAtivos } from '@/lib/pedidos';
import { motivoFrustracao, situacaoDoPedido } from '@/lib/indicadores';
import {
  COMISSAO_COBRANCA,
  comissaoDoVendedor,
  custoProdutoDoPlano,
  ehBoleto,
  FRETE_POR_PEDIDO,
  perdaRealDePedido,
  TAXA_BOLETO,
} from '@/lib/custosConfig';

/** Etapas que entram na previsão. */
export type Etapa = 'aguardando' | 'rota' | 'preparo';

const JANELA_DIAS = 120;
const RITMO_DIAS = 14;
const ADS_DIAS = 7;

export interface LinhaEtapa {
  etapa: Etapa | 'novas';
  /** Pedidos nessa etapa hoje (novas: quantos devem ser agendados). */
  qtd: number;
  /** Valor agendado deles. */
  valor: Cents;
  /** Dos pedidos que passaram por essa etapa, quantos pagaram. */
  taxa: number;
  /** O que deve entrar até o fim do mês. */
  previsto: Cents;
}

export interface PontoDia {
  data: IsoDate;
  /** Recebido de verdade, acumulado no mês (até hoje). */
  real: Cents | null;
  /** Previsto, acumulado (de hoje até o fim do mês). */
  previsto: Cents | null;
}

export interface PrevisaoMes {
  inicio: IsoDate;
  fim: IsoDate;
  hoje: IsoDate;
  /** Dias depois de hoje até o fim do mês. */
  diasRestantes: number;

  ja_entrou: Cents;
  qtd_pagamentos: number;
  /** Dos pedidos que já existem + das vendas que ainda vão entrar. */
  deve_entrar: Cents;
  faturamento_previsto: Cents;
  /** Dos pedidos que já existem, nos próximos 7 dias (hoje incluído). */
  proximos_7_dias: Cents;
  linhas: LinhaEtapa[];
  /** Ritmo dos últimos 14 dias. */
  ritmo: { qtd_dia: number; valor_dia: Cents };

  fora: {
    negociacao: { qtd: number; valor: Cents };
    /** Abertos há mais tempo do que qualquer pagamento já visto. */
    parados: { qtd: number; valor: Cents };
  };

  lucro: {
    /** O mesmo da Demonstração de Resultados "Este mês", hoje. */
    ate_agora: Cents;
    receita_prevista: Cents;
    /** Produto, frete, comissões e taxa de boleto do que deve entrar. */
    custos_da_receita: Cents;
    /** Média diária dos últimos 7 dias × dias que faltam. */
    ads_restante: Cents;
    ads_dia: Cents;
    /** Custos variáveis mensais rateados que ainda faltam no mês. */
    fixos_restantes: Cents;
    /** Custo real das frustrações que devem acontecer até o fim do mês. */
    frustracao_prevista: Cents;
    previsto: Cents;
    margem: number;
  };

  /** De onde vêm os números — para a tela explicar. */
  base: {
    resolvidos: number;
    /** Metade dos pagamentos chega em até X dias depois do agendamento. */
    atraso_mediano: number | null;
    /** O que entra de fato por real agendado (desconto, pagamento parcial). */
    fator_recebido: number;
  };

  serie: PontoDia[];
}

const valorAgendado = (p: Pedido) => Number(p.valor_agendado ?? p.valor) || 0;
const idade = (p: Pedido, hoje: IsoDate) => diasInclusivos(p.data, hoje) - 1;

/** Em que etapa a frustração aconteceu: antes de sair, na rua ou depois de entregue. */
function etapaDaFalha(p: Pedido): Etapa {
  const motivo = motivoFrustracao(p);
  if (motivo === 'perda_cobranca' || motivo === 'aguardando_devolucao') return 'aguardando';
  if (motivo === 'cancelado' && !(p.rastreamento || p.passou_correios)) return 'preparo';
  return 'rota';
}

export function preverMes(pedidos: Pedido[], dailies: AfterpayDaily[], custos: CustoVariavel[], hoje: IsoDate): PrevisaoMes {
  const { y, m } = parseYmd(hoje);
  const inicio = primeiroDiaMes(y, m);
  const fim = ultimoDiaMes(y, m);
  const diasRestantes = diasInclusivos(hoje, fim) - 1;
  const ativos = pedidosAtivos(pedidos).filter((p) => p.data <= hoje);

  // ── Histórico: quanto paga e quando paga ──
  const desde = addDias(hoje, -JANELA_DIAS);
  const resolvidosJanela = ativos.filter((p) => p.data >= desde && ['pago', 'frustracao'].includes(situacaoDoPedido(p.status)));
  // Operação nova (pouca história): usa tudo o que tem.
  const resolvidos =
    resolvidosJanela.length >= 20 ? resolvidosJanela : ativos.filter((p) => ['pago', 'frustracao'].includes(situacaoDoPedido(p.status)));
  const pagos = resolvidos.filter((p) => situacaoDoPedido(p.status) === 'pago');
  const falhas = resolvidos.filter((p) => situacaoDoPedido(p.status) === 'frustracao');
  const falhasEm = (etapas: Etapa[]) => falhas.filter((p) => etapas.includes(etapaDaFalha(p)));
  // Uma etapa conta as falhas dela e as das etapas seguintes.
  const falhasDaEtapa: Record<Etapa, Pedido[]> = {
    aguardando: falhasEm(['aguardando']),
    rota: falhasEm(['aguardando', 'rota']),
    preparo: falhas,
  };
  const taxa: Record<Etapa, number> = {
    aguardando: safeDiv(pagos.length, pagos.length + falhasDaEtapa.aguardando.length),
    rota: safeDiv(pagos.length, pagos.length + falhasDaEtapa.rota.length),
    preparo: safeDiv(pagos.length, pagos.length + falhasDaEtapa.preparo.length),
  };
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const perdaMedia: Record<Etapa, number> = {
    aguardando: media(falhasDaEtapa.aguardando.map(perdaRealDePedido)),
    rota: media(falhasDaEtapa.rota.map(perdaRealDePedido)),
    preparo: media(falhasDaEtapa.preparo.map(perdaRealDePedido)),
  };
  const fator_recebido = Math.min(
    1,
    safeDiv(
      pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0),
      pagos.reduce((s, p) => s + valorAgendado(p), 0),
    ) || 1,
  );
  const atrasos = pagos.map((p) => Math.max(0, diasInclusivos(p.data, dataAprovacaoPedido(p)) - 1)).sort((a, b) => a - b);
  const atraso_mediano = atrasos.length ? atrasos[Math.floor((atrasos.length - 1) / 2)] : null;

  /** Chance de pagar NO dia hoje+k, sabendo que com `a` dias ainda não pagou (null = parado demais). */
  const pagaNoDia = (a: number) => {
    const vivos = atrasos.filter((d) => d >= a).length;
    if (!vivos) return null;
    return (k: number) => atrasos.filter((d) => d === a + k).length / vivos;
  };
  /** Chance de um pedido NOVO pagar x dias depois de agendado. */
  const pagaEm = (x: number) => (atrasos.length ? atrasos.filter((d) => d === x).length / atrasos.length : 0);

  // ── Pedidos que já existem ──
  const porDia = new Array<number>(diasRestantes + 1).fill(0); // k = 0..diasRestantes
  const linhas: Record<Etapa, LinhaEtapa> = {
    aguardando: { etapa: 'aguardando', qtd: 0, valor: 0, taxa: taxa.aguardando, previsto: 0 },
    rota: { etapa: 'rota', qtd: 0, valor: 0, taxa: taxa.rota, previsto: 0 },
    preparo: { etapa: 'preparo', qtd: 0, valor: 0, taxa: taxa.preparo, previsto: 0 },
  };
  const fora = { negociacao: { qtd: 0, valor: 0 }, parados: { qtd: 0, valor: 0 } };
  let proximos7 = 0;
  let custosReceita = 0;
  let frustracaoPrevista = 0;

  for (const p of ativos) {
    const s = situacaoDoPedido(p.status);
    if (s === 'pago' || s === 'frustracao') continue;
    const face = valorAgendado(p);
    if (s === 'negociacao') {
      fora.negociacao.qtd += 1;
      fora.negociacao.valor += reaisToCents(face);
      continue;
    }
    const chance = pagaNoDia(idade(p, hoje));
    if (!chance) {
      fora.parados.qtd += 1;
      fora.parados.valor += reaisToCents(face);
      continue;
    }
    const etapa = s as Etapa;
    const linha = linhas[etapa];
    linha.qtd += 1;
    linha.valor += reaisToCents(face);

    let resolveAteFim = 0;
    for (let k = 0; k <= diasRestantes; k++) {
      const c = chance(k);
      resolveAteFim += c;
      porDia[k] += face * fator_recebido * taxa[etapa] * c;
    }
    let resolveEm7 = 0;
    for (let k = 0; k <= 6; k++) resolveEm7 += chance(k);
    proximos7 += face * fator_recebido * taxa[etapa] * resolveEm7;

    const pagaAteFim = taxa[etapa] * resolveAteFim;
    const recebido = face * fator_recebido;
    linha.previsto += reaisToCents(recebido * pagaAteFim);
    custosReceita +=
      pagaAteFim *
      (custoProdutoDoPlano(p.produto_plano) +
        FRETE_POR_PEDIDO +
        recebido * (comissaoDoVendedor(p.vendedor) + COMISSAO_COBRANCA) +
        (ehBoleto(p) ? TAXA_BOLETO : 0));
    // A frustração entra no mês em que o pedido foi AGENDADO (regra do P&L).
    if (p.data >= inicio) frustracaoPrevista += (1 - taxa[etapa]) * resolveAteFim * perdaMedia[etapa];
  }

  // ── Vendas que ainda vão ser agendadas (ritmo dos últimos 14 dias) ──
  const ritmoDe = addDias(hoje, -RITMO_DIAS);
  const ultimos = ativos.filter((p) => p.data >= ritmoDe && p.data < hoje);
  const qtdDia = ultimos.length / RITMO_DIAS;
  const valorDia = ultimos.reduce((s, p) => s + valorAgendado(p), 0) / RITMO_DIAS;
  const custoFixoMedio = media(
    ultimos.map((p) => custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO + (ehBoleto(p) ? TAXA_BOLETO : 0)),
  );
  const comissaoMedia = safeDiv(
    ultimos.reduce((s, p) => s + valorAgendado(p) * (comissaoDoVendedor(p.vendedor) + COMISSAO_COBRANCA), 0),
    ultimos.reduce((s, p) => s + valorAgendado(p), 0),
  );
  let novasPagas = 0; // pedidos novos que devem pagar até o fim do mês
  let novasResolvem = 0;
  for (let dia = 1; dia <= diasRestantes; dia++) {
    for (let k = dia; k <= diasRestantes; k++) {
      const c = pagaEm(k - dia);
      porDia[k] += valorDia * fator_recebido * taxa.preparo * c;
      novasPagas += qtdDia * taxa.preparo * c;
      novasResolvem += qtdDia * c;
    }
  }
  const novasPrevisto = novasPagas * (qtdDia ? valorDia / qtdDia : 0) * fator_recebido;
  custosReceita += novasPagas * custoFixoMedio + novasPrevisto * comissaoMedia;
  frustracaoPrevista += (novasResolvem - novasPagas) * perdaMedia.preparo;
  const novas: LinhaEtapa = {
    etapa: 'novas',
    qtd: Math.round(qtdDia * diasRestantes),
    valor: reaisToCents(valorDia * diasRestantes),
    taxa: taxa.preparo,
    previsto: reaisToCents(novasPrevisto),
  };

  // ── O que já aconteceu no mês (a Demonstração "Este mês") ──
  const ateHoje = { inicio, fim: hoje };
  const pnl = calcularPnl(dailies, custos, ateHoje, {}, pedidos);
  const fixos_restantes = custos.reduce((s, c) => s + custoNoPeriodo(c, { inicio, fim }) - custoNoPeriodo(c, ateHoje), 0);
  const adsDe = addDias(hoje, -ADS_DIAS);
  const adsDias = dailies.filter((d) => d.data >= adsDe && d.data < hoje);
  const ads_dia = reaisToCents(
    adsDias.reduce((s, d) => s + (Number(d.investimento_ads) || 0) + (Number(d.taxas_investimento) || 0), 0) / ADS_DIAS,
  );
  const ads_restante = ads_dia * diasRestantes;

  const deve_entrar = Object.values(linhas).reduce((s, l) => s + l.previsto, 0) + novas.previsto;
  const custos_da_receita = reaisToCents(custosReceita);
  const frustracao_prevista = reaisToCents(frustracaoPrevista);
  const previsto = pnl.lucro_real + deve_entrar - custos_da_receita - ads_restante - fixos_restantes - frustracao_prevista;
  const faturamento_previsto = pnl.receita_aprovada + deve_entrar;

  // ── Série do gráfico: recebido de verdade até hoje, previsto depois ──
  const pagosNoMes = new Map<string, number>();
  for (const p of ativos) {
    if (situacaoDoPedido(p.status) !== 'pago') continue;
    const d = dataAprovacaoPedido(p);
    if (isDentro(d, inicio, hoje)) pagosNoMes.set(d, (pagosNoMes.get(d) ?? 0) + (Number(p.valor) || 0));
  }
  const serie: PontoDia[] = [];
  let acumReal = 0;
  let acumPrev = 0;
  for (let d = inicio; d <= fim; d = addDias(d, 1)) {
    if (d <= hoje) {
      acumReal += pagosNoMes.get(d) ?? 0;
      serie.push({ data: d, real: reaisToCents(acumReal), previsto: d === hoje ? reaisToCents(acumReal) : null });
      if (d === hoje) acumPrev = acumReal + porDia[0];
    } else {
      acumPrev += porDia[diasInclusivos(hoje, d) - 1];
      serie.push({ data: d, real: null, previsto: reaisToCents(acumPrev) });
    }
  }

  return {
    inicio,
    fim,
    hoje,
    diasRestantes,
    ja_entrou: pnl.receita_aprovada,
    qtd_pagamentos: pnl.qtd_pagamentos,
    deve_entrar,
    faturamento_previsto,
    proximos_7_dias: reaisToCents(proximos7),
    linhas: [linhas.aguardando, linhas.rota, linhas.preparo, novas],
    ritmo: { qtd_dia: qtdDia, valor_dia: reaisToCents(valorDia) },
    fora,
    lucro: {
      ate_agora: pnl.lucro_real,
      receita_prevista: deve_entrar,
      custos_da_receita,
      ads_restante,
      ads_dia,
      fixos_restantes,
      frustracao_prevista,
      previsto,
      margem: safeDiv(previsto, faturamento_previsto),
    },
    base: { resolvidos: resolvidos.length, atraso_mediano, fator_recebido },
    serie,
  };
}
