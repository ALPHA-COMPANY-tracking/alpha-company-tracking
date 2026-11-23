// Métricas Aprovados (23/11/2026): conversão da safra, de onde veio o
// dinheiro e o ponto de equilíbrio do mês.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { conversaoDaSafra, conversaoPorGrupo, equilibrioDoMes, mediana, origemDosPagamentos } from '@/lib/metricasAprovados';

const P: Periodo = { inicio: '2026-11-01', fim: '2026-11-30' };

const ped = (id: string, status: string, valor: number, extra: Partial<Pedido> = {}): Pedido => ({
  id,
  status,
  data: '2026-11-03',
  valor,
  valor_agendado: valor,
  produto_plano: 'DERMAX PREMIUM - 3 POTE + 1 GOTA',
  vendedor: 'PETER',
  metodo_pagamento: 'pix',
  ...extra,
});

describe('conversão da safra', () => {
  const pedidos: Pedido[] = [
    ped('pago', 'pagos', 435, { data_aprovacao: '2026-11-10' }),
    ped('pago-boleto', 'pagos', 735, { data_aprovacao: '2026-11-12', metodo_pagamento: 'boleto', vendedor: 'Matheus' }),
    ped('devolvido', 'devolvido', 435, { enviado_em: '2026-11-04T12:00:00Z', metodo_pagamento: 'boleto' }),
    ped('rota', 'enviados', 535),
    ped('cancelado', 'cancelados', 235),
    ped('recusado', 'recusados', 735), // não é venda: fora da safra
    ped('outubro', 'pagos', 735, { data: '2026-10-30', data_aprovacao: '2026-11-02' }), // pago em novembro, safra de outubro
    ped('lixeira', 'enviados', 435, { removido_em: '2026-11-05T00:00:00Z' }),
  ];

  it('conta os pedidos FEITOS no período (regra do agendado) e tudo o que já pagaram', () => {
    const c = conversaoDaSafra(pedidos, P);
    expect(c.qtd).toBe(5); // pago, pago-boleto, devolvido, rota, cancelado
    expect(c.valor).toBe(435 + 735 + 435 + 535 + 235);
    expect(c.valor).toBe(agregarPedidos(pedidos, P).valor_agendado); // = Faturamento Agendado
    expect(c.pagos).toBe(2);
    expect(c.recebido).toBe(1170);
    expect(c.perdidos).toBe(1); // cancelado não é frustração
    expect(c.emAberto).toEqual({ qtd: 1, valor: 535 });
    expect(c.pct_valor).toBeCloseTo(1170 / 2375, 6);
    expect(c.pct_qtd).toBeCloseTo(2 / 5, 6);
    expect(c.pct_resolvidos).toBeCloseTo(2 / 3, 6);
  });

  it('separa por forma de pagamento e por vendedor; maior agendado primeiro', () => {
    const m = conversaoPorGrupo(pedidos, P, (p) => p.metodo_pagamento ?? '');
    expect(m.map((g) => [g.grupo, g.qtd, g.recebido])).toEqual([
      ['pix', 3, 435],
      ['boleto', 2, 735],
    ]);
    expect(m.reduce((s, g) => s + g.valor, 0)).toBe(conversaoDaSafra(pedidos, P).valor);
  });

  it('sem pedido: nada de divisão por zero', () => {
    const c = conversaoDaSafra([], P);
    expect([c.pct_valor, c.pct_qtd, c.pct_resolvidos]).toEqual([null, null, null]);
  });

  it('pagamento em partes: o recebido soma as parcelas', () => {
    const emPartes = ped('partes', 'pagos', 735, {
      data_aprovacao: '2026-11-10',
      parcelas: [
        { data: '2026-11-10', valor: 400 },
        { data: '2026-12-02', valor: 335 },
      ],
    });
    expect(conversaoDaSafra([emPartes], P).recebido).toBe(735);
  });
});

