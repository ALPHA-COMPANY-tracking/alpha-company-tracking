// ─────────────────────────────────────────────────────────────
// Métricas Aprovados (Gerenciamento Administrativo — Jonas, 23/11/2026).
// "A cobradora está recebendo o bastante para sustentar a empresa?"
//   1. O mínimo do mês (ponto de equilíbrio) × previsão × o que já entrou.
//   2. Recebido por dia × o mínimo por dia.
//   3. Conversão dos pedidos do período (safra).
//   4. De onde veio o dinheiro: na entrega, pela cobrança, antecipado.
//   5. Carteira da cobrança hoje (entregues sem pagar, por idade).
//   6. Conversão por forma de pagamento e por vendedor.
// Contas em src/lib/metricasAprovados.ts (testes ao lado).
// ─────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleCheck, Clock, HandCoins, Hourglass, Percent, Truck, Wallet, Zap } from 'lucide-react';
import type { Periodo } from '@/types';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { COR, HEX } from '@/lib/cores';
import { formatBRL, reaisToCents } from '@/lib/money';
import { formatDiaMes, hojeIso, parseYmd, primeiroDiaMes } from '@/lib/dates';
import { rotuloMetodo, vendasAprovadasPorDia } from '@/lib/pedidos';
import { FAIXAS, filaDeCobranca } from '@/lib/cobranca';
import { nomeDoMes } from '@/lib/metasLucro';
import {
  type Conversao,
  type ConversaoGrupo,
  conversaoDaSafra,
  conversaoDoPeriodo,
  conversaoPorGrupo,
  equilibrioDoMes,
  origemDosPagamentos,
} from '@/lib/metricasAprovados';

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
/** Reais → "R$ 1.234,56". */
const brl = (reais: number) => formatBRL(reaisToCents(reais));
/** 0,4567 → "45,7%"; null → "—". */
const pct = (v: number | null | undefined, casas = 1) =>
  ok(v) ? `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%` : '—';
