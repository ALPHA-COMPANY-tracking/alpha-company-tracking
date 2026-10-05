// ─────────────────────────────────────────────────────────────
// Conferência com a planilha "[PayAfter] Pagamentos Aprovados" — a
// verdade do que foi recebido.
//
//   POST /api/planilha   Authorization: Bearer <PLANILHA_TOKEN>
//   { abas: [{ nome, linhas: [{ linha, pedido, valor, data, vendedor, metodo }] }] }
//
// Quem chama é o script dentro da própria planilha (Apps Script), de hora
// em hora. Chegam só código do pedido, valor, data, vendedor e método — o
// nome da cliente não sai da planilha. O servidor guarda a foto
// (planilha_pagamentos), corrige sozinho o que é seguro (ajustesAutomaticos)
// e anota cada correção em planilha_ajustes. O resto aparece na tela
// Conferência da Planilha, que usa as MESMAS funções puras daqui.
//
// Rota e regras no mesmo arquivo de propósito: o plano da Vercel aceita no
// máximo 12 funções, e cada arquivo de /api vira uma. Por isso também nada
// de import estático de módulo do Node aqui (a tela importa este arquivo).
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface LinhaRecebida {
  linha?: unknown;
  pedido?: unknown;
  valor?: unknown;
  data?: unknown;
  vendedor?: unknown;
  metodo?: unknown;
}

export interface LinhaPlanilha {
  aba: string;
  linha: number | null;
  pedido_id: string;
  valor: number;
  /** 'YYYY-MM-DD' */
  data_pagamento: string;
  vendedor: string | null;
  metodo: string | null;
}

