// Margem do agendado: o resultado projetado da safra do período.
//
// A margem sobre o aprovado castiga o dia de muita venda — desconta o
// Ads inteiro mas só conta a parte já paga. Esta olha a mesma safra: o
// que o vendedor fechou e os custos que esses pedidos vão gerar.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';

const periodo: Periodo = { inicio: '2026-09-01', fim: '2026-09-30' };

function daily(over: Partial<AfterpayDaily> & { data: string }): AfterpayDaily {
  return {
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0, leads: 0, ...over,
  };
}

function pedido(over: Partial<Pedido> & { id: string; data: string }): Pedido {
  return {
    status: 'cadastrados',
    valor: 735,
    valor_bruto: 735,
    valor_agendado: 735,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    vendedor: 'PETER',
    ...over,
  };
}

describe('margem do agendado', () => {
  it('mede a safra do dia, mesmo sem nenhum pagamento ainda', () => {
    // 2 vendas de R$ 735 agendadas hoje, R$ 200 de Ads, nada pago.
    // Agendado 1.470 − (produto 166 + frete 66 + vendedor 5% de 1.470 =
    // 73,50 + cobrança 1% = 14,70 + ads 200) = R$ 949,80 → 64,6%.
    const pedidos = [pedido({ id: 'a', data: '2026-09-01' }), pedido({ id: 'b', data: '2026-09-01' })];
    const r = calcularPnl([daily({ data: '2026-09-01', investimento_ads: 200 })], [], periodo, {}, pedidos);

    expect(r.receita_aprovada).toBe(0); // nada pago
    expect(r.valor_agendado).toBe(147_000);
    expect(r.lucro_agendado).toBe(94_980);
    expect(r.margem_agendado).toBeCloseTo(0.646, 3);
  });

  it('a margem realizada continua existindo, separada', () => {
    const pedidos = [pedido({ id: 'a', data: '2026-09-01' })];
    const r = calcularPnl([daily({ data: '2026-09-01', investimento_ads: 200 })], [], periodo, {}, pedidos);
    // Sem pagamento não há receita: a margem realizada é 0 e a projetada não.
    expect(r.margem_real).toBe(0);
    expect(r.margem_agendado).toBeGreaterThan(0);
  });

  it('cada vendedor entra com o percentual dele', () => {
    // PETER 5% e Matheus 6%, R$ 1.000 agendados cada, sem Ads.
    const pedidos = [
      pedido({ id: 'a', data: '2026-09-01', valor: 1000, valor_agendado: 1000 }),
      pedido({ id: 'b', data: '2026-09-01', valor: 1000, valor_agendado: 1000, vendedor: 'Matheus' }),
    ];
    const r = calcularPnl([], [], periodo, {}, pedidos);
    // 2.000 − (166 produto + 66 frete + 50 + 60 comissões + 20 cobrança) = 1.638
    expect(r.lucro_agendado).toBe(163_800);
  });

  it('frustrado não entra na projeção — tem perda própria', () => {
    const pedidos = [
      pedido({ id: 'a', data: '2026-09-01' }),
      pedido({ id: 'b', data: '2026-09-01', status: 'frustrados' }),
    ];
    const r = calcularPnl([], [], periodo, {}, pedidos);
    // O funil segue o BlueSales e conta o frustrado como agendado...
    expect(r.valor_agendado).toBe(147_000);
    // ...mas a projeção olha só o que segue de pé: 1 pedido de R$ 735.
    // Produto 83 + frete 33 = 116; comissão 5% = 36,75; cobrança 1% = 7,35.
    expect(r.lucro_agendado).toBe(73_500 - 11_600 - 3_675 - 735);
  });

  it('sem agendamento no período fica zerada em vez de dividir por zero', () => {
    const r = calcularPnl([daily({ data: '2026-09-01', investimento_ads: 500 })], [], periodo, {}, []);
    expect(r.margem_agendado).toBe(0);
    expect(r.lucro_agendado).toBe(0);
  });
});
