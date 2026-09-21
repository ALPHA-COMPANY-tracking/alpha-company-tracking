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
  const sit = ind.situacao;
  const faixa = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;
  const deAntes = ind.qtd_pagamentos - ind.pagos_da_safra;

  // Pagos = pagamentos do período (mesmo número do card de Pagamentos
  // aprovados). O resto é onde estão hoje os pedidos agendados no período.
  const blocos = [
    {
      id: 'pago',
      nome: 'Pagos',
      qtd: ind.qtd_pagamentos,
      valor: ind.receita_aprovada,
      nota: deAntes > 0 ? `recebidos · ${deAntes} de pedidos de antes` : 'recebidos no período',
      cor: 'bg-grn',
      texto: 'text-grn',
    },
    { id: 'rota', nome: 'Em rota', qtd: sit.rota.qtd, valor: sit.rota.valor, nota: 'a receber', cor: 'bg-gold', texto: 'text-gold2' },
    {
      id: 'aguardando',
      nome: 'Entregues',
      qtd: sit.aguardando.qtd,
      valor: sit.aguardando.valor,
      nota: 'entregues e cobrados, sem pagar',
      cor: 'bg-gold3',
      texto: 'text-tx',
    },
    {
      id: 'negociacao',
      nome: 'Negociação',
      qtd: sit.negociacao.qtd,
      valor: sit.negociacao.valor,
      nota: 'e requer atenção',
      cor: 'bg-yel',
      texto: 'text-yel',
    },
    {
      id: 'frustracao',
      nome: 'Frustração',
      qtd: sit.frustracao.qtd,
      valor: sit.frustracao.valor,
      nota: 'frustrado, devolvido…',
      cor: 'bg-red',
      texto: 'text-red',
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Indicadores da operação</h1>
        <p className="text-[13px] text-dim mt-0.5">Custo por venda, retorno do anúncio, pagamento, frustração e lucro projetado · {faixa}</p>
      </div>

      {/* Agendamentos do período + onde está cada pedido hoje */}
      <section className="relative overflow-hidden rounded-card border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-card to-card px-5 lg:px-7 py-5 lg:py-6">
        <div className="flex flex-col gap-5">
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3">
            {blocos.map((b) => (
              <div key={b.id} className="min-w-0 rounded-[12px] border border-line bg-card/70 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-dim">
                  <i className={`w-[8px] h-[8px] rounded-[3px] inline-block shrink-0 ${b.cor}`} />
                  <span className="truncate">{b.nome}</span>
                </div>
                <div className={`mono text-[20px] lg:text-[22px] font-extrabold leading-tight mt-1 ${b.texto}`}>{b.qtd}</div>
                <div className="mono text-[11.5px] font-semibold text-tx2">{formatBRL(b.valor)}</div>
                <div className="text-[10px] text-dim2 truncate">{b.nota}</div>
              </div>
            ))}
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
          sub={`${ind.qtd_pagamentos} pagos ÷ ${ind.qtd_agendados} agendados`}
        />
        <KpiCard
          Icon={TriangleAlert}
          color={COR.vermelho}
          label="Frustração geral"
          value={formatPercent(ind.pct_frustracao)}
          sub={`${sit.frustracao.qtd} de ${ind.qtd_agendados} · ${formatPercent(ind.pct_frustracao_valor)} do valor`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Lucro projetado */}
        <Panel title="Lucro projetado" hint="só pedidos em rota">
          <div className="divide-y divide-line">
            <Linha rotulo="Lucro real até agora" nota="o mesmo da Demonstração de Resultados" cents={pr.lucro_real} sinal="=" />
            <Linha
              rotulo="Perda da frustração"
              nota="frete de todos + produto dos que não voltam"
              cents={-pr.perda_frustracao}
              sinal="−"
            />
            <Linha
              rotulo="A receber dos pedidos em rota"
              nota={`${pr.rota.qtd} pedidos · ${formatBRL(pr.rota.valor)} × ${formatPercent(pr.taxa_recebimento)} de recebimento`}
              cents={pr.a_receber}
              sinal="+"
            />
            <Linha rotulo="Comissões sobre o que entrar" nota="vendedor + cobrança" cents={-pr.comissoes} sinal="−" />
            <Linha
              rotulo="Produto e frete dos pedidos em rota"
              nota={`${pr.rota.qtd} pedidos`}
              cents={-pr.envio_rota}
              sinal="−"
            />
          </div>
          <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
            Fora da projeção: {sit.negociacao.qtd} em negociação/atenção, {sit.aguardando.qtd} entregues sem pagar e{' '}
            {sit.frustracao.qtd} em frustração.
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
          {/* Três leituras da mesma frustração: quantos pedidos, quanto
              valiam (preço do produto) e quanto saiu de fato do caixa. */}
          <div className="grid grid-cols-3 gap-2 p-[14px] border-b border-line">
            <div className="rounded-[12px] border border-red/25 bg-red/[0.06] px-3 py-3 min-w-0">
              <div className="text-[10.5px] text-dim">Por pedidos</div>
              <div className="mono text-[22px] lg:text-[26px] font-extrabold text-red tracking-tight leading-tight mt-0.5">
                {formatPercent(ind.pct_frustracao)}
              </div>
              <div className="text-[10.5px] text-dim2 leading-snug">
                {sit.frustracao.qtd} de {ind.qtd_agendados} pedidos
              </div>
            </div>
            <div className="rounded-[12px] border border-red/25 bg-red/[0.06] px-3 py-3 min-w-0">
              <div className="text-[10.5px] text-dim">Por valor do produto</div>
              <div className="mono text-[22px] lg:text-[26px] font-extrabold text-red tracking-tight leading-tight mt-0.5">
                {formatPercent(ind.pct_frustracao_valor)}
              </div>
              <div className="text-[10.5px] text-dim2 leading-snug">
                {formatBRL(sit.frustracao.valor)} de {formatBRL(ind.valor_agendado)}
              </div>
            </div>
            <div className="rounded-[12px] border border-line bg-card2 px-3 py-3 min-w-0">
              <div className="text-[10.5px] text-dim">Perda real</div>
              <div className="mono text-[17px] lg:text-[20px] font-extrabold text-red tracking-tight leading-tight mt-1">
                {formatBRL(pr.perda_frustracao)}
              </div>
              <div className="text-[10.5px] text-dim2 leading-snug">frete + produto que não voltou</div>
            </div>
          </div>
          {/* Todos os motivos, sempre — zerado também é informação. */}
          <div className="divide-y divide-line">
            <div className="px-[18px] py-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[9.5px] uppercase tracking-[0.1em] font-bold text-dim2">
              <span>Motivo</span>
              <span className="w-[62px] text-right">Pedidos</span>
              <span className="w-[62px] text-right">Valor</span>
            </div>
            {ind.frustracao_por_motivo.map((f) => {
              const zerado = f.qtd === 0;
              return (
                <div
                  key={f.motivo}
                  className={`px-[18px] py-3 grid grid-cols-[1fr_auto_auto] gap-x-4 items-center ${zerado ? 'opacity-50' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[13px] text-tx">{f.rotulo}</span>
                      <span className={`mono text-[12px] font-bold ${zerado ? 'text-dim2' : 'text-red'}`}>{f.qtd}</span>
                    </div>
                    <div className="text-[10.5px] text-dim2 leading-snug">
                      {zerado ? (
                        f.nota
                      ) : (
                        <>
                          {f.nota} · {formatBRL(f.valor)} · <span className="text-red">perda {formatBRL(f.perda)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-[62px] text-right mono text-[13px] font-bold text-tx">
                    {formatPercent(ind.qtd_agendados ? f.qtd / ind.qtd_agendados : 0)}
                  </div>
                  <div className="w-[62px] text-right mono text-[13px] font-bold text-tx">
                    {formatPercent(ind.valor_agendado ? f.valor / ind.valor_agendado : 0)}
                  </div>
                </div>
              );
            })}
            {/* Recorte, não motivo: já está somado nas linhas acima. */}
            <div className="px-[18px] py-3 flex items-center justify-between gap-3 bg-card2">
              <div className="min-w-0">
                <div className="text-[12.5px] text-tx">Desses, vieram da retirada nos Correios</div>
                <div className="text-[10.5px] text-dim2">a cliente não buscou o pacote · já contados acima</div>
              </div>
              <div className="text-right shrink-0">
                <div className="mono text-[13px] font-bold text-tx">{ind.vieram_dos_correios.qtd}</div>
                <div className="mono text-[10.5px] text-dim2">{formatBRL(ind.vieram_dos_correios.valor)}</div>
              </div>
            </div>
          </div>
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
