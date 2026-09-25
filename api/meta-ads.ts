// ─────────────────────────────────────────────────────────────
// Integração Facebook: cadastro de contas, configuração e gasto.
//
//   POST /api/meta-ads                    sincroniza os últimos 3 dias
//   POST /api/meta-ads?desde=2026-09-16   desde uma data (nunca antes de 16/09)
//   POST /api/meta-ads?desde=…&ate=…&simular=1
//        só mostra, não grava (para comparar com o BlueSales)
//   POST /api/meta-ads?acao=contas        o cadastro de contas + a configuração
//   POST /api/meta-ads?acao=salvar        grava a configuração (corpo JSON:
//        { contas?: string[], cotacao_usd?: number, imposto_brl_pct?: number })
//
// Cadastro de contas, como no BlueSales (corpo JSON):
//   acao=buscar      { bm_id, token?, ids }  nome/moeda/status de cada conta
//                    (ids vazio = todas as contas que o token enxerga)
//   acao=cadastrar   { bm_id, token?, ids }  busca de novo e cadastra; o token
//                    fica guardado para a BM
//   acao=manual      { id, nome?, moeda, bm_id? }
//   acao=remover     { id }                  sai do cadastro e da seleção
//   acao=redetectar                          atualiza nome, moeda e status
//
// Quem pode chamar: o agendamento do GitHub (Bearer CRON_TOKEN), o dono
// logado no app ou um sócio ligado à conta (Bearer <sessão do Supabase>).
//
// A configuração mora na tabela meta_integracao (migrações 0019 e 0020) e
// o token de cada BM em meta_bms, que só este servidor lê — a tela nunca
// recebe um token de volta. Sem BM importada vale o token da Vercel:
//   META_ACCESS_TOKEN     token do usuário do sistema (ads_read)
//   META_AD_ACCOUNT_IDS   contas, separadas por vírgula (antes da 0019)
//   META_COTACAO          cotação do dólar (padrão R$ 5,40 do BlueSales; "ptax")
//
// Sem imports estáticos de módulos locais: eles derrubam a função
// nesta hospedagem (ver api/resumo-dia.ts).
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContaCadastrada, ResultadoConta } from './lib-meta.js';

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

/**
 * Configuração da tela. config null = ainda não salva; cadastro null =
 * migração 0020 não rodada; 'sem-tabela' = nem a 0019.
 */
async function lerConfig(
  db: SupabaseClient,
  userId: string,
): Promise<{ config: ConfigSalva | null; cadastro: unknown[] | null } | 'sem-tabela'> {
  const com = await db
    .from('meta_integracao')
    .select('contas,cotacao_usd,imposto_brl_pct,cadastro')
    .eq('user_id', userId)
    .maybeSingle();
  let data = com.data as Record<string, unknown> | null;
  const temCadastro = !com.error;
  if (com.error) {
    const sem = await db.from('meta_integracao').select('contas,cotacao_usd,imposto_brl_pct').eq('user_id', userId).maybeSingle();
    if (sem.error) return 'sem-tabela';
    data = sem.data as Record<string, unknown> | null;
  }
  const cadastro = temCadastro ? (Array.isArray(data?.cadastro) ? (data.cadastro as unknown[]) : []) : null;
  if (!data) return { config: null, cadastro };
  return {
    config: {
      contas: Array.isArray(data.contas) ? data.contas.map(String) : [],
      cotacao_usd: Number(data.cotacao_usd),
      imposto_brl_pct: Number(data.imposto_brl_pct),
    },
    cadastro,
  };
}

