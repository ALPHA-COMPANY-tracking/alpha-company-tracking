import { useMemo, useState } from 'react';
import { Crown, Info, Trophy } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact, formatPercent } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import {
  type MetricaRanking,
  METRICAS,
  chaveVendedor,
  comparativoPorPeriodo,
  rankingVendedores,
  valorDaMetrica,
} from '@/lib/ranking';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { BarsVertical } from '@/components/viz/BarsVertical';

const MEDALHA = ['🥇', '🥈', '🥉'];

/** Como a métrica escolhida é escrita. */
function formatar(valor: number, metrica: MetricaRanking): string {
  return metrica === 'qtd_agendados' ? String(valor) : formatBRL(valor);
}

export function RankingScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, dailies } = useData();
  const [metrica, setMetrica] = useState<MetricaRanking>('agendado');

  const linhas = useMemo(
    () => rankingVendedores(pedidos, dailies, periodo, metrica),
    [pedidos, dailies, periodo, metrica],
  );
  const colunas = useMemo(
    () => comparativoPorPeriodo(pedidos, dailies, metrica),
    [pedidos, dailies, metrica],
  );

  // Só quem realmente vendeu entra no pódio e nos gráficos.
  const comVenda = linhas.filter((l) => valorDaMetrica(l, metrica) > 0);
  const lider = comVenda[0];
  const totalMetrica = comVenda.reduce((s, l) => s + valorDaMetrica(l, metrica), 0);

  const barrasValor = comVenda.map((l) => ({
    label: l.nome,
    value: l.agendado,
    display: formatBRLCompact(l.agendado),
  }));
  const barrasQtd = linhas
    .filter((l) => l.qtd_agendados > 0)
    .map((l) => ({ label: l.nome, value: l.qtd_agendados, display: String(l.qtd_agendados) }));

  const rotulo = METRICAS.find((m) => m.id === metrica)!;

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Ranking de Vendas</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Como cada vendedor está performando — {formatDiaMes(periodo.inicio)} a {formatDiaMes(periodo.fim)}
        </p>
      </div>

      {/* Por qual número ranquear */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {METRICAS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetrica(m.id)}
            className={`px-3.5 py-[9px] rounded-[10px] text-[12.5px] font-semibold whitespace-nowrap shrink-0 border transition-colors ${
              metrica === m.id
                ? 'bg-white/[0.06] text-tx border-line2'
                : 'text-dim border-transparent hover:text-tx hover:bg-white/[0.025]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {comVenda.length === 0 ? (
        <Panel>
          <div className="p-10 text-center">
            <div className="text-[15px] font-semibold text-tx mb-2">Nenhuma venda neste período</div>
            <div className="text-[13px] text-dim">Escolha outro período no topo para ver o ranking.</div>
          </div>
        </Panel>
      ) : (
        <>
          {/* Pódio */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:gap-[14px]">
            {comVenda.slice(0, 3).map((l, i) => {
              const primeiro = i === 0;
              return (
                <div
                  key={l.nome}
                  className={`bg-card border rounded-kpi px-3.5 lg:px-4 py-3 lg:py-[15px] ${
                    primeiro ? 'border-gold/40' : 'border-line'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[17px] leading-none">{MEDALHA[i]}</span>
                    <span className={`text-[13px] font-bold truncate ${primeiro ? 'text-gold' : 'text-tx'}`}>
                      {l.nome}
                    </span>
                    {primeiro && <Crown size={13} className="text-gold shrink-0" />}
                  </div>
                  <div className="mono text-[19px] lg:text-[22px] font-extrabold text-pur2 truncate">
                    {formatar(valorDaMetrica(l, metrica), metrica)}
                  </div>
                  <div className="text-[10.5px] text-dim2 mt-[3px]">
                    {formatPercent(totalMetrica > 0 ? valorDaMetrica(l, metrica) / totalMetrica : 0)} do total ·{' '}
                    {l.qtd_agendados} pedido{l.qtd_agendados === 1 ? '' : 's'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela completa */}
          <Panel title="Desempenho no período" hint={`ordenado por ${rotulo.label.toLowerCase()}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[340px] lg:min-w-[860px]">
                <thead>
                  <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                    <th className="text-left font-semibold px-2 sm:px-3 lg:px-5 py-3">#</th>
                    <th className="text-left font-semibold px-2 sm:px-3 lg:px-5 py-3">Vendedor</th>
                    <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Agendado</th>
                    <th className="hidden lg:table-cell text-right font-semibold px-3 lg:px-5 py-3">Aprovado</th>
                    <th className="hidden lg:table-cell text-right font-semibold px-3 lg:px-5 py-3">Conversão</th>
                    <th className="hidden lg:table-cell text-right font-semibold px-3 lg:px-5 py-3">Ticket médio</th>
                    <th className="hidden lg:table-cell text-right font-semibold px-3 lg:px-5 py-3">Frustrados</th>
                    <th className="hidden sm:table-cell text-right font-semibold px-3 lg:px-5 py-3">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const vendeu = valorDaMetrica(l, metrica) > 0;
                    return (
                      <tr
                        key={l.nome}
                        className={`border-t border-line/70 hover:bg-white/[0.015] ${vendeu ? '' : 'opacity-50'}`}
                      >
                        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 mono text-dim2">
                          {vendeu ? (i < 3 ? MEDALHA[i] : `${i + 1}º`) : '—'}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4">
                          <div className="text-tx font-medium truncate max-w-[110px] sm:max-w-none">{l.nome}</div>
                          <div className="text-[10px] mono text-dim2 mt-[2px]">{formatPercent(l.pct)} de comissão</div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                          <div className="mono font-bold text-pur2">{formatBRL(l.agendado)}</div>
                          <div className="text-[10px] text-dim2 mt-[2px]">
                            {l.qtd_agendados} pedido{l.qtd_agendados === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                          <div className="mono font-bold text-grn">{formatBRL(l.aprovado)}</div>
                          <div className="text-[10px] text-dim2 mt-[2px]">{l.qtd_aprovados} pago{l.qtd_aprovados === 1 ? '' : 's'}</div>
                        </td>
                        <td className="hidden lg:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                          <span className={`mono ${l.conversao >= 0.5 ? 'text-grn' : l.conversao > 0 ? 'text-yel' : 'text-dim2'}`}>
                            {l.qtd_agendados > 0 ? formatPercent(l.conversao) : '—'}
                          </span>
                          <div className="text-[10px] text-dim2 mt-[2px]">
                            {l.qtd_agendados > 0 ? `${l.qtd_agendados_pagos} de ${l.qtd_agendados}` : ''}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right mono text-dim">
                          {l.qtd_agendados > 0 ? formatBRL(l.ticket_medio) : '—'}
                        </td>
                        <td className="hidden lg:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                          {l.qtd_frustrados > 0 ? (
                            <>
                              <div className="mono text-red">{formatBRL(l.frustrado)}</div>
                              <div className="text-[10px] text-dim2 mt-[2px]">{l.qtd_frustrados} pedido{l.qtd_frustrados === 1 ? '' : 's'}</div>
                            </>
                          ) : (
                            <span className="text-dim2">—</span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right mono text-dim">
                          {formatBRL(l.comissao)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Posição em cada período — o acompanhamento sem trocar o filtro */}
          <Panel title="Posição em cada período" hint={rotulo.curto.toLowerCase()}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[520px]">
                <thead>
                  <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                    <th className="text-left font-semibold px-2 sm:px-3 lg:px-5 py-3">Vendedor</th>
                    {colunas.map((c) => (
                      <th key={c.label} className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3 whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const k = chaveVendedor(l.nome);
                    return (
                      <tr key={l.nome} className="border-t border-line/70 hover:bg-white/[0.015]">
                        <td className="px-2 sm:px-3 lg:px-5 py-3.5 text-tx font-medium truncate max-w-[110px] sm:max-w-none">
                          {l.nome}
                        </td>
                        {colunas.map((c) => {
                          const pos = c.posicao.get(k);
                          const val = c.valor.get(k) ?? 0;
                          return (
                            <td key={c.label} className="px-2 sm:px-3 lg:px-5 py-3.5 text-right whitespace-nowrap">
                              {pos ? (
                                <>
                                  <div
                                    className={`mono font-bold ${
                                      pos === 1 ? 'text-gold' : pos === 2 ? 'text-tx2' : 'text-dim'
                                    }`}
                                  >
                                    {pos <= 3 ? MEDALHA[pos - 1] : `${pos}º`}
                                  </div>
                                  <div className="text-[10px] text-dim2 mt-[2px]">{formatar(val, metrica)}</div>
                                </>
                              ) : (
                                <span className="text-dim2">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Faturamento Agendado por Vendedor" hint={`${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)} · R$`}>
              <BarsVertical data={barrasValor} gradId="rank-valor" />
            </Panel>
            <Panel title="Agendamentos por Vendedor" hint="quantidade de pedidos">
              <BarsVertical data={barrasQtd} gradId="rank-qtd" />
            </Panel>
          </div>

          {lider && (
            <div className="flex items-start gap-3 rounded-[12px] border border-gold/25 bg-card2 px-4 py-[13px]">
              <Trophy size={16} className="text-gold shrink-0 mt-[2px]" />
              <p className="m-0 text-[12.5px] text-dim leading-relaxed">
                <b className="text-gold">{lider.nome}</b> lidera em {rotulo.label.toLowerCase()} com{' '}
                <b className="text-tx">{formatar(valorDaMetrica(lider, metrica), metrica)}</b>
                {comVenda.length > 1 && (
                  <>
                    {' '}— {formatPercent(totalMetrica > 0 ? valorDaMetrica(lider, metrica) / totalMetrica : 0)} de tudo
                    que a equipe fez no período.
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <Info size={16} className="text-blu shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          <b className="text-dim">Agendado</b> conta pela data em que o vendedor fechou a venda;{' '}
          <b className="text-dim">Aprovado</b>, pela data em que o cliente pagou — por isso os dois não batem no mesmo
          dia. A <b className="text-dim">conversão</b> olha só o que ele agendou no período: de tudo que vendeu, quanto
          já foi pago. Vendas excluídas na tela de Vendas Agendadas ficam de fora de tudo aqui.
        </p>
      </div>
    </div>
  );
}
