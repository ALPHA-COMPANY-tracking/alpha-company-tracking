// ─────────────────────────────────────────────────────────────
// Ranking de vendedores. Tudo sai dos pedidos reais do BlueSales —
// nada é lançado à mão aqui.
//
// Duas datas diferentes, de propósito (mesma regra do P&L):
//   • agendado e frustrado contam pela data de CRIAÇÃO do pedido
//   • aprovado conta pela data do PAGAMENTO
// Um pedido agendado em 01/09 e pago em 03/09 entra como agendamento
// do dia 01 e como receita do dia 03.
//
// Agendamentos e valor seguem o RANKING do BlueSales, que conta mais que o
// card "Vendas" — ver contaNoRanking.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import {
  agregarPedidos,
  aguardaPagamento,
  dataAprovacaoPedido,
  ehCancelado,
  ehRecusado,
  pagamentosDoPedido,
  pedidosAtivos,
  statusBucket,
} from '@/lib/pedidos';
import {
  COMISSAO_COBRANCA,
  COMISSAO_POR_VENDEDOR,
  comissaoDoVendedor,
  custoProdutoDoPlano,
  freteDoPedido,
} from '@/lib/custosConfig';
import { comissaoVendedores } from '@/lib/pnl';
import { taxaPorPagamento, taxasDoPeriodo } from '@/lib/taxas';
import { periodoDoPreset } from '@/lib/periodo';
import type { PresetPeriodo } from '@/lib/periodo';

/** Por qual número o ranking é ordenado. */
export type MetricaRanking = 'agendado' | 'aprovado' | 'qtd_agendados' | 'lucro';

export const METRICAS: { id: MetricaRanking; label: string; curto: string }[] = [
  { id: 'agendado', label: 'Faturamento agendado', curto: 'Agendado' },
  { id: 'aprovado', label: 'Faturamento aprovado', curto: 'Aprovado' },
  { id: 'qtd_agendados', label: 'Quantidade de agendamentos', curto: 'Pedidos' },
  { id: 'lucro', label: 'Lucro', curto: 'Lucro' },
];

/** De onde sai o lucro de cada vendedor (centavos) — tudo o que a
 *  Demonstração de Resultados desconta, só que dos pedidos DELE. */
export interface CustosDoVendedor {
  /** Taxa de plataforma dos pagamentos dele (R$ 2,50 por boleto). */
  taxas: Cents;
  /** Produto e frete dos pedidos dele pagos no período. */
  produto: Cents;
  frete: Cents;
  /** Comissão dele sobre o que entrou menos a taxa (a linha do P&L). */
  comissao: Cents;
  /** Cobrança: 1% do que entrou dele. */
  cobranca: Cents;
  /** A parte dele no anúncio do período: o total dividido IGUAL entre os
   *  vendedores do ranking que tiveram movimento. */
  anuncio: Cents;
}

/**
 * O pedido conta como agendamento no RANKING? Regra do Ranking do BlueSales,
 * conferida pedido a pedido em 23/11/2026 (novembro 01–23: Lucas 146 ·
 * R$ 76.875,00, PETER 140, Matheus 97): TODO pedido que o vendedor fez no
 * período — inclusive o que depois cancelou, voltou, foi devolvido ou
 * roubado, e o antecipado já pago. Fica fora só o recusado (nunca foi venda),
 * o que ainda aguarda pagamento e o excluído (lixeira).
 *
 * Conta MAIS que o card "Vendas"/Faturamento Agendado, que tira o antecipado
 * pago. No BlueSales é igual: card 381 agendamentos, ranking 383. Antes daqui
 * o ranking tirava cancelado e frustrado e ficava 25 pedidos abaixo.
 */
export function contaNoRanking(p: Pick<Pedido, 'status' | 'removido_em'>): boolean {
  return !p.removido_em && !ehRecusado(p) && !aguardaPagamento(p);
}

/**
 * Quem vende mas NÃO aparece no Ranking do BlueSales: lá são "3 vendedores"
 * (23/11/2026). Jonas Neto é o administrador; Alyenderson Lima tem 1 pedido
 * em novembro (R$ 400) que o card "Vendas" conta, mas o Ranking e a
 * "Performance por atendente" de lá não. As vendas deles continuam em todos
 * os totais (card, P&L, comissões) — só não disputam posição. A tela mostra
 * embaixo o que ficou de fora, para nada sumir calado.
 */
export const FORA_DO_RANKING: ReadonlySet<string> = new Set(['JONAS NETO', 'ALYENDERSON LIMA']);

