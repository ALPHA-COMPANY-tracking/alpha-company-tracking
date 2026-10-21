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
    expect(servidor.FRETES).toEqual(app.FRETES);
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
      status: 'roubo',
      data: '2026-09-04',
      valor: 535,
      valor_agendado: 535,
      produto_plano: 'DERMAX PREMIUM - 4 POTE + 1 GOTA',
      vendedor: 'PETER',
    };
    expect(app.perdaRealDePedido(frustrado)).toBe(41 + 33);
  });
});

describe('plano promocional de 3 meses (16/10/2026)', () => {
  it('custa R$ 32,50, igual ao 3 potes: 3 cápsulas × R$ 8,50 + gotas R$ 7,00', () => {
    expect(app.custoProdutoDoPlano('(PROMO) - 3 MESES')).toBe(32.5);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM (PROMO) - 3 meses')).toBe(32.5);
    expect(app.planoTemCusto('(PROMO) - 3 MESES')).toBe(true);
    expect(servidor.custoProdutoDoPlano('(PROMO) - 3 MESES')).toBe(32.5);
  });

  it('não confunde com outros planos', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA')).toBe(83);
    expect(app.custoProdutoDoPlano('PLANO 13 MESES')).toBe(0); // 13 não é 3
    expect(app.custoProdutoDoPlano('PLANO 14 MESES')).toBe(0); // 14 não é 4
  });

  it('promo de 4 meses (17/10/2026): R$ 41,00, igual ao 4 potes — 4 cápsulas × R$ 8,50 + gotas R$ 7,00', () => {
    expect(app.custoProdutoDoPlano('(PROMO) - 4 MESES')).toBe(41);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 4 POTE + 1 GOTA')).toBe(41);
    expect(app.planoTemCusto('(PROMO) - 4 MESES')).toBe(true);
    expect(servidor.custoProdutoDoPlano('(PROMO) - 4 MESES')).toBe(41);
  });
});

describe('plano de 1 pote (19/10/2026)', () => {
  it('custa R$ 15,50: 1 frasco de cápsula R$ 8,50 + 1 de gotas R$ 7,00', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 1 POTE + 1 GOTA')).toBe(15.5);
    expect(app.planoTemCusto('DERMAX PREMIUM - 1 POTE + 1 GOTA')).toBe(true);
    expect(servidor.custoProdutoDoPlano('DERMAX PREMIUM - 1 POTE + 1 GOTA')).toBe(15.5);
  });

  it('os outros planos não mudam (o "1 GOTA" deles não é "1 pote")', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME')).toBe(83);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 4 POTE + 1 GOTA')).toBe(41);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 3 POTE + 1 GOTA')).toBe(32.5);
    expect(app.custoProdutoDoPlano('PLANO 11 POTE')).toBe(0); // 11 não é 1
  });
});

describe('tratamento de 2 meses (21/10/2026)', () => {
  it('custa R$ 24,00: 2 cápsulas × R$ 8,50 + gotas R$ 7,00', () => {
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 2 POTE + 1 GOTA')).toBe(24);
    expect(app.custoProdutoDoPlano('(PROMO) - 2 MESES')).toBe(24);
    expect(app.planoTemCusto('DERMAX PREMIUM - 2 POTE + 1 GOTA')).toBe(true);
    expect(servidor.custoProdutoDoPlano('DERMAX PREMIUM - 2 POTE + 1 GOTA')).toBe(24);
  });

  it('não confunde com 12 potes nem mexe nos outros', () => {
    expect(app.custoProdutoDoPlano('PLANO 12 POTE')).toBe(0);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 1 POTE + 1 GOTA')).toBe(15.5);
    expect(app.custoProdutoDoPlano('DERMAX PREMIUM - 6 POTE + 1 GOTA + 1 SÉRUM + 1 CREME')).toBe(83);
  });
});
