import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, CustoVariavel, Periodo } from '@/types';
import { formatPercent } from '@/lib/money';
import { calcularPnl, custoNoPeriodo } from '@/lib/pnl';

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
  // Padrão: os frustrados NÃO descontam do lucro — é assim que o BlueSales
  // apresenta (mostra a perda no bloco Perdas, mas não a subtrai).
  it('1. sem custos variáveis: afterpay 14.772,17 · lucro 6.041,08 · margem 29,0%', () => {
    const r = calcularPnl([dia], [], periodo);
    expect(r.custos_afterpay).toBe(1_477_217); // R$ 14.772,17
    expect(r.desconto_frustrados).toBe(0); // padrão 'nenhum'
    expect(r.lucro_real).toBe(604_108); // R$ 6.041,08
    expect(r.lucro_afterpay).toBe(604_108);
    expect(formatPercent(r.margem_real)).toBe('29,0%');
  });

  it('2. com custos variáveis de 1.500,00: totais 16.272,17 · lucro 4.541,08 · margem 21,8%', () => {
    const r = calcularPnl([dia], [custoUnico(1500)], periodo);
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

  it('5. custo mensal 300,00 em 15 dias de um mês de 30 dias, com rateio: entra 150,00', () => {
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
    const contrib = custoNoPeriodo(custo, { inicio: '2025-04-01', fim: '2025-04-15' });
    expect(contrib).toBe(15_000); // R$ 150,00
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
  it('ticket médio 693,78 · CPA 146,06 · ROAS ~2,04', () => {
    const r = calcularPnl([dia], [], periodo);
    expect(r.ticket_medio).toBe(69_378); // R$ 693,78 — sobre os 30 pagamentos
    // CPA é por AGENDAMENTO: R$ 10.224,00 ÷ 70 agendados = R$ 146,06.
    // Pelos 30 pagamentos dava R$ 340,80 — o anúncio traz o agendamento,
    // o pagamento vem depois e às vezes em outro dia.
    expect(r.cpa).toBe(14_606);
    expect(r.roas).toBeCloseTo(2.04, 2);
  });

  it('sem agendamento no período, o CPA não inventa número', () => {
    const semAgendados = { ...dia, qtd_agendados: 0, valor_agendado: 0 };
    expect(calcularPnl([semAgendados], [], periodo).cpa).toBe(0);
  });

  it('diferença vs Afterpay = custos variáveis (sinal negativo)', () => {
    const r = calcularPnl([dia], [custoUnico(1500)], periodo);
    expect(r.diferenca_afterpay).toBe(-150_000); // − R$ 1.500,00
  });
});

describe('rateio de custos recorrentes', () => {
  it('sem rateio: valor integral se qualquer dia do mês está no período', () => {
    const custo: CustoVariavel = {
      id: 'm2',
      data: '2025-04-01',
      categoria_id: null,
      descricao: 'assinatura',
      valor: 300,
      recorrencia: 'mensal',
      recorrencia_fim: null,
      ratear_por_dias: false,
    };
    expect(custoNoPeriodo(custo, { inicio: '2025-04-01', fim: '2025-04-15' })).toBe(30_000);
  });

  it('mensal cruzando 2 meses com rateio soma as duas parcelas', () => {
    const custo: CustoVariavel = {
      id: 'm3',
      data: '2025-01-01',
      categoria_id: null,
      descricao: 'saas',
      valor: 310, // jan tem 31 dias → 1 dia = 1000 centavos exatos
      recorrencia: 'mensal',
      recorrencia_fim: null,
      ratear_por_dias: true,
    };
    // 15 dias de jan (31d) + 10 dias de fev (28d)
    const contrib = custoNoPeriodo(custo, { inicio: '2025-01-17', fim: '2025-02-10' });
    const jan = Math.round((31_000 * 15) / 31); // R$ 3,10/dia → 15.000
    const fev = Math.round((31_000 * 10) / 28);
    expect(contrib).toBe(jan + fev);
  });

  it('recorrência respeita data de início e fim', () => {
    const custo: CustoVariavel = {
      id: 'm4',
      data: '2025-06-01',
      categoria_id: null,
      descricao: 'temporária',
      valor: 100,
      recorrencia: 'mensal',
      recorrencia_fim: '2025-06-30',
      ratear_por_dias: false,
    };
    // fora da janela de recorrência → 0
    expect(custoNoPeriodo(custo, { inicio: '2025-08-01', fim: '2025-08-31' })).toBe(0);
    // dentro → integral
    expect(custoNoPeriodo(custo, { inicio: '2025-06-01', fim: '2025-06-30' })).toBe(10_000);
  });
});
