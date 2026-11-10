// Metas & Lucro — testes de aceite da especificação do Jonas (02/11/2026),
// tolerância de ±R$ 1.
import { describe, expect, it } from 'vitest';
import type { CustoVariavel } from '@/types';
import {
  FAIXAS_PADRAO,
  type Premissas,
  bonusDaFaixa,
  comCustosDaDash,
  curvaPorTaxa,
  custosDaDashNoMes,
  mesAntes,
  nomeDoMes,
  premissasIniciais,
  projetarPeloRitmo,
  referenciasDe,
  simular,
} from '@/lib/metasLucro';

const perto = (valor: number, esperado: number, tol = 1) => expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

const TESTE1: Premissas = {
  modo: 'meta',
  meta_agendado: 350_000,
  verba_anuncios: 0,
  taxa_recebimento: 0.5,
  ticket: 582.0641,
  cpa: 196.9689,
  outros_pct: 0.217008,
  imposto_pct: 0.1143,
  fixos: [
    { nome: 'Despesas', valor: 10_000 },
    { nome: 'Cezar', valor: 10_000 },
  ],
  frustracao_pct: 0.25,
  custo_frustrado: 33.2608,
  lucro_desejado: 30_000,
  vendedores: 3,
  cobradores: 2,
  base_vendedor: 'agendado',
  modo_bonus_empresa: 'pessoa',
};

describe('teste 1 (modo meta)', () => {
  const r = simular(TESTE1, FAIXAS_PADRAO)!;
  it('funil, custos e lucro antes dos bônus', () => {
    expect(r.N).toBeCloseTo(601.3, 1);
    perto(r.A, 118_439);
    perto(r.R, 175_000);
    perto(r.O, 37_976);
    perto(r.I, 20_003);
    expect(r.NF).toBeCloseTo(150.3, 1);
    perto(r.FR, 5_000);
    perto(r.LB, -26_418);
  });
  it('bônus e lucro projetado', () => {
    expect([r.bV, r.bC, r.bE, r.B]).toEqual([750, 0, 2_500, 3_250]);
    perto(r.LF, -29_668);
    expect(r.status).toBe('prejuizo');
  });
  it('alavancas', () => {
    expect(Math.round(r.taxa_necessaria! * 1000) / 10).toBe(75.5);
    expect(r.cpa_max!).toBeCloseTo(97.74, 2);
    expect(Math.round(r.sobra_pct! * 1000) / 10).toBe(-1.8);
  });
});

describe('teste 2 (modo verba)', () => {
  const r = simular({ ...TESTE1, modo: 'verba', verba_anuncios: 80_000 }, FAIXAS_PADRAO)!;
  it('agendado, pedidos, frustração, bônus e lucro', () => {
    perto(r.M, 236_409);
    expect(r.N).toBeCloseTo(406.2, 1);
    perto(r.FR, 3_377);
    expect(r.B).toBe(0);
    perto(r.LF, -24_335);
  });
  it('alavancas', () => {
    expect(Math.round(r.taxa_necessaria! * 1000) / 10).toBe(84.4);
    expect(r.cpa_max!).toBeCloseTo(114.64, 2);
  });
});

describe('teste 3 (modo meta, taxa 60% e CPA 150)', () => {
  const r = simular({ ...TESTE1, taxa_recebimento: 0.6, cpa: 150 }, FAIXAS_PADRAO)!;
  it('anúncio, bônus e lucro', () => {
    perto(r.A, 90_196);
    expect(r.B).toBe(3_750);
    perto(r.LF, 21_479);
  });
});

