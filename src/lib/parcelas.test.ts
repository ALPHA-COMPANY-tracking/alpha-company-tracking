// Pagamento em partes (planilha de pagamentos).
// A planilha é a verdade dos recebimentos: cada parcela conta na receita do
// DIA dela (PARCELAS_EXTRAS_NA_RECEITA = true, desde 23/10/2026 — outubro
// fecha R$ 72.092,95 com as três 2ªs parcelas). De 17 a 23/10 só o 1º
// pagamento contava, igual ao BlueSales.
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

describe('pagamento em partes — como a planilha (cada parcela no dia dela)', () => {
  it('a chave está ligada e o servidor usa a mesma', () => {
    expect(PARCELAS_EXTRAS_NA_RECEITA).toBe(true);
    expect(servidor.PARCELAS_EXTRAS_NA_RECEITA).toBe(PARCELAS_EXTRAS_NA_RECEITA);
  });

  it('cada parcela no dia dela, numerada', () => {
    expect(pagamentosDoPedido(emPartes)).toEqual([
      { data: '2026-09-30', valor: 300, parcela: { n: 1, de: 2 } },
      { data: '2026-10-07', valor: 350, parcela: { n: 2, de: 2 } },
    ]);
    expect(agregarPedidos([emPartes], SET)).toMatchObject({ receita_aprovada: 300, qtd_pagamentos: 1 });
    expect(agregarPedidos([emPartes], OUT)).toMatchObject({ receita_aprovada: 350, qtd_pagamentos: 1 });
    expect(vendasAprovadasPorDia([emPartes], OUT).map((d) => [d.data, d.total])).toEqual([['2026-10-07', 350]]);
    expect(resumoDoVendedor([emPartes], 'PETER', OUT, '2026-10-07').pagos.qtd).toBe(1);
  });

  it('produto e frete uma vez só, no primeiro pagamento', () => {
    const set = calcularPnl([], [], SET, {}, [emPartes]);
    expect(set.receita_aprovada).toBe(30_000);
    expect(set.custo_produtos).toBe(8_300);
    expect(set.frete).toBe(3_300);
    const out = calcularPnl([], [], OUT, {}, [emPartes]);
    expect(out.receita_aprovada).toBe(35_000);
    expect(out.custo_produtos).toBe(0);
    expect(out.frete).toBe(0);
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
    expect(montarResumo('2026-10-07', [linha], 0, null).receita).toBe(350);
  });

  it('pagamento único: sem mudança', () => {
    expect(pagamentosDoPedido({ ...emPartes, parcelas: null })).toEqual([{ data: '2026-09-30', valor: 650 }]);
    expect(pagamentosDoPedido({ ...emPartes, status: 'cobrados' })).toEqual([]);
  });
});

describe('pagamento em partes — modo BlueSales (chave desligada)', () => {
  it('só o primeiro pagamento conta', () => {
    expect(pagamentosDoPedido(emPartes, false)).toEqual([{ data: '2026-09-30', valor: 300 }]);
  });
});
