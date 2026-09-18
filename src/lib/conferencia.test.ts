// Conferência com o BlueSales: achar a venda a mais sem procurar à mão.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { agendadoPorDia, agregarPedidos, possiveisDuplicados } from '@/lib/pedidos';

const SET = { inicio: '2026-09-01', fim: '2026-09-17' };

const ped = (id: string, data: string, valor: number, cliente: string | null, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  status: 'enviados',
  data,
  valor,
  valor_agendado: valor,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  cliente,
  ...extra,
});

describe('possíveis duplicados', () => {
  it('mesmo cliente com dois pedidos, escrito de jeitos diferentes', () => {
    const pedidos = [
      ped('a', '2026-09-15', 735, 'Maria Aparecida Lima Gomes'),
      ped('b', '2026-09-15', 535, 'MARIA APARECIDA  LIMA GOMES'),
      ped('c', '2026-09-10', 735, 'Outra Pessoa'),
    ];
    const grupos = possiveisDuplicados(pedidos, SET);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('acento não separa o mesmo nome', () => {
    const grupos = possiveisDuplicados([ped('a', '2026-09-02', 735, 'Cecília Simões'), ped('b', '2026-09-03', 735, 'CECILIA SIMOES')], SET);
    expect(grupos).toHaveLength(1);
  });

  it('venda já tirada da plataforma não conta, nem pedido sem nome', () => {
    const pedidos = [
      ped('a', '2026-09-15', 735, 'Fulana de Tal'),
      ped('b', '2026-09-15', 535, 'Fulana de Tal', { removido_em: '2026-09-16T10:00:00Z' }),
      ped('c', '2026-09-15', 735, null),
      ped('d', '2026-09-15', 735, null),
    ];
    expect(possiveisDuplicados(pedidos, SET)).toEqual([]);
  });

  it('recompra depois de um frustrado de outro mês NÃO é duplicado (caso Adelia)', () => {
    // Frustrado em agosto, nova venda paga em setembro: duas vendas reais.
    const pedidos = [
      ped('frustrado', '2026-08-20', 735, 'Adelia Pereira', { status: 'frustrados' }),
      ped('novo', '2026-09-11', 735, 'Adelia Pereira', { status: 'pagos' }),
    ];
    expect(possiveisDuplicados(pedidos, SET)).toEqual([]);
  });
});

describe('agendado por dia', () => {
  it('soma do dia fecha com o Faturamento Agendado do período', () => {
    const pedidos = [
      ped('a', '2026-09-15', 735, 'A'),
      ped('b', '2026-09-15', 535, 'B', { valor: 500 }), // desconto depois: agendado segue 535
      ped('c', '2026-09-16', 735, 'C', { status: 'frustrados' }),
      ped('d', '2026-09-16', 735, 'D', { removido_em: '2026-09-17T00:00:00Z' }),
    ];
    const dias = agendadoPorDia(pedidos, SET);
    expect(dias).toEqual([
      { data: '2026-09-16', qtd: 1, valor: 735 },
      { data: '2026-09-15', qtd: 2, valor: 1270 },
    ]);
    const agg = agregarPedidos(pedidos, SET);
    expect(dias.reduce((s, d) => s + d.valor, 0)).toBe(agg.valor_agendado);
    expect(dias.reduce((s, d) => s + d.qtd, 0)).toBe(agg.qtd_agendados);
  });
});
