import { useMemo } from 'react';
import { BadgeCheck, CalendarClock, Info, ShoppingCart, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact, formatPercent, safeDiv } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import {
  type LinhaRanking,
  type MetricaRanking,
  chaveVendedor,
  comparativoPorPeriodo,
  ordenar,
  rankingVendedores,
  valorDaMetrica,
} from '@/lib/ranking';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { BarsVertical } from '@/components/viz/BarsVertical';

const MEDALHA = ['🥇', '🥈', '🥉'];

/** Como cada métrica é escrita. */
function formatar(valor: number, metrica: MetricaRanking): string {
  return metrica === 'qtd_agendados' ? String(valor) : formatBRL(valor);
}

/**
 * Um ranking fechado: a lista ordenada por uma métrica, com a barra
 * mostrando a fatia de cada um. Os três aparecem lado a lado — trocar de
 * aba escondia dois terços da resposta.
 */
function BlocoRanking({
  titulo,
  hint,
  Icon,
  cor,
  metrica,
  linhas,
}: {
  titulo: string;
  hint: string;
  Icon: LucideIcon;
  cor: string;
  metrica: MetricaRanking;
  linhas: LinhaRanking[];
}) {
  const ordenadas = ordenar(linhas, metrica);
  const total = ordenadas.reduce((s, l) => s + valorDaMetrica(l, metrica), 0);
  const lider = valorDaMetrica(ordenadas[0] ?? ({} as LinhaRanking), metrica) || 0;
  // Todos os que tiveram movimento no período aparecem nos três blocos,
  // mesmo zerados num deles: as linhas ficam alinhadas e dá para comparar
  // na horizontal. Zerado em "Aprovado" é informação, não ausência dela.
  const visiveis = ordenadas.filter((l) => l.agendado > 0 || l.aprovado > 0);

  return (
    <div className="bg-card border border-line rounded-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-line">
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center shrink-0" style={{ background: `${cor}1f`, color: cor }}>
          <Icon size={14} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-tx leading-tight">{titulo}</div>
          <div className="text-[10.5px] text-dim2">{hint}</div>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {visiveis.length === 0 ? (
          <div className="text-[12px] text-dim2 py-3 text-center">Nada neste período.</div>
        ) : (
          visiveis.map((l, i) => {
            const v = valorDaMetrica(l, metrica);
            const zerado = v === 0;
            return (
              <div key={l.nome}>
                <div className="flex items-center justify-between gap-2 mb-[5px]">
                  <span className="flex items-center gap-[7px] min-w-0">
                    <span className="text-[13px] leading-none shrink-0 w-[17px] text-center">
                      {zerado ? <span className="text-dim2 text-[11px]">—</span> : i < 3 ? MEDALHA[i] : `${i + 1}º`}
                    </span>
                    <span className={`text-[12.5px] truncate ${zerado ? 'text-dim2' : i === 0 ? 'text-gold font-bold' : 'text-tx2'}`}>
                      {l.nome}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1.5 shrink-0">
                    <span className={`mono text-[13px] font-bold ${zerado ? 'text-dim2' : i === 0 ? 'text-gold' : 'text-tx'}`}>
                      {formatar(v, metrica)}
                    </span>
                    {!zerado && <span className="text-[10px] text-dim2">{formatPercent(safeDiv(v, total))}</span>}
                  </span>
                </div>
                {/* A barra é relativa ao líder: dá a distância de um bate-olho. */}
                <div className="h-[5px] rounded-full bg-trilha overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${zerado || lider <= 0 ? 0 : Math.max(3, (v / lider) * 100)}%`,
                      background: i === 0 ? 'linear-gradient(90deg,#eab30880,#eab308)' : `${cor}b0`,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function RankingScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, dailies } = useData();

  const linhas = useMemo(() => rankingVendedores(pedidos, dailies, periodo), [pedidos, dailies, periodo]);
  // O comparativo entre janelas segue o faturamento agendado — a mesma
  // base do CPA e do ROAS, que é o que o anúncio entrega.
  const colunas = useMemo(() => comparativoPorPeriodo(pedidos, dailies, 'agendado'), [pedidos, dailies]);

  const vendeu = linhas.filter((l) => l.agendado > 0 || l.aprovado > 0);
  const totalAgendado = linhas.reduce((s, l) => s + l.agendado, 0);
  const lider = ordenar(linhas, 'agendado')[0];

  const barrasValor = ordenar(linhas, 'agendado')
    .filter((l) => l.agendado > 0)
    .map((l) => ({ label: l.nome, value: l.agendado, display: formatBRLCompact(l.agendado) }));
  const barrasQtd = ordenar(linhas, 'qtd_agendados')
    .filter((l) => l.qtd_agendados > 0)
    .map((l) => ({ label: l.nome, value: l.qtd_agendados, display: String(l.qtd_agendados) }));

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Ranking de Vendas</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Como cada vendedor está performando — {formatDiaMes(periodo.inicio)} a {formatDiaMes(periodo.fim)}
        </p>
      </div>

      {vendeu.length === 0 ? (
        <Panel>
          <div className="p-10 text-center">
            <div className="text-[15px] font-semibold text-tx mb-2">Nenhuma venda neste período</div>
            <div className="text-[13px] text-dim">Escolha outro período no topo para ver o ranking.</div>
          </div>
        </Panel>
      ) : (
        <>
          {/* Os três rankings, juntos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-[14px]">
            <BlocoRanking
              titulo="Faturamento Agendado"
              hint="o que cada um fechou"
              Icon={CalendarClock}
              cor="#c084fc"
              metrica="agendado"
              linhas={linhas}
            />
            <BlocoRanking
              titulo="Faturamento Aprovado"
              hint="o que já foi pago"
              Icon={BadgeCheck}
              cor="#34d399"
              metrica="aprovado"
              linhas={linhas}
            />
            <BlocoRanking
              titulo="Agendamentos"
              hint="quantidade de pedidos"
              Icon={ShoppingCart}
              cor="#60a5fa"
              metrica="qtd_agendados"
              linhas={linhas}
            />
          </div>

          {/* Tabela completa */}
          <Panel title="Desempenho no período" hint="todos os números lado a lado">
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
                  {ordenar(linhas, 'agendado').map((l, i) => {
                    const ativo = l.agendado > 0 || l.aprovado > 0;
                    return (
                      <tr
                        key={l.nome}
                        className={`border-t border-line/70 hover:bg-white/[0.015] ${ativo ? '' : 'opacity-50'}`}
                      >
                        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 mono text-dim2">
                          {ativo ? (i < 3 ? MEDALHA[i] : `${i + 1}º`) : '—'}
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
                          <div className="text-[10px] text-dim2 mt-[2px]">
                            {l.qtd_aprovados} pago{l.qtd_aprovados === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                          <span
                            className={`mono ${l.conversao >= 0.5 ? 'text-grn' : l.conversao > 0 ? 'text-yel' : 'text-dim2'}`}
                          >
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
                              <div className="text-[10px] text-dim2 mt-[2px]">
                                {l.qtd_frustrados} pedido{l.qtd_frustrados === 1 ? '' : 's'}
                              </div>
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

          {/* Posição em cada período */}
          <Panel title="Posição em cada período" hint="por faturamento agendado">
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
                  {ordenar(linhas, 'agendado').map((l) => {
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
                                  <div className="text-[10px] text-dim2 mt-[2px]">{formatBRL(val)}</div>
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
            <Panel
              title="Faturamento Agendado por Vendedor"
              hint={`${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)} · R$`}
            >
              <BarsVertical data={barrasValor} gradId="rank-valor" />
            </Panel>
            <Panel title="Agendamentos por Vendedor" hint="quantidade de pedidos">
              <BarsVertical data={barrasQtd} gradId="rank-qtd" />
            </Panel>
          </div>

          {lider && lider.agendado > 0 && (
            <div className="flex items-start gap-3 rounded-[12px] border border-gold/25 bg-card2 px-4 py-[13px]">
              <Trophy size={16} className="text-gold shrink-0 mt-[2px]" />
              <p className="m-0 text-[12.5px] text-dim leading-relaxed">
                <b className="text-gold">{lider.nome}</b> lidera o faturamento agendado com{' '}
                <b className="text-tx">{formatBRL(lider.agendado)}</b> —{' '}
                {formatPercent(safeDiv(lider.agendado, totalAgendado))} de tudo que a equipe fechou no período.
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
