// Comissão por vendedor.
//
// PETER: 5% (padrão) · MATHEUS: 6% (entrou em 31/08/2026).
// A conta é feita por vendedor, sobre a receita dele menos a parcela
// proporcional das taxas de plataforma. Com todos no mesmo percentual o
// total é idêntico à conta antiga — o que garante que nada muda para o
// PETER.
import { describe, expect, it } from 'vitest';
import type { Pedido, Periodo } from '@/types';
import { calcularPnl } from '@/lib/pnl';
import { comissaoDoVendedor } from '@/lib/custosConfig';

const periodo: Periodo = { inicio: '2026-08-01', fim: '2026-08-31' };

function daily(data: string, taxas: number) {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: taxas, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0,
  };
}

function pago(id: string, valor: number, vendedor: string, dia = '2026-08-10'): Pedido {
  return {
    id,
    status: 'pagos',
    data: dia,
    data_aprovacao: dia,
    valor,
    valor_bruto: valor,
    valor_agendado: valor,
    produto_plano: 'DERMAX PREMIUM - 6 POTE',
    vendedor,
    metodo_pagamento: 'pix',
  };
}

describe('comissaoDoVendedor', () => {
  it('MATHEUS 6%, PETER 5%, desconhecido cai no padrão', () => {
    expect(comissaoDoVendedor('MATHEUS')).toBe(0.06);
    expect(comissaoDoVendedor('Matheus')).toBe(0.06); // nome como vier do BlueSales
    expect(comissaoDoVendedor('PETER')).toBe(0.05);
    expect(comissaoDoVendedor('Fulano')).toBe(0.05);
    expect(comissaoDoVendedor(null)).toBe(0.05);
  });
});

describe('comissão no P&L', () => {
  it('NÃO muda nada para o PETER: agosto/2026 segue em R$ 1.266,66', () => {
    // Números reais do mês: receita R$ 25.358,25 e taxas R$ 25,00.
    // 5% × (25.358,25 − 25,00) = R$ 1.266,66 — igual ao BlueSales.
    const pedidos = [pago('p1', 25_358.25, 'PETER')];
    const pnl = calcularPnl([daily('2026-08-10', 25)], [], periodo, {}, pedidos);
    expect(pnl.receita_aprovada).toBe(2_535_825);
    expect(pnl.taxas_plataforma).toBe(2_500);
    expect(pnl.comissoes_vendedor).toBe(126_666); // R$ 1.266,66
  });

  it('cada vendedor com seu percentual', () => {
    // PETER 1.000 (5%) e MATHEUS 1.000 (6%), sem taxas.
    const pedidos = [pago('p1', 1000, 'PETER'), pago('m1', 1000, 'MATHEUS')];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);
    expect(pnl.comissoes_vendedor).toBe(5_000 + 6_000); // R$ 50 + R$ 60
  });

  it('as taxas são rateadas na proporção da receita de cada um', () => {
    // Receita 2.000 (metade de cada) e taxas de R$ 10 → R$ 5 para cada.
    const pedidos = [pago('p1', 1000, 'PETER'), pago('m1', 1000, 'MATHEUS')];
    const pnl = calcularPnl([daily('2026-08-10', 10)], [], periodo, {}, pedidos);
    // PETER: 5% × (1000 − 5) = 49,75 · MATHEUS: 6% × (1000 − 5) = 59,70
    expect(pnl.comissoes_vendedor).toBe(4_975 + 5_970);
  });

  it('a quebra por vendedor soma o total e traz nome, % e valor', () => {
    const pedidos = [pago('p1', 1000, 'PETER'), pago('m1', 500, 'MATHEUS')];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);

    const peter = pnl.comissoes_por_vendedor.find((v) => v.nome === 'PETER')!;
    const matheus = pnl.comissoes_por_vendedor.find((v) => v.nome === 'MATHEUS')!;
    expect(peter.pct).toBe(0.05);
    expect(peter.receita).toBe(100_000);
    expect(peter.comissao).toBe(5_000); // R$ 50,00
    expect(matheus.pct).toBe(0.06);
    expect(matheus.comissao).toBe(3_000); // 6% de R$ 500 = R$ 30,00

    const soma = pnl.comissoes_por_vendedor.reduce((s, v) => s + v.comissao, 0);
    expect(soma).toBe(pnl.comissoes_vendedor);
  });

  it('não duplica quem está configurado com outra caixa (Matheus/MATHEUS)', () => {
    // O BlueSales manda "Matheus"; a configuração usa "MATHEUS".
    const pnl = calcularPnl([], [], periodo, {}, [pago('m1', 500, 'Matheus'), pago('p1', 1000, 'PETER')]);
    const doMatheus = pnl.comissoes_por_vendedor.filter((v) => v.nome.toUpperCase() === 'MATHEUS');
    expect(doMatheus).toHaveLength(1);
    expect(doMatheus[0].nome).toBe('Matheus'); // mostra como veio do BlueSales
    expect(doMatheus[0].receita).toBe(50_000);
    expect(doMatheus[0].pct).toBe(0.06);
  });

  it('mostra o que o vendedor agendou, mesmo sem pagamento ainda', () => {
    // Caso real: MATHEUS agendou e o pedido ainda não foi pago.
    const pedidos: Pedido[] = [
      pago('p1', 1000, 'PETER'),
      {
        id: 'agendado-matheus',
        status: 'cadastrados',
        data: '2026-08-10',
        valor: 683.1,
        valor_bruto: 683.1,
        valor_agendado: 683.1,
        produto_plano: 'DERMAX PREMIUM - 6 POTE',
        vendedor: 'Matheus',
      },
    ];
    const pnl = calcularPnl([], [], periodo, {}, pedidos);
    const m = pnl.comissoes_por_vendedor.find((v) => v.nome === 'Matheus')!;
    expect(m.agendado).toBe(68_310); // R$ 683,10 agendado
    expect(m.qtd_agendados).toBe(1);
    expect(m.receita).toBe(0); // ainda não pagou
    expect(m.comissao).toBe(0); // comissão só com o pagamento
  });

  it('vendedor configurado aparece com o % mesmo sem venda no período', () => {
    // MATHEUS começa 31/08: antes disso precisa aparecer zerado, com os 6%.
    const pnl = calcularPnl([], [], periodo, {}, [pago('p1', 1000, 'PETER')]);
    const matheus = pnl.comissoes_por_vendedor.find((v) => v.nome === 'MATHEUS')!;
    expect(matheus.pct).toBe(0.06);
    expect(matheus.receita).toBe(0);
    expect(matheus.comissao).toBe(0);
  });

  it('com todos no padrão, o total é o mesmo da fórmula única', () => {
    const pedidos = [pago('a', 700, 'PETER'), pago('b', 300, 'ANA')];
    const pnl = calcularPnl([daily('2026-08-10', 20)], [], periodo, {}, pedidos);
    // 5% × (1000 − 20) = R$ 49,00
    expect(pnl.comissoes_vendedor).toBe(4_900);
  });
});
