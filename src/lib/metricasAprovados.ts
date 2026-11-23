// ─────────────────────────────────────────────────────────────
// Métricas Aprovados (Gerenciamento Administrativo — pedido do Jonas,
// 23/11/2026): o que entra, quanto PRECISA entrar para a empresa empatar
// e onde a cobrança trava.
//
// Cada número diz o que conta, porque a dashboard já tem várias
// "conversões" diferentes (P&L, Visualização, Metas & Lucro):
//   • Conversão da SAFRA — dos pedidos FEITOS no período, quanto já pagou
//     (R$ recebido ÷ R$ agendado; pedidos pagos ÷ pedidos; pagos ÷
//     resolvidos). É a conversão "pura": não mistura pagamento de pedido
//     de outro mês. Pedido recente ainda está em aberto — ela sobe com o
//     tempo.
//   • Ponto de equilíbrio do MÊS — o recebido que zera o Lucro Real da
//     Demonstração: custos que não dependem do recebido (anúncio projetado,
//     custos variáveis do mês inteiro, perda com frustração) ÷ a margem de
//     contribuição (o que sobra de cada R$ recebido depois de produto,
//     frete, taxa de boleto e comissões). Mesma divisão da DRE.
//   • Projeção do mês — mínimo e projeção na MESMA base: o ritmo dos dias
//     já fechados (hoje ainda está pela metade; nos 3 primeiros dias, a
//     média do mês anterior). O mínimo paga o anúncio do mês inteiro, então
//     é comparado com o recebido do mês inteiro no mesmo ritmo — comparar com
//     a Previsão do Mês (que não conta vendas novas) deixava todo começo de
//     mês vermelho (revisão de 23/11/2026).
//   • Previsão — a da Previsão do Mês (preverMes): só os pedidos que já
//     existem, 80% pagam (decisão do Jonas de 05/10/2026). Informativa.
//
// Pedido e pagamento em REAIS; P&L, previsão e equilíbrio em CENTAVOS.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, IsoDate, Pedido, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { addDias, diaSP, diasNoMes, isDentro, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';
import { ehFrustracao, foraDoAgendado, pagamentosDoPedido, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { preverMes } from '@/lib/previsao';

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface Fatia {
  qtd: number;
  valor: number;
}

// ── 1. Conversão da safra ─────────────────────────────────────

export interface Conversao {
  /** Pedidos agendados (a mesma regra do Faturamento Agendado). */
  qtd: number;
  /** R$ agendado. */
  valor: number;
  pagos: number;
  /** R$ que já entrou desses pedidos (todas as parcelas, qualquer dia). */
  recebido: number;
  /** Frustração de verdade (devolvido, roubo…; cancelado não). */
  perdidos: number;
  /** Ainda em andamento: nem pago, nem perdido, nem cancelado. */
  emAberto: Fatia;
  /** R$ recebido ÷ R$ agendado. */
  pct_valor: number | null;
  /** Pedidos pagos ÷ pedidos agendados. */
  pct_qtd: number | null;
  /** Pagos ÷ (pagos + perdidos): dos que já se resolveram, quantos pagaram. */
  pct_resolvidos: number | null;
}

function acumular(lista: Pedido[]): Conversao {
  let valor = 0;
  let pagos = 0;
  let recebido = 0;
  let perdidos = 0;
  const emAberto: Fatia = { qtd: 0, valor: 0 };
  for (const p of lista) {
    const v = Number(p.valor_agendado ?? p.valor) || 0;
    valor += v;
    if (statusBucket(p.status) === 'aprovado') {
      pagos += 1;
      recebido += pagamentosDoPedido(p).reduce((s, pg) => s + pg.valor, 0);
    } else if (ehFrustracao(p)) {
      perdidos += 1;
    } else if (statusBucket(p.status) !== 'frustrado') {
      emAberto.qtd += 1;
      emAberto.valor += v;
    }
  }
  return {
    qtd: lista.length,
    valor,
    pagos,
    recebido,
    perdidos,
    emAberto,
    pct_valor: div(recebido, valor),
    pct_qtd: div(pagos, lista.length),
    pct_resolvidos: div(pagos, pagos + perdidos),
  };
}

/** Os pedidos agendados no período (data do pedido; sem recusado e afins). */
function safraDe(pedidos: Pedido[], periodo: Periodo): Pedido[] {
  return pedidosAtivos(pedidos).filter((p) => isDentro(p.data, periodo.inicio, periodo.fim) && !foraDoAgendado(p));
}

/** Dos pedidos feitos no período, quanto já virou pagamento. */
export function conversaoDaSafra(pedidos: Pedido[], periodo: Periodo): Conversao {
  return acumular(safraDe(pedidos, periodo));
}

export interface ConversaoGrupo extends Conversao {
  grupo: string;
}

/** A mesma conversão, separada por um critério (forma de pagamento, vendedor…). Maior R$ agendado primeiro. */
export function conversaoPorGrupo(pedidos: Pedido[], periodo: Periodo, grupoDe: (p: Pedido) => string): ConversaoGrupo[] {
  const grupos = new Map<string, Pedido[]>();
  for (const p of safraDe(pedidos, periodo)) {
    const g = grupoDe(p);
    grupos.set(g, [...(grupos.get(g) ?? []), p]);
  }
  return [...grupos.entries()].map(([grupo, lista]) => ({ grupo, ...acumular(lista) })).sort((a, b) => b.valor - a.valor);
}

// ── 1b. Conversão do período, como o BlueSales ────────────────

export interface ConversaoPeriodo {
  /** Agendamentos do período (= os do Faturamento Agendado). */
  agendados: Fatia;
  /** Pagamentos do período SEM os de venda antecipada (pago na entrega + pela cobrança). */
  pagos: Fatia;
  /** Venda antecipada: fica de fora, porque não foi agendada. */
  antecipado: Fatia;
  /** Pagamentos ÷ agendamentos — a "Taxa de conversão" do BlueSales. */
  pct_qtd: number | null;
  /** O mesmo em R$: recebido (sem antecipado) ÷ agendado. */
  pct_valor: number | null;
}

/**
 * A "Taxa de conversão" do BlueSales: "Pagamentos aprovados (sem os de
 * Antecipado) ÷ agendamentos" do mesmo período — o pagamento de agora vem
 * de pedido de qualquer dia (23/11/2026: 162 ÷ 376 = 43,1% lá e aqui).
 * Cada parcela conta como um pagamento, igual ao BlueSales.
 */
export function conversaoDoPeriodo(pedidos: Pedido[], periodo: Periodo): ConversaoPeriodo {
  const agendados: Fatia = { qtd: 0, valor: 0 };
  for (const p of safraDe(pedidos, periodo)) somar(agendados, Number(p.valor_agendado ?? p.valor) || 0);
  const pagos: Fatia = { qtd: 0, valor: 0 };
  const antecipado: Fatia = { qtd: 0, valor: 0 };
  for (const p of pedidosAtivos(pedidos)) {
    for (const pg of pagamentosDoPedido(p)) {
      if (!isDentro(pg.data, periodo.inicio, periodo.fim)) continue;
      somar(/antecip/i.test(p.tipo_venda ?? '') ? antecipado : pagos, pg.valor);
    }
  }
  return { agendados, pagos, antecipado, pct_qtd: div(pagos.qtd, agendados.qtd), pct_valor: div(pagos.valor, agendados.valor) };
}

// ── 2. De onde veio o dinheiro do período ─────────────────────

/**
 * Primeiro dia com aviso do BlueSales (o webhook começou em 28/08/2026).
 * Pedido de antes, sem o dia da entrega, não diz se passou pela cobrança.
 */
export const INICIO_AVISOS: IsoDate = '2026-08-28';

export interface OrigemPagamentos {
  /** Igual aos "Pagamentos aprovados" do P&L (mesma data, parcelas no dia delas). */
  total: Fatia;
  /** Pago sem passar por "entregue/cobrado" — a cliente pagou na entrega. */
  naEntrega: Fatia;
  /** Pago depois de entregue — o pedido passou pela cobrança. */
  cobranca: Fatia;
  /** Venda antecipada (paga antes de sair). */
  antecipado: Fatia;
  /** Pedido de antes dos avisos, sem o dia da entrega: não dá para saber. */
  semDado: Fatia;
  /** Mediana de dias do pedido ao pagamento. */
  diasAtePagar: number | null;
  /** Mediana de dias da entrega ao pagamento, só dos que passaram pela cobrança. */
  diasDaEntregaAoPagamento: number | null;
}

const somar = (f: Fatia, valor: number) => {
  f.qtd += 1;
  f.valor += valor;
};

/** Dias entre duas datas 'YYYY-MM-DD'. */
function diasEntre(de: IsoDate, ate: IsoDate): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function origemDosPagamentos(pedidos: Pedido[], periodo: Periodo): OrigemPagamentos {
  const out: OrigemPagamentos = {
    total: { qtd: 0, valor: 0 },
    naEntrega: { qtd: 0, valor: 0 },
    cobranca: { qtd: 0, valor: 0 },
    antecipado: { qtd: 0, valor: 0 },
    semDado: { qtd: 0, valor: 0 },
    diasAtePagar: null,
    diasDaEntregaAoPagamento: null,
  };
  const ate: number[] = [];
  const daEntrega: number[] = [];
  for (const p of pedidosAtivos(pedidos)) {
    for (const pg of pagamentosDoPedido(p)) {
      if (!isDentro(pg.data, periodo.inicio, periodo.fim)) continue;
      somar(out.total, pg.valor);
      if (/antecip/i.test(p.tipo_venda ?? '')) somar(out.antecipado, pg.valor);
      else if (p.entregue_em) {
        somar(out.cobranca, pg.valor);
        daEntrega.push(Math.max(0, diasEntre(diaSP(p.entregue_em), pg.data)));
      } else if (p.data < INICIO_AVISOS) somar(out.semDado, pg.valor);
      else somar(out.naEntrega, pg.valor);
      ate.push(Math.max(0, diasEntre(p.data, pg.data)));
    }
  }
  out.diasAtePagar = mediana(ate);
  out.diasDaEntregaAoPagamento = mediana(daEntrega);
  return out;
}

// ── 3. Ponto de equilíbrio do mês ─────────────────────────────

/** Dias fechados que o mês precisa ter para projetar pelo ritmo dele; antes, vale a média do mês anterior. */
export const DIAS_FECHADOS_MIN = 3;

/** De onde vem o ritmo da projeção. */
export type BaseRitmo = 'dias_fechados' | 'mes_anterior' | 'sem_base';

export interface EquilibrioMes {
  /** 'YYYY-MM' do mês de hoje. */
  mes: string;
  diasMes: number;
  diaHoje: number;
  /** Dias que faltam, contando hoje. */
  diasRestantes: number;
  /** Já entrou no mês (= Pagamentos aprovados do mês até hoje). */
  recebido: Cents;
  /** Lucro Real do mês até hoje — o mesmo da Demonstração em "Este mês". */
  lucroHoje: Cents;
  /** Lucro Real do mês inteiro se tudo seguir no ritmo: projeção × margem − custos que não dependem do recebido. */
  lucroProjetado: Cents | null;
  /** Ritmo usado nas projeções: os dias já fechados do mês (hoje fica de fora, está pela metade) ou a média do mês anterior. */
  ritmoDe: BaseRitmo;
  /** Custos que NÃO dependem do recebido. */
  fixos: {
    /** Anúncio + taxas do anúncio do mês inteiro, no ritmo (nunca menos do que já foi gasto). */
    anuncios: Cents;
    /** Custos variáveis do mês inteiro (os mensais entram cheios no dia deles). */
    custosVariaveis: Cents;
    /** Perda com frustração: a maior entre a do mês anterior inteiro e a deste mês até hoje. */
    frustracao: Cents;
    total: Cents;
  };
  /** De cada R$ recebido, o que sobra depois de produto, frete, taxa de boleto e comissões. */
  margem: number | null;
  /** De onde veio a margem: o mês até hoje, ou o mês anterior (mês sem pagamento ainda). */
  margemDe: 'mes' | 'mes_anterior' | null;
  /** O recebido que zera o Lucro Real do mês. */
  minimo: Cents | null;
  /** O mínimo dividido pelos dias do mês. */
  minimoPorDia: Cents | null;
  /** O que falta entrar para chegar ao mínimo. */
  falta: Cents;
  /** A falta dividida pelos dias que restam (contando hoje). */
  faltaPorDia: Cents;
  /** Recebido do mês inteiro no mesmo ritmo (nunca menos do que já entrou) — a mesma base do mínimo. */
  projecao: Cents;
  /** A projeção cobre o mínimo? null = sem como calcular o mínimo. */
  cobre: boolean | null;
  /** Previsão do Mês: só os pedidos que já existem, 80% pagam (sem vendas novas). Informativa. */
  previsto: Cents;
  /** Agendado do mês inteiro no mesmo ritmo. */
  agendadoProjetado: Cents;
  /** De cada R$ agendado, quanto precisa entrar para empatar. */
  conversaoMinima: number | null;
  /** R$ recebido ÷ R$ agendado do mês anterior (a "taxa de recebimento" de Metas & Lucro). */
  conversaoMesAnterior: number | null;
  /** O mesmo no mês até hoje (mistura pagamentos de pedidos do mês anterior). */
  conversaoMes: number | null;
}

/** 'YYYY-MM' do mês anterior. */
function mesAntes(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

/** Margem de contribuição do P&L: (receita − custos que acompanham o recebido) ÷ receita. */
function margemDe(p: ReturnType<typeof calcularPnl>): number | null {
  const variaveis = p.taxas_plataforma + p.custo_produtos + p.frete + p.comissoes_vendedor + p.comissoes_cobranca;
  return div(p.receita_aprovada - variaveis, p.receita_aprovada);
}

export function equilibrioDoMes(dailies: AfterpayDaily[], custos: CustoVariavel[], pedidos: Pedido[], hoje: IsoDate): EquilibrioMes {
  const { y, m, d } = parseYmd(hoje);
  const diasMes = diasNoMes(y, m);
  const inicio = primeiroDiaMes(y, m);
  const ant = mesAntes(y, m);
  const ateHoje = calcularPnl(dailies, custos, { inicio, fim: hoje }, {}, pedidos);
  const mesInteiro = calcularPnl(dailies, custos, { inicio, fim: ultimoDiaMes(y, m) }, {}, pedidos);
  const anterior = calcularPnl(dailies, custos, { inicio: primeiroDiaMes(ant.y, ant.m), fim: ultimoDiaMes(ant.y, ant.m) }, {}, pedidos);
  // Hoje fica de fora do ritmo: o gasto do Meta e as vendas do dia ainda
  // estão chegando (no dia 1, dividir pelo dia pela metade derrubava o mínimo).
  const diasFechados = d - 1;
  const fechados = diasFechados > 0 ? calcularPnl(dailies, custos, { inicio, fim: addDias(hoje, -1) }, {}, pedidos) : null;
  const diasAnterior = diasNoMes(ant.y, ant.m);
  const restantes = diasMes - diasFechados;
  const usaMes = diasFechados >= DIAS_FECHADOS_MIN;
  /** Valor do mês inteiro: o dos dias fechados + o ritmo × os dias que faltam (hoje incluído). */
  const projetar = (fechado: number, doMesAnterior: number, jaFeito: number): number => {
    const ritmo = usaMes || doMesAnterior <= 0 ? (diasFechados > 0 ? fechado / diasFechados : 0) : doMesAnterior / diasAnterior;
    return Math.max(jaFeito, Math.round(fechado + ritmo * restantes));
  };
  const adsDe = (p: ReturnType<typeof calcularPnl> | null) => (p ? p.investimento_ads + p.taxas_investimento : 0);
  const adsAnterior = adsDe(anterior);
  const ritmoDe: BaseRitmo = usaMes ? 'dias_fechados' : adsAnterior > 0 ? 'mes_anterior' : diasFechados > 0 ? 'dias_fechados' : 'sem_base';

  const anuncios = projetar(adsDe(fechados), adsAnterior, adsDe(ateHoje));
  const custosVariaveis = mesInteiro.custos_variaveis_total;
  const frustracao = Math.max(ateHoje.desconto_frustrados, anterior.desconto_frustrados);
  const totalFixos = anuncios + custosVariaveis + frustracao;

  const margemMes = margemDe(ateHoje);
  const margemAnt = margemDe(anterior);
  const margem = margemMes ?? margemAnt;
  const margemOrigem = margemMes != null ? 'mes' : margemAnt != null ? 'mes_anterior' : null;
  const minimo = margem != null && margem > 0 ? Math.round(totalFixos / margem) : null;

  const diasRestantes = diasMes - d + 1;
  const recebido = ateHoje.receita_aprovada;
  const falta = minimo != null ? Math.max(0, minimo - recebido) : 0;
  const projecao = projetar(fechados?.receita_aprovada ?? 0, anterior.receita_aprovada, recebido);
  const previsto = preverMes(pedidos, dailies, custos, hoje).faturamento_mes;
  const agendadoProjetado = projetar(fechados?.valor_agendado ?? 0, anterior.valor_agendado, ateHoje.valor_agendado);

  return {
    mes: inicio.slice(0, 7),
    diasMes,
    diaHoje: d,
    diasRestantes,
    recebido,
    lucroHoje: ateHoje.lucro_real,
    lucroProjetado: margem != null ? Math.round(projecao * margem - totalFixos) : null,
    ritmoDe,
    fixos: { anuncios, custosVariaveis, frustracao, total: totalFixos },
    margem,
    margemDe: margemOrigem,
    minimo,
    minimoPorDia: minimo != null ? Math.round(minimo / diasMes) : null,
    falta,
    faltaPorDia: Math.round(falta / diasRestantes),
    projecao,
    cobre: minimo != null ? projecao >= minimo : null,
    previsto,
    agendadoProjetado,
    conversaoMinima: minimo != null ? div(minimo, agendadoProjetado) : null,
    conversaoMesAnterior: div(anterior.receita_aprovada, anterior.valor_agendado),
    conversaoMes: div(recebido, ateHoje.valor_agendado),
  };
}

// ── 4. Sair do negativo: quanto precisa entrar ────────────────

export interface QuantoPrecisa {
  /** Com os custos que JÁ aconteceram (Lucro Real de hoje): quanto ainda tem de entrar. */
  agora: Cents | null;
  /** Fechando o mês (anúncio dos dias que faltam no ritmo): o recebido do mês inteiro. */
  mes: Cents | null;
  /** O que falta entrar no mês para isso. */
  faltaMes: Cents | null;
  /** A falta dividida pelos dias que restam (contando hoje). */
  porDia: Cents | null;
}

/**
 * Quanto precisa entrar para o Lucro Real chegar a `lucroAlvo` (0 = sair do
 * negativo). Cada R$ que entra a mais deixa `margem` de lucro — o que sobra
 * depois de produto, frete, taxa de boleto e comissões (Jonas, 23/11/2026:
 * "quanto eu preciso receber para sair desse negativo e para um certo valor
 * positivo?"). Com lucroAlvo = 0, `mes` é o mínimo do mês.
 */
export function quantoPrecisaEntrar(eq: EquilibrioMes, lucroAlvo: Cents): QuantoPrecisa {
  if (eq.margem == null || eq.margem <= 0) return { agora: null, mes: null, faltaMes: null, porDia: null };
  const agora = Math.max(0, Math.round((lucroAlvo - eq.lucroHoje) / eq.margem));
  const mes = Math.round((eq.fixos.total + lucroAlvo) / eq.margem);
  const faltaMes = Math.max(0, mes - eq.recebido);
  return { agora, mes, faltaMes, porDia: Math.round(faltaMes / eq.diasRestantes) };
}
