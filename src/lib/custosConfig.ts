// ─────────────────────────────────────────────────────────────
// Configuração de custos que o BlueSales NÃO manda.
// Calculados sobre os pedidos APROVADOS (a receita realizada).
// (Editável aqui por enquanto; depois pode virar uma tela de ajustes.)
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { dataAprovacaoPedido, pedidosAtivos, statusBucket } from '@/lib/pedidos';

/** Custo do produto (COGS) por plano — detectado pelo texto do plano.
 *  Valores conferidos contra o P&L real do BlueSales.
 *
 *  Plano que não casar com nenhuma regra entra com custo ZERO e infla o
 *  lucro em silêncio. Por isso `planosSemCusto` existe: a tela avisa em
 *  vez de deixar passar. Ao cadastrar plano novo no BlueSales, some a
 *  linha aqui e em api/lib-custos.ts. */
export const CUSTO_PRODUTO: { match: RegExp; custo: number }[] = [
  { match: /6\s*pote/i, custo: 83.0 },
  { match: /4\s*pote/i, custo: 41.0 }, // tratamento de 4 meses, a partir de 04/09/2026
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

/** O plano tem custo configurado? */
export function planoTemCusto(plano?: string | null): boolean {
  const p = plano ?? '';
  return CUSTO_PRODUTO.some((regra) => regra.match.test(p));
}

/**
 * Planos vendidos no período que não têm custo configurado.
 *
 * Existe porque o custo desconhecido vale ZERO na conta — o lucro sobe e
 * nada na tela denuncia. Quando o BlueSales ganha um plano novo (como o
 * de 4 potes em 04/09/2026), é isto que faz o aviso aparecer em vez de o
 * número sair errado calado.
 */
export function planosSemCusto(pedidos: Pedido[], periodo: Periodo): string[] {
  const achados = new Set<string>();
  for (const p of pedidosAtivos(pedidos)) {
    if (statusBucket(p.status) === 'frustrado') continue;
    const noPeriodo =
      isDentro(p.data, periodo.inicio, periodo.fim) ||
      isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim);
    if (!noPeriodo) continue;
    const plano = (p.produto_plano ?? '').trim();
    if (plano && !planoTemCusto(plano)) achados.add(plano);
  }
  return [...achados].sort();
}

/** O pacote volta para a empresa: devolvido, voltando, aguardando devolução. */
const PRODUTO_VOLTA = /devol|voltand|retorn/;

/**
 * Perda REAL de um pedido frustrado, em reais.
 *
 * O valor do pedido é a receita que não entrou — não o dinheiro que saiu.
 * O que se perde de fato:
 *   · o produto VOLTOU (devolvido, voltando, aguardando devolução) → só o
 *     frete, que foi gasto e não volta (regra do Jonas, 21/09/2026);
 *   · o produto NÃO volta (roubo, frustrado, cancelado…) → produto + frete.
 * Um ajuste manual (`perda_real`) tem prioridade sobre os dois.
 */
export function perdaRealDePedido(p: Pedido): number {
  if (p.perda_real != null) return Number(p.perda_real) || 0;
  const status = (p.status ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (PRODUTO_VOLTA.test(status)) return FRETE_POR_PEDIDO;
  return custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO;
}

/**
 * Custo de produto + frete do que foi AGENDADO no período (em centavos).
 *
 * Conta pela data de criação e ignora os frustrados — eles têm perda
 * própria, com regra separada. Serve para projetar o resultado do que o
 * vendedor fechou no dia, antes de o cliente pagar.
 */
export function custosDeAgendados(
  pedidos: Pedido[],
  periodo: Periodo,
): { custo_produtos: Cents; frete: Cents; qtd: number; comissao_vendedor: Cents } {
  const agendados = pedidosAtivos(pedidos).filter(
    (p) => statusBucket(p.status) !== 'frustrado' && isDentro(p.data, periodo.inicio, periodo.fim),
  );
  let custo_produtos = 0;
  let comissao_vendedor = 0;
  for (const p of agendados) {
    custo_produtos += reaisToCents(custoProdutoDoPlano(p.produto_plano));
    // A comissão sai do mesmo laço, sobre os mesmos pedidos: separar em
    // duas fontes é como se entra numa safra e sai noutra.
    const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    comissao_vendedor += Math.round(valor * comissaoDoVendedor(p.vendedor));
  }
  return {
    custo_produtos,
    frete: reaisToCents(FRETE_POR_PEDIDO) * agendados.length,
    qtd: agendados.length,
    comissao_vendedor,
  };
}

/** Custo de produto + frete dos pedidos APROVADOS do período (em centavos). */
export function custosDePedidos(
  pedidos: Pedido[],
  periodo: Periodo,
): { custo_produtos: Cents; frete: Cents } {
  // Custos dos aprovados acompanham a receita: contam pela data de pagamento.
  const aprovados = pedidosAtivos(pedidos).filter(
    (p) => statusBucket(p.status) === 'aprovado' && isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim),
  );
  let custo_produtos = 0;
  for (const p of aprovados) custo_produtos += reaisToCents(custoProdutoDoPlano(p.produto_plano));
  const frete = reaisToCents(FRETE_POR_PEDIDO) * aprovados.length;
  return { custo_produtos, frete };
}
