import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, CalendarClock, Check, Megaphone, Pencil, Target, TrendingUp, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AfterpayDaily, CustoVariavel, Pedido, Periodo } from '@/types';
import type { PnlResult, PnlOptions } from '@/lib/pnl';
import { calcularPnl } from '@/lib/pnl';
import { formatBRL, formatPercent, safeDiv } from '@/lib/money';
import { diasInclusivos, hojeIso } from '@/lib/dates';
import { COR, HEX, alfa } from '@/lib/cores';
import {
  legendaSerie,
  periodoAnterior,
  rotuloComparacao,
  seloPeriodo,
  serieTendencia,
  variacao,
} from '@/lib/tendencia';
import { AreaTendencia, type PontoArea } from '@/components/viz/AreaTendencia';
import { MoneyInput } from '@/components/MoneyInput';

const KEY_META = 'afterpay-pnl:meta-diaria';

function lerMeta(): number {
  try {
    return Number(localStorage.getItem(KEY_META)) || 0;
  } catch {
    return 0;
  }
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Selo "Hoje" / "7 dias" no canto dos cards. */
function Selo({ children }: { children: string }) {
  return (
    <span className="text-[10.5px] font-bold text-tx2 border border-line2 bg-card2 rounded-full px-[9px] py-[3px] whitespace-nowrap">
      {children}
    </span>
  );
}

/** Ícone redondo + rótulo em caixa alta + subtítulo. */
function Cabecalho({ Icon, cor, rotulo, sub, selo }: { Icon: LucideIcon; cor: string; rotulo: string; sub: string; selo: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-[38px] h-[38px] rounded-full grid place-items-center shrink-0 border"
          style={{ color: cor, background: alfa(cor, 10), borderColor: alfa(cor, 22) }}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-dim truncate">{rotulo}</div>
          <div className="text-[12px] text-dim2 truncate">{sub}</div>
        </div>
      </div>
      <Selo>{selo}</Selo>
    </div>
  );
}

/**
 * "↘ 63%  vs. ontem R$ 6.380,00". A seta segue o número; a COR segue o
 * que é bom para o negócio — gastar menos em anúncio é seta para baixo
 * em verde.
 */
function Variacao({
  atual,
  anterior,
  maiorEhMelhor,
  rotulo,
}: {
  atual: number;
  anterior: number;
  maiorEhMelhor: boolean;
  rotulo: string;
}) {
  const v = variacao(atual, anterior);
  const subiu = atual >= anterior;
  const bom = atual === anterior ? true : subiu === maiorEhMelhor;
  const cor = bom ? 'text-grn' : 'text-red';
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-2.5 mt-1.5">
      {v === null ? (
        <span className="text-[12px] font-bold text-dim2">—</span>
      ) : (
        <span className={`inline-flex items-center gap-[2px] text-[13px] font-extrabold ${cor}`}>
          <Seta size={15} strokeWidth={2.5} />
          {formatPercent(Math.abs(v)).replace(',0%', '%')}
        </span>
      )}
      <span className="leading-tight">
        <span className="block text-[10.5px] text-dim2">{rotulo}</span>
        <span className="block mono text-[11px] font-bold text-tx2">{formatBRL(anterior)}</span>
      </span>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-line rounded-card p-4 lg:p-5 flex flex-col ${className}`}>{children}</div>;
}

/** Barra de meta dentro do card de pagamentos. A meta fica salva neste aparelho. */
function MetaDiaria({ aprovado, dias }: { aprovado: number; dias: number }) {
  const [meta, setMeta] = useState(lerMeta);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(meta);

  function salvar() {
    try {
      localStorage.setItem(KEY_META, String(rascunho));
    } catch {
      /* ignora */
    }
    setMeta(rascunho);
    setEditando(false);
  }

  // Num período de vários dias a meta vira meta diária × dias.
  const alvo = meta * dias;
  const pct = alvo > 0 ? Math.min(1, aprovado / alvo) : 0;
  const rotulo = dias === 1 ? 'Meta diária' : `Meta de ${dias} dias`;

  if (editando) {
    return (
      <div className="mt-4 rounded-[12px] border border-line2 bg-card2 px-3 py-2.5 flex items-center gap-2">
        <Target size={15} className="text-grn shrink-0" />
        <span className="text-[12px] font-semibold text-tx shrink-0">Meta diária</span>
        <div className="flex-1 min-w-0">
          <MoneyInput cents={rascunho} onChange={setRascunho} autoFocus />
        </div>
        <button onClick={salvar} title="Salvar" className="grid place-items-center w-8 h-8 rounded-lg text-grn hover:bg-grn/10 shrink-0">
          <Check size={15} />
        </button>
        <button onClick={() => setEditando(false)} title="Cancelar" className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-tx shrink-0">
          <X size={15} />
        </button>
      </div>
    );
  }

  if (meta <= 0) {
    return (
      <button
        onClick={() => {
          setRascunho(0);
          setEditando(true);
        }}
        className="mt-4 rounded-[12px] border border-dashed border-line2 px-3 py-2.5 flex items-center justify-center gap-2 text-[12px] font-semibold text-dim hover:text-tx hover:border-grn/40 transition-colors"
      >
        <Target size={14} /> Definir meta diária
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        setRascunho(meta);
        setEditando(true);
      }}
      title="Alterar a meta"
      className="group mt-4 rounded-[12px] border border-line2 bg-card2 px-3 py-2.5 flex items-center gap-3 text-left hover:border-grn/40 transition-colors"
    >
      <span className="w-[26px] h-[26px] rounded-full grid place-items-center shrink-0 text-grn bg-grn/10 border border-grn/25">
        <Target size={13} strokeWidth={2.2} />
      </span>
      {/* Duas linhas: em card estreito os valores não cabem ao lado da barra. */}
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-tx whitespace-nowrap">
            {rotulo} <Pencil size={11} className="inline text-dim2 opacity-0 group-hover:opacity-100 -mt-0.5" />
          </span>
          <span className="text-[12px] font-extrabold text-grn shrink-0">{Math.round(pct * 100)}%</span>
        </span>
        <span className="block mt-1.5 h-[6px] rounded-full bg-trilha overflow-hidden">
          <span className="block h-full rounded-full bg-grn" style={{ width: `${pct * 100}%` }} />
        </span>
        <span className="block mt-1 mono text-[10.5px] text-dim2 truncate">
          {formatBRL(aprovado)} de {formatBRL(alvo)}
        </span>
      </span>
    </button>
  );
}

/**
 * Topo da Demonstração de Resultados, no modelo de dashboard com
 * tendência: agendado e pagamentos em destaque, anúncios e lucro ao lado.
 */
export function Destaques({
  pnl,
  periodo,
  dailies,
  custos,
  pedidos,
  opts,
}: {
  pnl: PnlResult;
  periodo: Periodo;
  dailies: AfterpayDaily[];
  custos: CustoVariavel[];
  pedidos: Pedido[];
  opts: PnlOptions;
}) {
  const hoje = hojeIso();
  const selo = seloPeriodo(periodo, hoje);
  const comparar = rotuloComparacao(periodo, hoje);
  const legenda = legendaSerie(periodo);
  const dias = diasInclusivos(periodo.inicio, periodo.fim);

  const antes = useMemo(
    () => calcularPnl(dailies, custos, periodoAnterior(periodo), opts, pedidos),
    [dailies, custos, periodo, opts, pedidos],
  );
  const serie = useMemo(() => serieTendencia(dailies, custos, pedidos, periodo, opts), [dailies, custos, pedidos, periodo, opts]);

  const pontos = (campo: 'agendado' | 'aprovado' | 'ads' | 'lucro'): PontoArea[] =>
    serie.map((p) => ({ rotulo: dm(p.data), valor: p[campo] / 100, exibir: formatBRL(p[campo]) }));

  const lucroPositivo = pnl.lucro_real >= 0;
  const corLucro = lucroPositivo ? HEX.verde : HEX.vermelho;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 lg:gap-4">
      {/* ── Faturamento Agendado ── */}
      <Card className="xl:col-span-4 2xl:col-span-5">
        <Cabecalho
          Icon={CalendarClock}
          cor={COR.ouro}
          rotulo="Faturamento agendado"
          sub={`${pnl.qtd_agendados} agendamento${pnl.qtd_agendados === 1 ? '' : 's'}`}
          selo={selo}
        />
        <div className="mono text-[30px] lg:text-[36px] font-extrabold tracking-tight leading-none mt-5 text-gold2 truncate">
          {formatBRL(pnl.valor_agendado)}
        </div>
        <Variacao atual={pnl.valor_agendado} anterior={antes.valor_agendado} maiorEhMelhor rotulo={comparar} />
        <div className="mt-auto pt-4 -mx-1">
          <AreaTendencia dados={pontos('agendado')} cor={HEX.ouro} id="tend-agendado" altura={150} />
        </div>
        <div className="text-right text-[10.5px] text-dim2 mt-1">{legenda}</div>
      </Card>

      {/* ── Pagamentos Aprovados ── */}
      <Card className="xl:col-span-4">
        <Cabecalho
          Icon={BadgeCheck}
          cor={COR.verde}
          rotulo="Pagamentos aprovados"
          sub={`${pnl.qtd_pagamentos} pagamento${pnl.qtd_pagamentos === 1 ? '' : 's'} aprovado${pnl.qtd_pagamentos === 1 ? '' : 's'}`}
          selo={selo}
        />
        <div className="mono text-[30px] lg:text-[36px] font-extrabold tracking-tight leading-none mt-5 text-grn truncate">
          {formatBRL(pnl.receita_aprovada)}
        </div>
        <Variacao atual={pnl.receita_aprovada} anterior={antes.receita_aprovada} maiorEhMelhor rotulo={comparar} />
        <div className="mt-auto pt-4 -mx-1">
          <AreaTendencia dados={pontos('aprovado')} cor={HEX.verde} id="tend-aprovado" altura={110} />
        </div>
        <div className="text-right text-[10.5px] text-dim2 mt-1">{legenda}</div>
        <MetaDiaria aprovado={pnl.receita_aprovada} dias={dias} />
      </Card>

      {/* ── Coluna da direita: anúncios e lucro ── */}
      <div className="md:col-span-2 xl:col-span-4 2xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 lg:gap-4">
        <Card>
          <Cabecalho
            Icon={Megaphone}
            cor={COR.vermelho}
            rotulo="Gastos em anúncios"
            sub={pnl.investimento_ads > 0 ? `${formatPercent(safeDiv(pnl.investimento_ads, pnl.valor_agendado))} do agendado` : 'Nenhum registro'}
            selo={selo}
          />
          <div className="flex items-end justify-between gap-3 mt-auto pt-5">
            <div className="min-w-0">
              <div className="mono text-[24px] lg:text-[26px] font-extrabold tracking-tight leading-none text-red truncate">
                {formatBRL(pnl.investimento_ads)}
              </div>
              <Variacao atual={pnl.investimento_ads} anterior={antes.investimento_ads} maiorEhMelhor={false} rotulo={comparar} />
            </div>
            <div className="w-[38%] max-w-[150px] shrink-0">
              <AreaTendencia dados={pontos('ads')} cor={HEX.vermelho} id="tend-ads" altura={56} eixo={false} ponto={false} />
            </div>
          </div>
        </Card>

        <Card>
          <Cabecalho
            Icon={TrendingUp}
            cor={lucroPositivo ? COR.verde : COR.vermelho}
            rotulo={lucroPositivo ? 'Lucro real' : 'Prejuízo real'}
            sub={`Margem ${formatPercent(pnl.margem_real)}`}
            selo={selo}
          />
          <div className="flex items-end justify-between gap-3 mt-auto pt-5">
            <div className="min-w-0">
              <div
                className={`mono text-[24px] lg:text-[26px] font-extrabold tracking-tight leading-none truncate ${lucroPositivo ? 'text-grn' : 'text-red'}`}
              >
                {formatBRL(pnl.lucro_real)}
              </div>
              <Variacao atual={pnl.lucro_real} anterior={antes.lucro_real} maiorEhMelhor rotulo={comparar} />
            </div>
            <div className="w-[38%] max-w-[150px] shrink-0">
              <AreaTendencia dados={pontos('lucro')} cor={corLucro} id="tend-lucro" altura={56} eixo={false} ponto={false} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