describe('de onde veio o dinheiro', () => {
  const pedidos: Pedido[] = [
    ped('na-entrega', 'pagos', 435, { data_aprovacao: '2026-11-06' }),
    ped('cobranca', 'pagos', 735, { data_aprovacao: '2026-11-15', entregue_em: '2026-11-08T15:00:00Z' }),
    ped('antecipado', 'pagos', 335, { data_aprovacao: '2026-11-03', tipo_venda: 'antecipado' }),
    ped('outro-mes', 'pagos', 535, { data_aprovacao: '2026-12-01' }),
  ];

  it('soma igual aos Pagamentos aprovados e separa na entrega × cobrança × antecipado', () => {
    const o = origemDosPagamentos(pedidos, P);
    expect(o.total).toEqual({ qtd: 3, valor: 1505 });
    expect(reaisDoPnl(pedidos)).toBe(1505);
    expect(o.naEntrega).toEqual({ qtd: 1, valor: 435 });
    expect(o.cobranca).toEqual({ qtd: 1, valor: 735 });
    expect(o.antecipado).toEqual({ qtd: 1, valor: 335 });
  });

  it('dias: do pedido ao pagamento (todos) e da entrega ao pagamento (cobrança)', () => {
    const o = origemDosPagamentos(pedidos, P);
    expect(o.diasAtePagar).toBe(3); // 3, 12 e 0 dias → mediana 3
    expect(o.diasDaEntregaAoPagamento).toBe(7); // entregue 08/11 (SP), pago 15/11
  });

  it('mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
});

function reaisDoPnl(pedidos: Pedido[]): number {
  return calcularPnl([], [], P, {}, pedidos).receita_aprovada / 100;
}

describe('ponto de equilíbrio do mês', () => {
  const dia = (data: string, ads: number): AfterpayDaily => ({
    data,
    receita_aprovada: 0,
    qtd_pagamentos: 0,
    taxas_plataforma: 0,
    custo_produtos: 0,
    frete: 0,
    comissoes_vendedor: 0,
    comissoes_cobranca: 0,
    investimento_ads: ads,
    taxas_investimento: 0,
    valor_frustrado: 0,
    qtd_frustrados: 0,
    valor_agendado: 0,
    qtd_agendados: 0,
  });
  // Novembro até o dia 10: R$ 1.000 de anúncio por dia, 10 pagamentos de R$ 735.
  const dailies = Array.from({ length: 10 }, (_, i) => dia(`2026-11-${String(i + 1).padStart(2, '0')}`, 1000));
  const pedidos = Array.from({ length: 10 }, (_, i) =>
    ped(`p${i}`, 'pagos', 735, { data: '2026-11-01', data_aprovacao: `2026-11-${String(i + 1).padStart(2, '0')}` }),
  );
  const eq = equilibrioDoMes(dailies, [], pedidos, '2026-11-10');

  it('anúncio projetado pelo ritmo para o mês inteiro', () => {
    expect(eq.fixos.anuncios).toBe(30_000_00); // R$ 10 mil em 10 dias → R$ 30 mil em 30
    expect(eq.diasRestantes).toBe(21);
  });

  it('o mínimo zera o lucro: mínimo × margem = custos que não dependem do recebido', () => {
    expect(eq.margem).not.toBeNull();
    expect(eq.minimo! * eq.margem!).toBeCloseTo(eq.fixos.total, -1);
    // A margem é a do P&L do mês: (receita − produto, frete, taxas e comissões) ÷ receita.
    const pnl = calcularPnl(dailies, [], { inicio: '2026-11-01', fim: '2026-11-10' }, {}, pedidos);
    const variaveis = pnl.taxas_plataforma + pnl.custo_produtos + pnl.frete + pnl.comissoes_vendedor + pnl.comissoes_cobranca;
    expect(eq.margem).toBeCloseTo((pnl.receita_aprovada - variaveis) / pnl.receita_aprovada, 9);
  });

  it('falta e falta por dia; recebido = Pagamentos aprovados do mês', () => {
    expect(eq.recebido).toBe(7350_00);
    expect(eq.falta).toBe(Math.max(0, eq.minimo! - eq.recebido));
    expect(eq.faltaPorDia).toBe(Math.round(eq.falta / 21));
    expect(eq.cobre).toBe(eq.previsto >= eq.minimo!);
  });

  it('mês sem pagamento ainda: a margem vem do mês anterior; sem nenhum: sem mínimo', () => {
    const outubro = pedidos.map((p, i) => ({ ...p, id: `o${i}`, data: '2026-10-05', data_aprovacao: '2026-10-20' }));
    const semNov = equilibrioDoMes(dailies, [], outubro, '2026-11-10');
    expect(semNov.margemDe).toBe('mes_anterior');
    expect(semNov.minimo).not.toBeNull();
    const nada = equilibrioDoMes(dailies, [], [], '2026-11-10');
    expect([nada.margem, nada.minimo, nada.cobre]).toEqual([null, null, null]);
  });
});
