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
  reais: number;
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
 */
export function consolidar(opts: {
  gastos: GastoConta[];
  dias: string[];
  cotacao: (moeda: string, dia: string) => number | null;
}): GastoDoDia[] {
  return opts.dias.map((data) => {
    const partes: ParteGasto[] = opts.gastos
      .filter((g) => g.data === data)
      .map((g) => {
        const moeda = g.moeda.toUpperCase();
        const cotacao = moeda === 'BRL' ? 1 : opts.cotacao(moeda, data);
        if (cotacao == null) throw new Error(`Sem cotação de ${moeda} para ${data}`);
        return { conta: g.conta, moeda, valor: arred(g.valor), cotacao, reais: arred(g.valor * cotacao) };
      });
    return { data, reais: arred(partes.reduce((s, p) => s + p.reais, 0)), partes };
  });
}

export interface ConfigMeta {
  fetch: Fetch;
  token: string;
  contas: string[];
  desde: string;
  ate: string;
  versao?: string;
  /** Cotação fixa (R$ por US$). Sem ela, vale a PTAX de venda do dia. */
  cotacaoFixa?: number | null;
  /** Acréscimo sobre a cotação, em % (ex.: 3,5 de IOF do cartão). */
  acrescimoPct?: number;
}

/** Busca, converte e consolida o gasto de todas as contas no período. */
export async function gastoMetaPorDia(cfg: ConfigMeta): Promise<GastoDoDia[]> {
  const gastos: GastoConta[] = [];
  for (const conta of cfg.contas) {
    const r = await buscarGastoConta({ fetch: cfg.fetch, token: cfg.token, conta, desde: cfg.desde, ate: cfg.ate, versao: cfg.versao });
    gastos.push(...r.dias);
  }

  const precisaDolar = gastos.some((g) => g.moeda.toUpperCase() === 'USD' && g.valor > 0);
  const ptax = precisaDolar && !cfg.cotacaoFixa ? await buscarPtax({ fetch: cfg.fetch, desde: cfg.desde, ate: cfg.ate }) : [];
  const fator = 1 + (cfg.acrescimoPct ?? 0) / 100;

  return consolidar({
    gastos,
    dias: diasEntre(cfg.desde, cfg.ate),
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
