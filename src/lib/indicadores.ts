// ─────────────────────────────────────────────────────────────
// Indicadores da operação (tela Visualização). Só dados do banco.
//
//   · Pagos: os PAGAMENTOS do período (data do pagamento) — os mesmos
//     números do card "Pagamentos aprovados" da Demonstração. Incluem
//     pedidos agendados antes do período e pagos dentro dele.
//   · Anúncio ÷ venda (CPA, ROAS): o gasto do período contra o que o
//     período agendou ou recebeu. Mesmas regras da Demonstração.
//   · Situação dos agendados do período: em rota, aguardando pagamento,
//     negociação/atenção e frustração (frustrado, devolvido, roubo…).
//   · Projeção: o lucro real de hoje + o que os pedidos EM ROTA devem
//     render. Negociação, frustrado e cobrança parada não entram.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CustoVariavel, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { dataAprovacaoPedido, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import {
  COMISSAO_COBRANCA,
  comissaoDoVendedor,
  custoProdutoDoPlano,
  FRETE_POR_PEDIDO,
  perdaRealDePedido,
} from '@/lib/custosConfig';

export type Situacao = 'pago' | 'rota' | 'aguardando' | 'negociacao' | 'frustracao';

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Por padrão de texto: status novo do BlueSales com uma dessas palavras
// já cai no grupo certo. A ordem importa — frustração primeiro.
const FRUSTRACAO = /frustr|devol|roub|furt|extravi|sinistr|recus/;
const NEGOCIACAO = /negocia|atencao/;
const AGUARDANDO = /entregue|cobrad/;

/**
 * Onde o pedido está:
 *   rota        → cadastrado, aguardando coleta, enviado, saiu para
 *                 entrega, retirar nos correios: a caminho do cliente
 *   aguardando  → entregue / cobrado: chegou, falta pagar
 *   negociacao  → negociação, requer atenção: travado, sem previsão
 *   frustracao  → frustrado, devolvido, aguardando devolução, roubo…
 */
export function situacaoDoPedido(status: string | null | undefined): Situacao {
  if (statusBucket(status) === 'aprovado') return 'pago';
  const s = norm(status);
  if (FRUSTRACAO.test(s)) return 'frustracao';
  if (NEGOCIACAO.test(s)) return 'negociacao';
  if (AGUARDANDO.test(s)) return 'aguardando';
  return 'rota';
}

/** Nome do status para a tela: "aguardando_devolucao" → "Aguardando devolução". */
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
  /** Produto + frete dos agendados do período que já frustraram. */
  perda_frustracao: Cents;
  /** Pedidos em rota: valor e quantidade. */
  rota: Fatia;
  /** Dos pedidos que já se resolveram (pago ou frustração), quantos % pagaram. */
  taxa_recebimento: number;
  /** Quantos pedidos resolvidos sustentam a taxa. */
  base_taxa: number;
  /** Em rota × taxa de recebimento. */
  a_receber: Cents;
  /** Comissões (vendedor + cobrança) sobre o que deve ser recebido. */
  comissoes: Cents;
  /** Produto + frete dos pedidos em rota. */
  envio_rota: Cents;
  lucro_projetado: Cents;
}

export interface Indicadores {
  investimento_ads: Cents;
  /** Pagamentos do período (data do pagamento). */
  receita_aprovada: Cents;
  qtd_pagamentos: number;
  /** Desses pagamentos, quantos são de pedidos agendados no próprio período. */
  pagos_da_safra: number;
  valor_agendado: Cents;
  qtd_agendados: number;

  /** O que de fato se recebe por pagamento: aprovado ÷ pagamentos. */
  ticket_medio_real: Cents;
  /** Valor médio de um agendamento. */
  ticket_agendado: Cents;
  cpa_agendamento: Cents;
  cpa_pago: Cents;
  roas_agendado: number;
  roas_aprovado: number;
  /** Pagamentos do período ÷ agendamentos do período. */
  pct_pagos: number;

  /** Onde está hoje cada pedido agendado no período. */
  situacao: Record<Situacao, Fatia>;
  /** Frustração dos agendados do período ÷ agendados do período. */
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

