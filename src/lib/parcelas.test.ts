// Pagamento em partes (planilha de pagamentos).
// Desde 17/10/2026 a receita é IGUAL à do BlueSales: só o 1º pagamento conta
// (PARCELAS_EXTRAS_NA_RECEITA = false). As parcelas continuam guardadas e a
// chave volta ao modo da planilha (cada parcela no dia dela).
// Caso real: #1170 pagou R$ 300 em 30/09 e R$ 350 em 07/10.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { agregarPedidos, PARCELAS_EXTRAS_NA_RECEITA, pagamentosDoPedido, vendasAprovadasPorDia } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { resumoDoVendedor } from '@/lib/vendedor';
import { montarResumo } from '../../api/lib-resumo';
import * as servidor from '../../api/lib-custos';

const SET = { inicio: '2026-09-01', fim: '2026-09-30' };
const OUT = { inicio: '2026-10-01', fim: '2026-10-31' };

const emPartes: Pedido = {
  id: 'BLV-IR8O26E8DK',
  internal_id: 1170,
  status: 'pagos',
  data: '2026-09-25',
  data_aprovacao: '2026-09-30',
  valor: 650,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  metodo_pagamento: 'pix',
  parcelas: [
    { data: '2026-10-07', valor: 350 },
    { data: '2026-09-30', valor: 300 },
  ],
};

describe('pagamento em partes — como o BlueSales (só o 1º pagamento)', () => {
  it('a chave está em "só o primeiro" e o servidor usa a mesma', () => {
    expect(PARCELAS_EXTRAS_NA_RECEITA).toBe(false);
    expect(servidor.PARCELAS_EXTRAS_NA_RECEITA).toBe(PARCELAS_EXTRAS_NA_RECEITA);
  });

  it('só o primeiro pagamento conta, no dia dele', () => {
    expect(pagamentosDoPedido(emPartes)).toEqual([{ data: '2026-09-30', valor: 300 }]);
    expect(agregarPedidos([emPartes], SET)).toMatchObject({ receita_aprovada: 300, qtd_pagamentos: 1 });
    expect(agregarPedidos([emPartes], OUT)).toMatchObject({ receita_aprovada: 0, qtd_pagamentos: 0 });
    expect(vendasAprovadasPorDia([emPartes], OUT)).toEqual([]);
    expect(resumoDoVendedor([emPartes], 'PETER', OUT, '2026-10-07').pagos).toEqual({ qtd: 0, valor: 0 });
  });

  it('produto e frete no primeiro pagamento', () => {
    const set = calcularPnl([], [], SET, {}, [emPartes]);
    expect(set.receita_aprovada).toBe(30_000);
    expect(set.custo_produtos).toBe(8_300);
    expect(set.frete).toBe(3_300);
  });

  it('resumo do celular: igual', () => {
    const linha = {
      status: emPartes.status,
      data: emPartes.data,
      data_aprovacao: emPartes.data_aprovacao ?? null,
      valor: emPartes.valor,
      valor_agendado: 735,
      produto_plano: emPartes.produto_plano ?? null,
      vendedor: 'PETER',
      metodo_pagamento: 'pix',
      parcelas: emPartes.parcelas,
    };
    expect(montarResumo('2026-09-30', [linha], 0, null).receita).toBe(300);
    expect(montarResumo('2026-10-07', [linha], 0, null).receita).toBe(0);
  });

  it('pagamento único: sem mudança', () => {
    expect(pagamentosDoPedido({ ...emPartes, parcelas: null })).toEqual([{ data: '2026-09-30', valor: 650 }]);
    expect(pagamentosDoPedido({ ...emPartes, status: 'cobrados' })).toEqual([]);
  });
});

describe('pagamento em partes — modo da planilha (chave ligada)', () => {
  it('cada parcela no dia dela, numerada', () => {
    expect(pagamentosDoPedido(emPartes, true)).toEqual([
      { data: '2026-09-30', valor: 300, parcela: { n: 1, de: 2 } },
      { data: '2026-10-07', valor: 350, parcela: { n: 2, de: 2 } },
    ]);
  });
});
