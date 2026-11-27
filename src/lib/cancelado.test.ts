// Cancelado e o saldo agendado.
// O Faturamento Agendado é IGUAL ao do BlueSales (decisão do Jonas, 22/10/2026).
// Até 23/11/2026 o BlueSales somava os cancelados; em 26/11/2026 passou a
// TIRAR os cancelados de tudo (card "Vendas", Resultado Diário, Ranking), em
// todos os meses → CANCELADO_NO_AGENDADO = false. O card "Cancelados" mostra
// quanto foi cancelado no período. Cancelado NÃO é frustração (22/10/2026),
// nem que o pacote tenha saído.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agendadoPorDia, agregarPedidos, CANCELADO_NO_AGENDADO, ehCancelado, foraDoAgendado, possiveisDuplicados } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { situacaoDosAgendados } from '@/lib/indicadores';
import { resumoDoVendedor } from '@/lib/vendedor';
import { montarResumo } from '../../api/lib-resumo';
import * as servidor from '../../api/lib-custos';

const P: Periodo = { inicio: '2026-10-01', fim: '2026-10-31' };
const ped = (id: string, status: string, valor: number, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  status,
  data: '2026-10-07',
  valor,
  valor_agendado: valor,
  produto_plano: 'DERMAX PREMIUM - 4 POTE',
  vendedor: 'Matheus',
  cliente: `Cliente ${id}`,
  ...extra,
});
const linha = (p: Pedido) => ({
  ...p,
  data_aprovacao: p.data_aprovacao ?? null,
  valor_agendado: p.valor_agendado ?? null,
  produto_plano: null,
  vendedor: p.vendedor ?? null,
});

const valido = ped('a', 'enviados', 735);
const cancelado = ped('b', 'cancelados', 535);
const canceladoQueSaiu = ped('c', 'cancelados', 535, { rastreamento: 'AA123BR', enviado_em: '2026-10-08T12:00:00Z' });
// O caso de 12/10: cancelado com etiqueta, mas o pacote nunca saiu.
const canceladoComEtiqueta = ped('e', 'cancelados', 735, { rastreamento: 'AE017084557BR' });

describe('cancelado fica fora do agendado, como no BlueSales (desde 26/11/2026)', () => {
  it('reconhece cancelado/cancelados, com ou sem maiúscula', () => {
    expect(['cancelados', 'Cancelado', 'CANCELADOS'].every((s) => ehCancelado({ status: s }))).toBe(true);
    expect(ehCancelado({ status: 'enviados' })).toBe(false);
  });

  it('a chave está em "não conta" e o servidor usa a mesma', () => {
    expect(CANCELADO_NO_AGENDADO).toBe(false);
    expect(servidor.CANCELADO_NO_AGENDADO).toBe(CANCELADO_NO_AGENDADO);
    expect(foraDoAgendado(cancelado)).toBe(true);
    expect(foraDoAgendado(cancelado, true)).toBe(false); // o modo antigo, que somava
  });

  it('Faturamento Agendado, agendado por dia e vendedor: sem o cancelado', () => {
    const agg = agregarPedidos([valido, cancelado], P);
    expect(agg.valor_agendado).toBe(735);
    expect(agg.qtd_agendados).toBe(1);
    expect(agendadoPorDia([valido, cancelado], P)).toEqual([{ data: '2026-10-07', qtd: 1, valor: 735 }]);
    const r = resumoDoVendedor([valido, cancelado], 'Matheus', P, '2026-10-07');
    expect(r.agendado).toEqual({ qtd: 1, valor: 73_500 });
  });

  it('card "Cancelados": quanto foi cancelado no período (fora do agendado)', () => {
    const naLixeira = ped('f', 'cancelados', 735, { removido_em: '2026-10-08T12:00:00Z' }); // excluído no BlueSales
    const deSetembro = ped('g', 'cancelados', 735, { data: '2026-09-30' });
    const agg = agregarPedidos([valido, cancelado, canceladoComEtiqueta, naLixeira, deSetembro], P);
    expect(agg.qtd_cancelados).toBe(2);
    expect(agg.valor_cancelados).toBe(535 + 735);
    expect(agg.valor_agendado).toBe(735); // os cancelados ficam fora
  });

  it('cancelado não é frustração (card próprio), nem que o pacote tenha saído (22/10/2026)', () => {
    expect(agregarPedidos([valido, canceladoQueSaiu], P)).toMatchObject({ qtd_frustrados: 0, perda_real_frustrados: 0 });
    expect(agregarPedidos([valido, canceladoComEtiqueta], P)).toMatchObject({ qtd_frustrados: 0, perda_real_frustrados: 0 });
    expect(agregarPedidos([valido, cancelado], P).qtd_frustrados).toBe(0);
  });

  it('agendado e margem do agendado ficam iguais com ou sem o cancelado', () => {
    for (const c of [cancelado, canceladoQueSaiu]) {
      const com = calcularPnl([], [], P, {}, [valido, c]);
      const sem = calcularPnl([], [], P, {}, [valido]);
      expect(com.valor_agendado).toBe(sem.valor_agendado);
      expect(com.qtd_agendados).toBe(sem.qtd_agendados);
      expect(com.lucro_agendado).toBe(sem.lucro_agendado);
    }
    expect(calcularPnl([], [], P, {}, [valido, cancelado]).perda_real_frustrados).toBe(0); // e não custa nada
  });

  it('a situação dos agendados: o cancelado não aparece', () => {
    const s = situacaoDosAgendados([valido, canceladoQueSaiu], P);
    expect(Object.values(s).reduce((t, f) => t + f.valor, 0)).toBe(73_500);
    expect(s.frustracao.qtd).toBe(0);
  });

  it('pedido refeito com a mesma cliente aparece como possível duplicado — mas não o que foi CANCELADO', () => {
    const refeito = ped('d', 'enviados', 735, { cliente: 'Cliente b' });
    const antigo = ped('e2', 'aguard_coleta', 535, { cliente: 'Cliente b' });
    expect(possiveisDuplicados([antigo, refeito], P)).toHaveLength(1);
    // Cancelado continua no BlueSales (etapa Cancelados): não é para a
    // lixeira (#3871 × #3863, 15/11/2026).
    expect(possiveisDuplicados([cancelado, refeito], P)).toHaveLength(0);
  });

  it('resumo do dia no celular: o mesmo agendado', () => {
    const r = montarResumo('2026-10-07', [linha(valido), linha(cancelado)], 0, null);
    expect(r.valor_agendado).toBe(735);
    expect(r.qtd_agendados).toBe(1);
  });
});

