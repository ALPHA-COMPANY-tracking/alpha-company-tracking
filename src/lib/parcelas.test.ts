// Pagamento em partes (planilha de pagamentos): cada parcela conta no dia
// dela; produto e frete uma vez só, no primeiro pagamento.
// Caso real: #1170 pagou R$ 300 em 30/09 e R$ 350 em 07/10.
import { describe, expect, it } from 'vitest';
import type { Pedido } from '@/types';
import { agregarPedidos, pagamentosDoPedido, vendasAprovadasPorDia } from '@/lib/pedidos';
import { calcularPnl } from '@/lib/pnl';
import { resumoDoVendedor } from '@/lib/vendedor';
import { montarResumo } from '../../api/lib-resumo';

const SET = { inicio: '2026-09-01', fim: '2026-09-30' };
const OUT = { inicio: '2026-10-01', fim: '2026-10-31' };

const emPartes: Pedido = {
  id: 'BLV-IR8O26E8DK',
  internal_id: 1170,
  status: 'pagos',
  data: '2026-09-25',
  data_aprovacao: '2026-09-30',
  valor: 650,
  valor_agendado: 735,
  produto_plano: 'DERMAX PREMIUM - 6 POTE',
  vendedor: 'PETER',
  metodo_pagamento: 'pix',
  parcelas: [
    { data: '2026-10-07', valor: 350 },
    { data: '2026-09-30', valor: 300 },
  ],
};

describe('pagamento em partes', () => {
  it('as parcelas, em ordem, numeradas', () => {
    expect(pagamentosDoPedido(emPartes)).toEqual([
      { data: '2026-09-30', valor: 300, parcela: { n: 1, de: 2 } },
      { data: '2026-10-07', valor: 350, parcela: { n: 2, de: 2 } },
    ]);
    // Sem parcelas: um pagamento só, como sempre.
    expect(pagamentosDoPedido({ ...emPartes, parcelas: null })).toEqual([{ data: '2026-09-30', valor: 650 }]);
    // Não pago: nenhum.
    expect(pagamentosDoPedido({ ...emPartes, status: 'cobrados' })).toEqual([]);
  });

  it('cada parcela na receita do mês dela', () => {
    expect(agregarPedidos([emPartes], SET)).toMatchObject({ receita_aprovada: 300, qtd_pagamentos: 1 });
    expect(agregarPedidos([emPartes], OUT)).toMatchObject({ receita_aprovada: 350, qtd_pagamentos: 1 });
  });

  it('produto e frete uma vez só, no primeiro pagamento; comissão sobre cada parcela', () => {
    const set = calcularPnl([], [], SET, {}, [emPartes]);
    const out = calcularPnl([], [], OUT, {}, [emPartes]);
    expect(set.custo_produtos).toBe(8_300);
    expect(set.frete).toBe(3_300);
    expect(out.custo_produtos).toBe(0);
    expect(out.frete).toBe(0);
    expect(out.comissoes_vendedor).toBe(1_750); // 5% de 350
    expect(out.comissoes_cobranca).toBe(350); // 1% de 350
  });

  it('Vendas Aprovadas mostra a parcela no dia dela', () => {
    const dias = vendasAprovadasPorDia([emPartes], OUT);
    expect(dias).toHaveLength(1);
    expect(dias[0].data).toBe('2026-10-07');
    expect(dias[0].pagamentos[0]).toMatchObject({ valor: 350, parcela: { n: 2, de: 2 } });
  });

  it('painel do vendedor e resumo do celular também', () => {
    expect(resumoDoVendedor([emPartes], 'PETER', OUT, '2026-10-07').pagos).toEqual({ qtd: 1, valor: 35_000 });
    const linha = {
      status: emPartes.status,
      data: emPartes.data,
      data_aprovacao: emPartes.data_aprovacao ?? null,
      valor: emPartes.valor,
      valor_agendado: 735,
      produto_plano: emPartes.produto_plano ?? null,
      vendedor: 'PETER',
      metodo_pagamento: 'pix',
      parcelas: emPartes.parcelas,
    };
    const dia7 = montarResumo('2026-10-07', [linha], 0, null);
    expect(dia7.receita).toBe(350);
    expect(dia7.qtd_pagamentos).toBe(1);
    const dia30 = montarResumo('2026-09-30', [linha], 0, null);
    expect(dia30.receita).toBe(300);
  });
});
