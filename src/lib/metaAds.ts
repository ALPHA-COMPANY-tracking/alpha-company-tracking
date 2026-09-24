// Pede ao servidor para buscar o gasto do Meta Ads (api/meta-ads.ts).
// Só existe na versão online: o servidor confere a sessão do Supabase.
import { supabase } from '@/lib/supabase';

export interface DiaMeta {
  data: string;
  reais: number;
  partes: { conta: string; moeda: string; valor: number; cotacao: number; reais: number }[];
  /** O que a dashboard tinha no dia antes desta consulta. */
  na_dashboard: number;
}

export type RespostaMeta =
  | { ok: true; simulado: boolean; desde: string; ate: string; dias: DiaMeta[] }
  | { ok: false; aviso: string; configurado?: boolean };

export const metaDisponivel = Boolean(supabase);

/** Sincroniza (ou só simula) o gasto do Meta no período. */
export async function sincronizarMeta(opts: { desde?: string; ate?: string; dias?: number; simular?: boolean } = {}): Promise<RespostaMeta> {
  if (!supabase) return { ok: false, aviso: 'Disponível só na versão online.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, aviso: 'Sessão expirada — entre de novo.' };

  const q = new URLSearchParams();
  if (opts.desde) q.set('desde', opts.desde);
  if (opts.ate) q.set('ate', opts.ate);
  if (opts.dias) q.set('dias', String(opts.dias));
  if (opts.simular) q.set('simular', '1');

  try {
    const r = await fetch(`/api/meta-ads?${q}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    return (await r.json()) as RespostaMeta;
  } catch {
    return { ok: false, aviso: 'Sem conexão com o servidor.' };
  }
}
