// ─────────────────────────────────────────────────────────────
// Conferência automática com a planilha de pagamentos.
//
//   POST /api/planilha   Authorization: Bearer <PLANILHA_TOKEN>
//   { abas: [{ nome, linhas: [{ linha, pedido, valor, data, vendedor, metodo }] }] }
//
// Quem chama é o script dentro da própria planilha (Apps Script), de hora
// em hora. Chegam só código do pedido, valor, data, vendedor e método — o
// nome da cliente não sai da planilha.
//
// O servidor guarda a foto da planilha (planilha_pagamentos), corrige
// sozinho o que é seguro (api/lib-planilha.ts → ajustesAutomaticos) e
// anota cada correção em planilha_ajustes. O resto aparece na tela
// Conferência da Planilha.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

const MAX_LINHAS = 20000;
const MAX_AJUSTES = 200;

function tokenConfere(enviado: string, certo: string) {
  const a = Buffer.from(enviado);
  const b = Buffer.from(certo);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const [{ createClient }, lib] = await Promise.all([import('@supabase/supabase-js'), import('./lib-planilha.js')]);
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>;
    const abas = Array.isArray(corpo.abas) ? (corpo.abas as Record<string, unknown>[]) : [];
    const linhas = abas.flatMap((a) =>
      lib.normalizarLinhas(String(a.nome ?? 'Planilha'), Array.isArray(a.linhas) ? (a.linhas as Record<string, unknown>[]) : []),
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
    const pedidos: import('./lib-planilha.js').PedidoBanco[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from('bluesales_pedidos')
        .select('id,internal_id,status,valor,valor_agendado,valor_bruto,data_aprovacao,vendedor,removido_em')
        .eq('user_id', donoId)
        .in('id', ids.slice(i, i + 200));
      if (error) return aviso('Banco: ' + error.message);
      pedidos.push(...((data ?? []) as import('./lib-planilha.js').PedidoBanco[]));
    }

    // 3) O que é seguro, corrige sozinho — e anota.
    const ajustes = lib.ajustesAutomaticos(linhas, pedidos).slice(0, MAX_AJUSTES);
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
