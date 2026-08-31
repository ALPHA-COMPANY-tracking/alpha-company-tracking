import { useMemo } from 'react';
import type { Periodo } from '@/types';
import { formatBRL, formatBRLCompact, formatMultiplier, formatPercent, reaisToCents, safeDiv } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { agregarPedidos } from '@/lib/pedidos';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { LogoMark } from '@/components/Logo';
import { EvolucaoChart } from '@/components/pnl/EvolucaoChart';
import { BarsVertical } from '@/components/viz/BarsVertical';
import { DonutCategorias } from '@/components/viz/DonutCategorias';
import { Funil } from '@/components/viz/Funil';

export function VizScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, categorias, pedidos } = useData();
  const catMap = new Map(categorias.map((c) => [c.id, c]));

  const pnl = useMemo(() => calcularPnl(dailies, custos, periodo, {}, pedidos), [dailies, custos, periodo, pedidos]);
  const agg = useMemo(() => agregarPedidos(pedidos, periodo), [pedidos, periodo]);

  // Só dados reais do BlueSales. Sem pedidos no período, o gráfico fica
  // vazio — nunca com nomes de exemplo.
  const barrasAgendado = [...agg.porAtendente]
    .sort((a, b) => b.valor_agendado - a.valor_agendado)
    .map((a) => ({ label: a.nome, value: a.valor_agendado, display: formatBRLCompact(reaisToCents(a.valor_agendado)) }));

  const barrasPedidos = [...agg.porAtendente]
    .sort((a, b) => b.pedidos - a.pedidos)
    .map((a) => ({ label: a.nome, value: a.pedidos, display: String(a.pedidos) }));

  const barrasPlataforma = [...agg.porMetodo]
    .sort((a, b) => b.pedidos - a.pedidos)
    .map((p) => ({ label: p.nome, value: p.pedidos, display: String(p.pedidos) }));

  const donut = pnl.custos_variaveis_por_categoria.map((agg) => ({
    nome: catMap.get(agg.categoria_id ?? '')?.nome ?? 'Sem categoria',
    valor: agg.total,
    cor: catMap.get(agg.categoria_id ?? '')?.cor ?? '#a855f7',
  }));

  const rangeLabel = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;
  const miniKpis = [
    { l: 'Ticket médio', v: formatBRL(pnl.ticket_medio) },
    { l: 'CPA', v: formatBRL(pnl.cpa) },
    { l: 'ROAS', v: formatMultiplier(pnl.roas) },
    { l: 'ROI real', v: formatPercent(pnl.roi_real), cor: pnl.roi_real >= 0 ? '#34d399' : '#fb7185' },
    { l: 'Custo por R$ 1', v: formatBRL(Math.round(pnl.custo_por_real * 100)) },
    { l: 'Ads / receita', v: formatPercent(safeDiv(pnl.investimento_ads, pnl.receita_aprovada)), cor: '#fbbf24' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Banner premium AJ Alpha Company */}
      <div className="relative overflow-hidden rounded-card border border-gold/25 bg-gradient-to-br from-[#1b160d] via-card to-[#130f09]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(420px 220px at 12% 0%, rgba(212,175,55,0.16), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-4 sm:gap-5 px-5 sm:px-7 py-5">
          <LogoMark size={62} className="shadow-[0_10px_30px_-8px_rgba(212,175,55,0.4)]" />
          <div className="min-w-0">
            <div className="text-gold-metal font-extrabold text-[19px] sm:text-[22px] tracking-[0.04em]">AJ ALPHA COMPANY</div>
            <div className="text-dim text-[12px] sm:text-[12.5px] mt-0.5">
              Resultados · <span className="text-gold3">After Pay</span> — {rangeLabel}
            </div>
          </div>
          <div className="ml-auto text-right hidden sm:block pl-4 border-l border-gold/15">
            <div className="text-[9.5px] uppercase tracking-[0.16em] text-gold3 font-bold">Lucro Real</div>
            <div className="mono font-extrabold text-[22px] text-grn leading-tight mt-1">{formatBRL(pnl.lucro_real)}</div>
            <div className="text-[10.5px] text-dim2 mt-0.5">margem {formatPercent(pnl.margem_real)}</div>
          </div>
        </div>
      </div>

      <Panel title="Evolução no período" hint={`${rangeLabel} · valores diários`}>
        <div className="p-3 pb-0">
          <EvolucaoChart dailies={dailies} custos={custos} periodo={periodo} />
          <div className="flex gap-[18px] px-3 pt-1 pb-3 text-[11.5px] text-dim">
            <span className="flex items-center gap-2"><i className="w-[9px] h-[9px] rounded-sm bg-grn inline-block" />Receita aprovada</span>
            <span className="flex items-center gap-2"><i className="w-[9px] h-[9px] rounded-sm bg-pur inline-block" />Lucro real</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-line border-t border-line">
          {miniKpis.map((k) => (
            <div key={k.l} className="bg-card px-4 py-[13px]">
              <div className="text-[9px] tracking-[0.12em] uppercase text-dim2 font-bold">{k.l}</div>
              <div className="mono text-[15.5px] font-bold mt-[5px]" style={{ color: k.cor ?? '#eaeaf2' }}>{k.v}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Vendedor: valor e quantidade lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Valor Agendado por Atendente" hint="período · R$">
          {barrasAgendado.length > 0 ? <BarsVertical data={barrasAgendado} gradId="ga-atend" /> : <SemDados />}
        </Panel>
        <Panel title="Pedidos por Atendente" hint="quantidade">
          {barrasPedidos.length > 0 ? <BarsVertical data={barrasPedidos} gradId="ga-ped" /> : <SemDados />}
        </Panel>
      </div>

      <Panel title="Vendas por Plataforma" hint="origem do lead">
        {barrasPlataforma.length > 0 ? <BarsVertical data={barrasPlataforma} gradId="ga-plat" /> : <SemDados />}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Custos Variáveis por Categoria" hint={`${formatBRL(pnl.custos_variaveis_total)} no período`}>
          <DonutCategorias data={donut} total={pnl.custos_variaveis_total} />
        </Panel>
        <Panel title="Funil Agendado → Aprovado" hint={`${formatPercent(pnl.conversao_agendado)} de conversão`}>
          <Funil pnl={pnl} />
        </Panel>
      </div>
    </div>
  );
}

/** Nenhum pedido no período — melhor vazio do que número inventado. */
function SemDados() {
  return <div className="p-10 text-center text-[13px] text-dim2">Nenhum pedido neste período.</div>;
}
