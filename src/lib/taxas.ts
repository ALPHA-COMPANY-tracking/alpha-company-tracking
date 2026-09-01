// ─────────────────────────────────────────────────────────────
// Taxa de plataforma do BlueSales.
//
// A taxa NÃO é derivável do pedido: dias com pagamentos idênticos são
// cobrados de forma diferente (14/08 e 15/08 tiveram os mesmos 2× R$ 735
// e cobraram R$ 5,00 e R$ 0,00). Por isso ela precisa vir como dado.
//
// Há duas fontes, nesta ordem:
//   1. O próprio pagamento (`pedido.taxa_plataforma`) — gravado pelo
//      webhook quando o BlueSales informa, ou corrigido na tela Taxas.
//   2. O total do dia (`afterpay_daily.taxas_plataforma`) — como o
//      histórico de agosto/2026 foi registrado.
//
// A escolha é POR DIA, não pelo período inteiro: assim um período que
// pega dias antigos (só total do dia) e dias novos (taxa por pagamento)
// soma os dois sem contar nada duas vezes.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { dataAprovacaoPedido, statusBucket } from '@/lib/pedidos';

/** De onde saiu a taxa que está valendo para um dia. */
export type FonteTaxa = 'pagamento' | 'dia' | 'ausente';

export interface TaxaDoDia {
  data: string;
  cents: Cents;
  fonte: FonteTaxa;
  /** Quantos pagamentos aprovados houve no dia. */
  qtd_pagamentos: number;
  /** Quantos deles já têm a taxa registrada no próprio pagamento. */
  qtd_com_taxa: number;
}

/** Pagamentos aprovados no período, agrupados pela data do pagamento. */
export function pagamentosPorDia(pedidos: Pedido[], periodo: Periodo): Map<string, Pedido[]> {
  const mapa = new Map<string, Pedido[]>();
  for (const p of pedidos) {
    if (statusBucket(p.status) !== 'aprovado') continue;
    const dia = dataAprovacaoPedido(p);
    if (!isDentro(dia, periodo.inicio, periodo.fim)) continue;
    const lista = mapa.get(dia);
    if (lista) lista.push(p);
    else mapa.set(dia, [p]);
  }
  return mapa;
}

/**
 * Taxa de cada dia do período, já resolvida entre as duas fontes.
 * Traz também os dias sem taxa nenhuma, para a tela Taxas poder mostrar
 * o que ainda está em aberto.
 */
export function taxasPorDia(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): TaxaDoDia[] {
  const porDia = pagamentosPorDia(pedidos, periodo);

  const doDia = new Map<string, { cents: Cents; conferida: boolean }>();
  for (const d of dailies) {
    if (isDentro(d.data, periodo.inicio, periodo.fim)) {
      const cents = reaisToCents(d.taxas_plataforma);
      // Um valor > 0 só pode ter vindo de alguém conferindo; o flag existe
      // para o caso de a conferência ter dado R$ 0,00.
      doDia.set(d.data, { cents, conferida: cents > 0 || d.taxa_conferida === true });
    }
  }

  // Um dia entra na lista se teve pagamento OU se tem taxa lançada.
  const dias = new Set<string>([...porDia.keys()]);
  for (const [dia, t] of doDia) if (t.conferida) dias.add(dia);

  return [...dias]
    .sort((a, b) => b.localeCompare(a))
    .map((data) => {
      const pags = porDia.get(data) ?? [];
      const comTaxa = pags.filter((p) => p.taxa_plataforma != null);

      // O pagamento manda: se pelo menos um do dia traz a taxa, o dia
      // inteiro é somado por pagamento (o resto conta como zero, que é o
      // caso normal — a maioria dos pagamentos não é taxada).
      if (comTaxa.length > 0) {
        return {
          data,
          cents: comTaxa.reduce((s, p) => s + reaisToCents(Number(p.taxa_plataforma) || 0), 0),
          fonte: 'pagamento' as const,
          qtd_pagamentos: pags.length,
          qtd_com_taxa: comTaxa.length,
        };
      }

      const t = doDia.get(data);
      return {
        data,
        cents: t?.cents ?? 0,
        fonte: t?.conferida ? ('dia' as const) : ('ausente' as const),
        qtd_pagamentos: pags.length,
        qtd_com_taxa: 0,
      };
    });
}

/** Total de taxa de plataforma do período. */
export function taxasDoPeriodo(pedidos: Pedido[], dailies: AfterpayDaily[], periodo: Periodo): Cents {
  return taxasPorDia(pedidos, dailies, periodo).reduce((s, t) => s + t.cents, 0);
}
