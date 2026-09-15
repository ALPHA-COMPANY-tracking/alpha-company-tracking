// ─────────────────────────────────────────────────────────────
// Paleta da marca AJ Alpha Company: PRETO + DOURADO.
//
// Uma fonte só para as cores que precisam ir por JavaScript (gráficos,
// estilo inline). As classes do Tailwind usam as mesmas variáveis CSS
// definidas em src/index.css.
//
// Regra: dourado é a marca; verde, vermelho e âmbar só aparecem quando
// a cor TEM significado (entrou, saiu, aviso). Roxo, azul e rosa não
// entram — não têm relação com o produto.
// ─────────────────────────────────────────────────────────────

/** Cores que acompanham o tema (escurecem no modo claro). Para texto e
 *  ícone. Não servem dentro de atributo SVG — lá use HEX. */
export const COR = {
  ouro: 'rgb(var(--gold))',
  ouroClaro: 'rgb(var(--gold2))',
  ouroEscuro: 'rgb(var(--gold3))',
  texto: 'rgb(var(--tx))',
  apagado: 'rgb(var(--dim))',
  verde: '#34d399',
  vermelho: '#fb7185',
  ambar: '#fbbf24',
} as const;

/** HEX fixos, para gráficos (atributos SVG não resolvem var()). */
export const HEX = {
  ouro: '#d4af37',
  ouroClaro: '#e9c96e',
  ouroPalido: '#f7e7ad',
  ouroEscuro: '#a8792e',
  verde: '#34d399',
  vermelho: '#fb7185',
  ambar: '#fbbf24',
  eixo: '#736f66',
  rotulo: '#e2dfd6',
  grade: '#282723',
  vazio: '#24231f',
} as const;

/** Cor com transparência, funciona com HEX e com var(). */
export function alfa(cor: string, pct: number): string {
  return `color-mix(in srgb, ${cor} ${pct}%, transparent)`;
}

/**
 * Tons para as categorias de custo: escala do dourado + neutros quentes.
 * Doze opções dão para distinguir as categorias sem sair da marca.
 */
export const PALETA_CATEGORIAS = [
  '#d4af37',
  '#e9c96e',
  '#f7e7ad',
  '#a8792e',
  '#c9a227',
  '#8a6224',
  '#e2dfd6',
  '#a09c92',
  '#736f66',
  '#bf9a2e',
  '#6e4f1e',
  '#4a463f',
] as const;

/**
 * Cor de uma categoria. As categorias antigas foram salvas no banco com
 * a paleta velha (ciano, roxo, rosa…); em vez de reescrever o banco,
 * qualquer cor fora da paleta nova é trocada por um tom dourado,
 * escolhido pela posição da categoria para as cores não repetirem.
 */
export function corDaCategoria(cor: string | null | undefined, indice: number): string {
  const c = (cor ?? '').toLowerCase();
  if ((PALETA_CATEGORIAS as readonly string[]).includes(c)) return c;
  return PALETA_CATEGORIAS[Math.abs(indice) % PALETA_CATEGORIAS.length];
}
