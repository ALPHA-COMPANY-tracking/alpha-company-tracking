// ─────────────────────────────────────────────────────────────
// MOTOR DE CÁLCULO DO P&L (puro, sem UI, sem banco).
// Entrada em reais → saída em CENTAVOS inteiros (money) e razões
// (0..1) para percentuais. Regras vindas da spec, sem improviso.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, IsoDate, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { agregarPedidos } from '@/lib/pedidos';
import { COMISSAO_COBRANCA, COMISSAO_VENDEDOR, TAXA_PLATAFORMA_POR_DIA, custosDePedidos } from '@/lib/custosConfig';
import {
  diasDoPeriodo,
  diasInclusivos,
  diasNoMes,
  isDentro,
  mesKey,
  mesesNoPeriodo,
  primeiroDiaMes,
  ultimoDiaMes,
} from '@/lib/dates';

/**
 * Contribuição de UM custo variável ao período, em centavos.
 * - 'unico': entra integral se a competência cai no período.
 * - 'mensal' + ratear_por_dias: proporcional aos dias do mês
 *   dentro do período (mês a mês).
 * - 'mensal' sem rateio: valor integral se qualquer dia daquele
 *   mês está no período.
 */
export function custoNoPeriodo(custo: CustoVariavel, periodo: Periodo): Cents {
  const valorCents = reaisToCents(custo.valor);

  if (custo.recorrencia === 'unico') {
    return isDentro(custo.data, periodo.inicio, periodo.fim) ? valorCents : 0;
  }

  // mensal
  let total = 0;
  const inicioMesCusto = mesKey(custo.data);
  const fimMesCusto = custo.recorrencia_fim ? mesKey(custo.recorrencia_fim) : null;

  for (const { y, m } of mesesNoPeriodo(periodo.inicio, periodo.fim)) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    if (mk < inicioMesCusto) continue; // recorrência ainda não começou
    if (fimMesCusto && mk > fimMesCusto) continue; // recorrência já terminou

    const primeiro = primeiroDiaMes(y, m);
    const ultimo = ultimoDiaMes(y, m);
    const overlapInicio = periodo.inicio > primeiro ? periodo.inicio : primeiro;
    const overlapFim = periodo.fim < ultimo ? periodo.fim : ultimo;
    const diasPeriodo = diasInclusivos(overlapInicio, overlapFim);
    if (diasPeriodo <= 0) continue;

    if (custo.ratear_por_dias) {
      total += Math.round((valorCents * diasPeriodo) / diasNoMes(y, m));
    } else {
      total += valorCents;
    }
  }
  return total;
}

export interface CategoriaAgregada {
  categoria_id: string | null;
  total: Cents;
  qtd: number;
}

/** Ponto da série diária (para gráficos). Valores em centavos. */
export interface PontoDiario {
  data: IsoDate;
  receita: Cents;
  custos: Cents;
  lucro: Cents;
}

export interface PnlOptions {
  /** Toggle "Considerar frustrados como perda". Default: false. */
  considerarFrustrados?: boolean;
}

/** Resultado do P&L de um período. Dinheiro em CENTAVOS; razões em 0..1. */
export interface PnlResult {
  // Receita
  receita_aprovada: Cents;
  qtd_pagamentos: number;

  // Linhas do Afterpay
  taxas_plataforma: Cents;
  custo_produtos: Cents;
  frete: Cents;
  comissoes_vendedor: Cents;
  comissoes_cobranca: Cents;
  investimento_ads: Cents;
  taxas_investimento: Cents;

  custos_afterpay: Cents;
  lucro_afterpay: Cents;
  margem_afterpay: number;

  // Custos variáveis (meus)
  custos_variaveis_total: Cents;
  custos_variaveis_por_categoria: CategoriaAgregada[];
  qtd_lancamentos: number;

  // Perdas
  valor_frustrado: Cents;
  qtd_frustrados: number;
  frustrados_considerados: boolean;

  // Resultado real
  custos_totais_reais: Cents;
  lucro_real: Cents;
  margem_real: number;
  /** Sempre disponível: lucro se os frustrados fossem perda (comparação). */
  lucro_real_com_frustrados: Cents;
  /** lucro_real − lucro_afterpay (o "buraco" que o Afterpay não mostra). */
  diferenca_afterpay: Cents;

  // Funil
  valor_agendado: Cents;
  qtd_agendados: number;
  valor_pendente: Cents;
  conversao_agendado: number;

  // Indicadores derivados
  ticket_medio: Cents;
  cpa: Cents;
  roas: number;
  roi_real: number;
  custo_por_real: number;
}

/**
 * Série diária de receita, custos totais reais e lucro real.
 * Reusa calcularPnl por dia (o rateio de mensais vira parcela diária).
 */
export function serieDiaria(
  dailies: AfterpayDaily[],
  custos: CustoVariavel[],
  periodo: Periodo,
  opts: PnlOptions = {},
): PontoDiario[] {
  return diasDoPeriodo(periodo.inicio, periodo.fim).map((dia) => {
    const p = calcularPnl(dailies, custos, { inicio: dia, fim: dia }, opts);
    return { data: dia, receita: p.receita_aprovada, custos: p.custos_totais_reais, lucro: p.lucro_real };
  });
}

