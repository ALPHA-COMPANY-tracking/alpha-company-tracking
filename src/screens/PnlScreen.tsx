import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Banknote,
  CalendarClock,
  Megaphone,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatMultiplier, formatPercent } from '@/lib/money';
import { calcularPnl } from '@/lib/pnl';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { Demonstrativo } from '@/components/pnl/Demonstrativo';
import { GapBlock } from '@/components/pnl/GapBlock';
import { EvolucaoChart } from '@/components/pnl/EvolucaoChart';

export function PnlScreen({
  periodo,
  onAddCusto,
  onLancarManual,
}: {
  periodo: Periodo;
  onAddCusto: () => void;
  onLancarManual?: () => void;
}) {
  const { dailies, custos, categorias, pedidos } = useData();
  const [frustrados, setFrustrados] = useState(false);

  const pnl = useMemo(
    () => calcularPnl(dailies, custos, periodo, { considerarFrustrados: frustrados }, pedidos),
    [dailies, custos, periodo, frustrados, pedidos],
  );

  const vazio = pnl.receita_aprovada === 0 && pnl.custos_totais_reais === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Herói — Faturamento Agendado (esquerda) · Lucro Real (direita) */}
      <div className="max-w-[720px] mx-auto w-full bg-card border border-line rounded-card px-[22px] py-[18px] grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <div className="flex items-center gap-4 justify-center pb-4 sm:pb-0 sm:pr-6">
          <div className="w-[42px] h-[42px] rounded-[12px] grid place-items-center bg-pur/[0.13] text-pur2 shrink-0">
            <CalendarClock size={20} strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[12px] text-dim font-medium">Faturamento Agendado</div>
            <div className="mono text-[30px] font-extrabold text-pur2 tracking-tight leading-tight">{formatBRL(pnl.valor_agendado)}</div>
            <div className="text-[10.5px] text-dim2 mt-0.5">{pnl.qtd_agendados} pedidos no período</div>
          </div>
        </div>
        <div className="flex items-center gap-4 justify-center pt-4 sm:pt-0 sm:pl-6">
          <div className="w-[42px] h-[42px] rounded-[12px] grid place-items-center bg-grn/[0.13] text-grn shrink-0">
            <TrendingUp size={20} strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[12px] text-dim font-medium">Lucro Real (período)</div>
            <div className="mono text-[30px] font-extrabold text-grn tracking-tight leading-tight">{formatBRL(pnl.lucro_real)}</div>
            <div className="text-[10.5px] text-dim2 mt-0.5">Margem {formatPercent(pnl.margem_real)}</div>
          </div>
        </div>
      </div>

      {vazio ? (
        <Panel>
          <div className="p-10 text-center">
            <div className="text-[15px] font-semibold text-tx mb-2">Nenhum dado neste período</div>
            <div className="text-[13px] text-dim mb-5">
              Escolha outro período no topo, sincronize com o Afterpay ou lance os números manualmente.
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {onLancarManual && (
                <button
                  onClick={onLancarManual}
                  className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-white bg-gradient-to-br from-pur3 to-pur"
                >
                  Lançar Ads (Meta)
                </button>
              )}
              <button
                onClick={onAddCusto}
                className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-dim border border-line2 hover:text-tx"
              >
                Adicionar custo
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          {/* KPIs linha 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
            <KpiCard Icon={Banknote} color="#34d399" label="Receita Aprovada" value={formatBRL(pnl.receita_aprovada)} sub={`${pnl.qtd_pagamentos} pagamentos`} />
            <KpiCard
              Icon={TrendingDown}
              color="#fb7185"
              label="Custos Totais Reais"
              value={formatBRL(pnl.custos_totais_reais)}
              sub={`Afterpay ${formatBRL(pnl.custos_afterpay)} + var. ${formatBRL(pnl.custos_variaveis_total)}`}
            />
            <KpiCard
              Icon={Wallet}
              color="#c084fc"
              label="Custos Variáveis"
              value={formatBRL(pnl.custos_variaveis_total)}
              sub={`${pnl.qtd_lancamentos} lançamentos · ${formatPercent(pnl.receita_aprovada ? pnl.custos_variaveis_total / pnl.receita_aprovada : 0)} da receita`}
            />
            <KpiCard Icon={Target} color="#60a5fa" label="Margem Real" value={formatPercent(pnl.margem_real)} sub={`Afterpay indica ${formatPercent(pnl.margem_afterpay)}`} />
          </div>

          {/* KPIs linha 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
            <KpiCard Icon={ShoppingCart} color="#c084fc" label="Total de Pedidos" value={String(pnl.qtd_agendados)} sub="agendados no período" />
            <KpiCard Icon={BadgeCheck} color="#34d399" label="Ticket Médio" value={formatBRL(pnl.ticket_medio)} sub="sobre pedidos aprovados" />
            <KpiCard Icon={Megaphone} color="#60a5fa" label="CPA" value={formatBRL(pnl.cpa)} sub={`${formatBRL(pnl.investimento_ads)} em Ads`} />
            <KpiCard Icon={BarChart3} color="#f472b6" label="ROAS" value={formatMultiplier(pnl.roas)} sub={`ROI real ${formatPercent(pnl.roi_real)}`} />
          </div>

          <Demonstrativo
            pnl={pnl}
            categorias={categorias}
            custos={custos}
            periodo={periodo}
            considerarFrustrados={frustrados}
            onToggleFrustrados={setFrustrados}
            onAddCusto={onAddCusto}
          />

          <GapBlock pnl={pnl} />

          <Panel title="Evolução no período" hint="valores diários">
            <div className="p-3">
              <EvolucaoChart dailies={dailies} custos={custos} periodo={periodo} opts={{ considerarFrustrados: frustrados }} />
              <div className="flex gap-[18px] px-3 pt-1 pb-2 text-[11.5px] text-dim">
                <span className="flex items-center gap-2"><i className="w-[9px] h-[9px] rounded-sm bg-grn inline-block" />Receita aprovada</span>
                <span className="flex items-center gap-2"><i className="w-[9px] h-[9px] rounded-sm bg-pur inline-block" />Lucro real</span>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