/** Token de cada BM importada. Só o servidor lê esta tabela. */
async function lerTokensBm(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data, error } = await db.from('meta_bms').select('bm_id,token').eq('user_id', userId);
  if (error || !data) return new Map();
  return new Map(data.map((b) => [String(b.bm_id), String(b.token)]));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const aviso = (texto: string) => res.status(200).json({ ok: false, aviso: texto });
  try {
    const userId = process.env.DASHBOARD_USER_ID;
    if (!userId) return aviso('DASHBOARD_USER_ID não configurado.');

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
    const corpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>;
    const lido = await lerConfig(db, userId);
    const semTabela = lido === 'sem-tabela';
    const config = semTabela ? null : lido.config;
    let cadastro: ContaCadastrada[] | null = semTabela || lido.cadastro === null ? null : meta.lerCadastro(lido.cadastro);
    const tokensBm = cadastro ? await lerTokensBm(db, userId) : new Map<string, string>();

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
    const buscar = (url: string) => fetch(url);

    // Token da Vercel: vale para as contas sem BM importada.
    const tokenEnv = meta.limparToken(process.env.META_ACCESS_TOKEN);
    const tokenVercel = tokenEnv.startsWith('EAA') ? tokenEnv : null;
    const avisoVercel = !tokenEnv
      ? 'META_ACCESS_TOKEN não chegou (confira o nome e se está em Production)'
      : `o valor de META_ACCESS_TOKEN não parece um token do Meta (tem ${tokenEnv.length} caracteres e não começa com "EAA"). Gere de novo em Usuários do sistema → Gerar novo token e cole o texto inteiro`;

    /** O cadastro como a tela vê: sem token nenhum, só de onde ele vem. */
    const vista = (cad: ContaCadastrada[]) =>
      cad.map((c) => ({
        ...c,
        token: c.bm_id && tokensBm.has(c.bm_id) ? 'bm' : tokenVercel ? 'vercel' : 'falta',
      }));

    /** Grava cadastro e/ou seleção. Sem linha ainda, leva a seleção da Vercel junto. */
    const gravar = async (patch: { cadastro?: ContaCadastrada[]; contas?: string[] }) => {
      const { error } = await db
        .from('meta_integracao')
        .upsert(
          { user_id: userId, ...(config ? {} : { contas: efetiva.contas }), ...patch, atualizado_em: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      return error ? 'Banco: ' + error.message : null;
    };

    // ── Salvar a configuração da tela ──
    if (acao === 'salvar') {
      if (semTabela) return aviso('Rode a migração 0019 no Supabase antes de salvar.');
      const nova: ConfigSalva = {
        contas: config?.contas ?? [],
        cotacao_usd: config?.cotacao_usd ?? meta.COTACAO_BLUESALES,
        imposto_brl_pct: config?.imposto_brl_pct ?? meta.IMPOSTO_BRL_PADRAO,
      };
      if (Array.isArray(corpo.contas)) nova.contas = meta.lerIds(corpo.contas);
      if (corpo.cotacao_usd !== undefined) {
        const c = numeroOuNulo(corpo.cotacao_usd);
        if (!c || c > 50) return aviso('Taxa do dólar inválida.');
        nova.cotacao_usd = c;
      }
      if (corpo.imposto_brl_pct !== undefined) {
        const i = Number(String(corpo.imposto_brl_pct).replace(',', '.'));
        if (!Number.isFinite(i) || i < 0 || i > 100) return aviso('Imposto inválido.');
        nova.imposto_brl_pct = i;
      }
      const { error } = await db
        .from('meta_integracao')
        .upsert({ user_id: userId, ...nova, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) return aviso('Banco: ' + error.message);
      return res.status(200).json({ ok: true, config: nova });
    }

    // ── Cadastro de contas ──
    if (acao === 'buscar' || acao === 'cadastrar' || acao === 'manual' || acao === 'remover' || acao === 'redetectar') {
      if (!cadastro) return aviso('Rode a migração 0020 no Supabase para cadastrar contas.');

      if (acao === 'buscar' || acao === 'cadastrar') {
        const bm = String(corpo.bm_id ?? '').replace(/\D/g, '');
        if (!bm) return aviso('Informe o BM ID (só números).');
        const colado = meta.limparToken(corpo.token);
        if (colado && !colado.startsWith('EAA')) {
          return aviso(`Isso não parece um Access Token do Meta (tem ${colado.length} caracteres e não começa com "EAA").`);
        }
        const token = colado || tokensBm.get(bm) || tokenVercel;
        if (!token) return aviso('Cole o Access Token da BM.');
        const ids = meta.lerIds(corpo.ids);
        if (ids.length > 50) return aviso('No máximo 50 contas por vez.');

        let resultados: ResultadoConta[];
        if (ids.length === 0) {
          if (acao === 'cadastrar') return aviso('Escolha as contas a cadastrar.');
          // Sem lista: todas as contas que o token enxerga, para escolher.
          try {
            const todas = await meta.buscarContas({ fetch: buscar, token, versao });
            resultados = todas.map((conta) => ({ id: conta.id, ok: true as const, conta }));
          } catch (e) {
            return aviso('Meta: ' + meta.explicarErroMeta(e instanceof Error ? e.message : String(e)));
          }
        } else {
          resultados = await meta.buscarContasPorId({ fetch: buscar, token, ids, versao });
        }

        if (acao === 'buscar') {
          return res.status(200).json({
            ok: true,
            resultados: resultados.map((r) =>
              r.ok ? { ok: true, ...r.conta, cadastrada: cadastro!.some((c) => c.id === r.id) } : r,
            ),
          });
        }

        const boas = resultados.filter((r): r is Extract<ResultadoConta, { ok: true }> => r.ok);
        const ruins = resultados.filter((r): r is Extract<ResultadoConta, { ok: false }> => !r.ok);
        if (boas.length === 0) return aviso(`Nenhuma conta cadastrada: ${ruins[0]?.erro ?? 'o Meta não respondeu'}.`);
        if (colado) {
          const { error } = await db
            .from('meta_bms')
            .upsert({ user_id: userId, bm_id: bm, token: colado, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id,bm_id' });
          if (error) return aviso('Banco: ' + error.message);
          tokensBm.set(bm, colado);
        }
        cadastro = meta.mesclarCadastro(
          cadastro,
          boas.map((r) => ({ ...r.conta, bm_id: bm, origem: 'bm' as const })),
        );
        const erro = await gravar({ cadastro });
        if (erro) return aviso(erro);
        return res.status(200).json({ ok: true, cadastro: vista(cadastro), config: efetiva, cadastradas: boas.length, erros: ruins });
      }

      if (acao === 'manual') {
        const id = meta.normalizarConta(String(corpo.id ?? ''));
        if (!id) return aviso('Informe o Account ID (só números).');
        const moeda = String(corpo.moeda ?? '').toUpperCase();
        if (moeda !== 'BRL' && moeda !== 'USD') return aviso('Escolha a moeda da conta (BRL ou USD).');
        const bm = String(corpo.bm_id ?? '').replace(/\D/g, '') || null;
        const nome = String(corpo.nome ?? '').trim().slice(0, 80) || `Conta ${id}`;
        cadastro = meta.mesclarCadastro(cadastro, [
          { id, nome, moeda, status: 'Manual', ativa: true, business: null, bm_id: bm, origem: 'manual' },
        ]);
        const erro = await gravar({ cadastro });
        if (erro) return aviso(erro);
        return res.status(200).json({ ok: true, cadastro: vista(cadastro), config: efetiva });
      }

      if (acao === 'remover') {
        const id = meta.normalizarConta(String(corpo.id ?? ''));
        if (!id) return aviso('Conta inválida.');
        cadastro = cadastro.filter((c) => c.id !== id);
        const contas = efetiva.contas.filter((c) => c !== id);
        const erro = await gravar({ cadastro, contas });
        if (erro) return aviso(erro);
        // BM sem nenhuma conta: o token dela sai do banco também.
        const usadas = new Set(cadastro.map((c) => c.bm_id));
        const sobrando = [...tokensBm.keys()].filter((bm) => !usadas.has(bm));
        if (sobrando.length) {
          await db.from('meta_bms').delete().eq('user_id', userId).in('bm_id', sobrando);
          for (const bm of sobrando) tokensBm.delete(bm);
        }
        return res.status(200).json({ ok: true, cadastro: vista(cadastro), config: { ...efetiva, contas } });
      }

      // redetectar: cada conta com o token da sua BM (ou o da Vercel).
      const grupos = new Map<string, string[]>();
      const erros: { id: string; erro: string }[] = [];
      for (const c of cadastro) {
        const t = (c.bm_id && tokensBm.get(c.bm_id)) || tokenVercel;
        if (t) grupos.set(t, [...(grupos.get(t) ?? []), c.id]);
        else erros.push({ id: c.id, erro: 'sem Access Token — importe a BM de novo com o token' });
      }
      const achadas = new Map<string, ContaCadastrada>();
      for (const [token, ids] of grupos) {
        for (const r of await meta.buscarContasPorId({ fetch: buscar, token, ids, versao })) {
          if (!r.ok) erros.push({ id: r.id, erro: r.erro });
          else {
            const c = cadastro.find((x) => x.id === r.id)!;
            // Na conta manual o nome é o que foi digitado.
            achadas.set(r.id, { ...c, ...r.conta, nome: c.origem === 'manual' ? c.nome : r.conta.nome });
          }
        }
      }
      cadastro = meta.mesclarCadastro([], cadastro.map((c) => achadas.get(c.id) ?? c));
      const erro = await gravar({ cadastro });
      if (erro) return aviso(erro);
      return res.status(200).json({ ok: true, cadastro: vista(cadastro), config: efetiva, erros });
    }

    // ── Cadastro + configuração, para a tela ──
    if (acao === 'contas') {
      if (cadastro) {
        return res.status(200).json({ ok: true, cadastro: vista(cadastro), contas: [], config: efetiva, salva: Boolean(config), migracao: true });
      }
      // Antes da migração 0020: as contas que o token da Vercel enxerga.
      if (!tokenVercel) return res.status(200).json({ ok: false, configurado: false, aviso: avisoVercel });
      const contas = await meta.buscarContas({ fetch: buscar, token: tokenVercel, versao });
      return res.status(200).json({ ok: true, cadastro: null, contas, config: efetiva, salva: Boolean(config), migracao: !semTabela });
    }

    // ── Sincronizar o gasto ──
    if (efetiva.contas.length === 0) {
      // Sem conta marcada não se grava nada: zerar o gasto por engano é pior.
      return aviso('Nenhuma conta de anúncio marcada na Integração Facebook.');
    }
    if (!cadastro && !tokenVercel) return res.status(200).json({ ok: false, configurado: false, aviso: avisoVercel });
    const { tokens, faltando } = meta.tokensDasContas({ contas: efetiva.contas, cadastro: cadastro ?? [], tokensBm, tokenVercel });
    if (faltando.length) {
      // Sem o token de uma conta o total sairia menor: melhor não gravar.
      const nomes = faltando.map((id) => cadastro?.find((c) => c.id === id)?.nome ?? `act_${id}`).join(', ');
      return aviso(`Sem Access Token para ${nomes}: importe a BM dessa conta com o token em Cadastro de contas.`);
    }

    // Padrão: os últimos 3 dias — o Meta ainda ajusta o gasto de um dia
    // depois que ele acaba, e o BlueSales acompanha esses ajustes.
    const hoje = meta.hojeSP();
    const dias = Math.min(Math.max(Math.floor(Number(q('dias') ?? 3)) || 3, 1), 62);
    const ate = q('ate') && DATA.test(q('ate')!) ? q('ate')! : hoje;
    let desde = q('desde') && DATA.test(q('desde')!) ? q('desde')! : meta.somarDias(ate, -(dias - 1));
    const simular = q('simular') === '1';
    // Gravar nunca volta antes do início da integração: os dias lançados à
    // mão (como no BlueSales) ficam como estão. Comparar pode ver qualquer dia.
    if (!simular && desde < meta.INICIO_INTEGRACAO) desde = meta.INICIO_INTEGRACAO;
    if (desde > ate || meta.diasEntre(desde, ate).length > 62) {
      return res.status(400).json({ ok: false, aviso: 'Período inválido (máximo de 62 dias).' });
    }

    const gasto = await meta.gastoMetaPorDia({
      fetch: buscar,
      token: tokenVercel ?? '',
      tokens,
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
      if (error) return aviso('Banco: ' + error.message);
    }

    return res.status(200).json({
      ok: true,
      simulado: simular,
      desde,
      ate,
      dias: gasto.map((d) => ({ ...d, na_dashboard: atual.get(d.data) ?? 0 })),
    });
  } catch (e) {
    return aviso(e instanceof Error ? e.message : String(e));
  }
}
