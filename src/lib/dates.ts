// ─────────────────────────────────────────────────────────────
// Utilitários de data para 'YYYY-MM-DD'. Tudo em UTC para não
// depender de fuso (datas são "date-only", sem hora).
// Como as datas são ISO zero-padded, comparação lexicográfica de
// strings já ordena corretamente: 'a <= b' compara datas.
// ─────────────────────────────────────────────────────────────

import type { IsoDate } from '@/types';

const MS_DIA = 86_400_000;

interface YMD {
  y: number;
  m: number; // 1..12
  d: number;
}

export function parseYmd(iso: IsoDate): YMD {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function utc(iso: IsoDate): number {
  const { y, m, d } = parseYmd(iso);
  return Date.UTC(y, m - 1, d);
}

/** true se `date` ∈ [inicio, fim] (inclusivo). */
export function isDentro(date: IsoDate, inicio: IsoDate, fim: IsoDate): boolean {
  return date >= inicio && date <= fim;
}

/** Dias no mês (y, m=1..12). */
export function diasNoMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Chave de mês 'YYYY-MM' a partir de uma data. */
export function mesKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

/** Quantidade de dias entre duas datas, inclusivo dos dois extremos. */
export function diasInclusivos(inicioIso: IsoDate, fimIso: IsoDate): number {
  if (fimIso < inicioIso) return 0;
  return Math.round((utc(fimIso) - utc(inicioIso)) / MS_DIA) + 1;
}

/** Primeiro dia do mês (y,m) como 'YYYY-MM-DD'. */
export function primeiroDiaMes(y: number, m: number): IsoDate {
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Último dia do mês (y,m) como 'YYYY-MM-DD'. */
export function ultimoDiaMes(y: number, m: number): IsoDate {
  return `${y}-${String(m).padStart(2, '0')}-${String(diasNoMes(y, m)).padStart(2, '0')}`;
}

/** Soma (ou subtrai) dias a uma data ISO, preservando 'YYYY-MM-DD'. */
export function addDias(iso: IsoDate, n: number): IsoDate {
  const base = utc(iso) + n * MS_DIA;
  const d = new Date(base);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Data de hoje no fuso America/Sao_Paulo, como 'YYYY-MM-DD'. */
export function hojeIso(): IsoDate {
  // en-CA formata como 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Formata 'YYYY-MM-DD' para 'DD/MM'. */
export function formatDiaMes(iso: IsoDate): string {
  const { m, d } = parseYmd(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Lista de todos os dias (ISO) entre inicio e fim, inclusivo. */
export function diasDoPeriodo(inicio: IsoDate, fim: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = inicio;
  while (cur <= fim) {
    out.push(cur);
    cur = addDias(cur, 1);
  }
  return out;
}

/**
 * Lista dos meses (como {y,m}) que têm qualquer interseção com
 * o período [inicio, fim].
 */
export function mesesNoPeriodo(inicio: IsoDate, fim: IsoDate): Array<{ y: number; m: number }> {
  const a = parseYmd(inicio);
  const b = parseYmd(fim);
  const out: Array<{ y: number; m: number }> = [];
  let y = a.y;
  let m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push({ y, m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
