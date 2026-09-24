// Integração Facebook: conversa com o servidor (api/meta-ads.ts).
// Só existe na versão online: o servidor confere a sessão do Supabase.
import { supabase } from '@/lib/supabase';

export interface ParteMeta {
  conta: string;
  moeda: string;
  valor: number;
  cotacao: number;
  /** Imposto do Meta aplicado, em % (só contas em real). */
  imposto?: number;
  reais: number;
}

export interface DiaMeta {
  data: string;
  reais: number;
  partes: ParteMeta[];
  /** O que a dashboard tinha no dia antes desta consulta. */
  na_dashboard: number;
}

export type RespostaMeta =
  | { ok: true; simulado: boolean; desde: string; ate: string; dias: DiaMeta[] }
  | { ok: false; aviso: string; configurado?: boolean };

export interface ContaMeta {
  id: string;
  nome: string;
  moeda: string;
  ativa: boolean;
  status: string;
  business: string | null;
}

export interface ConfigMeta {
  contas: string[];
  /** null = cotação do Banco Central (só pela variável da Vercel). */
  cotacao_usd: number | null;
  imposto_brl_pct: number;
}

export type RespostaContas =
  | { ok: true; contas: ContaMeta[]; config: ConfigMeta; salva: boolean; migracao: boolean }
  | { ok: false; aviso: string; configurado?: boolean };

export type RespostaSalvar = { ok: true; config: ConfigMeta } | { ok: false; aviso: string };

export const metaDisponivel = Boolean(supabase);

async function chamar<T>(params: URLSearchParams, corpo?: unknown): Promise<T | { ok: false; aviso: string }> {
  if (!supabase) return { ok: false, aviso: 'Disponível só na versão online.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, aviso: 'Sessão expirada — entre de novo.' };
  try {
    const r = await fetch(`/api/meta-ads?${params}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const json = (await r.json()) as T & { error?: string };
    if (r.status === 401) return { ok: false, aviso: 'Sem permissão para a integração.' };
    return json;
  } catch {
    return { ok: false, aviso: 'Sem conexão com o servidor.' };
  }
}

/** Sincroniza (ou só simula) o gasto do Meta no período. */
export function sincronizarMeta(opts: { desde?: string; ate?: string; dias?: number; simular?: boolean } = {}) {
  const q = new URLSearchParams();
  if (opts.desde) q.set('desde', opts.desde);
  if (opts.ate) q.set('ate', opts.ate);
  if (opts.dias) q.set('dias', String(opts.dias));
  if (opts.simular) q.set('simular', '1');
  return chamar<RespostaMeta>(q) as Promise<RespostaMeta>;
}

/** Contas de anúncio que o token enxerga + a configuração em uso. */
export function listarContasMeta() {
  return chamar<RespostaContas>(new URLSearchParams({ acao: 'contas' })) as Promise<RespostaContas>;
}

/** Grava contas marcadas, taxa do dólar e/ou imposto das contas em real. */
export function salvarConfigMeta(patch: Partial<{ contas: string[]; cotacao_usd: number; imposto_brl_pct: number }>) {
  return chamar<RespostaSalvar>(new URLSearchParams({ acao: 'salvar' }), patch) as Promise<RespostaSalvar>;
}
