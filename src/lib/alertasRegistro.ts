// ─────────────────────────────────────────────────────────────
// Registro de alertas de clientes (tabela alertas_clientes, migração 0024).
//
// Quem grava é o servidor, sozinho, a cada pedido que chega do BlueSales.
// A dashboard aberta completa o que faltar — alertas de pedidos que já
// existiam antes do registro, ou que só o nome liga — com a mesma regra:
// um registro por pedido, que só piora, nunca é rebaixado.
// ─────────────────────────────────────────────────────────────

import type { Pedido } from '@/types';
import { supabase } from '@/lib/supabase';
import { type AlertaCliente, GRAVIDADE, type NivelAlerta, ROTULO_ALERTA, motivoDoAlerta } from '@/lib/clientes';

export type NivelRegistrado = Exclude<NivelAlerta, 'recompra'>;

export interface AlertaRegistrado {
  id: number;
  pedido_id: string;
  pedido_numero: number | null;
  nivel: NivelRegistrado;
  por: string | null;
  outros: { numero: number | null; status: string | null; data: string; outro_cpf?: boolean }[];
  texto: string | null;
  criado_em: string;
  atualizado_em: string;
  visto_em: string | null;
}

/** null = a tabela ainda não existe (migração 0024 não rodada). */
export async function carregarRegistro(): Promise<AlertaRegistrado[] | null> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('alertas_clientes')
    .select('id,pedido_id,pedido_numero,nivel,por,outros,texto,criado_em,atualizado_em,visto_em')
    .order('criado_em', { ascending: false })
    .limit(500);
  if (error) return null;
  return (data ?? []) as AlertaRegistrado[];
}

export async function marcarVistos(ids: number[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  await supabase.from('alertas_clientes').update({ visto_em: new Date().toISOString() }).in('id', ids);
}

/**
 * Alertas que a dashboard achou e o registro ainda não tem (ou tem mais
 * leve). Recompra não é alerta e não é registrada.
 */
export function alertasFaltantes(
  calculados: Map<string, AlertaCliente>,
  registro: AlertaRegistrado[],
): [string, AlertaCliente & { nivel: NivelRegistrado }][] {
  const porPedido = new Map(registro.map((r) => [r.pedido_id, r]));
  const faltam: [string, AlertaCliente & { nivel: NivelRegistrado }][] = [];
  for (const [id, a] of calculados) {
    if (a.nivel === 'recompra') continue;
    const r = porPedido.get(id);
    if (!r || GRAVIDADE[a.nivel] < GRAVIDADE[r.nivel]) faltam.push([id, a as AlertaCliente & { nivel: NivelRegistrado }]);
  }
  return faltam;
}

/** Grava pela mesma função do servidor (registrar_alerta_cliente). */
export async function registrar(conta: string, pedido: Pedido, a: AlertaCliente & { nivel: NivelRegistrado }): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('registrar_alerta_cliente', {
    conta,
    pedido: pedido.id,
    numero: pedido.internal_id ?? null,
    nivel_novo: a.nivel,
    por_onde: a.por,
    outros_pedidos: a.outros.map((o) => ({ numero: o.internal_id ?? null, status: o.status, data: o.data, outro_cpf: !!o.outroCpf })),
    texto_alerta: `${ROTULO_ALERTA[a.nivel]} — ${motivoDoAlerta(a)}`,
  });
}
