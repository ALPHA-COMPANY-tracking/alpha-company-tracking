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
import { formatBRL, formatBRLCompact, formatMultiplier, formatPercent, reaisToCents } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { type DescontoFrustrados, calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { Demonstrativo } from '@/components/pnl/Demonstrativo';
import { GapBlock } from '@/components/pnl/GapBlock';
import { BarsVertical } from '@/components/viz/BarsVertical';

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
  const [modoFrustrados, setModoFrustrados] = useState<DescontoFrustrados>('nenhum');

  const pnl = useMemo(
    () => calcularPnl(dailies, custos, periodo, { descontarFrustrados: modoFrustrados }, pedidos),
    [dailies, custos, periodo, modoFrustrados, pedidos],
  );

  const vazio = pnl.receita_aprovada === 0 && pnl.custos_totais_reais === 0;
  const lucroPositivo = pnl.lucro_real >= 0;

  // Desempenho por vendedor no período (fonte: pedidos do BlueSales).
  const agg = useMemo(() => agregarPedidos(pedidos, periodo), [pedidos, periodo]);
  const barrasAgendado = useMemo(
    () =>
      [...agg.porAtendente]
        .sort((a, b) => b.valor_agendado - a.valor_agendado)
        .map((a) => ({ label: a.nome, value: a.valor_agendado, display: formatBRLCompact(reaisToCents(a.valor_agendado)) })),
    [agg],
  );
  const barrasPedidos = useMemo(
    () =>
      [...agg.porAtendente]
        .sort((a, b) => b.pedidos - a.pedidos)
        .map((a) => ({ label: a.nome, value: a.pedidos, display: String(a.pedidos) })),
    [agg],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Herói — Faturamento Agendado (esquerda) · Lucro Real (direita) */}
      <div className="w-full bg-card border border-line rounded-card px-[22px] py-[18px] grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
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
          <div
            className={`w-[42px] h-[42px] rounded-[12px] grid place-items-center shrink-0 ${
              lucroPositivo ? 'bg-grn/[0.13] text-grn' : 'bg-red/[0.13] text-red'
            }`}
          >
            {lucroPositivo ? <TrendingUp size={20} strokeWidth={1.9} /> : <TrendingDown size={20} strokeWidth={1.9} />}
          </div>
          <div>
            <div className="text-[12px] text-dim font-medium">
              {lucroPositivo ? 'Lucro Real (período)' : 'Prejuízo Real (período)'}
            </div>
            <div
              className={`mono text-[30px] font-extrabold tracking-tight leading-tight ${
                lucroPositivo ? 'text-grn' : 'text-red'
              }`}
            >
              {formatBRL(pnl.lucro_real)}
            </div>
            <div className="text-[10.5px] text-dim2 mt-0.5">Margem {formatPercent(pnl.margem_real)}</div>
          </div>
        </div>
      </div>

      {vazio ? (
        <Panel>
          <div className="p-10 text-center">
            {agg.qtd_agendados > 0 ? (
              <>
                <div className="text-[15px] font-semibold text-tx mb-2">Nenhum pagamento aprovado ainda</div>
                <div className="text-[13px] text-dim mb-5">
                  Você tem <b className="text-tx">{agg.qtd_agendados} agendamento{agg.qtd_agendados > 1 ? 's' : ''}</b>{' '}
                  somando <b className="text-pur2">{formatBRL(reaisToCents(agg.valor_agendado))}</b>. O P&L aparece
                  quando o primeiro pagamento entrar.
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold text-tx mb-2">Nenhum dado neste período</div>
                <div className="text-[13px] text-dim mb-5">
                  Escolha outro período no topo, sincronize com o Afterpay ou lance os números manualmente.
                </div>
              </>
            )}
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
            modoFrustrados={modoFrustrados}
            onModoFrustrados={setModoFrustrados}
            onAddCusto={onAddCusto}
          />

          <GapBlock pnl={pnl} />
        </>
      )}

      {/* Desempenho dos vendedores — aparece sempre que houver agendamentos,
          mesmo antes do primeiro pagamento aprovado do período. */}
      {agg.qtd_agendados > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Faturamento Agendado por Vendedor" hint={`${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)} · R$`}>
            <BarsVertical data={barrasAgendado} gradId="pnl-vend-valor" />
          </Panel>

          <Panel title="Agendamentos por Vendedor" hint="quantidade de pedidos">
            <BarsVertical data={barrasPedidos} gradId="pnl-vend-qtd" />
          </Panel>
        </div>
      )}
    </div>
  );
}
