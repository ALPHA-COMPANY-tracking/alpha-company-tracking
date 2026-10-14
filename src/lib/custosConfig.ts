// ─────────────────────────────────────────────────────────────
// Configuração de custos que o BlueSales NÃO manda.
// Calculados sobre os pedidos APROVADOS (a receita realizada).
// (Editável aqui por enquanto; depois pode virar uma tela de ajustes.)
// ─────────────────────────────────────────────────────────────

import type { IsoDate, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents } from '@/lib/money';
import { diaSP, isDentro } from '@/lib/dates';
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

/**
 * Frete por pacote, com a data em que passou a valer (mais recente
 * primeiro). Vale o dia em que o pacote SAIU (enviado_em); sem ele, o do
 * agendamento. R$ 31,00 desde 14/10/2026 (antes R$ 33,00 — setembro e
 * outubro até o dia 13 fecharam com o BlueSales assim).
 * Frete novo = linha nova AQUI e em api/lib-custos.ts (há teste comparando).
 */
export const FRETES: { desde: IsoDate; valor: number }[] = [
  { desde: '2026-10-14', valor: 31.0 },
  { desde: '0000-01-01', valor: 33.0 },
];

/** Frete de agora: vendas que ainda vão acontecer (meta, projeções). */
export const FRETE_ATUAL = FRETES[0].valor;

/** Frete de um pedido, pela data em que saiu (ou foi agendado). */
export function freteDoPedido(p: Pick<Pedido, 'data' | 'enviado_em'>): number {
  const dia = p.enviado_em ? diaSP(p.enviado_em) : (p.data ?? '');
  return (FRETES.find((f) => dia >= f.desde) ?? FRETES[FRETES.length - 1]).valor;
}

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

/** O pacote chegou a sair para entrega (o frete foi gasto)? O código de
 *  rastreio NÃO prova isso: o BlueSales gera a etiqueta ainda em "Aguard.
 *  Coleta" (12/10/2026: #2801 e #2802 cancelados com etiqueta, sem sair). */
export function saiuParaEntrega(p: Pick<Pedido, 'enviado_em' | 'entregue_em' | 'passou_correios'>): boolean {
  return Boolean(p.enviado_em || p.entregue_em || p.passou_correios);
}

/**
 * Pedido perdido que NÃO entra no P&L (não gerou custo): recusado,
 * cancelado sem custo ou que não chegou a sair para entrega.
 */
export function perdaSemCusto(
  p: Pick<Pedido, 'status' | 'perda_real' | 'enviado_em' | 'entregue_em' | 'passou_correios'>,
): boolean {
  // O que foi marcado à mão na tela Frustrados vale: "s/ custo" (0) fica
  // fora, "c/ custo" (o frete) entra.
  if (p.perda_real != null) return Number(p.perda_real) === 0;
  const s = normStatus(p.status);
  if (/recus/.test(s)) return true;
  // Cancelado só tem custo se o pacote saiu. (O frustrado antigo conta
  // sempre com o frete: pedido velho pode não ter o histórico aqui.)
  if (/cancel/.test(s)) return !saiuParaEntrega(p);
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
  if (FRETE_DOBRADO.test(status)) return 2 * freteDoPedido(p);
  if (SO_FRETE.test(status)) return freteDoPedido(p);
  return custoProdutoDoPlano(p.produto_plano) + freteDoPedido(p);
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
  let frete = 0;
  for (const p of agendados) {
    custo_produtos += reaisToCents(custoProdutoDoPlano(p.produto_plano));
    frete += reaisToCents(freteDoPedido(p));
    // A comissão sai do mesmo laço, sobre os mesmos pedidos: separar em
    // duas fontes é como se entra numa safra e sai noutra.
    const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    comissao_vendedor += Math.round(valor * comissaoDoVendedor(p.vendedor));
  }
  return {
    custo_produtos,
    frete,
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
  let frete = 0;
  for (const p of aprovados) {
    custo_produtos += reaisToCents(custoProdutoDoPlano(p.produto_plano));
    frete += reaisToCents(freteDoPedido(p));
  }
  return { custo_produtos, frete };
}
