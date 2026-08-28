// ─────────────────────────────────────────────────────────────
// Agregação dos pedidos do BlueSales para o lado da RECEITA do P&L.
// Mapeamento de status → bucket. Guardamos o status cru; aqui só
// classificamos. Ajustável conforme os status reais do BlueSales.
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { isDentro } from '@/lib/dates';

/** Normaliza status: minúsculo, sem acento, sem espaços nas bordas. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Status que contam como APROVADO (dinheiro confirmado) — aba "Pagos".
const APROVADO = new Set(['pagos']);
// Status que contam como FRUSTRADO (perda) — aba "Frustrados".
// (Devolvido, Cobrados, Negociação, Enviados etc. ficam como pipeline.)
const FRUSTRADO = new Set(['frustrados']);

export function statusBucket(status: string | null | undefined): 'aprovado' | 'frustrado' | 'pipeline' {
  const s = norm(status);
  if (APROVADO.has(s)) return 'aprovado';
  if (FRUSTRADO.has(s)) return 'frustrado';
  return 'pipeline';
}

export interface AtendenteAgg {
  nome: string;
  valor_agendado: number; // total de pedidos (pipeline inteiro)
  pedidos: number;
  receita: number; // só aprovados
  aprovados: number;
}

export interface RevenuePedidos {
  receita_aprovada: number;
  qtd_pagamentos: number;
  valor_agendado: number;
  qtd_agendados: number;
  valor_frustrado: number;
  qtd_frustrados: number;
  /** Dias distintos com pelo menos um pagamento — base da taxa de repasse. */
  dias_com_pagamento: number;
  porAtendente: AtendenteAgg[];
  porMetodo: { nome: string; pedidos: number }[];
  total: number; // quantos pedidos no período (fonte real disponível?)
}

/** Data de pagamento do pedido (o BlueSales conta o "aprovado" por aqui).
 *  Se ainda não foi carimbada (histórico), cai na data de criação. */
export function dataAprovacaoPedido(p: Pedido): string {
  return p.data_aprovacao || p.data;
}

/** Agrega os pedidos de um período (lado da receita).
 *  - Agendado e frustrado contam pela data de CRIAÇÃO (p.data).
 *  - Aprovado/receita conta pela data de PAGAMENTO (p.data_aprovacao ?? p.data),
 *    para bater com o "Faturamento Aprovado" do BlueSales. */
export function agregarPedidos(pedidos: Pedido[], periodo: Periodo): RevenuePedidos {
  const criacaoNoPeriodo = (p: Pedido) => isDentro(p.data, periodo.inicio, periodo.fim);
  const pagamentoNoPeriodo = (p: Pedido) => isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim);

  let receita_aprovada = 0, qtd_pagamentos = 0;
  let valor_agendado = 0, qtd_agendados = 0;
  let valor_frustrado = 0, qtd_frustrados = 0;
  let total = 0;

  const atendentes = new Map<string, AtendenteAgg>();
  const metodos = new Map<string, number>();
  const diasPagos = new Set<string>();
  const atendente = (nome: string) =>
    atendentes.get(nome) ?? { nome, valor_agendado: 0, pedidos: 0, receita: 0, aprovados: 0 };

  for (const p of pedidos) {
    const bucket = statusBucket(p.status);
    const valor = Number(p.valor) || 0; // líquido → receita
    const bruto = Number(p.valor_bruto ?? p.valor) || 0; // cheio → agendado
    const nome = p.vendedor?.trim() || 'Sem atendente';

    // Lado do AGENDADO / funil — por data de criação.
    if (criacaoNoPeriodo(p)) {
      valor_agendado += bruto;
      qtd_agendados += 1;
      total += 1;

      const a = atendente(nome);
      a.valor_agendado += bruto;
      a.pedidos += 1;
      atendentes.set(nome, a);

      const met = p.metodo_pagamento?.trim() || 'Outro';
      metodos.set(met, (metodos.get(met) ?? 0) + 1);

      if (bucket === 'frustrado') {
        valor_frustrado += valor;
        qtd_frustrados += 1;
      }
    }

    // Lado da RECEITA APROVADA — por data de pagamento.
    if (bucket === 'aprovado' && pagamentoNoPeriodo(p)) {
      receita_aprovada += valor;
      qtd_pagamentos += 1;
      diasPagos.add(dataAprovacaoPedido(p));

      const a = atendente(nome);
      a.receita += valor;
      a.aprovados += 1;
      atendentes.set(nome, a);
    }
  }

  return {
    receita_aprovada,
    qtd_pagamentos,
    valor_agendado,
    qtd_agendados,
    valor_frustrado,
    qtd_frustrados,
    dias_com_pagamento: diasPagos.size,
    porAtendente: [...atendentes.values()].sort((a, b) => b.valor_agendado - a.valor_agendado),
    porMetodo: [...metodos.entries()].map(([nome, pedidos]) => ({ nome, pedidos })).sort((a, b) => b.pedidos - a.pedidos),
    total,
  };
}
