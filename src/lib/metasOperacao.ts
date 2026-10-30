// ─────────────────────────────────────────────────────────────
// Metas da operação × o que a operação está fazendo, mês contra mês.
//
// Pedido do Jonas (30/10/2026): "não estou identificando de um mês para o
// outro se a operação melhora". As metas são as dele — ROAS agendado de no
// mínimo 4, CPA por agendamento de no máximo R$ 150 e ROAS aprovado de no
// mínimo 2,5. O EMPATE é o que ESTA operação aguenta, com a conversão, os
// custos e a frustração que ela teve no período: o anúncio que zera o
// lucro real. Acima dele, prejuízo.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { diasNoMes, isDentro, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { calcularIndicadores } from '@/lib/indicadores';
import { ehFrustracao, foraDoAgendado, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { periodoAnterior } from '@/lib/tendencia';
import { FRUSTRACAO_PREVISTA } from '@/lib/previsao';

export interface Metas {
  /** ROAS agendado mínimo. */
  roas_agendado: number;
  /** CPA por agendamento máximo, em centavos. */
  cpa_agendamento: Cents;
  /** ROAS aprovado mínimo. */
  roas_aprovado: number;
  /** Frustração máxima (fração). */
  frustracao: number;
}

/** As metas-padrão do Jonas (ROAS agendado 4 e aprovado 2,5 desde
 *  30/10/2026). Na tela dá para editar — ver store/useMetas. */
export const METAS: Metas = {
  roas_agendado: 4,
  /** Em centavos: R$ 150,00 por agendamento. */
  cpa_agendamento: 15_000,
  roas_aprovado: 2.5,
  /** Frustração máxima (a mesma da Previsão). */
  frustracao: FRUSTRACAO_PREVISTA,
};

/** Metas salvas (editadas na tela) → metas válidas. Campo vazio, zero,
 *  negativo ou que não é número volta para o padrão. */
export function normalizarMetas(salvas: unknown): Metas {
  const x = (salvas && typeof salvas === 'object' ? salvas : {}) as Record<string, unknown>;
  const ok = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : padrao);
  return {
    roas_agendado: ok(x.roas_agendado, METAS.roas_agendado),
    cpa_agendamento: Math.round(ok(x.cpa_agendamento, METAS.cpa_agendamento)),
    roas_aprovado: ok(x.roas_aprovado, METAS.roas_aprovado),
    frustracao: Math.min(1, ok(x.frustracao, METAS.frustracao)),
  };
}

/** O mês 'YYYY-MM' como período; o mês corrente vai só até hoje. */
export function periodoDoMes(mes: string, hoje: string): Periodo {
  const [y, m] = mes.split('-').map(Number);
  const inicio = primeiroDiaMes(y, m);
  const fim = ultimoDiaMes(y, m);
  return { inicio, fim: hoje >= inicio && hoje < fim ? hoje : fim };
}

/** Tudo que a tela compara, de um período. */
export interface Fotografia {
  periodo: Periodo;
  valor_agendado: Cents;
  qtd_agendados: number;
  /** Faturamento agendado ÷ agendamentos. */
  ticket_agendado: Cents;
  receita: Cents;
  qtd_pagamentos: number;
  /** Recebido ÷ pagamentos. */
  ticket_recebido: Cents;
  anuncio: Cents;
  cpa_agendamento: Cents;
  roas_agendado: number;
  roas_aprovado: number;
  /** Pagamentos do período ÷ agendamentos do período. */
  pct_pagos: number;
  /** Frustração dos agendados do período (pedidos). */
  pct_frustracao: number;
  /** Entregues e ainda sem pagar (agendados no período). */
  entregues_sem_pagar: { qtd: number; valor: Cents };
  lucro_real: Cents;
  margem_real: number;
  /** O lucro real antes de pagar o anúncio (e o imposto dele). */
  sobra_antes_do_anuncio: Cents;
  /** Imposto do anúncio por real de anúncio (taxas_investimento ÷ anúncio). */
  taxa_anuncio: number;
  /** O anúncio que zera o lucro real: tudo o que sobra antes do anúncio. */
  anuncio_empate: Cents;
  /** Até quanto cada agendamento pode custar sem prejuízo. */
  cpa_empate: Cents;
  roas_agendado_empate: number;
  roas_aprovado_empate: number;
}

