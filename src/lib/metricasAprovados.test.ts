// Métricas Aprovados (23/11/2026): conversão da safra, de onde veio o
// dinheiro e o ponto de equilíbrio do mês.
import { describe, expect, it } from 'vitest';
import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import {
  conversaoDaSafra,
  conversaoDoPeriodo,
  conversaoPorGrupo,
  equilibrioDoMes,
  mediana,
  origemDosPagamentos,
  quantoPrecisaEntrar,
} from '@/lib/metricasAprovados';

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

describe('conversão do período, como o BlueSales (23/11/2026: 162 ÷ 376 = 43,1%)', () => {
  const pedidos: Pedido[] = [
    ped('pago', 'pagos', 435, { data_aprovacao: '2026-11-10' }),
    ped('rota', 'enviados', 535),
    ped('devolvido', 'devolvido', 435, { enviado_em: '2026-11-04T12:00:00Z' }),
    ped('cancelado', 'cancelados', 235), // agendado conta o cancelado
    ped('outubro', 'pagos', 735, { data: '2026-10-28', data_aprovacao: '2026-11-02' }), // pagamento de pedido de outubro CONTA
    ped('antecipado', 'pagos', 335, { data_aprovacao: '2026-11-03', tipo_venda: 'antecipado' }), // fora: não foi agendado
    ped('partes', 'pagos', 735, {
      data_aprovacao: '2026-11-05',
      parcelas: [
        { data: '2026-11-05', valor: 400 },
        { data: '2026-11-20', valor: 335 },
      ],
    }), // cada parcela é um pagamento
  ];

  it('pagamentos do período (sem antecipado) ÷ agendamentos do período', () => {
    const c = conversaoDoPeriodo(pedidos, P);
    expect(c.agendados).toEqual({ qtd: 5, valor: 435 + 535 + 435 + 235 + 735 });
    expect(c.agendados.qtd).toBe(agregarPedidos(pedidos, P).qtd_agendados);
    expect(c.pagos).toEqual({ qtd: 4, valor: 435 + 735 + 400 + 335 });
    expect(c.antecipado).toEqual({ qtd: 1, valor: 335 });
    expect(c.pct_qtd).toBeCloseTo(4 / 5, 9);
    expect(c.pct_valor).toBeCloseTo(1905 / 2375, 9);
    // Com o antecipado, bate com os Pagamentos aprovados do P&L.
    expect(c.pagos.qtd + c.antecipado.qtd).toBe(agregarPedidos(pedidos, P).qtd_pagamentos);
    expect(c.pagos.valor + c.antecipado.valor).toBe(reaisDoPnl(pedidos));
  });

  it('é maior que a da safra: conta o pagamento de pedido de outro mês', () => {
    expect(conversaoDoPeriodo(pedidos, P).pct_qtd!).toBeGreaterThan(conversaoDaSafra(pedidos, P).pct_qtd!);
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
    // O veredito compara bases iguais: o mínimo do mês inteiro com o recebido do mês inteiro no mesmo ritmo.
    expect(eq.cobre).toBe(eq.projecao >= eq.minimo!);
    expect(eq.ritmoDe).toBe('dias_fechados');
  });

  it('hoje fica de fora do ritmo: um dia pela metade não muda a projeção', () => {
    const meioDia = [...dailies.slice(0, 9), dia('2026-11-10', 200)];
    const parcial = equilibrioDoMes(meioDia, [], pedidos, '2026-11-10');
    expect(parcial.fixos.anuncios).toBe(eq.fixos.anuncios); // 9 dias fechados × R$ 1.000 → R$ 30 mil
  });

  it('mês sem pagamento ainda: a margem vem do mês anterior; sem nenhum: sem mínimo', () => {
    const outubro = pedidos.map((p, i) => ({ ...p, id: `o${i}`, data: '2026-10-05', data_aprovacao: '2026-10-20' }));
    const semNov = equilibrioDoMes(dailies, [], outubro, '2026-11-10');
    expect(semNov.margemDe).toBe('mes_anterior');
    expect(semNov.minimo).not.toBeNull();
    const nada = equilibrioDoMes(dailies, [], [], '2026-11-10');
    expect([nada.margem, nada.minimo, nada.cobre]).toEqual([null, null, null]);
  });

  describe('sair do negativo (Jonas, 23/11/2026)', () => {
    it('o lucro de hoje é o Lucro Real da Demonstração do mês até hoje', () => {
      const pnl = calcularPnl(dailies, [], { inicio: '2026-11-01', fim: '2026-11-10' }, {}, pedidos);
      expect(eq.lucroHoje).toBe(pnl.lucro_real);
      expect(eq.lucroHoje).toBeLessThan(0); // R$ 10 mil de anúncio, R$ 7.350 recebidos
    });

    it('lucro zero no mês = o mínimo; a meta soma alvo ÷ margem', () => {
      const zero = quantoPrecisaEntrar(eq, 0);
      expect(zero.mes).toBe(eq.minimo);
      expect(zero.faltaMes).toBe(eq.falta);
      expect(zero.porDia).toBe(eq.faltaPorDia);
      const dez = quantoPrecisaEntrar(eq, 10_000_00);
      expect(dez.mes! - zero.mes!).toBeCloseTo(10_000_00 / eq.margem!, -1);
      expect(dez.porDia).toBe(Math.round(dez.faltaMes! / eq.diasRestantes));
    });

    it('com o que já foi gasto: o que falta entrar × margem tira o lucro do negativo', () => {
      const zero = quantoPrecisaEntrar(eq, 0);
      expect(zero.agora! * eq.margem!).toBeCloseTo(-eq.lucroHoje, -1);
      // Já no positivo, não falta nada para empatar.
      const lucrativo = { ...eq, lucroHoje: 500_00 };
      expect(quantoPrecisaEntrar(lucrativo, 0).agora).toBe(0);
      expect(quantoPrecisaEntrar(lucrativo, 1_000_00).agora).toBe(Math.round(500_00 / eq.margem!));
    });

    it('fechando o mês no ritmo: lucro projetado = projeção × margem − custos que não dependem do recebido', () => {
      expect(eq.lucroProjetado).toBe(Math.round(eq.projecao * eq.margem! - eq.fixos.total));
      // A projeção vira o mínimo quando o lucro projetado é zero.
      expect(eq.lucroProjetado! >= 0).toBe(eq.cobre);
    });

    it('sem margem: sem conta', () => {
      const nada = equilibrioDoMes(dailies, [], [], '2026-11-10');
      expect(quantoPrecisaEntrar(nada, 0)).toEqual({ agora: null, mes: null, faltaMes: null, porDia: null });
      expect(nada.lucroProjetado).toBeNull();
    });
  });
});

