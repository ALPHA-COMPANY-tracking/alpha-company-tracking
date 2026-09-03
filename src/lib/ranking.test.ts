// Ranking de vendedores.
//
// A regra que mais importa aqui: agendado conta pela data de CRIAÇÃO e
// aprovado pela data do PAGAMENTO. É o que faz o ranking do dia bater
// com o que o vendedor fechou naquele dia, e não com o caixa.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { comparativoPorPeriodo, ordenar, rankingVendedores } from '@/lib/ranking';

const periodo: Periodo = { inicio: '2026-09-01', fim: '2026-09-30' };

function daily(data: string, taxas: number): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: taxas, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0, leads: 0,
  };
}

function pedido(over: Partial<Pedido> & { id: string; vendedor: string; data: string }): Pedido {
  return {
    status: 'cadastrados',
    valor: 735,
    valor_bruto: 735,
    valor_agendado: 735,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    ...over,
  };
}

const de = (nome: string, linhas: ReturnType<typeof rankingVendedores>) =>
  linhas.find((l) => l.nome.toUpperCase() === nome.toUpperCase())!;

describe('rankingVendedores', () => {
  it('agendado conta pela criação; aprovado, pelo pagamento', () => {
    // Agendado em 01/09, pago em 03/09: agendamento do dia 01, receita do 03.
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01', status: 'pagos', data_aprovacao: '2026-09-03' }),
    ];

    const dia1 = rankingVendedores(p, [], { inicio: '2026-09-01', fim: '2026-09-01' });
    expect(de('PETER', dia1).agendado).toBe(73_500);
    expect(de('PETER', dia1).aprovado).toBe(0);

    const dia3 = rankingVendedores(p, [], { inicio: '2026-09-03', fim: '2026-09-03' });
    expect(de('PETER', dia3).agendado).toBe(0);
    expect(de('PETER', dia3).aprovado).toBe(73_500);
  });

  it('junta o mesmo vendedor escrito de formas diferentes', () => {
    // O BlueSales manda "Matheus", "MATHEUS" e "Matheus " (com espaço).
    const p = [
      pedido({ id: 'a', vendedor: 'Matheus', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'MATHEUS', data: '2026-09-02' }),
      pedido({ id: 'c', vendedor: 'Matheus ', data: '2026-09-03' }),
    ];
    const linhas = rankingVendedores(p, [], periodo);
    const dele = linhas.filter((l) => l.nome.trim().toUpperCase() === 'MATHEUS');
    expect(dele).toHaveLength(1);
    expect(dele[0].qtd_agendados).toBe(3);
  });

  it('frustrado sai do agendado e entra como perda', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-02', status: 'frustrados' }),
    ];
    const peter = de('PETER', rankingVendedores(p, [], periodo));
    expect(peter.qtd_agendados).toBe(1);
    expect(peter.agendado).toBe(73_500);
    expect(peter.qtd_frustrados).toBe(1);
    expect(peter.frustrado).toBe(73_500);
  });

  it('conversão olha só o que o vendedor agendou no período', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01', status: 'pagos', data_aprovacao: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-02' }),
      // Pago no período, mas agendado ANTES: não conta na conversão dele.
      pedido({ id: 'c', vendedor: 'PETER', data: '2026-08-20', status: 'pagos', data_aprovacao: '2026-09-05' }),
    ];
    const peter = de('PETER', rankingVendedores(p, [], periodo));
    expect(peter.qtd_agendados).toBe(2);
    expect(peter.qtd_agendados_pagos).toBe(1);
    expect(peter.conversao).toBeCloseTo(0.5);
    expect(peter.qtd_aprovados).toBe(2); // o caixa do período conta os dois
  });

  it('venda excluída na tela de Vendas sai do ranking', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-01', removido_em: '2026-09-03T12:00:00Z' }),
    ];
    expect(de('PETER', rankingVendedores(p, [], periodo)).qtd_agendados).toBe(1);
  });

  it('a comissão é a MESMA da Demonstração de Resultados', () => {
    // Se as duas telas divergirem, o vendedor cobra e ninguém sabe quem
    // está certo. O ranking usa o mesmo código do P&L de propósito.
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01', status: 'pagos', data_aprovacao: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'Matheus', data: '2026-09-02', status: 'pagos', data_aprovacao: '2026-09-02', valor: 435 }),
    ];
    const dailies = [daily('2026-09-01', 5)];

    const pnl = calcularPnl(dailies, [], periodo, {}, p);
    const linhas = rankingVendedores(p, dailies, periodo);

    for (const c of pnl.comissoes_por_vendedor) {
      expect(de(c.nome, linhas).comissao).toBe(c.comissao);
    }
    const somaRanking = linhas.reduce((s, l) => s + l.comissao, 0);
    expect(somaRanking).toBe(pnl.comissoes_vendedor);
  });

  it('vendedor sem venda no período aparece zerado, não some', () => {
    const linhas = rankingVendedores([pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' })], [], periodo);
    const matheus = de('MATHEUS', linhas);
    expect(matheus.qtd_agendados).toBe(0);
    expect(matheus.pct).toBe(0.06); // a taxa combinada continua visível
  });
});