describe('bate com o BlueSales de 01–26/11/2026 (Resultado Diário e card "Vendas")', () => {
  // Dias com cancelado: [dia, agendado do BlueSales (qtd, R$), cancelados
  // daqui (#pedido: valor)]. Lá o dia já vem sem os cancelados.
  const dias: [string, number, number, [number, number][]][] = [
    ['2026-11-02', 28, 16_980, [[3871, 435], [3867, 435]]],
    ['2026-11-09', 21, 11_735, [[4317, 535], [4312, 235]]],
    ['2026-11-10', 11, 5_985, [[4385, 235]]],
    ['2026-11-11', 15, 8_125, [[4517, 335]]],
    ['2026-11-12', 20, 10_465, [[4627, 435], [4610, 735]]],
    ['2026-11-13', 22, 12_135, [[4693, 335]]],
    ['2026-11-18', 20, 11_300, [[5188, 735]]],
    ['2026-11-20', 16, 8_825, [[5345, 735]]],
    ['2026-11-21', 28, 15_680, [[5376, 435], [5375, 435], [5367, 435]]],
  ];
  // Os outros dias do mês (sem cancelado) já batiam: o resto do card.
  const resto = { qtd: 430 - 181, valor: 242_705 - 101_230 };

  const pedidos: Pedido[] = [];
  const reparte = (dia: string, n: number, total: number) => {
    const base = Math.floor(total / n);
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? total - base * (n - 1) : base;
      pedidos.push(ped(`${dia}-${i}`, 'enviados', v, { data: dia }));
    }
  };
  for (const [dia, n, total, cancelados] of dias) {
    reparte(dia, n, total);
    for (const [num, v] of cancelados) pedidos.push(ped(`c${num}`, 'cancelados', v, { data: dia, internal_id: num }));
  }
  reparte('2026-11-25', resto.qtd, resto.valor);
  const NOV: Periodo = { inicio: '2026-11-01', fim: '2026-11-26' };

  it('mês: 430 · R$ 242.705 (aqui eram 444 · R$ 249.195 com os 14 cancelados)', () => {
    const agg = agregarPedidos(pedidos, NOV);
    expect([agg.qtd_agendados, agg.valor_agendado]).toEqual([430, 242_705]);
    expect([agg.qtd_cancelados, agg.valor_cancelados]).toEqual([14, 6_490]);
    // O modo antigo dava o número que a dashboard mostrava em 26/11.
    expect(pedidos.filter((p) => !foraDoAgendado(p, true)).length).toBe(444);
  });

  it('dia a dia igual ao Resultado Diário, no app e no resumo do celular', () => {
    const porDia = agendadoPorDia(pedidos, NOV);
    for (const [dia, n, total] of dias) {
      expect(porDia.find((d) => d.data === dia)).toEqual({ data: dia, qtd: n, valor: total });
      const r = montarResumo(dia, pedidos.filter((p) => p.data === dia).map(linha), 0, null);
      expect([r.qtd_agendados, r.valor_agendado]).toEqual([n, total]);
    }
  });
});