const dias = (v: number | null) => (ok(v) ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia${v === 1 ? '' : 's'}` : '—');
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

export function MetricasAprovadosScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, pedidos } = useData();
  const hoje = hojeIso();

  const eq = useMemo(() => equilibrioDoMes(dailies, custos, pedidos, hoje), [dailies, custos, pedidos, hoje]);
  const safra = useMemo(() => conversaoDaSafra(pedidos, periodo), [pedidos, periodo]);
  const conversao = useMemo(() => conversaoDoPeriodo(pedidos, periodo), [pedidos, periodo]);
  const origem = useMemo(() => origemDosPagamentos(pedidos, periodo), [pedidos, periodo]);
  const porMetodo = useMemo(() => conversaoPorGrupo(pedidos, periodo, (p) => rotuloMetodo(p.metodo_pagamento)), [pedidos, periodo]);
  const porVendedor = useMemo(
    () => conversaoPorGrupo(pedidos, periodo, (p) => (p.vendedor ?? '').trim().toUpperCase() || 'Sem vendedor'),
    [pedidos, periodo],
  );
  const fila = useMemo(() => filaDeCobranca(pedidos, hoje), [pedidos, hoje]);

  // Recebido de cada dia do mês até hoje (dia sem pagamento = 0).
  const porDia = useMemo(() => {
    const { y, m, d } = parseYmd(hoje);
    const inicio = primeiroDiaMes(y, m);
    const pagos = new Map(vendasAprovadasPorDia(pedidos, { inicio, fim: hoje }).map((x) => [x.data, x.total]));
    return Array.from({ length: d }, (_, i) => {
      const data = `${inicio.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      return { data, rotulo: String(i + 1), valor: pagos.get(data) ?? 0 };
    });
  }, [pedidos, hoje]);

  const rotuloPeriodo = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Métricas Aprovados</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Quanto entra, quanto precisa entrar para a empresa empatar e onde a cobrança trava
        </p>
      </div>

      <BlocoEquilibrio eq={eq} />

      <Panel
        title={`Recebido por dia · ${nomeDoMes(eq.mes)}`}
        hint={eq.minimoPorDia != null ? `linha: mínimo de ${formatBRL(eq.minimoPorDia)} por dia` : undefined}
      >
        <GraficoDias dados={porDia} minimoDia={eq.minimoPorDia != null ? eq.minimoPorDia / 100 : null} />
        <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
          Barra verde: o dia passou do mínimo. Barra dourada: ficou abaixo. O mínimo por dia é o mínimo do mês dividido
          pelos dias do mês.
        </div>
      </Panel>

      {/* Conversão do período — a mesma "Taxa de conversão" do BlueSales */}
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-dim2 mb-2 px-1">
          Conversão de {rotuloPeriodo} · tudo o que entrou ÷ o que foi agendado (igual ao BlueSales)
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
          <KpiCard
            Icon={Percent}
            color={COR.ouro}
            valueColor={COR.ouroClaro}
            label="Taxa de conversão"
            value={pct(conversao.pct_qtd)}
            sub={`${plural(conversao.pagos.qtd, 'pagamento', 'pagamentos')} ÷ ${plural(conversao.agendados.qtd, 'agendamento', 'agendamentos')}`}
          />
          <KpiCard
            Icon={Percent}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Conversão em R$"
            value={pct(conversao.pct_valor)}
            sub={`${brl(conversao.pagos.valor)} ÷ ${brl(conversao.agendados.valor)}`}
          />
          <KpiCard
            Icon={Wallet}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Recebido (na entrega + cobrança)"
            value={brl(conversao.pagos.valor)}
            sub={plural(conversao.pagos.qtd, 'pagamento', 'pagamentos')}
          />
          <KpiCard
            Icon={Zap}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Vendas antecipadas (à parte)"
            value={brl(conversao.antecipado.valor)}
            sub={`${plural(conversao.antecipado.qtd, 'pagamento', 'pagamentos')} · fora da conversão`}
          />
        </div>
        <p className="text-[11px] text-dim2 mt-2 px-1 leading-relaxed">
          É a "Taxa de conversão" do BlueSales: os pagamentos que entraram no período (de pedidos de qualquer dia,
          pagos na entrega ou pela cobrança) divididos pelos agendamentos do mesmo período. A venda antecipada fica de fora
          porque não foi agendada — ela aparece à parte. Recebido total do período:{' '}
          <b className="text-dim">{brl(conversao.pagos.valor + conversao.antecipado.valor)}</b> (
          {plural(conversao.pagos.qtd + conversao.antecipado.qtd, 'pagamento', 'pagamentos')}).
        </p>
      </div>

      {/* Conversão da safra (período escolhido) */}
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-dim2 mb-2 px-1">
          Conversão só dos pedidos feitos de {rotuloPeriodo} · quanto deles já pagou
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
          <KpiCard
            Icon={Percent}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Conversão em R$"
            value={pct(safra.pct_valor)}
            sub={`${brl(safra.recebido)} de ${brl(safra.valor)} agendados`}
          />
          <KpiCard
            Icon={CircleCheck}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Pedidos que pagaram"
            value={pct(safra.pct_qtd)}
            sub={`${plural(safra.pagos, 'pago', 'pagos')} de ${plural(safra.qtd, 'pedido', 'pedidos')}`}
          />
          <KpiCard
            Icon={Percent}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Dos resolvidos, pagaram"
            value={pct(safra.pct_resolvidos)}
            sub={`${plural(safra.pagos, 'pago', 'pagos')} · ${plural(safra.perdidos, 'frustrado', 'frustrados')}`}
          />
          <KpiCard
            Icon={Hourglass}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Ainda em aberto"
            value={brl(safra.emAberto.valor)}
            sub={`${plural(safra.emAberto.qtd, 'pedido ainda pode', 'pedidos ainda podem')} pagar`}
          />
        </div>
        <p className="text-[11px] text-dim2 mt-2 px-1 leading-relaxed">
          Aqui só entram os pedidos feitos no período e o que ELES já pagaram — não conta o pagamento de pedido do mês
          anterior. Por isso é menor que a taxa de cima: pedido recente ainda não teve tempo de pagar, e a conversão de
          um período recente sobe com os dias. "Dos resolvidos" compara só quem já pagou com quem já frustrou.
        </p>
      </div>

      {/* De onde veio o dinheiro (pagamentos do período) */}
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-dim2 mb-2 px-1">
          Pagamentos de {rotuloPeriodo} · de onde veio o dinheiro
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-[14px]">
          <KpiCard
            Icon={Wallet}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Recebido no período"
            value={brl(origem.total.valor)}
            sub={plural(origem.total.qtd, 'pagamento', 'pagamentos')}
          />
          <KpiCard
            Icon={Truck}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Pago na entrega"
            value={brl(origem.naEntrega.valor)}
            sub={`${pct(origem.total.valor ? origem.naEntrega.valor / origem.total.valor : null)} · ${plural(origem.naEntrega.qtd, 'pagamento', 'pagamentos')}`}
          />
          <KpiCard
            Icon={HandCoins}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Pago pela cobrança"
            value={brl(origem.cobranca.valor)}
            sub={`${pct(origem.total.valor ? origem.cobranca.valor / origem.total.valor : null)} · ${plural(origem.cobranca.qtd, 'pagamento', 'pagamentos')}`}
          />
          <KpiCard
            Icon={Zap}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Venda antecipada"
            value={brl(origem.antecipado.valor)}
            sub={plural(origem.antecipado.qtd, 'pagamento', 'pagamentos')}
          />
          <KpiCard
            Icon={Clock}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Do pedido ao pagamento"
            value={dias(origem.diasAtePagar)}
            sub="mediana, todos os pagamentos"
          />
          <KpiCard
            Icon={Clock}
            color={COR.ouro}
            valueColor={COR.texto}
            label="Da entrega ao pagamento"
            value={dias(origem.diasDaEntregaAoPagamento)}
            sub="mediana, só os pagos pela cobrança"
          />
        </div>
        <p className="text-[11px] text-dim2 mt-2 px-1 leading-relaxed">
          "Pago pela cobrança" é o pedido que chegou a <b className="text-dim">entregue/cobrado</b> antes de pagar — a
          cliente não pagou na hora e foi cobrada. "Na entrega" pagou sem passar por essa etapa. O recebido do período é o
          mesmo dos Pagamentos aprovados da Demonstração.
          {origem.semDado.qtd > 0 &&
            ` ${brl(origem.semDado.valor)} (${plural(origem.semDado.qtd, 'pagamento', 'pagamentos')}) são de pedidos de antes de 28/08, sem o dia da entrega, e ficaram fora dessa divisão.`}
        </p>
      </div>

      <CarteiraCobranca fila={fila} />

      {/* Lado a lado só em tela bem larga: as cinco colunas não cabem em meia tela. */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 lg:gap-5">
        <TabelaConversao titulo="Conversão por forma de pagamento" linhas={porMetodo} total={safra} />
        <TabelaConversao titulo="Conversão por vendedor" linhas={porVendedor} total={safra} />
      </div>
    </div>
  );
}

