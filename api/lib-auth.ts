// ─────────────────────────────────────────────────────────────
// Quem pode usar os endpoints da dashboard: o dono ou um sócio logado
// (Bearer <sessão do Supabase>). Login de VENDEDOR não passa — ele só tem
// o Painel do Vendedor.
//
// Importar com import() dinâmico: import estático de módulo local derruba
// a função nesta hospedagem (ver api/resumo-dia.ts).
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export async function donoOuSocio(db: SupabaseClient, authorization: unknown, donoId: string): Promise<boolean> {
  const token = String(authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  const quem = data.user?.id;
  if (!quem) return false;
  if (quem === donoId) return true;
  const { data: membro } = await db
    .from('dashboard_membros')
    .select('dono_id')
    .eq('membro_id', quem)
    .eq('dono_id', donoId)
    .maybeSingle();
  return Boolean(membro);
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
