// ─────────────────────────────────────────────────────────────
// Previsão do Mês — com a base de hoje: o lucro do mês até agora mais o
// que os pedidos que já existem devem render (lib/previsao). Sem vendas
// futuras nem anúncios futuros: "com o que eu tenho, estou no positivo ou
// no vermelho?". É sempre o mês atual: o seletor de período não muda esta
// tela.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Boxes, CalendarClock, Check, Pencil, Target, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { AreaPrevisao } from '@/components/viz/AreaPrevisao';
import { COR } from '@/lib/cores';
import { type Cents, formatBRL, formatPercent } from '@/lib/money';
import { hojeIso } from '@/lib/dates';
import { type Etapa, FRUSTRACAO_PREVISTA, type PlanoMeta, planoDaMeta, preverMes } from '@/lib/previsao';
import { MoneyInput } from '@/components/MoneyInput';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// A meta do mês fica salva neste aparelho, como a meta diária da Demonstração.
const chaveMeta = (hoje: string) => `afterpay-pnl:meta-lucro:${hoje.slice(0, 7)}`;
function lerMeta(hoje: string): number {
  try {
    return Number(localStorage.getItem(chaveMeta(hoje))) || 0;
  } catch {
    return 0;
  }
}
function salvarMeta(hoje: string, cents: number) {
  try {
    localStorage.setItem(chaveMeta(hoje), String(cents));
  } catch {
    /* ignora */
  }
}

/** "4,5 por dia" · "cerca de 6 por semana" (menos de 1 por dia). */
function ritmo(porDia: number): string {
  if (porDia >= 1) return `${porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia`;
  return `cerca de ${Math.ceil(porDia * 7)} por semana`;
}

const ETAPA: Record<Etapa, string> = {
  aguardando: 'Entregues, esperando pagamento',
  rota: 'Na rua (em rota)',
  preparo: 'A enviar',
};

