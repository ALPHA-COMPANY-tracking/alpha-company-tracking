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
export async function buscarPtax(opts: { fetch: Fetch; desde: string; ate: string }): Promise<Ptax[]> {
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
  const porDia = new Map<string, Ptax>();
  for (const v of corpo.value ?? []) {
    const data = v.dataHoraCotacao.slice(0, 10);
    porDia.set(data, { data, venda: Number(v.cotacaoVenda), hora: v.dataHoraCotacao.slice(11, 16) });
  }
  return [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** PTAX de venda de um dia útil, com a hora em que o Banco Central publicou. */
export interface Ptax {
  data: string;
  venda: number;
  /** 'HH:MM' da publicação (fechamento, por volta das 13h). */
  hora?: string;
}

/**
 * PTAX que vale para o gasto de um dia: a do último dia útil ANTES dele — a
 * que estava publicada quando o dia começou. É a que o BlueSales guarda no
 * dia (27/11/2026: "Cotação do dia R$ 5,7446 · 26/11 às 13:11", e o gasto de
 * 27/11 a R$ 5,7446 × 1,06 = R$ 6,0893). Fim de semana e feriado caem no
 * último dia útil, e a PTAX do próprio dia (publicada à tarde) só vale a
 * partir do dia seguinte.
 */
export function ptaxAntesDe(cotacoes: Ptax[], dia: string): Ptax | null {
  let achada: Ptax | null = null;
  for (const c of cotacoes) if (c.data < dia && (!achada || c.data > achada.data)) achada = c;
  return achada;
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

/** Taxa do dólar FIXA que passa a valer a partir de um dia. */
export interface CotacaoDesde {
  desde: string;
  valor: number;
  /** Quando foi salva (ISO). As antigas (5,40 e 6,15) não têm. */
  em?: string;
}

/**
 * Câmbio do BlueSales (27/11/2026) a partir de um dia: PTAX do Banco Central
 * + spread do banco + IOF, em %. Cada mudança é um registro novo (com quem e
 * quando) — o histórico de alterações da tela sai daqui.
 */
export interface CambioPtax {
  desde: string;
  ptax: true;
  spread: number;
  iof: number;
  /** Quando foi salvo (ISO) e por quem — só o nome. */
  em?: string;
  por?: string;
}

/** Regra do dólar a partir de um dia: taxa fixa ou PTAX + spread + IOF. */
export type RegraDolar = CotacaoDesde | CambioPtax;

export function ehPtax(r: RegraDolar | null | undefined): r is CambioPtax {
  return Boolean(r && (r as CambioPtax).ptax === true);
}

const arred4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Câmbio efetivo de PTAX + spread + IOF (4 casas, como o BlueSales). */
export function cambioEfetivo(ptax: number, spread: number, iof: number): number {
  return arred4(ptax * (1 + spread / 100) * (1 + iof / 100));
}

/** Ordem do histórico: "desde" mais recente primeiro; no mesmo dia, a salva por último. */
function ordemDasRegras(a: RegraDolar, b: RegraDolar): number {
  return b.desde.localeCompare(a.desde) || (b.em ?? '').localeCompare(a.em ?? '');
}

/**
 * Qual de duas regras manda num dia em que as duas já valem: a SALVA POR
 * ÚLTIMO ("mudar spread ou IOF vale da data escolhida em diante" — mudar com
 * data de 20/11 depois de já existir uma de 27/11 vale também de 27/11 em
 * diante). Sem data de salvamento (as fixas antigas), a de "desde" maior.
 */
function mandaMais(a: RegraDolar, b: RegraDolar): boolean {
  const ea = a.em ?? '';
  const eb = b.em ?? '';
  return ea !== eb ? ea > eb : a.desde > b.desde;
}

/** Primeiro "desde" do histórico: a taxa que já valia antes de qualquer troca. */
export const SEMPRE = '0001-01-01';

/**
 * Taxa do dólar de um dia: a digitada para o próprio dia (o valor exato que
 * o cartão cobrou) ou, sem ela, a última que passou a valer até esse dia.
 * Taxa nova vale a partir do dia escolhido e NÃO muda os dias de antes
 * (Jonas, 20/11/2026: trocar 5,40 por 6,15 tinha refeito o mês inteiro).
 * Sem histórico, vale `fixa` (null = PTAX do Banco Central).
 */
export function cotacaoDoDia(
  dia: string,
  opts: { aPartir: RegraDolar[]; dias: Record<string, number>; fixa: number | null },
): number | null {
  const doDia = Number(opts.dias[dia]);
  if (doDia > 0) return doDia;
  const regra = regraDoDia(dia, opts.aPartir);
  if (!regra) return opts.fixa;
  // PTAX + spread + IOF depende do Banco Central: ver cambioDoDia.
  return ehPtax(regra) ? null : regra.valor;
}

/**
 * A regra que vale num dia: entre as que já valem nele (desde ≤ dia), a
 * salva por último; as antigas sem data de salvamento, pela "desde" maior.
 */
export function regraDoDia(dia: string, regras: RegraDolar[]): RegraDolar | null {
  let achada: RegraDolar | null = null;
  for (const r of regras) if (r.desde <= dia && (!achada || mandaMais(r, achada))) achada = r;
  return achada;
}

/** O spread e o IOF de agora: os da regra de PTAX salva por último. */
export function ultimaRegraPtax(regras: RegraDolar[]): CambioPtax | null {
  let achada: CambioPtax | null = null;
  for (const r of regras) if (ehPtax(r) && (!achada || mandaMais(r, achada))) achada = r;
  return achada;
}

/** Algum dia do período usa PTAX + spread + IOF (e não tem dólar digitado)? */
export function usaPtax(regras: RegraDolar[], dias: Record<string, number>, desde: string, ate: string): boolean {
  return diasEntre(desde, ate).some((d) => !(Number(dias[d]) > 0) && ehPtax(regraDoDia(d, regras)));
}

/**
 * Dólar de um dia, com tudo: o digitado para o dia (o valor exato do
 * cartão); senão a regra que vale nele — fixa, ou PTAX do último dia útil
 * antes dele × (1 + spread) × (1 + IOF). Sem regra, `fixa`. Regra de PTAX
 * sem a cotação do Banco Central ERRA de propósito: melhor não gravar do que
 * gravar o gasto com a taxa errada.
 */
export function cambioDoDia(
  dia: string,
  opts: { regras: RegraDolar[]; dias: Record<string, number>; fixa: number | null; ptax?: Ptax[] },
): number | null {
  const doDia = Number(opts.dias[dia]);
  if (doDia > 0) return doDia;
  const regra = regraDoDia(dia, opts.regras);
  if (!regra) return opts.fixa;
  if (!ehPtax(regra)) return regra.valor;
  const p = ptaxAntesDe(opts.ptax ?? [], dia);
  if (!p) throw new Error(`Sem a cotação PTAX do Banco Central para ${dia}: tente de novo em alguns minutos.`);
  return cambioEfetivo(p.venda, regra.spread, regra.iof);
}

/** Histórico vindo do banco (jsonb), só com o que é válido. */
export function lerCotacoes(aPartir: unknown, dias: unknown): { aPartir: RegraDolar[]; dias: Record<string, number> } {
  const data = /^\d{4}-\d{2}-\d{2}$/;
  const pct = (v: unknown) => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const lista: RegraDolar[] = [];
  for (const c of Array.isArray(aPartir) ? (aPartir as Record<string, unknown>[]) : []) {
    const desde = String(c?.desde ?? '');
    if (!data.test(desde)) continue;
    if (c?.ptax === true) {
      const spread = pct(c.spread);
      const iof = pct(c.iof);
      if (spread == null || iof == null) continue;
      lista.push({
        desde,
        ptax: true,
        spread,
        iof,
        ...(typeof c.em === 'string' ? { em: c.em } : {}),
        ...(typeof c.por === 'string' ? { por: c.por } : {}),
      });
    } else if (Number(c?.valor) > 0) {
      lista.push({ desde, valor: Number(c.valor), ...(typeof c.em === 'string' ? { em: c.em } : {}) });
    }
  }
  lista.sort(ordemDasRegras);
  const porDia: Record<string, number> = {};
  if (dias && typeof dias === 'object' && !Array.isArray(dias)) {
    for (const [d, v] of Object.entries(dias as Record<string, unknown>)) if (data.test(d) && Number(v) > 0) porDia[d] = Number(v);
  }
  return { aPartir: lista, dias: porDia };
}

/**
 * Grava uma taxa a partir de um dia (substitui a do mesmo dia). Na primeira
 * troca, a taxa que valia até então fica para trás (SEMPRE), para os dias
 * antigos não mudarem.
 */
export function novaCotacaoDesde(
  lista: RegraDolar[],
  anterior: number | null,
  desde: string,
  valor: number,
  em?: string,
): RegraDolar[] {
  const base = lista.length || anterior == null || desde === SEMPRE ? lista : [{ desde: SEMPRE, valor: anterior }];
  return [...base.filter((c) => c.desde !== desde), { desde, valor, ...(em ? { em } : {}) }].sort(ordemDasRegras);
}

/**
 * Grava PTAX + spread + IOF a partir de um dia. Cada mudança fica guardada
 * (é o histórico de alterações); no mesmo dia, vale a salva por último. Na
 * primeira regra, a taxa que valia até então fica para trás (SEMPRE), para
 * os dias antigos não mudarem.
 */
export function novaRegraPtax(lista: RegraDolar[], anterior: number | null, regra: CambioPtax): RegraDolar[] {
  const base = lista.length || anterior == null || regra.desde === SEMPRE ? lista : [{ desde: SEMPRE, valor: anterior }];
  return [...base, regra].sort(ordemDasRegras);
}

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
  /** Taxa de cada dia (histórico da tela); null no dia = cai na fixa/PTAX.
   *  Recebe a PTAX do Banco Central do período (vazia se ninguém precisa). */
  cotacaoDoDia?: (dia: string, ptax: Ptax[]) => number | null;
  /** Algum dia do período usa PTAX + spread + IOF: busca o Banco Central. */
  precisaPtax?: boolean;
  /** fetch só para o Banco Central (com limite de tempo); sem ele, `fetch`. */
  fetchPtax?: Fetch;
  /** Acréscimo sobre a cotação, em % (ex.: 3,5 de IOF do cartão). */
  acrescimoPct?: number;
  /** Imposto do Meta sobre as contas em real, em % (padrão da tela: 12,5). */
  impostoBrlPct?: number;
}

/** Imposto do Meta nas contas em real (as em dólar não pagam). */
export const IMPOSTO_BRL_PADRAO = 12.5;

/**
 * Primeiro dia puxado do Meta — o primeiro que o BlueSales sincroniza
 * (15/09/2026: "Meta Ads · US$ (sincronizado)" R$ 1.793,45). Antes disso o
 * gasto foi lançado à mão ("Geral") lá e aqui, e a sincronização nunca pode
 * sobrescrever esses dias. Em 15/09 o BlueSales ficou com o "Geral" de
 * R$ 1.720,00 E o do Meta (lá o manual SOMA ao sincronizado) — contado duas
 * vezes; aqui vale só o do Meta.
 */
export const INICIO_INTEGRACAO = '2026-09-15';

/** Busca, converte e consolida o gasto de todas as contas no período. */
export async function gastoMetaPorDia(cfg: ConfigMeta): Promise<GastoDoDia[]> {
  const gastos: GastoConta[] = [];
  for (const conta of cfg.contas) {
    const token = cfg.tokens?.[conta] ?? cfg.token;
    const r = await buscarGastoConta({ fetch: cfg.fetch, token, conta, desde: cfg.desde, ate: cfg.ate, versao: cfg.versao });
    gastos.push(...r.dias);
  }

  const dias = diasEntre(cfg.desde, cfg.ate);
  // Conta em dólar com gasto zero também passa pela cotação (consolidar pede
  // a taxa de toda linha que não é em real): sem a PTAX o dia de PTAX travaria.
  const precisaDolar = gastos.some((g) => g.moeda.toUpperCase() === 'USD');
  const faltaTaxa = cfg.precisaPtax || (!cfg.cotacaoFixa && dias.some((d) => (cfg.cotacaoDoDia?.(d, []) ?? null) == null));
  const ptax = precisaDolar && faltaTaxa ? await buscarPtax({ fetch: cfg.fetchPtax ?? cfg.fetch, desde: cfg.desde, ate: cfg.ate }) : [];
  const fator = 1 + (cfg.acrescimoPct ?? 0) / 100;

  return consolidar({
    gastos,
    dias,
    impostoBrlPct: cfg.impostoBrlPct,
    cotacao: (moeda, dia) => {
      if (moeda !== 'USD') return null;
      const base = cfg.cotacaoDoDia?.(dia, ptax) ?? cfg.cotacaoFixa ?? cotacaoNaData(ptax, dia);
      return base == null ? null : Math.round(base * fator * 10_000) / 10_000;
    },
  });
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
