// ─────────────────────────────────────────────────────────────
// Mapa de Frustração: onde roubo e devolução se concentram.
//
// Da entrega só se guarda ESTADO e CIDADE (migração 0021). Eles vêm do
// CSV do BlueSales — a tela lê o arquivo no navegador e usa só as
// colunas ID, Cidade e Estado — e, se o webhook trouxer, do webhook.
// ─────────────────────────────────────────────────────────────

import type { Pedido, Periodo } from '@/types';
import { type Cents, reaisToCents, safeDiv } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { pedidosAtivos } from '@/lib/pedidos';
import { perdaRealDePedido } from '@/lib/custosConfig';
import { motivoFrustracao, situacaoDoPedido } from '@/lib/indicadores';
import type { RegiaoPedido } from '@/data/backend';

/** Os 27 estados (o desenho do mapa vem de svg-maps/brazil). */
export const ESTADOS: Record<string, { nome: string }> = {
  RR: { nome: 'Roraima' },
  AP: { nome: 'Amapá' },
  AM: { nome: 'Amazonas' },
  PA: { nome: 'Pará' },
  MA: { nome: 'Maranhão' },
  CE: { nome: 'Ceará' },
  RN: { nome: 'Rio Grande do Norte' },
  AC: { nome: 'Acre' },
  RO: { nome: 'Rondônia' },
  MT: { nome: 'Mato Grosso' },
  TO: { nome: 'Tocantins' },
  PI: { nome: 'Piauí' },
  PE: { nome: 'Pernambuco' },
  PB: { nome: 'Paraíba' },
  MS: { nome: 'Mato Grosso do Sul' },
  GO: { nome: 'Goiás' },
  DF: { nome: 'Distrito Federal' },
  BA: { nome: 'Bahia' },
  AL: { nome: 'Alagoas' },
  PR: { nome: 'Paraná' },
  SP: { nome: 'São Paulo' },
  MG: { nome: 'Minas Gerais' },
  ES: { nome: 'Espírito Santo' },
  SE: { nome: 'Sergipe' },
  SC: { nome: 'Santa Catarina' },
  RJ: { nome: 'Rio de Janeiro' },
  RS: { nome: 'Rio Grande do Sul' },
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const UF_POR_NOME = new Map(Object.entries(ESTADOS).map(([uf, e]) => [semAcento(e.nome).toUpperCase(), uf]));

/** "sp", "São Paulo" → "SP". Qualquer outra coisa → null. */
export function normalizarUf(v: unknown): string | null {
  const s = semAcento(String(v ?? '')).trim().toUpperCase();
  if (ESTADOS[s]) return s;
  return UF_POR_NOME.get(s) ?? null;
}

/** "SÃO JOSÉ DOS CAMPOS" → "São José Dos Campos"; vazio → null. */
export function nomeDeCidade(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!s || /\d/.test(s)) return null;
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())
    .replace(/ (Da|De|Do|Das|Dos|E)(?= )/g, (m) => m.toLowerCase()); // "Rio de Janeiro"
}

/** CSV com aspas (o endereço tem vírgula e quebra de linha dentro). */
function linhasCsv(texto: string, sep: string): string[][] {
  const out: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      out.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    out.push(linha);
  }
  return out.filter((l) => l.length > 1);
}

/**
 * Lê o export do BlueSales ("pedidos_todas_as_etapas_….csv") e devolve SÓ
 * número do pedido, estado e cidade. CPF, telefone, e-mail, rua e CEP são
 * ignorados — nunca saem do navegador.
 */
export function lerRegioesDoCsv(texto: string): { itens: RegiaoPedido[]; linhas: number; semRegiao: number } {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.slice(0, limpo.search(/\r?\n/) >>> 0);
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const [cab, ...dados] = linhasCsv(limpo, sep);
  const col = (nome: string) => (cab ?? []).findIndex((c) => semAcento(c).trim().toLowerCase() === nome);
  const iId = col('id');
  const iCidade = col('cidade');
  const iUf = col('estado');
  if (iId < 0 || iUf < 0) throw new Error('O arquivo não tem as colunas ID e Estado — use o export "todas as etapas" do BlueSales.');

  const itens: RegiaoPedido[] = [];
  let semRegiao = 0;
  for (const l of dados) {
    const id = Number(String(l[iId] ?? '').replace(/\D/g, ''));
    const uf = normalizarUf(l[iUf]);
    if (!id) continue;
    if (!uf) {
      semRegiao += 1;
      continue;
    }
    itens.push({ internal_id: id, uf, cidade: iCidade >= 0 ? nomeDeCidade(l[iCidade]) : null });
  }
  return { itens, linhas: dados.length, semRegiao };
}

