// ─────────────────────────────────────────────────────────────
// Tendência dos números do topo: a série para o gráfico e a comparação
// com o período anterior ("↘ 63% vs. ontem").
//
// Tudo sai do mesmo calcularPnl da Demonstração de Resultados, dia a dia,
// para o gráfico nunca mostrar um número que o P&L não mostra.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, IsoDate, Pedido, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { addDias, diasDoPeriodo, diasInclusivos } from '@/lib/dates';
import { type PnlOptions, calcularPnl } from '@/lib/pnl';

export interface PontoTendencia {
  data: IsoDate;
  agendado: Cents;
  aprovado: Cents;
  ads: Cents;
  lucro: Cents;
}

/** Quantos dias a série mostra, no mínimo e no máximo. */
const MIN_DIAS = 7;
const MAX_DIAS = 90;

/**
 * Dias que o gráfico cobre. Período curto (hoje, ontem) mostra os 7 dias
 * que terminam nele — um ponto só não é tendência. Período longo mostra
 * o próprio período, até 90 dias.
 */
export function diasDaSerie(periodo: Periodo): IsoDate[] {
  const n = diasInclusivos(periodo.inicio, periodo.fim);
  if (n < MIN_DIAS) return diasDoPeriodo(addDias(periodo.fim, -(MIN_DIAS - 1)), periodo.fim);
  const dias = diasDoPeriodo(periodo.inicio, periodo.fim);
  return dias.slice(-MAX_DIAS);
}

export function serieTendencia(
  dailies: AfterpayDaily[],
  custos: CustoVariavel[],
  pedidos: Pedido[],
  periodo: Periodo,
  opts: PnlOptions = {},
): PontoTendencia[] {
  return diasDaSerie(periodo).map((data) => {
    const p = calcularPnl(dailies, custos, { inicio: data, fim: data }, opts, pedidos);
    return {
      data,
      agendado: p.valor_agendado,
      aprovado: p.receita_aprovada,
      ads: p.investimento_ads,
      lucro: p.lucro_real,
    };
  });
}

/** O período de mesmo tamanho que termina no dia anterior ao início. */
export function periodoAnterior(periodo: Periodo): Periodo {
  const n = diasInclusivos(periodo.inicio, periodo.fim);
  const fim = addDias(periodo.inicio, -1);
  return { inicio: addDias(fim, -(n - 1)), fim };
}

/**
 * Variação percentual entre dois valores. `null` quando não há base para
 * comparar (o anterior foi zero): "+∞%" não informa nada.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / Math.abs(anterior);
}

/** "vs. ontem", "vs. dia anterior", "vs. 7 dias anteriores". */
export function rotuloComparacao(periodo: Periodo, hoje: IsoDate): string {
  const n = diasInclusivos(periodo.inicio, periodo.fim);
  if (n === 1) return periodo.inicio === hoje ? 'vs. ontem' : 'vs. dia anterior';
  return `vs. ${n} dias anteriores`;
}

/** Selo curto do período no canto do card: "Hoje", "Ontem", "7 dias". */
export function seloPeriodo(periodo: Periodo, hoje: IsoDate): string {
  const n = diasInclusivos(periodo.inicio, periodo.fim);
  const dm = (iso: IsoDate) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (n === 1) {
    if (periodo.inicio === hoje) return 'Hoje';
    if (periodo.inicio === addDias(hoje, -1)) return 'Ontem';
    return dm(periodo.inicio);
  }
  if (periodo.fim === hoje) return `${n} dias`;
  return `${dm(periodo.inicio)}–${dm(periodo.fim)}`;
}

/** Legenda do gráfico: "Últimos 7 dias" ou "No período". */
export function legendaSerie(periodo: Periodo): string {
  const n = diasInclusivos(periodo.inicio, periodo.fim);
  if (n < MIN_DIAS) return `Últimos ${MIN_DIAS} dias`;
  if (n > MAX_DIAS) return `Últimos ${MAX_DIAS} dias`;
  return 'No período';
}
