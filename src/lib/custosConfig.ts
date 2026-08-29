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

/**
 * A taxa de plataforma NÃO é calculável a partir dos pedidos: no P&L do
 * BlueSales, dias com pagamentos idênticos aparecem com taxas diferentes
 * (14/08 e 15/08 tiveram 2× R$ 735 e cobraram R$ 5,00 e R$ 0,00).
 * Por isso ela é lançada por dia em `afterpay_daily.taxas_plataforma`,
 * com o valor real do BlueSales.
 */

/** Comissões: vendedor % da (receita − taxas); cobrança 1% da receita. */
export const COMISSAO_VENDEDOR = 0.05; // padrão de quem não está na lista
export const COMISSAO_COBRANCA = 0.01;

/** Quem recebe a comissão de cobrança. */
export const RESPONSAVEL_COBRANCA = 'WESLAINE';

/**
 * Percentual por vendedor, quando difere do padrão. A chave é o nome como
 * o BlueSales manda, normalizado (maiúsculas, sem acento).
 */
export const COMISSAO_POR_VENDEDOR: Record<string, number> = {
  MATHEUS: 0.06, // entrou em 31/08/2026 com 1 ponto a mais
};

/** Percentual de comissão do vendedor (cai no padrão se não estiver na lista). */
export function comissaoDoVendedor(nome?: string | null): number {
  const chave = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  return COMISSAO_POR_VENDEDOR[chave] ?? COMISSAO_VENDEDOR;
}

/** Retorna o custo do produto (reais) a partir do texto do plano. */
export function custoProdutoDoPlano(plano?: string | null): number {
  const p = plano ?? '';
  for (const regra of CUSTO_PRODUTO) if (regra.match.test(p)) return regra.custo;
  return 0;
}

/**
 * Perda REAL de um pedido frustrado, em reais.
 *
 * O valor do pedido é a receita que não entrou — não o dinheiro que saiu.
 * O que se perde de fato é o produto enviado + o frete de ida. Um ajuste
 * manual (`perda_real`) tem prioridade: cobre casos como o produto ter
 * voltado, onde só o frete foi perdido.
 */
export function perdaRealDePedido(p: Pedido): number {
  if (p.perda_real != null) return Number(p.perda_real) || 0;
  return custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO;
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
