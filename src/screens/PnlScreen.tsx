import { useMemo, useState } from 'react';
import { BadgeCheck, BarChart3, Crosshair, Receipt, Target, TriangleAlert, TrendingDown } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact, formatMultiplier, formatPercent, reaisToCents } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { type DescontoFrustrados, calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { planosSemCusto } from '@/lib/custosConfig';
import { taxasPorDia } from '@/lib/taxas';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { Demonstrativo } from '@/components/pnl/Demonstrativo';
import { GapBlock } from '@/components/pnl/GapBlock';
import { BarsVertical } from '@/components/viz/BarsVertical';
import { Destaques } from '@/components/pnl/Destaques';
import { COR } from '@/lib/cores';
import { saudacao } from '@/lib/saudacao';

export function PnlScreen({
  periodo,
  onAddCusto,
  onLancarManual,
  onLancarTaxa,
}: {
  periodo: Periodo;
  onAddCusto: () => void;
  onLancarManual?: () => void;
  /** Leva para a tela Taxas — o aviso de taxa faltando é clicável. */
  onLancarTaxa?: () => void;
}) {
  const { dailies, custos, categorias, pedidos } = useData();
  // Padrão 'nenhum' para ESPELHAR o BlueSales: lá os frustrados aparecem
  // na lista de perdas mas não entram no Lucro Líquido — conferido no P&L
  // deles de 01–08/09/2026, onde os R$ 1.170,00 ficam de fora dos Custos
  // Totais. Quem quiser a perda de caixa troca no botão do rodapé.
  const [modoFrustrados, setModoFrustrados] = useState<DescontoFrustrados>('nenhum');

  // Memorizado: os gráficos do topo recalculam o P&L dia a dia, e um
  // objeto novo a cada render refaria tudo à toa.
  const opts = useMemo(() => ({ descontarFrustrados: modoFrustrados }), [modoFrustrados]);
  const pnl = useMemo(() => calcularPnl(dailies, custos, periodo, opts, pedidos), [dailies, custos, periodo, opts, pedidos]);

  const vazio = pnl.receita_aprovada === 0 && pnl.custos_totais_reais === 0;

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

  // Mesma ideia para a taxa do BlueSales: dia com pagamento e sem taxa
  // lançada entra como R$ 0,00 e desalinha DUAS linhas — a taxa e a
  // comissão do vendedor, que sai da receita menos a taxa. Foi o que fez
  // o P&L de 01–08/09 fechar R$ 4,98 acima do BlueSales.
  const diasSemTaxa = useMemo(
    () => taxasPorDia(pedidos, dailies, periodo).filter((t) => t.fonte === 'ausente' && t.qtd_pagamentos > 0),
    [pedidos, dailies, periodo],
  );

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

      {diasSemTaxa.length > 0 && (
        <button
          onClick={onLancarTaxa}
          className="w-full text-left flex items-start gap-3 rounded-[12px] border border-yel/40 bg-yel/[0.07] px-4 py-[13px] hover:bg-yel/[0.11] transition-colors"
        >
          <Receipt size={17} className="text-yel shrink-0 mt-[1px]" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-yel">
              {diasSemTaxa.length === 1
                ? 'A taxa do BlueSales de 1 dia não foi lançada'
                : `A taxa do BlueSales de ${diasSemTaxa.length} dias não foi lançada`}
            </div>
            <div className="text-[12.5px] text-dim mt-[3px] leading-relaxed">
              {diasSemTaxa.length === 1 ? 'Esse dia entra' : 'Esses dias entram'} com{' '}
              <b className="text-tx">taxa R$ 0,00</b>, e isso desalinha duas linhas: a taxa e a{' '}
              <b className="text-tx">comissão do vendedor</b>, que sai da receita menos a taxa. Pegue o valor no
              Resultado Diário do BlueSales — clique aqui para lançar.
              <span className="block mono text-[11.5px] text-tx2 mt-1.5">
                {diasSemTaxa.map((t) => formatDiaMes(t.data)).join(' · ')}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Saudação no celular — no computador ela fica na barra do topo. */}
      <div className="lg:hidden px-0.5">
        <div className="text-[19px] font-extrabold text-tx tracking-tight">{saudacao()}, Jonas! 👋</div>
        <div className="text-[12.5px] text-dim mt-0.5">Aqui está o resumo da sua operação.</div>
      </div>

      {/* Topo com tendência: agendado, pagamentos, anúncios e lucro. */}
      <Destaques pnl={pnl} periodo={periodo} dailies={dailies} custos={custos} pedidos={pedidos} opts={opts} />

      {vazio ? (
        <Panel>
          <div className="p-10 text-center">
            {agg.qtd_agendados > 0 ? (
              <>
                <div className="text-[15px] font-semibold text-tx mb-2">Nenhum pagamento aprovado ainda</div>
                <div className="text-[13px] text-dim mb-5">
                  Você tem <b className="text-tx">{agg.qtd_agendados} agendamento{agg.qtd_agendados > 1 ? 's' : ''}</b>{' '}
                  somando <b className="text-gold2">{formatBRL(reaisToCents(agg.valor_agendado))}</b>. O P&L aparece
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
                  className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-[#15120a] bg-gold-metal"
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
          {/* Indicadores. Agendado, pagamentos, anúncios e lucro subiram
              para o topo; aqui fica o que complementa. Número com cor só
              quando a cor significa algo (custo, perda) — o resto em branco
              com o ícone dourado. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-2 lg:gap-[14px]">
            <KpiCard
              Icon={TrendingDown}
              color={COR.vermelho}
              label="Custos Totais Reais"
              value={formatBRL(pnl.custos_totais_reais)}
              sub={`Afterpay ${formatBRL(pnl.custos_afterpay)} + var. ${formatBRL(pnl.custos_variaveis_total)}`}
            />
            {/* Sobre a MESMA safra do CPA e do ROAS: o que foi agendado no
                período e os custos que esses pedidos geram. É projeção — o
                caixa de verdade fica no Lucro Real, lá em cima. */}
            <KpiCard
              Icon={Target}
              color={COR.ouro}
              valueColor={COR.texto}
              label="Margem do agendado"
              value={formatPercent(pnl.margem_agendado)}
              sub={`${formatBRL(pnl.lucro_agendado)} de lucro projetado`}
            />
            <KpiCard
              Icon={TriangleAlert}
              color={COR.ambar}
              label="Frustrados"
              value={formatBRL(pnl.valor_frustrado)}
              sub={
                pnl.qtd_frustrados > 0
                  ? `${pnl.qtd_frustrados} pedido${pnl.qtd_frustrados === 1 ? '' : 's'} perdido${pnl.qtd_frustrados === 1 ? '' : 's'}`
                  : 'nenhum no período'
              }
            />
            <KpiCard
              Icon={BadgeCheck}
              color={COR.ouro}
              valueColor={COR.texto}
              label="Ticket Médio"
              value={formatBRL(pnl.ticket_medio)}
              sub="sobre pedidos aprovados"
            />
            <KpiCard
              Icon={Crosshair}
              color={COR.ouro}
              valueColor={COR.texto}
              label="CPA por agendamento"
              value={formatBRL(pnl.cpa)}
              sub={`sobre ${pnl.qtd_agendados} agendamento${pnl.qtd_agendados === 1 ? '' : 's'}`}
            />
            <KpiCard
              Icon={BarChart3}
              color={COR.ouro}
              valueColor={COR.texto}
              label="ROAS agendado"
              value={formatMultiplier(pnl.roas)}
              sub={`ROI real ${formatPercent(pnl.roi_real)}`}
            />
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
