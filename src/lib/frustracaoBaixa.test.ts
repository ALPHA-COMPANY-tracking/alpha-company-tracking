// A frustração conta no mês em que o pedido foi FEITO, mesmo que a baixa
// (roubo, devolvido…) venha depois: pedido de outubro com baixa em novembro
// é perda de outubro. Decisão do Jonas em 22/10/2026. A data da baixa
// (frustrado_em) fica só como informação. Cancelado não é frustração.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { agregarPedidos, dataFrustracao, ehFrustracao } from '@/lib/pedidos';
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

describe('frustração no mês do pedido', () => {
  it('o dia da baixa (só informação) é o de São Paulo; sem a marca, o dia do pedido', () => {
    expect(dataFrustracao(rouboAntigo)).toBe('2026-10-05');
    expect(dataFrustracao({ data: '2026-09-30', frustrado_em: '2026-10-01T02:00:00Z' })).toBe('2026-09-30'); // 23h em SP
    expect(dataFrustracao({ data: '2026-08-20', frustrado_em: null })).toBe('2026-08-20');
  });

  it('roubo de pedido de agosto com baixa em outubro conta em AGOSTO', () => {
    expect(agregarPedidos([rouboAntigo], AGO)).toMatchObject({ qtd_frustrados: 1, valor_frustrado: 735 });
    expect(agregarPedidos([rouboAntigo], OUT)).toMatchObject({ qtd_frustrados: 0, valor_frustrado: 0 });
  });

  it('o lucro do mês do pedido desconta a perda real do roubo (produto + frete)', () => {
    const com = calcularPnl([], [], AGO, {}, [rouboAntigo]);
    expect(com.perda_real_frustrados).toBe((83 + 33) * 100);
    expect(calcularPnl([], [], OUT, {}, [rouboAntigo]).perda_real_frustrados).toBe(0);
  });

  it('cancelado não é frustração (card próprio), nem que tenha saído', () => {
    const canceladoQueSaiu = ped('c', 'cancelados', '2026-10-10');
    expect(ehFrustracao(canceladoQueSaiu)).toBe(false);
    expect(ehFrustracao(ped('d', 'devolvido', '2026-10-10'))).toBe(true);
    expect(agregarPedidos([canceladoQueSaiu], OUT)).toMatchObject({ qtd_frustrados: 0, perda_real_frustrados: 0, qtd_cancelados: 1 });
  });
});
