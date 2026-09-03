// ─────────────────────────────────────────────────────────────
// Ranking de vendedores. Tudo sai dos pedidos reais do BlueSales —
// nada é lançado à mão aqui.
//
// Duas datas diferentes, de propósito (mesma regra do P&L):
//   • agendado e frustrado contam pela data de CRIAÇÃO do pedido
//   • aprovado conta pela data do PAGAMENTO
// Um pedido agendado em 01/09 e pago em 03/09 entra como agendamento
// do dia 01 e como receita do dia 03.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { agregarPedidos, dataAprovacaoPedido, pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { COMISSAO_POR_VENDEDOR, comissaoDoVendedor } from '@/lib/custosConfig';
import { comissaoVendedores } from '@/lib/pnl';
import { taxasDoPeriodo } from '@/lib/taxas';
import { periodoDoPreset } from '@/lib/periodo';
import type { PresetPeriodo } from '@/lib/periodo';

/** Por qual número o ranking é ordenado. */
export type MetricaRanking = 'agendado' | 'aprovado' | 'qtd_agendados';

export const METRICAS: { id: MetricaRanking; label: string; curto: string }[] = [
  { id: 'agendado', label: 'Faturamento agendado', curto: 'Agendado' },
  { id: 'aprovado', label: 'Faturamento aprovado', curto: 'Aprovado' },
  { id: 'qtd_agendados', label: 'Quantidade de agendamentos', curto: 'Pedidos' },
];

export interface LinhaRanking {
  nome: string;
  /** Percentual de comissão combinado com ele. */
  pct: number;

  /** O que ele agendou no período (data de criação). */
  agendado: Cents;
  qtd_agendados: number;

  /** O que foi pago no período e é dele (data de pagamento). */
  aprovado: Cents;
  qtd_aprovados: number;

  /** O que ele agendou no período e frustrou. */
  frustrado: Cents;
  qtd_frustrados: number;

  /** Dos pedidos que ELE agendou no período, quantos já foram pagos.
   *  Mede a qualidade da venda dele, não o caixa do período. */
  qtd_agendados_pagos: number;
  conversao: number;

  /** Ticket médio do que ele agendou. */
  ticket_medio: Cents;

  /** Comissão dele no período — mesma conta do P&L. */
  comissao: Cents;
}

/** Normaliza o nome: o BlueSales manda "Matheus", "MATHEUS " e "Matheus ". */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

function nomeDe(p: Pedido): string {
  return (p.vendedor ?? '').trim() || 'Sem atendente';
}

export function valorDaMetrica(l: LinhaRanking, m: MetricaRanking): number {
  if (m === 'agendado') return l.agendado;
  if (m === 'aprovado') return l.aprovado;
  return l.qtd_agendados;
}

/**
 * Ranking do período, já ordenado pela métrica escolhida.
 *
 * A comissão vem de `comissaoVendedores` (o mesmo código do P&L) para
 * não haver chance de esta tela mostrar um número e a Demonstração de
 * Resultados mostrar outro.
 */
