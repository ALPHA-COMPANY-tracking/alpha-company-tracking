// A frustração conta no mês da BAIXA (quando virou roubo, devolvido…), não
// no mês em que o pedido foi feito. Decisão do Jonas em 22/10/2026: o roubo
// de um pedido de agosto marcado em outubro é perda de outubro.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agregarPedidos, dataFrustracao } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';

const AGO: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };
const OUT: Periodo = { inicio: '2026-10-01', fim: '2026-10-31' };

const ped = (id: string, status: string, data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  status,
  data,
  valor: 735,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  enviado_em: `${data}T15:00:00Z`,
  ...extra,
});

// Feito em agosto, roubado (baixa) em outubro.
const rouboAntigo = ped('a', 'roubo', '2026-08-20', { frustrado_em: '2026-10-05T14:00:00Z' });

describe('frustração no mês da baixa', () => {
  it('o dia da baixa é o de São Paulo; sem a marca, o dia do pedido', () => {
    expect(dataFrustracao(rouboAntigo)).toBe('2026-10-05');
    expect(dataFrustracao({ data: '2026-09-30', frustrado_em: '2026-10-01T02:00:00Z' })).toBe('2026-09-30'); // 23h em SP
    expect(dataFrustracao({ data: '2026-08-20', frustrado_em: null })).toBe('2026-08-20');
  });

  it('roubo de pedido de agosto dado em outubro conta em OUTUBRO', () => {
    expect(agregarPedidos([rouboAntigo], OUT)).toMatchObject({ qtd_frustrados: 1, valor_frustrado: 735 });
    expect(agregarPedidos([rouboAntigo], AGO)).toMatchObject({ qtd_frustrados: 0, valor_frustrado: 0 });
  });

  it('o lucro de outubro desconta a perda real do roubo (produto + frete)', () => {
    const vendaDeOutubro = ped('b', 'pagos', '2026-10-03', { data_aprovacao: '2026-10-08' });
    const com = calcularPnl([], [], OUT, {}, [vendaDeOutubro, rouboAntigo]);
    const sem = calcularPnl([], [], OUT, {}, [vendaDeOutubro]);
    expect(com.perda_real_frustrados).toBe((83 + 33) * 100); // frete de agosto (saiu em agosto)
    expect(sem.lucro_real - com.lucro_real).toBe((83 + 33) * 100);
  });

  it('a margem do agendado continua sendo a da safra (pedidos feitos no período)', () => {
    const vendaDeOutubro = ped('b', 'enviados', '2026-10-03');
    const com = calcularPnl([], [], OUT, {}, [vendaDeOutubro, rouboAntigo]);
    const sem = calcularPnl([], [], OUT, {}, [vendaDeOutubro]);
    expect(com.lucro_agendado).toBe(sem.lucro_agendado); // roubo de agosto não mexe na safra de outubro
    // Pedido de outubro que já frustrou sai do agendado de pé de outubro, mesmo com a baixa depois.
    const frustraDepois = ped('c', 'devolvido', '2026-10-10', { frustrado_em: '2026-11-02T12:00:00Z' });
    const safra = calcularPnl([], [], OUT, {}, [vendaDeOutubro, frustraDepois]);
    expect(safra.lucro_agendado).toBe(sem.lucro_agendado);
    expect(safra.qtd_frustrados).toBe(0); // a perda é de novembro
  });
});
