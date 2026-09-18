// ─────────────────────────────────────────────────────────────
// Agregação dos pedidos do BlueSales para o lado da RECEITA do P&L.
// Mapeamento de status → bucket. Guardamos o status cru; aqui só
// classificamos. Ajustável conforme os status reais do BlueSales.
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { isDentro } from '@/lib/dates';
import { perdaRealDePedido } from '@/lib/custosConfig';

/** Normaliza status: minúsculo, sem acento, sem espaços nas bordas. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Status que contam como APROVADO (dinheiro confirmado) — aba "Pagos".
// O singular entra por segurança: o backfill veio "Pagos" e o webhook manda
// "pagos", mas não custa aceitar as duas formas.
const APROVADO = new Set(['pagos', 'pago']);
// Status que contam como FRUSTRADO (perda) — aba "Frustrados".
// (Devolvido, Cobrados, Negociação, Enviados etc. ficam como pipeline.)
const FRUSTRADO = new Set(['frustrados', 'frustrado']);

export function statusBucket(status: string | null | undefined): 'aprovado' | 'frustrado' | 'pipeline' {
  const s = norm(status);
  if (APROVADO.has(s)) return 'aprovado';
  if (FRUSTRADO.has(s)) return 'frustrado';
  return 'pipeline';
}

/**
 * Tira as vendas removidas à mão (canceladas e excluídas no BlueSales).
 * TODO cálculo passa por aqui — se ficasse só na tela, o Faturamento
 * Agendado continuaria contando uma venda que não existe mais.
 */
export function pedidosAtivos(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter((p) => !p.removido_em);
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
  /** Dinheiro que de fato saiu do caixa nos frustrados (produto + frete). */
  perda_real_frustrados: number;
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
export function agregarPedidos(todos: Pedido[], periodo: Periodo): RevenuePedidos {
  const pedidos = pedidosAtivos(todos);
  const criacaoNoPeriodo = (p: Pedido) => isDentro(p.data, periodo.inicio, periodo.fim);
  const pagamentoNoPeriodo = (p: Pedido) => isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim);

  let receita_aprovada = 0, qtd_pagamentos = 0;
  let valor_agendado = 0, qtd_agendados = 0;
  let valor_frustrado = 0, qtd_frustrados = 0, perda_real_frustrados = 0;
  let total = 0;

  const atendentes = new Map<string, AtendenteAgg>();
  const metodos = new Map<string, number>();
  const atendente = (nome: string) =>
    atendentes.get(nome) ?? { nome, valor_agendado: 0, pedidos: 0, receita: 0, aprovados: 0 };

  for (const p of pedidos) {
    const bucket = statusBucket(p.status);
    // Receita: o que o pedido cobra hoje (payment.amount).
    const valor = Number(p.valor) || 0;
    // Agendado: o valor de quando foi agendado. O BlueSales congela esse
    // número — desconto negociado depois muda a receita, não o agendado.
    const agendado = Number(p.valor_agendado ?? p.valor) || 0;
    const nome = p.vendedor?.trim() || 'Sem atendente';

    // Lado do AGENDADO / funil — por data de criação.
    if (criacaoNoPeriodo(p)) {
      valor_agendado += agendado;
      qtd_agendados += 1;
      total += 1;

      const a = atendente(nome);
      a.valor_agendado += agendado;
      a.pedidos += 1;
      atendentes.set(nome, a);

      const met = p.metodo_pagamento?.trim() || 'Outro';
      metodos.set(met, (metodos.get(met) ?? 0) + 1);

      if (bucket === 'frustrado') {
        valor_frustrado += valor;
        qtd_frustrados += 1;
        perda_real_frustrados += perdaRealDePedido(p);
      }
    }

    // Lado da RECEITA APROVADA — por data de pagamento.
    if (bucket === 'aprovado' && pagamentoNoPeriodo(p)) {
      receita_aprovada += valor;
      qtd_pagamentos += 1;

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
    perda_real_frustrados,
    porAtendente: [...atendentes.values()].sort((a, b) => b.valor_agendado - a.valor_agendado),
    porMetodo: [...metodos.entries()].map(([nome, pedidos]) => ({ nome, pedidos })).sort((a, b) => b.pedidos - a.pedidos),
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// Conferência com o BlueSales. Quando uma venda é excluída lá, nenhum
// evento chega — ela fica presa aqui e infla o Faturamento Agendado.
// Procurar à mão entre centenas de pedidos não dá; estas duas funções
// apontam onde olhar.
// ─────────────────────────────────────────────────────────────

/** Nome do cliente comparável: sem acento, minúsculo, espaços únicos. */
function nomeComparavel(nome: string | null | undefined): string {
  return norm(nome).replace(/\s+/g, ' ');
}

/**
 * Clientes com mais de um pedido ativo, sendo pelo menos um criado no
 * período. É o caso típico de venda refeita: o vendedor cria de novo
 * (outro plano, outro valor) e exclui a antiga no BlueSales — que
 * continua aqui. Os pedidos de fora do período entram no grupo para
 * mostrar o par completo.
 */
export function possiveisDuplicados(todos: Pedido[], periodo: Periodo): Pedido[][] {
  const grupos = new Map<string, Pedido[]>();
  for (const p of pedidosAtivos(todos)) {
    const chave = nomeComparavel(p.cliente);
    if (chave.length < 4) continue; // sem nome não dá para casar
    const g = grupos.get(chave);
    if (g) g.push(p);
    else grupos.set(chave, [p]);
  }
  return [...grupos.values()]
    .filter((g) => g.length > 1 && g.some((p) => isDentro(p.data, periodo.inicio, periodo.fim)))
    .map((g) => g.sort((a, b) => a.data.localeCompare(b.data) || (a.internal_id ?? 0) - (b.internal_id ?? 0)))
    .sort((a, b) => b[b.length - 1].data.localeCompare(a[a.length - 1].data));
}

export interface AgendadoDoDia {
  data: string;
  qtd: number;
  valor: number;
}

/**
 * Agendado de cada dia do período (mesma regra do Faturamento Agendado:
 * data de criação, valor do agendamento). Comparando com o gráfico do
 * BlueSales, o dia que não bate diz onde está a venda a mais.
 */
export function agendadoPorDia(todos: Pedido[], periodo: Periodo): AgendadoDoDia[] {
  const dias = new Map<string, AgendadoDoDia>();
  for (const p of pedidosAtivos(todos)) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim)) continue;
    const d = dias.get(p.data) ?? { data: p.data, qtd: 0, valor: 0 };
    d.qtd += 1;
    d.valor += Number(p.valor_agendado ?? p.valor) || 0;
    dias.set(p.data, d);
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}