/** Calcula o P&L completo de um período. */
export function calcularPnl(
  dailies: AfterpayDaily[],
  custos: CustoVariavel[],
  periodo: Periodo,
  opts: PnlOptions = {},
  pedidos: Pedido[] = [],
): PnlResult {
  const rows = dailies.filter((r) => isDentro(r.data, periodo.inicio, periodo.fim));

  const somaC = (sel: (r: AfterpayDaily) => number): Cents =>
    rows.reduce((acc, r) => acc + reaisToCents(sel(r)), 0);
  const somaI = (sel: (r: AfterpayDaily) => number): number =>
    rows.reduce((acc, r) => acc + sel(r), 0);

  // Receita/funil: por padrão vem do afterpay_daily (lançamento manual);
  // se houver pedidos do BlueSales no período, eles são a fonte da verdade.
  let receita_aprovada = somaC((r) => r.receita_aprovada);
  let qtd_pagamentos = somaI((r) => r.qtd_pagamentos);
  let valor_frustrado = somaC((r) => r.valor_frustrado);
  let qtd_frustrados = somaI((r) => r.qtd_frustrados);
  let valor_agendado = somaC((r) => r.valor_agendado);
  let qtd_agendados = somaI((r) => r.qtd_agendados);

  const agg = pedidos.length ? agregarPedidos(pedidos, periodo) : null;
  if (agg && agg.qtd_agendados > 0) {
    receita_aprovada = reaisToCents(agg.receita_aprovada);
    qtd_pagamentos = agg.qtd_pagamentos;
    valor_frustrado = reaisToCents(agg.valor_frustrado);
    qtd_frustrados = agg.qtd_frustrados;
    valor_agendado = reaisToCents(agg.valor_agendado);
    qtd_agendados = agg.qtd_agendados;
  }

  // Custos base do afterpay_daily (lançamento manual / Ads).
  let taxas_plataforma = somaC((r) => r.taxas_plataforma);
  let custo_produtos = somaC((r) => r.custo_produtos);
  let frete = somaC((r) => r.frete);
  let comissoes_vendedor = somaC((r) => r.comissoes_vendedor);
  let comissoes_cobranca = somaC((r) => r.comissoes_cobranca);
  const investimento_ads = somaC((r) => r.investimento_ads);
  const taxas_investimento = somaC((r) => r.taxas_investimento);

  // Com pedidos do BlueSales: custo de produto/frete/taxas/comissões vêm da
  // config (mesmas regras do P&L do BlueSales). Ads segue manual (Meta).
  if (agg && agg.qtd_agendados > 0) {
    const cc = custosDePedidos(pedidos, periodo);
    custo_produtos = cc.custo_produtos;
    frete = cc.frete;
    // Taxa de repasse: cobrada uma vez por dia com pagamento aprovado.
    taxas_plataforma = reaisToCents(TAXA_PLATAFORMA_POR_DIA) * agg.dias_com_pagamento;
    comissoes_vendedor = Math.round((receita_aprovada - taxas_plataforma) * COMISSAO_VENDEDOR);
    comissoes_cobranca = Math.round(receita_aprovada * COMISSAO_COBRANCA);
  }

  const custos_afterpay =
    taxas_plataforma +
    custo_produtos +
    frete +
    comissoes_vendedor +
    comissoes_cobranca +
    investimento_ads +
    taxas_investimento;

  const lucro_afterpay = receita_aprovada - custos_afterpay;
  const margem_afterpay = safeDiv(lucro_afterpay, receita_aprovada);

  // Custos variáveis, agregados por categoria
  const porCat = new Map<string | null, { total: Cents; qtd: number }>();
  let custos_variaveis_total = 0;
  let qtd_lancamentos = 0;
  for (const c of custos) {
    const contrib = custoNoPeriodo(c, periodo);
    if (contrib <= 0) continue;
    custos_variaveis_total += contrib;
    qtd_lancamentos += 1;
    const cur = porCat.get(c.categoria_id) ?? { total: 0, qtd: 0 };
    cur.total += contrib;
    cur.qtd += 1;
    porCat.set(c.categoria_id, cur);
  }
  const custos_variaveis_por_categoria: CategoriaAgregada[] = [...porCat.entries()]
    .map(([categoria_id, v]) => ({ categoria_id, total: v.total, qtd: v.qtd }))
    .sort((a, b) => b.total - a.total);

  const frustrados_considerados = opts.considerarFrustrados ?? false;
  const custosBase = custos_afterpay + custos_variaveis_total;
  const custos_totais_reais = custosBase + (frustrados_considerados ? valor_frustrado : 0);
  const lucro_real = receita_aprovada - custos_totais_reais;
  const margem_real = safeDiv(lucro_real, receita_aprovada);
  const lucro_real_com_frustrados = receita_aprovada - (custosBase + valor_frustrado);
  const diferenca_afterpay = lucro_real - lucro_afterpay;

  const valor_pendente = valor_agendado - receita_aprovada;
  const conversao_agendado = safeDiv(qtd_pagamentos, qtd_agendados);

  const ticket_medio = qtd_pagamentos ? Math.round(receita_aprovada / qtd_pagamentos) : 0;
  const cpa = qtd_pagamentos ? Math.round(investimento_ads / qtd_pagamentos) : 0;
  const roas = safeDiv(receita_aprovada, investimento_ads);
  const roi_real = safeDiv(lucro_real, investimento_ads);
  const custo_por_real = safeDiv(custos_totais_reais, receita_aprovada);

  return {
    receita_aprovada,
    qtd_pagamentos,
    taxas_plataforma,
    custo_produtos,
    frete,
    comissoes_vendedor,
    comissoes_cobranca,
    investimento_ads,
    taxas_investimento,
    custos_afterpay,
    lucro_afterpay,
    margem_afterpay,
    custos_variaveis_total,
    custos_variaveis_por_categoria,
    qtd_lancamentos,
    valor_frustrado,
    qtd_frustrados,
    frustrados_considerados,
    custos_totais_reais,
    lucro_real,
    margem_real,
    lucro_real_com_frustrados,
    diferenca_afterpay,
    valor_agendado,
    qtd_agendados,
    valor_pendente,
    conversao_agendado,
    ticket_medio,
    cpa,
    roas,
    roi_real,
    custo_por_real,
  };
}
