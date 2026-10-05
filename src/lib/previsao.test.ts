// Previsão do Mês: contas conferíveis à mão.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido } from '@/types';
import { addDias } from '@/lib/dates';
import { preverMes } from '@/lib/previsao';

const HOJE = '2026-10-10';
const PLANO = 'DERMAX PREMIUM - 6 POTE'; // produto 83 + frete 33 = 116

let n = 0;
const ped = (status: string, data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: `P${++n}`,
  internal_id: n,
  status,
  data,
  valor: 735,
  valor_agendado: 735,
  produto_plano: PLANO,
  vendedor: 'PETER',
  metodo_pagamento: 'pix',
  ...extra,
});

const dia = (data: string, ads: number): AfterpayDaily => ({
  data,
  receita_aprovada: 0,
  qtd_pagamentos: 0,
  taxas_plataforma: 0,
  taxa_conferida: false,
  custo_produtos: 0,
  frete: 0,
  comissoes_vendedor: 0,
  comissoes_cobranca: 0,
  investimento_ads: ads,
  taxas_investimento: 0,
  leads: 0,
  valor_frustrado: 0,
  qtd_frustrados: 0,
  valor_agendado: 0,
  qtd_agendados: 0,
});

// Histórico de setembro: 8 pagos, todos 5 dias depois de agendados; uma
// perda de cobrança (falhou depois de entregue) e um roubo (na rua).
const historico = (): Pedido[] => [
  ...Array.from({ length: 8 }, (_, i) => {
    const data = addDias('2026-09-01', i);
    return ped('pagos', data, { data_aprovacao: addDias(data, 5) });
  }),
  ped('perda_de_cobranca', '2026-09-10'),
  ped('roubo', '2026-09-11', { rastreamento: 'AA123' }),
];

describe('Previsão do Mês', () => {
  const emRota = ped('enviados', '2026-10-08'); // 2 dias: deve pagar em 13/10
  const parado = ped('entregue', '2026-09-20'); // 20 dias: nenhum pagamento demorou tanto
  const negociando = ped('negociacao', '2026-09-22');
  const pedidos = [...historico(), emRota, parado, negociando];
  const dailies = Array.from({ length: 7 }, (_, i) => dia(addDias('2026-10-03', i), 100));
  const pr = preverMes(pedidos, dailies, [], HOJE);

  it('quanto paga, pela etapa: entregue paga mais que na rua', () => {
    const taxa = Object.fromEntries(pr.linhas.map((l) => [l.etapa, l.taxa]));
    expect(taxa.aguardando).toBeCloseTo(8 / 9, 6); // só a perda de cobrança aconteceu depois de entregue
    expect(taxa.rota).toBeCloseTo(8 / 10, 6);
    expect(taxa.preparo).toBeCloseTo(8 / 10, 6);
    expect(pr.base.atraso_mediano).toBe(5);
  });

  it('pedido em rota: valor × chance de pagar, no dia certo', () => {
    const rota = pr.linhas.find((l) => l.etapa === 'rota')!;
    expect(rota.qtd).toBe(1);
    expect(rota.previsto).toBe(58_800); // 735 × 80%
    const dia13 = pr.serie.find((p) => p.data === '2026-10-13')!;
    const dia12 = pr.serie.find((p) => p.data === '2026-10-12')!;
    expect(dia13.previsto! - dia12.previsto!).toBeGreaterThanOrEqual(58_800);
  });

  it('negociação e pedido parado demais ficam fora', () => {
    expect(pr.fora.negociacao).toEqual({ qtd: 1, valor: 73_500 });
    expect(pr.fora.parados).toEqual({ qtd: 1, valor: 73_500 });
    expect(pr.linhas.find((l) => l.etapa === 'aguardando')!.qtd).toBe(0);
  });

  it('vendas novas pelo ritmo de 14 dias: só as que pagam até o fim do mês', () => {
    // 1 pedido nos últimos 14 dias → 1/14 por dia. Faltam 21 dias; quem for
    // agendado até 26/10 paga até 31/10 (16 dias) × 80%.
    const novas = pr.linhas.find((l) => l.etapa === 'novas')!;
    expect(novas.previsto).toBe(Math.round(((16 / 14) * 0.8 * 735) * 100));
    expect(pr.ritmo.qtd_dia).toBeCloseTo(1 / 14, 6);
  });

  it('o gráfico termina no faturamento previsto, e o lucro fecha a conta', () => {
    expect(pr.diasRestantes).toBe(21);
    expect(Math.abs(pr.serie[pr.serie.length - 1].previsto! - pr.faturamento_previsto)).toBeLessThanOrEqual(2);
    expect(pr.faturamento_previsto).toBe(pr.ja_entrou + pr.deve_entrar);
    const l = pr.lucro;
    expect(l.ads_dia).toBe(10_000);
    expect(l.ads_restante).toBe(21 * 10_000);
    expect(l.previsto).toBe(l.ate_agora + l.receita_prevista - l.custos_da_receita - l.ads_restante - l.fixos_restantes - l.frustracao_prevista);
    // Frustração prevista: o pedido em rota (20% × 116) + as vendas novas que frustram.
    expect(l.frustracao_prevista).toBe(Math.round((0.2 * 116 + (16 / 14) * 0.2 * 116) * 100));
  });

  it('pedido excluído da plataforma não entra em nada', () => {
    const sem = preverMes([...pedidos, ped('enviados', '2026-10-09', { removido_em: '2026-10-09T12:00:00Z' })], dailies, [], HOJE);
    expect(sem.linhas.find((l) => l.etapa === 'rota')!.qtd).toBe(1);
  });

  it('último dia do mês: nada de ads nem vendas novas pela frente', () => {
    const fim = preverMes(pedidos, dailies, [], '2026-10-31');
    expect(fim.diasRestantes).toBe(0);
    expect(fim.lucro.ads_restante).toBe(0);
    expect(fim.linhas.find((l) => l.etapa === 'novas')!.previsto).toBe(0);
  });
});
