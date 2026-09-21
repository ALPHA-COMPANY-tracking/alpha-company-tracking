// Indicadores da tela Visualização.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { calcularIndicadores, situacaoDoPedido } from '@/lib/indicadores';

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
  it('frustração inclui devolução, roubo e extravio; negociação segue em aberto', () => {
    expect(situacaoDoPedido('pagos')).toBe('pago');
    for (const s of ['frustrados', 'devolvido', 'aguardando_devolucao', 'Roubado', 'extraviado', 'sinistro'])
      expect(situacaoDoPedido(s)).toBe('frustracao');
    for (const s of ['enviados', 'cobrados', 'requer_atencao', 'negociação', 'entregues', 'aguard_coleta'])
      expect(situacaoDoPedido(s)).toBe('aberto');
  });
});

describe('indicadores', () => {
  // 10 agendados em setembro: 5 pagos, 3 em aberto, 2 em frustração.
  // Histórico (agosto): 3 pagos e 1 frustrado já resolvidos.
  const pedidos: Pedido[] = [
    ...Array.from({ length: 5 }, () => ped('pagos', '2026-09-05', { data_aprovacao: '2026-09-10' })),
    ped('enviados', '2026-09-20'),
    ped('cobrados', '2026-09-21'),
    ped('negociação', '2026-09-22', { valor: 535, valor_agendado: 535, produto_plano: 'DERMAX PREMIUM - 4 POTE' }),
    ped('frustrados', '2026-09-06'),
    ped('devolvido', '2026-09-07'),
    ...Array.from({ length: 3 }, () => ped('pagos', '2026-08-10', { data_aprovacao: '2026-08-15' })),
    ped('frustrados', '2026-08-11'),
  ];
  const dailies = [dia('2026-09-10', 1000)];
  const ind = calcularIndicadores(dailies, [], pedidos, P);

  it('CPA e ROAS: agendado e pago, cada um com a sua base', () => {
    expect(ind.qtd_agendados).toBe(10);
    expect(ind.qtd_pagamentos).toBe(5);
    expect(ind.cpa_agendamento).toBe(10_000); // 1.000 ÷ 10
    expect(ind.cpa_pago).toBe(20_000); // 1.000 ÷ 5
    expect(ind.roas_aprovado).toBeCloseTo(3.675, 3); // 3.675 ÷ 1.000
    expect(ind.roas_agendado).toBeCloseTo(7.15, 3); // (9 × 735 + 535) ÷ 1.000
    expect(ind.ticket_medio_real).toBe(73_500);
  });

  it('safra: % pagos, em aberto e em frustração somam 100%', () => {
    expect(ind.safra.pago.qtd).toBe(5);
    expect(ind.safra.aberto.qtd).toBe(3);
    expect(ind.safra.frustracao.qtd).toBe(2);
    expect(ind.pct_pagos).toBeCloseTo(0.5, 5);
    expect(ind.pct_frustracao).toBeCloseTo(0.2, 5);
    expect(ind.pct_pagos + ind.pct_aberto + ind.pct_frustracao).toBeCloseTo(1, 5);
    expect(ind.frustracao_por_status.map((f) => f.rotulo).sort()).toEqual(['Devolvido', 'Frustrado']);
  });

  it('taxa de recebimento vem só dos pedidos já resolvidos', () => {
    // Resolvidos até 30/09: 8 pagos e 3 em frustração → 8/11.
    expect(ind.projecao.base_taxa).toBe(11);
    expect(ind.projecao.taxa_recebimento).toBeCloseTo(8 / 11, 5);
  });

  it('lucro projetado = lucro real − perdas + a receber − comissões − envio do aberto', () => {
    const pnl = calcularPnl(dailies, [], P, {}, pedidos);
    const pr = ind.projecao;
    expect(pr.lucro_real).toBe(pnl.lucro_real); // mesmo número da Demonstração
    expect(pr.perda_frustracao).toBe(2 * (8_300 + 3_300)); // 2 × (produto 83 + frete 33)
    expect(pr.aberto.valor).toBe(73_500 + 73_500 + 53_500);
    expect(pr.envio_aberto).toBe(2 * (8_300 + 3_300) + (4_100 + 3_300));
    expect(pr.a_receber).toBe(Math.round(200_500 * (8 / 11)));
    expect(pr.lucro_projetado).toBe(pr.lucro_real - pr.perda_frustracao + pr.a_receber - pr.comissoes - pr.envio_aberto);
  });

  it('sem histórico resolvido a taxa é zero, e nada é inventado', () => {
    const vazio = calcularIndicadores([], [], [ped('enviados', '2026-09-20')], P);
    expect(vazio.projecao.taxa_recebimento).toBe(0);
    expect(vazio.projecao.a_receber).toBe(0);
  });
});
