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
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

// Criado sob demanda: importar este módulo (nos testes) não deve exigir
// as variáveis de ambiente do servidor.
let _db: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!_db) {
    _db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });
  }
  return _db;
}

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

/** Aceita número (735) ou texto ('R$ 1.234,56' / '1234.56') → número. */
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  // tira moeda/espaços; se tiver vírgula decimal (pt-BR), remove pontos de milhar
  const limpo = v.replace(/[^\d,.-]/g, '');
  const norm = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/** Primeiro valor não-vazio entre as chaves informadas. */
function pick(obj: Record<string, unknown>, ...chaves: string[]): unknown {
  for (const k of chaves) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** Texto limpo, ou undefined se vazio. */
function txt(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s ? s : undefined;
}

/** Remove os dados pessoais do cliente antes de guardar o log (LGPD). */
export function semDadosPessoais(body: Record<string, unknown>): Record<string, unknown> {
  const { customer: _c, cliente: _cl, ...resto } = body;
  return resto;
}

/**
 * Traduz o payload do BlueSales para a linha de `bluesales_pedidos`.
 * O BlueSales manda as chaves em INGLÊS (order/payment/product/seller/
 * shipping); aceitamos também os nomes em português por segurança.
 * Retorna null quando o evento não traz o id do pedido.
 *
 * Só inclui os campos que vierem preenchidos: eventos de mudança de status
 * às vezes chegam sem pagamento/produto, e sobrescrever apagaria o que já
 * está salvo.
 */
export function mapearPedido(
  body: Record<string, unknown>,
  userId: string,
): Record<string, unknown> | null {
  const order = (body.order ?? body.pedido ?? {}) as Record<string, unknown>;
  const produto = (body.product ?? body.produto ?? {}) as Record<string, unknown>;
  const pagamento = (body.payment ?? body.pagamento ?? {}) as Record<string, unknown>;
  const envio = (body.shipping ?? body.envio ?? {}) as Record<string, unknown>;
  const vendedor = (body.seller ?? body.vendedor ?? {}) as Record<string, unknown>;

  if (!order.id) return null;

  const pedido: Record<string, unknown> = {
    id: String(order.id),
    user_id: userId,
    status: order.status ?? null,
    atualizado_em: new Date().toISOString(),
  };
  if (order.internal_id != null) pedido.internal_id = order.internal_id;
  if (order.created_at) pedido.data = dataSP(order.created_at);

  // valor = líquido (cobrado); valor_bruto = cheio (antes do desconto)
  const v = num(pick(pagamento, 'amount', 'valor', 'value') ?? pick(produto, 'price', 'preço', 'preco'));
  if (v > 0) pedido.valor = v;
  const vb = num(
    pick(pagamento, 'gross_amount', 'valor_bruto', 'amount', 'valor') ?? pick(produto, 'price', 'preço', 'preco'),
  );
  if (vb > 0) pedido.valor_bruto = vb;

  const nome = txt(pick(produto, 'name', 'nome'));
  if (nome) pedido.produto_nome = nome;
  const plano = txt(pick(produto, 'plan', 'plano'));
  if (plano) pedido.produto_plano = plano;
  const codPlano = txt(pick(produto, 'plan_code', 'código_do_plano', 'codigo_do_plano'));
  if (codPlano) pedido.codigo_plano = codPlano;
  const metodo = txt(pick(pagamento, 'method', 'método', 'metodo', 'label'));
  if (metodo) pedido.metodo_pagamento = metodo;
  const vend = txt(pick(vendedor, 'name', 'nome'));
  if (vend) pedido.vendedor = vend;
  const rastreio = txt(pick(envio, 'tracking_code', 'código_de_rastreamento', 'codigo_de_rastreamento'));
  if (rastreio) pedido.rastreamento = rastreio;

  return pedido;
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

  // Log bruto SEM dados pessoais do cliente (LGPD): nome, e-mail, telefone,
  // CPF e endereço nunca são guardados.
  await supabase()
    .from('webhook_logs')
    .insert({
      user_id: userId,
      evento: body.event ?? null,
      payload: semDadosPessoais(body as Record<string, unknown>),
      processado: false,
    })
    .then(() => undefined, () => undefined);

  const pedido = mapearPedido(body as Record<string, unknown>, userId);
  if (!pedido) {
    return res.status(200).json({ ok: true, ignorado: 'sem order.id' });
  }

  const { error } = await supabase()
    .from('bluesales_pedidos')
    .upsert(pedido, { onConflict: 'user_id,id' });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Notificação no celular. TUDO aqui é opcional: o pedido já está
  // gravado, e nenhuma falha de push pode transformar isso num erro.
  // Por isso o módulo é carregado sob demanda, dentro do try.
  let notificados = 0;
  try {
    const { avisoDoEvento, enviarPush } = await import('../server/push');
    const aviso = avisoDoEvento(
      String(body.event ?? ''),
      String(pedido.status ?? ''),
      (pedido.vendedor as string) ?? null,
      Number(pedido.valor ?? pedido.valor_agendado ?? 0),
    );
    if (aviso) notificados = await enviarPush(supabase(), userId, aviso);
  } catch {
    notificados = 0;
  }

  return res.status(200).json({ ok: true, id: pedido.id, status: pedido.status, notificados });
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
