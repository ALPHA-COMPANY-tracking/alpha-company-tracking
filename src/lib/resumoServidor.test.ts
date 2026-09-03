// Resumo do dia (servidor) — o que vai na notificação parcial e de
// fechamento. O primeiro bloco garante que as regras de custo do
// servidor não se descolem das do app.
import { describe, expect, it } from 'vitest';
import * as servidor from '../../api/lib-custos';
import * as app from '@/lib/custosConfig';
import { avisoDoResumo, diaDoResumo, montarResumo } from '../../api/lib-resumo';

describe('custos do servidor batem com os do app', () => {
  it('frete, comissões e percentuais por vendedor são os mesmos', () => {
    expect(servidor.FRETE_POR_PEDIDO).toBe(app.FRETE_POR_PEDIDO);
    expect(servidor.COMISSAO_VENDEDOR).toBe(app.COMISSAO_VENDEDOR);
    expect(servidor.COMISSAO_COBRANCA).toBe(app.COMISSAO_COBRANCA);
    expect(servidor.COMISSAO_POR_VENDEDOR).toEqual(app.COMISSAO_POR_VENDEDOR);
  });

  it('custo por plano é o mesmo', () => {
    for (const plano of ['DERMAX PREMIUM - 6 POTE + 1 GOTA', 'DERMAX PREMIUM - 3 POTE + 1 GOTA', 'outro']) {
      expect(servidor.custoProdutoDoPlano(plano)).toBe(app.custoProdutoDoPlano(plano));
    }
  });

  it('comissão por vendedor é a mesma', () => {
    for (const nome of ['PETER', 'MATHEUS', 'Matheus', 'Fulano', null]) {
      expect(servidor.comissaoDoVendedor(nome)).toBe(app.comissaoDoVendedor(nome));
    }
  });
});

const DIA = '2026-08-31';

function pedido(over: Partial<Parameters<typeof montarResumo>[1][number]> = {}) {
  return {
    status: 'pagos',
    data: DIA,
    data_aprovacao: DIA,
    valor: 735,
    valor_agendado: 735,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    vendedor: 'PETER',
    ...over,
  };
}

describe('montarResumo', () => {
  it('calcula lucro e ROAS do dia', () => {
    // 1 venda de 735 (6 potes) paga hoje, com R$ 200 de Ads e R$ 2,50 de taxa.
    const r = montarResumo(DIA, [pedido()], 200, 2.5);
    expect(r.valor_agendado).toBe(735);
    expect(r.receita).toBe(735);
    expect(r.qtd_pagamentos).toBe(1);
    // 735 − (2,50 + 83 + 33 + 36,63 + 7,35 + 200) = 372,53
    expect(r.lucro).toBe(372.53);
    expect(r.roas).toBeCloseTo(3.675, 3);
  });

  it('separa agendado (criação) de aprovado (pagamento)', () => {
    const pedidos = [
      pedido({ data: '2026-08-20' }), // pago hoje, agendado noutro dia
      pedido({ status: 'cadastrados', data_aprovacao: null }), // agendado hoje, não pago
    ];
    const r = montarResumo(DIA, pedidos, 0, 0);
    expect(r.qtd_agendados).toBe(1);
    expect(r.qtd_pagamentos).toBe(1);
    expect(r.receita).toBe(735);
  });

  it('o ROAS do resumo é o mesmo da tela: sobre o agendado', () => {
    // Um pedido pago hoje mas agendado ONTEM, e um agendado hoje sem
    // pagamento: aprovado e agendado ficam diferentes de propósito.
    const pedidos = [
      pedido({ data: '2026-08-20' }), // pago hoje, agendado noutro dia
      pedido({ status: 'cadastrados', data_aprovacao: null, valor: 435, valor_agendado: 435 }),
    ];
    const r = montarResumo(DIA, pedidos, 100, 0);
    expect(r.valor_agendado).toBe(435);
    expect(r.receita).toBe(735);
    expect(r.roas).toBeCloseTo(4.35, 2); // 435 / 100 — e não 7,35
  });

  it('sem Ads o ROAS fica zerado em vez de infinito', () => {
    const r = montarResumo(DIA, [pedido()], 0, 0);
    expect(r.roas).toBe(0);
    expect(Number.isFinite(r.lucro)).toBe(true);
  });

  it('usa o percentual do MATHEUS quando é dele a venda', () => {
    const comPeter = montarResumo(DIA, [pedido({ vendedor: 'PETER' })], 0, 0);
    const comMatheus = montarResumo(DIA, [pedido({ vendedor: 'MATHEUS' })], 0, 0);
    // 6% em vez de 5% → lucro menor em 1% de 735
    expect(comPeter.lucro - comMatheus.lucro).toBeCloseTo(7.35, 2);
  });
});

describe('avisoDoResumo', () => {
  it('parcial e fechamento têm títulos diferentes e não se sobrescrevem', () => {
    const r = montarResumo(DIA, [pedido()], 200, 2.5);
    const parcial = avisoDoResumo(r, false);
    const fechamento = avisoDoResumo(r, true);

    expect(parcial.titulo).toContain('Parcial de hoje');
    expect(fechamento.titulo).toContain('Fechamento de 31/08');
    expect(parcial.tag).not.toBe(fechamento.tag);
    expect(parcial.corpo).toContain('Agendado');
    expect(parcial.corpo).toContain('ROAS');
  });

  it('prejuízo aparece com seta para baixo', () => {
    const r = montarResumo(DIA, [pedido()], 5000, 0); // Ads alto = prejuízo
    expect(r.lucro).toBeLessThan(0);
    expect(avisoDoResumo(r, true).titulo).toContain('📉');
  });
});

describe('diaDoResumo (fechamento não pode virar o dia)', () => {
  // O agendador do GitHub atrasa. Se o fechamento das 23h rodar depois
  // da meia-noite, ele tem que continuar falando do dia que terminou —
  // senão manda um relatório zerado do dia recém-começado.
  const emSP = (iso: string) => diaDoResumo(new Date(iso));

  it('rodando no horário, é o próprio dia', () => {
    expect(emSP('2026-09-04T01:50:00Z')).toBe('2026-09-03'); // 22h50 BRT
    expect(emSP('2026-09-04T02:30:00Z')).toBe('2026-09-03'); // 23h30 BRT
  });

  it('atrasado para depois da meia-noite, ainda é o dia que terminou', () => {
    expect(emSP('2026-09-04T03:10:00Z')).toBe('2026-09-03'); // 00h10 BRT
    expect(emSP('2026-09-04T05:00:00Z')).toBe('2026-09-03'); // 02h BRT
    expect(emSP('2026-09-04T08:30:00Z')).toBe('2026-09-03'); // 05h30 BRT
  });

  it('vira o dia a partir das 6h da manhã', () => {
    expect(emSP('2026-09-04T09:00:00Z')).toBe('2026-09-04'); // 06h BRT
    expect(emSP('2026-09-04T15:00:00Z')).toBe('2026-09-04'); // meio-dia
  });

  it('atravessa a virada de mês sem tropeçar', () => {
    expect(emSP('2026-10-01T03:10:00Z')).toBe('2026-09-30'); // 00h10 BRT
  });

  it('o título diz de que dia é o fechamento', () => {
    const r = montarResumo('2026-09-03', [], 0, 0);
    expect(avisoDoResumo(r, true).titulo).toContain('Fechamento de 03/09');
  });
});
