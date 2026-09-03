// Venda tirada da plataforma à mão (cancelada e excluída no BlueSales).
//
// O risco aqui é a remoção ficar só na tela: o pedido sumiria da lista e
// continuaria somando no Faturamento Agendado. Estes testes travam a
// remoção em TODOS os números.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agregarPedidos, pedidosAtivos } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { taxasDoPeriodo } from '@/lib/taxas';

const periodo: Periodo = { inicio: '2026-09-01', fim: '2026-09-30' };

function venda(id: string, valor: number, vendedor: string, extra: Partial<Pedido> = {}): Pedido {
  return {
    id,
    status: 'cadastrados',
    data: '2026-09-03',
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    vendedor,
    ...extra,
  };
}

describe('venda removida', () => {
  it('sai do Faturamento Agendado e da contagem', () => {
    const todos = [
      venda('a', 735, 'PETER'),
      venda('b', 735, 'PETER'),
      venda('c', 735, 'Matheus'),
      venda('cancelada', 735, 'Matheus', { removido_em: '2026-09-03T18:00:00Z' }),
    ];
    const agg = agregarPedidos(todos, periodo);
    expect(agg.qtd_agendados).toBe(3);
    expect(agg.valor_agendado).toBe(2_205); // 4 × 735 = 2.940 − 735
  });

  it('sai também do vendedor, para a comissão não pagar por ela', () => {
    const todos = [
      venda('a', 735, 'Matheus', { status: 'pagos', data_aprovacao: '2026-09-03' }),
      venda('cancelada', 735, 'Matheus', { status: 'pagos', data_aprovacao: '2026-09-03', removido_em: '2026-09-03T18:00:00Z' }),
    ];
    const pnl = calcularPnl([], [], periodo, {}, todos);
    expect(pnl.receita_aprovada).toBe(73_500);
    const m = pnl.comissoes_por_vendedor.find((v) => v.nome === 'Matheus')!;
    expect(m.receita).toBe(73_500);
    expect(m.comissao).toBe(4_410); // 6% de 735, não de 1.470
  });

  it('sai do custo de produto e do frete', () => {
    const pago = { status: 'pagos', data_aprovacao: '2026-09-03' };
    const um = calcularPnl([], [], periodo, {}, [venda('a', 735, 'PETER', pago)]);
    const doisComUmaRemovida = calcularPnl([], [], periodo, {}, [
      venda('a', 735, 'PETER', pago),
      venda('cancelada', 735, 'PETER', { ...pago, removido_em: '2026-09-03T18:00:00Z' }),
    ]);
    expect(doisComUmaRemovida.custo_produtos).toBe(um.custo_produtos);
    expect(doisComUmaRemovida.frete).toBe(um.frete);
  });

  it('sai da taxa de plataforma vinda do pagamento', () => {
    const pago = { status: 'pagos', data_aprovacao: '2026-09-03' };
    const todos = [
      venda('a', 735, 'PETER', { ...pago, taxa_plataforma: 2.5 }),
      venda('cancelada', 735, 'PETER', { ...pago, taxa_plataforma: 2.5, removido_em: '2026-09-03T18:00:00Z' }),
    ];
    expect(taxasDoPeriodo(todos, [], periodo)).toBe(250); // só R$ 2,50
  });

  it('a lista crua continua trazendo a removida, para poder devolver', () => {
    const todos = [venda('a', 735, 'PETER'), venda('x', 735, 'PETER', { removido_em: '2026-09-03T18:00:00Z' })];
    expect(todos).toHaveLength(2);
    expect(pedidosAtivos(todos).map((p) => p.id)).toEqual(['a']);
  });
});
