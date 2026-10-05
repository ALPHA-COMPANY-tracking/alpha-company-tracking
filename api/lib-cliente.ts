// ─────────────────────────────────────────────────────────────
// Reconhecer a mesma cliente em pedidos diferentes — para o alerta de
// pedido duplicado e de cliente que já roubou / frustrou.
//
// O CPF e o WhatsApp NÃO são guardados. Vira um código (HMAC-SHA256 com
// a chave CLIENTE_HASH_KEY, que fica só na Vercel): o mesmo CPF dá sempre
// o mesmo código, mas do código não dá para voltar ao CPF sem a chave.
// A chave não pode mudar nunca — com outra chave, nenhum código antigo
// casa mais.
//
// Importar com import() dinâmico (ver api/resumo-dia.ts).
// ─────────────────────────────────────────────────────────────

import { createHmac } from 'node:crypto';

export interface CodigosCliente {
  cpf_hash?: string;
  tel_hash?: string;
}

/** Só os dígitos do CPF (11) ou CNPJ (14); o resto → null. */
export function normalizarCpf(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 11 || d.length === 14 ? d : null;
}

/**
 * Telefone → DDD + os 8 últimos dígitos. "+55 (11) 9 9876-5432",
 * "11998765432" e "1198765432" (sem o 9) viram o mesmo "1198765432".
 */
export function normalizarTelefone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  return d.slice(0, 2) + d.slice(-8);
}

function hmac(chave: string, tipo: string, valor: string): string {
  return createHmac('sha256', chave).update(`${tipo}:${valor}`).digest('hex').slice(0, 40);
}

/** Códigos a partir do CPF e do telefone já soltos (histórico do CSV, consulta). */
export function codigosDe(chave: string, cpf: unknown, telefone: unknown): CodigosCliente {
  const c = normalizarCpf(cpf);
  const t = normalizarTelefone(telefone);
  return {
    ...(c ? { cpf_hash: hmac(chave, 'cpf', c) } : {}),
    ...(t ? { tel_hash: hmac(chave, 'tel', t) } : {}),
  };
}

const CHAVES_CPF = ['document', 'cpf', 'documento', 'tax_id', 'cpf_cnpj', 'document_number'];
const CHAVES_TEL = ['phone', 'whatsapp', 'telefone', 'celular', 'mobile', 'cellphone', 'phone_number'];

/**
 * CPF e WhatsApp do bloco do cliente no payload do BlueSales (customer /
 * cliente / buyer…), já transformados em código.
 */
export function codigosDoPayload(chave: string, body: Record<string, unknown>): CodigosCliente {
  /** Valor da primeira chave da lista que existir no bloco (sem ligar para maiúscula). */
  const achar = (b: Record<string, unknown>, lista: string[]): unknown => {
    const porNome = new Map(Object.keys(b).map((k) => [k.toLowerCase(), k]));
    for (const k of lista) {
      const real = porNome.get(k);
      if (real && b[real] != null && b[real] !== '') return b[real];
    }
    return undefined;
  };
  let cpf: unknown;
  let tel: unknown;
  for (const k of ['customer', 'cliente', 'buyer', 'comprador']) {
    const b = body[k];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    cpf ??= achar(b as Record<string, unknown>, CHAVES_CPF);
    tel ??= achar(b as Record<string, unknown>, CHAVES_TEL);
  }
  return codigosDe(chave, cpf, tel);
}

// ── Alerta ──

export type NivelAlerta = 'roubo' | 'frustracao' | 'duplicado' | 'whatsapp' | 'recompra';

const ROUBO = /roub|furt/;
const FRUSTRACAO = /frustr|devol|voltand|retorn|extravi|sinistr|recus|cancel/;
const PAGO = new Set(['pagos', 'pago']);

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Pedido ainda em aberto (nem pago, nem frustrado): dá tempo de segurar. */
export function statusEmAberto(status: unknown): boolean {
  const s = norm(status);
  return !!s && !PAGO.has(s) && !ROUBO.test(s) && !FRUSTRACAO.test(s);
}

/**
 * O que os OUTROS pedidos dizem sobre um pedido novo, do mais grave para
 * o mais leve: já roubou > já frustrou > tem pedido em aberto (duplicado)
 * > mesmo WhatsApp com outro CPF > já comprou e pagou (recompra). Roubo e
 * frustração valem mesmo quando só o WhatsApp se repete (`outroCpf`).
 */
export function nivelDoAlerta(outros: { status: string | null; outroCpf?: boolean }[]): NivelAlerta | null {
  const st = outros.map((o) => norm(o.status));
  if (st.some((s) => ROUBO.test(s))) return 'roubo';
  if (st.some((s) => FRUSTRACAO.test(s))) return 'frustracao';
  if (outros.some((o, i) => !o.outroCpf && st[i] && !PAGO.has(st[i]))) return 'duplicado';
  if (outros.some((o) => o.outroCpf)) return 'whatsapp';
  if (st.length) return 'recompra';
  return null;
}

/** Frase curta para a notificação do celular. */
export function textoDoAlerta(
  nivel: NivelAlerta,
  outros: { internal_id?: unknown; status: string | null; data?: unknown; outroCpf?: boolean }[],
): string {
  const ref = (filtro: (s: string, outroCpf: boolean) => boolean) => {
    const o = outros.find((x) => filtro(norm(x.status), Boolean(x.outroCpf)));
    if (!o) return '';
    const [, m, d] = String(o.data ?? '').split('-');
    return ` no #${o.internal_id ?? '?'}${d ? ` (${d}/${m})` : ''}`;
  };
  if (nivel === 'roubo') return `🚨 Cliente com ROUBO${ref((s) => ROUBO.test(s))} — confirme antes de enviar.`;
  if (nivel === 'frustracao') return `⚠️ Cliente já frustrou${ref((s) => FRUSTRACAO.test(s))} — confirme antes de enviar.`;
  if (nivel === 'duplicado') {
    return `⚠️ Possível pedido DUPLICADO: a cliente já tem pedido em aberto${ref((s, outro) => !outro && !!s && !PAGO.has(s))}.`;
  }
  if (nivel === 'whatsapp') return `⚠️ Mesmo WhatsApp de outra cliente (outro CPF)${ref((_s, outro) => outro)} — confirme quem é.`;
  return `Cliente já comprou e pagou${ref((s) => PAGO.has(s))} (recompra).`;
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
