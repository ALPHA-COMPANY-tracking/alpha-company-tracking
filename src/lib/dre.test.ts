// Demonstrativo: os blocos só reagrupam o P&L — nenhum centavo some ou aparece.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, CustoVariavel, Pedido } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { degrausCascata, montarDRE } from '@/lib/dre';

const P = { inicio: '2026-09-09', fim: '2026-09-15' };

const dia = (data: string, ads: number, taxa = 0): AfterpayDaily => ({
  data, receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: taxa, taxa_conferida: true, custo_produtos: 0, frete: 0,
  comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: ads, taxas_investimento: 0, leads: 0,
  valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0, qtd_agendados: 0,
});

const pedidos: Pedido[] = [
  { id: 'a', status: 'pagos', data: '2026-09-10', data_aprovacao: '2026-09-11', valor: 735, valor_agendado: 735, produto_plano: 'DERMAX PREMIUM - 6 POTE', vendedor: 'PETER' },
  { id: 'b', status: 'pagos', data: '2026-09-12', data_aprovacao: '2026-09-14', valor: 435, valor_agendado: 435, produto_plano: 'DERMAX PREMIUM - 3 POTE', vendedor: 'Matheus' },
  { id: 'c', status: 'cadastrados', data: '2026-09-15', valor: 735, valor_agendado: 735, produto_plano: 'DERMAX PREMIUM - 6 POTE', vendedor: 'PETER' },
  { id: 'f', status: 'frustrados', data: '2026-09-13', valor: 735, valor_agendado: 735, produto_plano: 'DERMAX PREMIUM - 6 POTE', vendedor: 'PETER' },
];
const dailies = [dia('2026-09-11', 120, 5), dia('2026-09-14', 80)];
const custos: CustoVariavel[] = [
  { id: 'x', data: '2026-09-12', categoria_id: 'cat-chips', descricao: 'Chips', valor: 97, recorrencia: 'unico', recorrencia_fim: null, ratear_por_dias: false },
];

describe('demonstrativo de resultados', () => {
  it('resultado operacional é o lucro que o BlueSales mostra', () => {
    const pnl = calcularPnl(dailies, custos, P, {}, pedidos);
    expect(montarDRE(pnl).resultadoOperacional.valor).toBe(pnl.lucro_afterpay);
  });

  it('termina no lucro real, descontando ou não os frustrados', () => {
    for (const modo of ['nenhum', 'real'] as const) {
      const pnl = calcularPnl(dailies, custos, P, { descontarFrustrados: modo }, pedidos);
      const dre = montarDRE(pnl);
      expect(dre.lucroReal.valor).toBe(pnl.lucro_real);
      const soma = Object.values(dre.grupos).reduce((s, g) => s + g.total, 0);
      expect(dre.receita - soma).toBe(pnl.lucro_real);
    }
  });

  it('com perda descontada o bloco Perdas carrega a perda real', () => {
    const pnl = calcularPnl(dailies, custos, P, { descontarFrustrados: 'real' }, pedidos);
    expect(pnl.desconto_frustrados).toBeGreaterThan(0);
    expect(montarDRE(pnl).grupos.perdas.total).toBe(pnl.perda_real_frustrados);
  });

  it('a cascata desce da receita até o lucro sem sair do quadro', () => {
    const pnl = calcularPnl(dailies, custos, P, {}, pedidos);
    const degraus = degrausCascata(montarDRE(pnl), false);
    expect(degraus[0].id).toBe('receita');
    expect(degraus.at(-1)!.valor).toBe(pnl.lucro_real);
    expect(degraus.some((d) => d.id === 'perdas')).toBe(false);
    for (const d of degraus) {
      expect(d.base).toBeGreaterThanOrEqual(0);
      expect(d.base + d.altura).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('prejuízo: custos maiores que a receita continuam dentro da escala', () => {
    const caro = [dia('2026-09-11', 5000)];
    const pnl = calcularPnl(caro, custos, P, {}, pedidos);
    const dre = montarDRE(pnl);
    expect(dre.lucroReal.nome).toBe('Prejuízo real');
    const degraus = degrausCascata(dre, false);
    expect(degraus.at(-1)!.nome).toBe('Prejuízo');
    for (const d of degraus) expect(d.base + d.altura).toBeLessThanOrEqual(1 + 1e-9);
  });
});