export function rankingVendedores(
  pedidos: Pedido[],
  dailies: AfterpayDaily[],
  periodo: Periodo,
  metrica: MetricaRanking = 'agendado',
): LinhaRanking[] {
  const ativos = pedidosAtivos(pedidos);

  type Acc = Omit<LinhaRanking, 'pct' | 'conversao' | 'ticket_medio' | 'comissao'>;
  const porPessoa = new Map<string, Acc>();

  const pegar = (nome: string): Acc => {
    const k = chave(nome);
    let a = porPessoa.get(k);
    if (!a) {
      a = {
        nome,
        agendado: 0,
        qtd_agendados: 0,
        aprovado: 0,
        qtd_aprovados: 0,
        frustrado: 0,
        qtd_frustrados: 0,
        qtd_agendados_pagos: 0,
      };
      porPessoa.set(k, a);
    }
    return a;
  };

  for (const p of ativos) {
    const a = pegar(nomeDe(p));
    const bucket = statusBucket(p.status);
    const criadoNoPeriodo = isDentro(p.data, periodo.inicio, periodo.fim);
    const pagoNoPeriodo = isDentro(dataAprovacaoPedido(p), periodo.inicio, periodo.fim);

    if (criadoNoPeriodo) {
      const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
      if (bucket === 'frustrado') {
        a.frustrado += valor;
        a.qtd_frustrados++;
      } else {
        a.agendado += valor;
        a.qtd_agendados++;
        if (bucket === 'aprovado') a.qtd_agendados_pagos++;
      }
    }

    if (bucket === 'aprovado' && pagoNoPeriodo) {
      a.aprovado += reaisToCents(Number(p.valor) || 0);
      a.qtd_aprovados++;
    }
  }

  // Quem tem comissão combinada aparece mesmo sem venda no período: some
  // da lista seria pior do que aparecer zerado.
  for (const nome of Object.keys(COMISSAO_POR_VENDEDOR)) pegar(nome);

  // Comissão pelo mesmo caminho do P&L.
  const agg = agregarPedidos(pedidos, periodo);
  const receitaTotal = reaisToCents(agg.receita_aprovada);
  const taxas = taxasDoPeriodo(pedidos, dailies, periodo);
  const comissoes = new Map(
    comissaoVendedores(agg.porAtendente, receitaTotal, taxas).map((c) => [chave(c.nome), c.comissao]),
  );

  const linhas: LinhaRanking[] = [...porPessoa.entries()].map(([k, a]) => ({
    ...a,
    pct: comissaoDoVendedor(a.nome),
    conversao: safeDiv(a.qtd_agendados_pagos, a.qtd_agendados),
    ticket_medio: a.qtd_agendados > 0 ? Math.round(a.agendado / a.qtd_agendados) : 0,
    comissao: comissoes.get(k) ?? 0,
  }));

  return ordenar(linhas, metrica);
}

export function ordenar(linhas: LinhaRanking[], metrica: MetricaRanking): LinhaRanking[] {
  // Desempate: quem agendou mais valor, depois quem agendou mais pedidos,
  // e por último o nome — para a ordem nunca oscilar entre renders.
  return [...linhas].sort(
    (a, b) =>
      valorDaMetrica(b, metrica) - valorDaMetrica(a, metrica) ||
      b.agendado - a.agendado ||
      b.qtd_agendados - a.qtd_agendados ||
      a.nome.localeCompare(b.nome),
  );
}

/** Os períodos comparados lado a lado na tela. */
export const PERIODOS_RANKING: { preset: PresetPeriodo; label: string }[] = [
  { preset: 'hoje', label: 'Hoje' },
  { preset: 'ontem', label: 'Ontem' },
  { preset: '7d', label: '7 dias' },
  { preset: '30d', label: '30 dias' },
  { preset: 'mes_atual', label: 'Este mês' },
  { preset: 'mes_passado', label: 'Mês passado' },
];

export interface ColunaComparativo {
  label: string;
  /** Nome (normalizado) → posição no ranking, 1 = primeiro. */
  posicao: Map<string, number>;
  /** Nome (normalizado) → valor da métrica naquele período. */
  valor: Map<string, number>;
}

/**
 * Posição de cada vendedor em cada período, para ver a evolução sem
 * ficar trocando o filtro do topo.
 */
export function comparativoPorPeriodo(
  pedidos: Pedido[],
  dailies: AfterpayDaily[],
  metrica: MetricaRanking,
  hoje?: string,
): ColunaComparativo[] {
  return PERIODOS_RANKING.map(({ preset, label }) => {
    const p = hoje ? periodoDoPreset(preset, hoje) : periodoDoPreset(preset);
    const linhas = rankingVendedores(pedidos, dailies, p, metrica);
    const posicao = new Map<string, number>();
    const valor = new Map<string, number>();
    let lugar = 0;
    for (const l of linhas) {
      const v = valorDaMetrica(l, metrica);
      valor.set(chave(l.nome), v);
      // Quem não vendeu no período não recebe posição: ficaria "3º lugar"
      // com zero, o que não quer dizer nada.
      if (v > 0) posicao.set(chave(l.nome), ++lugar);
    }
    return { label, posicao, valor };
  });
}

export { chave as chaveVendedor };
