// ─────────────────────────────────────────────────────────────
// Precisão monetária. Tudo em CENTAVOS inteiros → soma exata.
// Regra da spec: nada de somar floats e entregar R$ 6.041,0799.
// ─────────────────────────────────────────────────────────────

/** Centavos inteiros. É o tipo canônico de dinheiro no motor. */
export type Cents = number;

/** Reais (float, 2 casas) → centavos inteiros. Arredonda o ruído de float. */
export function reaisToCents(reais: number): Cents {
  if (!Number.isFinite(reais)) return 0;
  return Math.round(reais * 100);
}

/** Centavos → reais (float). Usar só na borda de formatação. */
export function centsToReais(cents: Cents): number {
  return cents / 100;
}

/** Formata centavos como 'R$ 1.234,56' (pt-BR). */
export function formatBRL(cents: Cents): string {
  return centsToReais(cents).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Formata para o demonstrativo: custo vira '− R$ 22,50', entrada
 * '+ R$ ...' opcional. Zero fica neutro 'R$ 0,00'.
 */
export function formatBRLSigned(cents: Cents, kind: 'custo' | 'entrada' = 'entrada'): string {
  if (cents === 0) return formatBRL(0);
  const abs = formatBRL(Math.abs(cents));
  if (kind === 'custo') return `− ${abs}`;
  return cents < 0 ? `− ${abs}` : abs;
}

/** Formata compacto: 'R$ 198,8k' / 'R$ 1,2M'. Para rótulos de barra. */
export function formatBRLCompact(cents: Cents): string {
  const reais = centsToReais(cents);
  const abs = Math.abs(reais);
  const sign = reais < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')}k`;
  return formatBRL(cents);
}

/**
 * Formata uma razão (0..1) como percentual pt-BR: 0.290155 → '29,0%'.
 * Divisão por zero é tratada no motor; aqui só formatamos.
 */
export function formatPercent(ratio: number, decimals = 1): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Formata multiplicador: 2.04 → '2,04x' (ROAS). */
export function formatMultiplier(x: number, decimals = 2): string {
  if (!Number.isFinite(x)) return '—';
  return `${x.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}x`;
}

/** Distribui um total inteiro entre n posições o mais igual possível. */
export function distribuirInteiro(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Divisão segura: retorna 0 quando o denominador é 0 (evita NaN/Infinity). */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : 0;
}
