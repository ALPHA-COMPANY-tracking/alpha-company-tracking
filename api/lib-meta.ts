// ─────────────────────────────────────────────────────────────
// Gasto do Meta Ads, direto da API de Marketing do Meta.
//
// O BlueSales passou a puxar o gasto sozinho (setembro/2026); para a
// dashboard não depender de lançamento à mão, ela faz o mesmo:
//   1. pede ao Meta o gasto de cada dia, conta por conta de anúncio;
//   2. converte para reais o que vier em outra moeda (a conta principal
//      é em dólar) pela cotação PTAX de venda do Banco Central — ou por
//      uma cotação fixa, se configurada;
//   3. soma as contas e devolve um valor em R$ por dia.
//
// Só funções: quem grava no banco é api/meta-ads.ts. O `fetch` é
// recebido por parâmetro para os testes não baterem na internet.
// ─────────────────────────────────────────────────────────────

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Gasto de uma conta num dia, na moeda da conta. */
export interface GastoConta {
  conta: string;
  moeda: string;
  data: string;
  valor: number;
}

/** Como cada conta entrou no total do dia (fica guardado para conferência). */
export interface ParteGasto {
  conta: string;
  moeda: string;
  valor: number;
  cotacao: number;
  /** Imposto do Meta aplicado, em % (só contas em real). */
  imposto?: number;
  reais: number;
}

/** Conta de anúncio que o token enxerga. */
export interface ContaAnuncio {
  id: string;
  nome: string;
  moeda: string;
  ativa: boolean;
  status: string;
  /** Portfólio (Business Manager) dono da conta, quando o Meta informa. */
  business: string | null;
}

/** account_status do Meta → texto. 1 = ativa; o resto não veicula. */
function statusConta(codigo: number): string {
  const nomes: Record<number, string> = {
    1: 'Ativa',
    2: 'Desativada',
    3: 'Pagamento pendente',
    7: 'Em análise',
    8: 'Pagamento pendente',
    9: 'Período de carência',
    100: 'Encerrando',
    101: 'Encerrada',
  };
  return nomes[codigo] ?? 'Inativa';
}

/**
 * Todas as contas de anúncio que o token enxerga — as que foram atribuídas
 * ao usuário do sistema no Business. Em ordem de nome.
 */
export async function buscarContas(opts: { fetch: Fetch; token: string; versao?: string }): Promise<ContaAnuncio[]> {
  // O nome do portfólio (business) exige a permissão business_management,
  // que o token de só-leitura (ads_read) não tem: tenta com ele e, se o
  // Meta recusar, busca a lista sem — as contas é que importam.
  try {
    return await listarContas(opts, 'name,account_id,currency,account_status,business{name}');
  } catch (e) {
    if (!/business/i.test(e instanceof Error ? e.message : '')) throw e;
    return listarContas(opts, 'name,account_id,currency,account_status');
  }
}

