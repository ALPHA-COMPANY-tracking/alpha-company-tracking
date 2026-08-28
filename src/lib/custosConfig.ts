// ─────────────────────────────────────────────────────────────
// Configuração de custos que o BlueSales NÃO manda.
// Calculados sobre os pedidos APROVADOS (a receita realizada).
// (Editável aqui por enquanto; depois pode virar uma tela de ajustes.)
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { dataAprovacaoPedido, statusBucket } from '@/lib/pedidos';

/** Custo do produto (COGS) por plano — detectado pelo texto do plano.
 *  Valores conferidos contra o P&L real do BlueSales. */
export const CUSTO_PRODUTO: { match: RegExp; custo: number }[] = [
  { match: /6\s*pote/i, custo: 83.0 },
  { match: /3\s*pote/i, custo: 32.5 },
];

/** Frete fixo por pedido aprovado. */
export const FRETE_POR_PEDIDO = 33.0;

/** Taxa de plataforma (fixa por período com vendas). */
export const TAXA_PLATAFORMA = 22.5;

/** Comissões: vendedor 5% da (receita − taxas); cobrança 1% da receita. */
export const COMISSAO_VENDEDOR = 0.05;
export const COMISSAO_COBRANCA = 0.01;

/** Retorna o custo do produto (reais) a partir do texto do plano. */
export function custoProdutoDoPlano(plano?: string | null): number {
  const p = plano ?? '';
  for (const regra of CUSTO_PRODUTO) if (regra.match.test(p)) return regra.custo;
  return 0;
}

/** Custo de produto + frete dos pedidos APROVADOS do período (em centavos). */
export function custosDePedidos(
  pedidos: Pedido[],
  periodo: Periodo,
): { custo_produtos: Cents; frete: Cents } {
  // Custos dos aprovados acompanham a receita: contam pela data de pagamento.
  const aprovados = pedidos.filter(
    (p) => statusBucket(p.status) === 'aprovado' && isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim),
  );
  let custo_produtos = 0;
  for (const p of aprovados) custo_produtos += reaisToCents(custoProdutoDoPlano(p.produto_plano));
  const frete = reaisToCents(FRETE_POR_PEDIDO) * aprovados.length;
  return { custo_produtos, frete };
}
