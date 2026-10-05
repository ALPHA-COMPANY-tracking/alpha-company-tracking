// ─────────────────────────────────────────────────────────────
// Previsão do Mês — com a BASE DE HOJE: o lucro do mês até agora mais o
// que os pedidos que já existem (entregues, na rua, a enviar) devem
// render. Sem vendas que ainda não aconteceram e sem os anúncios que
// trariam essas vendas: responde "com o que eu tenho, estou no positivo
// ou no vermelho?". Tudo sai do histórico REAL da operação:
//
//   · Quanto paga: dos pedidos que já se resolveram (pago ou frustração)
//     nos últimos 120 dias, quantos pagaram — conforme a etapa em que o
//     pedido está hoje. Pedido já entregue paga mais que pedido a enviar,
//     porque já passou do risco de roubo, devolução e cancelamento.
//   · Quanto perde quando não paga: a perda média (regras do BlueSales)
//     das frustrações dessa etapa.
//   · Quando paga (só para o gráfico e o "até o fim do mês"): quantos dias
//     os pagamentos levaram, do agendamento ao pagamento. Um pedido de 10
//     dias só conta com os pagamentos que levaram 10 dias ou mais.
//
// Negociação/jurídico fica de fora (sem previsão), e pedido parado há
// mais tempo do que qualquer pagamento já visto também.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, IsoDate, Pedido } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { addDias, diasInclusivos, isDentro, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
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

export interface LinhaEtapa {
  etapa: Etapa;
  /** Pedidos nessa etapa hoje. */
  qtd: number;
  /** Valor agendado deles. */
  valor: Cents;
  /** Dos pedidos que passaram por essa etapa, quantos pagaram. */
  taxa: number;
  /** O que esses pedidos devem render (sem corte de data). */
  previsto: Cents;
}

export interface PontoDia {
  data: IsoDate;
  /** Recebido de verdade, acumulado no mês (até hoje). */
  real: Cents | null;
  /** Previsto com a base de hoje, acumulado (de hoje até o fim do mês). */
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
  /** Pedidos em aberto que entram na previsão. */
  base: { qtd: number; valor: Cents };
  /** O que a base deve render, sem corte de data. */
  deve_entrar: Cents;
  /** Desse total, o que deve cair até o último dia do mês. */
  ate_fim_do_mes: Cents;
  /** Dos pedidos da base, nos próximos 7 dias (hoje incluído). */
  proximos_7_dias: Cents;
  /** Já entrou + o que deve cair até o fim do mês. */
  faturamento_mes: Cents;
  linhas: LinhaEtapa[];

  fora: {
    negociacao: { qtd: number; valor: Cents };
    /** Abertos há mais tempo do que qualquer pagamento já visto. */
    parados: { qtd: number; valor: Cents };
    /** Produto + frete desses pedidos: o que se perde se não pagarem. */
    perda_se_nao_pagarem: Cents;
  };

  lucro: {
    /** O mesmo da Demonstração de Resultados "Este mês", hoje. */
    ate_agora: Cents;
    receita_prevista: Cents;
    /** Produto, frete, comissões e taxa de boleto do que deve entrar. */
    custos_da_receita: Cents;
    /** Perda real dos pedidos da base que devem frustrar. */
    frustracao_prevista: Cents;
    previsto: Cents;
    /** Lucro previsto ÷ (já entrou + deve entrar). */
    margem: number;
  };

