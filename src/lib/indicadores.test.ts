// Indicadores da tela Visualização.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import {
  calcularIndicadores,
  motivoFrustracao,
  pagosDaSafra,
  situacaoDoPedido,
  situacaoDosAgendados,
} from '@/lib/indicadores';

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
    // Em rota = na rua. O que ainda não saiu fica em "a enviar".
    for (const s of ['enviados', 'saiu_para_entrega', 'retirar_nos_correios', 'em_transito'])
      expect(situacaoDoPedido(s)).toBe('rota');
    for (const s of ['cadastrados', 'confirmados', 'aguard_coleta']) expect(situacaoDoPedido(s)).toBe('preparo');
    for (const s of ['entregues', 'cobrados']) expect(situacaoDoPedido(s)).toBe('aguardando');
    for (const s of ['negociação', 'requer_atencao']) expect(situacaoDoPedido(s)).toBe('negociacao');
    for (const s of ['frustrados', 'devolvido', 'aguardando_devolucao', 'roubo', 'Roubado', 'cancelados', 'extraviado', 'sinistro'])
      expect(situacaoDoPedido(s)).toBe('frustracao');
  });

  it('Jurídico é cobrança travada (negociação), não em rota', () => {
    expect(situacaoDoPedido('juridico')).toBe('negociacao');
    expect(situacaoDoPedido('Jurídico')).toBe('negociacao');
    expect(situacaoDoPedido('inadimplencias')).toBe('negociacao'); // como o webhook manda
  });

  it('retirar nos Correios é em rota; com etiqueta de devolução vira frustração', () => {
    expect(situacaoDoPedido('retirar_nos_correios')).toBe('rota');
    for (const s of ['voltando', 'aguardando_devolucao', 'devolvido']) expect(situacaoDoPedido(s)).toBe('frustracao');
  });

  it('P&L e Visualização: o que falta pagar sai da etapa dos agendados do período', () => {
    const pedidos = [
      ped('enviados', '2026-09-10'),
      ped('entregues', '2026-09-11'),
      ped('juridico', '2026-09-12'),
      ped('roubo', '2026-09-06'),
      ped('pagos', '2026-09-05', { data_aprovacao: '2026-09-08' }),
      ped('pagos', '2026-08-20', { data_aprovacao: '2026-09-03' }), // agendado em agosto, pago em setembro
    ];
    const s = situacaoDosAgendados(pedidos, P);
    expect(s.rota).toEqual({ qtd: 1, valor: 73_500 });
    expect(s.aguardando.qtd).toBe(1);
    expect(s.negociacao.qtd).toBe(1);
    expect(s.frustracao.qtd).toBe(1);
    expect(s.pago.qtd).toBe(1);
    // O pagamento de agosto entra no aprovado de setembro, mas não no agendado:
    // "agendado − aprovado − frustrado" daria 2 pedidos; faltam pagar 3.
    const pnl = calcularPnl([], [], P, {}, pedidos);
    expect(pnl.qtd_pagamentos - pagosDaSafra(pedidos, P)).toBe(1);
    expect(pnl.qtd_agendados - pnl.qtd_pagamentos - s.frustracao.qtd).toBe(2);
    expect(s.rota.qtd + s.aguardando.qtd + s.negociacao.qtd).toBe(3);
  });

  it('motivo segue a etapa do BlueSales, inclusive "Voltando"', () => {
    expect(motivoFrustracao({ status: 'devolvido' })).toBe('devolvido');
    expect(motivoFrustracao({ status: 'voltando' })).toBe('voltando');
    expect(motivoFrustracao({ status: 'aguardando_devolucao' })).toBe('aguardando_devolucao');
    expect(motivoFrustracao({ status: 'cancelados' })).toBe('cancelado');
    expect(motivoFrustracao({ status: 'roubo' })).toBe('roubo');
    expect(motivoFrustracao({ status: 'frustrados' })).toBe('frustrado');
    expect(motivoFrustracao({ status: 'extraviado' })).toBe('roubo'); // "perdido" no BlueSales
    expect(motivoFrustracao({ status: 'perda_cobranca' })).toBe('perda_cobranca');
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

  it('card de Frustrados como o BlueSales: cancelado não postado não entra (regras de 30/09/2026)', () => {
    // Roubo (#576, #577, #593) + Aguard. Devolução (#850); o cancelado
    // (#1488) não foi postado — não gerou custo, fica fora.
    const setembro: Pedido[] = [
      ped('roubo', '2026-09-02'),
      ped('roubo', '2026-09-02'),
      ped('roubo', '2026-09-02'),
      ped('aguardando_devolucao', '2026-09-08'),
      ped('cancelados', '2026-09-18'),
      ped('negociação', '2026-09-10'), // não é perda: ainda pode pagar
    ];
    const pnl = calcularPnl([], [], P, {}, setembro);
    expect(pnl.qtd_frustrados).toBe(4);
    expect(pnl.valor_frustrado).toBe(294_000);
    // Postado (com rastreio), o cancelado entra perdendo o frete.
    const postado = setembro.map((p) => (p.status === 'cancelados' ? { ...p, rastreamento: 'AP1BR' } : p));
    expect(calcularPnl([], [], P, {}, postado).qtd_frustrados).toBe(5);
  });
});

describe('indicadores', () => {
  // Setembro: 10 agendados — 4 pagos, 1 em rota (enviado), 1 a enviar
  // (aguard. coleta), 1 cobrado, 1 negociação, 2 em frustração. Mais 3
  // pagamentos em setembro de pedidos de agosto.
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
    expect(ind.situacao.rota.qtd).toBe(1);
    expect(ind.situacao.preparo).toEqual({ qtd: 1, valor: 53_500 });
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

  it('a receber conta SÓ os pedidos na rua (sem a enviar, negociação, cobrado ou frustrado)', () => {
    const pr = ind.projecao;
    expect(pr.rota.qtd).toBe(1);
    expect(pr.rota.valor).toBe(73_500);
    expect(pr.a_receber).toBe(Math.round(73_500 * 0.7));
    expect(pr.envio_rota).toBe(8_300 + 3_300);
    // Frustrado antigo (legado) e devolvido: só o frete — regras do BlueSales.
    expect(pr.perda_frustracao).toBe(3_300 + 3_300);
    expect(pr.lucro_real).toBe(calcularPnl(dailies, [], P, {}, pedidos).lucro_real);
    expect(pr.lucro_projetado).toBe(pr.lucro_real - pr.perda_frustracao + pr.a_receber - pr.comissoes - pr.envio_rota);
  });

  it('sem histórico resolvido a taxa é zero, e nada é inventado', () => {
    const vazio = calcularIndicadores([], [], [ped('enviados', '2026-09-20')], P);
    expect(vazio.projecao.taxa_recebimento).toBe(0);
    expect(vazio.projecao.a_receber).toBe(0);
  });
});
