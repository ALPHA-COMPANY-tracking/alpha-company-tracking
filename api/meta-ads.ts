// ─────────────────────────────────────────────────────────────
// Sincroniza o gasto do Meta Ads com a dashboard.
//
//   POST /api/meta-ads                → hoje e ontem (padrão)
//   POST /api/meta-ads?dias=3         → os últimos 3 dias
//   POST /api/meta-ads?desde=2026-09-16&ate=2026-09-21&simular=1
//        → só mostra, não grava (para comparar com o BlueSales)
//
// Quem pode chamar: o agendamento do GitHub (Bearer CRON_TOKEN) ou o
// próprio Jonas logado no app (Bearer <token da sessão do Supabase>).
//
// Configuração (variáveis na Vercel):
//   META_ACCESS_TOKEN     token de usuário do sistema, permissão ads_read
//   META_AD_ACCOUNT_IDS   contas de anúncio separadas por vírgula (act_… ou só o número)
//   META_COTACAO          opcional: cotação fixa do dólar (senão, PTAX do dia)
//   META_ACRESCIMO_PCT    opcional: % sobre a cotação (ex.: IOF)
//
// Sem imports estáticos de módulos locais: eles derrubam a função
// nesta hospedagem (ver api/resumo-dia.ts).
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function numeroOuNulo(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = process.env.DASHBOARD_USER_ID;
    if (!userId) return res.status(200).json({ ok: false, aviso: 'DASHBOARD_USER_ID não configurado.' });

    const [{ createClient }, meta] = await Promise.all([import('@supabase/supabase-js'), import('./lib-meta.js')]);
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    // Autorização: o agendamento ou o dono da dashboard logado.
    const enviado = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    const cron = process.env.CRON_TOKEN;
    let autorizado = Boolean(cron) && enviado === cron;
    if (!autorizado && enviado) {
      const { data } = await db.auth.getUser(enviado);
      autorizado = data.user?.id === userId;
    }
    if (!autorizado) return res.status(401).json({ error: 'Não autorizado' });

    const token = process.env.META_ACCESS_TOKEN?.trim();
    const contas = (process.env.META_AD_ACCOUNT_IDS ?? '')
      .split(/[\s,;]+/)
      .map(meta.normalizarConta)
      .filter(Boolean);
    if (!token || contas.length === 0) {
      return res.status(200).json({
        ok: false,
        configurado: false,
        aviso: 'Falta configurar META_ACCESS_TOKEN e META_AD_ACCOUNT_IDS na Vercel.',
      });
    }

    // Período: por padrão hoje e ontem (o Meta ainda ajusta o dia anterior).
    const hoje = meta.hojeSP();
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
    const dias = Math.min(Math.max(Math.floor(Number(q('dias') ?? 2)) || 2, 1), 62);
    const ate = q('ate') && DATA.test(q('ate')!) ? q('ate')! : hoje;
    const desde = q('desde') && DATA.test(q('desde')!) ? q('desde')! : meta.somarDias(ate, -(dias - 1));
    if (desde > ate || meta.diasEntre(desde, ate).length > 62) {
      return res.status(400).json({ ok: false, aviso: 'Período inválido (máximo de 62 dias).' });
    }
    const simular = q('simular') === '1';

    const gasto = await meta.gastoMetaPorDia({
      fetch: (url) => fetch(url),
      token,
      contas,
      desde,
      ate,
      versao: process.env.META_API_VERSION || undefined,
      cotacaoFixa: numeroOuNulo(process.env.META_COTACAO),
      acrescimoPct: numeroOuNulo(process.env.META_ACRESCIMO_PCT) ?? 0,
    });

    // O que a dashboard tem hoje nesses dias — para a comparação.
    const { data: atuais } = await db
      .from('afterpay_daily')
      .select('data,investimento_ads')
      .eq('user_id', userId)
      .gte('data', desde)
      .lte('data', ate);
    const atual = new Map((atuais ?? []).map((d) => [String(d.data), Number(d.investimento_ads) || 0]));

    if (!simular) {
      const agora = new Date().toISOString();
      const linhas = gasto.map((d) => ({
        user_id: userId,
        data: d.data,
        investimento_ads: d.reais,
        ads_origem: 'meta',
        ads_detalhe: d.partes,
        ads_sincronizado_em: agora,
        sincronizado_em: agora,
      }));
      // Só as colunas enviadas mudam: taxa, leads e o resto do dia ficam.
      let { error } = await db.from('afterpay_daily').upsert(linhas, { onConflict: 'user_id,data' });
      if (error && /ads_(origem|detalhe|sincronizado_em)/.test(error.message)) {
        // Migração 0017 ainda não rodada: grava só o valor.
        ({ error } = await db
          .from('afterpay_daily')
          .upsert(
            linhas.map(({ user_id, data, investimento_ads, sincronizado_em }) => ({ user_id, data, investimento_ads, sincronizado_em })),
            { onConflict: 'user_id,data' },
          ));
      }
      if (error) return res.status(200).json({ ok: false, aviso: 'Banco: ' + error.message });
    }

    return res.status(200).json({
      ok: true,
      simulado: simular,
      desde,
      ate,
      dias: gasto.map((d) => ({ ...d, na_dashboard: atual.get(d.data) ?? 0 })),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, aviso: e instanceof Error ? e.message : String(e) });
  }
}