// ── 1. O que entra cobre a empresa? ──────────────────────────

function BlocoEquilibrio({ eq }: { eq: ReturnType<typeof equilibrioDoMes> }) {
  const estilo =
    eq.cobre == null
      ? 'border-gold/30 from-gold/[0.07]'
      : eq.cobre
        ? 'border-grn/30 from-grn/[0.10]'
        : 'border-red/30 from-red/[0.10]';
  const corTitulo = eq.cobre == null ? 'text-gold2' : eq.cobre ? 'text-grn' : 'text-red';
  const titulo =
    eq.minimo == null
      ? 'Ainda sem base para o mínimo do mês'
      : eq.cobre
        ? 'No ritmo atual, o mês cobre o mínimo'
        : `No ritmo atual, o mês não cobre o mínimo — faltam ${formatBRL(Math.max(0, eq.minimo - eq.projecao))}`;
  const progresso = eq.minimo ? Math.min(1, eq.recebido / eq.minimo) : 0;
  const pctMargem = eq.margem != null ? eq.margem * 100 : null;
  const ritmo =
    eq.ritmoDe === 'mes_anterior'
      ? 'no ritmo do mês anterior (o mês ainda tem poucos dias fechados)'
      : eq.ritmoDe === 'dias_fechados'
        ? 'no ritmo dos dias já fechados'
        : 'sem dias fechados ainda';

  return (
    <section className={`rounded-card border bg-gradient-to-br to-transparent px-4 lg:px-6 py-4 lg:py-5 ${estilo}`}>
      <div className={`text-[11px] font-bold tracking-[0.14em] uppercase ${corTitulo}`}>
        {nomeDoMes(eq.mes)} · o que entra cobre a empresa?
      </div>
      <div className="text-[16px] lg:text-[19px] font-extrabold text-tx mt-1">{titulo}</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:gap-4 mt-4">
        <Numero rotulo="Mínimo para empatar" valor={eq.minimo != null ? formatBRL(eq.minimo) : '—'} nota="recebido que zera o Lucro Real do mês" />
        <Numero
          rotulo="Projeção do mês"
          valor={formatBRL(eq.projecao)}
          nota={`recebido do mês inteiro ${ritmo}`}
          cor={eq.cobre == null ? undefined : eq.cobre ? 'text-grn' : 'text-red'}
        />
        <Numero rotulo="Já entrou" valor={formatBRL(eq.recebido)} nota={`até hoje, dia ${eq.diaHoje} de ${eq.diasMes}`} />
      </div>

      {eq.minimo != null && (
        <div className="mt-4 flex items-center gap-3">
          <span className="flex-1 h-[8px] rounded-full bg-trilha overflow-hidden">
            <span className={`block h-full rounded-full ${progresso >= 1 ? 'bg-grn' : 'bg-gold'}`} style={{ width: `${progresso * 100}%` }} />
          </span>
          <span className="mono text-[13px] font-extrabold text-gold2">{pct(progresso, 0)}</span>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-dim leading-relaxed">
        {eq.minimo != null &&
          (eq.falta > 0 ? (
            <span>
              Para chegar ao mínimo faltam <b className="text-tx">{formatBRL(eq.falta)}</b> —{' '}
              <b className="text-tx">{formatBRL(eq.faltaPorDia)} por dia</b> nos {plural(eq.diasRestantes, 'dia que falta', 'dias que faltam')}{' '}
              (contando hoje).
            </span>
          ) : (
            <span className="text-grn">O que já entrou passou do mínimo do mês.</span>
          ))}
        {eq.conversaoMinima != null && (
          <span>
            Se as vendas seguirem nesse ritmo (agendado do mês ≈ {formatBRL(eq.agendadoProjetado)}), de cada{' '}
            <b className="text-tx">R$ 100</b> agendados precisam entrar <b className="text-tx">{brl(eq.conversaoMinima * 100)}</b> (
            {pct(eq.conversaoMinima)}) para empatar. No mês anterior entraram <b className="text-tx">{pct(eq.conversaoMesAnterior)}</b>
            {eq.conversaoMes != null && <> · neste mês até agora, {pct(eq.conversaoMes)}</>}.
          </span>
        )}
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer text-[12px] font-semibold text-gold2 select-none">Como o mínimo é calculado</summary>
        <div className="mt-2 rounded-[12px] border border-line bg-card/70 px-4 py-3 text-[12px] text-dim leading-relaxed">
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <span>Anúncios do mês inteiro ({ritmo})</span>
            <span className="mono text-tx text-right">{formatBRL(eq.fixos.anuncios)}</span>
            <span>Custos variáveis do mês inteiro</span>
            <span className="mono text-tx text-right">{formatBRL(eq.fixos.custosVariaveis)}</span>
            <span>Perda com frustração (a maior: mês anterior inteiro ou este mês)</span>
            <span className="mono text-tx text-right">{formatBRL(eq.fixos.frustracao)}</span>
            <span className="font-semibold text-tx border-t border-line pt-1">Custos que não dependem do recebido</span>
            <span className="mono font-bold text-tx text-right border-t border-line pt-1">{formatBRL(eq.fixos.total)}</span>
          </div>
          <p className="m-0 mt-2.5">
            De cada R$ 100 recebidos sobram{' '}
            <b className="text-tx">{pctMargem != null ? `R$ ${pctMargem.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : '—'}</b> depois de
            produto, frete, taxa de boleto e comissões (vendedor e cobrança)
            {eq.margemDe === 'mes_anterior' ? ' — base: mês anterior, porque este mês ainda não tem pagamento' : ' — base: este mês até hoje'}.
            Mínimo = custos que não dependem do recebido ÷ essa sobra. É o recebido que deixa o Lucro Real da Demonstração em
            zero.
          </p>
          <p className="m-0 mt-2">
            O veredito compara o mínimo com a projeção do recebido do mês inteiro, no mesmo ritmo dos anúncios — o mínimo
            já paga o anúncio dos dias que faltam, então a projeção conta as vendas que esse anúncio traz. O dia de hoje
            fica de fora do ritmo porque ainda está pela metade.
          </p>
        </div>
      </details>
    </section>
  );
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota: string; cor?: string }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-line bg-card/70 px-3.5 py-3">
      <div className="text-[11px] text-dim font-medium">{rotulo}</div>
      <div className={`mono text-[20px] lg:text-[24px] font-extrabold tracking-tight truncate ${cor ?? 'text-tx'}`}>{valor}</div>
      <div className="text-[10.5px] text-dim2 mt-0.5 leading-snug">{nota}</div>
    </div>
  );
}

// ── 2. Recebido por dia × mínimo por dia ─────────────────────

function GraficoDias({ dados, minimoDia }: { dados: { data: string; rotulo: string; valor: number }[]; minimoDia: number | null }) {
  const compacto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : `${Math.round(v)}`);
  return (
    <div className="px-3 lg:px-4 pt-3 pb-2">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dados} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={HEX.grade} />
          <XAxis dataKey="rotulo" tick={{ fill: HEX.eixo, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: HEX.eixo, fontSize: 10 }} tickLine={false} axisLine={false} width={38} tickFormatter={compacto} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { data: string; valor: number };
              return (
                <div className="rounded-[9px] border border-line2 bg-card2 px-2.5 py-1.5 shadow-lg">
                  <div className="text-[10px] text-dim2">{formatDiaMes(d.data)}</div>
                  <div className="mono text-[12px] font-bold text-tx">{brl(d.valor)}</div>
                </div>
              );
            }}
          />
          {/* extendDomain: a linha aparece mesmo quando todos os dias ficam abaixo dela. */}
          {minimoDia != null && <ReferenceLine y={minimoDia} ifOverflow="extendDomain" stroke={HEX.ambar} strokeDasharray="5 4" strokeWidth={1.5} />}
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {dados.map((d) => (
              <Cell key={d.data} fill={minimoDia != null && d.valor >= minimoDia ? HEX.verde : HEX.ouro} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 5. Carteira da cobrança hoje ─────────────────────────────

function CarteiraCobranca({ fila }: { fila: ReturnType<typeof filaDeCobranca> }) {
  return (
    <Panel title="Carteira da cobrança hoje" hint={`${plural(fila.total.qtd, 'entregue', 'entregues')} sem pagar · ${brl(fila.total.valor)}`}>
      <div className="p-3.5 lg:p-5 flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
          {FAIXAS.map((f) => {
            const x = fila.porFaixa[f.id];
            const velho = f.id === '16+';
            return (
              <div key={f.id} className={`min-w-0 rounded-[12px] border px-3 py-2.5 ${velho && x.qtd > 0 ? 'border-red/30 bg-red/[0.05]' : 'border-line bg-card/70'}`}>
                <div className="text-[11px] text-dim">{f.rotulo}</div>
                <div className={`mono text-[15px] font-extrabold truncate ${velho && x.qtd > 0 ? 'text-red' : 'text-tx'}`}>{brl(x.valor)}</div>
                <div className="text-[10.5px] text-dim2">{plural(x.qtd, 'pedido', 'pedidos')}</div>
              </div>
            );
          })}
          <div className="min-w-0 rounded-[12px] border border-yel/30 bg-yel/[0.05] px-3 py-2.5">
            <div className="text-[11px] text-dim">Negociação / jurídico</div>
            <div className="mono text-[15px] font-extrabold text-yel truncate">{brl(fila.totalNegociacao.valor)}</div>
            <div className="text-[10.5px] text-dim2">{plural(fila.totalNegociacao.qtd, 'pedido', 'pedidos')}</div>
          </div>
          <div className="min-w-0 rounded-[12px] border border-gold/30 bg-gold/[0.06] px-3 py-2.5">
            <div className="text-[11px] text-dim">Devem entrar (80%)</div>
            <div className="mono text-[15px] font-extrabold text-gold2 truncate">{brl(fila.total.valor * 0.8)}</div>
            <div className="text-[10.5px] text-dim2">dos entregues sem pagar</div>
          </div>
        </div>
        <p className="m-0 text-[11px] text-dim2 leading-relaxed">
          Pedidos <b className="text-dim">entregues ou em cobrança</b> que ainda não pagaram, por dias desde a entrega
          {fila.semDiaDaEntrega > 0 && ` (${plural(fila.semDiaDaEntrega, 'conta', 'contam')} do dia do pedido, sem o dia da entrega)`}. Quanto mais
          velho, mais difícil de receber — acima de 15 dias é o que mais escapa.
        </p>
      </div>
    </Panel>
  );
}

// ── 6. Conversão por grupo ───────────────────────────────────

function TabelaConversao({ titulo, linhas, total }: { titulo: string; linhas: ConversaoGrupo[]; total: Conversao }) {
  // Pinta a conversão em R$ só com significado: bem abaixo da média vermelho, bem acima verde.
  const corDe = (v: number | null) =>
    v == null || total.pct_valor == null ? 'text-tx' : v < total.pct_valor - 0.05 ? 'text-red' : v > total.pct_valor + 0.05 ? 'text-grn' : 'text-tx';
  return (
    <Panel title={titulo} hint="pedidos feitos no período">
      {linhas.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-dim2">Nenhum pedido no período.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[460px]">
            <thead>
              <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 lg:px-5 py-2.5"></th>
                <th className="text-right font-semibold px-3 py-2.5">Agendado</th>
                <th className="text-right font-semibold px-3 py-2.5">Recebido</th>
                <th className="text-right font-semibold px-3 py-2.5">Conversão</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-2.5">Dos resolvidos</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.grupo} className="border-t border-line/70 hover:bg-white/[0.015]">
                  <td className="px-3 lg:px-5 py-2.5 text-tx font-medium truncate max-w-[140px]">{l.grupo}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="mono text-tx">{brl(l.valor)}</div>
                    <div className="text-[10px] text-dim2">{plural(l.qtd, 'pedido', 'pedidos')}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-tx">{brl(l.recebido)}</td>
                  <td className={`px-3 py-2.5 text-right mono font-bold ${corDe(l.pct_valor)}`}>{pct(l.pct_valor)}</td>
                  <td className="px-3 lg:px-5 py-2.5 text-right">
                    <div className="mono text-tx">{pct(l.pct_resolvidos)}</div>
                    <div className="text-[10px] text-dim2">
                      {l.pagos} pagos · {l.perdidos} frustr.
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line bg-card2">
                <td className="px-3 lg:px-5 py-2.5 text-tx font-bold">Total</td>
                <td className="px-3 py-2.5 text-right mono font-bold text-tx">{brl(total.valor)}</td>
                <td className="px-3 py-2.5 text-right mono font-bold text-tx">{brl(total.recebido)}</td>
                <td className="px-3 py-2.5 text-right mono font-bold text-gold2">{pct(total.pct_valor)}</td>
                <td className="px-3 lg:px-5 py-2.5 text-right mono font-bold text-tx">{pct(total.pct_resolvidos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
        Conversão = R$ recebido ÷ R$ agendado. Em vermelho, mais de 5 pontos abaixo do total; em verde, mais de 5 acima.
      </div>
    </Panel>
  );
}
