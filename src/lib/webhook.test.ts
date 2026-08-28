import { describe, expect, it } from 'vitest';
import { mapearPedido, semDadosPessoais } from '../../api/bluesales-webhook';

const USER = 'fabbf23a-e34b-4445-b563-222c18642189';

// Payload REAL do BlueSales (ORDER_CREATE de 28/08/2026) — chaves em inglês.
const ORDER_CREATE = {
  event: 'ORDER_CREATE',
  order: {
    id: 'BLV-VE7RUD88Y3',
    status: 'cadastrados',
    created_at: 'Fri Aug 28 2026 12:39:44 GMT+0000 (Coordinated Universal Time)',
    internal_id: 348,
  },
  seller: { name: 'PETER' },
  payment: { label: 'Boleto', amount: 735, method: 'boleto', discount: 0, gross_amount: 735 },
  product: {
    name: 'DERMAX PREMIUM',
    plan: 'DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME',
    price: 735,
    plan_code: 'PLN-8CFTCD2T',
  },
  customer: { name: 'YOLANDA DE GOIS', email: 'x@y.com', document: '000.000.000-00' },
  shipping: { tracking_code: null },
};

describe('mapearPedido (payload do BlueSales)', () => {
  it('lê o payload real em inglês (era o bug: valor vinha 0)', () => {
    const p = mapearPedido(ORDER_CREATE, USER)!;
    expect(p.id).toBe('BLV-VE7RUD88Y3');
    expect(p.valor).toBe(735);
    expect(p.valor_bruto).toBe(735);
    expect(p.vendedor).toBe('PETER');
    expect(p.produto_plano).toBe('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME');
    expect(p.codigo_plano).toBe('PLN-8CFTCD2T');
    expect(p.metodo_pagamento).toBe('boleto');
    expect(p.data).toBe('2026-08-28');
    expect(p.status).toBe('cadastrados');
  });

  it('separa líquido (amount) de bruto (gross_amount) quando há desconto', () => {
    const p = mapearPedido(
      { ...ORDER_CREATE, payment: { amount: 698.25, gross_amount: 735, discount: 36.75, method: 'pix' } },
      USER,
    )!;
    expect(p.valor).toBe(698.25);
    expect(p.valor_bruto).toBe(735);
  });

  it('ainda aceita as chaves em português', () => {
    const p = mapearPedido(
      {
        pedido: { id: 'BLV-PT', status: 'pagos' },
        pagamento: { valor: 435, método: 'pix' },
        produto: { plano: 'DERMAX PREMIUM - 3 POTE + 1 GOTA', preço: 435 },
        vendedor: { nome: 'PETER' },
      },
      USER,
    )!;
    expect(p.valor).toBe(435);
    expect(p.vendedor).toBe('PETER');
    expect(p.metodo_pagamento).toBe('pix');
  });

  it('aceita valor como texto (R$ 1.234,56)', () => {
    const p = mapearPedido({ order: { id: 'X' }, payment: { amount: 'R$ 1.234,56' } }, USER)!;
    expect(p.valor).toBe(1234.56);
  });

  it('não sobrescreve valor/produto quando o evento vem sem eles', () => {
    const p = mapearPedido({ event: 'SHIPPING_UPDATE', order: { id: 'X', status: 'enviados' } }, USER)!;
    expect(p.status).toBe('enviados');
    expect('valor' in p).toBe(false);
    expect('produto_plano' in p).toBe(false);
    expect('vendedor' in p).toBe(false);
  });

  it('ignora evento sem id do pedido', () => {
    expect(mapearPedido({ event: 'PING' }, USER)).toBeNull();
  });
});

describe('semDadosPessoais (LGPD)', () => {
  it('remove os dados do cliente do log', () => {
    const log = semDadosPessoais(ORDER_CREATE as Record<string, unknown>);
    expect('customer' in log).toBe(false);
    expect(JSON.stringify(log)).not.toContain('YOLANDA');
    expect(JSON.stringify(log)).not.toContain('000.000.000-00');
    expect((log.order as { id: string }).id).toBe('BLV-VE7RUD88Y3'); // resto preservado
  });
});
