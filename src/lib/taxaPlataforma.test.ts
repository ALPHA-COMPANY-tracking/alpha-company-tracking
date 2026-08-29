// Taxa de plataforma do BlueSales.
//
// Ela NÃO é derivável dos pedidos: no "Resultado Diário" de agosto/2026,
// 14/08 e 15/08 tiveram exatamente 2 pagamentos de R$ 735 e cobraram
// R$ 5,00 e R$ 0,00 respectivamente. Por isso o valor real é lançado por
// dia em `afterpay_daily.taxas_plataforma` e o P&L apenas o soma.
//
// Aqui travamos: (a) a taxa vem do lançamento diário, (b) a comissão do
// vendedor usa 5% × (receita − taxas), que foi o que gerou o erro de
// R$ 1,00 quando a taxa estava errada.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';

function daily(data: string, taxas: number, ads = 0): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: taxas, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: ads,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0,
  };
}

function pago(id: string, valor: number, dataPgto: string, plano: string): Pedido {
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

describe('taxa de plataforma (lançada por dia)', () => {
  it('reproduz o P&L do BlueSales de 28/08/2026 ao centavo', () => {
    const periodo: Periodo = { inicio: '2026-08-28', fim: '2026-08-28' };
    const pedidos: Pedido[] = [
      pago('pago-1', 435, '2026-08-28', '3 POTE'),
      // 5 agendados do dia que ainda não pagaram
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
    const pnl = calcularPnl([daily('2026-08-28', 2.5)], [], periodo, {}, pedidos);

    expect(pnl.receita_aprovada).toBe(43_500); // R$ 435,00
    expect(pnl.taxas_plataforma).toBe(250); // R$ 2,50 (valor real do dia)
    expect(pnl.custo_produtos).toBe(3_250); // R$ 32,50
    expect(pnl.frete).toBe(3_300); // R$ 33,00
    expect(pnl.comissoes_vendedor).toBe(2_163); // 5% × (435 − 2,50) = R$ 21,63
    expect(pnl.comissoes_cobranca).toBe(435); // 1% = R$ 4,35
    expect(pnl.custos_afterpay).toBe(9_398); // R$ 93,98
    expect(pnl.lucro_real).toBe(34_102); // BlueSales: R$ 341,03 (1 centavo de arredondamento)
    expect(pnl.valor_agendado).toBe(411_000); // R$ 4.110,00 · 6 pedidos
    expect(pnl.qtd_agendados).toBe(6);
  });

  it('dia sem taxa lançada: comissão usa a receita cheia (caso 15/08)', () => {
    const periodo: Periodo = { inicio: '2026-08-15', fim: '2026-08-15' };
    const pedidos = [
      pago('a', 735, '2026-08-15', '6 POTE'),
      pago('b', 735, '2026-08-15', '6 POTE'),
    ];
    // Ads de R$ 251,00 lançados nesse dia (Resultado Diário)
    const pnl = calcularPnl([daily('2026-08-15', 0, 251)], [], periodo, {}, pedidos);

    expect(pnl.taxas_plataforma).toBe(0);
    expect(pnl.comissoes_vendedor).toBe(7_350); // 5% × 1470 = R$ 73,50
    expect(pnl.lucro_real).toBe(89_880); // BlueSales: R$ 898,80 ✓
  });

  it('reproduz o P&L do BlueSales de 28/08 (2 pagamentos, Ads R$ 803)', () => {
    const periodo: Periodo = { inicio: '2026-08-28', fim: '2026-08-28' };
    const pedidos = [
      pago('a', 435, '2026-08-28', '3 POTE'),
      pago('b', 735, '2026-08-28', '6 POTE'),
    ];
    const pnl = calcularPnl([daily('2026-08-28', 2.5, 803)], [], periodo, {}, pedidos);

    expect(pnl.receita_aprovada).toBe(117_000); // R$ 1.170,00
    expect(pnl.taxas_plataforma).toBe(250); // R$ 2,50
    expect(pnl.comissoes_vendedor).toBe(5_838); // 5% × (1170 − 2,50) = R$ 58,38
    expect(pnl.lucro_real).toBe(11_292); // BlueSales: R$ 112,92 ✓
  });

  it('soma as taxas de vários dias do período', () => {
    const periodo: Periodo = { inicio: '2026-08-14', fim: '2026-08-15' };
    const pedidos = [
      pago('a', 735, '2026-08-14', '6 POTE'),
      pago('b', 735, '2026-08-15', '6 POTE'),
    ];
    const dailies = [daily('2026-08-14', 5), daily('2026-08-15', 0)];
    const pnl = calcularPnl(dailies, [], periodo, {}, pedidos);
    expect(pnl.taxas_plataforma).toBe(500); // R$ 5,00 + R$ 0,00
  });
});
