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
 * Taxa de plataforma do BlueSales: R$ 2,50 por pagamento em BOLETO.
 * Pix e cartão não pagam. Descoberto em 22/09/2026 conferindo setembro
 * dia a dia — bate em todos: 01–08/09 = 12 boletos = R$ 30,00; 11/09 =
 * 4 boletos = R$ 10,00; 14/09 = nenhum = R$ 0,00; 01–16/09 = 21 boletos =
 * R$ 52,50. Explica também 14/08 (R$ 5,00) × 15/08 (R$ 0,00) com os mesmos
 * 2× R$ 735: um dia foi boleto, o outro não.
 * O BlueSales não manda a taxa no webhook; a dashboard calcula por aqui e o
 * valor lançado à mão na tela Taxas continua tendo prioridade.
 */
export const TAXA_BOLETO = 2.5;

/** O pagamento é boleto? (o BlueSales manda "boleto" em payment.method) */
export function ehBoleto(p: Pick<Pedido, 'metodo_pagamento'>): boolean {
  return /boleto/i.test(p.metodo_pagamento ?? '');
}

/** Comissões: vendedor % da receita (no P&L, menos a taxa); cobrança 1% da receita. */
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

// ── Regras de custo da frustração — as do BlueSales (tela nova, 30/09/2026) ──
//   Perdido / Roubo / Apreendido ........ frete + produto (a mercadoria não volta)
//   Perda de cobrança ................... frete + produto (entregue e não pago)
//   Devolvido automático / cliente ...... frete de ida (a volta não gera custo)
//   Devolvido reverso ................... frete de ida + de volta
//   Voltando / Aguardando devolução ..... frete
//   Cancelado com custo (já postado) .... frete
//   Frustrados (legado, já postado) ..... frete
//   NÃO entram: cancelado sem custo ou não postado, recusado, frustrado
//   legado não postado — não geraram custo.

const normStatus = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Só o frete: o produto volta, ou é frustrado antigo (legado). */
const SO_FRETE = /devol|voltand|retorn|cancel|frustr/;
/** Devolvido reverso: a empresa paga a ida e a volta. */
const FRETE_DOBRADO = /revers/;

/**
 * Pedido perdido que NÃO entra no P&L (não gerou custo): recusado,
 * cancelado sem custo ou não postado. "Postado" = tem código de rastreio
 * ou passou pela retirada nos Correios.
 */
export function perdaSemCusto(p: Pick<Pedido, 'status' | 'rastreamento' | 'passou_correios' | 'perda_real'>): boolean {
  // O que foi marcado à mão na tela Frustrados vale: "s/ custo" (0) fica
  // fora, "c/ custo" (o frete) entra.
  if (p.perda_real != null) return Number(p.perda_real) === 0;
  const s = normStatus(p.status);
  if (/recus/.test(s)) return true;
  // Cancelado só tem custo se já foi postado. (O frustrado antigo conta
  // sempre com o frete: pedido velho pode não ter o rastreio gravado aqui.)
  if (/cancel/.test(s)) return !(p.rastreamento || p.passou_correios);
  return false;
}

/**
 * Perda REAL de um pedido frustrado, em reais — o "Custo real de
 * frustração" do BlueSales. O valor do pedido é a receita que não entrou;
 * isto é o dinheiro que saiu (regras acima). Um ajuste manual
 * (`perda_real`) tem prioridade sobre tudo.
 */
export function perdaRealDePedido(p: Pedido): number {
  if (p.perda_real != null) return Number(p.perda_real) || 0;
  if (perdaSemCusto(p)) return 0;
  const status = normStatus(p.status);
  if (FRETE_DOBRADO.test(status)) return 2 * FRETE_POR_PEDIDO;
  if (SO_FRETE.test(status)) return FRETE_POR_PEDIDO;
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
