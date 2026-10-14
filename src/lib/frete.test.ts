// Frete com data de vigência: R$ 33,00 até 13/10/2026, R$ 31,00 desde
// 14/10/2026 — vale o dia em que o pacote SAIU (ou, sem ele, o do agendamento).
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { custosDePedidos, FRETE_ATUAL, freteDoPedido, perdaRealDePedido } from '@/lib/custosConfig';
import * as servidor from '../../api/lib-custos';
import * as app from '@/lib/custosConfig';

const ped = (data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: data,
  status: 'pagos',
  data,
  data_aprovacao: data,
  valor: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  ...extra,
});

describe('frete por data', () => {
  it('até 13/10 R$ 33; de 14/10 em diante R$ 31', () => {
    expect(freteDoPedido(ped('2026-10-13'))).toBe(33);
    expect(freteDoPedido(ped('2026-10-14'))).toBe(31);
    expect(freteDoPedido(ped('2026-09-01'))).toBe(33);
    expect(FRETE_ATUAL).toBe(31);
  });

  it('vale o dia em que o pacote saiu, no horário de São Paulo', () => {
    // Agendado dia 12, saiu dia 14: frete novo.
    expect(freteDoPedido(ped('2026-10-12', { enviado_em: '2026-10-14T15:00:00Z' }))).toBe(31);
    // 02h de 14/10 em UTC ainda é 13/10 em São Paulo: frete antigo.
    expect(freteDoPedido(ped('2026-10-12', { enviado_em: '2026-10-14T02:00:00Z' }))).toBe(33);
  });

  it('o custo do P&L soma o frete de cada pedido', () => {
    const r = custosDePedidos([ped('2026-10-13'), ped('2026-10-14')], { inicio: '2026-10-01', fim: '2026-10-31' });
    expect(r.frete).toBe(3_300 + 3_100);
  });

  it('a perda da frustração também usa o frete do pedido', () => {
    const devolvido = (data: string) => ped(data, { status: 'devolvido', data_aprovacao: null, enviado_em: `${data}T15:00:00Z` });
    expect(perdaRealDePedido(devolvido('2026-10-10'))).toBe(33);
    expect(perdaRealDePedido(devolvido('2026-10-20'))).toBe(31);
    expect(perdaRealDePedido(ped('2026-10-20', { status: 'roubo', data_aprovacao: null }))).toBe(83 + 31);
  });

  it('o resumo do celular (servidor) usa a mesma tabela', () => {
    expect(servidor.FRETES).toEqual(app.FRETES);
    for (const p of [ped('2026-10-13'), ped('2026-10-14'), ped('2026-10-12', { enviado_em: '2026-10-14T15:00:00Z' })]) {
      expect(servidor.freteDoPedido(p)).toBe(app.freteDoPedido(p));
    }
  });
});
