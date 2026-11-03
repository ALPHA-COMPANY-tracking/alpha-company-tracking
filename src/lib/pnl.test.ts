import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, CustoVariavel, Periodo } from '@/types';
import { formatPercent } from '@/lib/money';
import { calcularPnl, cobrancasNoPeriodo, custoNoPeriodo } from '@/lib/pnl';

// ── Fixture: os números reais do Jonas (spec / critérios de aceite) ──
const dia: AfterpayDaily = {
  data: '2025-08-15',
  receita_aprovada: 20813.25,
  qtd_pagamentos: 30,
  taxas_plataforma: 22.5,
  custo_produtos: 2288.0,
  frete: 990.0,
  comissoes_vendedor: 1039.54,
  comissoes_cobranca: 208.13,
  investimento_ads: 10224.0,
  taxas_investimento: 0.0,
  valor_frustrado: 2940.0,
  qtd_frustrados: 4,
  valor_agendado: 48150.0,
  qtd_agendados: 70,
};

const periodo: Periodo = { inicio: '2025-08-01', fim: '2025-08-31' };

function custoUnico(valor: number): CustoVariavel {
  return {
    id: 'c1',
    data: '2025-08-10',
    categoria_id: 'cat-1',
    descricao: 'teste',
    valor,
    recorrencia: 'unico',
    recorrencia_fim: null,
    ratear_por_dias: true,
  };
}

describe('calcularPnl — critérios de aceite', () => {
  // Critérios de aceite do Afterpay, sem descontar os frustrados. (Desde
  // 30/09/2026 o padrão desconta o custo real, como o BlueSales — ver teste 3.)
  const SEM = { descontarFrustrados: 'nenhum' } as const;
  it('1. sem custos variáveis: afterpay 14.772,17 · lucro 6.041,08 · margem 29,0%', () => {
    const r = calcularPnl([dia], [], periodo, SEM);
    expect(r.custos_afterpay).toBe(1_477_217); // R$ 14.772,17
    expect(r.desconto_frustrados).toBe(0);
    expect(r.lucro_real).toBe(604_108); // R$ 6.041,08
    expect(r.lucro_afterpay).toBe(604_108);
    expect(formatPercent(r.margem_real)).toBe('29,0%');
  });

  it('2. com custos variáveis de 1.500,00: totais 16.272,17 · lucro 4.541,08 · margem 21,8%', () => {
    const r = calcularPnl([dia], [custoUnico(1500)], periodo, SEM);
    expect(r.custos_variaveis_total).toBe(150_000);
    expect(r.custos_totais_reais).toBe(1_627_217); // R$ 16.272,17
    expect(r.lucro_real).toBe(454_108); // R$ 4.541,08
    expect(formatPercent(r.margem_real)).toBe('21,8%');
  });

  it('3. modo "real" desconta a perda de caixa dos frustrados', () => {
    // Sem pedidos do BlueSales não dá para separar produto+frete: o
    // fixture cai no valor cheio do frustrado (R$ 2.940,00).
    const r = calcularPnl([dia], [], periodo, { descontarFrustrados: 'real' });
    expect(r.desconto_frustrados).toBe(294_000);
    expect(r.lucro_real).toBe(310_108); // R$ 3.101,08
    // e o comparativo "com frustrados" existe mesmo no modo padrão:
    expect(calcularPnl([dia], [], periodo).lucro_real_com_frustrados).toBe(310_108);
  });

  it('4. valor pendente 27.336,75 · conversão 42,9%', () => {
    const r = calcularPnl([dia], [], periodo);
    expect(r.valor_pendente).toBe(2_733_675); // R$ 27.336,75
    expect(formatPercent(r.conversao_agendado)).toBe('42,9%');
  });

  it('5. custo mensal 300,00 cadastrado no dia 1º: entra cheio no dia 1º (não rateado)', () => {
    const custo: CustoVariavel = {
      id: 'm1',
      data: '2025-04-01',
      categoria_id: 'cat-1',
      descricao: 'ferramenta mensal',
      valor: 300,
      recorrencia: 'mensal',
      recorrencia_fim: null,
      ratear_por_dias: true,
    };
    expect(custoNoPeriodo(custo, { inicio: '2025-04-01', fim: '2025-04-15' })).toBe(30_000); // R$ 300,00 no dia 1º
    expect(custoNoPeriodo(custo, { inicio: '2025-04-02', fim: '2025-04-30' })).toBe(0); // o dia 1º ficou fora
  });

  it('6. receita zero no período não gera NaN na margem', () => {
    const r = calcularPnl([], [], periodo);
    expect(r.receita_aprovada).toBe(0);
    expect(Number.isNaN(r.margem_real)).toBe(false);
    expect(r.margem_real).toBe(0);
    expect(r.roas).toBe(0);
    expect(r.ticket_medio).toBe(0);
    expect(formatPercent(r.margem_real)).toBe('0,0%');
  });
});