describe('começo do mês (revisão de 23/11/2026)', () => {
  // Operação estável desde 01/10: R$ 1.000/dia de anúncio, 6 pedidos/dia de
  // R$ 735; 4 pagam 8 dias depois, 1 devolve, 1 fica na rua.
  const diasDe = (de: string, ate: string) => {
    const out: string[] = [];
    for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  };
  const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const daily = (data: string): AfterpayDaily => ({
    data,
    receita_aprovada: 0,
    qtd_pagamentos: 0,
    taxas_plataforma: 0,
    custo_produtos: 0,
    frete: 0,
    comissoes_vendedor: 0,
    comissoes_cobranca: 0,
    investimento_ads: 1000,
    taxas_investimento: 0,
    valor_frustrado: 0,
    qtd_frustrados: 0,
    valor_agendado: 0,
    qtd_agendados: 0,
  });
  const operacao = (hoje: string) => {
    const pedidos: Pedido[] = [];
    for (const d of diasDe('2026-10-01', hoje)) {
      for (let i = 0; i < 6; i++) {
        const pago = somaDias(d, 8);
        const base = { data: d, enviado_em: `${d}T15:00:00Z`, metodo_pagamento: 'pix' };
        if (i < 4 && pago <= hoje) pedidos.push(ped(`${d}-${i}`, 'pagos', 735, { ...base, data_aprovacao: pago }));
        else if (i === 4) pedidos.push(ped(`${d}-${i}`, 'devolvido', 735, base));
        else pedidos.push(ped(`${d}-${i}`, 'enviados', 735, base));
      }
    }
    // Hoje: o Meta ainda não mandou o gasto (linha zerada).
    const dailies = diasDe('2026-10-01', hoje).map((d) => (d === hoje ? { ...daily(d), investimento_ads: 0 } : daily(d)));
    return { pedidos, dailies };
  };

  it('dia 1, com o gasto de hoje ainda zerado: anúncio no ritmo do mês anterior, não zero', () => {
    const { pedidos, dailies } = operacao('2026-11-01');
    const eq = equilibrioDoMes(dailies, [], pedidos, '2026-11-01');
    expect(eq.ritmoDe).toBe('mes_anterior');
    expect(eq.fixos.anuncios).toBe(30_000_00); // R$ 31 mil em 31 dias de outubro → R$ 1.000/dia × 30
    expect(eq.agendadoProjetado).toBeGreaterThan(0);
  });

  it('mês lucrativo no começo: o veredito não fica vermelho por comparar bases diferentes', () => {
    const { pedidos, dailies } = operacao('2026-11-05');
    const eq = equilibrioDoMes(dailies, [], pedidos, '2026-11-05');
    expect(eq.minimo).not.toBeNull();
    // ~R$ 2.940/dia entrando contra ~R$ 1.000/dia de anúncio: o mês fecha no lucro.
    expect(eq.cobre).toBe(true);
    // A Previsão do Mês (sem vendas novas) continua menor que o mínimo — por isso não é ela que decide.
    expect(eq.previsto).toBeLessThan(eq.projecao);
  });
});

describe('pedido de antes dos avisos', () => {
  it('sem o dia da entrega não vai para "na entrega": fica sem dado', () => {
    const antigo = ped('agosto', 'pagos', 735, { data: '2026-08-10', data_aprovacao: '2026-11-04' });
    const o = origemDosPagamentos([antigo], P);
    expect(o.naEntrega.qtd).toBe(0);
    expect(o.semDado).toEqual({ qtd: 1, valor: 735 });
    expect(o.total.valor).toBe(735);
  });
});
