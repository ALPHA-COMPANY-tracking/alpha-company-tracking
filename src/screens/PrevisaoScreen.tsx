// ─────────────────────────────────────────────────────────────
// Previsão do Mês: quanto já entrou, quanto deve entrar até o último dia
// e quanto deve sobrar — pelo ritmo e pelo histórico real (lib/previsao).
// É sempre o mês atual: o seletor de período não muda esta tela.
// ─────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { CalendarClock, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { AreaPrevisao } from '@/components/viz/AreaPrevisao';
import { COR } from '@/lib/cores';
import { type Cents, formatBRL, formatPercent } from '@/lib/money';
import { hojeIso } from '@/lib/dates';
import { type LinhaEtapa, preverMes } from '@/lib/previsao';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ROTULO: Record<LinhaEtapa['etapa'], { titulo: string; nota: (l: LinhaEtapa) => string }> = {
  aguardando: { titulo: 'Entregues, esperando pagamento', nota: (l) => `${formatPercent(l.taxa, 0)} dos entregues pagam` },
  rota: { titulo: 'Na rua (em rota)', nota: (l) => `${formatPercent(l.taxa, 0)} dos que saem para a rua pagam` },
  preparo: { titulo: 'A enviar', nota: (l) => `${formatPercent(l.taxa, 0)} dos agendados pagam` },
  novas: { titulo: 'Vendas que ainda vão ser agendadas', nota: (l) => `pelo ritmo dos últimos 14 dias · ${formatPercent(l.taxa, 0)} pagam` },
};

