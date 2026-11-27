// ─────────────────────────────────────────────────────────────
// Conferência com o export do BlueSales ("pedidos_todas_as_etapas_….csv").
//
// O BlueSales não tem API e NÃO avisa quando um pedido é apagado: o pedido
// fica aqui, inflando o agendado. O export é a foto completa — comparando
// pedido por pedido, a dashboard volta a bater sozinha (pedido do Jonas,
// 15/11/2026). As mesmas regras das conferências por SQL de 22/10 a 12/11:
//   • está aqui e não lá → lixeira (menos pago e o que chegou depois do export)
//   • está lá e na lixeira aqui → volta
//   • valor diferente → o de lá (valor − desconto), menos pago
//   • recusado / aguardando pagamento / cancelado → a etapa de lá
// O que não dá para decidir sozinho vira aviso, sem mexer: pagamentos (a
// planilha é a verdade), pedido que nunca chegou pelo aviso (o "Vendas" do
// BlueSales só conta depois de confirmado) e etapa que não se conhece.
// A DATA não muda: o export traz a do cadastro, o card do BlueSales conta a
// da confirmação (#4605, 14/11/2026).
//
// Do arquivo só saem número, código, etapa, valor, desconto e datas.
// ─────────────────────────────────────────────────────────────

import type { IsoDate, Pedido, Periodo } from '@/types';
import { lerCsvBluesales, numeroDoPedido } from '@/lib/csvBluesales';
import { CANCELADO_NO_AGENDADO, aguardaPagamento, ehCancelado, ehRecusado, foraDoAgendado, statusBucket } from '@/lib/pedidos';
import { isDentro } from '@/lib/dates';

export interface PedidoDoExport {
  numero: number;
  codigo: string;
  etapa: string;
  /** Valor − desconto: o que o "Vendas" do BlueSales soma. */
  valor: number;
  data: IsoDate;
  pago_em: IsoDate | null;
  /** "Afterpay" / "Antecipado" ('' se o export não tiver a coluna). */
  tipo: string;
}

