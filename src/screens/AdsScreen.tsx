import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Megaphone } from 'lucide-react';
import type { AfterpayDaily, Periodo } from '@/types';
import { distribuirInteiro, formatBRL, formatMultiplier, formatPercent, reaisToCents } from '@/lib/money';
import { diasDoPeriodo, formatDiaMes, isDentro } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';

function zeroDaily(data: string): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0, qtd_agendados: 0,
  };
}

export function AdsScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, pedidos, lancarDailies } = useData();
  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);

  // Ads já lançado no período (soma do afterpay_daily).
  const adsAtual = useMemo(
    () =>
      dailies
        .filter((d) => isDentro(d.data, inicio, fim))
        .reduce((acc, d) => acc + reaisToCents(d.investimento_ads), 0),
    [dailies, inicio, fim],
  );

  const [cents, setCents] = useState(adsAtual);
  const [salvo, setSalvo] = useState(false);

  const dias = useMemo(() => (fim >= inicio ? diasDoPeriodo(inicio, fim) : []), [inicio, fim]);

  // Prévia: P&L do período com esse valor de Ads.
  const preview = useMemo(() => {
    if (dias.length === 0) return null;
    const dist = distribuirInteiro(cents, dias.length);
    const cand = dias.map((data, i) => ({ ...zeroDaily(data), investimento_ads: dist[i] / 100 }));
    return calcularPnl(cand, custos, { inicio, fim }, {}, pedidos);
  }, [dias, cents, custos, inicio, fim, pedidos]);

  function salvar() {
    if (dias.length === 0) return;
    const dist = distribuirInteiro(cents, dias.length);
    const novos = dias.map((data, i) => ({ ...zeroDaily(data), investimento_ads: dist[i] / 100 }));
    lancarDailies(novos);
    setSalvo(true);
  }

  return (
    <div className="flex flex-col gap-4 max-w-[720px] mx-auto w-full">
      <Panel title="Investimento em Ads (Meta)" hint="o único custo que nenhuma plataforma envia">
        <div className="p-5 flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-[10px] bg-blu/15 grid place-items-center text-blu shrink-0">
              <Megaphone size={20} />
            </span>
            <p className="m-0 text-[13px] text-dim leading-relaxed">
              Digite quanto você gastou de <b className="text-dim">tráfego no Meta</b> neste período. A receita e os
              demais custos já vêm do BlueSales automaticamente — aqui só entra o Ads, que completa o Lucro Real, o
              ROAS e o CPA.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Início do período">
              <div className="flex items-center gap-2 bg-card2 border border-line2 rounded-[10px] px-3 py-[9px]">
                <CalendarDays size={15} className="text-dim2" />
                <input type="date" value={inicio} max={fim} onChange={(e) => { setInicio(e.target.value); setSalvo(false); }} className="bg-transparent text-[13px] text-tx outline-none [color-scheme:dark] w-full" />
              </div>
            </Campo>
            <Campo label="Fim do período">
              <div className="flex items-center gap-2 bg-card2 border border-line2 rounded-[10px] px-3 py-[9px]">
                <CalendarDays size={15} className="text-dim2" />
                <input type="date" value={fim} min={inicio} onChange={(e) => { setFim(e.target.value); setSalvo(false); }} className="bg-transparent text-[13px] text-tx outline-none [color-scheme:dark] w-full" />
              </div>
            </Campo>
          </div>

          <Campo label="Investimento em Ads no período">
            <MoneyInput cents={cents} onChange={(c) => { setCents(c); setSalvo(false); }} autoFocus />
            {adsAtual > 0 && (
              <span className="block text-[11px] text-dim2 mt-1">
                Já lançado neste período: {formatBRL(adsAtual)}
                {cents !== adsAtual && ' (será substituído)'}
              </span>
            )}
          </Campo>

          {/* Prévia do impacto */}
          {preview && (
            <div className="rounded-[12px] border border-line2 bg-card2 p-4">
              <div className="text-[9.5px] tracking-[0.16em] uppercase font-bold text-dim2 mb-3">
                Com esse Ads, o período fica ({formatDiaMes(inicio)}–{formatDiaMes(fim)})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Mini label="Lucro Real" valor={formatBRL(preview.lucro_real)} cor={preview.lucro_real >= 0 ? '#34d399' : '#fb7185'} />
                <Mini label="Margem" valor={formatPercent(preview.margem_real)} cor="#60a5fa" />
                <Mini label="ROAS" valor={formatMultiplier(preview.roas)} cor="#f472b6" />
                <Mini label="CPA" valor={formatBRL(preview.cpa)} cor="#c084fc" />
              </div>
            </div>
          )}

          {salvo ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-grn/30 bg-grn/[0.08] px-4 py-3 text-grn text-[13px] font-semibold">
              <CheckCircle2 size={17} /> Ads salvo na nuvem! O P&L já atualizou.
            </div>
          ) : (
            <button
              onClick={salvar}
              disabled={dias.length === 0}
              className="self-start inline-flex items-center gap-2 text-white px-5 py-[11px] rounded-[10px] text-[13.5px] font-semibold bg-gradient-to-br from-pur3 to-pur disabled:opacity-40"
            >
              Salvar Ads do período
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-dim2 font-medium mb-[6px]">{label}</span>
      {children}
    </label>
  );
}

function Mini({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-wide uppercase text-dim2 font-bold">{label}</div>
      <div className="mono text-[15px] font-bold mt-0.5" style={{ color: cor }}>{valor}</div>
    </div>
  );
}
