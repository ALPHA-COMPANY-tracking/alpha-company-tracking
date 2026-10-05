// Conferência com a planilha de pagamentos: a planilha é a verdade.
import { describe, expect, it } from 'vitest';
import {
  ajustesAutomaticos,
  competencias,
  conferirMes,
  lerData,
  lerValor,
  normalizarLinhas,
  normalizarVendedor,
  type LinhaPlanilha,
  type PedidoBanco,
} from '../../api/planilha';

const lin = (pedido_id: string, valor: number, data: string, vendedor = 'PETER', aba = 'SETEMBRO'): LinhaPlanilha => ({
  aba,
  linha: null,
  pedido_id,
  valor,
  data_pagamento: data,
  vendedor,
  metodo: 'PIX',
});

const ped = (id: string, valor: number, data_aprovacao: string | null, extra: Partial<PedidoBanco> = {}): PedidoBanco => ({
  id,
  internal_id: 1,
  status: 'pagos',
  valor,
  valor_agendado: 735,
  data_aprovacao,
  vendedor: 'PETER',
  ...extra,
});

describe('leitura das linhas', () => {
  it('valor em número, "R$ 1.234,56" ou "735"', () => {
    expect(lerValor(735)).toBe(735);
    expect(lerValor('R$ 1.234,56')).toBe(1234.56);
    expect(lerValor('367')).toBe(367);
    expect(lerValor('')).toBeNull();
  });

  it('data dd/mm/aaaa, aaaa-mm-dd e a meia-noite de SP que o Google manda em UTC', () => {
    expect(lerData('01/09/2026')).toBe('2026-09-01');
    expect(lerData('2026-09-30')).toBe('2026-09-30');
    expect(lerData('2026-09-01T03:00:00.000Z')).toBe('2026-09-01');
    expect(lerData('ontem')).toBeNull();
  });

  it('vendedor pelo primeiro nome, Mateus = Matheus', () => {
    expect(normalizarVendedor(' Mateus ')).toBe('MATHEUS');
    expect(normalizarVendedor('Peter Silva')).toBe('PETER');
    expect(normalizarVendedor('')).toBeNull();
  });

  it('só entram linhas com código BLV-, valor e data — o resto (total, cabeçalho) fica fora', () => {
    const out = normalizarLinhas('SETEMBRO', [
      { linha: 2, pedido: 'blv-abc123', valor: '735', data: '01/09/2026', vendedor: 'PETER', metodo: 'PIX' },
      { linha: 3, pedido: 'TOTAL', valor: '79393', data: '' },
      { linha: 4, pedido: 'BLV-XYZ', valor: '', data: '02/09/2026' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pedido_id: 'BLV-ABC123', valor: 735, data_pagamento: '2026-09-01', linha: 2 });
  });
});

describe('mês de cada aba', () => {
  it('pagamento de 31/08 lançado na aba de setembro conta em setembro', () => {
    const c = competencias([lin('A', 735, '2026-08-31'), lin('B', 735, '2026-09-01'), lin('C', 735, '2026-09-02')]);
    expect(c.get('SETEMBRO')).toBe('2026-09');
  });
});

describe('correção automática', () => {
  it('valor diferente: vale o da planilha', () => {
    const a = ajustesAutomaticos([lin('A', 700, '2026-09-11')], [ped('A', 735, '2026-09-11')]);
    expect(a).toEqual([{ pedido_id: 'A', internal_id: 1, campo: 'valor', de: '735', para: '700' }]);
  });

  it('data diferente no mesmo mês: vale a da planilha; em outro mês, não mexe', () => {
    expect(ajustesAutomaticos([lin('A', 735, '2026-09-12')], [ped('A', 735, '2026-09-11')])).toMatchObject([
      { campo: 'data_aprovacao', de: '2026-09-11', para: '2026-09-12' },
    ]);
    expect(ajustesAutomaticos([lin('A', 735, '2026-08-31')], [ped('A', 735, '2026-09-01')])).toEqual([]);
  });

  it('não mexe: código repetido (pagamento em partes), vendedor diferente, não pago, removido', () => {
    expect(ajustesAutomaticos([lin('A', 367, '2026-09-30'), lin('A', 368, '2026-10-02')], [ped('A', 735, '2026-09-30')])).toEqual([]);
    expect(ajustesAutomaticos([lin('A', 700, '2026-09-11', 'MATHEUS')], [ped('A', 735, '2026-09-11')])).toEqual([]);
    expect(ajustesAutomaticos([lin('A', 700, '2026-09-11')], [ped('A', 735, null, { status: 'enviados' })])).toEqual([]);
    expect(ajustesAutomaticos([lin('A', 700, '2026-09-11')], [ped('A', 735, '2026-09-11', { removido_em: '2026-09-12' })])).toEqual([]);
  });

  it('valor acima de tudo que o pedido já teve é provável erro de digitação: não mexe', () => {
    expect(ajustesAutomaticos([lin('A', 7350, '2026-09-11')], [ped('A', 735, '2026-09-11')])).toEqual([]);
  });

  it('"Mateus" na planilha é o mesmo "MATHEUS" do BlueSales', () => {
    expect(ajustesAutomaticos([lin('A', 700, '2026-09-11', 'MATHEUS')], [ped('A', 735, '2026-09-11', { vendedor: 'Matheus' })])).toHaveLength(1);
  });
});

describe('conferência do mês', () => {
  it('totais por vendedor e cada diferença com o que fazer', () => {
    const planilha = [
      lin('A', 735, '2026-09-01'),
      lin('B', 700, '2026-09-02', 'MATHEUS'),
      lin('C', 535, '2026-09-03'),
      lin('D', 735, '2026-09-04'),
      lin('E', 200, '2026-09-05'),
      lin('E', 535, '2026-09-06'),
    ];
    const pedidos = [
      ped('A', 735, '2026-09-01'),
      ped('B', 735, '2026-09-02', { vendedor: 'MATHEUS' }),
      ped('C', 535, null, { status: 'enviados' }),
      ped('E', 735, '2026-09-05'),
      ped('F', 735, '2026-09-03'), // pago aqui, fora da planilha
      ped('G', 735, '2026-09-20'), // depois do último dia da planilha: ainda não lançado
    ];
    const c = conferirMes('2026-09', planilha, pedidos);
    expect(c.planilha.total).toBe(3440);
    expect(c.planilha.porVendedor.MATHEUS).toEqual({ total: 700, qtd: 1 });
    expect(c.ultimaData).toBe('2026-09-06');
    const tipos = c.diferencas.map((d) => `${d.tipo}:${d.pedido_id}`).sort();
    expect(tipos).toEqual(['a_mais:F', 'falta:D', 'nao_pago:C', 'repetido:E', 'valor:B']);
    expect(c.diferencas.find((d) => d.tipo === 'valor')?.corrigirPara).toEqual({ campo: 'valor', de: '735', valor: '700' });
  });

  it('"Mateus" e "MATHEUS" somam juntos no total por vendedor', () => {
    const c = conferirMes('2026-09', [lin('A', 700, '2026-09-01', 'Mateus')], [ped('A', 700, '2026-09-01', { vendedor: 'MATHEUS' })]);
    expect(c.planilha.porVendedor).toEqual({ MATHEUS: { total: 700, qtd: 1 } });
    expect(c.diferencas).toEqual([]);
  });

  it('vendedor errado: corrige com o nome como já está escrito aqui', () => {
    const c = conferirMes(
      '2026-09',
      [lin('A', 735, '2026-09-01', 'MATHEUS'), lin('B', 735, '2026-09-02', 'MATHEUS')],
      [ped('A', 735, '2026-09-01'), ped('B', 735, '2026-09-02', { vendedor: 'Matheus Henrique' })],
    );
    expect(c.diferencas).toHaveLength(1);
    expect(c.diferencas[0].corrigirPara).toEqual({ campo: 'vendedor', de: 'PETER', valor: 'Matheus Henrique' });
  });

  it('data em outro mês aparece marcada (o botão da tela corrige; o servidor sozinho, não)', () => {
    const c = conferirMes(
      '2026-09',
      [lin('A', 735, '2026-08-31'), lin('B', 735, '2026-09-02'), lin('C', 735, '2026-09-03')],
      [ped('A', 735, '2026-09-01'), ped('B', 735, '2026-09-02'), ped('C', 735, '2026-09-03')],
    );
    expect(c.planilha.qtd).toBe(3);
    const d = c.diferencas.find((x) => x.tipo === 'data');
    expect(d?.pedido_id).toBe('A');
    expect(d?.outroMes).toBe(true);
    expect(d?.corrigirPara).toEqual({ campo: 'data_aprovacao', de: '2026-09-01', valor: '2026-08-31' });
  });
});
