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

/** Taxa do dólar que vale a partir de um dia ('0001-01-01' = antes de tudo). */
export interface CotacaoDesde {
  desde: string;
  valor: number;
}

export interface ConfigMeta {
  contas: string[];
  /** A taxa de hoje. null = cotação do Banco Central (só pela variável da Vercel). */
  cotacao_usd: number | null;
  imposto_brl_pct: number;
  /** Histórico da taxa (migração 0033): cada uma vale a partir do seu dia. */
  cotacoes_usd?: CotacaoDesde[];
  /** Dólar exato de um dia só (migração 0033). */
  cotacoes_dia?: Record<string, number>;
}

/** Conta do cadastro (Importar BM ou Manual). O token nunca vem para a tela. */
export interface ContaCadastro extends ContaMeta {
  bm_id: string | null;
  origem: 'bm' | 'manual';
  /** De onde sai o token: a BM importada, a Vercel ou nenhum. */
  token: 'bm' | 'vercel' | 'falta';
}

export type RespostaContas =
  | {
      ok: true;
      /** null = migração 0020 não rodada (a lista vem do token da Vercel). */
      cadastro: ContaCadastro[] | null;
      contas: ContaMeta[];
      config: ConfigMeta;
      salva: boolean;
      migracao: boolean;
      /** A migração 0033 (taxa com data) já rodou. */
      cotacoes?: boolean;
    }
  | { ok: false; aviso: string; configurado?: boolean };

export type RespostaSalvar = { ok: true; config: ConfigMeta } | { ok: false; aviso: string };

export type ResultadoBusca = (ContaMeta & { ok: true; cadastrada: boolean }) | { id: string; ok: false; erro: string };

export type RespostaBusca = { ok: true; resultados: ResultadoBusca[] } | { ok: false; aviso: string };

export type RespostaCadastro =
  | { ok: true; cadastro: ContaCadastro[]; config: ConfigMeta; cadastradas?: number; erros?: { id: string; erro: string }[] }
  | { ok: false; aviso: string };

export interface ImportarBM {
  bm_id: string;
  /** Vazio = o token já guardado desta BM (ou o da Vercel). */
  token: string;
  /** Account IDs colados; vazio = todas as contas que o token enxerga. */
  ids: string;
}

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

/** Cadastro de contas + a configuração em uso. */
export function listarContasMeta() {
  return chamar<RespostaContas>(new URLSearchParams({ acao: 'contas' })) as Promise<RespostaContas>;
}

/** Importar BM, passo 1: nome, moeda e status de cada Account ID. */
export function buscarNomesMeta(dados: ImportarBM) {
  return chamar<RespostaBusca>(new URLSearchParams({ acao: 'buscar' }), dados) as Promise<RespostaBusca>;
}

/** Importar BM, passo 2: cadastra as contas escolhidas e guarda o token da BM. */
export function cadastrarContasMeta(dados: { bm_id: string; token: string; ids: string[] }) {
  return chamar<RespostaCadastro>(new URLSearchParams({ acao: 'cadastrar' }), dados) as Promise<RespostaCadastro>;
}

/** Cadastro manual, sem consultar o Meta. */
export function cadastrarManualMeta(dados: { id: string; nome: string; moeda: 'BRL' | 'USD'; bm_id: string }) {
  return chamar<RespostaCadastro>(new URLSearchParams({ acao: 'manual' }), dados) as Promise<RespostaCadastro>;
}

/** Tira a conta do cadastro (e da seleção do P&L). */
export function removerContaMeta(id: string) {
  return chamar<RespostaCadastro>(new URLSearchParams({ acao: 'remover' }), { id }) as Promise<RespostaCadastro>;
}

/** Busca de novo nome, moeda e status de todas as contas cadastradas. */
export function redetectarContasMeta() {
  return chamar<RespostaCadastro>(new URLSearchParams({ acao: 'redetectar' }), {}) as Promise<RespostaCadastro>;
}

/**
 * Grava contas marcadas, taxa do dólar e/ou imposto das contas em real. A
 * taxa vale a partir de `cotacao_desde` (padrão: hoje); `cotacao_dia` é o
 * dólar de um dia só (valor null tira).
 */
export function salvarConfigMeta(
  patch: Partial<{
    contas: string[];
    cotacao_usd: number;
    cotacao_desde: string;
    remover_cotacao_desde: string;
    cotacao_dia: { dia: string; valor: number | null };
    imposto_brl_pct: number;
  }>,
) {
  return chamar<RespostaSalvar>(new URLSearchParams({ acao: 'salvar' }), patch) as Promise<RespostaSalvar>;
}

/** Sincroniza um período de qualquer tamanho, de 62 em 62 dias (o limite do servidor). */
export async function sincronizarPeriodoMeta(desde: string, ate: string): Promise<RespostaMeta> {
  let ultimo: RespostaMeta = { ok: true, simulado: false, desde, ate, dias: [] };
  for (let ini = desde; ini <= ate; ) {
    const fim = (() => {
      const d = new Date(`${ini}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 61);
      const iso = d.toISOString().slice(0, 10);
      return iso < ate ? iso : ate;
    })();
    ultimo = await sincronizarMeta({ desde: ini, ate: fim });
    if (!ultimo.ok) return ultimo;
    const d = new Date(`${fim}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    ini = d.toISOString().slice(0, 10);
  }
  return ultimo;
}