  /** De onde vêm os números — para a tela explicar. */
  historico: {
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

  // ── Histórico: quanto paga, quanto perde e quando paga ──
  const resolvido = (p: Pedido) => ['pago', 'frustracao'].includes(situacaoDoPedido(p.status));
  const desde = addDias(hoje, -JANELA_DIAS);
  const resolvidosJanela = ativos.filter((p) => p.data >= desde && resolvido(p));
  // Operação nova (pouca história): usa tudo o que tem.
  const resolvidos = resolvidosJanela.length >= 20 ? resolvidosJanela : ativos.filter(resolvido);
  const pagos = resolvidos.filter((p) => situacaoDoPedido(p.status) === 'pago');
  const falhas = resolvidos.filter((p) => situacaoDoPedido(p.status) === 'frustracao');
  const falhasEm = (etapas: Etapa[]) => falhas.filter((p) => etapas.includes(etapaDaFalha(p)));
  // Uma etapa conta as falhas dela e as das etapas seguintes.
  const falhasDaEtapa: Record<Etapa, Pedido[]> = {
    aguardando: falhasEm(['aguardando']),
    rota: falhasEm(['aguardando', 'rota']),
    preparo: falhas,
  };
  const taxa = (e: Etapa) => safeDiv(pagos.length, pagos.length + falhasDaEtapa[e].length);
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const perdaMedia = (e: Etapa) => media(falhasDaEtapa[e].map(perdaRealDePedido));
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

  // ── Os pedidos da base ──
  const porDia = new Array<number>(diasRestantes + 1).fill(0); // k = 0..diasRestantes
  const linhas: Record<Etapa, LinhaEtapa> = {
    aguardando: { etapa: 'aguardando', qtd: 0, valor: 0, taxa: taxa('aguardando'), previsto: 0 },
    rota: { etapa: 'rota', qtd: 0, valor: 0, taxa: taxa('rota'), previsto: 0 },
    preparo: { etapa: 'preparo', qtd: 0, valor: 0, taxa: taxa('preparo'), previsto: 0 },
  };
  const fora = { negociacao: { qtd: 0, valor: 0 }, parados: { qtd: 0, valor: 0 }, perda_se_nao_pagarem: 0 };
  let deveEntrar = 0;
  let ateFim = 0;
  let proximos7 = 0;
  let custosReceita = 0;
  let frustracaoPrevista = 0;

  for (const p of ativos) {
    const s = situacaoDoPedido(p.status);
    if (s === 'pago' || s === 'frustracao') continue;
    const face = valorAgendado(p);
    const chance = s === 'negociacao' ? null : pagaNoDia(idade(p, hoje));
    if (!chance) {
      const grupo = s === 'negociacao' ? fora.negociacao : fora.parados;
      grupo.qtd += 1;
      grupo.valor += reaisToCents(face);
      fora.perda_se_nao_pagarem += reaisToCents(custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO);
      continue;
    }
    const etapa = s as Etapa;
    const t = linhas[etapa].taxa;
    const recebido = face * fator_recebido;

    linhas[etapa].qtd += 1;
    linhas[etapa].valor += reaisToCents(face);
    linhas[etapa].previsto += reaisToCents(recebido * t);
    deveEntrar += recebido * t;
    custosReceita +=
      t *
      (custoProdutoDoPlano(p.produto_plano) +
        FRETE_POR_PEDIDO +
        recebido * (comissaoDoVendedor(p.vendedor) + COMISSAO_COBRANCA) +
        (ehBoleto(p) ? TAXA_BOLETO : 0));
    frustracaoPrevista += (1 - t) * perdaMedia(etapa);

    for (let k = 0; k <= diasRestantes; k++) {
      const v = recebido * t * chance(k);
      porDia[k] += v;
      ateFim += v;
    }
    for (let k = 0; k <= 6; k++) proximos7 += recebido * t * chance(k);
  }

  // ── O que já aconteceu no mês (a Demonstração "Este mês") ──
  const pnl = calcularPnl(dailies, custos, { inicio, fim: hoje }, {}, pedidos);
  const deve_entrar = Object.values(linhas).reduce((s, l) => s + l.previsto, 0);
  const custos_da_receita = reaisToCents(custosReceita);
  const frustracao_prevista = reaisToCents(frustracaoPrevista);
  const previsto = pnl.lucro_real + deve_entrar - custos_da_receita - frustracao_prevista;
  // Tudo cai dentro do mês → o mesmo número do total (sem 1 centavo de
  // diferença de arredondamento entre os dois).
  const ate_fim_do_mes = deveEntrar - ateFim < 0.01 ? deve_entrar : Math.min(reaisToCents(ateFim), deve_entrar);

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
      // O último dia fecha exatamente no faturamento do mês dos quadros.
      serie.push({ data: d, real: null, previsto: d === fim ? pnl.receita_aprovada + ate_fim_do_mes : reaisToCents(acumPrev) });
    }
  }

  const base = Object.values(linhas).reduce((b, l) => ({ qtd: b.qtd + l.qtd, valor: b.valor + l.valor }), { qtd: 0, valor: 0 });
  return {
    inicio,
    fim,
    hoje,
    diasRestantes,
    ja_entrou: pnl.receita_aprovada,
    qtd_pagamentos: pnl.qtd_pagamentos,
    base,
    deve_entrar,
    ate_fim_do_mes,
    proximos_7_dias: reaisToCents(proximos7),
    faturamento_mes: pnl.receita_aprovada + ate_fim_do_mes,
    linhas: [linhas.aguardando, linhas.rota, linhas.preparo],
    fora,
    lucro: {
      ate_agora: pnl.lucro_real,
      receita_prevista: deve_entrar,
      custos_da_receita,
      frustracao_prevista,
      previsto,
      margem: safeDiv(previsto, pnl.receita_aprovada + deve_entrar),
    },
    historico: { resolvidos: resolvidos.length, atraso_mediano, fator_recebido },
    serie,
  };
}
