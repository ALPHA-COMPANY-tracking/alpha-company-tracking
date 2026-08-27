import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import type { AfterpayDaily, Periodo } from '@/types';
import { distribuirInteiro, formatBRL, formatPercent, safeDiv } from '@/lib/money';
import { diasDoPeriodo, formatDiaMes, isDentro } from '@/lib/dates';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';

interface Valores {
  receita: number;
  taxas: number;
  produtos: number;
  frete: number;
  comVend: number;
  comCob: number;
  ads: number;
  taxasInv: number;
  frustrado: number;
  agendado: number;
  qtdPag: number;
  qtdFrus: number;
  qtdAge: number;
}

const ZERO: Valores = {
  receita: 0, taxas: 0, produtos: 0, frete: 0, comVend: 0, comCob: 0, ads: 0,
  taxasInv: 0, frustrado: 0, agendado: 0, qtdPag: 0, qtdFrus: 0, qtdAge: 0,
};

export function ManualEntryScreen({ periodo, onConcluir }: { periodo: Periodo; onConcluir?: () => void }) {
  const { dailies, lancarDailies } = useData();
  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);
  const [v, setV] = useState<Valores>(ZERO);
  const [salvo, setSalvo] = useState(false);

  const set = (k: keyof Valores) => (val: number) => {
    setV((prev) => ({ ...prev, [k]: val }));
    setSalvo(false);
  };

  const custosAfterpay = v.taxas + v.produtos + v.frete + v.comVend + v.comCob + v.ads + v.taxasInv;
  const lucro = v.receita - custosAfterpay;
  const margem = safeDiv(lucro, v.receita);

  const dias = useMemo(() => (fim >= inicio ? diasDoPeriodo(inicio, fim) : []), [inicio, fim]);
  const conflita = dailies.some((d) => isDentro(d.data, inicio, fim));

  function lancar() {
    if (dias.length === 0) return;
    const n = dias.length;
    const c = (cents: number) => distribuirInteiro(cents, n);
    const rec = c(v.receita), tax = c(v.taxas), prod = c(v.produtos), fre = c(v.frete);
    const cv = c(v.comVend), cc = c(v.comCob), ad = c(v.ads), tinv = c(v.taxasInv);
    const fru = c(v.frustrado), age = c(v.agendado);
    const qp = distribuirInteiro(v.qtdPag, n), qf = distribuirInteiro(v.qtdFrus, n), qa = distribuirInteiro(v.qtdAge, n);

    const novos: AfterpayDaily[] = dias.map((data, i) => ({
      data,
      receita_aprovada: rec[i] / 100,
      qtd_pagamentos: qp[i],
      taxas_plataforma: tax[i] / 100,
      custo_produtos: prod[i] / 100,
      frete: fre[i] / 100,
      comissoes_vendedor: cv[i] / 100,
      comissoes_cobranca: cc[i] / 100,
      investimento_ads: ad[i] / 100,
      taxas_investimento: tinv[i] / 100,
      valor_frustrado: fru[i] / 100,
      qtd_frustrados: qf[i],
      valor_agendado: age[i] / 100,
      qtd_agendados: qa[i],
    }));
    lancarDailies(novos);
    setSalvo(true);
  }

  return (
    <div className="flex flex-col gap-4 max-w-[820px] mx-auto w-full">
      <Panel title="Lançar período manualmente" hint="enquanto o Afterpay não sincroniza sozinho">
        <div className="p-5 flex flex-col gap-5">
          <p className="m-0 text-[13px] text-dim leading-relaxed">
            Digite os <b className="text-dim">totais do período</b> que aparecem no seu Afterpay. O app distribui
            pelos dias e preenche o P&amp;L. Você pode reeditar quando quiser.
          </p>

          {/* Período */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Início do período">
              <div className="flex items-center gap-2 bg-card2 border border-line2 rounded-[10px] px-3 py-[9px]">
                <CalendarDays size={15} className="text-dim2" />
                <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="bg-transparent text-[13px] text-tx outline-none [color-scheme:dark] w-full" />
              </div>
            </Campo>
            <Campo label="Fim do período">
              <div className="flex items-center gap-2 bg-card2 border border-line2 rounded-[10px] px-3 py-[9px]">
                <CalendarDays size={15} className="text-dim2" />
                <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="bg-transparent text-[13px] text-tx outline-none [color-scheme:dark] w-full" />
              </div>
            </Campo>
          </div>

          <Secao titulo="Receita">
            <Money label="Faturamento aprovado" cents={v.receita} onChange={set('receita')} />
            <Numero label="Nº de pagamentos" value={v.qtdPag} onChange={set('qtdPag')} />
          </Secao>

          <Secao titulo="Deduções">
            <Money label="Taxas de plataforma" cents={v.taxas} onChange={set('taxas')} />
          </Secao>

          <Secao titulo="Custos operacionais">
            <Money label="Custo dos produtos" cents={v.produtos} onChange={set('produtos')} />
            <Money label="Frete" cents={v.frete} onChange={set('frete')} />
            <Money label="Comissões vendedor" cents={v.comVend} onChange={set('comVend')} hint="≈ 5% da receita" />
            <Money label="Comissões cobrança" cents={v.comCob} onChange={set('comCob')} hint="≈ 1% da receita" />
          </Secao>

          <Secao titulo="Marketing">
            <Money label="Investimento em Ads" cents={v.ads} onChange={set('ads')} />
            <Money label="Taxas sobre investimento" cents={v.taxasInv} onChange={set('taxasInv')} />
          </Secao>

          <Secao titulo="Perdas (informativo)">
            <Money label="Frustrados (valor)" cents={v.frustrado} onChange={set('frustrado')} />
            <Numero label="Nº de frustrados" value={v.qtdFrus} onChange={set('qtdFrus')} />
          </Secao>

          <Secao titulo="Funil">
            <Money label="Valor agendado" cents={v.agendado} onChange={set('agendado')} />
            <Numero label="Nº de agendados" value={v.qtdAge} onChange={set('qtdAge')} />
          </Secao>

          {/* Prévia */}
          <div className="rounded-[12px] border border-line2 bg-card2 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-5">
              <Previa label="Custos Afterpay" valor={formatBRL(custosAfterpay)} cor="#fb7185" />
              <Previa label="Lucro (Afterpay)" valor={formatBRL(lucro)} cor={lucro >= 0 ? '#34d399' : '#fb7185'} />
              <Previa label="Margem" valor={formatPercent(margem)} cor="#60a5fa" />
            </div>
            <div className="text-[11px] text-dim2">
              {dias.length > 0 ? `${dias.length} dia(s) · ${formatDiaMes(inicio)}–${formatDiaMes(fim)}` : 'período inválido'}
            </div>
          </div>

          {conflita && !salvo && (
            <div className="text-[12px] text-yel bg-yel/10 border border-yel/25 rounded-[10px] px-3 py-2">
              Já existem números lançados nesse período — lançar de novo vai <b>substituí-los</b>.
            </div>
          )}

          {salvo ? (
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-grn/30 bg-grn/[0.08] px-4 py-3">
              <span className="flex items-center gap-2 text-grn text-[13px] font-semibold">
                <CheckCircle2 size={17} /> Período lançado e salvo na nuvem!
              </span>
              {onConcluir && (
                <button onClick={onConcluir} className="text-[13px] font-semibold text-white bg-gradient-to-br from-pur3 to-pur px-4 py-2 rounded-[10px]">
                  Ver no P&amp;L
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={lancar}
              disabled={dias.length === 0}
              className="self-start inline-flex items-center gap-2 text-white px-5 py-[11px] rounded-[10px] text-[13.5px] font-semibold bg-gradient-to-br from-pur3 to-pur disabled:opacity-40"
            >
              Lançar período
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] tracking-[0.16em] uppercase font-bold text-dim2 mb-2">{titulo}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
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

function Money({ label, cents, onChange, hint }: { label: string; cents: number; onChange: (c: number) => void; hint?: string }) {
  return (
    <Campo label={hint ? `${label} · ${hint}` : label}>
      <MoneyInput cents={cents} onChange={onChange} />
    </Campo>
  );
}

function Numero({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Campo label={label}>
      <input
        inputMode="numeric"
        value={value ? String(value) : ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
        placeholder="0"
        className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx mono text-[15px] outline-none focus:border-pur placeholder:text-dim2"
      />
    </Campo>
  );
}

function Previa({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-wide uppercase text-dim2 font-bold">{label}</div>
      <div className="mono text-[15px] font-bold mt-0.5" style={{ color: cor }}>{valor}</div>
    </div>
  );
}