describe('indicadores derivados', () => {
  it('ticket médio 693,78 · CPA 146,06 · ROAS ~4,71', () => {
    const r = calcularPnl([dia], [], periodo);
    expect(r.ticket_medio).toBe(69_378); // R$ 693,78 — sobre os 30 pagamentos
    // CPA é por AGENDAMENTO: R$ 10.224,00 ÷ 70 agendados = R$ 146,06.
    // Pelos 30 pagamentos dava R$ 340,80 — o anúncio traz o agendamento,
    // o pagamento vem depois e às vezes em outro dia.
    expect(r.cpa).toBe(14_606);
    // ROAS sobre o AGENDADO: R$ 48.150,00 ÷ R$ 10.224,00 = 4,71x.
    // Pelo aprovado dava 2,04x — mede o pagamento, não o anúncio.
    expect(r.roas).toBeCloseTo(4.71, 2);
  });

  it('sem agendamento no período, o CPA não inventa número', () => {
    const semAgendados = { ...dia, qtd_agendados: 0, valor_agendado: 0 };
    expect(calcularPnl([semAgendados], [], periodo).cpa).toBe(0);
  });

  it('diferença vs Afterpay = custos variáveis (sinal negativo)', () => {
    const r = calcularPnl([dia], [custoUnico(1500)], periodo, { descontarFrustrados: 'nenhum' });
    expect(r.diferenca_afterpay).toBe(-150_000); // − R$ 1.500,00
  });
});

describe('custo mensal programado (03/11/2026)', () => {
  const mensal = (data: string, valor: number, recorrencia_fim: string | null = null): CustoVariavel => ({
    id: 'm',
    data,
    categoria_id: null,
    descricao: 'assinatura',
    valor,
    recorrencia: 'mensal',
    recorrencia_fim,
    ratear_por_dias: true, // ignorado: o mensal entra cheio no dia dele
  });

  it('entra cheio no dia do mês em que foi cadastrado, todo mês', () => {
    const claude = mensal('2026-11-02', 116.83);
    expect(cobrancasNoPeriodo(claude, { inicio: '2026-11-02', fim: '2026-11-02' })).toEqual(['2026-11-02']);
    expect(custoNoPeriodo(claude, { inicio: '2026-11-02', fim: '2026-11-02' })).toBe(11_683);
    expect(custoNoPeriodo(claude, { inicio: '2026-11-03', fim: '2026-11-03' })).toBe(0); // não é o dia
    expect(custoNoPeriodo(claude, { inicio: '2026-12-02', fim: '2026-12-02' })).toBe(11_683); // mês seguinte, mesmo dia
  });

  it('antes do cadastro não cobra; o mês inteiro dá o valor cheio', () => {
    const data = mensal('2026-10-21', 807);
    expect(custoNoPeriodo(data, { inicio: '2026-10-01', fim: '2026-10-20' })).toBe(0);
    expect(custoNoPeriodo(data, { inicio: '2026-10-01', fim: '2026-10-31' })).toBe(80_700);
    expect(custoNoPeriodo(data, { inicio: '2026-11-01', fim: '2026-11-30' })).toBe(80_700);
  });

  it('dia 31 em mês de 30 dias (e fevereiro) cobra no último dia', () => {
    const c = mensal('2026-01-31', 100);
    expect(cobrancasNoPeriodo(c, { inicio: '2026-02-01', fim: '2026-02-28' })).toEqual(['2026-02-28']);
    expect(cobrancasNoPeriodo(c, { inicio: '2026-04-01', fim: '2026-04-30' })).toEqual(['2026-04-30']);
  });

  it('período de dois meses cobra duas vezes', () => {
    const c = mensal('2025-01-20', 310);
    expect(custoNoPeriodo(c, { inicio: '2025-01-17', fim: '2025-02-10' })).toBe(31_000); // só 20/01
    expect(custoNoPeriodo(c, { inicio: '2025-01-17', fim: '2025-02-25' })).toBe(62_000); // 20/01 e 20/02
  });

  it('recorrência respeita data de início e fim', () => {
    const c = mensal('2025-06-01', 100, '2025-06-30');
    expect(custoNoPeriodo(c, { inicio: '2025-08-01', fim: '2025-08-31' })).toBe(0);
    expect(custoNoPeriodo(c, { inicio: '2025-06-01', fim: '2025-06-30' })).toBe(10_000);
  });
});
