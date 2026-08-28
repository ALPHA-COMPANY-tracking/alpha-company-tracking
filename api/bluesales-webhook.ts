// ─────────────────────────────────────────────────────────────
// Receptor do webhook do BlueSales (Vercel Serverless Function).
// Recebe cada evento de pedido e espelha em bluesales_pedidos,
// atualizando pela chave (user_id, id) — sem contar 2x quando o
// pedido muda de status. NÃO guarda dados pessoais do cliente.
//
// Env vars (definir na Vercel):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (server-side, secreta)
//   DASHBOARD_USER_ID    (uuid do usuário dono dos pedidos)
//   BLUESALES_WEBHOOK_TOKEN  (token que o BlueSales manda no header Authorization)
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);

/** 'Thu Aug 27 2026 18:03:56 GMT+0000 (...)' → 'YYYY-MM-DD' no fuso de SP. */
function dataSP(raw: unknown): string {
  const limpo = String(raw ?? '').replace(/\s*\(.*\)\s*$/, '');
  const d = new Date(limpo);
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Validação do token (se configurado)
  const token = process.env.BLUESALES_WEBHOOK_TOKEN;
  if (token) {
    const auth = String(req.headers['authorization'] ?? '');
    const enviado = auth.replace(/^Bearer\s+/i, '').trim();
    if (enviado !== token) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
  }

  const userId = process.env.DASHBOARD_USER_ID;
  if (!userId) {
    return res.status(500).json({ error: 'DASHBOARD_USER_ID não configurado' });
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) ?? {};
  const order = body.order ?? {};
  const produto = body.produto ?? {};
  const pagamento = body.pagamento ?? {};
  const envio = body.envio ?? {};
  const vendedor = body.vendedor ?? {};

  // Log bruto (ajuda a depurar / auditar)
  await supabase
    .from('webhook_logs')
    .insert({ user_id: userId, evento: body.event ?? null, payload: body, processado: false })
    .then(() => undefined, () => undefined);

  if (!order.id) {
    return res.status(200).json({ ok: true, ignorado: 'sem order.id' });
  }

  // IMPORTANTE: eventos de mudança de status às vezes vêm SEM os dados de
  // pagamento/produto. Só gravamos os campos que vierem preenchidos, para
  // não apagar (zerar) o valor/produto que já está salvo.
  const pedido: Record<string, unknown> = {
    id: String(order.id),
    user_id: userId,
    status: order.status ?? null,
    atualizado_em: new Date().toISOString(),
  };
  if (order.internal_id != null) pedido.internal_id = order.internal_id;
  if (order.created_at) pedido.data = dataSP(order.created_at);
  const v = num(pagamento.valor ?? produto['preço']);
  if (v > 0) pedido.valor = v;
  const vb = num(pagamento.valor_bruto ?? pagamento.valor ?? produto['preço']);
  if (vb > 0) pedido.valor_bruto = vb;
  if (produto.nome) pedido.produto_nome = produto.nome;
  if (produto.plano) pedido.produto_plano = produto.plano;
  if (produto['código_do_plano']) pedido.codigo_plano = produto['código_do_plano'];
  if (pagamento['método']) pedido.metodo_pagamento = pagamento['método'];
  if (vendedor.nome) pedido.vendedor = vendedor.nome;
  if (envio['código_de_rastreamento']) pedido.rastreamento = envio['código_de_rastreamento'];

  const { error } = await supabase
    .from('bluesales_pedidos')
    .upsert(pedido, { onConflict: 'user_id,id' });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, id: pedido.id, status: pedido.status });
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