/** 735 · "735" · "R$ 1.234,56" · "735.5" → número (ou null). */
export function lerValor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "2026-09-01" · "01/09/2026" · "2026-09-01T03:00:00.000Z" → 'YYYY-MM-DD'. */
export function lerData(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    // Data do Google vem em UTC (meia-noite de SP = 03:00Z): o dia certo é o de SP.
    if (/T\d{2}:/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      }
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Pelo primeiro nome: "Mateus" → "MATHEUS"; " peter silva " → "PETER". */
export function normalizarVendedor(v: unknown): string | null {
  const s = String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .split(/\s+/)[0];
  if (!s) return null;
  return s === 'MATEUS' ? 'MATHEUS' : s;
}

/** Só as linhas com código de pedido do BlueSales, valor e data válidos. */
export function normalizarLinhas(aba: string, linhas: LinhaRecebida[]): LinhaPlanilha[] {
  const out: LinhaPlanilha[] = [];
  for (const l of linhas) {
    const pedido = /BLV-[A-Z0-9]+/i.exec(String(l.pedido ?? ''))?.[0]?.toUpperCase();
    const valor = lerValor(l.valor);
    const data = lerData(l.data);
    if (!pedido || valor == null || valor <= 0 || !data) continue;
    out.push({
      aba: aba.slice(0, 60),
      linha: Number.isFinite(Number(l.linha)) ? Number(l.linha) : null,
      pedido_id: pedido,
      valor,
      data_pagamento: data,
      vendedor: normalizarVendedor(l.vendedor),
      metodo: String(l.metodo ?? '').trim().slice(0, 30) || null,
    });
  }
  return out;
}

/**
 * Mês de cada aba: o mês da maioria das linhas. Um pagamento de 31/08
 * lançado na aba de setembro (caso da Eunice) conta em setembro, como no
 * resumo da própria planilha.
 */
export function competencias(linhas: LinhaPlanilha[]): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const m = l.data_pagamento.slice(0, 7);
    const c = contagem.get(l.aba) ?? new Map<string, number>();
    c.set(m, (c.get(m) ?? 0) + 1);
    contagem.set(l.aba, c);
  }
  const out = new Map<string, string>();
  for (const [aba, c] of contagem) out.set(aba, [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

export interface PedidoBanco {
  id: string;
  internal_id?: number | null;
  status: string | null;
  valor: number;
  valor_agendado?: number | null;
  valor_bruto?: number | null;
  data_aprovacao?: string | null;
  vendedor?: string | null;
  removido_em?: string | null;
}

export interface Ajuste {
  pedido_id: string;
  internal_id: number | null;
  campo: 'valor' | 'data_aprovacao';
  de: string;
  para: string;
}

const pago = (s: string | null) => /^pagos?$/i.test((s ?? '').trim());
const vezes = (linhas: LinhaPlanilha[]) => {
  const c = new Map<string, number>();
  for (const l of linhas) c.set(l.pedido_id, (c.get(l.pedido_id) ?? 0) + 1);
  return c;
};

/**
 * O que dá para corrigir SOZINHO, sem risco: pedido pago aqui, código que
 * aparece uma vez só na planilha, mesmo vendedor dos dois lados.
 *   · valor diferente → o da planilha (e fica protegido do BlueSales),
 *     desde que não passe do maior valor que o pedido já teve — valor
 *     acima disso é mais provável erro de digitação;
 *   · data diferente DENTRO do mesmo mês → a da planilha.
 * Data em outro mês, código repetido (pagamento em partes), vendedor
 * diferente, pedido que falta ou sobra: só aparece na tela.
 */
export function ajustesAutomaticos(planilha: LinhaPlanilha[], pedidos: PedidoBanco[]): Ajuste[] {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const contagem = vezes(planilha);
  const out: Ajuste[] = [];
  for (const l of planilha) {
    if (contagem.get(l.pedido_id) !== 1) continue;
    const p = porId.get(l.pedido_id);
    if (!p || p.removido_em || !pago(p.status)) continue;
    const vend = normalizarVendedor(p.vendedor);
    if (l.vendedor && vend && l.vendedor !== vend) continue;
    const atual = Number(p.valor) || 0;
    const teto = Math.max(atual, Number(p.valor_agendado) || 0, Number(p.valor_bruto) || 0);
    if (Math.abs(atual - l.valor) >= 0.01 && l.valor <= teto) {
      out.push({ pedido_id: p.id, internal_id: p.internal_id ?? null, campo: 'valor', de: String(atual), para: String(l.valor) });
    }
    const data = p.data_aprovacao?.slice(0, 10) ?? null;
    if (data && data !== l.data_pagamento && data.slice(0, 7) === l.data_pagamento.slice(0, 7)) {
      out.push({ pedido_id: p.id, internal_id: p.internal_id ?? null, campo: 'data_aprovacao', de: data, para: l.data_pagamento });
    }
  }
  return out;
}

// ── Conferência de um mês (tela) ──

export type TipoDiferenca = 'valor' | 'data' | 'vendedor' | 'nao_pago' | 'falta' | 'a_mais' | 'repetido';

export interface Diferenca {
  tipo: TipoDiferenca;
  pedido_id: string;
  internal_id: number | null;
  planilha?: string;
  dashboard?: string;
  /** Para o botão "Usar o da planilha": o que está aqui (de) e o que fica. */
  corrigirPara?: { campo: 'valor' | 'data_aprovacao' | 'vendedor'; de: string; valor: string };
  /** Data: a da planilha cai em outro mês (muda o fechamento dos dois). */
  outroMes?: boolean;
}

export interface Totais {
  total: number;
  qtd: number;
  porVendedor: Record<string, { total: number; qtd: number }>;
}

export interface Conferencia {
  mes: string;
  planilha: Totais;
  dashboard: Totais;
  diferencas: Diferenca[];
  /** Último pagamento lançado na planilha neste mês. */
  ultimaData: string | null;
}

function somar(itens: { valor: number; vendedor: string | null }[]): Totais {
  const t: Totais = { total: 0, qtd: 0, porVendedor: {} };
  for (const i of itens) {
    t.total = Math.round((t.total + i.valor) * 100) / 100;
    t.qtd += 1;
    const v = i.vendedor ?? '—';
    const pv = (t.porVendedor[v] ??= { total: 0, qtd: 0 });
    pv.total = Math.round((pv.total + i.valor) * 100) / 100;
    pv.qtd += 1;
  }
  return t;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (iso: string | null | undefined) => (iso ?`${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/** Planilha × dashboard num mês ('YYYY-MM'), pelo mês da aba. */
export function conferirMes(mes: string, linhas: LinhaPlanilha[], pedidos: PedidoBanco[]): Conferencia {
  const comp = competencias(linhas);
  const doMes = linhas
    .filter((l) => (comp.get(l.aba) ?? l.data_pagamento.slice(0, 7)) === mes)
    // Linha gravada por uma versão antiga do envio pode vir "Mateus".
    .map((l) => ({ ...l, vendedor: normalizarVendedor(l.vendedor) }));
  const pagosMes = pedidos.filter((p) => !p.removido_em && pago(p.status) && (p.data_aprovacao ?? '').slice(0, 7) === mes);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const contagem = vezes(doMes);
  const diferencas: Diferenca[] = [];
  // Corrigir o vendedor com o nome escrito como já está aqui ("MATEUS" da
  // planilha vira o "MATHEUS" do BlueSales), para não dividir o ranking.
  const nomeAqui = new Map<string, string>();
  for (const p of pedidos) {
    const n = normalizarVendedor(p.vendedor);
    if (n && p.vendedor && !nomeAqui.has(n)) nomeAqui.set(n, p.vendedor.trim());
  }

  for (const l of doMes) {
    const p = porId.get(l.pedido_id);
    if (contagem.get(l.pedido_id)! > 1) {
      if (!diferencas.some((d) => d.tipo === 'repetido' && d.pedido_id === l.pedido_id)) {
        diferencas.push({ tipo: 'repetido', pedido_id: l.pedido_id, internal_id: p?.internal_id ?? null, planilha: `${contagem.get(l.pedido_id)} linhas` });
      }
      continue;
    }
    if (!p || p.removido_em) {
      diferencas.push({ tipo: 'falta', pedido_id: l.pedido_id, internal_id: p?.internal_id ?? null, planilha: `${brl(l.valor)} em ${dm(l.data_pagamento)}` });
      continue;
    }
    if (!pago(p.status)) {
      diferencas.push({ tipo: 'nao_pago', pedido_id: p.id, internal_id: p.internal_id ?? null, planilha: `pago ${brl(l.valor)} em ${dm(l.data_pagamento)}`, dashboard: p.status ?? '—' });
      continue;
    }
    const atual = Number(p.valor) || 0;
    if (Math.abs(atual - l.valor) >= 0.01) {
      diferencas.push({
        tipo: 'valor', pedido_id: p.id, internal_id: p.internal_id ?? null, planilha: brl(l.valor), dashboard: brl(atual),
        corrigirPara: { campo: 'valor', de: String(atual), valor: String(l.valor) },
      });
    }
    const vend = normalizarVendedor(p.vendedor);
    if (l.vendedor && vend && l.vendedor !== vend) {
      diferencas.push({
        tipo: 'vendedor', pedido_id: p.id, internal_id: p.internal_id ?? null, planilha: l.vendedor, dashboard: vend,
        corrigirPara: { campo: 'vendedor', de: p.vendedor ?? '', valor: nomeAqui.get(l.vendedor) ?? l.vendedor },
      });
    }
    const data = p.data_aprovacao?.slice(0, 10) ?? null;
    if (data !== l.data_pagamento) {
      diferencas.push({
        tipo: 'data', pedido_id: p.id, internal_id: p.internal_id ?? null, planilha: dm(l.data_pagamento), dashboard: dm(data),
        // De um mês para outro muda o fechamento dos dois meses: o servidor
        // não faz sozinho, mas o botão da tela faz (a pessoa decidiu).
        outroMes: data?.slice(0, 7) !== l.data_pagamento.slice(0, 7),
        corrigirPara: { campo: 'data_aprovacao', de: data ?? '', valor: l.data_pagamento },
      });
    }
  }

  // Pago aqui e em lugar nenhum da planilha — até o último dia que ela já tem.
  const ultimaData = doMes.reduce<string | null>((m, l) => (!m || l.data_pagamento > m ? l.data_pagamento : m), null);
  const naPlanilha = new Set(linhas.map((l) => l.pedido_id));
  for (const p of pagosMes) {
    if (naPlanilha.has(p.id)) continue;
    if (ultimaData && (p.data_aprovacao ?? '') > ultimaData) continue;
    diferencas.push({ tipo: 'a_mais', pedido_id: p.id, internal_id: p.internal_id ?? null, dashboard: `${brl(Number(p.valor) || 0)} em ${dm(p.data_aprovacao)}` });
  }

  return {
    mes,
    planilha: somar(doMes.map((l) => ({ valor: l.valor, vendedor: l.vendedor }))),
    dashboard: somar(pagosMes.map((p) => ({ valor: Number(p.valor) || 0, vendedor: normalizarVendedor(p.vendedor) }))),
    diferencas,
    ultimaData,
  };
}

// ── Rota: o que a planilha manda ──

const MAX_LINHAS = 20000;
const MAX_AJUSTES = 200;

/** Compara sem parar no primeiro caractere diferente (não vaza o token pelo tempo). */
function tokenConfere(enviado: string, certo: string) {
  if (enviado.length !== certo.length) return false;
  let dif = 0;
  for (let i = 0; i < certo.length; i++) dif |= enviado.charCodeAt(i) ^ certo.charCodeAt(i);
  return dif === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const aviso = (texto: string) => res.status(200).json({ ok: false, aviso: texto });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const certo = process.env.PLANILHA_TOKEN;
  if (!certo) return aviso('Falta configurar PLANILHA_TOKEN na Vercel.');
  const enviado = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!enviado || !tokenConfere(enviado, certo)) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const donoId = process.env.DASHBOARD_USER_ID;
    if (!donoId) return aviso('DASHBOARD_USER_ID não configurado.');
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>;
    const abas = Array.isArray(corpo.abas) ? (corpo.abas as Record<string, unknown>[]) : [];
    const linhas = abas.flatMap((a) =>
      normalizarLinhas(String(a.nome ?? 'Planilha'), Array.isArray(a.linhas) ? (a.linhas as Record<string, unknown>[]) : []),
    );
    if (linhas.length === 0) return aviso('Nenhuma linha com código de pedido (BLV-…), valor e data.');
    if (linhas.length > MAX_LINHAS) return aviso(`Mais de ${MAX_LINHAS} linhas: mande menos abas.`);

    // 1) A foto nova entra antes de a antiga sair: se algo falhar no meio,
    //    a tela continua com a anterior.
    const lote = new Date().toISOString();
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await db
        .from('planilha_pagamentos')
        .insert(linhas.slice(i, i + 500).map((l) => ({ ...l, user_id: donoId, recebido_em: lote })));
      if (error) {
        await db.from('planilha_pagamentos').delete().eq('user_id', donoId).eq('recebido_em', lote);
        return aviso(/planilha_pagamentos/.test(error.message) ? 'Rode a migração 0027 no Supabase primeiro.' : 'Banco: ' + error.message);
      }
    }
    await db.from('planilha_pagamentos').delete().eq('user_id', donoId).lt('recebido_em', lote);

    // 2) Os pedidos que a planilha cita.
    const ids = [...new Set(linhas.map((l) => l.pedido_id))];
    const pedidos: PedidoBanco[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from('bluesales_pedidos')
        .select('id,internal_id,status,valor,valor_agendado,valor_bruto,data_aprovacao,vendedor,removido_em')
        .eq('user_id', donoId)
        .in('id', ids.slice(i, i + 200));
      if (error) return aviso('Banco: ' + error.message);
      pedidos.push(...((data ?? []) as PedidoBanco[]));
    }

    // 3) O que é seguro, corrige sozinho — e anota.
    const ajustes = ajustesAutomaticos(linhas, pedidos).slice(0, MAX_AJUSTES);
    let aplicados = 0;
    for (const a of ajustes) {
      const patch = a.campo === 'valor' ? { valor: Number(a.para), valor_manual: true } : { data_aprovacao: a.para };
      const { error } = await db.from('bluesales_pedidos').update(patch).eq('user_id', donoId).eq('id', a.pedido_id);
      if (error) continue;
      aplicados += 1;
      await db.from('planilha_ajustes').insert({ ...a, user_id: donoId, origem: 'automatico' });
    }

    return res.status(200).json({ ok: true, abas: abas.length, linhas: linhas.length, ajustes: aplicados });
  } catch (e) {
    return aviso(e instanceof Error ? e.message : String(e));
  }
}
