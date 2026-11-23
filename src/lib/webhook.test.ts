import { describe, expect, it } from 'vitest';
import {
  agendadoParaGravar,
  brutoDoAviso,
  dataDaVenda,
  mantemAgendado,
  mapearPedido,
  mudaDataDaVenda,
  semDadosPessoais,
  voltariaDoPago,
} from '../../api/bluesales-webhook';

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

describe('dia da venda: o da confirmação, quando o BlueSales confirma depois (#4605, 14/11/2026)', () => {
  // Cadastrado 12/11 14:56 (SP), confirmado — ORDER_CREATE — 14/11 12:08.
  const confirmadoDepois = {
    event: 'ORDER_CREATE',
    occurred_at: '2026-11-14T12:08:44-03:00',
    order: { id: 'BLV-N35NYC9S2S', status: 'cadastrados', created_at: 'Thu Nov 12 2026 17:56:10 GMT+0000 (Coordinated Universal Time)', internal_id: 4605 },
    payment: { amount: 735 },
  };

  it('o pedido criado que chega dias depois conta no dia da confirmação', () => {
    expect(dataDaVenda(confirmadoDepois)).toBe('2026-11-14');
    expect(mapearPedido(confirmadoDepois, USER)!.data).toBe('2026-11-14');
  });

  it('o pedido criado normal (segundos depois) fica no dia do cadastro, mesmo virando a meia-noite', () => {
    expect(dataDaVenda({ ...ORDER_CREATE, occurred_at: '2026-08-28T09:39:46-03:00' })).toBe('2026-08-28');
    const meiaNoite = {
      event: 'ORDER_CREATE',
      occurred_at: '2026-11-15T00:00:02-03:00',
      order: { id: 'X', created_at: 'Sat Nov 14 2026 23:59:58 GMT-0300' },
    };
    expect(dataDaVenda(meiaNoite)).toBe('2026-11-14');
  });

  it('o upsert SEMPRE leva o dia (NOT NULL): sem ele, todo aviso de pedido existente falhava (14–15/11/2026)', async () => {
    const fonte = await import('node:fs').then((fs) => fs.readFileSync('api/bluesales-webhook.ts', 'utf8'));
    expect(fonte).not.toMatch(/delete pedido\.data\b/);
    expect(fonte).toMatch(/pedido\.data = atual\.data/);
  });

  it('os outros avisos não mudam o dia de um pedido que já tem dia', () => {
    const enviado = { ...confirmadoDepois, event: 'ORDER_SHIPPED', occurred_at: '2026-11-14T12:09:03-03:00' };
    expect(dataDaVenda(enviado)).toBe('2026-11-12'); // o do cadastro…
    expect(mudaDataDaVenda(enviado, '2026-11-14')).toBe(false); // …mas não sobrescreve o da confirmação
    expect(mudaDataDaVenda(enviado, null)).toBe(true); // pedido novo: grava
    expect(mudaDataDaVenda(confirmadoDepois, '2026-11-12')).toBe(true); // o pedido criado manda
  });
});

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

  it('o agendado acompanha o valor atual do pedido (plano trocado, desconto) — como o BlueSales', () => {
    expect(mapearPedido(ORDER_CREATE, USER)!.valor_agendado).toBe(735);
    // Mesmo pedido, depois: trocou para 3 meses (R$ 435).
    const trocado = mapearPedido(
      { ...ORDER_CREATE, event: 'SHIPPING_UPDATE', payment: { amount: 435, gross_amount: 435, discount: 0, method: 'boleto' } },
      USER,
    )!;
    expect(trocado.valor_agendado).toBe(435);
    // Aviso sem valor não mexe no agendado.
    expect('valor_agendado' in mapearPedido({ event: 'SHIPPING_UPDATE', order: { id: 'BLV-X', status: 'enviados' } }, USER)!).toBe(false);
  });

  it('desconto na hora do pagamento baixa o recebido, não a venda (#3992, 15/11/2026)', () => {
    const pago = mapearPedido(
      { ...ORDER_CREATE, event: 'ORDER_PAID', payment: { amount: 400, gross_amount: 435, discount: 35, method: 'pix' } },
      USER,
    )!;
    expect(pago.valor).toBe(400);
    expect('valor_agendado' in pago).toBe(false);
  });

  it('guarda o tipo de venda (antecipado pago não entra no agendado)', () => {
    expect(mapearPedido({ ...ORDER_CREATE, order: { ...ORDER_CREATE.order, type_sales: 'antecipado' } }, USER)!.tipo_venda).toBe('antecipado');
    expect('tipo_venda' in mapearPedido(ORDER_CREATE, USER)!).toBe(false);
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

  it('do cliente ficam só os NOMES dos campos, e se veio estado', () => {
    const log = semDadosPessoais({
      ...ORDER_CREATE,
      customer: { name: 'YOLANDA DE GOIS', address: { street: 'Rua X, 10', city: 'Ipatinga', state: 'MG' } },
    } as Record<string, unknown>);
    expect(log._removidos).toEqual({ customer: ['name', 'address.street', 'address.city', 'address.state'] });
    expect(log._regiao).toBe('MG');
    expect(JSON.stringify(log)).not.toMatch(/YOLANDA|Rua X|Ipatinga/);
    expect(semDadosPessoais(ORDER_CREATE as Record<string, unknown>)._regiao).toBe('ausente');
  });

  it('o rastreio do envio é preservado — é o que serve para diagnóstico', () => {
    const log = semDadosPessoais({
      ...ORDER_CREATE,
      shipping: { tracking_code: 'AP435660319BR', carrier: 'Correios' },
    } as Record<string, unknown>);
    expect(log.shipping).toEqual({ tracking_code: 'AP435660319BR', carrier: 'Correios' });
  });

  it('se o BlueSales passar a mandar endereço, ele não entra no log', () => {
    // Allowlist: campo novo é descartado por padrão, e não guardado por
    // padrão. Fica só o NOME da chave, para percebermos a mudança.
    const log = semDadosPessoais({
      ...ORDER_CREATE,
      shipping: {
        tracking_code: 'AP435660319BR',
        address: 'Rua das Flores, 123',
        zip_code: '29100-000',
        phone: '(28) 99947-5005',
      },
    } as Record<string, unknown>);
    const envio = log.shipping as Record<string, unknown>;
    expect(envio.tracking_code).toBe('AP435660319BR');
    expect(JSON.stringify(log)).not.toContain('Rua das Flores');
    expect(JSON.stringify(log)).not.toContain('29100-000');
    expect(JSON.stringify(log)).not.toContain('99947-5005');
    expect(envio._descartado).toEqual(['address', 'zip_code', 'phone']);
  });

  it('bloco pessoal novo (buyer, address...) também sai inteiro', () => {
    const log = semDadosPessoais({
      ...ORDER_CREATE,
      buyer: { name: 'FULANA', cpf: '111.111.111-11' },
      address: { street: 'Rua X' },
    } as Record<string, unknown>);
    expect('buyer' in log).toBe(false);
    expect('address' in log).toBe(false);
    expect(JSON.stringify(log)).not.toContain('FULANA');
  });
});

