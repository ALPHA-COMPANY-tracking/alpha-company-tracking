// Ranking de vendedores.
//
// A regra que mais importa aqui: agendado conta pela data de CRIAÇÃO e
// aprovado pela data do PAGAMENTO. É o que faz o ranking do dia bater
// com o que o vendedor fechou naquele dia, e não com o caixa.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { anuncioDoPeriodo, comparativoPorPeriodo, deFora, foraDoRanking, ordenar, rankingVendedores } from '@/lib/ranking';

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

  it('frustrado e cancelado continuam no agendado, como no Ranking do BlueSales', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-02', status: 'devolvido' }),
      pedido({ id: 'c', vendedor: 'PETER', data: '2026-09-02', status: 'roubo', valor_agendado: 435 }),
      pedido({ id: 'd', vendedor: 'PETER', data: '2026-09-03', status: 'cancelados', valor_agendado: 535 }),
    ];
    const peter = de('PETER', rankingVendedores(p, [], periodo));
    expect(peter.qtd_agendados).toBe(4);
    expect(peter.agendado).toBe(73_500 + 73_500 + 43_500 + 53_500);
    // A frustração fica à vista (já dentro do agendado); cancelado não é frustração.
    expect(peter.qtd_frustrados).toBe(2);
    expect(peter.frustrado).toBe(73_500 + 43_500);
  });

  it('recusado, aguardando pagamento e excluído ficam fora; antecipado pago entra', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'Matheus', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'Matheus', data: '2026-09-01', status: 'recusados' }),
      pedido({ id: 'c', vendedor: 'Matheus', data: '2026-09-01', status: 'aguard_pagamento', tipo_venda: 'antecipado' }),
      pedido({ id: 'd', vendedor: 'Matheus', data: '2026-09-01', removido_em: '2026-09-02T10:00:00Z' }),
      pedido({
        id: 'e', vendedor: 'Matheus', data: '2026-09-01', status: 'pagos', tipo_venda: 'antecipado',
        data_aprovacao: '2026-09-01', valor: 335, valor_agendado: 335,
      }),
    ];
    const matheus = de('MATHEUS', rankingVendedores(p, [], periodo));
    expect(matheus.qtd_agendados).toBe(2);
    expect(matheus.agendado).toBe(73_500 + 33_500);
  });

  it('bate com o Ranking do BlueSales de 01–23/11/2026, etapa por etapa', () => {
    // Composição real de cada vendedor (Vendas Agendadas × Ranking do
    // BlueSales, conferida em 23/11/2026). [etapa, pedidos, valor total]
    const etapas: Record<string, [string, number, number, { tipo_venda?: string; removido_em?: string }?][]> = {
      'Lucas Magalhães': [
        ['aguard_coleta', 23, 11_305], ['cadastrados', 3, 1_905], ['saiu_para_entrega', 21, 11_035],
        ['enviados', 38, 20_830], ['entregues', 21, 11_100], ['cobrados', 13, 6_955], ['pagos', 15, 7_525],
        ['pagos', 2, 670, { tipo_venda: 'antecipado' }], ['cancelados', 7, 3_645], ['devolvido', 2, 1_170],
        ['roubo', 1, 735], ['cancelados', 3, 1_505, { removido_em: '2026-11-20T00:00:00Z' }],
      ],
      PETER: [
        ['cadastrados', 3, 1_905], ['aguard_coleta', 23, 13_970], ['saiu_para_entrega', 8, 4_945],
        ['enviados', 32, 18_720], ['entregues', 15, 9_125], ['cobrados', 16, 9_810], ['pagos', 34, 18_055],
        ['cancelados', 3, 905], ['devolvido', 6, 3_310], ['aguard_pagamento', 1, 685, { tipo_venda: 'antecipado' }],
        ['cancelados', 5, 3_175, { removido_em: '2026-11-20T00:00:00Z' }],
      ],
      Matheus: [
        ['aguard_coleta', 11, 6_485], ['enviados', 29, 16_365], ['saiu_para_entrega', 6, 3_010],
        ['entregues', 8, 5_280], ['cobrados', 16, 10_260], ['pagos', 18, 10_060],
        ['pagos', 1, 735, { tipo_venda: 'antecipado' }], ['cancelados', 4, 1_940], ['devolvido', 4, 2_340],
        ['recusados', 1, 735], ['cancelados', 1, 735, { removido_em: '2026-11-20T00:00:00Z' }],
      ],
      'Alyenderson Lima': [['pagos', 1, 400]],
    };
    const p: Pedido[] = [];
    for (const [vendedor, grupos] of Object.entries(etapas)) {
      for (const [status, n, total, extra] of grupos) {
        // Reparte o total em reais entre os n pedidos (o último leva a sobra).
        const base = Math.floor(total / n);
        for (let i = 0; i < n; i++) {
          const v = i === n - 1 ? total - base * (n - 1) : base;
          p.push(
            pedido({
              id: `${vendedor}-${status}-${p.length}`, vendedor, data: '2026-11-10', status,
              valor: v, valor_agendado: v, data_aprovacao: '2026-11-12', ...extra,
            }),
          );
        }
      }
    }
    const nov = rankingVendedores(p, [], { inicio: '2026-11-01', fim: '2026-11-23' }, 'qtd_agendados');
    const placar = nov.filter((l) => l.qtd_agendados > 0).map((l) => [l.nome, l.qtd_agendados, l.agendado]);
    // #4180 (PETER, 735) e #3858 (Matheus, 735) com o valor do BlueSales.
    expect(placar).toEqual([
      ['Lucas Magalhães', 146, 76_875_00],
      ['PETER', 140, 80_745_00],
      ['Matheus', 97, 56_475_00],
    ]);
    // Alyenderson não disputa posição, mas aparece no "fora do ranking".
    const fora = deFora(p, [], { inicio: '2026-11-01', fim: '2026-11-23' });
    expect(fora.map((l) => [l.nome, l.qtd_agendados, l.agendado])).toEqual([['Alyenderson Lima', 1, 400_00]]);
  });

  it('quem não é vendedor no BlueSales fica fora da disputa, mas não some', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-01' }),
      pedido({ id: 'b', vendedor: 'Jonas Neto', data: '2026-09-01', status: 'pagos', data_aprovacao: '2026-09-01' }),
      pedido({ id: 'c', vendedor: 'alyenderson lima ', data: '2026-09-02' }),
    ];
    const linhas = rankingVendedores(p, [], periodo);
    expect(linhas.map((l) => l.nome)).not.toContain('Jonas Neto');
    expect(linhas.some((l) => foraDoRanking(l.nome))).toBe(false);
    const fora = deFora(p, [], periodo);
    expect(fora.map((l) => l.nome).sort()).toEqual(['Jonas Neto', 'alyenderson lima']);
    // A comissão dele continua no P&L (o ranking só não o põe na disputa).
    const pnl = calcularPnl([], [], periodo, {}, p);
    expect(pnl.comissoes_por_vendedor.some((c) => c.nome === 'Jonas Neto')).toBe(true);
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
    // O ranking mostra o que cada um recebe (cheio); a linha do P&L tira a
    // parte da taxa — a diferença entre os dois é exatamente essa parte.
    const somaRanking = linhas.reduce((s, l) => s + l.comissao, 0);
    const parteDaTaxa = pnl.comissoes_por_vendedor.reduce((s, c) => s + c.taxa_descontada, 0);
    expect(parteDaTaxa).toBeGreaterThan(0);
    expect(somaRanking - parteDaTaxa).toBe(pnl.comissoes_vendedor);
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

