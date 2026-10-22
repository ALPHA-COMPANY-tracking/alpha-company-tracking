// ─────────────────────────────────────────────────────────────
// Agregação dos pedidos do BlueSales para o lado da RECEITA do P&L.
// Mapeamento de status → bucket. Guardamos o status cru; aqui só
// classificamos. Ajustável conforme os status reais do BlueSales.
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { diaSP, isDentro } from '@/lib/dates';
import { perdaRealDePedido, perdaSemCusto } from '@/lib/custosConfig';

/** Normaliza status: minúsculo, sem acento, sem espaços nas bordas. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Status que contam como APROVADO (dinheiro confirmado) — aba "Pagos".
// O singular entra por segurança: o backfill veio "Pagos" e o webhook manda
// "pagos", mas não custa aceitar as duas formas.
const APROVADO = new Set(['pagos', 'pago']);
// Status que contam como FRUSTRADO (pedido perdido). É a mesma conta do
// card "Frustrados" do BlueSales, conferida em 21/09/2026: setembro deu
// 5 pedidos / R$ 3.675 = Roubo (3) + Aguard. Devolução (1) + Cancelados (1).
// Só "frustrados" deixava roubo, devolução e cancelamento de fora.
// Por padrão de texto: etapa nova com uma dessas palavras já entra.
// (Negociação, Atenção, Cobrados, Enviados etc. seguem como pipeline.)
// "Voltando" entrou em 21/09/2026: o BlueSales passou a usar essa etapa
// para o pacote que está retornando (8 pedidos, a maioria dos Correios).
// Perdido, apreendido e perda de cobrança: regras do BlueSales de 30/09/2026.
const FRUSTRADO = /frustr|devol|voltand|retorn|roub|furt|extravi|sinistr|recus|cancel|perd|apreend/;

export function statusBucket(status: string | null | undefined): 'aprovado' | 'frustrado' | 'pipeline' {
  const s = norm(status);
  if (APROVADO.has(s)) return 'aprovado';
  if (FRUSTRADO.test(s)) return 'frustrado';
  return 'pipeline';
}

/**
 * Pedido cancelado não é mais venda: sai do saldo AGENDADO (Faturamento
 * Agendado, vendas do período, agendado por dia, painel do vendedor,
 * resumo do dia). O custo dele — o frete, se chegou a ser postado — continua
 * na frustração, porque esse dinheiro saiu. Decisão do Jonas em 07/10/2026.
 */
export function ehCancelado(p: Pick<Pedido, 'status'>): boolean {
  return /cancel/.test(norm(p.status));
}

/**
 * Cancelado conta no saldo agendado? SIM — igual ao BlueSales, que soma os
 * cancelados em "Vendas este mês" (conferido no export de 22/10/2026: 217
 * pedidos, 6 cancelados, todos no número). Decisão do Jonas em 22/10/2026:
 * o Faturamento Agendado bate sempre com o BlueSales, e o card "Cancelados"
 * mostra quanto disso foi cancelado. false volta a tirá-los (como de 07 a
 * 17/10 e na manhã de 22/10).
 */
export const CANCELADO_NO_AGENDADO = true;

/** O pedido fica fora do saldo agendado? (Só o cancelado, e só se a chave mandar.) */
export function foraDoAgendado(p: Pick<Pedido, 'status'>, canceladoConta = CANCELADO_NO_AGENDADO): boolean {
  return !canceladoConta && ehCancelado(p);
}

/**
 * A 2ª parcela em diante de um pedido pago em partes (planilha) entra na
 * receita? Desde 17/10/2026 NÃO: números iguais aos do BlueSales, que só
 * registra o primeiro pagamento. As parcelas continuam guardadas no pedido;
 * true volta a contá-las, cada uma no dia dela.
 */
export const PARCELAS_EXTRAS_NA_RECEITA = false;

/**
 * Tira as vendas removidas à mão (canceladas e excluídas no BlueSales).
 * TODO cálculo passa por aqui — se ficasse só na tela, o Faturamento
 * Agendado continuaria contando uma venda que não existe mais.
 */
export function pedidosAtivos(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter((p) => !p.removido_em);
}

