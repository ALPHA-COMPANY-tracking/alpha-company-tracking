// ─────────────────────────────────────────────────────────────
// Notificação com o resumo do dia (parcial ou fechamento).
// Chamado por agendamento (GitHub Actions) — protegido por token.
//
//   POST /api/resumo-dia?tipo=parcial|final
//   Authorization: Bearer <CRON_TOKEN>
//
// Sem imports estáticos de módulos locais: eles derrubam a função
// nesta hospedagem (ver server/push.ts).
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const esperado = process.env.CRON_TOKEN;
    if (esperado) {
      const enviado = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
      if (enviado !== esperado) return res.status(401).json({ error: 'Não autorizado' });
    }

    const userId = process.env.DASHBOARD_USER_ID;
    const publica = process.env.VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!userId) return res.status(200).json({ ok: false, aviso: 'DASHBOARD_USER_ID não configurado.' });
    if (!publica || !privada) return res.status(200).json({ ok: false, aviso: 'Chaves de push não configuradas.' });

    const final = String(req.query.tipo ?? 'parcial') === 'final';

    const [{ createClient }, { hojeSP, montarResumo, avisoDoResumo }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('./lib-resumo'),
    ]);

    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    const dia = hojeSP();

    // Pedidos que podem entrar no dia: criados hoje OU pagos hoje.
    const { data: pedidos, error: erroPedidos } = await db
      .from('bluesales_pedidos')
      .select('status,data,data_aprovacao,valor,valor_agendado,produto_plano,vendedor')
      .eq('user_id', userId)
      .or(`data.eq.${dia},data_aprovacao.eq.${dia}`);
    if (erroPedidos) return res.status(200).json({ ok: false, aviso: 'Banco: ' + erroPedidos.message });

    // Ads e taxa do dia (lançados na tela de Marketing).
    const { data: diario } = await db
      .from('afterpay_daily')
      .select('investimento_ads,taxas_plataforma')
      .eq('user_id', userId)
      .eq('data', dia)
      .maybeSingle();

    const resumo = montarResumo(
      dia,
      pedidos ?? [],
      Number(diario?.investimento_ads ?? 0),
      Number(diario?.taxas_plataforma ?? 0),
    );

    // Nada aconteceu no dia: não vale acordar o celular.
    if (resumo.qtd_agendados === 0 && resumo.qtd_pagamentos === 0 && !final) {
      return res.status(200).json({ ok: true, enviados: 0, pulado: 'dia sem movimento', resumo });
    }

    const aviso = avisoDoResumo(resumo, final);

    const { data: inscritos } = await db
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('user_id', userId);
    if (!inscritos?.length) return res.status(200).json({ ok: false, aviso: 'Nenhum aparelho inscrito.', resumo });

    const mod = await import('web-push');
    const webpush = ((mod as unknown as { default?: unknown }).default ?? mod) as {
      setVapidDetails: (s: string, pub: string, priv: string) => void;
      sendNotification: (sub: unknown, payload: string) => Promise<unknown>;
    };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@ajalpha.com', publica, privada);

    const carga = JSON.stringify({ ...aviso, url: '/' });
    let enviados = 0;
    for (const s of inscritos) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          carga,
        );
        enviados++;
      } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint as string);
        }
      }
    }

    return res.status(200).json({ ok: enviados > 0, enviados, resumo, aviso });
  } catch (e) {
    return res.status(200).json({ ok: false, aviso: 'Erro: ' + (e instanceof Error ? e.message : String(e)) });
  }
}
