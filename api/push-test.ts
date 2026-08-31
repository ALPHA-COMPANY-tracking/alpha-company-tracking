// ─────────────────────────────────────────────────────────────
// Dispara uma notificação de teste para os aparelhos inscritos.
// Autossuficiente de propósito: sem imports de módulos locais, que
// já derrubaram funções nesta hospedagem. Em caso de erro, responde
// a mensagem em vez de estourar, para dar para diagnosticar.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const userId = process.env.DASHBOARD_USER_ID;
    const publica = process.env.VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;

    if (!userId) return res.status(200).json({ ok: false, aviso: 'DASHBOARD_USER_ID não configurado.' });
    if (!publica || !privada) {
      return res.status(200).json({ ok: false, aviso: 'Chaves de notificação não configuradas na Vercel.' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    const { data, error } = await db
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('user_id', userId);

    if (error) return res.status(200).json({ ok: false, aviso: 'Banco: ' + error.message });
    if (!data?.length) {
      return res.status(200).json({
        ok: false,
        aviso: 'Nenhum aparelho inscrito. Ative as notificações neste aparelho primeiro.',
      });
    }

    const mod = await import('web-push');
    const webpush = ((mod as unknown as { default?: unknown }).default ?? mod) as {
      setVapidDetails: (s: string, pub: string, priv: string) => void;
      sendNotification: (sub: unknown, payload: string) => Promise<unknown>;
    };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@ajalpha.com', publica, privada);

    const hora = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 'agendado' e 'pago' simulam o aviso real, com o mesmo texto que o
    // webhook usa — serve para ver como fica antes de acontecer de verdade.
    const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {};
    const tipo = String(corpo.tipo ?? 'teste');
    const vendedor = String(corpo.vendedor ?? 'PETER');
    const valor = Number(corpo.valor ?? 735);

    let aviso = {
      titulo: '🔔 Notificação de teste',
      corpo: `Está tudo funcionando. Enviado às ${hora}.`,
      tag: 'teste',
    };
    if (tipo === 'agendado' || tipo === 'pago') {
      try {
        // Import sob demanda: estático de módulo local derruba a função aqui.
        const { avisoDoEvento } = await import('./lib-push');
        const real = avisoDoEvento(
          tipo === 'pago' ? 'ORDER_PAID' : 'ORDER_CREATE',
          tipo === 'pago' ? 'pagos' : 'cadastrados',
          vendedor,
          valor,
          typeof corpo.cliente === 'string' ? corpo.cliente : null,
        );
        if (real) aviso = { titulo: real.titulo, corpo: real.corpo, tag: real.tag ?? tipo };
      } catch {
        // Sem o módulo, manda o texto de teste mesmo — melhor que falhar.
      }
    }

    const carga = JSON.stringify({ ...aviso, url: '/' });

    let enviados = 0;
    const falhas: string[] = [];
    for (const s of data) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          carga,
        );
        enviados++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string };
        falhas.push(`${err.statusCode ?? '?'}: ${String(err.body ?? e).slice(0, 120)}`);
        // Inscrição morta: o aparelho desinstalou o app ou revogou.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint as string);
        }
      }
    }

    if (enviados === 0) {
      return res.status(200).json({ ok: false, aviso: 'Nenhum envio deu certo. ' + falhas.join(' | ') });
    }
    return res.status(200).json({ ok: true, enviados, falhas: falhas.length ? falhas : undefined });
  } catch (e) {
    return res.status(200).json({ ok: false, aviso: 'Erro: ' + (e instanceof Error ? e.message : String(e)) });
  }
}
