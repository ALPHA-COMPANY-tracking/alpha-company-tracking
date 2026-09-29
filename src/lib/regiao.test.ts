// Mapa de Frustração: região do pedido, leitura do CSV e soma por estado.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { ESTADOS, lerRegioesDoCsv, nomeDeCidade, normalizarUf, perdasPorRegiao } from '@/lib/regiao';
import { aplicarRegioes } from '@/data/backend';
import { mapearPedido, regiaoDoPayload } from '../../api/bluesales-webhook';

const P = { inicio: '2026-09-01', fim: '2026-09-30' };
let n = 0;
const ped = (status: string, uf: string | null, cidade: string | null = null, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${++n}`,
  internal_id: n,
  status,
  data: '2026-09-10',
  valor: 735,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  uf,
  cidade,
  ...extra,
});

describe('estado e cidade', () => {
  it('os 27 estados, cada um num lugar do mapa', () => {
    expect(Object.keys(ESTADOS)).toHaveLength(27);
    const lugares = new Set(Object.values(ESTADOS).map((e) => `${e.col},${e.lin}`));
    expect(lugares.size).toBe(27);
  });

  it('aceita sigla ou nome, com ou sem acento', () => {
    expect(normalizarUf('sp')).toBe('SP');
    expect(normalizarUf('São Paulo')).toBe('SP');
    expect(normalizarUf('ESPIRITO SANTO')).toBe('ES');
    expect(normalizarUf('Sudeste')).toBeNull();
    expect(nomeDeCidade('SÃO JOSÉ DOS CAMPOS')).toBe('São José dos Campos');
    expect(nomeDeCidade('Rio De Janeiro')).toBe('Rio de Janeiro');
    expect(nomeDeCidade('  ')).toBeNull();
  });
});

describe('CSV do BlueSales', () => {
  it('lê SÓ número, cidade e estado — mesmo com vírgula e quebra de linha no endereço', () => {
    const csv =
      '﻿ID,Codigo,Nome,CPF,WhatsApp,Rua,Cidade,Estado,CEP\n' +
      '1664,BLV-1,Maria,000.000.000-00,11999999999,"Rua A, 10\nfundos",Campinas,SP,13000-000\n' +
      '1599,BLV-2,Joana,111.111.111-11,21988888888,Rua B,RIO DE JANEIRO,Rio de Janeiro,20000-000\n' +
      '1500,BLV-3,Ana,222,333,Rua C,,,\n';
    const r = lerRegioesDoCsv(csv);
    expect(r.itens).toEqual([
      { internal_id: 1664, uf: 'SP', cidade: 'Campinas' },
      { internal_id: 1599, uf: 'RJ', cidade: 'Rio de Janeiro' },
    ]);
    expect(r.linhas).toBe(3);
    expect(r.semRegiao).toBe(1);
    // Nada pessoal sai do arquivo.
    expect(JSON.stringify(r)).not.toMatch(/Maria|000\.000|1199|Rua A|13000/);
  });

  it('arquivo sem a coluna Estado é recusado com explicação', () => {
    expect(() => lerRegioesDoCsv('ID,Valor\n1,735\n')).toThrow(/colunas ID e Estado/);
  });

  it('aplicar: pelo número do pedido, e conta quantos achou', () => {
    const pedidos = [ped('pagos', null, null, { internal_id: 1664 }), ped('pagos', null, null, { internal_id: 7 })];
    const r = aplicarRegioes(pedidos, [{ internal_id: 1664, uf: 'SP', cidade: 'Campinas' }, { internal_id: 999, uf: 'RJ', cidade: null }]);
    expect(r.achados).toBe(1);
    expect(r.pedidos[0]).toMatchObject({ uf: 'SP', cidade: 'Campinas' });
    expect(r.pedidos[1].uf).toBeNull();
  });
});

describe('webhook', () => {
  it('pega estado e cidade onde o BlueSales puser o endereço — e nada mais', () => {
    const body = {
      event: 'ORDER_SHIPPED',
      order: { id: 'BLV-X', status: 'aguard_coleta', internal_id: 10 },
      customer: { name: 'X', address: { street: 'Rua Y', number: '5', city: 'belo horizonte', state: 'MG', zip: '30000-000' } },
    };
    expect(regiaoDoPayload(body)).toEqual({ uf: 'MG', cidade: 'Belo Horizonte' });
    const p = mapearPedido(body, 'u')!;
    expect(p).toMatchObject({ uf: 'MG', cidade: 'Belo Horizonte' });
    expect(JSON.stringify(p)).not.toMatch(/Rua Y|30000/);
  });

  it('sem endereço (evento de status), não mexe na região já salva', () => {
    const p = mapearPedido({ order: { id: 'BLV-X', status: 'enviados' }, shipping: { status: 'em trânsito' } }, 'u')!;
    expect('uf' in p).toBe(false);
    expect('cidade' in p).toBe(false);
  });
});

describe('perdas por região', () => {
  const pedidos = [
    ped('roubo', 'SP', 'Campinas'),
    ped('roubo', 'SP', 'Campinas'),
    ped('pagos', 'SP', 'Campinas'),
    ped('voltando', 'SP', 'São Paulo'),
    ped('enviados', 'SP', 'São Paulo'),
    ped('pagos', 'MG', 'Belo Horizonte'),
    ped('cancelados', 'MG', 'Belo Horizonte'),
    ped('roubo', null),
    ped('roubo', 'RJ', 'Niterói', { data: '2026-08-30' }), // fora do período
    ped('roubo', 'RJ', 'Niterói', { removido_em: '2026-09-11T00:00:00Z' }), // excluído
  ];
  const r = perdasPorRegiao(pedidos, P);

  it('por estado: roubo e frustração (roubo + devolução + cancelado…)', () => {
    const sp = r.estados.find((e) => e.uf === 'SP')!;
    expect(sp).toMatchObject({ pedidos: 5, roubos: 2, frustrados: 3 });
    expect(sp.pct_roubo).toBeCloseTo(0.4, 5);
    expect(sp.pct_frustracao).toBeCloseTo(0.6, 5);
    const mg = r.estados.find((e) => e.uf === 'MG')!;
    expect(mg).toMatchObject({ pedidos: 2, roubos: 0, frustrados: 1 });
    expect(r.estados[0].uf).toBe('SP'); // mais frustração primeiro
  });

  it('só o período e sem os excluídos; sem estado conta à parte', () => {
    expect(r.total).toBe(8);
    expect(r.semRegiao).toBe(1);
    expect(r.estados.some((e) => e.uf === 'RJ')).toBe(false);
    expect(r.brasil).toMatchObject({ pedidos: 7, roubos: 2, frustrados: 4 });
  });

  it('por cidade, com o estado', () => {
    const campinas = r.cidades.find((c) => c.cidade === 'Campinas')!;
    expect(campinas).toMatchObject({ uf: 'SP', pedidos: 3, roubos: 2 });
    // Roubo perde produto + frete; devolução e cancelado, só o frete.
    const sp = r.estados.find((e) => e.uf === 'SP')!;
    expect(sp.perda).toBeGreaterThan(0);
  });
});
