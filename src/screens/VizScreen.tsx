import { useMemo } from 'react';
import {
  BadgeCheck,
  CircleCheck,
  Crosshair,
  Megaphone,
  Receipt,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import type { Periodo } from '@/types';
import { type Cents, formatBRL, formatMultiplier, formatPercent } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { calcularIndicadores } from '@/lib/indicadores';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { COR } from '@/lib/cores';

/**
 * Indicadores da operação: só o que decide o dia a dia — custo por venda,
 * retorno do anúncio, quanto paga, quanto frustra e onde o lucro vai fechar.
 */
export function VizScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, pedidos } = useData();
  const ind = useMemo(() => calcularIndicadores(dailies, custos, pedidos, periodo), [dailies, custos, pedidos, periodo]);
  const pr = ind.projecao;
  const faixa = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;
  const totalSafra = ind.safra.pago.qtd + ind.safra.aberto.qtd + ind.safra.frustracao.qtd;

  const fatias = [
    { id: 'pago', nome: 'Pagos', qtd: ind.safra.pago.qtd, pct: ind.pct_pagos, cor: 'bg-grn', texto: 'text-grn' },
    { id: 'aberto', nome: 'Em aberto', qtd: ind.safra.aberto.qtd, pct: ind.pct_aberto, cor: 'bg-gold', texto: 'text-gold2' },
    { id: 'frustracao', nome: 'Frustração', qtd: ind.safra.frustracao.qtd, pct: ind.pct_frustracao, cor: 'bg-red', texto: 'text-red' },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Indicadores da operação</h1>
        <p className="text-[13px] text-dim mt-0.5">Custo por venda, retorno do anúncio, pagamento, frustração e lucro projetado · {faixa}</p>
      </div>

      {/* Agendamentos do período + onde está cada pedido hoje */}
      <section className="relative overflow-hidden rounded-card border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-card to-card px-5 lg:px-7 py-5 lg:py-6">
        <div className="flex flex-col lg:flex-row lg:items-end gap-5 lg:gap-10">
          <div className="shrink-0">
            <div className="text-[11px] font-bold tracking-[0.13em] uppercase text-tx2">Agendamentos do período</div>
            <div className="mono text-[32px] lg:text-[40px] font-extrabold text-gold2 tracking-tight leading-none mt-2">
              {formatBRL(ind.valor_agendado)}
            </div>
            <div className="text-[12.5px] text-dim mt-2">
              <b className="text-tx">{ind.qtd_agendados}</b> agendamento{ind.qtd_agendados === 1 ? '' : 's'} · ticket médio agendado{' '}
              <b className="text-tx mono">{formatBRL(ind.ticket_agendado)}</b>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-[11px] text-dim2">Onde está hoje cada pedido agendado</span>
              <span className="text-[11px] text-dim2 mono">{totalSafra} pedidos</span>
            </div>
            <div className="flex h-[14px] rounded-full overflow-hidden gap-[2px] bg-trilha">
              {fatias.map((f) =>
                f.qtd > 0 ? <div key={f.id} className={`h-full ${f.cor}`} style={{ width: `${f.pct * 100}%` }} title={f.nome} /> : null,
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {fatias.map((f) => (
                <div key={f.id} className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11.5px] text-dim">
                    <i className={`w-[8px] h-[8px] rounded-[3px] inline-block ${f.cor}`} />
                    {f.nome}
                  </div>
                  <div className={`mono text-[17px] lg:text-[20px] font-extrabold leading-tight mt-0.5 ${f.texto}`}>
                    {formatPercent(f.pct)}
                  </div>
                  <div className="text-[10.5px] text-dim2">
                    {f.qtd} pedido{f.qtd === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
        <KpiCard
          Icon={Receipt}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Ticket médio real"
          value={formatBRL(ind.ticket_medio_real)}
          sub={`${formatBRL(ind.receita_aprovada)} ÷ ${ind.qtd_pagamentos} pagos`}
        />
        <KpiCard
          Icon={Crosshair}
          color={COR.ouro}
          valueColor={COR.texto}
          label="CPA por agendamento"
          value={formatBRL(ind.cpa_agendamento)}
          sub={`anúncio ÷ ${ind.qtd_agendados} agendados`}
        />
        <KpiCard
          Icon={BadgeCheck}
          color={COR.ouro}
          valueColor={COR.texto}
          label="CPA por pago"
          value={formatBRL(ind.cpa_pago)}
          sub={`anúncio ÷ ${ind.qtd_pagamentos} pagos`}
        />
        <KpiCard
          Icon={Megaphone}
          color={COR.vermelho}
          label="Investimento em anúncios"
          value={formatBRL(ind.investimento_ads)}
          sub="no período"
        />
        <KpiCard
          Icon={TrendingUp}
          color={COR.ouro}
          valueColor={COR.texto}
          label="ROAS agendado"
          value={formatMultiplier(ind.roas_agendado)}
          sub="agendado ÷ anúncio"
        />
        <KpiCard
          Icon={TrendingUp}
          color={COR.verde}
          valueColor={COR.texto}
          label="ROAS aprovado"
          value={formatMultiplier(ind.roas_aprovado)}
          sub="aprovado ÷ anúncio"
        />
        <KpiCard
          Icon={CircleCheck}
          color={COR.verde}
          label="Pedidos pagos"
          value={formatPercent(ind.pct_pagos)}
          sub={`${ind.safra.pago.qtd} de ${totalSafra} agendados`}
        />
        <KpiCard
          Icon={TriangleAlert}
          color={COR.vermelho}
          label="Frustração geral"
          value={formatPercent(ind.pct_frustracao)}
          sub={`${ind.safra.frustracao.qtd} de ${totalSafra} agendados`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Lucro projetado */}
        <Panel title="Lucro projetado" hint="no ritmo de pagamento da operação">
          <div className="divide-y divide-line">
            <Linha rotulo="Lucro real até agora" nota="o mesmo da Demonstração de Resultados" cents={pr.lucro_real} sinal="=" />
            <Linha
              rotulo="Perda da frustração"
              nota="produto + frete dos pedidos frustrados, devolvidos…"
              cents={-pr.perda_frustracao}
              sinal="−"
            />
            <Linha
              rotulo="A receber"
              nota={`${formatBRL(pr.aberto.valor)} em aberto × ${formatPercent(pr.taxa_recebimento)} de recebimento`}
              cents={pr.a_receber}
              sinal="+"
            />
            <Linha rotulo="Comissões sobre o que entrar" nota="vendedor + cobrança" cents={-pr.comissoes} sinal="−" />
            <Linha
              rotulo="Produto e frete do que está em aberto"
              nota={`${pr.aberto.qtd} pedidos já enviados`}
              cents={-pr.envio_aberto}
              sinal="−"
            />
          </div>
          <div
            className={`px-[18px] py-5 border-t flex items-end justify-between gap-4 bg-gradient-to-br ${
              pr.lucro_projetado >= 0 ? 'from-grn/[0.10] to-transparent border-grn/30' : 'from-red/[0.10] to-transparent border-red/30'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold tracking-[0.14em] uppercase ${pr.lucro_projetado >= 0 ? 'text-grn' : 'text-red'}`}>
                {pr.lucro_projetado >= 0 ? 'Lucro projetado' : 'Prejuízo projetado'}
              </div>
              <div className="text-[11px] text-dim2 mt-1 max-w-[300px] leading-relaxed">
                Taxa de recebimento: dos {pr.base_taxa} pedidos que já se resolveram, {formatPercent(pr.taxa_recebimento)} pagaram.
              </div>
            </div>
            <div className={`mono text-[26px] lg:text-[30px] font-extrabold tracking-tight shrink-0 ${pr.lucro_projetado >= 0 ? 'text-grn' : 'text-red'}`}>
              {formatBRL(pr.lucro_projetado)}
            </div>
          </div>
        </Panel>

        {/* Frustração geral */}
        <Panel title="Frustração geral" hint="com devolução, roubo, extravio">
          <div className="px-[18px] py-5 flex items-end justify-between gap-4 border-b border-line">
            <div>
              <div className="mono text-[30px] lg:text-[34px] font-extrabold text-red tracking-tight leading-none">
                {formatPercent(ind.pct_frustracao)}
              </div>
              <div className="text-[12px] text-dim mt-2">
                {ind.safra.frustracao.qtd} de {totalSafra} pedidos agendados no período
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10.5px] text-dim2">Perda real</div>
              <div className="mono text-[17px] font-bold text-red">{formatBRL(pr.perda_frustracao)}</div>
              <div className="text-[10.5px] text-dim2">{formatBRL(ind.safra.frustracao.valor)} em pedidos</div>
            </div>
          </div>
          {ind.frustracao_por_status.length > 0 ? (
            <div className="divide-y divide-line">
              {ind.frustracao_por_status.map((f) => (
                <div key={f.status} className="px-[18px] py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-tx">{f.rotulo}</div>
                    <div className="text-[10.5px] text-dim2">
                      {f.qtd} pedido{f.qtd === 1 ? '' : 's'} · {formatBRL(f.valor)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono text-[13px] font-bold text-tx">{formatPercent(totalSafra ? f.qtd / totalSafra : 0)}</div>
                    <div className="mono text-[10.5px] text-red">perda {formatBRL(f.perda)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-[18px] py-8 text-center text-[13px] text-dim2">Nenhum pedido frustrado neste período.</div>
          )}
          <div className="px-[18px] py-3 border-t border-line flex items-start gap-2 text-[11px] text-dim2 leading-relaxed">
            <Wallet size={13} className="text-gold shrink-0 mt-[2px]" />
            Conta os pedidos agendados no período. Em meses recentes ainda há pedidos a caminho — o percentual final
            aparece quando eles se resolvem.
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Linha da projeção: rótulo, explicação e valor com sinal. */
function Linha({ rotulo, nota, cents, sinal }: { rotulo: string; nota: string; cents: Cents; sinal: '+' | '−' | '=' }) {
  const cor = sinal === '=' ? (cents >= 0 ? 'text-tx' : 'text-red') : cents > 0 ? 'text-grn' : cents < 0 ? 'text-red' : 'text-dim2';
  return (
    <div className="px-[18px] py-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-start gap-2.5">
        <span className="mono text-[13px] text-dim2 w-3 shrink-0 text-center">{sinal}</span>
        <div className="min-w-0">
          <div className="text-[13px] text-tx">{rotulo}</div>
          <div className="text-[10.5px] text-dim2 leading-snug">{nota}</div>
        </div>
      </div>
      <div className={`mono text-[13.5px] font-bold shrink-0 ${cor}`}>{formatBRL(cents)}</div>
    </div>
  );
}