export interface LinhaRanking {
  nome: string;
  /** Percentual de comissão combinado com ele. */
  pct: number;

  /** O que ele agendou no período (data de criação), pela regra do Ranking
   *  do BlueSales (contaNoRanking) — lá chamado de "Valor bruto". */
  agendado: Cents;
  qtd_agendados: number;

  /** O que foi pago no período e é dele (data de pagamento). */
  aprovado: Cents;
  qtd_aprovados: number;

  /** Dos que ele agendou no período, os que frustraram (devolvido, voltando,
   *  roubo…; cancelado não). Já estão dentro de `agendado`: é informação. */
  frustrado: Cents;
  qtd_frustrados: number;

  /** Dos pedidos que ELE agendou no período, quantos já foram pagos.
   *  Mede a qualidade da venda dele, não o caixa do período. */
  qtd_agendados_pagos: number;
  conversao: number;

  /** Ticket médio do que ele agendou. */
  ticket_medio: Cents;

  /** Comissão dele no período — mesma conta do P&L. */
  comissao: Cents;

  /**
   * Lucro dele no período, como a coluna "Lucro" do Ranking do BlueSales: o
   * que entrou dos pagamentos dele menos os custos desses pedidos e menos a
   * parte dele no anúncio, que o BlueSales divide IGUAL entre os vendedores
   * (23/11/2026: R$ 1.942,42 de anúncio no dia → −R$ 647,47 para o Matheus,
   * que não tinha pagamento). Sem custos variáveis e SEM a frustração, como
   * lá: a soma dos vendedores é o card "Lucro total" do BlueSales, que é o
   * P&L dele mais o custo de frustração (nov/2026: 7.592,90 = 7.016,91 + 576).
   */
  lucro: Cents;
  /** lucro ÷ aprovado dele — o "%" do BlueSales; null sem aprovado. */
  margem_lucro: number | null;
  custos: CustosDoVendedor;
}

/** Normaliza o nome: o BlueSales manda "Matheus", "MATHEUS " e "Matheus ". */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

function nomeDe(p: Pedido): string {
  return (p.vendedor ?? '').trim() || 'Sem atendente';
}

export function valorDaMetrica(l: LinhaRanking, m: MetricaRanking): number {
  if (m === 'agendado') return l.agendado;
  if (m === 'aprovado') return l.aprovado;
  if (m === 'lucro') return l.lucro;
  return l.qtd_agendados;
}

/** Anúncio do período (investimento + taxas sobre ele), em centavos — as
 *  mesmas linhas da Demonstração de Resultados. */
export function anuncioDoPeriodo(dailies: AfterpayDaily[], periodo: Periodo): Cents {
  return dailies
    .filter((r) => isDentro(r.data, periodo.inicio, periodo.fim))
    .reduce((s, r) => s + reaisToCents(r.investimento_ads) + reaisToCents(r.taxas_investimento), 0);
}

/** Teve movimento no período (agendou ou recebeu)? É quem divide o anúncio —
 *  e quem a tela mostra (a mesma regra, para a soma à vista fechar). */
export function temMovimento(l: Pick<LinhaRanking, 'qtd_agendados' | 'qtd_aprovados'>): boolean {
  return l.qtd_agendados > 0 || l.qtd_aprovados > 0;
}

/** A pessoa fica fora da disputa (ver FORA_DO_RANKING)? */
export function foraDoRanking(nome: string): boolean {
  return FORA_DO_RANKING.has(chave(nome));
}

/**
 * Ranking do período, já ordenado pela métrica escolhida. Só quem disputa
 * posição — quem está em FORA_DO_RANKING sai em `deFora`.
 *
 * A comissão vem de `comissaoVendedores` (o mesmo código do P&L) para
 * não haver chance de esta tela mostrar um número e a Demonstração de
 * Resultados mostrar outro.
 */