describe('nome do cliente', () => {
  it('sai do payload real para a coluna cliente', () => {
    // Confirmado no payload real: o nome vem em customer.name.
    const p = mapearPedido(ORDER_CREATE, USER)!;
    expect(p.cliente).toBe('YOLANDA DE GOIS');
  });

  it('guarda o nome e nada mais do cliente', () => {
    const p = mapearPedido(ORDER_CREATE, USER)!;
    const guardado = JSON.stringify(p);
    expect(guardado).not.toContain('x@y.com');
    expect(guardado).not.toContain('000.000.000-00');
  });
});

describe('pagamento (caso do #2913, 20/10/2026)', () => {
  const pago = {
    event: 'ORDER_PAID',
    order: { id: 'BLV-3K1DB5GBMY', internal_id: 2913, status: 'saiu_para_entrega', created_at: '2026-10-13T19:10:52Z' },
    payment: { amount: 700, method: 'pix' },
  };

  it('ORDER_PAID é pagamento, mesmo vindo com a etapa de entrega', () => {
    expect(mapearPedido(pago, USER)!.status).toBe('pagos');
    expect(mapearPedido({ ...pago, event: 'SHIPPING_UPDATE' }, USER)!.status).toBe('saiu_para_entrega');
  });

  it('pago não volta atrás com aviso de entrega atrasado', () => {
    expect(voltariaDoPago('pagos', 'entregues')).toBe(true);
    expect(voltariaDoPago('pagos', 'saiu_para_entrega')).toBe(true);
    expect(voltariaDoPago('pagos', 'cobrados')).toBe(true);
  });

  it('mas frustração depois do pago passa, e quem não está pago segue normal', () => {
    expect(voltariaDoPago('pagos', 'devolvido')).toBe(false);
    expect(voltariaDoPago('pagos', 'aguardando_devolucao')).toBe(false);
    expect(voltariaDoPago('pagos', 'cancelados')).toBe(false);
    expect(voltariaDoPago('pagos', 'pagos')).toBe(false);
    expect(voltariaDoPago('entregues', 'enviados')).toBe(false);
    expect(voltariaDoPago(null, 'entregues')).toBe(false);
  });
});