export function fotografar(dailies: AfterpayDaily[], custos: CustoVariavel[], pedidos: Pedido[], periodo: Periodo): Fotografia {
  const pnl = calcularPnl(dailies, custos, periodo, {}, pedidos);
  const ind = calcularIndicadores(dailies, custos, pedidos, periodo);
  // O imposto do anúncio (taxas_investimento) anda junto com ele: no empate,
  // cada real de anúncio custa 1 + essa taxa.
  const taxaDoAnuncio = safeDiv(pnl.taxas_investimento, pnl.investimento_ads);
  const sobraAntesDoAnuncio = pnl.lucro_real + pnl.investimento_ads + pnl.taxas_investimento;
  const anuncio_empate = Math.max(0, Math.round(sobraAntesDoAnuncio / (1 + taxaDoAnuncio)));
  return {
    periodo,
    valor_agendado: pnl.valor_agendado,
    qtd_agendados: pnl.qtd_agendados,
    ticket_agendado: pnl.qtd_agendados ? Math.round(pnl.valor_agendado / pnl.qtd_agendados) : 0,
    receita: pnl.receita_aprovada,
    qtd_pagamentos: pnl.qtd_pagamentos,
    ticket_recebido: pnl.ticket_medio,
    anuncio: pnl.investimento_ads,
    cpa_agendamento: pnl.cpa,
    roas_agendado: pnl.roas,
    roas_aprovado: safeDiv(pnl.receita_aprovada, pnl.investimento_ads),
    pct_pagos: ind.pct_pagos,
    pct_frustracao: ind.pct_frustracao,
    entregues_sem_pagar: ind.situacao.aguardando,
    lucro_real: pnl.lucro_real,
    margem_real: pnl.margem_real,
    sobra_antes_do_anuncio: sobraAntesDoAnuncio,
    taxa_anuncio: taxaDoAnuncio,
    anuncio_empate,
    cpa_empate: pnl.qtd_agendados ? Math.round(anuncio_empate / pnl.qtd_agendados) : 0,
    // Sem sobra antes do anúncio não existe empate: nenhum retorno basta.
    roas_agendado_empate: anuncio_empate > 0 ? pnl.valor_agendado / anuncio_empate : Infinity,
    roas_aprovado_empate: anuncio_empate > 0 ? pnl.receita_aprovada / anuncio_empate : Infinity,
  };
}

/**
 * O período de comparação: o MÊS ANTERIOR, nos mesmos dias. "Este mês"
 * (01 a 30/10) compara com 01 a 30/09; o mês inteiro, com o mês inteiro.
 * Período que não começa no dia 1º compara com os dias imediatamente antes.
 */
