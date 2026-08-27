// ─────────────────────────────────────────────────────────────
// Import de CSV de custos. Colunas: data,categoria,descricao,valor
// Tolerante a ';' ou ',', datas DD/MM/AAAA ou AAAA-MM-DD, e valores
// no formato BR (1.234,56) ou simples (1234.56).
// ─────────────────────────────────────────────────────────────

import type { CategoriaCusto, CustoVariavel } from '@/types';

export interface LinhaImport {
  ok: boolean;
  erro?: string;
  custo?: Omit<CustoVariavel, 'id'>;
  original: string;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function parseData(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function parseValor(s: string): number | null {
  let t = s.replace(/[R$\s]/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function splitLinha(linha: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === delim && !aspas) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsvCustos(texto: string, categorias: CategoriaCusto[]): LinhaImport[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return [];

  const delim = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ',';

  const primeira = normalizar(linhas[0]);
  const temCabecalho = primeira.includes('data') && primeira.includes('valor');
  const corpo = temCabecalho ? linhas.slice(1) : linhas;

  const catPorNome = new Map(categorias.map((c) => [normalizar(c.nome), c.id]));
  const outros = categorias.find((c) => normalizar(c.nome) === 'outros')?.id ?? categorias[0]?.id ?? null;

  return corpo.map((linha): LinhaImport => {
    const cols = splitLinha(linha, delim);
    if (cols.length < 4) return { ok: false, erro: 'Menos de 4 colunas', original: linha };

    const [dataRaw, catRaw, descRaw, valorRaw] = cols;
    const data = parseData(dataRaw);
    if (!data) return { ok: false, erro: `Data inválida: "${dataRaw}"`, original: linha };
    const valor = parseValor(valorRaw);
    if (valor === null) return { ok: false, erro: `Valor inválido: "${valorRaw}"`, original: linha };
    if (!descRaw.trim()) return { ok: false, erro: 'Descrição vazia', original: linha };

    const categoria_id = catPorNome.get(normalizar(catRaw)) ?? outros;

    return {
      ok: true,
      original: linha,
      custo: {
        data,
        categoria_id,
        descricao: descRaw.trim(),
        valor,
        recorrencia: 'unico',
        recorrencia_fim: null,
        ratear_por_dias: true,
        observacao: 'Importado via CSV',
      },
    };
  });
}
