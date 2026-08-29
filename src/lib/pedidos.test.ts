import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agregarPedidos, statusBucket } from '@/lib/pedidos';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

function p(id: string, status: string, valor: number, vendedor: string, data = '2026-08-15'): Pedido {
  return { id, status, valor, vendedor, data, metodo_pagamento: 'pix' };
}

describe('statusBucket', () => {
  it('classifica pago/aprovado, frustrado e pipeline', () => {
    expect(statusBucket('pagos')).toBe('aprovado');
    expect(statusBucket('Pagos')).toBe('aprovado'); // case/acentos normalizados
    expect(statusBucket('frustrados')).toBe('frustrado');
    expect(statusBucket('Frustrados')).toBe('frustrado');
    expect(statusBucket('devolvido')).toBe('pipeline'); // Devolvido != frustrado (aba separada)
    expect(statusBucket('cadastrados')).toBe('pipeline');
    expect(statusBucket('enviados')).toBe('pipeline');
    expect(statusBucket('Cobrados')).toBe('pipeline');
    expect(statusBucket(null)).toBe('pipeline');
  });
});

describe('agregarPedidos', () => {
  it('soma agendado (todos), aprovado (pagos) e frustrado', () => {
    const pedidos = [
      p('1', 'pagos', 735, 'PETER'),
      p('2', 'pagos', 735, 'PETER'),
      p('3', 'cadastrados', 735, 'alphacomp'),
      p('4', 'frustrados', 735, 'alphacomp'),
      p('5', 'enviados', 735, 'PETER'),
    ];
    const r = agregarPedidos(pedidos, periodo);
    expect(r.qtd_agendados).toBe(5);
    expect(r.valor_agendado).toBe(3675);
    expect(r.qtd_pagamentos).toBe(2);
    expect(r.receita_aprovada).toBe(1470);
    expect(r.qtd_frustrados).toBe(1);
    expect(r.valor_frustrado).toBe(735);
  });

  it('agrupa por atendente (pipeline + receita)', () => {
    const pedidos = [
      p('1', 'pagos', 700, 'PETER'),
      p('2', 'cadastrados', 300, 'PETER'),
      p('3', 'pagos', 500, 'ANA'),
    ];
    const r = agregarPedidos(pedidos, periodo);
    const peter = r.porAtendente.find((a) => a.nome === 'PETER')!;
    expect(peter.pedidos).toBe(2);
    expect(peter.valor_agendado).toBe(1000);
    expect(peter.aprovados).toBe(1);
    expect(peter.receita).toBe(700);
  });

  it('ignora pedidos fora do período', () => {
    const pedidos = [p('1', 'pagos', 735, 'PETER', '2026-07-30')];
    expect(agregarPedidos(pedidos, periodo).qtd_agendados).toBe(0);
  });

  it('agendado usa o valor COBRADO, não o cheio (pedido com desconto)', () => {
    // Caso real de 29/08/2026: BLV-GDU2EG43PM tem gross_amount 735 e
    // amount 700 (desconto de R$ 35). O BlueSales mostra R$ 2.170,00.
    const pedidos: Pedido[] = [
      { ...p('1', 'cadastrados', 700, 'PETER'), valor_bruto: 735 },
      { ...p('2', 'aguard_coleta', 735, 'PETER'), valor_bruto: 735 },
      { ...p('3', 'aguard_coleta', 735, 'PETER'), valor_bruto: 735 },
    ];
    const r = agregarPedidos(pedidos, periodo);
    expect(r.qtd_agendados).toBe(3);
    expect(r.valor_agendado).toBe(2170); // não 2205
    expect(r.porAtendente[0].valor_agendado).toBe(2170);
  });

  it('conta aprovado pela data de pagamento (data_aprovacao), não pela criação', () => {
    // Criado em julho, PAGO em agosto → agendado cai em julho, receita em agosto.
    const pedido: Pedido = { ...p('1', 'pagos', 900, 'PETER', '2026-07-28'), data_aprovacao: '2026-08-03' };
    const r = agregarPedidos([pedido], periodo);
    expect(r.qtd_agendados).toBe(0); // criação foi em julho
    expect(r.qtd_pagamentos).toBe(1); // pagamento foi em agosto
    expect(r.receita_aprovada).toBe(900);
  });

  it('sem data_aprovacao, usa a data de criação (comportamento histórico)', () => {
    const pedido = p('1', 'pagos', 900, 'PETER', '2026-08-10'); // sem data_aprovacao
    const r = agregarPedidos([pedido], periodo);
    expect(r.qtd_pagamentos).toBe(1);
    expect(r.qtd_agendados).toBe(1);
  });
});
