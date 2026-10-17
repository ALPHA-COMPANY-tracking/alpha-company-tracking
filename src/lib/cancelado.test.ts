// Cancelado e o saldo agendado.
// Desde 17/10/2026 os números são IGUAIS aos do BlueSales: o cancelado CONTA
// no agendado (CANCELADO_NO_AGENDADO = true). De 07 a 17/10 ele ficava de fora
// — a chave volta a esse modo. O custo (frete de quem saiu) vai para a frustração.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agendadoPorDia, agregarPedidos, CANCELADO_NO_AGENDADO, ehCancelado, foraDoAgendado, possiveisDuplicados } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { situacaoDosAgendados } from '@/lib/indicadores';
import { resumoDoVendedor } from '@/lib/vendedor';
import { montarResumo } from '../../api/lib-resumo';
import * as servidor from '../../api/lib-custos';

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

const valido = ped('a', 'enviados', 735);
const cancelado = ped('b', 'cancelados', 535);
const canceladoQueSaiu = ped('c', 'cancelados', 535, { rastreamento: 'AA123BR', enviado_em: '2026-10-08T12:00:00Z' });
// O caso de 12/10: cancelado com etiqueta, mas o pacote nunca saiu.
const canceladoComEtiqueta = ped('e', 'cancelados', 735, { rastreamento: 'AE017084557BR' });

describe('cancelado conta no agendado, como no BlueSales', () => {
  it('reconhece cancelado/cancelados, com ou sem maiúscula', () => {
    expect(['cancelados', 'Cancelado', 'CANCELADOS'].every((s) => ehCancelado({ status: s }))).toBe(true);
    expect(ehCancelado({ status: 'enviados' })).toBe(false);
  });

  it('a chave está em "conta" e o servidor usa a mesma', () => {
    expect(CANCELADO_NO_AGENDADO).toBe(true);
    expect(servidor.CANCELADO_NO_AGENDADO).toBe(CANCELADO_NO_AGENDADO);
    expect(foraDoAgendado(cancelado)).toBe(false);
    expect(foraDoAgendado(cancelado, false)).toBe(true); // o modo de 07 a 17/10
  });

  it('Faturamento Agendado, agendado por dia e vendedor: somam o cancelado', () => {
    const agg = agregarPedidos([valido, cancelado], P);
    expect(agg.valor_agendado).toBe(735 + 535);
    expect(agg.qtd_agendados).toBe(2);
    expect(agendadoPorDia([valido, cancelado], P)).toEqual([{ data: '2026-10-07', qtd: 2, valor: 1270 }]);
    const r = resumoDoVendedor([valido, cancelado], 'Matheus', P, '2026-10-07');
    expect(r.agendado).toEqual({ qtd: 2, valor: 127_000 });
  });

  it('frustração: só custa o frete se o pacote saiu (etiqueta sozinha não conta)', () => {
    expect(agregarPedidos([valido, canceladoQueSaiu], P)).toMatchObject({ qtd_frustrados: 1, perda_real_frustrados: 33 });
    expect(agregarPedidos([valido, canceladoComEtiqueta], P)).toMatchObject({ qtd_frustrados: 0, perda_real_frustrados: 0 });
    expect(agregarPedidos([valido, cancelado], P).qtd_frustrados).toBe(0);
  });

  it('a margem do agendado tira o cancelado uma vez só', () => {
    const com = calcularPnl([], [], P, {}, [valido, canceladoQueSaiu]);
    const sem = calcularPnl([], [], P, {}, [valido]);
    expect(com.valor_agendado).toBe(sem.valor_agendado + 53_500);
    expect(com.lucro_agendado).toBe(sem.lucro_agendado);
  });

  it('a situação dos agendados soma o agendado', () => {
    const s = situacaoDosAgendados([valido, canceladoQueSaiu], P);
    expect(Object.values(s).reduce((t, f) => t + f.valor, 0)).toBe(127_000);
    expect(s.frustracao.qtd).toBe(1);
  });

  it('pedido refeito com a mesma cliente aparece como possível duplicado', () => {
    const refeito = ped('d', 'enviados', 735, { cliente: 'Cliente b' });
    expect(possiveisDuplicados([cancelado, refeito], P)).toHaveLength(1);
  });

  it('resumo do dia no celular: o mesmo agendado', () => {
    const linha = (p: Pedido) => ({ ...p, data_aprovacao: null, valor_agendado: p.valor_agendado ?? null, produto_plano: null, vendedor: p.vendedor ?? null });
    const r = montarResumo('2026-10-07', [linha(valido), linha(cancelado)], 0, null);
    expect(r.valor_agendado).toBe(1270);
    expect(r.qtd_agendados).toBe(2);
  });
});
