// ─────────────────────────────────────────────────────────────
// Regras de custo usadas pelo resumo do dia (lado servidor).
//
// Precisam ser IGUAIS às de src/lib/custosConfig.ts — o teste
// src/lib/resumoServidor.test.ts falha se alguém mudar só um lado.
// Duplicado porque o arquivo do app usa aliases do Vite (@/…), que
// não resolvem no runtime das funções.
// ─────────────────────────────────────────────────────────────

/** Custo do produto por plano, detectado pelo texto. */
export const CUSTO_PRODUTO: { match: RegExp; custo: number }[] = [
  { match: /6\s*pote/i, custo: 83.0 },
  { match: /3\s*pote/i, custo: 32.5 },
];

export const FRETE_POR_PEDIDO = 33.0;
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