  // ── Situação dos agendados do período ──
  const situacao: Record<Situacao, Fatia> = {
    pago: { qtd: 0, valor: 0 },
    rota: { qtd: 0, valor: 0 },
    aguardando: { qtd: 0, valor: 0 },
    negociacao: { qtd: 0, valor: 0 },
    frustracao: { qtd: 0, valor: 0 },
  };
  const porStatus = new Map<string, FrustracaoPorStatus>();
  let envio_rota = 0;
  let comissaoCheia = 0; // comissões se TODO pedido em rota for pago
  for (const p of ativos) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim)) continue;
    const s = situacaoDoPedido(p.status);
    const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    situacao[s].qtd += 1;
    situacao[s].valor += valor;

    if (s === 'frustracao') {
      const chave = norm(p.status);
      const f = porStatus.get(chave) ?? { status: chave, rotulo: rotuloStatus(chave), qtd: 0, valor: 0, perda: 0 };
      f.qtd += 1;
      f.valor += valor;
      f.perda += reaisToCents(perdaRealDePedido(p));
      porStatus.set(chave, f);
    } else if (s === 'rota') {
      envio_rota += reaisToCents(custoProdutoDoPlano(p.produto_plano) + FRETE_POR_PEDIDO);
      comissaoCheia += Math.round(valor * (comissaoDoVendedor(p.vendedor) + COMISSAO_COBRANCA));
    }
  }
  const frustracao_por_status = [...porStatus.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);

  // Dos pagamentos do período, quantos são de pedidos agendados nele
  // (o resto é venda de antes que pagou agora).
  const pagos_da_safra = ativos.filter(
    (p) =>
      statusBucket(p.status) === 'aprovado' &&
      isDentro(p.data, periodo.inicio, periodo.fim) &&
      isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim),
  ).length;

  // ── Taxa de recebimento: dos pedidos já resolvidos até o fim do período,
  // quantos pagaram. O que ainda não se resolveu não diz nada.
  let resolvidosPagos = 0;
  let resolvidos = 0;
  for (const p of ativos) {
    if (p.data > periodo.fim) continue;
    const s = situacaoDoPedido(p.status);
    if (s === 'pago') resolvidosPagos += 1;
    if (s === 'pago' || s === 'frustracao') resolvidos += 1;
  }
  const taxa_recebimento = safeDiv(resolvidosPagos, resolvidos);

  // ── Projeção: só os pedidos EM ROTA ──
  // A receita (e a comissão sobre ela) só vem se pagar; produto e frete
  // saem de qualquer jeito.
  const a_receber = Math.round(situacao.rota.valor * taxa_recebimento);
  const comissoes = Math.round(comissaoCheia * taxa_recebimento);
  const perda_frustracao = frustracao_por_status.reduce((s, f) => s + f.perda, 0);
  const lucro_projetado = pnl.lucro_real - perda_frustracao + a_receber - comissoes - envio_rota;

  return {
    investimento_ads: ads,
    receita_aprovada: pnl.receita_aprovada,
    qtd_pagamentos: pnl.qtd_pagamentos,
    pagos_da_safra,
    valor_agendado: pnl.valor_agendado,
    qtd_agendados: pnl.qtd_agendados,

    ticket_medio_real: pnl.ticket_medio,
    ticket_agendado: pnl.qtd_agendados ? Math.round(pnl.valor_agendado / pnl.qtd_agendados) : 0,
    cpa_agendamento: pnl.cpa,
    cpa_pago: pnl.qtd_pagamentos ? Math.round(ads / pnl.qtd_pagamentos) : 0,
    roas_agendado: pnl.roas,
    roas_aprovado: safeDiv(pnl.receita_aprovada, ads),
    pct_pagos: safeDiv(pnl.qtd_pagamentos, pnl.qtd_agendados),

    situacao,
    pct_frustracao: safeDiv(situacao.frustracao.qtd, pnl.qtd_agendados),
    frustracao_por_status,

    projecao: {
      lucro_real: pnl.lucro_real,
      perda_frustracao,
      rota: situacao.rota,
      taxa_recebimento,
      base_taxa: resolvidos,
      a_receber,
      comissoes,
      envio_rota,
      lucro_projetado,
    },
  };
}
