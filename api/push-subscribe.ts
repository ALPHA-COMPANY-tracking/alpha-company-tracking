// ─────────────────────────────────────────────────────────────
// Registra (ou remove) um aparelho para receber notificações.
// O app manda a inscrição gerada pelo navegador; guardamos as
// chaves que o Web Push exige para criptografar a mensagem.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_USER_ID
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

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
  const userId = process.env.DASHBOARD_USER_ID;
  if (!userId) return res.status(500).json({ error: 'DASHBOARD_USER_ID não configurado' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {};
  const endpoint = String(body.endpoint ?? '');
  if (!endpoint.startsWith('http')) return res.status(400).json({ error: 'endpoint inválido' });

  // DELETE: o usuário desligou as notificações neste aparelho.
  if (req.method === 'DELETE') {
    await supabase().from('push_subscriptions').delete().eq('endpoint', endpoint);
    return res.status(200).json({ ok: true, removido: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const keys = body.keys ?? {};
  if (!keys.p256dh || !keys.auth) return res.status(400).json({ error: 'chaves ausentes' });

  const { error } = await supabase()
    .from('push_subscriptions')
    .upsert(
      {
        endpoint,
        user_id: userId,
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        apelido: typeof body.apelido === 'string' ? body.apelido.slice(0, 60) : null,
      },
      { onConflict: 'endpoint' },
    );

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