describe('recusado não é venda (como o "Vendas" do BlueSales, 02/11/2026)', () => {
  const recusado = ped('r', 'recusados', 735);
  it('fica fora do agendado, no app e no resumo do celular (o cancelado também)', () => {
    const agg = agregarPedidos([valido, cancelado, recusado], P);
    expect(agg.valor_agendado).toBe(735);
    expect(agg.qtd_agendados).toBe(1);
    expect(foraDoAgendado(recusado)).toBe(true);
    expect(foraDoAgendado(recusado, true)).toBe(true); // recusado fica fora em qualquer modo
    expect(agendadoPorDia([valido, recusado], P)).toEqual([{ data: '2026-10-07', qtd: 1, valor: 735 }]);
    const r = montarResumo('2026-10-07', [linha(valido), linha(cancelado), linha(recusado)], 0, null);
    expect(r.valor_agendado).toBe(735);
    expect(r.qtd_agendados).toBe(1);
  });

  it('e não é frustração (não gerou custo)', () => {
    expect(agregarPedidos([valido, recusado], P).qtd_frustrados).toBe(0);
  });
});

describe('antecipado aguardando pagamento não é venda (como o "Vendas" do BlueSales, 04/11/2026)', () => {
  const aguardando = ped('g', 'aguardando_pagamento', 685);
  it('fica fora do agendado, no app e no resumo do celular', () => {
    expect(['aguardando_pagamento', 'Aguard. Pagamento'].every((s) => foraDoAgendado({ status: s }))).toBe(true);
    const agg = agregarPedidos([valido, aguardando], P);
    expect(agg.valor_agendado).toBe(735);
    expect(agg.qtd_agendados).toBe(1);
    expect(agendadoPorDia([valido, aguardando], P)).toEqual([{ data: '2026-10-07', qtd: 1, valor: 735 }]);
    const r = montarResumo('2026-10-07', [linha(valido), linha(aguardando)], 0, null);
    expect(r.valor_agendado).toBe(735);
    expect(r.qtd_agendados).toBe(1);
  });

  it('quando é pago, conta', () => {
    expect(foraDoAgendado({ status: 'pagos' })).toBe(false);
    expect(agregarPedidos([valido, ped('g', 'pagos', 685)], P).valor_agendado).toBe(735 + 685);
  });

  it('antecipado já pago também fica fora ("já nasce paga e conta só no Aprovado"); o não pago conta', () => {
    const antecipadoPago = ped('ap', 'pagos', 435, { tipo_venda: 'antecipado', data_aprovacao: '2026-10-07' });
    const antecipadoAberto = ped('aa', 'aguard_coleta', 335, { tipo_venda: 'antecipado' });
    expect(foraDoAgendado(antecipadoPago)).toBe(true);
    expect(foraDoAgendado(antecipadoAberto)).toBe(false);
    expect(foraDoAgendado({ status: 'pagos', tipo_venda: 'afterpay' })).toBe(false);
    expect(agregarPedidos([valido, antecipadoPago, antecipadoAberto], P).valor_agendado).toBe(735 + 335);
    // …mas o pagamento entra no aprovado normalmente.
    expect(agregarPedidos([antecipadoPago], P).receita_aprovada).toBe(435);
    const r = montarResumo('2026-10-07', [linha(valido), linha(antecipadoPago), linha(antecipadoAberto)], 0, null);
    expect(r.valor_agendado).toBe(735 + 335);
    expect(r.receita).toBe(435);
  });

  it('aguardando coleta e aguardando devolução continuam como antes', () => {
    expect(foraDoAgendado({ status: 'aguardando_coleta' })).toBe(false);
    expect(foraDoAgendado({ status: 'aguardando_devolucao' })).toBe(false);
  });
});
