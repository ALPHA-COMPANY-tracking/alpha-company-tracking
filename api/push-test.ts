// ─────────────────────────────────────────────────────────────
// Dispara uma notificação de teste para os aparelhos inscritos.
// Serve para conferir, sem esperar uma venda, se o caminho todo
// está funcionando: chaves, inscrição e entrega.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { enviarPush } from './_push';

let _db: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!_db) {
    _db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });
  }
  return _db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const userId = process.env.DASHBOARD_USER_ID;
  if (!userId) return res.status(500).json({ error: 'DASHBOARD_USER_ID não configurado' });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Chaves de notificação não configuradas na Vercel.' });
  }

  const hora = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });

  try {
    const enviados = await enviarPush(supabase(), userId, {
      titulo: '🔔 Notificação de teste',
      corpo: `Está tudo funcionando. Enviado às ${hora}.`,
      tag: 'teste',
    });

    if (enviados === 0) {
      return res.status(200).json({
        ok: false,
        enviados: 0,
        aviso: 'Nenhum aparelho inscrito. Ative as notificações neste aparelho primeiro.',
      });
    }
    return res.status(200).json({ ok: true, enviados });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Falha ao enviar' });
  }
}