export interface AtendenteAgg {
  nome: string;
  valor_agendado: number; // total de pedidos (pipeline inteiro)
  pedidos: number;
  receita: number; // só aprovados
  aprovados: number;
}

export interface RevenuePedidos {
  receita_aprovada: number;
  qtd_pagamentos: number;
  valor_agendado: number;
  qtd_agendados: number;
  valor_frustrado: number;
  qtd_frustrados: number;
  /** Dinheiro que de fato saiu do caixa nos frustrados (produto + frete). */
  perda_real_frustrados: number;
  /** Safra: dos agendados do PERÍODO (data de criação, os que estão no
   *  agendado), o valor dos que já frustraram — sai da margem do agendado. */
  valor_frustrado_safra: number;
  /** Cancelados agendados no período (data de criação) — o card "Cancelados". */
  qtd_cancelados: number;
  valor_cancelados: number;
  porAtendente: AtendenteAgg[];
  porMetodo: { nome: string; pedidos: number }[];
  total: number; // quantos pedidos no período (fonte real disponível?)
}

/** Dia da BAIXA da frustração (quando o pedido virou roubo, devolvido,
 *  cancelado…): é nele que a perda conta — decisão do Jonas, 22/10/2026.
 *  Sem a marca (pedido antigo, corrigido à mão), o dia em que foi feito. */
export function dataFrustracao(p: Pick<Pedido, 'data' | 'frustrado_em'>): string {
  return p.frustrado_em ? diaSP(p.frustrado_em) : p.data;
}

/** Data de pagamento do pedido (o BlueSales conta o "aprovado" por aqui).
 *  Se ainda não foi carimbada (histórico), cai na data de criação. */
export function dataAprovacaoPedido(p: Pedido): string {
  return p.data_aprovacao || p.data;
}

export interface Pagamento {
  data: string;
  valor: number;
  /** Pagamento em partes: qual parcela (1 de 2…). */
  parcela?: { n: number; de: number };
}

/**
 * Os pagamentos de um pedido pago. Com parcelas (pagamento em partes, da
 * planilha), cada uma no dia dela; senão, um só: o valor na data do
 * pagamento. Pedido não pago não tem pagamento.
 */
export function pagamentosDoPedido(p: Pedido, comParcelasExtras = PARCELAS_EXTRAS_NA_RECEITA): Pagamento[] {
  if (statusBucket(p.status) !== 'aprovado') return [];
  const parcelas = (p.parcelas ?? []).filter((x) => x && x.data && Number(x.valor) > 0);
  if (parcelas.length > 0) {
    const ordem = [...parcelas].sort((a, b) => a.data.localeCompare(b.data));
    // Como o BlueSales: só o primeiro pagamento.
    if (!comParcelasExtras) return [{ data: ordem[0].data, valor: Number(ordem[0].valor) }];
    return ordem.map((x, i) => ({ data: x.data, valor: Number(x.valor), parcela: { n: i + 1, de: ordem.length } }));
  }
  return [{ data: dataAprovacaoPedido(p), valor: Number(p.valor) || 0 }];
}

/** Agrega os pedidos de um período (lado da receita).
 *  - Agendado conta pela data de CRIAÇÃO (p.data).
 *  - Frustrado conta pelo dia da BAIXA (dataFrustracao).
 *  - Aprovado/receita conta pela data de PAGAMENTO (p.data_aprovacao ?? p.data),
 *    para bater com o "Faturamento Aprovado" do BlueSales. */
