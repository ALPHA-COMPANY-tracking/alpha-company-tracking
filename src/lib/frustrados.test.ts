// Perda dos pedidos frustrados — o "Custo real de frustração" do BlueSales.
//
// O valor do pedido é a receita que NÃO entrou (informativa); o que sai do
// caixa segue as regras de custo do BlueSales (tela de 30/09/2026), e é
// isso que desconta do lucro.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { perdaRealDePedido, perdaSemCusto } from '@/lib/custosConfig';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

/** Pedido perdido — por padrão um roubo (a mercadoria não volta). */
function perdido(id: string, valor: number, plano: string, perda_real?: number, status = 'roubo'): Pedido {
  return {
    id,
    status,
    data: '2026-08-15',
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: `DERMAX PREMIUM - ${plano}`,
    vendedor: 'PETER',
    ...(perda_real != null ? { perda_real } : {}),
  };
}

describe('regras de custo do BlueSales', () => {
  it('roubo / perdido / apreendido / perda de cobrança: frete + produto', () => {
    expect(perdaRealDePedido(perdido('a', 735, '6 POTE'))).toBe(116); // 83 + 33
    expect(perdaRealDePedido(perdido('a', 435, '3 POTE'))).toBe(65.5); // 32,50 + 33
    for (const status of ['perdido', 'apreendido', 'perda_cobranca', 'extraviado'])
      expect(perdaRealDePedido(perdido('a', 735, '6 POTE', undefined, status))).toBe(116);
  });

  it('só o frete: devolvido, voltando, aguardando devolução e frustrado antigo (legado)', () => {
    for (const status of ['devolvido', 'devolvido_automatico', 'voltando', 'aguardando_devolucao', 'frustrados'])
      expect(perdaRealDePedido(perdido('a', 735, '6 POTE', undefined, status))).toBe(33);
  });

  it('devolvido reverso: frete de ida + de volta', () => {
    expect(perdaRealDePedido(perdido('a', 735, '6 POTE', undefined, 'devolvido_reverso'))).toBe(66);
  });

  it('cancelado: com custo (postado) perde o frete; não postado não entra', () => {
    const postado = { ...perdido('a', 735, '6 POTE', undefined, 'cancelados'), rastreamento: 'AP123BR' };
    expect(perdaSemCusto(postado)).toBe(false);
    expect(perdaRealDePedido(postado)).toBe(33);
    const naoPostado = perdido('b', 735, '6 POTE', undefined, 'cancelados');
    expect(perdaSemCusto(naoPostado)).toBe(true);
    expect(perdaRealDePedido(naoPostado)).toBe(0);
  });

  it('recusado não entra', () => {
    expect(perdaSemCusto(perdido('a', 735, '6 POTE', undefined, 'recusado'))).toBe(true);
  });

  it('marcação à mão vale: s/ custo (0) fica fora, c/ custo (frete) entra', () => {
    expect(perdaSemCusto(perdido('a', 735, '6 POTE', 0, 'devolvido'))).toBe(true);
    expect(perdaRealDePedido(perdido('a', 735, '6 POTE', 0, 'devolvido'))).toBe(0);
    const marcado = perdido('b', 735, '6 POTE', 33, 'cancelados'); // não postado, mas marcado c/ custo
    expect(perdaSemCusto(marcado)).toBe(false);
    expect(perdaRealDePedido(marcado)).toBe(33);
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
    perdido('f1', 735, '6 POTE'),
    perdido('f2', 735, '6 POTE'),
    perdido('c1', 735, '6 POTE', undefined, 'cancelados'), // não postado: não entra
  ];

  it('separa a receita frustrada do custo real — e o que não gerou custo fica fora', () => {
    const agg = agregarPedidos(pedidos, periodo);
    expect(agg.qtd_frustrados).toBe(2);
    expect(agg.valor_frustrado).toBe(1470); // 2 x 735 — receita que não entrou
    expect(agg.perda_real_frustrados).toBe(232); // 2 x (83 + 33) — caixa
  });

  it('o padrão desconta o custo real — como o BlueSales desde 30/09/2026', () => {
    const padrao = calcularPnl([], [], periodo, {}, pedidos);
    const nenhum = calcularPnl([], [], periodo, { descontarFrustrados: 'nenhum' }, pedidos);
    expect(padrao.modo_frustrados).toBe('real');
    expect(padrao.valor_frustrado).toBe(147_000); // R$ 1.470,00 (informativo)
    expect(padrao.desconto_frustrados).toBe(23_200); // R$ 232,00
    expect(nenhum.desconto_frustrados).toBe(0);
    // O lucro cai exatamente o custo real — nunca o valor dos pedidos.
    expect(nenhum.lucro_real - padrao.lucro_real).toBe(23_200);
  });

  it('respeita o ajuste manual no total do período', () => {
    const ajustados = [pedidos[0], perdido('f1', 735, '6 POTE', 33), perdido('f2', 735, '6 POTE')];
    const pnl = calcularPnl([], [], periodo, {}, ajustados);
    expect(pnl.perda_real_frustrados).toBe(14_900); // 33 + 116 = R$ 149,00
  });
});
