import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Banknote,
  CalendarClock,
  Crosshair,
  Megaphone,
  ShoppingCart,
  Target,
  TriangleAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact, formatMultiplier, formatPercent, reaisToCents, safeDiv } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { type DescontoFrustrados, calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { planosSemCusto } from '@/lib/custosConfig';
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
  // Padrão 'nenhum' para ESPELHAR o BlueSales: lá os frustrados aparecem
  // na lista de perdas mas não entram no Lucro Líquido — conferido no P&L
  // deles de 01–08/09/2026, onde os R$ 1.170,00 ficam de fora dos Custos
  // Totais. Quem quiser a perda de caixa troca no botão do rodapé.
  const [modoFrustrados, setModoFrustrados] = useState<DescontoFrustrados>('nenhum');

  const pnl = useMemo(
    () => calcularPnl(dailies, custos, periodo, { descontarFrustrados: modoFrustrados }, pedidos),
    [dailies, custos, periodo, modoFrustrados, pedidos],
  );

  const vazio = pnl.receita_aprovada === 0 && pnl.custos_totais_reais === 0;
  const lucroPositivo = pnl.lucro_real >= 0;

  // Desempenho por vendedor no período (fonte: pedidos do BlueSales).
  const agg = useMemo(() => agregarPedidos(pedidos, periodo), [pedidos, periodo]);
  // Filtra quem ficou zerado: um vendedor entra na lista só por ter tido
  // pagamento no período, e apareceria como barra vazia.
  const barrasAgendado = useMemo(
    () =>
      [...agg.porAtendente]
        .filter((a) => a.valor_agendado > 0)
        .sort((a, b) => b.valor_agendado - a.valor_agendado)
        .map((a) => ({ label: a.nome, value: a.valor_agendado, display: formatBRLCompact(reaisToCents(a.valor_agendado)) })),
    [agg],
  );
  const barrasPedidos = useMemo(
    () =>
      [...agg.porAtendente]
        .filter((a) => a.pedidos > 0)
        .sort((a, b) => b.pedidos - a.pedidos)
        .map((a) => ({ label: a.nome, value: a.pedidos, display: String(a.pedidos) })),
    [agg],
  );

  // Plano sem custo cadastrado entra na conta valendo ZERO e infla o
  // lucro sem nada denunciar. Melhor um aviso feio do que um número
  // bonito e errado.
  const semCusto = useMemo(() => planosSemCusto(pedidos, periodo), [pedidos, periodo]);

  return (
    <div className="flex flex-col gap-4">
      {semCusto.length > 0 && (
        <div className="flex items-start gap-3 rounded-[12px] border border-yel/40 bg-yel/[0.07] px-4 py-[13px]">
          <TriangleAlert size={17} className="text-yel shrink-0 mt-[1px]" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-yel">
              {semCusto.length === 1 ? 'Um plano vendido não tem custo cadastrado' : `${semCusto.length} planos vendidos não têm custo cadastrado`}
            </div>
            <div className="text-[12.5px] text-dim mt-[3px] leading-relaxed">
              Enquanto isso, {semCusto.length === 1 ? 'ele entra' : 'eles entram'} na conta com{' '}
              <b className="text-tx">custo de produto R$ 0,00</b> — o lucro e a margem estão acima do real. Me avise
              para eu cadastrar:
              <span className="block mono text-[11.5px] text-tx2 mt-1.5">{semCusto.join(' · ')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Herói — Faturamento Agendado (esquerda) · Lucro Real (direita) */}
      {/* No celular cada metade vira um bloco centralizado, com o ícone
          acima e o número grande; no desktop volta a ser ícone ao lado. */}
      <div className="w-full bg-card border border-line rounded-card px-4 lg:px-[22px] py-5 lg:py-[18px] grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 lg:gap-4 sm:justify-center text-center sm:text-left pb-5 sm:pb-0 sm:pr-6">
          <div className="w-[46px] h-[46px] sm:w-[38px] sm:h-[38px] lg:w-[42px] lg:h-[42px] rounded-[14px] sm:rounded-[12px] grid place-items-center bg-pur/[0.13] text-pur2 shrink-0">
            <CalendarClock className="w-6 h-6 sm:w-5 sm:h-5" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 w-full sm:w-auto">
            <div className="text-[13px] sm:text-[11.5px] lg:text-[12px] text-dim font-medium">Faturamento Agendado</div>
            <div className="mono text-[34px] sm:text-[25px] lg:text-[30px] font-extrabold text-pur2 tracking-tight leading-tight truncate mt-0.5 sm:mt-0">
              {formatBRL(pnl.valor_agendado)}
            </div>
            <div className="text-[12px] sm:text-[10.5px] text-dim2 mt-1 sm:mt-0.5">{pnl.qtd_agendados} pedidos no período</div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 lg:gap-4 sm:justify-center text-center sm:text-left pt-5 sm:pt-0 sm:pl-6">
          <div
            className={`w-[46px] h-[46px] sm:w-[38px] sm:h-[38px] lg:w-[42px] lg:h-[42px] rounded-[14px] sm:rounded-[12px] grid place-items-center shrink-0 ${
              lucroPositivo ? 'bg-grn/[0.13] text-grn' : 'bg-red/[0.13] text-red'
            }`}
          >
            {lucroPositivo ? (
              <TrendingUp className="w-6 h-6 sm:w-5 sm:h-5" strokeWidth={1.9} />
            ) : (
              <TrendingDown className="w-6 h-6 sm:w-5 sm:h-5" strokeWidth={1.9} />
            )}
          </div>
          <div className="min-w-0 w-full sm:w-auto">
            <div className="text-[13px] sm:text-[11.5px] lg:text-[12px] text-dim font-medium">
              {lucroPositivo ? 'Lucro Real (período)' : 'Prejuízo Real (período)'}
            </div>
            <div
              className={`mono text-[34px] sm:text-[25px] lg:text-[30px] font-extrabold tracking-tight leading-tight truncate mt-0.5 sm:mt-0 ${
                lucroPositivo ? 'text-grn' : 'text-red'
              }`}
            >
              {formatBRL(pnl.lucro_real)}
            </div>
            <div className="text-[12px] sm:text-[10.5px] text-dim2 mt-1 sm:mt-0.5">Margem {formatPercent(pnl.margem_real)}</div>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
            <KpiCard Icon={Banknote} color="#34d399" label="Receita Aprovada" value={formatBRL(pnl.receita_aprovada)} sub={`${pnl.qtd_pagamentos} pagamentos`} />
            <KpiCard
              Icon={TrendingDown}
              color="#fb7185"
              label="Custos Totais Reais"
              value={formatBRL(pnl.custos_totais_reais)}
              sub={`Afterpay ${formatBRL(pnl.custos_afterpay)} + var. ${formatBRL(pnl.custos_variaveis_total)}`}
            />
            {/* O gasto sai do que foi lançado na tela Marketing. A fatia é
                sobre o AGENDADO: sobre o aprovado leria 0% de manhã, antes
                de o primeiro pagamento entrar. */}
            <KpiCard
              Icon={Megaphone}
              color="#c084fc"
              label="Anúncios (gasto)"
              value={formatBRL(pnl.investimento_ads)}
              sub={
                pnl.investimento_ads > 0
                  ? `${formatPercent(safeDiv(pnl.investimento_ads, pnl.valor_agendado))} do agendado`
                  : 'lance na tela Marketing'
              }
            />
            {/* Sobre a MESMA safra do CPA e do ROAS: o que foi agendado no
                período e os custos que esses pedidos geram. É projeção — o
                caixa de verdade fica no Lucro Real, lá em cima. */}
            <KpiCard
              Icon={Target}
              color="#60a5fa"
              label="Margem do agendado"
              value={formatPercent(pnl.margem_agendado)}
              sub={`${formatBRL(pnl.lucro_agendado)} de lucro projetado`}
            />
          </div>

          {/* KPIs linha 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
            <KpiCard Icon={ShoppingCart} color="#c084fc" label="Total de Pedidos" value={String(pnl.qtd_agendados)} sub="agendados no período" />
            <KpiCard Icon={BadgeCheck} color="#34d399" label="Ticket Médio" value={formatBRL(pnl.ticket_medio)} sub="sobre pedidos aprovados" />
            <KpiCard
              Icon={Crosshair}
              color="#60a5fa"
              label="CPA por agendamento"
              value={formatBRL(pnl.cpa)}
              sub={`sobre ${pnl.qtd_agendados} agendamento${pnl.qtd_agendados === 1 ? '' : 's'}`}
            />
            <KpiCard Icon={BarChart3} color="#f472b6" label="ROAS agendado" value={formatMultiplier(pnl.roas)} sub={`${formatBRL(pnl.valor_agendado)} agendado · ROI real ${formatPercent(pnl.roi_real)}`} />
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
