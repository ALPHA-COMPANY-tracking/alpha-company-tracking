// Metas × operação, mês contra mês (pedido do Jonas, 30/10/2026).
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { METAS, diagnosticar, fotografar, mesAnterior, mesesDoPlano, mixDeTratamentos, rotuloPeriodo } from '@/lib/metasOperacao';

const OUT = { inicio: '2026-10-01', fim: '2026-10-31' };

const dia = (data: string, ads: number): AfterpayDaily => ({
  data, receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, taxa_conferida: true, custo_produtos: 0, frete: 0,
  comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: ads, taxas_investimento: 0, leads: 0,
  valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0, qtd_agendados: 0,
});

let n = 0;
const ped = (status: string, plano: string, valor: number, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${++n}`,
  status,
  data: '2026-10-05',
  valor,
  valor_agendado: valor,
  produto_plano: plano,
  vendedor: 'PETER',
  ...extra,
});

describe('mês anterior para comparar', () => {
  it('"este mês" compara com os mesmos dias do mês anterior; mês inteiro com mês inteiro', () => {
    expect(mesAnterior({ inicio: '2026-10-01', fim: '2026-10-30' })).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(mesAnterior({ inicio: '2026-10-01', fim: '2026-10-31' })).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(mesAnterior({ inicio: '2026-11-01', fim: '2026-11-05' })).toEqual({ inicio: '2026-10-01', fim: '2026-10-05' });
    expect(mesAnterior({ inicio: '2026-03-01', fim: '2026-03-30' })).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(mesAnterior({ inicio: '2026-01-01', fim: '2026-01-31' })).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' });
  });

  it('período solto compara com os dias logo antes', () => {
    expect(mesAnterior({ inicio: '2026-10-10', fim: '2026-10-16' })).toEqual({ inicio: '2026-10-03', fim: '2026-10-09' });
  });

  it('rótulos', () => {
    expect(rotuloPeriodo({ inicio: '2026-09-01', fim: '2026-09-30' })).toBe('setembro');
    expect(rotuloPeriodo({ inicio: '2026-10-01', fim: '2026-10-30' })).toBe('01 a 30/10');
    expect(rotuloPeriodo({ inicio: '2026-10-10', fim: '2026-10-16' })).toBe('10/10 a 16/10');
  });
});

describe('tratamentos', () => {
  it('meses de tratamento pelo nome do plano', () => {
    expect(mesesDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME')).toBe(6);
    expect(mesesDoPlano('DERMAX PREMIUM - 4 POTE + 1 GOTA')).toBe(4);
    expect(mesesDoPlano('(PROMO) - 3 MESES')).toBe(3);
    expect(mesesDoPlano('DERMAX PREMIUM - 2 POTE + 1 GOTA')).toBe(2);
    expect(mesesDoPlano('DERMAX PREMIUM - 1 POTE + 1 GOTA')).toBe(1);
    expect(mesesDoPlano('PLANO 12 POTE')).toBeNull();
    expect(mesesDoPlano(null)).toBeNull();
  });

  it('mix do período: quantos, quanto, ticket e quantos já pagaram', () => {
    const mix = mixDeTratamentos(
      [
        ped('pagos', 'DERMAX PREMIUM - 6 POTE + 1 GOTA', 735),
        ped('enviados', 'DERMAX PREMIUM - 6 POTE + 1 GOTA', 735),
        ped('pagos', '(PROMO) - 3 MESES', 335),
        ped('roubo', 'DERMAX PREMIUM - 3 POTE + 1 GOTA', 435),
        ped('pagos', 'DERMAX PREMIUM - 6 POTE', 735, { data: '2026-09-30' }), // outro mês
        ped('pagos', 'DERMAX PREMIUM - 6 POTE', 735, { removido_em: '2026-10-06T00:00:00Z' }), // lixeira
      ],
      OUT,
    );
    expect(mix.map((l) => l.rotulo)).toEqual(['6 meses', '3 meses']);
    expect(mix[0]).toMatchObject({ qtd: 2, valor: 147_000, pct: 0.5, ticket: 73_500, pagos: 1, pct_pagos: 0.5 });
    expect(mix[1]).toMatchObject({ qtd: 2, valor: 77_000, ticket: 38_500, pagos: 1, frustrados: 1, promo: 1 });
  });
});

describe('empate: o anúncio que zera o lucro real', () => {
  const pedidos = [
    ped('pagos', 'DERMAX PREMIUM - 6 POTE', 735, { data_aprovacao: '2026-10-05' }),
    ped('pagos', 'DERMAX PREMIUM - 6 POTE', 735, { data_aprovacao: '2026-10-06' }),
    ped('enviados', 'DERMAX PREMIUM - 6 POTE', 735),
    ped('enviados', 'DERMAX PREMIUM - 6 POTE', 735),
  ];
  const dailies = [dia('2026-10-05', 600)];

  it('com o anúncio de empate, o lucro real dá zero', () => {
    const f = fotografar(dailies, [], pedidos, OUT);
    const pnl = calcularPnl(dailies, [], OUT, {}, pedidos);
    expect(f.anuncio_empate).toBe(pnl.lucro_real + pnl.investimento_ads);
    expect(f.cpa_empate).toBe(Math.round(f.anuncio_empate / 4));
    expect(f.cpa_agendamento).toBe(15_000); // 600 ÷ 4
    expect(f.roas_agendado_empate).toBeCloseTo((4 * 73_500) / f.anuncio_empate, 6);
    const noEmpate = calcularPnl([dia('2026-10-05', f.anuncio_empate / 100)], [], OUT, {}, pedidos);
    expect(Math.abs(noEmpate.lucro_real)).toBeLessThanOrEqual(1);
  });

  it('o gargalo: CPA acima do empate vem primeiro, como prejuízo', () => {
    const caro = fotografar([dia('2026-10-05', 1200)], [], pedidos, OUT); // R$ 300 por agendamento
    const d = diagnosticar(caro, caro);
    expect(d[0].nivel).toBe('ruim');
    expect(d[0].titulo).toMatch(/CPA/);
    expect(caro.cpa_agendamento).toBeGreaterThan(METAS.cpa_agendamento);
  });

  it('dentro das metas: nada fora do lugar', () => {
    const barato = fotografar([dia('2026-10-05', 100)], [], pedidos, OUT); // R$ 25 por agendamento
    expect(diagnosticar(barato, barato).every((x) => x.nivel === 'ok')).toBe(true);
  });
});
