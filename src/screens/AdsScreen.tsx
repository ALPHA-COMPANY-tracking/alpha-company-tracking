import { useMemo, useState } from 'react';
import { Check, Save, Trash2 } from 'lucide-react';
import type { AfterpayDaily, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';

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
  const { dailies, lancarDaily } = useData();
  const [data, setData] = useState(hojeLocal());
  const [cents, setCents] = useState(0);
  const [taxa, setTaxa] = useState(0);
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
    setTaxa(ex ? reaisToCents(ex.taxas_plataforma) : 0);
    setLeads(ex?.leads ?? 0);
  }

  function salvar() {
    if (!data) return;
    // Parte do que já existe: gravar do zero apagaria os outros campos do dia.
    const base = doDia(data) ?? zeroDaily(data);
    lancarDaily({ ...base, investimento_ads: cents / 100, taxas_plataforma: taxa / 100, leads });
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
        .filter((d) => d.investimento_ads > 0 || (d.leads ?? 0) > 0 || d.taxas_plataforma > 0)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [dailies],
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Marketing</h1>
        <p className="text-[13px] text-dim mt-0.5">Registre o gasto geral de anúncios e a quantidade de leads por dia</p>
      </div>

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
                className="w-full lg:w-auto bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-[13px] text-tx outline-none [color-scheme:dark] focus:border-gold/50"
              />
            </label>

            <label className="block lg:w-[160px]">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px]">Investimento (R$)</span>
              <MoneyInput cents={cents} onChange={(c) => { setCents(c); setSalvo(false); }} />
            </label>

            <label className="block lg:w-[130px]">
              <span className="block text-[11px] text-dim2 font-medium mb-[6px]" title="Taxa de plataforma cobrada pelo BlueSales neste dia">
                Taxa BlueSales
              </span>
              <MoneyInput cents={taxa} onChange={(c) => { setTaxa(c); setSalvo(false); }} />
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
                salvo ? 'bg-grn/15 text-grn border border-grn/40' : 'bg-white text-[#141419] active:bg-white/90'
              }`}
            >
              {salvo ? <><Check size={16} /> Salvo</> : <><Save size={16} /> Salvar</>}
            </button>
          </div>

          <p className="text-[12px] text-dim2 mt-4 leading-relaxed">
            O lançamento manual <b className="text-dim">SOMA</b> ao gasto sincronizado do Meta Ads do mesmo dia, não o
            substitui. Use para o que a integração não enxerga (outras plataformas, criativo, influenciador).
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
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Taxa</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Leads</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {historico.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-dim2">Nenhuma métrica lançada ainda.</td>
                </tr>
              ) : (
                historico.map((d) => (
                  <tr key={d.data} className="border-t border-line/70 hover:bg-white/[0.015]">
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-tx font-medium">{formatData(d.data)}</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-dim">Geral</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right text-tx mono">{formatBRL(reaisToCents(d.investimento_ads))}</td>
                    <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right text-dim mono">{formatBRL(reaisToCents(d.taxas_plataforma))}</td>
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
