// Fila de Cobrança: quem entra, desde quando e em que faixa.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { dataSP, faixaDe, filaDeCobranca } from '@/lib/cobranca';

const HOJE = '2026-10-20';
let n = 0;
const ped = (status: string, data: string, extra: Partial<Pedido> = {}): Pedido => ({
  id: `P${++n}`,
  internal_id: n,
  status,
  data,
  valor: 735,
  valor_agendado: 735,
  vendedor: 'PETER',
  ...extra,
});

describe('Fila de Cobrança', () => {
  it('só entregues/cobrados sem pagar; negociação à parte; pago, rota e excluído fora', () => {
    const fila = filaDeCobranca(
      [
        ped('entregue', '2026-10-01', { entregue_em: '2026-10-15T14:00:00Z' }),
        ped('cobrados', '2026-09-20', { entregue_em: '2026-09-28T10:00:00Z' }),
        ped('negociacao', '2026-09-10'),
        ped('inadimplencias', '2026-09-05'),
        ped('pagos', '2026-10-01', { data_aprovacao: '2026-10-10' }),
        ped('enviados', '2026-10-18'),
        ped('entregue', '2026-10-02', { removido_em: '2026-10-03T00:00:00Z' }),
      ],
      HOJE,
    );
    expect(fila.itens.map((i) => i.pedido.status)).toEqual(['cobrados', 'entregue']); // mais antigo primeiro
    expect(fila.itens.map((i) => i.dias)).toEqual([22, 5]);
    expect(fila.total).toEqual({ qtd: 2, valor: 1470 });
    expect(fila.negociacao).toHaveLength(2);
    expect(fila.totalNegociacao.valor).toBe(1470);
  });

  it('conta da entrega; sem o dia da entrega, conta do agendamento e avisa', () => {
    const fila = filaDeCobranca([ped('entregue', '2026-10-10'), ped('entregue', '2026-10-01', { entregue_em: '2026-10-18T12:00:00Z' })], HOJE);
    const sem = fila.itens.find((i) => i.desde === 'agendamento')!;
    expect(sem.dias).toBe(10);
    expect(fila.semDiaDaEntrega).toBe(1);
    expect(fila.itens.find((i) => i.desde === 'entrega')!.dias).toBe(2);
  });

  it('o que a cliente deve hoje: o valor do pagamento, com desconto negociado', () => {
    const fila = filaDeCobranca([ped('entregue', '2026-10-15', { valor: 700, valor_agendado: 735 })], HOJE);
    expect(fila.itens[0].valor).toBe(700);
  });

  it('faixas: até 3, 4 a 7, 8 a 15, mais de 15', () => {
    expect([0, 3, 4, 7, 8, 15, 16, 40].map(faixaDe)).toEqual(['0-3', '0-3', '4-7', '4-7', '8-15', '8-15', '16+', '16+']);
    const fila = filaDeCobranca(
      [
        ped('entregue', '2026-10-01', { entregue_em: '2026-10-19T12:00:00Z' }),
        ped('entregue', '2026-09-01', { entregue_em: '2026-09-20T12:00:00Z' }),
        ped('entregue', '2026-09-01', { entregue_em: '2026-09-21T12:00:00Z', valor: 535 }),
      ],
      HOJE,
    );
    expect(fila.porFaixa['0-3']).toEqual({ qtd: 1, valor: 735 });
    expect(fila.porFaixa['16+']).toEqual({ qtd: 2, valor: 1270 });
    expect(fila.porFaixa['4-7']).toEqual({ qtd: 0, valor: 0 });
  });

  it('o dia da entrega é o de São Paulo (01h de 21/10 em UTC ainda é 20/10)', () => {
    expect(dataSP('2026-10-21T01:00:00Z')).toBe('2026-10-20');
    expect(dataSP('2026-10-20')).toBe('2026-10-20');
  });
});