export function rankingVendedores(
  pedidos: Pedido[],
  dailies: AfterpayDaily[],
  periodo: Periodo,
  metrica: MetricaRanking = 'agendado',
): LinhaRanking[] {
  const todas = todasAsLinhas(pedidos, dailies, periodo);
  const linhas = todas.filter((l) => !foraDoRanking(l.nome));

  // O anúncio do período é dividido IGUAL entre os vendedores do ranking que
  // tiveram movimento — a conta do BlueSales. O último leva a sobra dos
  // centavos, para a soma fechar com a Demonstração de Resultados.
  // Vai junto, do mesmo jeito, a taxa lançada à mão num dia sem pagamento
  // (ex.: R$ 2,50 da 2ª parcela no boleto): ela está na Demonstração, mas
  // nenhum pedido é dono dela.
  const dividem = linhas.filter(temMovimento);
  let resto = anuncioDoPeriodo(dailies, periodo);
  let restoTaxa = Math.max(0, taxasDoPeriodo(pedidos, dailies, periodo) - todas.reduce((s, l) => s + l.custos.taxas, 0));
  dividem.forEach((l, i) => {
    const ultimo = i === dividem.length - 1;
    const parte = ultimo ? resto : Math.round(resto / (dividem.length - i));
    const parteTaxa = ultimo ? restoTaxa : Math.round(restoTaxa / (dividem.length - i));
    resto -= parte;
    restoTaxa -= parteTaxa;
    l.custos.anuncio = parte;
    l.custos.taxas += parteTaxa;
    l.lucro -= parte + parteTaxa;
    l.margem_lucro = l.aprovado > 0 ? l.lucro / l.aprovado : null;
  });

  return ordenar(linhas, metrica);
}

/** O que quem está fora do ranking fez no período (só os que tiveram
 *  movimento) — para a tela dizer o que ficou de fora. */
export function deFora(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): LinhaRanking[] {
  return ordenar(
    todasAsLinhas(pedidos, dailies, periodo).filter(
      (l) => foraDoRanking(l.nome) && (l.qtd_agendados > 0 || l.qtd_aprovados > 0),
    ),
    'qtd_agendados',
  );
}

function todasAsLinhas(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): LinhaRanking[] {
  const ativos = pedidosAtivos(pedidos);
  // Taxa de cada pagamento do período (a mesma da Demonstração de Resultados).
  const taxaDoPagamento = taxaPorPagamento(pedidos, dailies, periodo);

  type Acc = Omit<LinhaRanking, 'pct' | 'conversao' | 'ticket_medio' | 'comissao' | 'lucro' | 'margem_lucro' | 'custos'> & {
    taxas: Cents;
    produto: Cents;
    frete: Cents;
  };
  const porPessoa = new Map<string, Acc>();

  const pegar = (nome: string): Acc => {
    const k = chave(nome);
    let a = porPessoa.get(k);
    if (!a) {
      a = {
        nome,
        agendado: 0,
        qtd_agendados: 0,
        aprovado: 0,
        qtd_aprovados: 0,
        frustrado: 0,
        qtd_frustrados: 0,
        qtd_agendados_pagos: 0,
        taxas: 0,
        produto: 0,
        frete: 0,
      };
      porPessoa.set(k, a);
    }
    return a;
  };

  for (const p of ativos) {
    const a = pegar(nomeDe(p));
    const bucket = statusBucket(p.status);

    if (isDentro(p.data, periodo.inicio, periodo.fim) && contaNoRanking(p)) {
      // O mesmo valor do card "Vendas" (valor atual da venda) — o "Valor
      // bruto" do Ranking do BlueSales bateu com ele pedido a pedido.
      const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
      a.agendado += valor;
      a.qtd_agendados++;
      if (bucket === 'aprovado') a.qtd_agendados_pagos++;
      // Cancelado não é frustração (card próprio); conta só no agendado.
      if (bucket === 'frustrado' && !ehCancelado(p)) {
        a.frustrado += valor;
        a.qtd_frustrados++;
      }
    }

    for (const pg of pagamentosDoPedido(p)) {
      if (!isDentro(pg.data, periodo.inicio, periodo.fim)) continue;
      a.aprovado += reaisToCents(pg.valor);
      a.qtd_aprovados++;
    }

    // Custos do lucro dele — as regras da Demonstração de Resultados, pedido
    // a pedido: produto e frete do que foi pago no período (custosDePedidos)
    // e a taxa de cada pagamento. A frustração NÃO entra (como no BlueSales):
    // fica na coluna Frustrados e na Demonstração.
    if (bucket === 'aprovado' && isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim)) {
      a.produto += reaisToCents(custoProdutoDoPlano(p.produto_plano));
      a.frete += reaisToCents(freteDoPedido(p));
    }
    a.taxas += taxaDoPagamento.get(p.id) ?? 0;
  }

  // Quem tem comissão combinada aparece mesmo sem venda no período: some
  // da lista seria pior do que aparecer zerado.
  for (const nome of Object.keys(COMISSAO_POR_VENDEDOR)) pegar(nome);

  // Comissão pelo mesmo caminho do P&L.
  const agg = agregarPedidos(pedidos, periodo);
  const receitaTotal = reaisToCents(agg.receita_aprovada);
  const taxas = taxasDoPeriodo(pedidos, dailies, periodo);
  const comissoes = new Map(
    comissaoVendedores(agg.porAtendente, receitaTotal, taxas).map((c) => [chave(c.nome), c.comissao]),
  );

  return [...porPessoa.entries()].map(([k, { taxas: taxasDele, produto, frete, ...a }]) => {
    const pct = comissaoDoVendedor(a.nome);
    // Comissão como a linha do P&L: sobre o que entrou menos a taxa dos
    // pagamentos dele (o BlueSales: "a comissão é calculada sobre o valor que
    // sobra após as taxas da plataforma").
    const comissaoLiquida = a.aprovado > 0 ? Math.round((a.aprovado - taxasDele) * pct) : 0;
    const cobranca = Math.round(a.aprovado * COMISSAO_COBRANCA);
    const custos: CustosDoVendedor = {
      taxas: taxasDele,
      produto,
      frete,
      comissao: comissaoLiquida,
      cobranca,
      anuncio: 0, // rankingVendedores divide o anúncio entre quem disputa
    };
    const lucro = a.aprovado - taxasDele - produto - frete - comissaoLiquida - cobranca;
    return {
      ...a,
      pct,
      conversao: safeDiv(a.qtd_agendados_pagos, a.qtd_agendados),
      ticket_medio: a.qtd_agendados > 0 ? Math.round(a.agendado / a.qtd_agendados) : 0,
      comissao: comissoes.get(k) ?? 0,
      lucro,
      margem_lucro: a.aprovado > 0 ? lucro / a.aprovado : null,
      custos,
    };
  });
}