describe('regras', () => {
  it('faixa: a maior com "a partir de" ≤ resultado; nenhuma = 0', () => {
    expect(bonusDaFaixa(FAIXAS_PADRAO.vendedor, 99_999)).toBe(0);
    expect(bonusDaFaixa(FAIXAS_PADRAO.vendedor, 100_000)).toBe(250);
    expect(bonusDaFaixa(FAIXAS_PADRAO.vendedor, 199_999)).toBe(350);
    expect(bonusDaFaixa(FAIXAS_PADRAO.vendedor, 500_000)).toBe(500);
    expect(bonusDaFaixa(FAIXAS_PADRAO.vendedor, null)).toBe(0);
  });

  it('empresa por time paga uma vez só', () => {
    expect(simular({ ...TESTE1, modo_bonus_empresa: 'time' }, FAIXAS_PADRAO)!.bE).toBe(500);
  });

  it('vendedor pelo recebido usa R', () => {
    const r = simular({ ...TESTE1, base_vendedor: 'recebido' }, FAIXAS_PADRAO)!;
    expect(r.indV).toBeCloseTo(175_000 / 3, 6);
    expect(r.bV).toBe(0); // 58.333 por pessoa: abaixo da 1ª faixa
  });

  it('status: liberado, abaixo do desejado, prejuízo', () => {
    expect(simular({ ...TESTE1, taxa_recebimento: 0.6, cpa: 150 }, FAIXAS_PADRAO)!.status).toBe('abaixo'); // 21.479 < 30.000
    expect(simular({ ...TESTE1, taxa_recebimento: 0.65, cpa: 150 }, FAIXAS_PADRAO)!.status).toBe('liberado');
  });

  it('sem base para a conta: nada de divisão por zero', () => {
    expect(simular({ ...TESTE1, ticket: 0 }, FAIXAS_PADRAO)).toBeNull();
    expect(simular({ ...TESTE1, modo: 'verba', verba_anuncios: 80_000, cpa: 0 }, FAIXAS_PADRAO)).toBeNull();
    const semEquipe = simular({ ...TESTE1, vendedores: 0, cobradores: 0 }, FAIXAS_PADRAO)!;
    expect([semEquipe.indV, semEquipe.indC, semEquipe.B]).toEqual([null, null, 0]);
  });

  it('curva do lucro: taxa de 30% a 90%, de 1 em 1', () => {
    const c = curvaPorTaxa(TESTE1, FAIXAS_PADRAO);
    expect(c).toHaveLength(61);
    expect(c[0].taxa).toBe(0.3);
    expect(c[60].taxa).toBe(0.9);
    perto(c.find((p) => Math.abs(p.taxa - 0.5) < 1e-9)!.lucro, -29_668);
  });

  it('projeção pelo ritmo e meses', () => {
    expect(projetarPeloRitmo(10_000, '2026-11-02')).toBe(150_000); // 10 mil em 2 dias × 30
    expect(mesAntes('2026-01')).toBe('2025-12');
    expect(nomeDoMes('2026-11')).toBe('novembro/2026');
  });

  it('premissas iniciais: as da especificação + as do mês anterior', () => {
    const ref = referenciasDe({
      agendado: 209_415, qtd_agendados: 355, aprovado: 101_588.19, qtd_pagamentos: 171, anuncios: 72_621.74,
      custos_afterpay: 100_000, custos_variaveis: 8_747.12, lucro_real: -5_282.2, frustrados: 20_685, qtd_frustrados: 32,
      cancelados: 3_810, qtd_cancelados: 6, vendedores: 2,
    });
    const p = premissasIniciais(ref);
    expect(p.ticket).toBeCloseTo(589.9, 1);
    expect(p.cpa).toBeCloseTo(204.57, 2);
    expect(p.outros_pct).toBeCloseTo((100_000 - 72_621.74) / 101_588.19, 6);
    expect([p.meta_agendado, p.taxa_recebimento, p.imposto_pct, p.frustracao_pct, p.custo_frustrado, p.lucro_desejado]).toEqual([
      350_000, 0.5, 0.1143, 0.25, 33.26, 30_000,
    ]);
    expect(p.fixos).toEqual([]); // os fixos vêm da tela Custos; manuais começam vazios
    expect(ref.taxa_recebimento_real).toBeCloseTo(101_588.19 / 209_415, 6);
    expect(ref.taxa_frustracao_real).toBeCloseTo(32 / 355, 6);
  });
});

describe('custos fixos da tela Custos (10/11/2026)', () => {
  const custo = (id: string, data: string, valor: number, recorrencia: 'mensal' | 'unico', extra: Partial<CustoVariavel> = {}): CustoVariavel => ({
    id,
    data,
    categoria_id: null,
    descricao: id.toUpperCase(),
    valor,
    recorrencia,
    recorrencia_fim: null,
    ratear_por_dias: true,
    ...extra,
  });
  const custos = [
    custo('lautch', '2026-10-09', 297, 'mensal'),
    custo('claude', '2026-11-02', 110, 'mensal'),
    custo('chip', '2026-11-15', 40, 'unico'),
    custo('chip-outubro', '2026-10-20', 40, 'unico'),
    custo('encerrado', '2026-08-05', 50, 'mensal', { recorrencia_fim: '2026-10-31' }),
  ];

  it('mensais cheios no dia deles e avulsos com data no mês', () => {
    expect(custosDaDashNoMes(custos, '2026-11')).toEqual([
      { id: 'lautch', nome: 'LAUTCH', valor: 297, mensal: true, dia: 9 },
      { id: 'claude', nome: 'CLAUDE', valor: 110, mensal: true, dia: 2 },
      { id: 'chip', nome: 'CHIP', valor: 40, mensal: false, dia: 15 },
    ]);
  });

  it('mês futuro: só os mensais; mês antes do cadastro: nada dele', () => {
    expect(custosDaDashNoMes(custos, '2026-12').map((c) => c.id)).toEqual(['lautch', 'claude']);
    expect(custosDaDashNoMes(custos, '2026-10').map((c) => c.id)).toEqual(['lautch', 'encerrado', 'chip-outubro']);
  });

  it('entram na conta junto com os manuais', () => {
    const daDash = custosDaDashNoMes(custos, '2026-11');
    const p = comCustosDaDash({ ...TESTE1, fixos: [{ nome: 'Pró-labore', valor: 5_000 }] }, daDash);
    expect(p.fixos.map((f) => f.valor)).toEqual([297, 110, 40, 5_000]);
    expect(simular(p, FAIXAS_PADRAO)!.FX).toBe(297 + 110 + 40 + 5_000);
  });
});
