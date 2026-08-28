// Trava a regra da taxa de plataforma do BlueSales:
// R$ 2,50 por DIA em que houve pagamento aprovado (taxa de repasse).
// Números conferidos contra o P&L real do BlueSales em 28/08/2026.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';

function pago(id: string, valor: number, dataPgto: string, plano = '3 POTE'): Pedido {
  return {
    id,
    status: 'pagos',
    data: dataPgto,
    data_aprovacao: dataPgto,
    valor,
    valor_bruto: valor,
    produto_plano: `DERMAX PREMIUM - ${plano}`,
    vendedor: 'PETER',
    metodo_pagamento: 'pix',
  };
}

describe('taxa de plataforma = R$ 2,50 por dia com pagamento', () => {
  it('conta dias distintos, não pagamentos', () => {
    const pedidos = [
      pago('a', 735, '2026-08-26'),
      pago('b', 735, '2026-08-26'), // mesmo dia → não cobra de novo
      pago('c', 735, '2026-08-27'),
    ];
    const agg = agregarPedidos(pedidos, { inicio: '2026-08-01', fim: '2026-08-31' });
    expect(agg.qtd_pagamentos).toBe(3);
    expect(agg.dias_com_pagamento).toBe(2);
  });

  it('reproduz o P&L do BlueSales de HOJE (1 pagamento de R$ 435)', () => {
    const periodo: Periodo = { inicio: '2026-08-28', fim: '2026-08-28' };
    // 6 agendados no dia; 1 deles pago (R$ 435 = 3 potes).
    const pedidos: Pedido[] = [
      pago('pago-1', 435, '2026-08-28'),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `pend-${i}`,
        status: 'cadastrados',
        data: '2026-08-28',
        valor: 735,
        valor_bruto: 735,
        produto_plano: 'DERMAX PREMIUM - 6 POTE',
        vendedor: 'PETER',
      })),
    ];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);

    // valores em centavos
    expect(pnl.receita_aprovada).toBe(43_500);
    expect(pnl.taxas_plataforma).toBe(250); // 1 dia com pagamento
    expect(pnl.custo_produtos).toBe(3_250);
    expect(pnl.frete).toBe(3_300);
    expect(pnl.comissoes_vendedor).toBe(2_163); // 5% × (435 − 2,50)
    expect(pnl.comissoes_cobranca).toBe(435);
    expect(pnl.custos_afterpay).toBe(9_398); // BlueSales: R$ 93,98
    expect(pnl.lucro_real).toBe(34_102); // BlueSales: 341,03 (1 centavo de arredondamento)
  });

  it('cobra por dia também em período longo (2 dias = R$ 5,00)', () => {
    const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };
    const pedidos = [
      pago('a', 435, '2026-08-27'),
      pago('b', 735, '2026-08-28', '6 POTE'),
      pago('c', 735, '2026-08-28', '6 POTE'),
    ];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);
    expect(pnl.taxas_plataforma).toBe(500); // 2 dias × R$ 2,50
  });

  it('sem pagamentos no período, não há taxa', () => {
    const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };
    const pedidos: Pedido[] = [
      { id: 'x', status: 'cadastrados', data: '2026-08-10', valor: 735, valor_bruto: 735, vendedor: 'PETER' },
    ];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);
    expect(pnl.taxas_plataforma).toBe(0);
    expect(pnl.comissoes_vendedor).toBe(0);
  });
});
