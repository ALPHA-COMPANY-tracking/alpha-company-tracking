// Planos do BlueSales e o custo de cada um.
//
// Plano novo cadastrado lá e esquecido aqui entra na conta valendo ZERO
// e infla o lucro em silêncio. Foi o risco quando o tratamento de 4
// meses entrou (04/09/2026). Estes testes existem para isso doer.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import * as app from '@/lib/custosConfig';
import * as servidor from '../../api/lib-custos';
import { calcularPnl } from '@/lib/pnl';

const periodo: Periodo = { inicio: '2026-09-01', fim: '2026-09-30' };

function pago(id: string, valor: number, plano: string): Pedido {
  return {
    id,
    status: 'pagos',
    data: '2026-09-04',
    data_aprovacao: '2026-09-04',
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: plano,
    vendedor: 'PETER',
  };
}

describe('custo por plano', () => {
  it('conhece os três tratamentos vendidos hoje', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME')).toBe(83);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 4 POTE + 1 GOTA')).toBe(41);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 3 POTE + 1 GOTA')).toBe(32.5);
  });

  it('a tabela do servidor é idêntica à do app', () => {
    // A notificação das 23h usa a cópia do servidor. Se as duas
    // divergirem, o fechamento da noite conta diferente da tela.
    expect(servidor.CUSTO_PRODUTO.map((r) => [r.match.source, r.custo])).toEqual(
      app.CUSTO_PRODUTO.map((r) => [r.match.source, r.custo]),
    );
    expect(servidor.FRETE_POR_PEDIDO).toBe(app.FRETE_POR_PEDIDO);
  });

  it('plano desconhecido vale zero — e é por isso que existe o aviso', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 12 POTE')).toBe(0);
    expect(app.planoTemCusto('DERMAX PREMIUM - 12 POTE')).toBe(false);
    expect(app.planoTemCusto('DERMAX PREMIUM - 4 POTE + 1 GOTA')).toBe(true);
  });
});

describe('planosSemCusto', () => {
  it('acusa o plano que não está cadastrado', () => {
    const pedidos = [
      pago('a', 535, 'DERMAX PREMIUM - 4 POTE + 1 GOTA'),
      pago('b', 999, 'DERMAX PREMIUM - 12 POTE'),
    ];
    expect(app.planosSemCusto(pedidos, periodo)).toEqual(['DERMAX PREMIUM - 12 POTE']);
  });

  it('fica calado quando está tudo cadastrado', () => {
    const pedidos = [pago('a', 535, 'DERMAX PREMIUM - 4 POTE + 1 GOTA')];
    expect(app.planosSemCusto(pedidos, periodo)).toEqual([]);
  });

  it('não repete o mesmo plano várias vezes', () => {
    const pedidos = [pago('a', 999, 'PLANO NOVO'), pago('b', 999, 'PLANO NOVO')];
    expect(app.planosSemCusto(pedidos, periodo)).toEqual(['PLANO NOVO']);
  });
});

describe('o plano de 4 potes entra certo no P&L', () => {
  it('desconta produto R$ 41,00 e frete R$ 33,00', () => {
    const r = calcularPnl([], [], periodo, {}, [pago('a', 535, 'DERMAX PREMIUM - 4 POTE + 1 GOTA')]);
    expect(r.receita_aprovada).toBe(53_500);
    expect(r.custo_produtos).toBe(4_100);
    expect(r.frete).toBe(3_300);
    // 5% de 535 = 26,75 · cobrança 1% = 5,35
    expect(r.comissoes_vendedor).toBe(2_675);
    expect(r.comissoes_cobranca).toBe(535);
    // 535 − (41 + 33 + 26,75 + 5,35) = R$ 428,90
    expect(r.lucro_real).toBe(42_890);
  });

  it('a perda de um 4 potes frustrado é produto + frete', () => {
    const frustrado: Pedido = {
      id: 'f',
      status: 'frustrados',
      data: '2026-09-04',
      valor: 535,
      valor_agendado: 535,
      produto_plano: 'DERMAX PREMIUM - 4 POTE + 1 GOTA',
      vendedor: 'PETER',
    };
    expect(app.perdaRealDePedido(frustrado)).toBe(41 + 33);
  });
});