async function listarContas(opts: { fetch: Fetch; token: string; versao?: string }, fields: string): Promise<ContaAnuncio[]> {
  const params = new URLSearchParams({ fields, limit: '200', access_token: opts.token });
  let url: string | null = `https://graph.facebook.com/${opts.versao ?? 'v23.0'}/me/adaccounts?${params}`;
  const contas: ContaAnuncio[] = [];
  while (url) {
    const r = await opts.fetch(url);
    const corpo = (await r.json()) as {
      data?: { name?: string; account_id?: string; currency?: string; account_status?: number; business?: { name?: string } }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!r.ok || corpo.error) throw new Error(`Meta: ${corpo.error?.message ?? `erro ${r.status}`}`);
    for (const c of corpo.data ?? []) {
      if (!c.account_id) continue;
      contas.push({
        id: normalizarConta(c.account_id),
        nome: c.name?.trim() || `Conta ${c.account_id}`,
        moeda: (c.currency ?? 'BRL').toUpperCase(),
        ativa: c.account_status === 1,
        status: statusConta(Number(c.account_status)),
        business: c.business?.name ?? null,
      });
    }
    url = corpo.paging?.next ?? null;
  }
  return contas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface GastoDoDia {
  data: string;
  reais: number;
  partes: ParteGasto[];
}

/** "act_123", " 123 " → "123". */
export function normalizarConta(id: string): string {
  return id.replace(/^act_/i, '').replace(/\D/g, '');
}

// ── Cadastro de contas (Importar BM / Manual), como no BlueSales ──

/** Conta cadastrada na tela: é daqui que sai a lista para marcar no P&L. */
export interface ContaCadastrada {
  id: string;
  nome: string;
  moeda: string;
  status: string;
  ativa: boolean;
  business: string | null;
  /** BM importada — o token dela busca o gasto. null = token da Vercel. */
  bm_id: string | null;
  origem: 'bm' | 'manual';
}

/** Lista de Account IDs colada: vírgula, quebra de linha, espaço ou ";". */
export function lerIds(texto: unknown): string[] {
  const partes = Array.isArray(texto) ? texto.map(String) : String(texto ?? '').split(/[\s,;]+/);
  return [...new Set(partes.map(normalizarConta).filter(Boolean))];
}

/** Colar o token às vezes traz espaço, aspas ou "Bearer". */
export function limparToken(t: unknown): string {
  return String(t ?? '')
    .replace(/["'\s]/g, '')
    .replace(/^Bearer/i, '');
}

/** O que o Meta responde, em português e sem nada do token. */
export function explicarErroMeta(msg: string): string {
  if (/does not exist|missing permission|cannot be loaded/i.test(msg)) {
    return 'o token não tem acesso a esta conta (atribua a conta ao usuário do sistema na BM)';
  }
  if (/invalid oauth|access token|session has expired|error validating/i.test(msg)) {
    return 'token inválido ou expirado — gere um novo na BM';
  }
  return msg;
}

/** Nome, moeda e status de uma conta, pelo Account ID. */
export async function buscarConta(opts: {
  fetch: Fetch;
  token: string;
  conta: string;
  versao?: string;
}): Promise<ContaAnuncio> {
  const id = normalizarConta(opts.conta);
  const pedir = async (fields: string) => {
    const params = new URLSearchParams({ fields, access_token: opts.token });
    const r = await opts.fetch(`https://graph.facebook.com/${opts.versao ?? 'v23.0'}/act_${id}?${params}`);
    const corpo = (await r.json()) as {
      name?: string;
      currency?: string;
      account_status?: number;
      business?: { name?: string };
      error?: { message?: string };
    };
    // O token vai na URL: a mensagem de erro nunca pode repetir a URL.
    if (!r.ok || corpo.error) throw new Error(corpo.error?.message ?? `erro ${r.status}`);
    return corpo;
  };
  // Mesmo cuidado da lista: o portfólio exige business_management.
  let c;
  try {
    c = await pedir('name,account_id,currency,account_status,business{name}');
  } catch (e) {
    if (!/business/i.test(e instanceof Error ? e.message : '')) throw e;
    c = await pedir('name,account_id,currency,account_status');
  }
  return {
    id,
    nome: c.name?.trim() || `Conta ${id}`,
    moeda: (c.currency ?? 'BRL').toUpperCase(),
    ativa: c.account_status === 1,
    status: statusConta(Number(c.account_status)),
    business: c.business?.name ?? null,
  };
}

export type ResultadoConta = { id: string; ok: true; conta: ContaAnuncio } | { id: string; ok: false; erro: string };

/** Busca várias contas; a que falhar vem com o motivo, sem derrubar as outras. */
export async function buscarContasPorId(opts: {
  fetch: Fetch;
  token: string;
  ids: string[];
  versao?: string;
}): Promise<ResultadoConta[]> {
  const out: ResultadoConta[] = [];
  // De 10 em 10: rápido sem esbarrar no limite de chamadas do Meta.
  for (let i = 0; i < opts.ids.length; i += 10) {
    const lote = await Promise.all(
      opts.ids.slice(i, i + 10).map(async (id): Promise<ResultadoConta> => {
        try {
          return { id, ok: true, conta: await buscarConta({ fetch: opts.fetch, token: opts.token, conta: id, versao: opts.versao }) };
        } catch (e) {
          return { id, ok: false, erro: explicarErroMeta(e instanceof Error ? e.message : String(e)) };
        }
      }),
    );
    out.push(...lote);
  }
  return out;
}

/** Entra ou substitui (mesmo Account ID) no cadastro; em ordem de nome. */
export function mesclarCadastro(atual: ContaCadastrada[], novas: ContaCadastrada[]): ContaCadastrada[] {
  const porId = new Map(atual.map((c) => [c.id, c]));
  for (const c of novas) porId.set(c.id, c);
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Cadastro vindo do banco (jsonb): só o que tem Account ID. */
export function lerCadastro(bruto: unknown): ContaCadastrada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((c: Record<string, unknown>) => ({
      id: normalizarConta(String(c?.id ?? '')),
      nome: String(c?.nome ?? '').trim(),
      moeda: String(c?.moeda ?? 'BRL').toUpperCase(),
      status: String(c?.status ?? ''),
      ativa: c?.ativa !== false,
      business: c?.business ? String(c.business) : null,
      bm_id: c?.bm_id ? String(c.bm_id) : null,
      origem: c?.origem === 'manual' ? ('manual' as const) : ('bm' as const),
    }))
    .filter((c) => c.id)
    .map((c) => ({ ...c, nome: c.nome || `Conta ${c.id}` }));
}

/**
 * Token de cada conta marcada: o da BM em que ela foi importada; sem ele,
 * o da Vercel. As que ficam sem nenhum vêm em `faltando`.
 */
export function tokensDasContas(opts: {
  contas: string[];
  cadastro: ContaCadastrada[];
  tokensBm: Map<string, string>;
  tokenVercel: string | null;
}): { tokens: Record<string, string>; faltando: string[] } {
  const tokens: Record<string, string> = {};
  const faltando: string[] = [];
  for (const id of opts.contas) {
    const bm = opts.cadastro.find((c) => c.id === id)?.bm_id;
    const t = (bm && opts.tokensBm.get(bm)) || opts.tokenVercel;
    if (t) tokens[id] = t;
    else faltando.push(id);
  }
  return { tokens, faltando };
}

/** Data de hoje em São Paulo, 'YYYY-MM-DD'. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}

function arred(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Gasto diário de uma conta de anúncio no período. Dia sem veiculação
 * não vem na resposta do Meta — quem chama trata como zero.
 */
export async function buscarGastoConta(opts: {
  fetch: Fetch;
  token: string;
  conta: string;
  desde: string;
  ate: string;
  versao?: string;
}): Promise<{ moeda: string | null; dias: GastoConta[] }> {
  const conta = normalizarConta(opts.conta);
  const params = new URLSearchParams({
    level: 'account',
    fields: 'spend,account_currency',
    time_increment: '1',
    time_range: JSON.stringify({ since: opts.desde, until: opts.ate }),
    limit: '100',
    access_token: opts.token,
  });
  let url: string | null = `https://graph.facebook.com/${opts.versao ?? 'v23.0'}/act_${conta}/insights?${params}`;
  let moeda: string | null = null;
  const dias: GastoConta[] = [];

  while (url) {
    const r = await opts.fetch(url);
    const corpo = (await r.json()) as {
      data?: { spend?: string; account_currency?: string; date_start?: string }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!r.ok || corpo.error) {
      // O token vai na URL: a mensagem de erro nunca pode repetir a URL.
      throw new Error(`Meta (conta ${conta}): ${corpo.error?.message ?? `erro ${r.status}`}`);
    }
    for (const linha of corpo.data ?? []) {
      moeda = linha.account_currency ?? moeda;
      if (!linha.date_start) continue;
      dias.push({ conta, moeda: linha.account_currency ?? 'BRL', data: linha.date_start, valor: Number(linha.spend) || 0 });
    }
    url = corpo.paging?.next ?? null;
  }
  return { moeda, dias };
}

/** 'YYYY-MM-DD' → 'MM-DD-YYYY', o formato da API do Banco Central. */
function formatoBcb(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
}

/**
 * Cotações PTAX de venda do dólar (Banco Central) no período. Busca uma
 * semana antes para cobrir fim de semana e feriado no começo do período.
 */
export async function buscarPtax(opts: { fetch: Fetch; desde: string; ate: string }): Promise<{ data: string; venda: number }[]> {
  const inicio = formatoBcb(somarDias(opts.desde, -7));
  const fim = formatoBcb(opts.ate);
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${inicio}'&@dataFinalCotacao='${fim}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  const r = await opts.fetch(url);
  if (!r.ok) throw new Error(`Banco Central: erro ${r.status} ao buscar o dólar`);
  const corpo = (await r.json()) as { value?: { cotacaoVenda: number; dataHoraCotacao: string }[] };
  // O Banco Central publica várias cotações por dia; vale a última (fechamento).
  const porDia = new Map<string, number>();
  for (const v of corpo.value ?? []) porDia.set(v.dataHoraCotacao.slice(0, 10), Number(v.cotacaoVenda));
  return [...porDia.entries()].map(([data, venda]) => ({ data, venda })).sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Cotação que vale para um dia: a do próprio dia ou, em fim de semana,
 * feriado ou antes do fechamento, a do último dia útil.
 */
export function cotacaoNaData(cotacoes: { data: string; venda: number }[], dia: string): number | null {
  let achada: number | null = null;
  for (const c of cotacoes) if (c.data <= dia) achada = c.venda;
  return achada;
}

/**
 * Soma as contas em reais, dia a dia. Todos os dias do período aparecem
 * (dia sem gasto = R$ 0,00). Conta em outra moeda sem cotação derruba o
 * cálculo: melhor não gravar do que gravar um número errado.
 *
 * Imposto: o Meta cobra imposto (12,5%) por cima do gasto nas contas em
 * REAL; nas contas em dólar não há. O valor da API vem sem ele.
 */
export function consolidar(opts: {
  gastos: GastoConta[];
  dias: string[];
  cotacao: (moeda: string, dia: string) => number | null;
  impostoBrlPct?: number;
}): GastoDoDia[] {
  const imposto = opts.impostoBrlPct ?? 0;
  return opts.dias.map((data) => {
    const partes: ParteGasto[] = opts.gastos
      .filter((g) => g.data === data)
      .map((g) => {
        const moeda = g.moeda.toUpperCase();
        const cotacao = moeda === 'BRL' ? 1 : opts.cotacao(moeda, data);
        if (cotacao == null) throw new Error(`Sem cotação de ${moeda} para ${data}`);
        const pct = moeda === 'BRL' ? imposto : 0;
        return {
          conta: g.conta,
          moeda,
          valor: arred(g.valor),
          cotacao,
          ...(pct > 0 ? { imposto: pct } : {}),
          reais: arred(g.valor * cotacao * (1 + pct / 100)),
        };
      });
    return { data, reais: arred(partes.reduce((s, p) => s + p.reais, 0)), partes };
  });
}

/**
 * Cotação que o BlueSales usa para o dólar do Meta: R$ 5,40 fixos.
 * Conferido em 24/09/2026 com 16, 17, 18, 19 e 21/09 — US$ × 5,40 dá o
 * valor dele no centavo (ex.: US$ 429,83 × 5,40 = R$ 2.321,08). A PTAX
 * do dia (~5,15) deixava ~R$ 100 por dia de diferença.
 * Para mudar sem código: META_COTACAO na Vercel (um número, ou "ptax").
 */
export const COTACAO_BLUESALES = 5.4;

export interface ConfigMeta {
  fetch: Fetch;
  token: string;
  /** Token por conta (BMs importadas); a conta sem ele usa `token`. */
  tokens?: Record<string, string>;
  contas: string[];
  desde: string;
  ate: string;
  versao?: string;
  /** Cotação fixa (R$ por US$). Sem ela, vale a PTAX de venda do dia. */
  cotacaoFixa?: number | null;
  /** Acréscimo sobre a cotação, em % (ex.: 3,5 de IOF do cartão). */
  acrescimoPct?: number;
  /** Imposto do Meta sobre as contas em real, em % (padrão da tela: 12,5). */
  impostoBrlPct?: number;
}

/** Imposto do Meta nas contas em real (as em dólar não pagam). */
export const IMPOSTO_BRL_PADRAO = 12.5;

/**
 * Primeiro dia puxado do Meta — quando o BlueSales começou a sincronizar
 * (16/09/2026). Antes disso o gasto foi lançado à mão ("Geral") lá e aqui,
 * e a sincronização nunca pode sobrescrever esses dias.
 */
export const INICIO_INTEGRACAO = '2026-09-16';

/** Busca, converte e consolida o gasto de todas as contas no período. */
export async function gastoMetaPorDia(cfg: ConfigMeta): Promise<GastoDoDia[]> {
  const gastos: GastoConta[] = [];
  for (const conta of cfg.contas) {
    const token = cfg.tokens?.[conta] ?? cfg.token;
    const r = await buscarGastoConta({ fetch: cfg.fetch, token, conta, desde: cfg.desde, ate: cfg.ate, versao: cfg.versao });
    gastos.push(...r.dias);
  }

  const precisaDolar = gastos.some((g) => g.moeda.toUpperCase() === 'USD' && g.valor > 0);
  const ptax = precisaDolar && !cfg.cotacaoFixa ? await buscarPtax({ fetch: cfg.fetch, desde: cfg.desde, ate: cfg.ate }) : [];
  const fator = 1 + (cfg.acrescimoPct ?? 0) / 100;

  return consolidar({
    gastos,
    dias: diasEntre(cfg.desde, cfg.ate),
    impostoBrlPct: cfg.impostoBrlPct,
    cotacao: (moeda, dia) => {
      if (moeda !== 'USD') return null;
      const base = cfg.cotacaoFixa ?? cotacaoNaData(ptax, dia);
      return base == null ? null : Math.round(base * fator * 10_000) / 10_000;
    },
  });
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
