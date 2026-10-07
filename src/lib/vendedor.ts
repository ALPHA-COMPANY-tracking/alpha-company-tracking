// ─────────────────────────────────────────────────────────────
// Painel do Vendedor: os números de UM vendedor, com as mesmas regras do
// P&L e da Visualização.
//
//   · Agendado: pedidos criados no período (data do pedido).
//   · Pagos: pagamentos no período (data do pagamento) — igual ao
//     "Faturamento Aprovado" do BlueSales.
//   · Comissão: % do vendedor × o valor pago cheio. É o que ele recebe
//     (a parte da taxa de plataforma só sai da linha do P&L).
//   · Em rota: só o que está na rua, igual à Visualização.
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { dataAprovacaoPedido, ehCancelado, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { comissaoDoVendedor } from '@/lib/custosConfig';
import { chaveVendedor } from '@/lib/pnl';
import { type Fatia, type Situacao, situacaoDosAgendados } from '@/lib/indicadores';

export interface ResumoVendedor {
  /** % de comissão do vendedor (0,05 = 5%). */
  pct: number;
  agendado: Fatia;
  pagos: Fatia;
  /** Comissão sobre os pagamentos do período. */
  comissao: Cents;
  /** Pagamentos ÷ agendamentos do período. */
  conversao: number;
  situacao: Record<Situacao, Fatia>;
  /** Comissão possível se todos os pedidos em rota forem pagos. */
  comissao_em_rota: Cents;
  /** Agendado HOJE (para a meta do dia). */
  agendado_hoje: Fatia;
  /** Pedidos do vendedor criados no período, mais novos primeiro. */
  pedidos: Pedido[];
}

/** Só os pedidos deste vendedor (sem os excluídos da plataforma). */
export function pedidosDoVendedor(pedidos: Pedido[], vendedor: string): Pedido[] {
  const chave = chaveVendedor(vendedor);
  return pedidosAtivos(pedidos).filter((p) => chaveVendedor(p.vendedor ?? '') === chave);
}

export function resumoDoVendedor(todos: Pedido[], vendedor: string, periodo: Periodo, hoje: string): ResumoVendedor {
  const meus = pedidosDoVendedor(todos, vendedor);
  const pct = comissaoDoVendedor(vendedor);

  const agendado: Fatia = { qtd: 0, valor: 0 };
  const pagos: Fatia = { qtd: 0, valor: 0 };
  const agendado_hoje: Fatia = { qtd: 0, valor: 0 };
  const doPeriodo: Pedido[] = [];
  for (const p of meus) {
    const valorAgendado = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    if (isDentro(p.data, periodo.inicio, periodo.fim)) {
      // Cancelado aparece na lista, mas não soma no agendado.
      if (!ehCancelado(p)) {
        agendado.qtd += 1;
        agendado.valor += valorAgendado;
      }
      doPeriodo.push(p);
    }
    if (p.data === hoje && !ehCancelado(p)) {
      agendado_hoje.qtd += 1;
      agendado_hoje.valor += valorAgendado;
    }
    if (statusBucket(p.status) === 'aprovado' && isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim)) {
      pagos.qtd += 1;
      pagos.valor += reaisToCents(Number(p.valor) || 0);
    }
  }

  const situacao = situacaoDosAgendados(meus, periodo);
  return {
    pct,
    agendado,
    pagos,
    comissao: Math.round(pagos.valor * pct),
    conversao: safeDiv(pagos.qtd, agendado.qtd),
    situacao,
    comissao_em_rota: Math.round(situacao.rota.valor * pct),
    agendado_hoje,
    pedidos: doPeriodo.sort((a, b) => b.data.localeCompare(a.data) || Number(b.internal_id ?? 0) - Number(a.internal_id ?? 0)),
  };
}
