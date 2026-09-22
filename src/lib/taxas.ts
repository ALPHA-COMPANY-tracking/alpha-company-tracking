// ─────────────────────────────────────────────────────────────
// Taxa de plataforma do BlueSales.
//
// Regra (conferida em 22/09/2026): R$ 2,50 por pagamento em BOLETO; pix e
// cartão não pagam. O BlueSales não manda a taxa no webhook, então a
// dashboard calcula — ver TAXA_BOLETO em custosConfig.
//
// Fontes, por DIA, nesta ordem:
//   1. O próprio pagamento (`pedido.taxa_plataforma`), se algum dia o
//      BlueSales passar a mandar.
//   2. O valor lançado à mão na tela Taxas (`afterpay_daily`) — corrige
//      qualquer dia em que a regra não valha.
//   3. A regra: R$ 2,50 × boletos pagos no dia.
//
// A escolha é por dia, não pelo período inteiro: um período que pega dias
// lançados à mão e dias automáticos soma os dois sem contar nada duas vezes.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { reaisToCents } from '@/lib/money';
import { diasDoPeriodo, isDentro, parseYmd, ultimoDiaMes } from '@/lib/dates';
import { dataAprovacaoPedido, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { ehBoleto, TAXA_BOLETO } from '@/lib/custosConfig';

/** De onde saiu a taxa que está valendo para um dia. */
export type FonteTaxa = 'pagamento' | 'dia' | 'regra' | 'ausente';

export interface TaxaDoDia {
  data: string;
  cents: Cents;
  fonte: FonteTaxa;
  /** Quantos pagamentos aprovados houve no dia. */
  qtd_pagamentos: number;
  /** 'pagamento': quantos trazem a taxa · 'regra': quantos são boleto. */
  qtd_com_taxa: number;
}

const TAXA_BOLETO_CENTS = reaisToCents(TAXA_BOLETO);

/** Pagamentos aprovados no período, agrupados pela data do pagamento. */
export function pagamentosPorDia(pedidos: Pedido[], periodo: Periodo): Map<string, Pedido[]> {
  const mapa = new Map<string, Pedido[]>();
  for (const p of pedidosAtivos(pedidos)) {
    if (statusBucket(p.status) !== 'aprovado') continue;
    const dia = dataAprovacaoPedido(p);
    if (!isDentro(dia, periodo.inicio, periodo.fim)) continue;
    const lista = mapa.get(dia);
    if (lista) lista.push(p);
    else mapa.set(dia, [p]);
  }
  return mapa;
}

/** Lançamentos da tela Taxas no período: só os conferidos valem. */
function lancadosNoDia(dailies: AfterpayDaily[], periodo: Periodo): Map<string, Cents> {
  const doDia = new Map<string, Cents>();
  for (const d of dailies) {
    if (!isDentro(d.data, periodo.inicio, periodo.fim)) continue;
    const cents = reaisToCents(d.taxas_plataforma);
    // Um valor > 0 só pode ter vindo de alguém conferindo; o flag existe
    // para o caso de a conferência ter dado R$ 0,00.
    if (cents > 0 || d.taxa_conferida === true) doDia.set(d.data, cents);
  }
  return doDia;
}

/**
 * Taxa de cada dia do período, já resolvida entre as três fontes. Traz os
 * dias com pagamento e os dias com lançamento.
 */
export function taxasPorDia(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): TaxaDoDia[] {
  const porDia = pagamentosPorDia(pedidos, periodo);
  const lancado = lancadosNoDia(dailies, periodo);
  const dias = new Set<string>([...porDia.keys(), ...lancado.keys()]);

  return [...dias]
    .sort((a, b) => b.localeCompare(a))
    .map((data) => {
      const pags = porDia.get(data) ?? [];
      const comTaxa = pags.filter((p) => p.taxa_plataforma != null);

      if (comTaxa.length > 0) {
        return {
          data,
          cents: comTaxa.reduce((s, p) => s + reaisToCents(Number(p.taxa_plataforma) || 0), 0),
          fonte: 'pagamento' as const,
          qtd_pagamentos: pags.length,
          qtd_com_taxa: comTaxa.length,
        };
      }

      const manual = lancado.get(data);
      if (manual != null) {
        return { data, cents: manual, fonte: 'dia' as const, qtd_pagamentos: pags.length, qtd_com_taxa: 0 };
      }

      const boletos = pags.filter(ehBoleto).length;
      return {
        data,
        cents: boletos * TAXA_BOLETO_CENTS,
        fonte: pags.length > 0 ? ('regra' as const) : ('ausente' as const),
        qtd_pagamentos: pags.length,
        qtd_com_taxa: boletos,
      };
    });
}

/**
 * Taxa de CADA pagamento do período (id do pedido → centavos). O BlueSales
 * desconta a taxa da comissão do vendedor que fez aquela venda — por isso
 * a divisão é por pagamento, não proporcional à receita.
 *   · taxa no próprio pagamento → ela;
 *   · dia automático → R$ 2,50 em cada boleto;
 *   · dia lançado à mão → o valor dividido entre os boletos do dia (ou,
 *     sem boleto, proporcional ao valor de cada pagamento).
 */
export function taxaPorPagamento(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): Map<string, Cents> {
  const porDia = pagamentosPorDia(pedidos, periodo);
  const lancado = lancadosNoDia(dailies, periodo);
  const out = new Map<string, Cents>();

  for (const [data, pags] of porDia) {
    if (pags.some((p) => p.taxa_plataforma != null)) {
      for (const p of pags) out.set(p.id, reaisToCents(Number(p.taxa_plataforma) || 0));
      continue;
    }
    const manual = lancado.get(data);
    const boletos = pags.filter(ehBoleto);
    if (manual == null) {
      for (const p of pags) out.set(p.id, ehBoleto(p) ? TAXA_BOLETO_CENTS : 0);
      continue;
    }
    // Lançado à mão: reparte o valor do dia sem perder centavo.
    const base = boletos.length > 0 ? boletos : pags;
    const peso = (p: Pedido) => (boletos.length > 0 ? 1 : Number(p.valor) || 0);
    const pesoTotal = base.reduce((s, p) => s + peso(p), 0) || 1;
    let resto = manual;
    base.forEach((p, i) => {
      const parte = i === base.length - 1 ? resto : Math.round((manual * peso(p)) / pesoTotal);
      out.set(p.id, parte);
      resto -= parte;
    });
    for (const p of pags) if (!out.has(p.id)) out.set(p.id, 0);
  }
  return out;
}

/**
 * Todos os dias da tabela de lançamento, em ordem (1, 2, 3…), com ou sem
 * pagamento — para lançar a taxa dia a dia como numa planilha do mês.
 *
 * Período que começa no dia 1 e termina no mesmo mês ("Este mês") vai até
 * o último dia do mês: o mês inteiro fica à vista, os dias que ainda não
 * chegaram aparecem esperando. Os outros períodos mostram só os seus dias.
 */
export function diasDaTabelaDeTaxas(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): TaxaDoDia[] {
  const ini = parseYmd(periodo.inicio);
  const fim = parseYmd(periodo.fim);
  const mesInteiro = ini.d === 1 && ini.y === fim.y && ini.m === fim.m;
  const ultimo = mesInteiro ? ultimoDiaMes(fim.y, fim.m) : periodo.fim;

  const lancados = new Map(taxasPorDia(pedidos, dailies, periodo).map((t) => [t.data, t]));
  return diasDoPeriodo(periodo.inicio, ultimo).map(
    (data) => lancados.get(data) ?? { data, cents: 0, fonte: 'ausente', qtd_pagamentos: 0, qtd_com_taxa: 0 },
  );
}

/** Total de taxa de plataforma do período. */
export function taxasDoPeriodo(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): Cents {
  return taxasPorDia(pedidos, dailies, periodo).reduce((s, t) => s + t.cents, 0);
}
