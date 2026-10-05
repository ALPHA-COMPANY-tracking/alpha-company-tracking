// ─────────────────────────────────────────────────────────────
// Fila de Cobrança: pedidos ENTREGUES que ainda não pagaram, do mais
// antigo para o mais novo — cada dia sem cobrar aumenta a chance de virar
// perda (produto + frete). Negociação/jurídico vem em separado.
//
// Os dias contam da ENTREGA (entregue_em, anotado pelo banco — migração
// 0027). Pedido sem esse dia (entregue antes do registro e sem aviso no
// histórico) conta do agendamento, e a tela avisa.
// ─────────────────────────────────────────────────────────────

import type { IsoDate, Pedido } from '@/types';
import { diasInclusivos } from '@/lib/dates';
import { pedidosAtivos } from '@/lib/pedidos';
import { situacaoDoPedido } from '@/lib/indicadores';

export type Faixa = '0-3' | '4-7' | '8-15' | '16+';

export const FAIXAS: { id: Faixa; rotulo: string; ate: number }[] = [
  { id: '0-3', rotulo: 'Até 3 dias', ate: 3 },
  { id: '4-7', rotulo: '4 a 7 dias', ate: 7 },
  { id: '8-15', rotulo: '8 a 15 dias', ate: 15 },
  { id: '16+', rotulo: 'Mais de 15 dias', ate: Infinity },
];

export interface ItemCobranca {
  pedido: Pedido;
  /** Dias desde a entrega (ou desde o agendamento, sem o dia da entrega). */
  dias: number;
  desde: 'entrega' | 'agendamento';
  faixa: Faixa;
  /** O que a cliente deve hoje (valor do pagamento, já com desconto negociado). */
  valor: number;
}

export interface Fatia {
  qtd: number;
  valor: number;
}

export interface FilaCobranca {
  /** Entregues sem pagar, mais antigos primeiro. */
  itens: ItemCobranca[];
  total: Fatia;
  porFaixa: Record<Faixa, Fatia>;
  /** Negociação / atenção / jurídico: cobrança travada. */
  negociacao: ItemCobranca[];
  totalNegociacao: Fatia;
  /** Quantos contam do agendamento por não ter o dia da entrega. */
  semDiaDaEntrega: number;
}

/** Data (São Paulo) de um instante do banco; 'YYYY-MM-DD' passa direto. */
export function dataSP(iso: string): IsoDate {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

export function faixaDe(dias: number): Faixa {
  return FAIXAS.find((f) => dias <= f.ate)!.id;
}

function item(p: Pedido, hoje: IsoDate): ItemCobranca {
  const desde = p.entregue_em ? 'entrega' : 'agendamento';
  const inicio = p.entregue_em ? dataSP(p.entregue_em) : p.data;
  const dias = Math.max(0, diasInclusivos(inicio, hoje) - 1);
  return { pedido: p, dias, desde, faixa: faixaDe(dias), valor: Number(p.valor) || Number(p.valor_agendado) || 0 };
}

const maisAntigoPrimeiro = (a: ItemCobranca, b: ItemCobranca) =>
  b.dias - a.dias || b.valor - a.valor || (a.pedido.internal_id ?? 0) - (b.pedido.internal_id ?? 0);

const somar = (xs: ItemCobranca[]): Fatia => ({ qtd: xs.length, valor: xs.reduce((s, i) => s + i.valor, 0) });

export function filaDeCobranca(pedidos: Pedido[], hoje: IsoDate): FilaCobranca {
  const ativos = pedidosAtivos(pedidos);
  const itens = ativos.filter((p) => situacaoDoPedido(p.status) === 'aguardando').map((p) => item(p, hoje)).sort(maisAntigoPrimeiro);
  const negociacao = ativos.filter((p) => situacaoDoPedido(p.status) === 'negociacao').map((p) => item(p, hoje)).sort(maisAntigoPrimeiro);
  const porFaixa = Object.fromEntries(FAIXAS.map((f) => [f.id, somar(itens.filter((i) => i.faixa === f.id))])) as Record<Faixa, Fatia>;
  return {
    itens,
    total: somar(itens),
    porFaixa,
    negociacao,
    totalNegociacao: somar(negociacao),
    semDiaDaEntrega: itens.filter((i) => i.desde === 'agendamento').length,
  };
}