export function agregarPedidos(todos: Pedido[], periodo: Periodo): RevenuePedidos {
  const pedidos = pedidosAtivos(todos);
  const criacaoNoPeriodo = (p: Pedido) => isDentro(p.data, periodo.inicio, periodo.fim);

  let receita_aprovada = 0, qtd_pagamentos = 0;
  let valor_agendado = 0, qtd_agendados = 0;
  let valor_frustrado = 0, qtd_frustrados = 0, perda_real_frustrados = 0, valor_frustrado_safra = 0;
  let qtd_cancelados = 0, valor_cancelados = 0;
  let total = 0;

  const atendentes = new Map<string, AtendenteAgg>();
  const metodos = new Map<string, number>();
  const atendente = (nome: string) =>
    atendentes.get(nome) ?? { nome, valor_agendado: 0, pedidos: 0, receita: 0, aprovados: 0 };

  for (const p of pedidos) {
    const bucket = statusBucket(p.status);
    // Receita: o que o pedido cobra hoje (payment.amount).
    const valor = Number(p.valor) || 0;
    // Agendado: o valor de quando foi agendado. O BlueSales congela esse
    // número — desconto negociado depois muda a receita, não o agendado.
    const agendado = Number(p.valor_agendado ?? p.valor) || 0;
    const nome = p.vendedor?.trim() || 'Sem atendente';

    // Cancelados do período (card próprio): o valor do agendamento que foi anulado.
    if (criacaoNoPeriodo(p) && ehCancelado(p)) {
      qtd_cancelados += 1;
      valor_cancelados += agendado;
    }

    // Lado do AGENDADO / funil — por data de criação. Cancelado não conta.
    if (criacaoNoPeriodo(p) && !foraDoAgendado(p)) {
      valor_agendado += agendado;
      qtd_agendados += 1;
      total += 1;

      const a = atendente(nome);
      a.valor_agendado += agendado;
      a.pedidos += 1;
      atendentes.set(nome, a);

      const met = p.metodo_pagamento?.trim() || 'Outro';
      metodos.set(met, (metodos.get(met) ?? 0) + 1);
    }

    // Frustração — pelo dia da BAIXA (o roubo de um pedido de agosto dado
    // em outubro é perda de outubro), cancelado incluído (o frete de quem
    // saiu foi gasto). Recusado, cancelado sem custo / que não saiu e
    // frustrado não postado não entram (não geraram custo) — como no BlueSales.
    if (bucket === 'frustrado') {
      if (!perdaSemCusto(p) && isDentro(dataFrustracao(p), periodo.inicio, periodo.fim)) {
        valor_frustrado += valor;
        qtd_frustrados += 1;
        perda_real_frustrados += perdaRealDePedido(p);
      }
      // Safra: não vai ser pago, tenha custo ou não (o cancelado que nem
      // saiu também está no agendado) — sai da margem do agendado.
      if (criacaoNoPeriodo(p) && !foraDoAgendado(p)) valor_frustrado_safra += agendado;
    }

    // Lado da RECEITA APROVADA — por data de pagamento (cada parcela no
    // dia dela, quando o pedido foi pago em partes).
    for (const pg of pagamentosDoPedido(p)) {
      if (!isDentro(pg.data, periodo.inicio, periodo.fim)) continue;
      receita_aprovada += pg.valor;
      qtd_pagamentos += 1;

      const a = atendente(nome);
      a.receita += pg.valor;
      a.aprovados += 1;
      atendentes.set(nome, a);
    }
  }

  return {
    receita_aprovada,
    qtd_pagamentos,
    valor_agendado,
    qtd_agendados,
    valor_frustrado,
    qtd_frustrados,
    perda_real_frustrados,
    valor_frustrado_safra,
    qtd_cancelados,
    valor_cancelados,
    porAtendente: [...atendentes.values()].sort((a, b) => b.valor_agendado - a.valor_agendado),
    porMetodo: [...metodos.entries()].map(([nome, pedidos]) => ({ nome, pedidos })).sort((a, b) => b.pedidos - a.pedidos),
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// Conferência com o BlueSales. Quando uma venda é excluída lá, nenhum
// evento chega — ela fica presa aqui e infla o Faturamento Agendado.
// Procurar à mão entre centenas de pedidos não dá; estas duas funções
// apontam onde olhar.
// ─────────────────────────────────────────────────────────────

/** Nome do cliente comparável: sem acento, minúsculo, espaços únicos. */
export function nomeComparavel(nome: string | null | undefined): string {
  return norm(nome).replace(/\s+/g, ' ');
}

/**
 * A venda casa com o que foi digitado na busca? Aceita parte do nome
 * (sem ligar para acento/maiúscula), o #número do BlueSales ou o código BLV.
 */
export function casaComBusca(p: Pedido, busca: string): boolean {
  const termo = nomeComparavel(busca);
  if (!termo) return true;
  const numero = termo.replace(/^#/, '');
  return (
    nomeComparavel(p.cliente).includes(termo) ||
    (/^\d+$/.test(numero) && String(p.internal_id ?? '') === numero) ||
    nomeComparavel(p.id).includes(termo)
  );
}

/**
 * Clientes com mais de um pedido ativo CRIADO NO PERÍODO. É o caso típico
 * de venda refeita: o vendedor cria de novo (outro plano, outro valor) e
 * exclui a antiga no BlueSales — que continua aqui.
 *
 * Só pedidos do período: o que sobra no agendado está nele. Com pedidos de
 * fora, uma recompra legítima (frustrado em agosto, nova venda paga em
 * setembro) aparecia como duplicado — foi o caso da Adelia em 18/09/2026,
 * apagado por engano. Recompra dentro do período ainda aparece; a tela
 * avisa quando o grupo tem frustrado.
 */
export function possiveisDuplicados(todos: Pedido[], periodo: Periodo): Pedido[][] {
  const grupos = new Map<string, Pedido[]>();
  for (const p of pedidosAtivos(todos)) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim) || foraDoAgendado(p)) continue;
    const chave = nomeComparavel(p.cliente);
    if (chave.length < 4) continue; // sem nome não dá para casar
    const g = grupos.get(chave);
    if (g) g.push(p);
    else grupos.set(chave, [p]);
  }
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => a.data.localeCompare(b.data) || (a.internal_id ?? 0) - (b.internal_id ?? 0)))
    .sort((a, b) => b[b.length - 1].data.localeCompare(a[a.length - 1].data));
}

