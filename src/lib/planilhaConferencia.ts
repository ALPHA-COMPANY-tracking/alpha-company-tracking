// ─────────────────────────────────────────────────────────────
// Conferência da Planilha (migração 0027): o que a planilha de pagamentos
// mandou, as correções já feitas e o "Usar o da planilha" da tela.
// As regras de comparação são as mesmas do servidor (api/lib-planilha.ts).
// ─────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';
import type { Diferenca, LinhaPlanilha } from '../../api/lib-planilha';

export interface FotoPlanilha {
  linhas: LinhaPlanilha[];
  /** Quando a planilha mandou pela última vez (null = nunca). */
  recebidoEm: string | null;
}

export interface AjusteFeito {
  id: number;
  pedido_id: string;
  internal_id: number | null;
  campo: string;
  de: string | null;
  para: string | null;
  origem: 'automatico' | 'manual' | string;
  aplicado_em: string;
}

/** null = tabela inexistente (migração 0027 não rodada). */
export async function carregarPlanilha(): Promise<FotoPlanilha | null> {
  if (!supabase) return { linhas: [], recebidoEm: null };
  const linhas: (LinhaPlanilha & { recebido_em: string })[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('planilha_pagamentos')
      .select('aba,linha,pedido_id,valor,data_pagamento,vendedor,metodo,recebido_em')
      .order('id')
      .range(de, de + 999);
    if (error) return null;
    linhas.push(...((data ?? []) as (LinhaPlanilha & { recebido_em: string })[]));
    if (!data || data.length < 1000) break;
  }
  return {
    linhas: linhas.map((l) => ({ ...l, valor: Number(l.valor) || 0 })),
    recebidoEm: linhas.reduce<string | null>((m, l) => (!m || l.recebido_em > m ? l.recebido_em : m), null),
  };
}

export async function carregarAjustes(): Promise<AjusteFeito[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('planilha_ajustes')
    .select('id,pedido_id,internal_id,campo,de,para,origem,aplicado_em')
    .order('aplicado_em', { ascending: false })
    .limit(100);
  return error ? [] : ((data ?? []) as AjusteFeito[]);
}

/** O botão "Usar o da planilha". Devolve o erro, se houver. */
export async function usarDaPlanilha(conta: string, d: Diferenca): Promise<string | null> {
  if (!supabase) return 'Disponível só na versão online.';
  if (!d.corrigirPara) return 'Esta diferença não tem correção automática.';
  const { campo, de, valor } = d.corrigirPara;
  const patch =
    campo === 'valor'
      ? { valor: Number(valor), valor_manual: true }
      : campo === 'vendedor'
        ? { vendedor: valor, vendedor_manual: true }
        : { data_aprovacao: valor };
  const { error } = await supabase.from('bluesales_pedidos').update(patch).eq('user_id', conta).eq('id', d.pedido_id);
  if (error) return /vendedor_manual/.test(error.message) ? 'Rode a migração 0027 no Supabase primeiro.' : error.message;
  await supabase.from('planilha_ajustes').insert({
    user_id: conta,
    pedido_id: d.pedido_id,
    internal_id: d.internal_id,
    campo,
    de,
    para: valor,
    origem: 'manual',
  });
  return null;
}

/**
 * O script que vai dentro da planilha (Extensões → Apps Script). Lê as
 * abas, acha as colunas pelo cabeçalho e manda SÓ código do pedido, valor,
 * data, vendedor e método. O token fica guardado na própria planilha
 * (menu Dashboard → Configurar token), nunca escrito no código.
 */
export function scriptDaPlanilha(origem: string): string {
  return `// Dashboard AJ Alpha — Conferência da Planilha.
// Manda para a dashboard SÓ: código do pedido, valor, data, vendedor e
// método. O nome da cliente não sai da planilha.
var URL_DASHBOARD = '${origem}/api/planilha';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard')
    .addItem('Enviar agora', 'enviarAgora')
    .addItem('Configurar token', 'configurarToken')
    .addItem('Ligar envio de hora em hora', 'instalarGatilho')
    .addToUi();
}

function configurarToken() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Token da dashboard', 'Cole o PLANILHA_TOKEN:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('PLANILHA_TOKEN', r.getResponseText().trim());
  ui.alert('Token salvo.');
}

function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarParaDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarParaDashboard').timeBased().everyHours(1).create();
  enviarAgora();
}

function enviarAgora() {
  var r = enviarParaDashboard();
  SpreadsheetApp.getUi().alert('Enviado: ' + r.linhas + ' pagamentos. Correções feitas agora: ' + r.ajustes + '.');
}

function enviarParaDashboard() {
  var token = PropertiesService.getScriptProperties().getProperty('PLANILHA_TOKEN');
  if (!token) throw new Error('Falta o token: menu Dashboard → Configurar token.');
  var fuso = 'America/Sao_Paulo';
  var abas = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (aba) {
    var valores = aba.getDataRange().getValues();
    // Cabeçalho: a primeira linha (até a 10ª) com "pedido" e "valor".
    var iCab = -1, cab = [];
    for (var i = 0; i < Math.min(10, valores.length); i++) {
      var c = valores[i].map(function (v) { return String(v).trim().toLowerCase(); });
      if (c.some(function (x) { return x.indexOf('pedido') >= 0; }) && c.some(function (x) { return x.indexOf('valor') === 0; })) {
        iCab = i; cab = c; break;
      }
    }
    if (iCab < 0) return;
    var achar = function (teste) { for (var j = 0; j < cab.length; j++) if (teste(cab[j])) return j; return -1; };
    var col = {
      pedido: achar(function (x) { return x.indexOf('pedido') >= 0; }),
      valor: achar(function (x) { return x.indexOf('valor') === 0; }),
      data: achar(function (x) { return x.indexOf('data') >= 0 && x.indexOf('pag') >= 0; }),
      vendedor: achar(function (x) { return x.indexOf('vendedor') === 0; }),
      metodo: achar(function (x) { return x.indexOf('método') >= 0 || x.indexOf('metodo') >= 0; })
    };
    if (col.data < 0) col.data = achar(function (x) { return x.indexOf('data') >= 0; });
    if (col.data < 0) return;
    var linhas = [];
    for (var k = iCab + 1; k < valores.length; k++) {
      var r = valores[k];
      var pedido = String(r[col.pedido] || '');
      if (!/BLV-/i.test(pedido)) continue;
      var d = r[col.data];
      linhas.push({
        linha: k + 1,
        pedido: pedido,
        valor: r[col.valor],
        data: d instanceof Date ? Utilities.formatDate(d, fuso, 'yyyy-MM-dd') : String(d),
        vendedor: col.vendedor >= 0 ? String(r[col.vendedor]) : '',
        metodo: col.metodo >= 0 ? String(r[col.metodo]) : ''
      });
    }
    if (linhas.length) abas.push({ nome: aba.getName(), linhas: linhas });
  });
  var resp = UrlFetchApp.fetch(URL_DASHBOARD, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ abas: abas }),
    muteHttpExceptions: true
  });
  var res = {};
  try { res = JSON.parse(resp.getContentText() || '{}'); } catch (e) { res = {}; }
  if (!res.ok) throw new Error(res.aviso || res.error || ('Erro ' + resp.getResponseCode()));
  return res;
}
`;
}
