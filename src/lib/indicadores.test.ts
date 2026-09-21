// Indicadores da tela Visualização.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { calcularIndicadores, motivoFrustracao, situacaoDoPedido } from '@/lib/indicadores';

const P = { inicio: '2026-09-01', fim: '2026-09-30' };

const dia = (data: string, ads: number): AfterpayDaily => ({
  data, receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, taxa_conferida: true, custo_produtos: 0, frete: 0,
  comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: ads, taxas_investimento: 0, leads: 0,
  valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0, qtd_agendados: 0,
});

let n = 0;
const ped = (status: string, data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${++n}`,
  status,
  data,
  valor: 735,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  ...extra,
});

describe('situação do pedido', () => {
  it('em rota, aguardando pagamento, negociação e frustração', () => {
    expect(situacaoDoPedido('pagos')).toBe('pago');
    for (const s of ['cadastrados', 'aguard_coleta', 'enviados', 'saiu_para_entrega', 'retirar_nos_correios'])
      expect(situacaoDoPedido(s)).toBe('rota');
    for (const s of ['entregues', 'cobrados']) expect(situacaoDoPedido(s)).toBe('aguardando');
    for (const s of ['negociação', 'requer_atencao']) expect(situacaoDoPedido(s)).toBe('negociacao');
    for (const s of ['frustrados', 'devolvido', 'aguardando_devolucao', 'roubo', 'Roubado', 'cancelados', 'extraviado', 'sinistro'])
      expect(situacaoDoPedido(s)).toBe('frustracao');
    expect(situacaoDoPedido('confirmados')).toBe('rota'); // etapa nova de 21/09: antes do envio
  });

  it('motivo segue a etapa do BlueSales, inclusive "Voltando"', () => {
    expect(motivoFrustracao({ status: 'devolvido' })).toBe('devolvido');
    expect(motivoFrustracao({ status: 'voltando' })).toBe('voltando');
    expect(motivoFrustracao({ status: 'aguardando_devolucao' })).toBe('aguardando_devolucao');
    expect(motivoFrustracao({ status: 'cancelados' })).toBe('cancelado');
    expect(motivoFrustracao({ status: 'roubo' })).toBe('roubo');
    expect(motivoFrustracao({ status: 'frustrados' })).toBe('frustrado');
    expect(motivoFrustracao({ status: 'extraviado' })).toBe('outros');
    expect(situacaoDoPedido('voltando')).toBe('frustracao');
  });

  it('BlueSales 21/09: Devolvido 6, Voltando 8, Aguard. Devolução 2 — todos frustrados', () => {
    const todos: Pedido[] = [
      ...Array.from({ length: 6 }, () => ped('devolvido', '2026-08-20')),
      ...Array.from({ length: 8 }, (_, i) => ped('voltando', '2026-08-25', { passou_correios: i < 7 })),
      ...Array.from({ length: 2 }, () => ped('aguardando_devolucao', '2026-08-27')),
    ];
    const ago = { inicio: '2026-08-01', fim: '2026-08-31' };
    const ind = calcularIndicadores([], [], todos, ago);
    const qtd = Object.fromEntries(ind.frustracao_por_motivo.map((f) => [f.motivo, f.qtd]));
    expect(qtd).toMatchObject({ devolvido: 6, voltando: 8, aguardando_devolucao: 2 });
    expect(ind.situacao.frustracao.qtd).toBe(16);
    // 7 dos que estão voltando tinham ido para a retirada nos Correios.
    expect(ind.vieram_dos_correios.qtd).toBe(7);
    // O produto volta: a perda é só o frete (R$ 33) em cada um.
    expect(ind.projecao.perda_frustracao).toBe(16 * 3_300);
    expect(calcularPnl([], [], ago, {}, todos).qtd_frustrados).toBe(16);
  });

  it('card de Frustrados igual ao BlueSales (setembro/2026: 5 pedidos, R$ 3.675)', () => {
    // Roubo (#576, #577, #593) + Aguard. Devolução (#850) + Cancelados (#1488).
    const setembro: Pedido[] = [
      ped('roubo', '2026-09-02'),
      ped('roubo', '2026-09-02'),
      ped('roubo', '2026-09-02'),
      ped('aguardando_devolucao', '2026-09-08'),
      ped('cancelados', '2026-09-18'),
      ped('negociação', '2026-09-10'), // não é perda: ainda pode pagar
    ];
    const pnl = calcularPnl([], [], P, {}, setembro);
    expect(pnl.qtd_frustrados).toBe(5);
    expect(pnl.valor_frustrado).toBe(367_500);
  });
});

describe('indicadores', () => {
  // Setembro: 10 agendados — 4 pagos, 2 em rota, 1 cobrado, 1 negociação,
  // 2 em frustração. Mais 3 pagamentos em setembro de pedidos de agosto.
  // Agosto também tem 1 frustrado já resolvido.
  const pedidos: Pedido[] = [
    ...Array.from({ length: 4 }, () => ped('pagos', '2026-09-05', { data_aprovacao: '2026-09-10' })),
    ped('enviados', '2026-09-20'),
    ped('aguard_coleta', '2026-09-21', { valor: 535, valor_agendado: 535, produto_plano: 'DERMAX PREMIUM - 4 POTE' }),
    ped('cobrados', '2026-09-15'),
    ped('negociação', '2026-09-12'),
    ped('frustrados', '2026-09-06'),
    ped('devolvido', '2026-09-07'),
    ...Array.from({ length: 3 }, () => ped('pagos', '2026-08-20', { data_aprovacao: '2026-09-02' })),
    ped('frustrados', '2026-08-11'),
  ];
  const dailies = [dia('2026-09-10', 1000)];
  const ind = calcularIndicadores(dailies, [], pedidos, P);

  it('pagos são os PAGAMENTOS do período, igual ao card de Pagamentos aprovados', () => {
    const pnl = calcularPnl(dailies, [], P, {}, pedidos);
    expect(ind.qtd_pagamentos).toBe(7); // 4 da safra + 3 de agosto
    expect(ind.qtd_pagamentos).toBe(pnl.qtd_pagamentos);
    expect(ind.receita_aprovada).toBe(pnl.receita_aprovada);
    expect(ind.pagos_da_safra).toBe(4);
    expect(ind.pct_pagos).toBeCloseTo(7 / 10, 5); // pagamentos ÷ agendados
  });

  it('CPA e ROAS: agendado e pago, cada um com a sua base', () => {
    expect(ind.qtd_agendados).toBe(10);
    expect(ind.cpa_agendamento).toBe(10_000); // 1.000 ÷ 10
    expect(ind.cpa_pago).toBe(Math.round(100_000 / 7)); // 1.000 ÷ 7
    expect(ind.roas_aprovado).toBeCloseTo(5.145, 3); // 7 × 735 ÷ 1.000
    expect(ind.ticket_medio_real).toBe(73_500);
  });

  it('situação dos agendados e frustração geral', () => {
    expect(ind.situacao.rota.qtd).toBe(2);
    expect(ind.situacao.aguardando.qtd).toBe(1);
    expect(ind.situacao.negociacao.qtd).toBe(1);
    expect(ind.situacao.frustracao.qtd).toBe(2);
    expect(ind.pct_frustracao).toBeCloseTo(0.2, 5);
    // Em valor: 2 × 735 de 9 × 735 + 535 agendados.
    expect(ind.pct_frustracao_valor).toBeCloseTo(1470 / (9 * 735 + 535), 5);
    // Os seis motivos aparecem sempre, mesmo zerados; "Outros" só com pedido.
    expect(ind.frustracao_por_motivo.map((f) => f.motivo)).toEqual([
      'devolvido',
      'voltando',
      'aguardando_devolucao',
      'cancelado',
      'roubo',
      'frustrado',
    ]);
    const qtd = Object.fromEntries(ind.frustracao_por_motivo.map((f) => [f.motivo, f.qtd]));
    expect(qtd).toMatchObject({ devolvido: 1, frustrado: 1, cancelado: 0, roubo: 0, voltando: 0 });
  });

  it('taxa de recebimento vem só dos pedidos já resolvidos', () => {
    // Resolvidos até 30/09: 7 pagos e 3 em frustração → 7/10.
    expect(ind.projecao.base_taxa).toBe(10);
    expect(ind.projecao.taxa_recebimento).toBeCloseTo(0.7, 5);
  });

  it('a receber conta SÓ os pedidos em rota (sem negociação, cobrado ou frustrado)', () => {
    const pr = ind.projecao;
    expect(pr.rota.qtd).toBe(2);
    expect(pr.rota.valor).toBe(73_500 + 53_500);
    expect(pr.a_receber).toBe(Math.round(127_000 * 0.7));
    expect(pr.envio_rota).toBe(8_300 + 3_300 + 4_100 + 3_300);
    // Frustrado: produto + frete. Devolvido: o produto voltou, só o frete.
    expect(pr.perda_frustracao).toBe(8_300 + 3_300 + 3_300);
    expect(pr.lucro_real).toBe(calcularPnl(dailies, [], P, {}, pedidos).lucro_real);
    expect(pr.lucro_projetado).toBe(pr.lucro_real - pr.perda_frustracao + pr.a_receber - pr.comissoes - pr.envio_rota);
  });

  it('sem histórico resolvido a taxa é zero, e nada é inventado', () => {
    const vazio = calcularIndicadores([], [], [ped('enviados', '2026-09-20')], P);
    expect(vazio.projecao.taxa_recebimento).toBe(0);
    expect(vazio.projecao.a_receber).toBe(0);
  });
});