describe('lucro por vendedor (coluna "Lucro" do Ranking do BlueSales)', () => {
  const comAnuncio = (data: string, ads: number): AfterpayDaily => ({ ...daily(data, 0), investimento_ads: ads });

  it('o anúncio é dividido IGUAL entre os vendedores: quem não recebeu nada fica com −anúncio ÷ 3', () => {
    // 23/11/2026: R$ 1.942,42 de anúncio no dia, Matheus sem pagamento → −R$ 647,47.
    const dia = { inicio: '2026-11-23', fim: '2026-11-23' };
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-11-23' }),
      pedido({ id: 'b', vendedor: 'Lucas Magalhães', data: '2026-11-23' }),
      pedido({ id: 'c', vendedor: 'Matheus', data: '2026-11-23' }),
    ];
    const linhas = rankingVendedores(p, [comAnuncio('2026-11-23', 1942.42)], dia);
    expect(linhas.map((l) => l.custos.anuncio).sort()).toEqual([64_747, 64_747, 64_748]);
    expect(linhas.reduce((s, l) => s + l.custos.anuncio, 0)).toBe(194_242);
    expect(de('Matheus', linhas).lucro).toBeLessThanOrEqual(-64_747);
    expect(de('Matheus', linhas).margem_lucro).toBeNull(); // sem aprovado, sem "%"
  });

  it('o lucro de cada um é o que entrou menos os custos dos pedidos dele e a parte do anúncio', () => {
    const p = [
      // PETER: 6 potes pago no boleto em 05/09 (produto 83, frete 33, taxa 2,50).
      pedido({
        id: 'a', vendedor: 'PETER', data: '2026-09-02', status: 'pagos', data_aprovacao: '2026-09-05',
        metodo_pagamento: 'boleto', enviado_em: '2026-09-03T10:00:00Z',
      }),
      // PETER: roubo de um pedido de setembro → perda real produto + frete.
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-03', status: 'roubo', enviado_em: '2026-09-04T10:00:00Z' }),
      // Matheus: só agendou.
      pedido({ id: 'c', vendedor: 'Matheus', data: '2026-09-04' }),
    ];
    const linhas = rankingVendedores(p, [comAnuncio('2026-09-05', 1000)], periodo);
    const peter = de('PETER', linhas);
    expect(peter.custos).toEqual({
      taxas: 250,
      produto: 8_300,
      frete: 3_300,
      comissao: Math.round((73_500 - 250) * 0.05),
      cobranca: 735,
      anuncio: 50_000,
    });
    // O roubo NÃO entra no lucro do vendedor (como no BlueSales).
    expect(peter.lucro).toBe(73_500 - 250 - 8_300 - 3_300 - 3_663 - 735 - 50_000);
    expect(peter.margem_lucro).toBeCloseTo(peter.lucro / 73_500);
    expect(de('Matheus', linhas).lucro).toBe(-50_000);
  });

  it('a soma dos lucros fecha com a Demonstração de Resultados sem custos variáveis e sem a frustração', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-02', status: 'pagos', data_aprovacao: '2026-09-05', metodo_pagamento: 'boleto' }),
      pedido({ id: 'b', vendedor: 'PETER', data: '2026-09-03', status: 'devolvido', enviado_em: '2026-09-04T10:00:00Z' }),
      pedido({
        id: 'c', vendedor: 'Matheus', data: '2026-09-04', status: 'pagos', data_aprovacao: '2026-09-06',
        valor: 435, valor_agendado: 435, produto_plano: 'DERMAX PREMIUM - 3 POTE',
      }),
      pedido({ id: 'd', vendedor: 'Matheus', data: '2026-09-07' }),
    ];
    const dailies = [comAnuncio('2026-09-05', 812.37), comAnuncio('2026-09-06', 455.1)];
    const pnl = calcularPnl(dailies, [], periodo, { descontarFrustrados: 'real' }, p);
    const linhas = rankingVendedores(p, dailies, periodo);
    const soma = linhas.reduce((s, l) => s + l.lucro, 0);
    // O card "Lucro total" do BlueSales = P&L + custo de frustração. Só a
    // cobrança é arredondada por vendedor: no máximo 1 centavo cada.
    expect(pnl.desconto_frustrados).toBeGreaterThan(0);
    expect(Math.abs(soma - (pnl.lucro_sem_variaveis + pnl.desconto_frustrados))).toBeLessThanOrEqual(linhas.length);
    expect(linhas.reduce((s, l) => s + l.custos.anuncio, 0)).toBe(anuncioDoPeriodo(dailies, periodo));
  });

  it('taxa lançada à mão num dia sem pagamento também sai do lucro (a soma fecha com o P&L)', () => {
    // 2ª parcela no boleto em 05/11, com R$ 2,50 lançado na tela Taxas nesse dia:
    // nenhum pedido "é dono" do dia (o pagamento é de 28/10), mas a taxa está no P&L.
    const nov = { inicio: '2026-11-01', fim: '2026-11-30' };
    const p = [
      pedido({
        id: 'a', vendedor: 'PETER', data: '2026-10-20', status: 'pagos', data_aprovacao: '2026-10-28',
        metodo_pagamento: 'boleto', parcelas: [{ data: '2026-10-28', valor: 400 }, { data: '2026-11-05', valor: 335 }],
      }),
      pedido({ id: 'b', vendedor: 'Matheus', data: '2026-11-06' }),
    ];
    const dailies = [daily('2026-11-05', 2.5)];
    const pnl = calcularPnl(dailies, [], nov, { descontarFrustrados: 'real' }, p);
    const linhas = rankingVendedores(p, dailies, nov);
    expect(linhas.reduce((s, l) => s + l.custos.taxas, 0)).toBe(pnl.taxas_plataforma);
    expect(Math.abs(linhas.reduce((s, l) => s + l.lucro, 0) - pnl.lucro_sem_variaveis)).toBeLessThanOrEqual(linhas.length);
  });

  it('quem está fora do ranking não divide o anúncio', () => {
    const p = [
      pedido({ id: 'a', vendedor: 'PETER', data: '2026-09-02' }),
      pedido({ id: 'b', vendedor: 'Alyenderson Lima', data: '2026-09-02', status: 'pagos', data_aprovacao: '2026-09-02' }),
    ];
    const linhas = rankingVendedores(p, [comAnuncio('2026-09-02', 300)], periodo);
    // Só o PETER teve movimento entre quem disputa: leva o anúncio inteiro.
    expect(de('PETER', linhas).custos.anuncio).toBe(30_000);
    expect(deFora(p, [comAnuncio('2026-09-02', 300)], periodo)[0].custos.anuncio).toBe(0);
  });
});
