// ─────────────────────────────────────────────────────────────
// Indicadores da operação (tela Visualização).
//
// Três leituras diferentes, cada uma com a sua base — misturar é o que
// faz número "bonito" e errado:
//
//   · Anúncio ÷ venda (CPA, ROAS): o gasto do período contra o que o
//     período agendou ou recebeu. Mesmas regras da Demonstração.
//   · Safra: os pedidos AGENDADOS no período e onde cada um está hoje —
//     pago, em aberto ou em frustração (frustrado, devolvido, roubo…).
//     É daqui que saem "% pagos" e "% de frustração".
//   · Projeção: o lucro real de hoje + o que a safra em aberto ainda deve
//     render, na taxa de recebimento que a operação já mostrou.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { pedidosAtivos, statusBucket } from '@/lib/pedidos';
import {
  COMISSAO_COBRANCA,
  comissaoDoVendedor,
  custoProdutoDoPlano,
  FRETE_POR_PEDIDO,
  perdaRealDePedido,
} from '@/lib/custosConfig';

export type Situacao = 'pago' | 'aberto' | 'frustracao';

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Tudo que é frustração da operação: frustrado, devolvido, aguardando
 * devolução, roubo/furto, extravio, sinistro, recusado. Por padrão de
 * texto: status novo do BlueSales com uma dessas palavras já entra.
 * (Negociação, Requer atenção, Entregues, Cobrados seguem EM ABERTO: o
 * pedido ainda pode ser pago.)
 */
const FRUSTRACAO = /frustr|devol|roub|furt|extravi|sinistr|recus/;

export function situacaoDoPedido(status: string | null | undefined): Situacao {
  if (statusBucket(status) === 'aprovado') return 'pago';
  return FRUSTRACAO.test(norm(status)) ? 'frustracao' : 'aberto';
}

