// Pedido cancelado não é mais venda: sai do saldo agendado em todo lugar;
// o custo (frete de quem foi postado) continua na frustração.
// Decisão do Jonas em 07/10/2026.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agendadoPorDia, agregarPedidos, ehCancelado, possiveisDuplicados } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { situacaoDosAgendados } from '@/lib/indicadores';
import { resumoDoVendedor } from '@/lib/vendedor';
import { montarResumo } from '../../api/lib-resumo';

const P: Periodo = { inicio: '2026-10-01', fim: '2026-10-31' };
const ped = (id: string, status: string, valor: number, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  status,
  data: '2026-10-07',
  valor,
  valor_agendado: valor,
  produto_plano: 'DERMAX PREMIUM - 4 POTE',
  vendedor: 'Matheus',
  cliente: `Cliente ${id}`,
  ...extra,
});

// O caso da tela: 07/10, um de R$ 735 de pé e a Magaly (R$ 535) cancelada.
const valido = ped('a', 'enviados', 735);
const cancelado = ped('b', 'cancelados', 535);
const canceladoPostado = ped('c', 'cancelados', 535, { rastreamento: 'AA123BR' });

describe('cancelado sai do saldo agendado', () => {
  it('reconhece cancelado/cancelados, com ou sem acento e maiúscula', () => {
    expect(['cancelados', 'Cancelado', 'CANCELADOS'].every((s) => ehCancelado({ status: s }))).toBe(true);
    expect(ehCancelado({ status: 'enviados' })).toBe(false);
  });

  it('Faturamento Agendado e vendas do período: só o que está de pé', () => {
    const agg = agregarPedidos([valido, cancelado], P);
    expect(agg.valor_agendado).toBe(735);
    expect(agg.qtd_agendados).toBe(1);
    expect(agg.porAtendente.find((a) => a.nome === 'Matheus')!.valor_agendado).toBe(735);
    expect(agendadoPorDia([valido, cancelado], P)).toEqual([{ data: '2026-10-07', qtd: 1, valor: 735 }]);
  });

  it('cancelado depois de postado: fora do agendado, mas o frete continua na frustração', () => {
    const agg = agregarPedidos([valido, canceladoPostado], P);
    expect(agg.valor_agendado).toBe(735);
    expect(agg.qtd_frustrados).toBe(1);
    expect(agg.perda_real_frustrados).toBe(33); // só o frete
    // Sem postar, nem custo: nada de frustração.
    expect(agregarPedidos([valido, cancelado], P).qtd_frustrados).toBe(0);
  });

  it('a margem do agendado não tira o cancelado duas vezes', () => {
    const com = calcularPnl([], [], P, {}, [valido, canceladoPostado]);
    const sem = calcularPnl([], [], P, {}, [valido]);
    expect(com.valor_agendado).toBe(sem.valor_agendado);
    expect(com.lucro_agendado).toBe(sem.lucro_agendado);
  });

  it('a situação dos agendados soma o agendado (sem o cancelado)', () => {
    const s = situacaoDosAgendados([valido, canceladoPostado], P);
    const soma = Object.values(s).reduce((t, f) => t + f.valor, 0);
    expect(soma).toBe(73_500);
    expect(s.frustracao.qtd).toBe(0);
  });

  it('cancelado não é duplicado de ninguém', () => {
    const refeito = ped('d', 'enviados', 735, { cliente: 'Cliente b' });
    expect(possiveisDuplicados([cancelado, refeito], P)).toEqual([]);
  });

  it('painel do vendedor: aparece na lista, não soma no agendado', () => {
    const r = resumoDoVendedor([valido, cancelado], 'Matheus', P, '2026-10-07');
    expect(r.agendado).toEqual({ qtd: 1, valor: 73_500 });
    expect(r.agendado_hoje).toEqual({ qtd: 1, valor: 73_500 });
    expect(r.pedidos).toHaveLength(2);
  });

  it('resumo do dia no celular: o mesmo agendado', () => {
    const linha = (p: Pedido) => ({ ...p, data_aprovacao: null, valor_agendado: p.valor_agendado ?? null, produto_plano: null, vendedor: p.vendedor ?? null });
    const r = montarResumo('2026-10-07', [linha(valido), linha(cancelado)], 0, null);
    expect(r.valor_agendado).toBe(735);
    expect(r.qtd_agendados).toBe(1);
  });
});
