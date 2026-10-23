// ─────────────────────────────────────────────────────────────
// Regras de custo usadas pelo resumo do dia (lado servidor).
//
// Precisam ser IGUAIS às de src/lib/custosConfig.ts — o teste
// src/lib/resumoServidor.test.ts falha se alguém mudar só um lado.
// Duplicado porque o arquivo do app usa aliases do Vite (@/…), que
// não resolvem no runtime das funções.
// ─────────────────────────────────────────────────────────────

/** Custo do produto por plano, detectado pelo texto.
 *  Precisa ser IGUAL a src/lib/custosConfig.ts — há teste comparando os
 *  dois, senão a notificação da noite conta diferente da tela. */
export const CUSTO_PRODUTO: { match: RegExp; custo: number }[] = [
  { match: /6\s*pote/i, custo: 83.0 },
  { match: /4\s*pote/i, custo: 41.0 }, // tratamento de 4 meses, a partir de 04/09/2026
  { match: /3\s*pote/i, custo: 32.5 },
  // "(PROMO) - 3 MESES", desde 16/10/2026: o mesmo custo do 3 potes.
  { match: /(^|\D)3\s*mes/i, custo: 32.5 },
  // "(PROMO) - 4 MESES", desde 17/10/2026: o mesmo custo do 4 potes.
  { match: /(^|\D)4\s*mes/i, custo: 41.0 },
  // "DERMAX PREMIUM - 1 POTE + 1 GOTA", desde 19/10/2026: cápsula 8,50 + gotas 7,00.
  { match: /(^|\D)1\s*pote/i, custo: 15.5 },
  // Tratamento de 2 meses, desde 21/10/2026: 2 cápsulas × 8,50 + gotas 7,00.
  { match: /(^|\D)2\s*pote/i, custo: 24.0 },
  { match: /(^|\D)2\s*mes/i, custo: 24.0 },
];

/** Frete por pacote com a data em que passou a valer — IGUAL a FRETES do
 *  app. Vale o dia em que o pacote saiu (enviado_em); sem ele, o do agendamento. */
export const FRETES: { desde: string; valor: number }[] = [
  { desde: '2026-10-14', valor: 31.0 },
  { desde: '0000-01-01', valor: 33.0 },
];

function diaSP(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function freteDoPedido(p: { data?: string | null; enviado_em?: string | null }): number {
  const dia = p.enviado_em ? diaSP(p.enviado_em) : (p.data ?? '');
  return (FRETES.find((f) => dia >= f.desde) ?? FRETES[FRETES.length - 1]).valor;
}

/** IGUAIS às chaves de src/lib/pedidos.ts (há teste comparando). */
export const CANCELADO_NO_AGENDADO = true; // igual ao BlueSales, que soma os cancelados (22/10/2026)
export const PARCELAS_EXTRAS_NA_RECEITA = true; // planilha = verdade dos recebimentos (23/10/2026)

/** Taxa do BlueSales: R$ 2,50 por pagamento em boleto (igual ao app). */
export const TAXA_BOLETO = 2.5;
export function ehBoleto(metodo?: string | null): boolean {
  return /boleto/i.test(metodo ?? '');
}
export const COMISSAO_VENDEDOR = 0.05;
export const COMISSAO_COBRANCA = 0.01;

/** Percentual por vendedor, quando difere do padrão. */
export const COMISSAO_POR_VENDEDOR: Record<string, number> = {
  MATHEUS: 0.06,
};

export function custoProdutoDoPlano(plano?: string | null): number {
  const p = plano ?? '';
  for (const regra of CUSTO_PRODUTO) if (regra.match.test(p)) return regra.custo;
  return 0;
}

export function comissaoDoVendedor(nome?: string | null): number {
  const chave = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  return COMISSAO_POR_VENDEDOR[chave] ?? COMISSAO_VENDEDOR;
}

/** Status que conta como pago / frustrado (mesma regra do app). */
export function ehPago(status?: string | null): boolean {
  const s = (status ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return s === 'pagos' || s === 'pago';
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