export function PrevisaoScreen() {
  const { pedidos, dailies, custos } = useData();
  const hoje = hojeIso();
  const pr = useMemo(() => preverMes(pedidos, dailies, custos, hoje), [pedidos, dailies, custos, hoje]);
  const y = hoje.slice(0, 4);
  const m = Number(hoje.slice(5, 7));
  const l = pr.lucro;
  const positivo = l.previsto >= 0;
  const pctEntrou = pr.faturamento_previsto > 0 ? pr.ja_entrou / pr.faturamento_previsto : 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Previsão do Mês</h1>
        <p className="text-[13px] text-dim mt-0.5">
          {MESES[m - 1]}/{y} ·{' '}
          {pr.diasRestantes === 0 ? 'último dia do mês' : `faltam ${pr.diasRestantes} ${pr.diasRestantes === 1 ? 'dia' : 'dias'}`} · pelo
          ritmo e pelo histórico real da operação
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 lg:gap-3.5">
        <KpiCard Icon={Wallet} color={COR.ouro} valueColor={COR.texto} label="Já entrou" value={formatBRL(pr.ja_entrou)} sub={`${pr.qtd_pagamentos} pagamentos até hoje`} />
        <KpiCard
          Icon={CalendarClock}
          color={COR.ouro}
          valueColor={COR.texto}
          label={`Deve entrar até ${dm(pr.fim)}`}
          value={formatBRL(pr.deve_entrar)}
          sub={`${formatBRL(pr.proximos_7_dias)} nos próximos 7 dias`}
        />
        <KpiCard
          Icon={TrendingUp}
          color={COR.ouro}
          label="Faturamento previsto"
          value={formatBRL(pr.faturamento_previsto)}
          sub={`${formatPercent(pctEntrou, 0)} já entrou`}
        />
        <KpiCard
          Icon={positivo ? TrendingUp : TrendingDown}
          color={positivo ? COR.verde : COR.vermelho}
          label={positivo ? 'Lucro previsto' : 'Prejuízo previsto'}
          value={formatBRL(l.previsto)}
          sub={`margem ${formatPercent(l.margem)}`}
        />
      </div>

      <Panel title="Faturamento do mês" hint={`em R$ · até ${dm(pr.fim)}`}>
        <div className="px-3 lg:px-4 pt-3 pb-2">
          <AreaPrevisao serie={pr.serie} hoje={pr.hoje} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
        <Panel title="De onde vem o que deve entrar" hint={`até ${dm(pr.fim)}`}>
          <div className="divide-y divide-line">
            {pr.linhas.map((ln) => (
              <div key={ln.etapa} className="px-[18px] py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] text-tx">{ROTULO[ln.etapa].titulo}</div>
                  <div className="text-[10.5px] text-dim2 leading-snug">
                    {ln.etapa === 'novas'
                      ? `~${ln.qtd} pedidos (${pr.ritmo.qtd_dia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia)`
                      : `${ln.qtd} ${ln.qtd === 1 ? 'pedido' : 'pedidos'} · ${formatBRL(ln.valor)}`}{' '}
                    · {ROTULO[ln.etapa].nota(ln)}
                  </div>
                </div>
                <div className="mono text-[13.5px] font-bold text-grn shrink-0">{formatBRL(ln.previsto)}</div>
              </div>
            ))}
            <div className="px-[18px] py-3 flex items-center justify-between gap-3 bg-white/[0.015]">
              <div className="text-[13px] font-bold text-tx">Deve entrar até {dm(pr.fim)}</div>
              <div className="mono text-[15px] font-extrabold text-tx">{formatBRL(pr.deve_entrar)}</div>
            </div>
          </div>
          {(pr.fora.negociacao.qtd > 0 || pr.fora.parados.qtd > 0) && (
            <div className="px-[18px] py-2.5 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
              Fora da previsão:
              {pr.fora.negociacao.qtd > 0 &&
                ` ${pr.fora.negociacao.qtd} em negociação/jurídico (${formatBRL(pr.fora.negociacao.valor)})`}
              {pr.fora.negociacao.qtd > 0 && pr.fora.parados.qtd > 0 && ' e'}
              {pr.fora.parados.qtd > 0 &&
                ` ${pr.fora.parados.qtd} parados há mais tempo do que qualquer pagamento já recebido (${formatBRL(pr.fora.parados.valor)})`}
              . Se pagarem, é dinheiro a mais.
            </div>
          )}
        </Panel>

        <Panel title={positivo ? 'Lucro previsto' : 'Prejuízo previsto'} hint={`em ${dm(pr.fim)}`}>
          <div className="divide-y divide-line">
            <Linha rotulo="Lucro real até agora" nota='o mesmo da Demonstração de Resultados em "Este mês"' cents={l.ate_agora} sinal="=" />
            <Linha rotulo="Receita que deve entrar" nota={`até ${dm(pr.fim)}`} cents={l.receita_prevista} sinal="+" />
            <Linha rotulo="Custos dessa receita" nota="produto, frete, comissões e taxa de boleto" cents={-l.custos_da_receita} sinal="−" />
            <Linha
              rotulo="Anúncios dos dias que faltam"
              nota={`${pr.diasRestantes} dias × ${formatBRL(l.ads_dia)} (média dos últimos 7 dias)`}
              cents={-l.ads_restante}
              sinal="−"
            />
            {l.fixos_restantes > 0 && (
              <Linha rotulo="Custos mensais dos dias que faltam" nota="custos variáveis rateados por dia" cents={-l.fixos_restantes} sinal="−" />
            )}
            <Linha rotulo="Frustração prevista" nota="dos pedidos agendados neste mês" cents={-l.frustracao_prevista} sinal="−" />
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
              <div className="text-[11px] text-dim2 mt-1">margem {formatPercent(l.margem)} sobre o faturamento previsto</div>
            </div>
            <div className={`mono text-[26px] lg:text-[30px] font-extrabold tracking-tight shrink-0 ${positivo ? 'text-grn' : 'text-red'}`}>
              {formatBRL(l.previsto)}
            </div>
          </div>
        </Panel>
      </div>

      <div className="rounded-[12px] border border-line2 bg-card2 px-4 py-[13px] text-[12px] text-dim leading-relaxed">
        <b className="text-tx">Como a previsão é feita.</b> Dos {pr.base.resolvidos} pedidos que já se resolveram (pagos ou frustrados)
        nos últimos 120 dias, sai quanto paga em cada etapa: quem já foi entregue paga mais, porque passou do risco de roubo, devolução
        e cancelamento.
        {pr.base.atraso_mediano != null && ` Metade dos pagamentos chega em até ${pr.base.atraso_mediano} dias depois do agendamento.`}{' '}
        Cada real agendado vira {formatBRL(Math.round(pr.base.fator_recebido * 100))} recebido (descontos e pagamentos parciais). As
        vendas novas seguem o ritmo dos últimos 14 dias e os anúncios, a média dos últimos 7. A conta é refeita sozinha a cada pedido
        novo — é uma estimativa, não uma garantia.
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