describe('ordenação', () => {
  const p = [
    // PETER: 2 pedidos, R$ 1.470 agendado, nada pago.
    pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' }),
    pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-02' }),
    // Matheus: 1 pedido de R$ 2.000, pago.
    pedido({
      id: 'c', vendedor: 'Matheus', data: '2026-09-01', status: 'pagos',
      data_aprovacao: '2026-09-01', valor: 2000, valor_agendado: 2000,
    }),
  ];

  it('por agendado, quem vendeu mais em valor', () => {
    expect(rankingVendedores(p, [], periodo, 'agendado')[0].nome).toBe('Matheus');
  });

  it('por quantidade, quem fechou mais pedidos', () => {
    expect(rankingVendedores(p, [], periodo, 'qtd_agendados')[0].nome).toBe('PETER');
  });

  it('por aprovado, quem trouxe mais dinheiro para o caixa', () => {
    expect(rankingVendedores(p, [], periodo, 'aprovado')[0].nome).toBe('Matheus');
  });

  it('a ordem não oscila quando dá empate', () => {
    const empate = [
      pedido({ id: 'a', vendedor: 'ANA', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'BRUNO', data: '2026-09-01' }),
    ];
    const uma = ordenar(rankingVendedores(empate, [], periodo), 'agendado').map((l) => l.nome);
    const outra = ordenar(rankingVendedores(empate, [], periodo), 'agendado').map((l) => l.nome);
    expect(uma).toEqual(outra);
  });
});

describe('comparativo entre períodos', () => {
  it('dá a posição de cada um em cada janela', () => {
    const hoje = '2026-09-10';
    const p = [
      // Hoje: só o Matheus vendeu.
      pedido({ id: 'a', vendedor: 'Matheus', data: hoje }),
      // Ontem: só o PETER.
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-09' }),
      // Dentro dos 7 dias, PETER soma mais.
      pedido({ id: 'c', vendedor: 'PETER', data: '2026-09-08' }),
    ];
    const cols = comparativoPorPeriodo(p, [], 'agendado', hoje);

    const doDia = cols.find((c) => c.label === 'Hoje')!;
    expect(doDia.posicao.get('MATHEUS')).toBe(1);
    expect(doDia.posicao.has('PETER')).toBe(false); // não vendeu hoje: sem posição

    const ontem = cols.find((c) => c.label === 'Ontem')!;
    expect(ontem.posicao.get('PETER')).toBe(1);

    const sete = cols.find((c) => c.label === '7 dias')!;
    expect(sete.posicao.get('PETER')).toBe(1);
    expect(sete.posicao.get('MATHEUS')).toBe(2);
  });
});
