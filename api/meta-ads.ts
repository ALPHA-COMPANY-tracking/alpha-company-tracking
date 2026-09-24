// ─────────────────────────────────────────────────────────────
// Integração Facebook: contas de anúncio, configuração e gasto.
//
//   POST /api/meta-ads                    sincroniza hoje e ontem
//   POST /api/meta-ads?dias=3             os últimos 3 dias
//   POST /api/meta-ads?desde=…&ate=…&simular=1
//        só mostra, não grava (para comparar com o BlueSales)
//   POST /api/meta-ads?acao=contas        lista as contas que o token enxerga
//                                         + a configuração salva
//   POST /api/meta-ads?acao=salvar        grava a configuração (corpo JSON:
//        { contas?: string[], cotacao_usd?: number, imposto_brl_pct?: number })
//
// Quem pode chamar: o agendamento do GitHub (Bearer CRON_TOKEN), o dono
// logado no app ou um sócio ligado à conta (Bearer <sessão do Supabase>).
//
// A configuração mora na tabela meta_integracao (migração 0019), editada
// na tela Integração Facebook. Sem ela, valem as variáveis da Vercel:
//   META_ACCESS_TOKEN     token do usuário do sistema (ads_read) — sempre aqui
//   META_AD_ACCOUNT_IDS   contas, separadas por vírgula
//   META_COTACAO          cotação do dólar (padrão R$ 5,40 do BlueSales; "ptax")
//
// Sem imports estáticos de módulos locais: eles derrubam a função
// nesta hospedagem (ver api/resumo-dia.ts).
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function numeroOuNulo(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ConfigSalva {
  contas: string[];
  cotacao_usd: number;
  imposto_brl_pct: number;
}

/** Configuração da tela. null = ainda não salva; 'sem-tabela' = migração 0019 não rodada. */
async function lerConfig(db: SupabaseClient, userId: string): Promise<ConfigSalva | null | 'sem-tabela'> {
  const { data, error } = await db
    .from('meta_integracao')
    .select('contas,cotacao_usd,imposto_brl_pct')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return 'sem-tabela';
  if (!data) return null;
  return {
    contas: Array.isArray(data.contas) ? data.contas.map(String) : [],
    cotacao_usd: Number(data.cotacao_usd),
    imposto_brl_pct: Number(data.imposto_brl_pct),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = process.env.DASHBOARD_USER_ID;
    if (!userId) return res.status(200).json({ ok: false, aviso: 'DASHBOARD_USER_ID não configurado.' });

    const [{ createClient }, meta] = await Promise.all([import('@supabase/supabase-js'), import('./lib-meta.js')]);
    const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    });

    // Autorização: o agendamento, o dono ou um sócio.
    const enviado = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    const cron = process.env.CRON_TOKEN;
    let autorizado = Boolean(cron) && enviado === cron;
    if (!autorizado && enviado) {
      const { data } = await db.auth.getUser(enviado);
      const quem = data.user?.id;
      autorizado = quem === userId;
      if (!autorizado && quem) {
        const { data: membro } = await db
          .from('dashboard_membros')
          .select('dono_id')
          .eq('membro_id', quem)
          .eq('dono_id', userId)
          .maybeSingle();
        autorizado = Boolean(membro);
      }
    }
    if (!autorizado) return res.status(401).json({ error: 'Não autorizado' });

    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
    const acao = q('acao');
    const salva = await lerConfig(db, userId);
    const semTabela = salva === 'sem-tabela';
    const config = semTabela ? null : salva;

    // ── Salvar a configuração da tela ──
    if (acao === 'salvar') {
      if (semTabela) return res.status(200).json({ ok: false, aviso: 'Rode a migração 0019 no Supabase antes de salvar.' });
      const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>;
      const nova: ConfigSalva = {
        contas: config?.contas ?? [],
        cotacao_usd: config?.cotacao_usd ?? meta.COTACAO_BLUESALES,
        imposto_brl_pct: config?.imposto_brl_pct ?? meta.IMPOSTO_BRL_PADRAO,
      };
      if (Array.isArray(corpo.contas)) nova.contas = [...new Set(corpo.contas.map((c) => meta.normalizarConta(String(c))).filter(Boolean))];
      if (corpo.cotacao_usd !== undefined) {
        const c = numeroOuNulo(corpo.cotacao_usd);
        if (!c || c > 50) return res.status(200).json({ ok: false, aviso: 'Taxa do dólar inválida.' });
        nova.cotacao_usd = c;
      }
      if (corpo.imposto_brl_pct !== undefined) {
        const i = Number(String(corpo.imposto_brl_pct).replace(',', '.'));
        if (!Number.isFinite(i) || i < 0 || i > 100) return res.status(200).json({ ok: false, aviso: 'Imposto inválido.' });
        nova.imposto_brl_pct = i;
      }
      const { error } = await db
        .from('meta_integracao')
        .upsert({ user_id: userId, ...nova, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) return res.status(200).json({ ok: false, aviso: 'Banco: ' + error.message });
      return res.status(200).json({ ok: true, config: nova });
    }

    // Token: colar na Vercel às vezes traz espaço, aspas ou "Bearer".
    const token = (process.env.META_ACCESS_TOKEN ?? '').replace(/["'\s]/g, '').replace(/^Bearer/i, '');
    if (!token || !token.startsWith('EAA')) {
      return res.status(200).json({
        ok: false,
        configurado: false,
        aviso: !token
          ? 'META_ACCESS_TOKEN não chegou (confira o nome e se está em Production)'
          : `o valor de META_ACCESS_TOKEN não parece um token do Meta (tem ${token.length} caracteres e não começa com "EAA"). Gere de novo em Usuários do sistema → Gerar novo token e cole o texto inteiro`,
      });
    }

    // Configuração que vale agora: a da tela; sem ela, a da Vercel.
    const cotacaoEnv = process.env.META_COTACAO?.trim().toLowerCase();
    const efetiva = {
      contas: config
        ? config.contas
        : (process.env.META_AD_ACCOUNT_IDS ?? '').split(/[\s,;]+/).map(meta.normalizarConta).filter(Boolean),
      cotacao_usd: config ? config.cotacao_usd : cotacaoEnv === 'ptax' ? null : (numeroOuNulo(cotacaoEnv) ?? meta.COTACAO_BLUESALES),
      imposto_brl_pct: config ? config.imposto_brl_pct : meta.IMPOSTO_BRL_PADRAO,
    };
    const versao = process.env.META_API_VERSION || undefined;

    // ── Listar as contas de anúncio ──
    if (acao === 'contas') {
      const contas = await meta.buscarContas({ fetch: (url) => fetch(url), token, versao });
      return res.status(200).json({ ok: true, contas, config: efetiva, salva: Boolean(config), migracao: !semTabela });
    }

    // ── Sincronizar o gasto ──
    if (efetiva.contas.length === 0) {
      // Sem conta marcada não se grava nada: zerar o gasto por engano é pior.
      return res.status(200).json({ ok: false, aviso: 'Nenhuma conta de anúncio marcada na Integração Facebook.' });
    }

    const hoje = meta.hojeSP();
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
      contas: efetiva.contas,
      desde,
      ate,
      versao,
      cotacaoFixa: efetiva.cotacao_usd,
      acrescimoPct: numeroOuNulo(process.env.META_ACRESCIMO_PCT) ?? 0,
      impostoBrlPct: efetiva.imposto_brl_pct,
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
        // Migração 0018 ainda não rodada: grava só o valor.
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
