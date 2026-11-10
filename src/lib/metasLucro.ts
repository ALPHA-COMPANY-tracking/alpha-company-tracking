// ─────────────────────────────────────────────────────────────
// Metas & Lucro: simulador do mês (pedido do Jonas, 02/11/2026).
//
// O Jonas define as premissas (meta de faturamento OU verba de anúncios,
// taxa de recebimento, custos, frustração e equipe) e a página mostra se o
// mês fecha no lucro, quanto de bônus a equipe ganha e se ele cabe no
// lucro. As fórmulas são EXATAMENTE as da especificação dele — os testes de
// aceite estão em metasLucro.test.ts.
//
// Valores em REAIS (não centavos): as premissas vêm de razões do mês
// anterior (ticket 582,0641…) e a conta tem que bater com os testes.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, Pedido, Periodo } from '@/types';
import { calcularPnl, cobrancasNoPeriodo, custoNoPeriodo } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { diasNoMes, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';

export type ModoMeta = 'meta' | 'verba';

export interface CustoFixo {
  nome: string;
  valor: number;
}

export interface Premissas {
  /** Qual campo foi editado por último: ele manda, o outro é calculado. */
  modo: ModoMeta;
  meta_agendado: number;
  verba_anuncios: number;
  /** Fração do agendado que vira recebido (0,5 = 50%). */
  taxa_recebimento: number;
  ticket: number;
  cpa: number;
  /** Produto, frete, taxas e comissões, sobre o recebido. */
  outros_pct: number;
  imposto_pct: number;
  /** Só os lançados À MÃO nesta página. Os da tela Custos entram por
   *  comCustosDaDash, ao vivo — não ficam guardados aqui. */
  fixos: CustoFixo[];
  /** Pedidos frustrados, sobre os agendados. */
  frustracao_pct: number;
  /** R$ por pedido frustrado (frete de ida e volta e perdas). */
  custo_frustrado: number;
  lucro_desejado: number;
  vendedores: number;
  cobradores: number;
  base_vendedor: 'agendado' | 'recebido';
  modo_bonus_empresa: 'pessoa' | 'time';
}

export interface Faixa {
  a_partir: number;
  bonus: number;
}

export interface Faixas {
  /** Sobre o faturamento individual. */
  vendedor: Faixa[];
  /** Sobre o recebido individual. */
  cobranca: Faixa[];
  /** Sobre o faturamento total. */
  empresa: Faixa[];
}

export const FAIXAS_PADRAO: Faixas = {
  vendedor: [
    { a_partir: 100_000, bonus: 250 },
    { a_partir: 150_000, bonus: 350 },
    { a_partir: 200_000, bonus: 500 },
  ],
  cobranca: [
    { a_partir: 100_000, bonus: 250 },
    { a_partir: 150_000, bonus: 350 },
    { a_partir: 200_000, bonus: 500 },
  ],
  empresa: [{ a_partir: 350_000, bonus: 500 }],
};

/** O que vem do último mês fechado (null = sem dado para calcular). */
export interface Referencias {
  ticket: number | null;
  cpa: number | null;
  outros_pct: number | null;
  taxa_recebimento_real: number | null;
  taxa_frustracao_real: number | null;
  lucro_real: number | null;
  /** Vendedores com venda no mês — o valor inicial da equipe. */
  vendedores: number;
}

/** Premissas iniciais: as fixas da especificação + as do mês anterior. */
export function premissasIniciais(ref: Referencias | null): Premissas {
  return {
    modo: 'meta',
    meta_agendado: 350_000,
    verba_anuncios: 0,
    taxa_recebimento: 0.5,
    ticket: ref?.ticket ?? 0,
    cpa: ref?.cpa ?? 0,
    outros_pct: ref?.outros_pct ?? 0,
    imposto_pct: 0.1143,
    // Os custos fixos vêm da tela Custos (custosDaDashNoMes); aqui só os
    // manuais, que começam vazios (Jonas, 10/11/2026).
    fixos: [],
    frustracao_pct: 0.25,
    custo_frustrado: 33.26,
    lucro_desejado: 30_000,
    vendedores: ref?.vendedores || 2,
    cobradores: 1,
    base_vendedor: 'agendado',
    modo_bonus_empresa: 'pessoa',
  };
}

export type Status = 'liberado' | 'abaixo' | 'prejuizo';

export interface Resultado {
  M: number;
  N: number;
  A: number;
  R: number;
  O: number;
  I: number;
  NF: number;
  FR: number;
  FX: number;
  LB: number;
  /** Resultado por pessoa (null sem ninguém na equipe). */
  indV: number | null;
  indC: number | null;
  /** Bônus unitário da faixa atingida (0 = nenhuma). */
  faixaV: number;
  faixaC: number;
  faixaE: number;
  bV: number;
  bC: number;
  bE: number;
  B: number;
  LF: number;
  mg: number;
  /** null = conta sem base (divisão por zero). Pode passar de 1. */
  taxa_necessaria: number | null;
  /** ≤ 0 = nenhum CPA fecha; null = sem base. */
  cpa_max: number | null;
  sobra_pct: number | null;
  status: Status;
}

/** A maior faixa com "a partir de" ≤ resultado (null = nenhuma). */
export function faixaAtingida(faixas: Faixa[], resultado: number | null): Faixa | null {
  if (resultado == null) return null;
  let melhor: Faixa | null = null;
  for (const f of faixas) if (f.a_partir <= resultado && (!melhor || f.a_partir > melhor.a_partir)) melhor = f;
  return melhor;
}

/** Bônus da faixa atingida; nenhuma = 0. */
export function bonusDaFaixa(faixas: Faixa[], resultado: number | null): number {
  return faixaAtingida(faixas, resultado)?.bonus ?? 0;
}

const div = (a: number, b: number): number | null => (b === 0 || !Number.isFinite(b) ? null : a / b);

/**
 * O mês com estas premissas. null quando falta base para a conta (ticket ou
 * CPA zerados, meta/verba zerada) — a tela mostra "—".
 */
export function simular(p: Premissas, f: Faixas): Resultado | null {
  let M: number, N: number, A: number;
  if (p.modo === 'meta') {
    if (p.ticket <= 0 || p.meta_agendado <= 0) return null;
    M = p.meta_agendado;
    N = M / p.ticket;
    A = N * p.cpa;
  } else {
    if (p.cpa <= 0 || p.verba_anuncios <= 0) return null;
    A = p.verba_anuncios;
    N = A / p.cpa;
    M = N * p.ticket;
  }
  const r = p.taxa_recebimento;
  const R = M * r;
  const O = R * p.outros_pct;
  const I = R * p.imposto_pct;
  const NF = N * p.frustracao_pct;
  const FR = NF * p.custo_frustrado;
  const FX = p.fixos.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const LB = R - A - O - I - FR - FX;

  const V = Math.max(0, Math.floor(p.vendedores));
  const C = Math.max(0, Math.floor(p.cobradores));
  const indV = V > 0 ? (p.base_vendedor === 'recebido' ? R : M) / V : null;
  const indC = C > 0 ? R / C : null;
  const faixaV = bonusDaFaixa(f.vendedor, indV);
  const faixaC = bonusDaFaixa(f.cobranca, indC);
  const faixaE = bonusDaFaixa(f.empresa, M);
  const bV = faixaV * V;
  const bC = faixaC * C;
  const bE = faixaE * (p.modo_bonus_empresa === 'pessoa' ? V + C : 1);
  const B = bV + bC + bE;
  const LF = LB - B;

  // Alavancas — cada uma sozinha, com o bônus B fixo.
  const L = p.lucro_desejado;
  const mg = 1 - p.outros_pct - p.imposto_pct;
  const taxa_necessaria = M * mg > 0 ? (L + A + FR + FX + B) / (M * mg) : null;
  const cpa_max =
    p.modo === 'meta'
      ? div(R * mg - FR - FX - B - L, N)
      : div(A * (p.ticket * r * mg - p.frustracao_pct * p.custo_frustrado), L + A + FX + B);
  const sobra_pct = div(R * mg - A - FR, M);

  const status: Status = LF >= L ? 'liberado' : LF >= 0 ? 'abaixo' : 'prejuizo';
  return { M, N, A, R, O, I, NF, FR, FX, LB, indV, indC, faixaV, faixaC, faixaE, bV, bC, bE, B, LF, mg, taxa_necessaria, cpa_max, sobra_pct, status };
}

// ── Custos fixos vindos da tela Custos ──────────────────────

/** Um custo cadastrado na tela Custos que cai no mês. */
export interface CustoDaDash extends CustoFixo {
  id: string;
  mensal: boolean;
  /** Dia do mês em que é cobrado. */
  dia: number;
}

/**
 * Os custos cadastrados na tela Custos que caem no mês: os mensais cheios
 * (programados no dia deles) e os avulsos com data no mês — a mesma conta
 * da Demonstração. Cadastrou, editou ou apagou lá, muda aqui.
 */
export function custosDaDashNoMes(custos: CustoVariavel[], mes: string): CustoDaDash[] {
  const periodo = periodoDoMesInteiro(mes);
  const lista: CustoDaDash[] = [];
  for (const c of custos) {
    const datas = cobrancasNoPeriodo(c, periodo);
    if (datas.length === 0) continue;
    lista.push({
      id: c.id,
      nome: c.descricao,
      valor: custoNoPeriodo(c, periodo) / 100,
      mensal: c.recorrencia === 'mensal',
      dia: parseYmd(datas[0]).d,
    });
  }
  return lista.sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
}

/** As premissas que vão para simular(): os custos da tela Custos + os manuais. */
export function comCustosDaDash(p: Premissas, daDash: CustoFixo[]): Premissas {
  return { ...p, fixos: [...daDash.map(({ nome, valor }) => ({ nome, valor })), ...p.fixos] };
}

/** O lucro projetado com a taxa de recebimento de 30% a 90%, de 1 em 1. */
export function curvaPorTaxa(p: Premissas, f: Faixas): { taxa: number; lucro: number }[] {
  const pontos: { taxa: number; lucro: number }[] = [];
  for (let t = 30; t <= 90; t++) {
    const r = simular({ ...p, taxa_recebimento: t / 100 }, f);
    if (r) pontos.push({ taxa: t / 100, lucro: r.LF });
  }
  return pontos;
}

// ── O realizado (dos mesmos cálculos dos cards) ─────────────

/** O que aconteceu num período — o mesmo P&L dos cards da Demonstração. */
export interface Realizado {
  agendado: number;
  qtd_agendados: number;
  aprovado: number;
  qtd_pagamentos: number;
  anuncios: number;
  custos_afterpay: number;
  custos_variaveis: number;
  /** O Lucro Real da Demonstração (com custos variáveis e o custo real da frustração). */
  lucro_real: number;
  frustrados: number;
  qtd_frustrados: number;
  cancelados: number;
  qtd_cancelados: number;
  vendedores: number;
}

const reais = (cents: number) => cents / 100;

export function realizado(dailies: AfterpayDaily[], custos: CustoVariavel[], pedidos: Pedido[], periodo: Periodo): Realizado {
  const pnl = calcularPnl(dailies, custos, periodo, {}, pedidos);
  const agg = agregarPedidos(pedidos, periodo);
  return {
    agendado: reais(pnl.valor_agendado),
    qtd_agendados: pnl.qtd_agendados,
    aprovado: reais(pnl.receita_aprovada),
    qtd_pagamentos: pnl.qtd_pagamentos,
    anuncios: reais(pnl.investimento_ads),
    custos_afterpay: reais(pnl.custos_afterpay),
    custos_variaveis: reais(pnl.custos_variaveis_total),
    lucro_real: reais(pnl.lucro_real),
    frustrados: reais(pnl.valor_frustrado),
    qtd_frustrados: pnl.qtd_frustrados,
    cancelados: agg.valor_cancelados,
    qtd_cancelados: agg.qtd_cancelados,
    vendedores: agg.porAtendente.filter((a) => a.nome !== 'Sem atendente' && a.pedidos > 0).length,
  };
}

/** Os derivados do mês fechado que viram premissas iniciais. */
export function referenciasDe(x: Realizado): Referencias {
  const n = (v: number | null) => (v == null || !Number.isFinite(v) ? null : v);
  return {
    ticket: n(div(x.agendado, x.qtd_agendados)),
    cpa: n(div(x.anuncios, x.qtd_agendados)),
    outros_pct: n(div(x.custos_afterpay - x.anuncios, x.aprovado)),
    taxa_recebimento_real: n(div(x.aprovado, x.agendado)),
    taxa_frustracao_real: n(div(x.qtd_frustrados, x.qtd_agendados)),
    lucro_real: x.lucro_real,
    vendedores: x.vendedores,
  };
}

/** As taxas do comparativo (null = divisão por zero → "—"). */
export function taxasDe(x: Realizado) {
  return {
    taxa_recebimento: div(x.aprovado, x.agendado),
    anuncios_sobre_recebido: div(x.anuncios, x.aprovado),
    taxa_frustracao: div(x.qtd_frustrados, x.qtd_agendados),
    cpa: div(x.anuncios, x.qtd_agendados),
  };
}

/** Realizado até hoje ÷ dias decorridos × dias do mês (só valores em R$). */
export function projetarPeloRitmo(valor: number, hoje: string): number {
  const { y, m, d } = parseYmd(hoje);
  return (valor / d) * diasNoMes(y, m);
}

// ── Meses ───────────────────────────────────────────────────

/** 'YYYY-MM' → o mês inteiro. */
export function periodoDoMesInteiro(mes: string): Periodo {
  const [y, m] = mes.split('-').map(Number);
  return { inicio: primeiroDiaMes(y, m), fim: ultimoDiaMes(y, m) };
}

/** 'YYYY-MM' do mês anterior. */
export function mesAntes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'YYYY-MM' → 'novembro/2026'. */
export function nomeDoMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
}

// ── Meta salva ──────────────────────────────────────────────

export interface MetaMensal {
  /** Sempre o dia 1: 'YYYY-MM-01'. */
  mes: string;
  premissas: Premissas;
  faixas: Faixas;
  /** Snapshot das saídas no momento em que foi salva. */
  resultado: Resultado;
  atualizado_em?: string;
}