export interface LinhaRegiao {
  /** "SP" ou "campinas/SP". */
  chave: string;
  uf: string;
  cidade: string | null;
  pedidos: number;
  frustrados: number;
  roubos: number;
  /** Valor dos pedidos em frustração (o que não entrou). */
  valor_frustrado: Cents;
  /** Dinheiro que saiu: produto + frete (roubo) ou só frete (devolução). */
  perda: Cents;
  pct_frustracao: number;
  pct_roubo: number;
}

export interface PerdasPorRegiao {
  estados: LinhaRegiao[];
  cidades: LinhaRegiao[];
  /** Agendados do período, com e sem região. */
  total: number;
  semRegiao: number;
  /** Soma de todas as regiões (o "Brasil" do mapa). */
  brasil: LinhaRegiao;
}

function nova(chave: string, uf: string, cidade: string | null): LinhaRegiao {
  return { chave, uf, cidade, pedidos: 0, frustrados: 0, roubos: 0, valor_frustrado: 0, perda: 0, pct_frustracao: 0, pct_roubo: 0 };
}

/**
 * Roubo e frustração por estado e por cidade, nos pedidos AGENDADOS no
 * período (data do pedido) — a mesma base da "Frustração geral" da
 * Visualização. Frustração = roubo, devolvido, voltando, cancelado…
 */
export function perdasPorRegiao(pedidos: Pedido[], periodo: Periodo): PerdasPorRegiao {
  const estados = new Map<string, LinhaRegiao>();
  const cidades = new Map<string, LinhaRegiao>();
  const brasil = nova('BR', 'BR', null);
  let total = 0;
  let semRegiao = 0;

  for (const p of pedidosAtivos(pedidos)) {
    if (!isDentro(p.data, periodo.inicio, periodo.fim)) continue;
    total += 1;
    const uf = normalizarUf(p.uf);
    if (!uf) {
      semRegiao += 1;
      continue;
    }
    const cidade = nomeDeCidade(p.cidade);
    const e = estados.get(uf) ?? nova(uf, uf, null);
    estados.set(uf, e);
    const alvos = [e, brasil];
    if (cidade) {
      const chave = `${semAcento(cidade).toLowerCase()}/${uf}`;
      const c = cidades.get(chave) ?? nova(chave, uf, cidade);
      cidades.set(chave, c);
      alvos.push(c);
    }

    const frustrado = situacaoDoPedido(p.status) === 'frustracao';
    const roubo = frustrado && motivoFrustracao(p) === 'roubo';
    const valor = reaisToCents(Number(p.valor_agendado ?? p.valor) || 0);
    const perda = frustrado ? reaisToCents(perdaRealDePedido(p)) : 0;
    for (const a of alvos) {
      a.pedidos += 1;
      if (frustrado) {
        a.frustrados += 1;
        a.valor_frustrado += valor;
        a.perda += perda;
      }
      if (roubo) a.roubos += 1;
    }
  }

  const fechar = (l: LinhaRegiao) => ({
    ...l,
    pct_frustracao: safeDiv(l.frustrados, l.pedidos),
    pct_roubo: safeDiv(l.roubos, l.pedidos),
  });
  const ordem = (a: LinhaRegiao, b: LinhaRegiao) => b.frustrados - a.frustrados || b.roubos - a.roubos || b.pedidos - a.pedidos;
  return {
    estados: [...estados.values()].map(fechar).sort(ordem),
    cidades: [...cidades.values()].map(fechar).sort(ordem),
    total,
    semRegiao,
    brasil: fechar(brasil),
  };
}
