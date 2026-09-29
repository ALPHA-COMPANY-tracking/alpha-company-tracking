// Alerta de Clientes: conversa com o servidor (api/clientes.ts) e com o
// banco (alertas do vendedor). Só na versão online.
import { supabase } from '@/lib/supabase';
import type { ClienteDoCsv } from '@/lib/csvBluesales';
import { type AlertaCliente, nivelDoAlerta } from '@/lib/clientes';

export interface PedidoVerificado {
  numero: number | null;
  status: string | null;
  data: string;
  valor: number;
  /** Só para o dono/sócio. */
  vendedor?: string | null;
  por: 'cpf' | 'telefone';
  /** Achado pelo WhatsApp, mas com outro CPF. */
  outroCpf?: boolean;
}

export type RespostaVerificar = { ok: true; pedidos: PedidoVerificado[] } | { ok: false; aviso: string };
export type RespostaHistorico = { ok: true; gravados: number; com_codigo: number } | { ok: false; aviso: string };

async function chamar<T>(acao: string, corpo: unknown): Promise<T | { ok: false; aviso: string }> {
  if (!supabase) return { ok: false, aviso: 'Disponível só na versão online.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, aviso: 'Sessão expirada — entre de novo.' };
  try {
    const r = await fetch(`/api/clientes?acao=${acao}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (r.status === 401) return { ok: false, aviso: 'Sem permissão.' };
    return (await r.json()) as T;
  } catch {
    return { ok: false, aviso: 'Sem conexão com o servidor.' };
  }
}

/** Antes de agendar: pedidos com o mesmo CPF ou WhatsApp. */
export function verificarCliente(cpf: string, telefone: string) {
  return chamar<RespostaVerificar>('verificar', { cpf, telefone }) as Promise<RespostaVerificar>;
}

/** Histórico (uma vez): manda número, CPF e WhatsApp dos pedidos — o servidor guarda só o código. */
export async function enviarHistoricoClientes(itens: ClienteDoCsv[]): Promise<RespostaHistorico> {
  let gravados = 0;
  let com_codigo = 0;
  for (let i = 0; i < itens.length; i += 500) {
    const r = (await chamar<RespostaHistorico>('historico', { itens: itens.slice(i, i + 500) })) as RespostaHistorico;
    if (!r.ok) return r;
    gravados += r.gravados;
    com_codigo += r.com_codigo;
  }
  return { ok: true, gravados, com_codigo };
}

/**
 * Painel do Vendedor: o alerta dos pedidos dele. A comparação com os
 * pedidos dos outros vendedores é feita no banco (alertas_vendedor), que
 * devolve deles só número, etapa e data.
 */
export async function alertasDoVendedor(): Promise<Map<string, AlertaCliente>> {
  const mapa = new Map<string, AlertaCliente>();
  if (!supabase) return mapa;
  const { data, error } = await supabase.rpc('alertas_vendedor');
  if (error || !Array.isArray(data)) return mapa;
  type Linha = {
    pedido_id: string;
    outro_numero: number | null;
    outro_status: string | null;
    outro_data: string;
    por: string;
    outro_cpf?: boolean;
  };
  const porPedido = new Map<string, { outros: AlertaCliente['outros']; por: 'cpf' | 'telefone' }>();
  for (const r of data as Linha[]) {
    const g = porPedido.get(r.pedido_id) ?? { outros: [], por: 'telefone' };
    g.outros.push({ status: r.outro_status, internal_id: r.outro_numero, data: String(r.outro_data), outroCpf: r.outro_cpf === true });
    if (r.por === 'cpf') g.por = 'cpf';
    porPedido.set(r.pedido_id, g);
  }
  for (const [id, g] of porPedido) {
    const nivel = nivelDoAlerta(g.outros);
    if (nivel) mapa.set(id, { nivel, por: g.por, outros: g.outros.sort((a, b) => b.data.localeCompare(a.data)) });
  }
  return mapa;
}