export function PrevisaoScreen() {
  const { pedidos, dailies, custos } = useData();
  const hoje = hojeIso();
  const pr = useMemo(() => preverMes(pedidos, dailies, custos, hoje), [pedidos, dailies, custos, hoje]);
  const [meta, setMeta] = useState(() => lerMeta(hoje));
  const plano = useMemo(() => (meta > 0 ? planoDaMeta(meta, pr, pedidos, dailies, hoje) : null), [meta, pr, pedidos, dailies, hoje]);
  const ano = hoje.slice(0, 4);
  const mes = Number(hoje.slice(5, 7));
  const l = pr.lucro;
  const positivo = l.previsto >= 0;
  const depois = pr.deve_entrar - pr.ate_fim_do_mes;

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Previsão do Mês</h1>
        <p className="text-[13px] text-dim mt-0.5">
          {MESES[mes - 1]}/{ano} · com a base de hoje: o que já entrou e o que os pedidos que já existem devem render — sem vendas futuras
        </p>
      </div>

      {/* A resposta primeiro: positivo ou vermelho. */}
      <div
        className={`rounded-card border px-4 lg:px-6 py-4 lg:py-5 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br ${
          positivo ? 'from-grn/[0.10] to-transparent border-grn/30' : 'from-red/[0.10] to-transparent border-red/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {positivo ? <TrendingUp size={26} className="text-grn shrink-0" /> : <TrendingDown size={26} className="text-red shrink-0" />}
          <div>
            <div className={`text-[11px] font-bold tracking-[0.14em] uppercase ${positivo ? 'text-grn' : 'text-red'}`}>
              {positivo ? 'Mês no positivo' : 'Mês no vermelho'}
            </div>
            <div className="text-[12.5px] text-dim leading-snug">
              Lucro previsto com a base de hoje e {formatPercent(FRUSTRACAO_PREVISTA, 0)} de frustração · margem {formatPercent(l.margem)}
            </div>
          </div>
        </div>
        <div className={`mono text-[28px] lg:text-[34px] font-extrabold tracking-tight ${positivo ? 'text-grn' : 'text-red'}`}>
          {formatBRL(l.previsto)}
        </div>
      </div>

      <MetaDoMes
        meta={meta}
        plano={plano}
        nomeMes={MESES[mes - 1]}
        fim={dm(pr.fim)}
        onSalvar={(v) => {
          salvarMeta(hoje, v);
          setMeta(v);
        }}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 lg:gap-3.5">
        <KpiCard Icon={Wallet} color={COR.ouro} valueColor={COR.texto} label="Já entrou no mês" value={formatBRL(pr.ja_entrou)} sub={`${pr.qtd_pagamentos} pagamentos`} />
        <KpiCard
          Icon={Boxes}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Pedidos em aberto na base"
          value={formatBRL(pr.base.valor)}
          sub={`${pr.base.qtd} pedidos (valor agendado)`}
        />
        <KpiCard
          Icon={TrendingUp}
          color={COR.ouro}
          label="Deve entrar desses pedidos"
          value={formatBRL(pr.deve_entrar)}
          sub={depois > 0 ? `${formatBRL(pr.ate_fim_do_mes)} até ${dm(pr.fim)}` : `tudo até ${dm(pr.fim)}`}
        />
        <KpiCard
          Icon={CalendarClock}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Próximos 7 dias"
          value={formatBRL(pr.proximos_7_dias)}
          sub="dos pedidos da base"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
        <Panel title="O que a base deve render" hint={`com ${formatPercent(FRUSTRACAO_PREVISTA, 0)} de frustração`}>
          <div className="divide-y divide-line">
            {pr.linhas.map((ln) => (
              <div key={ln.etapa} className="px-[18px] py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] text-tx">{ETAPA[ln.etapa]}</div>
                  <div className="text-[10.5px] text-dim2 leading-snug">
                    {ln.qtd} {ln.qtd === 1 ? 'pedido' : 'pedidos'} · {formatBRL(ln.valor)} · {formatPercent(ln.taxa, 0)} devem pagar
                  </div>
                </div>
                <div className="mono text-[13.5px] font-bold text-grn shrink-0">{formatBRL(ln.previsto)}</div>
              </div>
            ))}
            <div className="px-[18px] py-3 flex items-center justify-between gap-3 bg-white/[0.015]">
              <div>
                <div className="text-[13px] font-bold text-tx">Deve entrar</div>
                {depois > 0 && (
                  <div className="text-[10.5px] text-dim2">
                    {formatBRL(pr.ate_fim_do_mes)} até {dm(pr.fim)} · {formatBRL(depois)} depois
                  </div>
                )}
              </div>
              <div className="mono text-[15px] font-extrabold text-tx">{formatBRL(pr.deve_entrar)}</div>
            </div>
          </div>
          {(pr.fora.negociacao.qtd > 0 || pr.fora.parados.qtd > 0) && (
            <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
              Fora da conta:
              {pr.fora.negociacao.qtd > 0 && ` ${pr.fora.negociacao.qtd} em negociação/jurídico (${formatBRL(pr.fora.negociacao.valor)})`}
              {pr.fora.negociacao.qtd > 0 && pr.fora.parados.qtd > 0 && ' e'}
              {pr.fora.parados.qtd > 0 &&
                ` ${pr.fora.parados.qtd} parados há mais tempo do que qualquer pagamento já recebido (${formatBRL(pr.fora.parados.valor)})`}
              . Se pagarem, é dinheiro a mais; se não, a perda é de até {formatBRL(pr.fora.perda_se_nao_pagarem)} em produto e frete.
            </div>
          )}
        </Panel>

        <Panel title={positivo ? 'Lucro previsto' : 'Prejuízo previsto'} hint="com a base de hoje">
          <div className="divide-y divide-line">
            <Linha rotulo="Lucro real até agora" nota='o mesmo da Demonstração de Resultados em "Este mês"' cents={l.ate_agora} sinal="=" />
            <Linha rotulo="Receita que deve entrar" nota="dos pedidos da base" cents={l.receita_prevista} sinal="+" />
            <Linha rotulo="Custos dessa receita" nota="produto, frete, comissões e taxa de boleto" cents={-l.custos_da_receita} sinal="−" />
            <Linha
              rotulo="Frustração prevista"
              nota={`${formatPercent(FRUSTRACAO_PREVISTA, 0)} dos pedidos da base: cancelamento, roubo, devolução — tudo`}
              cents={-l.frustracao_prevista}
              sinal="−"
            />
          </div>
          <div
            className={`px-[18px] py-5 border-t flex items-end justify-between gap-4 bg-gradient-to-br ${
              positivo ? 'from-grn/[0.10] to-transparent border-grn/30' : 'from-red/[0.10] to-transparent border-red/30'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold tracking-[0.14em] uppercase ${positivo ? 'text-grn' : 'text-red'}`}>
                {positivo ? 'Lucro previsto' : 'Prejuízo previsto'}
              </div>
              <div className="text-[11px] text-dim2 mt-1">com {formatPercent(FRUSTRACAO_PREVISTA, 0)} de frustração · sem anúncios e vendas dos próximos dias</div>
            </div>
            <div className={`mono text-[26px] lg:text-[30px] font-extrabold tracking-tight shrink-0 ${positivo ? 'text-grn' : 'text-red'}`}>
              {formatBRL(l.previsto)}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Faturamento do mês" hint={`em R$ · até ${dm(pr.fim)}`}>
        <div className="px-3 lg:px-4 pt-3 pb-2">
          <AreaPrevisao serie={pr.serie} hoje={pr.hoje} />
        </div>
        <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2">
          A linha tracejada é só o que os pedidos da base devem pagar até {dm(pr.fim)}: chega a {formatBRL(pr.faturamento_mes)} no mês.
        </div>
      </Panel>

      <div className="rounded-[12px] border border-line2 bg-card2 px-4 py-[13px] text-[12px] text-dim leading-relaxed">
        <b className="text-tx">Como a previsão é feita.</b> Só entram os pedidos que já existem, e sempre com{' '}
        {formatPercent(FRUSTRACAO_PREVISTA, 0)} de frustração — o máximo que a operação chega, já com cancelamento, roubo, devolução e
        todo o resto: {formatPercent(1 - FRUSTRACAO_PREVISTA, 0)} de cada etapa pagam. Quanto se perde em cada frustração vem dos{' '}
        {pr.historico.resolvidos} pedidos que já se resolveram nos últimos 120 dias, pelas regras do BlueSales (entregue que não paga perde
        produto + frete; cancelado antes de sair, nada).
        {pr.historico.atraso_mediano != null && ` Metade dos pagamentos chega em até ${pr.historico.atraso_mediano} dias depois do agendamento.`}{' '}
        Cada real agendado vira {formatBRL(Math.round(pr.historico.fator_recebido * 100))} recebido (descontos e pagamentos parciais). Os
        anúncios e as vendas dos próximos dias não entram. A conta é refeita sozinha a cada pedido novo — é uma estimativa, não uma
        garantia.
      </div>
    </div>
  );
}

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

/** Meta de lucro do mês: chega com a base de hoje? Se não, quantas vendas novas faltam. */
function MetaDoMes({
  meta,
  plano,
  nomeMes,
  fim,
  onSalvar,
}: {
  meta: Cents;
  plano: PlanoMeta | null;
  nomeMes: string;
  fim: string;
  onSalvar: (cents: Cents) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(meta);

  if (editando) {
    return (
      <div className="rounded-card border border-line2 bg-card px-4 py-3 flex flex-wrap items-center gap-2.5">
        <Target size={16} className="text-gold shrink-0" />
        <span className="text-[13px] font-semibold text-tx shrink-0">Meta de lucro de {nomeMes}</span>
        <div className="flex-1 min-w-[160px] max-w-[260px]">
          <MoneyInput cents={rascunho} onChange={setRascunho} autoFocus />
        </div>
        <button
          onClick={() => {
            onSalvar(rascunho);
            setEditando(false);
          }}
          title="Salvar"
          className="grid place-items-center w-9 h-9 rounded-lg text-grn hover:bg-grn/10 shrink-0"
        >
          <Check size={16} />
        </button>
        <button onClick={() => setEditando(false)} title="Cancelar" className="grid place-items-center w-9 h-9 rounded-lg text-dim2 hover:text-tx shrink-0">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!plano) {
    return (
      <button
        onClick={() => {
          setRascunho(0);
          setEditando(true);
        }}
        className="rounded-card border border-dashed border-line2 px-4 py-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-dim hover:text-tx hover:border-gold/50 transition-colors"
      >
        <Target size={15} /> Definir meta de lucro de {nomeMes}
      </button>
    );
  }

  const pct = plano.meta > 0 ? Math.max(0, Math.min(1, plano.previsto / plano.meta)) : 0;
  const v = plano.venda;
  return (
    <div className={`rounded-card border px-4 lg:px-5 py-4 ${plano.atingida ? 'border-grn/30 bg-grn/[0.04]' : 'border-gold/30 bg-gold/[0.04]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Target size={18} className={plano.atingida ? 'text-grn shrink-0' : 'text-gold shrink-0'} />
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-tx leading-snug">
              Meta de lucro de {nomeMes}: <span className="whitespace-nowrap">{formatBRL(plano.meta)}</span>
            </div>
            <div className="text-[11.5px] text-dim">previsão com a base de hoje: {formatBRL(plano.previsto)}</div>
          </div>
        </div>
        <button
          onClick={() => {
            setRascunho(plano.meta);
            setEditando(true);
          }}
          title="Mudar a meta"
          className="inline-flex items-center gap-1.5 px-2.5 py-[6px] rounded-[9px] text-[12px] font-semibold text-dim hover:text-tx border border-line2 shrink-0"
        >
          <Pencil size={12} /> Mudar
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="flex-1 h-[8px] rounded-full bg-trilha overflow-hidden">
          <span className={`block h-full rounded-full ${plano.atingida ? 'bg-grn' : 'bg-gold'}`} style={{ width: `${pct * 100}%` }} />
        </span>
        <span className={`mono text-[13px] font-extrabold shrink-0 ${plano.atingida ? 'text-grn' : 'text-gold2'}`}>{Math.round(pct * 100)}%</span>
      </div>

      <div className="mt-3 text-[13px] leading-relaxed">
        {plano.atingida ? (
          <span className="text-grn font-semibold">
            Com a base de hoje você já chega na meta — {formatBRL(plano.sobra)} acima. Venda nova é lucro a mais.
          </span>
        ) : plano.vendas != null ? (
          <span className="text-tx">
            Faltam <b>{formatBRL(plano.falta)}</b>. São <b className="text-gold2">{plano.vendas} vendas agendadas a mais</b> (cerca de{' '}
            {plano.pagas} pagas), <b>{ritmo(plano.por_dia!)}</b> até {fim}.
          </span>
        ) : v ? (
          <span className="text-red font-semibold">
            Faltam {formatBRL(plano.falta)}, mas hoje cada venda nova dá prejuízo: rende {formatBRL(v.lucro_antes_do_anuncio)} e o anúncio
            custa {formatBRL(v.anuncio)} por venda. Vender mais não fecha a meta — é preciso baixar o custo por venda ou subir o ticket.
          </span>
        ) : (
          <span className="text-dim">Faltam {formatBRL(plano.falta)}. Sem vendas nos últimos 30 dias para calcular quantas faltam.</span>
        )}
      </div>

      {v && (
        <div className="mt-2 text-[11px] text-dim2 leading-relaxed">
          Cada venda nova (médias dos últimos 30 dias): ticket {formatBRL(v.ticket)} · {formatPercent(1 - FRUSTRACAO_PREVISTA, 0)} pagam ·{' '}
          {formatBRL(v.lucro_antes_do_anuncio)} de lucro depois de produto, frete, comissões e frustração − {formatBRL(v.anuncio)} de anúncio por
          venda = <b className={v.lucro > 0 ? 'text-grn' : 'text-red'}>{formatBRL(v.lucro)}</b>.
        </div>
      )}
    </div>
  );
}
