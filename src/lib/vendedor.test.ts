// Painel do Vendedor: só os pedidos dele, com as regras do P&L.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { pedidosDoVendedor, resumoDoVendedor } from '@/lib/vendedor';

const P = { inicio: '2026-09-01', fim: '2026-09-30' };
let n = 0;
const ped = (vendedor: string, status: string, data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${++n}`,
  internal_id: n,
  status,
  data,
  valor: 735,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor,
  ...extra,
});

const pedidos = [
  ped('PETER', 'pagos', '2026-09-05', { data_aprovacao: '2026-09-09' }),
  ped('PETER', 'pagos', '2026-08-28', { data_aprovacao: '2026-09-02', valor: 700 }), // agendado em agosto, pago em setembro
  ped('PETER', 'enviados', '2026-09-20'),
  ped('PETER', 'roubo', '2026-09-12'),
  ped('Peter ', 'cadastrados', '2026-09-28'), // mesmo vendedor, escrito diferente
  ped('PETER', 'enviados', '2026-09-21', { removido_em: '2026-09-22T10:00:00Z' }), // excluído
  ped('Matheus', 'pagos', '2026-09-06', { data_aprovacao: '2026-09-07' }),
  ped('Matheus', 'enviados', '2026-09-20'),
];

describe('Painel do Vendedor', () => {
  it('só os pedidos dele, sem os excluídos', () => {
    expect(pedidosDoVendedor(pedidos, 'PETER')).toHaveLength(5);
    expect(pedidosDoVendedor(pedidos, 'matheus')).toHaveLength(2);
  });

  it('agendado pela data do pedido; pagos e comissão pela data do pagamento', () => {
    const r = resumoDoVendedor(pedidos, 'PETER', P, '2026-09-28');
    expect(r.agendado).toEqual({ qtd: 4, valor: 4 * 73_500 });
    expect(r.pagos).toEqual({ qtd: 2, valor: 73_500 + 70_000 });
    expect(r.pct).toBe(0.05);
    expect(r.comissao).toBe(Math.round((73_500 + 70_000) * 0.05)); // 5% do pago cheio
    expect(r.conversao).toBeCloseTo(2 / 4, 5);
    expect(r.agendado_hoje).toEqual({ qtd: 1, valor: 73_500 });
  });

  it('em rota = na rua, e a comissão possível dele', () => {
    const r = resumoDoVendedor(pedidos, 'PETER', P, '2026-09-28');
    expect(r.situacao.rota.qtd).toBe(1);
    expect(r.situacao.preparo.qtd).toBe(1);
    expect(r.situacao.frustracao.qtd).toBe(1);
    expect(r.comissao_em_rota).toBe(Math.round(73_500 * 0.05));
  });

  it('Matheus ganha 6% e não vê nada do PETER', () => {
    const r = resumoDoVendedor(pedidos, 'Matheus', P, '2026-09-28');
    expect(r.pct).toBe(0.06);
    expect(r.pedidos.every((p) => p.vendedor === 'Matheus')).toBe(true);
    expect(r.comissao).toBe(Math.round(73_500 * 0.06));
  });
});