export interface AgendadoDoDia {
  data: string;
  qtd: number;
  valor: number;
}

/**
 * Agendado de cada dia do período (mesma regra do Faturamento Agendado:
 * data de criação, valor do agendamento). Comparando com o gráfico do
 * BlueSales, o dia que não bate diz onde está a venda a mais.
 */
export function agendadoPorDia(todos: Pedido[], periodo: Periodo): AgendadoDoDia[] {
  const dias = new Map<string, AgendadoDoDia>();
  for (const p of pedidosAtivos(todos)) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim) || foraDoAgendado(p)) continue;
    const d = dias.get(p.data) ?? { data: p.data, qtd: 0, valor: 0 };
    d.qtd += 1;
    d.valor += Number(p.valor_agendado ?? p.valor) || 0;
    dias.set(p.data, d);
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}

export interface PagoNoDia extends Pagamento {
  pedido: Pedido;
}

export interface PagosDoDia {
  /** Dia do pagamento. */
  data: string;
  total: number;
  /** Um por pagamento (o pedido pago em partes aparece no dia de cada parcela). */
  pagamentos: PagoNoDia[];
}

/**
 * Vendas Aprovadas: o que foi pago no período, por dia de PAGAMENTO (mais
 * recente primeiro). A mesma regra da Receita Aprovada — os totais batem
 * com a Demonstração de Resultados.
 */
export function vendasAprovadasPorDia(todos: Pedido[], periodo: Periodo): PagosDoDia[] {
  const dias = new Map<string, PagosDoDia>();
  for (const p of pedidosAtivos(todos)) {
    for (const pg of pagamentosDoPedido(p)) {
      if (!isDentro(pg.data, periodo.inicio, periodo.fim)) continue;
      const d = dias.get(pg.data) ?? { data: pg.data, total: 0, pagamentos: [] };
      d.total += pg.valor;
      d.pagamentos.push({ ...pg, pedido: p });
      dias.set(pg.data, d);
    }
  }
  for (const d of dias.values()) {
    d.pagamentos.sort((a, b) => (b.pedido.internal_id ?? 0) - (a.pedido.internal_id ?? 0) || a.pedido.id.localeCompare(b.pedido.id));
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}

/** "pix" → "PIX", "boleto" → "Boleto", "credit_card" → "Cartão". */
export function rotuloMetodo(metodo: string | null | undefined): string {
  const m = norm(metodo);
  if (!m) return 'Não informado';
  if (/pix/.test(m)) return 'PIX';
  if (/boleto/.test(m)) return 'Boleto';
  if (/cart|card|credit|credito|debit/.test(m)) return 'Cartão';
  return m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ');
}
