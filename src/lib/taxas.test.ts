// Taxa de plataforma: de onde ela sai e como o P&L a soma.
//
// A escolha é por DIA — pagamento primeiro, total do dia como reserva —
// para que um período que pegue dias antigos (só total do dia) e dias
// novos (taxa por pagamento) some os dois sem contar nada duas vezes.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { taxasDoPeriodo, taxasPorDia } from '@/lib/taxas';
import { calcularPnl } from '@/lib/pnl';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

function daily(data: string, taxas: number, conferida = false): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: taxas, taxa_conferida: conferida,
    custo_produtos: 0, frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0,
    investimento_ads: 0, taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0,
    valor_agendado: 0, qtd_agendados: 0,
  };
}

function pago(id: string, valor: number, dia: string, taxa?: number): Pedido {
  return {
    id,
    status: 'pagos',
    data: dia,
    data_aprovacao: dia,
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    vendedor: 'PETER',
    ...(taxa != null ? { taxa_plataforma: taxa } : {}),
  };
}

describe('taxasPorDia', () => {
  it('sem taxa no pagamento, vale o total do dia', () => {
    const [linha] = taxasPorDia([pago('a', 735, '2026-08-14')], [daily('2026-08-14', 5)], periodo);
    expect(linha.cents).toBe(500);
    expect(linha.fonte).toBe('dia');
  });

  it('com taxa no pagamento, o pagamento manda', () => {
    const pedidos = [pago('a', 735, '2026-08-14', 2.5), pago('b', 735, '2026-08-14', 2.5)];
    // Mesmo com R$ 99 lançados no dia, quem vale é a soma dos pagamentos.
    const [linha] = taxasPorDia(pedidos, [daily('2026-08-14', 99)], periodo);
    expect(linha.cents).toBe(500);
    expect(linha.fonte).toBe('pagamento');
    expect(linha.qtd_com_taxa).toBe(2);
  });

  it('num dia parcialmente taxado, os pagamentos sem taxa contam zero', () => {
    // O normal é só parte dos pagamentos ser taxada (boleto, por exemplo).
    const pedidos = [pago('a', 735, '2026-08-14', 2.5), pago('b', 735, '2026-08-14')];
    const [linha] = taxasPorDia(pedidos, [], periodo);
    expect(linha.cents).toBe(250);
    expect(linha.qtd_pagamentos).toBe(2);
    expect(linha.qtd_com_taxa).toBe(1);
  });

  it('dia com pagamento e nada lançado fica marcado como ausente', () => {
    const [linha] = taxasPorDia([pago('a', 735, '2026-08-14')], [], periodo);
    expect(linha.cents).toBe(0);
    expect(linha.fonte).toBe('ausente');
  });

  it('R$ 0,00 conferido NÃO é o mesmo que taxa faltando', () => {
    // Metade dos dias de agosto/2026 não teve taxa nenhuma; sem essa
    // distinção o aviso de pendência apontaria dia certo.
    const [linha] = taxasPorDia([pago('a', 735, '2026-08-15')], [daily('2026-08-15', 0, true)], periodo);
    expect(linha.cents).toBe(0);
    expect(linha.fonte).toBe('dia');
  });

  it('mistura as duas fontes sem contar duas vezes', () => {
    const pedidos = [
      pago('velho', 735, '2026-08-14'), // dia antigo: só total do dia
      pago('novo', 435, '2026-08-28', 2.5), // dia novo: taxa no pagamento
    ];
    const total = taxasDoPeriodo(pedidos, [daily('2026-08-14', 5), daily('2026-08-28', 99)], periodo);
    expect(total).toBe(500 + 250); // R$ 7,50
  });
});

describe('a taxa chega ao P&L', () => {
  it('taxa vinda do pagamento reduz a comissão do vendedor', () => {
    // Os R$ 1.170,00 do caso real: 5% dão 58,50 sem taxa e 58,25 com
    // R$ 5,00 — agora vindo do próprio pagamento, sem lançamento manual.
    const pedidos = [pago('a', 735, '2026-08-20', 2.5), pago('b', 435, '2026-08-20', 2.5)];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);
    expect(pnl.receita_aprovada).toBe(117_000);
    expect(pnl.taxas_plataforma).toBe(500);
    expect(pnl.comissoes_vendedor).toBe(5_825);
  });

  it('agosto/2026 continua fechando em R$ 1.266,66 pelo total do dia', () => {
    const pedidos = [pago('a', 25_358.25, '2026-08-10')];
    const pnl = calcularPnl([daily('2026-08-10', 25)], [], periodo, {}, pedidos);
    expect(pnl.taxas_plataforma).toBe(2_500);
    expect(pnl.comissoes_vendedor).toBe(126_666);
  });
});