const reais = (s: unknown) => Number(String(s ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const centavos = (v: number) => Math.round(v * 100);

/** 'DD/MM/YYYY, HH:MM:SS' → 'YYYY-MM-DD' (null se vazio). */
function dataDe(s: unknown): IsoDate | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Lê o export. Erro claro se não for o "todas as etapas" do BlueSales. */
export function lerExportBlueSales(texto: string): PedidoDoExport[] {
  const { linhas, coluna } = lerCsvBluesales(texto);
  const i = {
    numero: coluna('id'),
    codigo: coluna('codigo'),
    etapa: coluna('etapa'),
    valor: coluna('valor'),
    desconto: coluna('desconto'),
    data: coluna('data pedido'),
    pago: coluna('pago em'),
    tipo: coluna('tipo de venda'),
  };
  const faltam = Object.entries(i)
    .filter(([k, v]) => v < 0 && k !== 'desconto' && k !== 'pago' && k !== 'tipo')
    .map(([k]) => k);
  if (faltam.length) {
    throw new Error('Este arquivo não é o export "todas as etapas" do BlueSales (faltam as colunas ID, Codigo, Etapa, Valor ou Data Pedido).');
  }
  const out: PedidoDoExport[] = [];
  for (const l of linhas) {
    const codigo = String(l[i.codigo] ?? '').trim().toUpperCase();
    const data = dataDe(l[i.data]);
    if (!/^BLV-[A-Z0-9]+$/.test(codigo) || !data) continue;
    out.push({
      numero: numeroDoPedido(l[i.numero]),
      codigo,
      etapa: String(l[i.etapa] ?? '').trim(),
      valor: centavos(reais(l[i.valor]) - (i.desconto >= 0 ? reais(l[i.desconto]) : 0)) / 100,
      data,
      pago_em: i.pago >= 0 ? dataDe(l[i.pago]) : null,
      tipo: i.tipo >= 0 ? String(l[i.tipo] ?? '').trim() : '',
    });
  }
  return out;
}

/**
 * Período do export: o do NOME do arquivo (…_2026-11-01_2026-11-15.csv),
 * que vale mesmo para dia sem pedido nenhum; sem ele, do primeiro ao último
 * pedido do arquivo.
 */
export function periodoDoExport(nomeArquivo: string, linhas: PedidoDoExport[]): Periodo | null {
  const m = /(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/.exec(nomeArquivo);
  if (m && m[1] <= m[2]) return { inicio: m[1], fim: m[2] };
  if (!linhas.length) return null;
  const datas = linhas.map((l) => l.data).sort();
  return { inicio: datas[0], fim: datas[datas.length - 1] };
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Etapa do export → status como o aviso do BlueSales grava (as conhecidas). */
const STATUS_DA_ETAPA: Record<string, string> = {
  agendados: 'cadastrados',
  confirmados: 'cadastrados',
  'aguard. coleta': 'aguard_coleta',
  enviados: 'enviados',
  'saiu p/ entrega': 'saiu_para_entrega',
  entregues: 'entregues',
  cobrados: 'cobrados',
  pagos: 'pagos',
  cancelados: 'cancelados',
  recusados: 'recusados',
  'aguard. pagamento': 'aguard_pagamento',
  devolvido: 'devolvido',
  roubo: 'roubo',
  voltando: 'voltando',
  'aguard. devolucao': 'aguardando_devolucao',
};

/** O que importa da etapa para o agendado e o card Cancelados. */
type Classe = 'recusado' | 'aguardando' | 'cancelado' | 'normal';
function classe(status: string | null | undefined): Classe {
  const p = { status: status ?? '' };
  if (ehRecusado(p)) return 'recusado';
  if (aguardaPagamento(p)) return 'aguardando';
  if (ehCancelado(p)) return 'cancelado';
  return 'normal';
}

const ehPago = (p: Pedido) => statusBucket(p.status) === 'aprovado';
const valorAgendado = (p: Pedido) => Number(p.valor_agendado ?? p.valor) || 0;

export type Mudanca =
  | { tipo: 'lixeira'; pedido: Pedido }
  | { tipo: 'voltar'; pedido: Pedido; etapa: string }
  | { tipo: 'valor'; pedido: Pedido; de: number; para: number }
  | { tipo: 'etapa'; pedido: Pedido; de: string | null; para: string; etapa: string };

export type Aviso =
  | { tipo: 'pago_fora'; pedido: Pedido }
  | { tipo: 'chegou_depois'; pedido: Pedido }
  | { tipo: 'falta_aqui'; linha: PedidoDoExport }
  | { tipo: 'etapa_desconhecida'; pedido: Pedido; etapa: string }
  | { tipo: 'pago_la'; linha: PedidoDoExport; pedido: Pedido | null }
  | { tipo: 'pago_aqui'; pedido: Pedido; linha: PedidoDoExport };

export interface Totais {
  qtd: number;
  valor: number;
}

export interface Conferencia {
  periodo: Periodo;
  mudancas: Mudanca[];
  avisos: Aviso[];
  /** Agendado da dashboard no período, como está e como fica. */
  antes: Totais;
  depois: Totais;
  /** Agendado do export (sem recusado, aguardando pagamento e antecipado pago). */
  blueSales: Totais;
}

function somar(lista: { valor: number }[]): Totais {
  return { qtd: lista.length, valor: centavos(lista.reduce((s, x) => s + x.valor, 0)) / 100 };
}

/**
 * Compara o export com os pedidos daqui. `chegadas` = quando cada pedido
 * chegou pelo primeiro aviso (o que chegou depois do export não está nele e
 * não pode ir para a lixeira).
 */
export function conferirComExport(
  linhas: PedidoDoExport[],
  pedidos: Pedido[],
  periodo: Periodo,
  exportadoEm: Date,
  chegadas: Record<string, string> = {},
): Conferencia {
  const doExport = linhas.filter((l) => isDentro(l.data, periodo.inicio, periodo.fim));
  const porCodigo = new Map(doExport.map((l) => [l.codigo, l]));
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const mudancas: Mudanca[] = [];
  const avisos: Aviso[] = [];

  // Daqui, no período, e não está no export.
  for (const p of pedidos) {
    if (p.removido_em || !isDentro(p.data, periodo.inicio, periodo.fim) || porCodigo.has(p.id)) continue;
    const chegou = chegadas[p.id];
    if (ehPago(p)) avisos.push({ tipo: 'pago_fora', pedido: p });
    else if (chegou && new Date(chegou).getTime() >= exportadoEm.getTime()) avisos.push({ tipo: 'chegou_depois', pedido: p });
    else mudancas.push({ tipo: 'lixeira', pedido: p });
  }

  // Do export: na lixeira, valor e etapa.
  for (const l of doExport) {
    const p = porId.get(l.codigo);
    if (!p) {
      avisos.push({ tipo: 'falta_aqui', linha: l });
      continue;
    }
    if (p.removido_em) mudancas.push({ tipo: 'voltar', pedido: p, etapa: l.etapa });
    if (ehPago(p)) continue;
    if (centavos(valorAgendado(p)) !== centavos(l.valor)) mudancas.push({ tipo: 'valor', pedido: p, de: valorAgendado(p), para: l.valor });
    const statusLa = STATUS_DA_ETAPA[norm(l.etapa)];
    if (classe(p.status) !== classe(statusLa ?? l.etapa)) {
      if (statusLa && statusLa !== 'pagos') mudancas.push({ tipo: 'etapa', pedido: p, de: p.status, para: statusLa, etapa: l.etapa });
      else avisos.push({ tipo: 'etapa_desconhecida', pedido: p, etapa: l.etapa });
    }
  }

  // Pagamentos: só os pedidos do export (os de outros meses não estão nele).
  for (const l of doExport) {
    const p = porId.get(l.codigo) ?? null;
    const pagoAqui = !!p && !p.removido_em && ehPago(p);
    if (l.pago_em && !pagoAqui) avisos.push({ tipo: 'pago_la', linha: l, pedido: p });
    if (!l.pago_em && pagoAqui && norm(l.etapa) !== 'pagos') avisos.push({ tipo: 'pago_aqui', pedido: p!, linha: l });
  }

  // Totais: o agendado daqui antes e depois das mudanças, e o do export.
  const conta = (p: Pedido) => isDentro(p.data, periodo.inicio, periodo.fim) && !p.removido_em && !foraDoAgendado(p);
  const antes = somar(pedidos.filter(conta).map((p) => ({ valor: valorAgendado(p) })));
  const corrigidos = aplicarMudancas(pedidos, mudancas, new Date(0).toISOString());
  const depois = somar(corrigidos.filter(conta).map((p) => ({ valor: valorAgendado(p) })));
  // Como o card: sem recusado, aguardando pagamento e antecipado já pago — e,
  // desde 26/11/2026, sem cancelado (CANCELADO_NO_AGENDADO).
  const blueSales = somar(
    doExport.filter(
      (l) =>
        !/recus|aguard.*pag/i.test(norm(l.etapa)) &&
        !(/antecip/i.test(l.tipo) && l.pago_em) &&
        (CANCELADO_NO_AGENDADO || !/cancel/i.test(norm(l.etapa))),
    ),
  );

  return { periodo, mudancas, avisos, antes, depois, blueSales };
}

/** Os pedidos com as mudanças aplicadas (o estado depois da conferência). */
export function aplicarMudancas(pedidos: Pedido[], mudancas: Mudanca[], agora: string): Pedido[] {
  const patch = new Map<string, Partial<Pedido>>();
  const juntar = (id: string, x: Partial<Pedido>) => patch.set(id, { ...patch.get(id), ...x });
  for (const m of mudancas) {
    if (m.tipo === 'lixeira') juntar(m.pedido.id, { removido_em: agora });
    if (m.tipo === 'voltar') juntar(m.pedido.id, { removido_em: null });
    if (m.tipo === 'valor') juntar(m.pedido.id, { valor_agendado: m.para });
    if (m.tipo === 'etapa') juntar(m.pedido.id, { status: m.para });
  }
  return pedidos.map((p) => (patch.has(p.id) ? { ...p, ...patch.get(p.id) } : p));
}

/** Por pedido, o que gravar no banco (uma chamada por pedido). */
export function correcoesPorPedido(mudancas: Mudanca[]): Map<string, { removido?: boolean; valor_agendado?: number; status?: string }> {
  const out = new Map<string, { removido?: boolean; valor_agendado?: number; status?: string }>();
  const juntar = (id: string, x: { removido?: boolean; valor_agendado?: number; status?: string }) => out.set(id, { ...out.get(id), ...x });
  for (const m of mudancas) {
    if (m.tipo === 'lixeira') juntar(m.pedido.id, { removido: true });
    if (m.tipo === 'voltar') juntar(m.pedido.id, { removido: false });
    if (m.tipo === 'valor') juntar(m.pedido.id, { valor_agendado: m.para });
    if (m.tipo === 'etapa') juntar(m.pedido.id, { status: m.para });
  }
  return out;
}
