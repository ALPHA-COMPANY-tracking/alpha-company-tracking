// Perda dos pedidos frustrados.
//
// O valor do pedido é a receita que NÃO entrou; o que sai do caixa é o
// produto enviado + o frete de ida. É a perda real que desconta do lucro.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { perdaRealDePedido } from '@/lib/custosConfig';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

function frustrado(id: string, valor: number, plano: string, perda_real?: number): Pedido {
  return {
    id,
    status: 'frustrados',
    data: '2026-08-15',
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: `DERMAX PREMIUM - ${plano}`,
    vendedor: 'PETER',
    ...(perda_real != null ? { perda_real } : {}),
  };
}

describe('perdaRealDePedido', () => {
  it('6 potes: custo do produto (83) + frete (33)', () => {
    expect(perdaRealDePedido(frustrado('a', 735, '6 POTE'))).toBe(116);
  });

  it('3 potes: custo do produto (32,50) + frete (33)', () => {
    expect(perdaRealDePedido(frustrado('a', 435, '3 POTE'))).toBe(65.5);
  });

  it('ajuste manual tem prioridade (ex.: produto voltou, perdeu só o frete)', () => {
    expect(perdaRealDePedido(frustrado('a', 735, '6 POTE', 33))).toBe(33);
  });

  it('ajuste de zero é respeitado (nada foi perdido)', () => {
    expect(perdaRealDePedido(frustrado('a', 735, '6 POTE', 0))).toBe(0);
  });
});

describe('frustrados no P&L', () => {
  const pedidos: Pedido[] = [
    // 1 venda aprovada para haver receita
    {
      id: 'ok',
      status: 'pagos',
      data: '2026-08-10',
      data_aprovacao: '2026-08-10',
      valor: 735,
      valor_bruto: 735,
      valor_agendado: 735,
      produto_plano: 'DERMAX PREMIUM - 6 POTE',
      vendedor: 'PETER',
    },
    frustrado('f1', 735, '6 POTE'),
    frustrado('f2', 735, '6 POTE'),
  ];

  it('separa o valor dos pedidos da perda real', () => {
    const agg = agregarPedidos(pedidos, periodo);
    expect(agg.valor_frustrado).toBe(1470); // 2 x 735 — receita não realizada
    expect(agg.perda_real_frustrados).toBe(232); // 2 x (83 + 33) — caixa
  });

  it('o que desconta do lucro é a perda real, não o valor dos pedidos', () => {
    const semDesconto = calcularPnl([], [], periodo, {}, pedidos);
    const comDesconto = calcularPnl([], [], periodo, { considerarFrustrados: true }, pedidos);

    expect(semDesconto.valor_frustrado).toBe(147_000); // R$ 1.470,00
    expect(semDesconto.perda_real_frustrados).toBe(23_200); // R$ 232,00

    // A diferença entre ligar e desligar é exatamente a perda real.
    expect(semDesconto.lucro_real - comDesconto.lucro_real).toBe(23_200);
  });

  it('respeita o ajuste manual no total do período', () => {
    const ajustados = [pedidos[0], frustrado('f1', 735, '6 POTE', 33), frustrado('f2', 735, '6 POTE')];
    const pnl = calcularPnl([], [], periodo, { considerarFrustrados: true }, ajustados);
    expect(pnl.perda_real_frustrados).toBe(14_900); // 33 + 116 = R$ 149,00
  });
});
