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
  porAtendente: AtendenteAgg[];
  porMetodo: { nome: string; pedidos: number }[];
  total: number; // quantos pedidos no período (fonte real disponível?)
}

/** Agrega os pedidos de um período (lado da receita). */
export function agregarPedidos(pedidos: Pedido[], periodo: Periodo): RevenuePedidos {
  const noPeriodo = pedidos.filter((p) => isDentro(p.data, periodo.inicio, periodo.fim));

  let receita_aprovada = 0, qtd_pagamentos = 0;
  let valor_agendado = 0, qtd_agendados = 0;
  let valor_frustrado = 0, qtd_frustrados = 0;

  const atendentes = new Map<string, AtendenteAgg>();
  const metodos = new Map<string, number>();

  for (const p of noPeriodo) {
    const bucket = statusBucket(p.status);
    const valor = Number(p.valor) || 0; // líquido → receita
    const bruto = Number(p.valor_bruto ?? p.valor) || 0; // cheio → agendado

    // Todos os pedidos entram no "agendado" (faturamento total, valor cheio).
    valor_agendado += bruto;
    qtd_agendados += 1;

    if (bucket === 'aprovado') {
      receita_aprovada += valor;
      qtd_pagamentos += 1;
    } else if (bucket === 'frustrado') {
      valor_frustrado += valor;
      qtd_frustrados += 1;
    }

    const nome = p.vendedor?.trim() || 'Sem atendente';
    const a = atendentes.get(nome) ?? { nome, valor_agendado: 0, pedidos: 0, receita: 0, aprovados: 0 };
    a.valor_agendado += bruto;
    a.pedidos += 1;
    if (bucket === 'aprovado') {
      a.receita += valor;
      a.aprovados += 1;
    }
    atendentes.set(nome, a);

    const met = p.metodo_pagamento?.trim() || 'Outro';
    metodos.set(met, (metodos.get(met) ?? 0) + 1);
  }

  return {
    receita_aprovada,
    qtd_pagamentos,
    valor_agendado,
    qtd_agendados,
    valor_frustrado,
    qtd_frustrados,
    porAtendente: [...atendentes.values()].sort((a, b) => b.valor_agendado - a.valor_agendado),
    porMetodo: [...metodos.entries()].map(([nome, pedidos]) => ({ nome, pedidos })).sort((a, b) => b.pedidos - a.pedidos),
    total: noPeriodo.length,
  };
}
