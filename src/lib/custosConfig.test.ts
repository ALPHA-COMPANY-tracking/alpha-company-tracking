import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { custoProdutoDoPlano, custosDePedidos } from '@/lib/custosConfig';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

function ped(id: string, status: string, plano: string): Pedido {
  return { id, status, valor: 735, data: '2026-08-15', produto_plano: plano };
}

describe('custoProdutoDoPlano', () => {
  it('detecta 6 potes e 3 potes pelo texto do plano', () => {
    expect(custoProdutoDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME')).toBe(83);
    expect(custoProdutoDoPlano('DERMAX PREMIUM - 3 POTE + 1 GOTA')).toBe(32.5);
    expect(custoProdutoDoPlano('desconhecido')).toBe(0);
  });
});

describe('custosDePedidos', () => {
  it('soma COGS + frete só dos aprovados (em centavos)', () => {
    const pedidos = [
      ped('1', 'pagos', 'DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME'),
      ped('2', 'pagos', 'DERMAX PREMIUM - 3 POTE + 1 GOTA'),
      ped('3', 'enviados', 'DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME'), // pipeline: ignora
    ];
    const r = custosDePedidos(pedidos, periodo);
    expect(r.custo_produtos).toBe(8300 + 3250); // 83,00 + 32,50
    expect(r.frete).toBe(3300 * 2); // R$ 33 × 2 aprovados
  });
});