export function mesAnterior(periodo: Periodo): Periodo {
  const ini = parseYmd(periodo.inicio);
  const fim = parseYmd(periodo.fim);
  if (ini.d !== 1 || ini.y !== fim.y || ini.m !== fim.m) return periodoAnterior(periodo);
  const y = ini.m === 1 ? ini.y - 1 : ini.y;
  const m = ini.m === 1 ? 12 : ini.m - 1;
  const mesInteiro = fim.d === diasNoMes(fim.y, fim.m);
  const ultimo = ultimoDiaMes(y, m);
  if (mesInteiro) return { inicio: primeiroDiaMes(y, m), fim: ultimo };
  const fimAnterior = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(fim.d, diasNoMes(y, m))).padStart(2, '0')}`;
  return { inicio: primeiroDiaMes(y, m), fim: fimAnterior };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "setembro" (mês inteiro), "01 a 30/09" (pedaço do mês) ou "05/09 a 12/09". */
export function rotuloPeriodo(p: Periodo): string {
  const ini = parseYmd(p.inicio);
  const fim = parseYmd(p.fim);
  const dm = (x: { d: number; m: number }) => `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}`;
  if (ini.y === fim.y && ini.m === fim.m && ini.d === 1) {
    return fim.d === diasNoMes(fim.y, fim.m) ? MESES[ini.m - 1] : `01 a ${dm(fim)}`;
  }
  return `${dm(ini)} a ${dm(fim)}`;
}

// ── Tratamentos ─────────────────────────────────────────────

/** Quantos meses de tratamento tem o plano (6, 4, 3, 2, 1) — null se não der para saber. */
export function mesesDoPlano(plano?: string | null): number | null {
  const p = (plano ?? '').toLowerCase();
  const m = /(^|\D)([1-6])\s*(pote|mes|mês)/.exec(p);
  return m ? Number(m[2]) : null;
}

export interface LinhaTratamento {
  meses: number | null;
  rotulo: string;
  qtd: number;
  valor: Cents;
  /** Parte dos agendamentos do período (em pedidos). */
  pct: number;
  ticket: Cents;
  /** Dos agendados deste tratamento no período, quantos já pagaram. */
  pagos: number;
  pct_pagos: number;
  frustrados: number;
  /** Quantos são plano promocional ("(PROMO)"). */
  promo: number;
}

/** O que foi agendado no período, por tratamento — do mais longo ao mais curto. */
export function mixDeTratamentos(pedidos: Pedido[], periodo: Periodo): LinhaTratamento[] {
  const grupos = new Map<number | null, LinhaTratamento>();
  let total = 0;
  for (const p of pedidosAtivos(pedidos)) {
    // Os mesmos pedidos do Faturamento Agendado.
    if (!isDentro(p.data, periodo.inicio, periodo.fim) || foraDoAgendado(p)) continue;
    const meses = mesesDoPlano(p.produto_plano);
    const g =
      grupos.get(meses) ??
      ({
        meses,
        rotulo: meses == null ? 'Outros planos' : meses === 1 ? '1 mês' : `${meses} meses`,
        qtd: 0,
        valor: 0,
        pct: 0,
        ticket: 0,
        pagos: 0,
        pct_pagos: 0,
        frustrados: 0,
        promo: 0,
      } satisfies LinhaTratamento);
    g.qtd += 1;
    g.valor += reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    if (statusBucket(p.status) === 'aprovado') g.pagos += 1;
    if (ehFrustracao(p)) g.frustrados += 1;
    if (/promo/i.test(p.produto_plano ?? '')) g.promo += 1;
    grupos.set(meses, g);
    total += 1;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, pct: safeDiv(g.qtd, total), ticket: g.qtd ? Math.round(g.valor / g.qtd) : 0, pct_pagos: safeDiv(g.pagos, g.qtd) }))
    .sort((a, b) => (b.meses ?? -1) - (a.meses ?? -1));
}

// ── Resolver o problema: e se o CPA fosse outro? ────────────

export interface Simulacao {
  cpa: Cents;
  /** Anúncio do período com esse CPA, nos mesmos agendamentos. */
  anuncio: Cents;
  /** Quanto se gastaria a menos (negativo = a mais) que o anúncio real. */
  economia: Cents;
  lucro_real: Cents;
  margem: number;
  roas_agendado: number;
  roas_aprovado: number;
  /** Com o MESMO anúncio do período, quantos agendamentos esse CPA daria. */
  agendamentos_mesmo_anuncio: number;
}

/**
 * Os dados do período com outro CPA: mesmos agendamentos, mesma conversão,
 * mesmos custos — só o custo do anúncio muda.
 */
export function simularCpa(f: Fotografia, cpa: Cents): Simulacao {
  const anuncio = cpa * f.qtd_agendados;
  const lucro_real = f.sobra_antes_do_anuncio - Math.round(anuncio * (1 + f.taxa_anuncio));
  return {
    cpa,
    anuncio,
    economia: f.anuncio - anuncio,
    lucro_real,
    margem: safeDiv(lucro_real, f.receita),
    roas_agendado: safeDiv(f.valor_agendado, anuncio),
    roas_aprovado: safeDiv(f.receita, anuncio),
    agendamentos_mesmo_anuncio: cpa > 0 ? Math.floor(f.anuncio / cpa) : 0,
  };
}

// ── Gargalo ─────────────────────────────────────────────────

export interface Diagnostico {
  /** 'ruim' = fora da meta e pior que o empate; 'atencao' = fora da meta; 'ok'. */
  nivel: 'ruim' | 'atencao' | 'ok';
  titulo: string;
  texto: string;
}

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const brl = (c: Cents) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const vezes = (x: number) => `${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

/** O que está fora da meta, do pior para o melhor. O primeiro é o gargalo. */
export function diagnosticar(atual: Fotografia, anterior: Fotografia, metas: Metas = METAS): Diagnostico[] {
  const lista: (Diagnostico & { peso: number })[] = [];
  const nivelPorMeta = (bate: boolean, pagaAConta: boolean): Diagnostico['nivel'] => (bate ? 'ok' : pagaAConta ? 'atencao' : 'ruim');

  if (atual.qtd_agendados > 0 && atual.anuncio > 0) {
    const acima = safeDiv(atual.cpa_agendamento - metas.cpa_agendamento, metas.cpa_agendamento);
    lista.push({
      nivel: nivelPorMeta(atual.cpa_agendamento <= metas.cpa_agendamento, atual.cpa_agendamento <= atual.cpa_empate),
      peso: acima,
      titulo: 'Custo do anúncio (CPA por agendamento)',
      texto:
        atual.cpa_agendamento <= metas.cpa_agendamento
          ? `${brl(atual.cpa_agendamento)} por agendamento, dentro da meta de ${brl(metas.cpa_agendamento)}.`
          : `${brl(atual.cpa_agendamento)} por agendamento — ${pct(acima)} acima da meta de ${brl(metas.cpa_agendamento)}. ` +
            (atual.anuncio_empate <= 0
              ? 'Neste período, mesmo sem anúncio os custos passam do que entrou: não há CPA que feche no lucro.'
              : `Com a conversão e os custos deste período, o máximo para não ter prejuízo é ${brl(atual.cpa_empate)}` +
                (atual.cpa_agendamento > atual.cpa_empate ? ': está acima, é daí que vem o prejuízo.' : '.')),
    });
    const falta = safeDiv(metas.roas_agendado - atual.roas_agendado, metas.roas_agendado);
    lista.push({
      nivel: nivelPorMeta(atual.roas_agendado >= metas.roas_agendado, atual.roas_agendado >= atual.roas_agendado_empate),
      peso: falta,
      titulo: 'Retorno do anúncio sobre o agendado (ROAS)',
      texto:
        atual.roas_agendado >= metas.roas_agendado
          ? `${vezes(atual.roas_agendado)}, acima da meta de ${vezes(metas.roas_agendado)}.`
          : `${vezes(atual.roas_agendado)} contra a meta de ${vezes(metas.roas_agendado)}` +
            (Number.isFinite(atual.roas_agendado_empate) ? `; o empate desta operação é ${vezes(atual.roas_agendado_empate)}.` : '.'),
    });
    const faltaAprov = safeDiv(metas.roas_aprovado - atual.roas_aprovado, metas.roas_aprovado);
    lista.push({
      nivel: nivelPorMeta(atual.roas_aprovado >= metas.roas_aprovado, atual.roas_aprovado >= atual.roas_aprovado_empate),
      peso: faltaAprov,
      titulo: 'Retorno do anúncio sobre o recebido (ROAS aprovado)',
      texto:
        atual.roas_aprovado >= metas.roas_aprovado
          ? `${vezes(atual.roas_aprovado)}, acima da meta de ${vezes(metas.roas_aprovado)}.`
          : `${vezes(atual.roas_aprovado)} contra a meta de ${vezes(metas.roas_aprovado)} — para cada R$ 1 de anúncio entraram ` +
            `R$ ${atual.roas_aprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    });
  }

  // Conversão em dinheiro: caiu em relação ao mês anterior?
  if (anterior.qtd_agendados > 0 && atual.qtd_agendados > 0) {
    const queda = anterior.pct_pagos - atual.pct_pagos;
    if (queda > 0.03) {
      lista.push({
        nivel: 'atencao',
        peso: queda,
        titulo: 'Menos pedidos virando pagamento',
        texto:
          `${pct(atual.pct_pagos)} dos agendamentos viraram pagamento, contra ${pct(anterior.pct_pagos)} no mês anterior. ` +
          `Há ${atual.entregues_sem_pagar.qtd} entregues sem pagar (${brl(atual.entregues_sem_pagar.valor)}) — é a cobrança. ` +
          'Mês em andamento sempre fica abaixo: parte ainda está na rua.',
      });
    }
    const caiuTicket = safeDiv(anterior.ticket_agendado - atual.ticket_agendado, anterior.ticket_agendado);
    if (caiuTicket > 0.03) {
      lista.push({
        nivel: 'atencao',
        peso: caiuTicket,
        titulo: 'Ticket médio caiu',
        texto: `${brl(atual.ticket_agendado)} por agendamento contra ${brl(anterior.ticket_agendado)} no mês anterior (−${pct(caiuTicket)}) — veja os tratamentos: mais vendas dos planos curtos ou promocionais.`,
      });
    }
  }

  if (atual.pct_frustracao > metas.frustracao) {
    lista.push({
      nivel: 'ruim',
      peso: atual.pct_frustracao - metas.frustracao,
      titulo: 'Frustração acima do limite',
      texto: `${pct(atual.pct_frustracao)} dos pedidos frustraram, acima do limite de ${pct(metas.frustracao)}.`,
    });
  }

  const ordem = { ruim: 0, atencao: 1, ok: 2 } as const;
  return lista
    .sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || b.peso - a.peso)
    .map(({ nivel, titulo, texto }) => ({ nivel, titulo, texto }));
}
