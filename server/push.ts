// ─────────────────────────────────────────────────────────────
// Envio das notificações. Usado pelo webhook quando um pedido é
// criado ou pago. Nunca lança: se o push falhar, o pedido já foi
// gravado e é isso que importa.
//
// Env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `web-push` é CommonJS: importar no topo derrubava a função inteira na
 * Vercel (o webhook passou a responder 500 e os pedidos pararam de
 * entrar). Carregamos sob demanda e só dentro do try do envio.
 */
async function libWebPush() {
  const mod = await import('web-push');
  return ((mod as unknown as { default?: unknown }).default ?? mod) as {
    setVapidDetails: (s: string, pub: string, priv: string) => void;
    sendNotification: (sub: unknown, payload: string) => Promise<unknown>;
  };
}

export interface Aviso {
  titulo: string;
  corpo: string;
  tag?: string;
  url?: string;
}

/** Valor em reais → "R$ 735,00". */
export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Monta o aviso do evento, ou null se o evento não merece notificação. */
export function avisoDoEvento(
  evento: string,
  status: string,
  vendedor: string | null,
  valor: number,
): Aviso | null {
  const nome = (vendedor ?? '').trim() || 'Sem atendente';
  const st = (status ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (st === 'pagos' || st === 'pago') {
    return {
      titulo: `💰 Pagamento aprovado · ${brl(valor)}`,
      corpo: `${nome} recebeu o pagamento. O lucro do dia já foi atualizado.`,
      tag: 'pago',
    };
  }
  if (evento === 'ORDER_CREATE') {
    return {
      titulo: `🗓️ Novo agendamento · ${brl(valor)}`,
      corpo: `${nome} acabou de agendar um pedido.`,
      tag: 'agendado',
    };
  }
  return null; // envio, cobrança etc. não viram notificação
}

/** Dispara o aviso para todos os aparelhos inscritos. */
export async function enviarPush(db: SupabaseClient, userId: string, aviso: Aviso): Promise<number> {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return 0; // push não configurado ainda

  const { data } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', userId);
  if (!data?.length) return 0;

  const webpush = await libWebPush();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@ajalpha.com', publica, privada);

  const carga = JSON.stringify({ ...aviso, url: aviso.url ?? '/' });
  let enviados = 0;

  await Promise.all(
    data.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          carga,
        );
        enviados++;
      } catch (e) {
        // 404/410 = aparelho desinstalou o app ou revogou: limpa o registro.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint as string);
        }
      }
    }),
  );

  return enviados;
}
