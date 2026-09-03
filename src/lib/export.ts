// ─────────────────────────────────────────────────────────────
// Exportação do período: .xlsx (3 abas) e .csv. Os valores vão
// como NÚMERO real com formato de moeda (não texto), pra somar no
// Excel. Datas em pt-BR.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CategoriaCusto, CustoVariavel, Periodo } from '@/types';
import { centsToReais } from '@/lib/money';
import { diasDoPeriodo } from '@/lib/dates';
import { calcularPnl, custoNoPeriodo } from '@/lib/pnl';

const FMT_MOEDA = 'R$ #,##0.00';
const FMT_PCT = '0.0%';

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomeArquivo(periodo: Periodo, ext: string): string {
  return `pnl_${periodo.inicio}_a_${periodo.fim}.${ext}`;
}

export async function exportarXlsx(
  dailies: AfterpayDaily[],
  custos: CustoVariavel[],
  categorias: CategoriaCusto[],
  periodo: Periodo,
) {
  const { default: ExcelJS } = await import('exceljs');
  const catMap = new Map(categorias.map((c) => [c.id, c]));
  const pnl = calcularPnl(dailies, custos, periodo);
  const r = centsToReais;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dashboard Financeiro';
  wb.created = new Date();

  // ── Aba 1: Resumo P&L ──
  const ws1 = wb.addWorksheet('Resumo P&L');
  ws1.columns = [
    { header: 'Indicador', key: 'k', width: 34 },
    { header: 'Valor', key: 'v', width: 20 },
  ];
  const moeda = (label: string, cents: number) => {
    const row = ws1.addRow({ k: label, v: r(cents) });
    row.getCell('v').numFmt = FMT_MOEDA;
  };
  const pct = (label: string, ratio: number) => {
    const row = ws1.addRow({ k: label, v: ratio });
    row.getCell('v').numFmt = FMT_PCT;
  };
  const num = (label: string, n: number) => ws1.addRow({ k: label, v: n });

  ws1.addRow({ k: `Período`, v: `${fmtDataBR(periodo.inicio)} a ${fmtDataBR(periodo.fim)}` });
  ws1.addRow({});
  moeda('Receita Aprovada', pnl.receita_aprovada);
  num('Pagamentos', pnl.qtd_pagamentos);
  ws1.addRow({});
  moeda('Taxas de Plataforma', pnl.taxas_plataforma);
  moeda('Custo dos Produtos', pnl.custo_produtos);
  moeda('Frete', pnl.frete);
  moeda('Comissões Vendedor', pnl.comissoes_vendedor);
  moeda('Comissões Cobrança', pnl.comissoes_cobranca);
  moeda('Investimento em Ads', pnl.investimento_ads);
  moeda('Taxas sobre Investimento', pnl.taxas_investimento);
  moeda('= Custos Afterpay', pnl.custos_afterpay);
  ws1.addRow({});
  moeda('Custos Variáveis (você)', pnl.custos_variaveis_total);
  moeda('= Custos Totais Reais', pnl.custos_totais_reais);
  ws1.addRow({});
  moeda('LUCRO REAL', pnl.lucro_real);
  pct('Margem Real', pnl.margem_real);
  moeda('Lucro segundo Afterpay', pnl.lucro_afterpay);
  pct('Margem Afterpay', pnl.margem_afterpay);
  moeda('Diferença (Afterpay − Real)', pnl.diferenca_afterpay);
  ws1.addRow({});
  moeda('Frustrados (informativo)', pnl.valor_frustrado);
  moeda('Ticket Médio', pnl.ticket_medio);
  moeda('CPA por agendamento', pnl.cpa);
  num('ROAS agendado', Number(pnl.roas.toFixed(2)));
  pct('ROI Real', pnl.roi_real);
  pct('Conversão Agendado→Aprovado', pnl.conversao_agendado);
  moeda('Valor Pendente', pnl.valor_pendente);

  // ── Aba 2: Custos Variáveis ──
  const ws2 = wb.addWorksheet('Custos Variáveis');
  ws2.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Categoria', key: 'cat', width: 28 },
    { header: 'Descrição', key: 'desc', width: 40 },
    { header: 'Valor no período', key: 'valor', width: 18 },
    { header: 'Recorrência', key: 'rec', width: 14 },
  ];
  custos
    .map((c) => ({ c, cents: custoNoPeriodo(c, periodo) }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.c.data.localeCompare(a.c.data))
    .forEach(({ c, cents }) => {
      const row = ws2.addRow({
        data: fmtDataBR(c.data),
        cat: catMap.get(c.categoria_id ?? '')?.nome ?? 'Sem categoria',
        desc: c.descricao,
        valor: r(cents),
        rec: c.recorrencia === 'mensal' ? 'Mensal' : 'Único',
      });
      row.getCell('valor').numFmt = FMT_MOEDA;
    });

  // ── Aba 3: Diário ──
  const ws3 = wb.addWorksheet('Diário');
  ws3.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Receita', key: 'rec', width: 16 },
    { header: 'Custos Afterpay', key: 'ca', width: 16 },
    { header: 'Custos Variáveis', key: 'cv', width: 16 },
    { header: 'Lucro Real', key: 'lucro', width: 16 },
    { header: 'Pagamentos', key: 'pag', width: 12 },
  ];
  diasDoPeriodo(periodo.inicio, periodo.fim).forEach((dia) => {
    const p = calcularPnl(dailies, custos, { inicio: dia, fim: dia });
    const row = ws3.addRow({
      data: fmtDataBR(dia),
      rec: r(p.receita_aprovada),
      ca: r(p.custos_afterpay),
      cv: r(p.custos_variaveis_total),
      lucro: r(p.lucro_real),
      pag: p.qtd_pagamentos,
    });
    ['rec', 'ca', 'cv', 'lucro'].forEach((k) => (row.getCell(k).numFmt = FMT_MOEDA));
  });

  // Estilo dos cabeçalhos
  for (const ws of [ws1, ws2, ws3]) {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomeArquivo(periodo, 'xlsx'),
  );
}

/** CSV dos custos variáveis no formato que a importação entende (round-trip). */
export function exportarCsvCustos(
  custos: CustoVariavel[],
  categorias: CategoriaCusto[],
  periodo: Periodo,
) {
  const catMap = new Map(categorias.map((c) => [c.id, c]));
  const linhas = ['data;categoria;descricao;valor'];
  custos
    .map((c) => ({ c, cents: custoNoPeriodo(c, periodo) }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.c.data.localeCompare(a.c.data))
    .forEach(({ c, cents }) => {
      const cat = catMap.get(c.categoria_id ?? '')?.nome ?? 'Sem categoria';
      const valor = centsToReais(cents).toFixed(2).replace('.', ',');
      const desc = c.descricao.replace(/;/g, ',');
      linhas.push(`${c.data};${cat};${desc};${valor}`);
    });
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  baixarBlob(blob, nomeArquivo(periodo, 'csv'));
}