describe('valor agendado depois que o pedido saiu (#4180 e #3858, 23/11/2026)', () => {
  it('pedido novo ou sem agendado gravado: o aviso grava o valor', () => {
    expect(mantemAgendado(null)).toBe(false);
    expect(mantemAgendado({ status: 'cobrados', valor_agendado: null })).toBe(false);
  });

  it('antes de sair, troca de plano e desconto do vendedor mudam a venda', () => {
    for (const status of ['cadastrados', 'confirmados', 'aguard_coleta', 'Aguard. Coleta', 'aguard_pagamento', 'futuros', 'em_analise']) {
      expect(mantemAgendado({ status, valor_agendado: 735 })).toBe(false);
    }
  });

  it('depois de sair, entregue, em cobrança ou pago, desconto não muda a venda', () => {
    for (const status of ['enviados', 'saiu_para_entrega', 'retirar_correios', 'entregues', 'cobrados', 'negociacao', 'atencao', 'pagos', 'devolvido', 'cancelados']) {
      expect(mantemAgendado({ status, valor_agendado: 735 })).toBe(true);
    }
  });

  it('a marca de envio/entrega vale mesmo se a etapa gravada voltou atrás', () => {
    expect(mantemAgendado({ status: 'aguard_coleta', valor_agendado: 735, enviado_em: '2026-11-08T10:00:00Z' })).toBe(true);
    expect(mantemAgendado({ status: 'confirmados', valor_agendado: 735, entregue_em: '2026-11-16T18:30:00Z' })).toBe(true);
  });

  it('etapa vazia não trava (não dá para saber se saiu)', () => {
    expect(mantemAgendado({ status: null, valor_agendado: 735 })).toBe(false);
  });
});

describe('que agendado gravar (agendadoParaGravar)', () => {
  const saiu = { status: 'cobrados', valor_agendado: 735, entregue_em: '2026-11-16T18:30:00Z' };

  it('#4180: desconto de R$ 35 na cobrança não muda a venda (o BlueSales segue com 735)', () => {
    expect(agendadoParaGravar('CHARGE_UPDATE', 700, 735, saiu)).toBeUndefined();
    expect(agendadoParaGravar('SHIPPING_UPDATE', 700, 735, saiu)).toBeUndefined();
  });

  it('#3858: pago com R$ 135 de desconto, avisos depois do pagamento não baixam a venda', () => {
    const pago = { status: 'pagos', valor_agendado: 735 };
    expect(agendadoParaGravar('ORDER_PAID', 600, 735, pago)).toBeUndefined();
    expect(agendadoParaGravar('ORDER_DELIVERED_CARD', 600, 735, pago)).toBeUndefined();
    // Aviso sem o preço cheio também não mexe (o amount pode ter desconto).
    expect(agendadoParaGravar('SHIPPING_UPDATE', 600, null, pago)).toBeUndefined();
  });

  it('#3992: desconto na hora de pagar, antes de sair, também não muda a venda', () => {
    expect(agendadoParaGravar('ORDER_PAID', 400, 435, { status: 'confirmados', valor_agendado: 435 })).toBeUndefined();
  });

  it('antes de sair, o valor do aviso vale (troca de plano 735 → 435 de 02/11, desconto do vendedor)', () => {
    const antes = { status: 'aguard_coleta', valor_agendado: 735 };
    expect(agendadoParaGravar('SHIPPING_UPDATE', 435, 435, antes)).toBe(435);
    expect(agendadoParaGravar('SHIPPING_UPDATE', 700, 735, antes)).toBe(700);
  });

  it('troca para plano mais barato que só chega no pagamento ainda baixa a venda', () => {
    // Confirmado a 735, vendedor troca para 3 meses e a cliente paga antes de sair.
    expect(agendadoParaGravar('ORDER_PAID', 435, 435, { status: 'confirmados', valor_agendado: 735 })).toBe(435);
    // Depois de um aviso de envio sem valor (pedido já marcado como saiu).
    expect(agendadoParaGravar('SHIPPING_UPDATE', 435, 435, { status: 'enviados', valor_agendado: 735, enviado_em: '2026-11-08T10:00:00Z' })).toBe(435);
  });

  it('pedido novo: grava o valor do aviso, menos no pagamento', () => {
    expect(agendadoParaGravar('ORDER_CREATE', 735, 735, null)).toBe(735);
    expect(agendadoParaGravar('ORDER_PAID', 735, 735, null)).toBeUndefined();
    expect(agendadoParaGravar('SHIPPING_UPDATE', 0, null, null)).toBeUndefined();
    expect(agendadoParaGravar('SHIPPING_UPDATE', 535, 535, { status: 'cobrados', valor_agendado: null })).toBe(535);
  });

  it('o preço cheio vem só do gross_amount, nunca do amount', () => {
    expect(brutoDoAviso({ payment: { amount: 700, gross_amount: 735, discount: 35 } })).toBe(735);
    expect(brutoDoAviso({ payment: { amount: 700 } })).toBeNull();
    expect(brutoDoAviso({ event: 'SHIPPING_UPDATE' })).toBeNull();
  });
});
