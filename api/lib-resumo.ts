// ─────────────────────────────────────────────────────────────
// Resumo do dia para a notificação: agendado, aprovado, lucro e ROAS.
// Mesmas regras do P&L da tela (ver src/lib/pnl.ts).
// ─────────────────────────────────────────────────────────────

import { COMISSAO_COBRANCA, FRETE_POR_PEDIDO, comissaoDoVendedor, custoProdutoDoPlano, ehPago } from './lib-custos.js';

export interface ResumoDia {
  data: string;
  valor_agendado: number;
  qtd_agendados: number;
  receita: number;
  qtd_pagamentos: number;
  ads: number;
  lucro: number;
  roas: number;
}

interface LinhaPedido {
  status: string | null;
  data: string;
  data_aprovacao: string | null;
  valor: number | null;
  valor_agendado: number | null;
  produto_plano: string | null;
  vendedor: string | null;
}

/** Data de hoje no fuso de São Paulo, no formato YYYY-MM-DD. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Monta o resumo de um dia.
 * - agendado: pedidos criados no dia (valor do agendamento)
 * - receita: pedidos pagos no dia (por data de pagamento)
 * - lucro: receita − (taxas + produto + frete + comissões + ads)
 */
export function montarResumo(
  dia: string,
  pedidos: LinhaPedido[],
  ads: number,
  taxaPlataforma: number,
): ResumoDia {
  let valor_agendado = 0;
  let qtd_agendados = 0;
  let receita = 0;
  let qtd_pagamentos = 0;
  let custoProdutos = 0;
  let frete = 0;
  const receitaPorVendedor = new Map<string, number>();

  for (const p of pedidos) {
    if (p.data === dia) {
      valor_agendado += Number(p.valor_agendado ?? p.valor ?? 0);
      qtd_agendados++;
    }
    if (ehPago(p.status) && (p.data_aprovacao ?? p.data) === dia) {
      const v = Number(p.valor ?? 0);
      receita += v;
      qtd_pagamentos++;
      custoProdutos += custoProdutoDoPlano(p.produto_plano);
      frete += FRETE_POR_PEDIDO;
      const nome = (p.vendedor ?? '').trim() || 'Sem atendente';
      receitaPorVendedor.set(nome, (receitaPorVendedor.get(nome) ?? 0) + v);
    }
  }

  // Comissão por vendedor, sobre a receita dele menos a parte proporcional
  // das taxas — igual ao P&L da tela.
  let comissaoVendedor = 0;
  for (const [nome, rec] of receitaPorVendedor) {
    const taxaDele = receita > 0 ? (taxaPlataforma * rec) / receita : 0;
    comissaoVendedor += (rec - taxaDele) * comissaoDoVendedor(nome);
  }
  const comissaoCobranca = receita * COMISSAO_COBRANCA;

  const custos = taxaPlataforma + custoProdutos + frete + comissaoVendedor + comissaoCobranca + ads;
  const lucro = receita - custos;

  return {
    data: dia,
    valor_agendado: arredondar(valor_agendado),
    qtd_agendados,
    receita: arredondar(receita),
    qtd_pagamentos,
    ads: arredondar(ads),
    lucro: arredondar(lucro),
    roas: ads > 0 ? receita / ads : 0,
  };
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Texto da notificação de resumo. `final` muda o tom da mensagem. */
export function avisoDoResumo(r: ResumoDia, final: boolean): { titulo: string; corpo: string; tag: string } {
  const sinal = r.lucro >= 0 ? '📈' : '📉';
  const roas = r.roas > 0 ? `${r.roas.toFixed(2).replace('.', ',')}x` : '—';

  const partes = [
    `Agendado ${brl(r.valor_agendado)} (${r.qtd_agendados})`,
    `Aprovado ${brl(r.receita)} (${r.qtd_pagamentos})`,
    `ROAS ${roas}`,
  ];

  return {
    titulo: final
      ? `${sinal} Fechamento do dia · ${brl(r.lucro)}`
      : `${sinal} Parcial de hoje · ${brl(r.lucro)}`,
    corpo: partes.join(' · '),
    // tags diferentes: o parcial se substitui, o fechamento fica separado
    tag: final ? 'resumo-final' : 'resumo-parcial',
  };
}

// Este arquivo existe em /api só porque a Vercel empacota apenas o que
// está aqui dentro. Não é uma rota de verdade: responde 404.
export default function handler(_req: unknown, res: { status: (n: number) => { end: () => void } }) {
  res.status(404).end();
}
