import { useMemo, useState } from 'react';
import { Check, RefreshCw, Save, Scale, Trash2, TriangleAlert, Zap } from 'lucide-react';
import type { AfterpayDaily, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { type RespostaMeta, metaDisponivel, sincronizarMeta } from '@/lib/metaAds';
import { addDias } from '@/lib/dates';
import { haQuanto } from '@/lib/saudacao';

/** Data local (America/Sao_Paulo ~ horário do usuário) no formato YYYY-MM-DD. */
function hojeLocal(): string {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function formatData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function zeroDaily(data: string): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0, leads: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdsScreen(_props: { periodo: Periodo }) {
  const { dailies, lancarDaily, recarregar } = useData();
  const [data, setData] = useState(hojeLocal());
  const [cents, setCents] = useState(0);
  const [leads, setLeads] = useState(0);
  const [salvo, setSalvo] = useState(false);

  /** Lançamento existente do dia — a base de qualquer gravação, para não
   *  apagar campos que não estão neste formulário. */
  const doDia = (d: string) => dailies.find((x) => x.data === d);

  // Ao escolher uma data que já tem lançamento, prefill (vira "Atualizar").
  function selecionarData(d: string) {
    setData(d);
    setSalvo(false);
    const ex = doDia(d);
    setCents(ex ? reaisToCents(ex.investimento_ads) : 0);
    setLeads(ex?.leads ?? 0);
  }

  function salvar() {
    if (!data) return;
    // Parte do que já existe: gravar do zero apagaria os outros campos do dia.
    const base = doDia(data) ?? zeroDaily(data);
    const mudouGasto = reaisToCents(base.investimento_ads) !== cents;
    // Valor digitado vira "manual" — só se a coluna existe (migração 0018).
    const origem = base.ads_origem !== undefined && mudouGasto ? { ads_origem: 'manual', ads_detalhe: null } : {};
    lancarDaily({ ...base, ...origem, investimento_ads: cents / 100, leads });
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  function excluir(d: string) {
    // Zera só o que esta tela controla; a taxa do dia é preservada.
    const base = doDia(d) ?? zeroDaily(d);
    lancarDaily({ ...base, investimento_ads: 0, leads: 0 });
    if (d === data) { setCents(0); setLeads(0); }
  }

  const historico = useMemo(
    () =>
      dailies
        .filter((d) => d.investimento_ads > 0 || (d.leads ?? 0) > 0)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [dailies],
  );

  // ── Meta Ads automático ──
  const [ocupado, setOcupado] = useState<'sincronizar' | 'comparar' | null>(null);
  const [resposta, setResposta] = useState<RespostaMeta | null>(null);
  const ultimaSync = useMemo(() => {
    const vezes = dailies.map((d) => d.ads_sincronizado_em).filter((v): v is string => !!v);
    return vezes.length ? Math.max(...vezes.map((v) => Date.parse(v))) : null;
  }, [dailies]);

  async function sincronizar() {
    setOcupado('sincronizar');
    const r = await sincronizarMeta({ dias: 2 });
    setResposta(r);
    if (r.ok) await recarregar();
    setOcupado(null);
  }

  async function comparar() {
    // Os 7 dias antes de ontem: dias já fechados, com o valor do BlueSales
    // na dashboard. Não grava nada — só mostra lado a lado.
    setOcupado('comparar');
    const hoje = hojeLocal();
    setResposta(await sincronizarMeta({ desde: addDias(hoje, -8), ate: addDias(hoje, -2), simular: true }));
    setOcupado(null);
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Marketing</h1>
        <p className="text-[13px] text-dim mt-0.5">
          O gasto do Meta Ads entra sozinho · aqui você confere e lança os leads
        </p>
      </div>

      {metaDisponivel && (
        <Panel
          title="Meta Ads automático"
          hint={ultimaSync ? `última sincronização ${haQuanto(ultimaSync)}` : 'ainda não sincronizou'}
        >
          <div className="p-3.5 lg:p-5 flex flex-col gap-4">
            <p className="m-0 text-[12.5px] text-dim leading-relaxed">
              A dashboard busca o gasto de <b className="text-tx">hoje e de ontem</b> direto no Meta a cada 30 minutos,
              no fechamento das 23h e quando você toca em <b className="text-tx">Atualizar</b>. Gasto em dólar é
              convertido para reais pela mesma cotação do BlueSales (R$ 5,40).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={sincronizar}
                disabled={ocupado !== null}
                className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal disabled:opacity-60"
              >
                <RefreshCw size={15} className={ocupado === 'sincronizar' ? 'animate-spin' : ''} />
                Sincronizar agora
              </button>
              <button
                onClick={comparar}
                disabled={ocupado !== null}
                className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-tx border border-line2 hover:bg-white/[0.04] disabled:opacity-60"
              >
                <Scale size={15} className={ocupado === 'comparar' ? 'animate-pulse' : ''} />
                Comparar com a dashboard (7 dias)
              </button>
            </div>
            {resposta && <ResultadoMeta r={resposta} />}
          </div>
        </Panel>
      )}

      <Panel title="Adicionar / Atualizar Métrica">
        <div className="p-3.5 lg:p-5">
          {/* No celular os campos viram grade de 2 colunas; no desktop, uma
              linha só, como era. */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-2.5 lg:gap-3">
            <label className="block col-span-2 lg:col-span-1">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px]">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => selecionarData(e.target.value)}
                className="w-full lg:w-auto bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-[13px] text-tx outline-none focus:border-gold/50"
              />
            </label>

            <label className="block lg:w-[160px]">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px]">Investimento (R$)</span>
              <MoneyInput cents={cents} onChange={(c) => { setCents(c); setSalvo(false); }} />
            </label>

            <label className="block lg:w-[110px]">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px]">Leads</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={leads || ''}
                placeholder="0"
                onChange={(e) => { setLeads(Math.max(0, Math.floor(Number(e.target.value) || 0))); setSalvo(false); }}
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-[13px] text-tx outline-none focus:border-gold/50"
              />
            </label>

            <button
              onClick={salvar}
              className={`col-span-2 lg:col-span-1 inline-flex items-center justify-center gap-2 px-5 py-[11px] rounded-[10px] text-[13px] font-semibold transition-colors ${
                salvo ? 'bg-grn/15 text-grn border border-grn/40' : 'bg-white text-bg active:bg-white/90'
              }`}
            >
              {salvo ? <><Check size={16} /> Salvo</> : <><Save size={16} /> Salvar</>}
            </button>
          </div>

          <p className="text-[12px] text-dim2 mt-4 leading-relaxed">
            {metaDisponivel ? (
              <>
                Hoje e ontem vêm do <b className="text-dim">Meta automaticamente</b> — um valor digitado nesses dias é
                trocado pelo do Meta na próxima sincronização. Use o formulário para <b className="text-dim">leads</b> e
                para dias mais antigos.
              </>
            ) : (
              'Lance o gasto geral de anúncios e os leads de cada dia.'
            )}
          </p>
        </div>
      </Panel>

      <Panel title="Histórico de Métricas">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Data</th>
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Origem</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Investimento</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Leads</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {historico.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-dim2">Nenhuma métrica lançada ainda.</td>
                </tr>
              ) : (
                historico.map((d) => (
                  <tr key={d.data} className="border-t border-line/70 hover:bg-white/[0.015]">
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-tx font-medium">{formatData(d.data)}</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4">
                      {d.ads_origem === 'meta' ? (
                        <span className="inline-flex items-center gap-1.5 text-grn text-[12.5px]">
                          <Zap size={12} /> Meta Ads · automático
                          {d.ads_detalhe?.some((p) => p.moeda !== 'BRL') && (
                            <span className="text-dim2 mono text-[10.5px]">
                              {d.ads_detalhe
                                .filter((p) => p.moeda !== 'BRL')
                                .map((p) => `${p.moeda} ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × ${p.cotacao.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`)
                                .join(' + ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-dim">{d.ads_origem === 'manual' ? 'Manual' : 'Geral'}</span>
                      )}
                    </td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right text-tx mono">{formatBRL(reaisToCents(d.investimento_ads))}</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right text-tx mono">{d.leads ?? 0}</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                      <button
                        onClick={() => excluir(d.data)}
                        className="inline-grid place-items-center w-8 h-8 rounded-lg text-red/80 hover:text-red hover:bg-red/10 transition-colors"
                        title="Excluir lançamento"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** Resultado de uma sincronização ou comparação com o Meta. */
function ResultadoMeta({ r }: { r: RespostaMeta }) {
  if (!r.ok) {
    return (
      <div className="flex items-start gap-2.5 rounded-[10px] border border-yel/40 bg-yel/[0.07] px-3.5 py-3 text-[12.5px] text-dim leading-relaxed">
        <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
        <span>
          {r.configurado === false ? (
            <>
              <b className="text-yel">Falta ligar a dashboard ao Meta.</b> {r.aviso}. Depois de corrigir na Vercel, faça
              o Redeploy e espere ficar Ready.
            </>
          ) : (
            r.aviso
          )}
        </span>
      </div>
    );
  }
  const brl = (v: number) => formatBRL(reaisToCents(v));
  return (
    <div className="rounded-[12px] border border-line overflow-hidden">
      <div className="px-3.5 py-2.5 text-[11.5px] text-dim bg-card2 border-b border-line">
        {r.simulado
          ? 'Comparação — nada foi gravado. "Na dashboard" é o valor lançado hoje em cada dia.'
          : 'Sincronizado: estes valores já estão na dashboard.'}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[520px]">
          <thead>
            <tr className="text-dim2 text-[10.5px] uppercase tracking-wide">
              <th className="text-left font-semibold px-3.5 py-2">Data</th>
              <th className="text-right font-semibold px-3.5 py-2">No Meta</th>
              <th className="text-right font-semibold px-3.5 py-2">Em R$</th>
              <th className="text-right font-semibold px-3.5 py-2">{r.simulado ? 'Na dashboard' : 'Antes'}</th>
              <th className="text-right font-semibold px-3.5 py-2">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {r.dias.map((d) => {
              const dif = Math.round((d.reais - d.na_dashboard) * 100) / 100;
              return (
                <tr key={d.data} className="border-t border-line/70">
                  <td className="px-3.5 py-2 text-tx">{formatData(d.data)}</td>
                  <td className="px-3.5 py-2 text-right mono text-dim">
                    {d.partes.length === 0
                      ? '—'
                      : d.partes
                          .map((p) =>
                            p.moeda === 'BRL'
                              ? brl(p.valor)
                              : `${p.moeda} ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × ${p.cotacao.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`,
                          )
                          .join(' + ')}
                  </td>
                  <td className="px-3.5 py-2 text-right mono text-tx font-semibold">{brl(d.reais)}</td>
                  <td className="px-3.5 py-2 text-right mono text-dim">{brl(d.na_dashboard)}</td>
                  <td className={`px-3.5 py-2 text-right mono ${dif === 0 ? 'text-grn' : 'text-yel'}`}>
                    {dif === 0 ? 'igual' : `${dif > 0 ? '+' : ''}${brl(dif)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