export function ordenar(linhas: LinhaRanking[], metrica: MetricaRanking): LinhaRanking[] {
  // Desempate: quem agendou mais valor, depois quem agendou mais pedidos,
  // e por último o nome — para a ordem nunca oscilar entre renders.
  return [...linhas].sort(
    (a, b) =>
      valorDaMetrica(b, metrica) - valorDaMetrica(a, metrica) ||
      b.agendado - a.agendado ||
      b.qtd_agendados - a.qtd_agendados ||
      a.nome.localeCompare(b.nome),
  );
}

/** Os períodos comparados lado a lado na tela. */
export const PERIODOS_RANKING: { preset: PresetPeriodo; label: string }[] = [
  { preset: 'hoje', label: 'Hoje' },
  { preset: 'ontem', label: 'Ontem' },
  { preset: '7d', label: '7 dias' },
  { preset: '30d', label: '30 dias' },
  { preset: 'mes_atual', label: 'Este mês' },
  { preset: 'mes_passado', label: 'Mês passado' },
];

export interface ColunaComparativo {
  label: string;
  /** Nome (normalizado) → posição no ranking, 1 = primeiro. */
  posicao: Map<string, number>;
  /** Nome (normalizado) → valor da métrica naquele período. */
  valor: Map<string, number>;
  /** Nome (normalizado) → a linha inteira daquele período (agendamentos e
   *  valor juntos, como o BlueSales mostra). */
  linha: Map<string, LinhaRanking>;
}

/**
 * Posição de cada vendedor em cada período, para ver a evolução sem
 * ficar trocando o filtro do topo.
 */
export function comparativoPorPeriodo(
  pedidos: Pedido[],
  dailies: AfterpayDaily[],
  metrica: MetricaRanking,
  hoje?: string,
): ColunaComparativo[] {
  return PERIODOS_RANKING.map(({ preset, label }) => {
    const p = hoje ? periodoDoPreset(preset, hoje) : periodoDoPreset(preset);
    const linhas = rankingVendedores(pedidos, dailies, p, metrica);
    const posicao = new Map<string, number>();
    const valor = new Map<string, number>();
    const linha = new Map<string, LinhaRanking>();
    let lugar = 0;
    for (const l of linhas) {
      const v = valorDaMetrica(l, metrica);
      valor.set(chave(l.nome), v);
      linha.set(chave(l.nome), l);
      // Quem não vendeu no período não recebe posição: ficaria "3º lugar"
      // com zero, o que não quer dizer nada.
      if (v > 0) posicao.set(chave(l.nome), ++lugar);
    }
    return { label, posicao, valor, linha };
  });
}

export { chave as chaveVendedor };