/** Nome do status para a tela: "aguardando_devolucao" → "Aguardando devolucao". */
function rotuloStatus(status: string): string {
  const s = norm(status);
  if (s === 'frustrados' || s === 'frustrado') return 'Frustrado';
  if (s === 'devolvido' || s === 'devolvidos') return 'Devolvido';
  if (s === 'aguardando_devolucao') return 'Aguardando devolução';
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface Fatia {
  qtd: number;
  /** Valor do agendamento (o que o pedido vale). */
  valor: Cents;
}

export interface FrustracaoPorStatus {
  status: string;
  rotulo: string;
  qtd: number;
  valor: Cents;
  /** Dinheiro que saiu: produto + frete (ou o ajuste da tela Frustrados). */
  perda: Cents;
}

export interface Projecao {
  /** Lucro real do período — o mesmo número da Demonstração de Resultados. */
  lucro_real: Cents;
  /** Produto + frete dos pedidos da safra que já frustraram. */
  perda_frustracao: Cents;
  /** Em aberto: valor e quantidade. */
  aberto: Fatia;
  /** Dos pedidos que já se resolveram, quantos % pagaram. */
  taxa_recebimento: number;
  /** Quantos pedidos resolvidos sustentam a taxa. */
  base_taxa: number;
  /** Em aberto × taxa de recebimento. */
  a_receber: Cents;
  /** Comissões (vendedor + cobrança) sobre o que deve ser recebido. */
  comissoes: Cents;
  /** Produto + frete dos pedidos em aberto — já enviados, já pagos. */
  envio_aberto: Cents;
  lucro_projetado: Cents;
}

export interface Indicadores {
  investimento_ads: Cents;
  receita_aprovada: Cents;
  qtd_pagamentos: number;
  valor_agendado: Cents;
  qtd_agendados: number;

  /** O que de fato se recebe por pagamento: aprovado ÷ pagamentos. */
  ticket_medio_real: Cents;
  /** Valor médio de um agendamento. */
  ticket_agendado: Cents;
  /** Anúncio ÷ agendamentos. */
  cpa_agendamento: Cents;
  /** Anúncio ÷ pagamentos. */
  cpa_pago: Cents;
  /** Agendado ÷ anúncio. */
  roas_agendado: number;
  /** Aprovado ÷ anúncio. */
  roas_aprovado: number;

  /** Onde está hoje cada pedido agendado no período. */
  safra: Record<Situacao, Fatia>;
  pct_pagos: number;
  pct_aberto: number;
  pct_frustracao: number;
  frustracao_por_status: FrustracaoPorStatus[];

  projecao: Projecao;
}

export function calcularIndicadores(
  dailies: AfterpayDaily[],
  custos: CustoVariavel[],
  pedidos: Pedido[],
  periodo: Periodo,
): Indicadores {
  // O P&L de sempre (espelho do BlueSales): anúncio, agendado, aprovado.
  const pnl = calcularPnl(dailies, custos, periodo, {}, pedidos);
  const ads = pnl.investimento_ads;
  const ativos = pedidosAtivos(pedidos);

  // ── Safra do período ──
  const safra: Record<Situacao, Fatia> = {
    pago: { qtd: 0, valor: 0 },
    aberto: { qtd: 0, valor: 0 },
    frustracao: { qtd: 0, valor: 0 },
  };
  const porStatus = new Map<string, FrustracaoPorStatus>();
  let envio_aberto = 0;
  let comissaoCheia = 0; // comissões se TODO o aberto for pago
  for (const p of ativos) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim)) continue;
    const situacao = situacaoDoPedido(p.status);
    const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    safra[situacao].qtd += 1;
    safra[situacao].valor += valor;

    if (situacao === 'frustracao') {
      const chave = norm(p.status);
      const s = porStatus.get(chave) ?? { status: chave, rotulo: rotuloStatus(chave), qtd: 0, valor: 0, perda: 0 };
      s.qtd += 1;
      s.valor += valor;
      s.perda += reaisToCents(perdaRealDePedido(p));
      porStatus.set(chave, s);
    } else if (situacao === 'aberto') {
      envio_aberto += reaisToCents(custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO);
      comissaoCheia += Math.round(valor * (comissaoDoVendedor(p.vendedor) + COMISSAO_COBRANCA));
    }
  }
  const totalSafra = safra.pago.qtd + safra.aberto.qtd + safra.frustracao.qtd;
  const frustracao_por_status = [...porStatus.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);

  // ── Taxa de recebimento: dos pedidos já resolvidos até o fim do período,
  // quantos pagaram. Os em aberto ficam fora: ainda não disseram nada.
  let resolvidosPagos = 0;
  let resolvidos = 0;
  for (const p of ativos) {
    if (p.data > periodo.fim) continue;
    const situacao = situacaoDoPedido(p.status);
    if (situacao === 'aberto') continue;
    resolvidos += 1;
    if (situacao === 'pago') resolvidosPagos += 1;
  }
  const taxa_recebimento = safeDiv(resolvidosPagos, resolvidos);

  // ── Projeção ──
  // Cada pedido em aberto já foi enviado: produto e frete saíram do caixa
  // de qualquer jeito. A receita (e a comissão sobre ela) só vem se pagar.
  const a_receber = Math.round(safra.aberto.valor * taxa_recebimento);
  const comissoes = Math.round(comissaoCheia * taxa_recebimento);
  const perda_frustracao = frustracao_por_status.reduce((s, f) => s + f.perda, 0);
  const lucro_projetado = pnl.lucro_real - perda_frustracao + a_receber - comissoes - envio_aberto;

  return {
    investimento_ads: ads,
    receita_aprovada: pnl.receita_aprovada,
    qtd_pagamentos: pnl.qtd_pagamentos,
    valor_agendado: pnl.valor_agendado,
    qtd_agendados: pnl.qtd_agendados,

    ticket_medio_real: pnl.ticket_medio,
    ticket_agendado: pnl.qtd_agendados ? Math.round(pnl.valor_agendado / pnl.qtd_agendados) : 0,
    cpa_agendamento: pnl.cpa,
    cpa_pago: pnl.qtd_pagamentos ? Math.round(ads / pnl.qtd_pagamentos) : 0,
    roas_agendado: pnl.roas,
    roas_aprovado: safeDiv(pnl.receita_aprovada, ads),

    safra,
    pct_pagos: safeDiv(safra.pago.qtd, totalSafra),
    pct_aberto: safeDiv(safra.aberto.qtd, totalSafra),
    pct_frustracao: safeDiv(safra.frustracao.qtd, totalSafra),
    frustracao_por_status,

    projecao: {
      lucro_real: pnl.lucro_real,
      perda_frustracao,
      aberto: safra.aberto,
      taxa_recebimento,
      base_taxa: resolvidos,
      a_receber,
      comissoes,
      envio_aberto,
      lucro_projetado,
    },
  };
}
