// Metas × operação, gargalo e tratamentos — mês contra mês (tela Indicadores).
import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, Pencil, TriangleAlert } from 'lucide-react';
import type { Pedido } from '@/types';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { type Cents, formatBRL, formatMultiplier, formatPercent } from '@/lib/money';
import { variacao } from '@/lib/tendencia';
import {
  type Diagnostico,
  type Fotografia,
  type LinhaTratamento,
  type Metas,
  METAS,
  mesAnterior,
  mixDeTratamentos,
  periodoDoMes,
  rotuloPeriodo,
} from '@/lib/metasOperacao';

type Cor = 'grn' | 'yel' | 'red' | null;
const COR_TEXTO: Record<Exclude<Cor, null>, string> = { grn: 'text-grn', yel: 'text-yel', red: 'text-red' };

/** Verde na meta, âmbar entre a meta e o empate, vermelho pior que o empate. */
function corPorMeta(bateMeta: boolean, pagaAConta: boolean): Cor {
  return bateMeta ? 'grn' : pagaAConta ? 'yel' : 'red';
}

interface Linha {
  rotulo: string;
  nota: string;
  atual: string;
  anterior: string;
  meta?: string;
  empate?: string;
  cor: Cor;
  /** Variação contra o mês anterior e se subir é bom (null = nem bom nem ruim). */
  delta: number | null;
  sobeEhBom: boolean | null;
}

export function PainelMetas({
  atual,
  anterior,
  metas,
  onSalvar,
  onRestaurar,
}: {
  atual: Fotografia;
  anterior: Fotografia;
  metas: Metas;
  onSalvar: (m: Metas) => void;
  onRestaurar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const temAnuncio = atual.anuncio > 0;
  const linhas: Linha[] = [
    {
      rotulo: 'Faturamento agendado',
      nota: `${atual.qtd_agendados} agendamentos (antes ${anterior.qtd_agendados})`,
      atual: formatBRL(atual.valor_agendado),
      anterior: formatBRL(anterior.valor_agendado),
      cor: null,
      delta: variacao(atual.valor_agendado, anterior.valor_agendado),
      sobeEhBom: true,
    },
    {
      rotulo: 'Ticket médio agendado',
      nota: 'faturamento agendado ÷ agendamentos',
      atual: formatBRL(atual.ticket_agendado),
      anterior: formatBRL(anterior.ticket_agendado),
      cor: null,
      delta: variacao(atual.ticket_agendado, anterior.ticket_agendado),
      sobeEhBom: true,
    },
    {
      rotulo: 'Recebido',
      nota: `${atual.qtd_pagamentos} pagamentos (antes ${anterior.qtd_pagamentos})`,
      atual: formatBRL(atual.receita),
      anterior: formatBRL(anterior.receita),
      cor: null,
      delta: variacao(atual.receita, anterior.receita),
      sobeEhBom: true,
    },
    {
      rotulo: 'Ticket médio recebido',
      nota: 'recebido ÷ pagamentos',
      atual: formatBRL(atual.ticket_recebido),
      anterior: formatBRL(anterior.ticket_recebido),
      cor: null,
      delta: variacao(atual.ticket_recebido, anterior.ticket_recebido),
      sobeEhBom: true,
    },
    {
      rotulo: 'Investimento em anúncios',
      nota: 'no período',
      atual: formatBRL(atual.anuncio),
      anterior: formatBRL(anterior.anuncio),
      cor: null,
      delta: variacao(atual.anuncio, anterior.anuncio),
      sobeEhBom: null,
    },
    {
      rotulo: 'CPA por agendamento',
      nota: 'anúncio ÷ agendamentos',
      atual: formatBRL(atual.cpa_agendamento),
      anterior: formatBRL(anterior.cpa_agendamento),
      meta: `até ${formatBRL(metas.cpa_agendamento)}`,
      empate: atual.anuncio_empate > 0 ? `até ${formatBRL(atual.cpa_empate)}` : 'sem empate',
      cor: temAnuncio ? corPorMeta(atual.cpa_agendamento <= metas.cpa_agendamento, atual.cpa_agendamento <= atual.cpa_empate) : null,
      delta: variacao(atual.cpa_agendamento, anterior.cpa_agendamento),
      sobeEhBom: false,
    },
    {
      rotulo: 'ROAS agendado',
      nota: 'agendado ÷ anúncio',
      atual: formatMultiplier(atual.roas_agendado),
      anterior: formatMultiplier(anterior.roas_agendado),
      meta: `mín. ${formatMultiplier(metas.roas_agendado)}`,
      empate: Number.isFinite(atual.roas_agendado_empate) ? `mín. ${formatMultiplier(atual.roas_agendado_empate)}` : 'sem empate',
      cor: temAnuncio ? corPorMeta(atual.roas_agendado >= metas.roas_agendado, atual.roas_agendado >= atual.roas_agendado_empate) : null,
      delta: variacao(atual.roas_agendado, anterior.roas_agendado),
      sobeEhBom: true,
    },
    {
      rotulo: 'ROAS aprovado',
      nota: 'recebido ÷ anúncio',
      atual: formatMultiplier(atual.roas_aprovado),
      anterior: formatMultiplier(anterior.roas_aprovado),
      meta: `mín. ${formatMultiplier(metas.roas_aprovado)}`,
      empate: Number.isFinite(atual.roas_aprovado_empate) ? `mín. ${formatMultiplier(atual.roas_aprovado_empate)}` : 'sem empate',
      cor: temAnuncio ? corPorMeta(atual.roas_aprovado >= metas.roas_aprovado, atual.roas_aprovado >= atual.roas_aprovado_empate) : null,
      delta: variacao(atual.roas_aprovado, anterior.roas_aprovado),
      sobeEhBom: true,
    },
    {
      rotulo: 'Pagamentos ÷ agendamentos',
      nota: `${atual.entregues_sem_pagar.qtd} entregues sem pagar · ${formatBRL(atual.entregues_sem_pagar.valor)}`,
      atual: formatPercent(atual.pct_pagos),
      anterior: formatPercent(anterior.pct_pagos),
      cor: null,
      delta: variacao(atual.pct_pagos, anterior.pct_pagos),
      sobeEhBom: true,
    },
    {
      rotulo: 'Frustração',
      nota: 'devolvido, roubo… dos agendados (sem cancelado)',
      atual: formatPercent(atual.pct_frustracao),
      anterior: formatPercent(anterior.pct_frustracao),
      meta: `até ${formatPercent(metas.frustracao, 0)}`,
      cor: atual.qtd_agendados ? (atual.pct_frustracao <= metas.frustracao ? 'grn' : 'red') : null,
      delta: variacao(atual.pct_frustracao, anterior.pct_frustracao),
      sobeEhBom: false,
    },
    {
      rotulo: 'Lucro real',
      nota: `margem ${formatPercent(atual.margem_real)} (antes ${formatPercent(anterior.margem_real)})`,
      atual: formatBRL(atual.lucro_real),
      anterior: formatBRL(anterior.lucro_real),
      cor: atual.lucro_real >= 0 ? 'grn' : 'red',
      delta: variacao(atual.lucro_real, anterior.lucro_real),
      sobeEhBom: true,
    },
  ];

  return (
    <Panel
      title="Metas × operação"
      right={
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden sm:inline text-[11.5px] text-dim2 truncate">
            {rotuloPeriodo(atual.periodo)} contra {rotuloPeriodo(anterior.periodo)}
          </span>
          <button
            onClick={() => setEditando((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[11.5px] font-semibold text-gold2 border border-gold/40 hover:bg-gold/10"
          >
            <Pencil size={12} /> Editar metas
          </button>
        </div>
      }
    >
      {editando && (
        <EditorMetas
          metas={metas}
          onSalvar={(m) => {
            onSalvar(m);
            setEditando(false);
          }}
          onRestaurar={() => {
            onRestaurar();
            setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[660px] text-[12.5px]">
          <thead>
            <tr className="text-dim2 text-[10px] uppercase tracking-[0.1em]">
              <th className="text-left font-bold px-[18px] py-2.5">Indicador</th>
              <th className="text-right font-bold px-3 py-2.5">{rotuloPeriodo(atual.periodo)}</th>
              <th className="text-right font-bold px-3 py-2.5">{rotuloPeriodo(anterior.periodo)}</th>
              <th className="text-right font-bold px-3 py-2.5">Meta</th>
              <th className="text-right font-bold px-[18px] py-2.5" title="Com a conversão e os custos deste período, o ponto em que o lucro real zera">
                Empate
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-line/70">
                <td className="px-[18px] py-2.5">
                  <div className="text-tx">{l.rotulo}</div>
                  <div className="text-[10.5px] text-dim2">{l.nota}</div>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <div className={`mono font-bold ${l.cor ? COR_TEXTO[l.cor] : 'text-tx'}`}>{l.atual}</div>
                  <Delta valor={l.delta} sobeEhBom={l.sobeEhBom} />
                </td>
                <td className="px-3 py-2.5 text-right mono text-dim whitespace-nowrap">{l.anterior}</td>
                <td className="px-3 py-2.5 text-right mono text-dim2 whitespace-nowrap">{l.meta ?? '—'}</td>
                <td className="px-[18px] py-2.5 text-right mono text-dim2 whitespace-nowrap">{l.empate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-[18px] py-3 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
        <b className="text-dim">Empate</b>: com o que a operação converteu, custou e frustrou neste período, até onde o anúncio
        pode ir sem dar prejuízo (lucro real zero, já com os custos variáveis). Verde = na meta · âmbar = fora da meta, mas
        ainda no lucro · vermelho = dando prejuízo. Mês em andamento: parte dos pedidos ainda está na rua, então pagamentos e
        frustração sobem até ele se resolver.
      </div>
    </Panel>
  );
}

/** "2,5" / "2.5" → 2.5; vazio ou inválido → NaN (volta para o padrão ao salvar). */
const numero = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
const decimal = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** As metas, editáveis. Ficam guardadas neste navegador. */
function EditorMetas({
  metas,
  onSalvar,
  onRestaurar,
  onCancelar,
}: {
  metas: Metas;
  onSalvar: (m: Metas) => void;
  onRestaurar: () => void;
  onCancelar: () => void;
}) {
  const [roasAgendado, setRoasAgendado] = useState(decimal(metas.roas_agendado));
  const [cpa, setCpa] = useState(metas.cpa_agendamento);
  const [roasAprovado, setRoasAprovado] = useState(decimal(metas.roas_aprovado));
  const [frustracao, setFrustracao] = useState(decimal(metas.frustracao * 100));
  const campo = 'w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx mono text-[15px] outline-none focus:border-gold';
  return (
    <div className="px-[18px] py-4 border-b border-line bg-gold/[0.04]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-dim">ROAS agendado mínimo</span>
          <input inputMode="decimal" value={roasAgendado} onChange={(e) => setRoasAgendado(e.target.value)} className={campo} />
          <span className="text-[10px] text-dim2">padrão {formatMultiplier(METAS.roas_agendado)}</span>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-dim">CPA por agendamento máximo</span>
          <MoneyInput cents={cpa} onChange={setCpa} />
          <span className="text-[10px] text-dim2">padrão {formatBRL(METAS.cpa_agendamento)}</span>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-dim">ROAS aprovado mínimo</span>
          <input inputMode="decimal" value={roasAprovado} onChange={(e) => setRoasAprovado(e.target.value)} className={campo} />
          <span className="text-[10px] text-dim2">padrão {formatMultiplier(METAS.roas_aprovado)}</span>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-dim">Frustração máxima (%)</span>
          <input inputMode="decimal" value={frustracao} onChange={(e) => setFrustracao(e.target.value)} className={campo} />
          <span className="text-[10px] text-dim2">padrão {formatPercent(METAS.frustracao, 0)}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          onClick={() =>
            onSalvar({
              roas_agendado: numero(roasAgendado),
              cpa_agendamento: cpa,
              roas_aprovado: numero(roasAprovado),
              frustracao: numero(frustracao) / 100,
            })
          }
          className="px-3 py-[6px] rounded-lg text-[12px] font-bold bg-gold text-black hover:brightness-110"
        >
          Salvar metas
        </button>
        <button onClick={onCancelar} className="px-3 py-[6px] rounded-lg text-[12px] text-dim2 hover:text-tx">
          Cancelar
        </button>
        <button onClick={onRestaurar} className="ml-auto px-3 py-[6px] rounded-lg text-[12px] text-dim2 hover:text-tx">
          Voltar ao padrão
        </button>
      </div>
      <div className="text-[10.5px] text-dim2 mt-2">As metas ficam guardadas neste navegador, como a meta diária.</div>
    </div>
  );
}

function Delta({ valor, sobeEhBom }: { valor: number | null; sobeEhBom: boolean | null }) {
  if (valor == null || Math.abs(valor) < 0.0005) return <div className="text-[10px] text-dim2 mono">—</div>;
  const bom = sobeEhBom == null ? null : (valor > 0) === sobeEhBom;
  const cor = bom == null ? 'text-dim2' : bom ? 'text-grn' : 'text-red';
  return (
    <div className={`text-[10px] mono ${cor}`}>
      {valor > 0 ? '↑' : '↓'} {formatPercent(Math.abs(valor))}
    </div>
  );
}

export function PainelGargalo({ diagnosticos }: { diagnosticos: Diagnostico[] }) {
  const gargalo = diagnosticos.find((d) => d.nivel !== 'ok');
  return (
    <Panel title="Onde está o gargalo" hint="do pior para o melhor">
      <div
        className={`px-[18px] py-4 border-b border-line ${
          gargalo ? (gargalo.nivel === 'ruim' ? 'bg-red/[0.06]' : 'bg-yel/[0.06]') : 'bg-grn/[0.06]'
        }`}
      >
        <div className={`text-[11px] font-bold tracking-[0.13em] uppercase ${gargalo ? (gargalo.nivel === 'ruim' ? 'text-red' : 'text-yel') : 'text-grn'}`}>
          {gargalo ? 'O gargalo agora' : 'Tudo dentro das metas'}
        </div>
        <div className="text-[14px] text-tx font-semibold mt-1">{gargalo ? gargalo.titulo : 'Nenhuma meta fora do lugar neste período.'}</div>
        {gargalo && <div className="text-[12px] text-dim mt-1 leading-relaxed">{gargalo.texto}</div>}
      </div>
      <div className="divide-y divide-line">
        {diagnosticos
          .filter((d) => d !== gargalo)
          .map((d) => {
            const Icone = d.nivel === 'ok' ? CircleCheck : d.nivel === 'ruim' ? TriangleAlert : CircleAlert;
            const cor = d.nivel === 'ok' ? 'text-grn' : d.nivel === 'ruim' ? 'text-red' : 'text-yel';
            return (
              <div key={d.titulo} className="px-[18px] py-3 flex items-start gap-2.5">
                <Icone size={15} className={`${cor} shrink-0 mt-[2px]`} />
                <div className="min-w-0">
                  <div className="text-[12.5px] text-tx">{d.titulo}</div>
                  <div className="text-[11px] text-dim2 leading-relaxed">{d.texto}</div>
                </div>
              </div>
            );
          })}
      </div>
    </Panel>
  );
}

type Escolha = 'atual' | 'anterior' | 'faixa';

/** 'YYYY-MM' do mês anterior a 'YYYY-MM'. */
function mesAntes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Mais vendidos do mês atual (até hoje), do mês anterior ou de um período à
 *  escolha (do dia X ao dia Y) — contra o período de antes. Independente do
 *  período do topo da tela. */
export function PainelTratamentos({ pedidos, hoje }: { pedidos: Pedido[]; hoje: string }) {
  const mesAtual = hoje.slice(0, 7);
  const [escolha, setEscolha] = useState<Escolha>('atual');
  // Personalizado começa no mês anterior inteiro; daí ajusta o dia inicial e o final.
  const [faixa, setFaixa] = useState(() => periodoDoMes(mesAntes(mesAtual), hoje));
  const periodo = useMemo(
    () => (escolha === 'faixa' ? faixa : periodoDoMes(escolha === 'atual' ? mesAtual : mesAntes(mesAtual), hoje)),
    [escolha, faixa, mesAtual, hoje],
  );
  const periodoAntes = useMemo(() => mesAnterior(periodo), [periodo]);
  const atual = useMemo(() => mixDeTratamentos(pedidos, periodo), [pedidos, periodo]);
  const anterior = useMemo(() => mixDeTratamentos(pedidos, periodoAntes), [pedidos, periodoAntes]);
  const rotuloAnterior = rotuloPeriodo(periodoAntes);
  const maisVendido = atual.reduce<LinhaTratamento | null>((m, l) => (!m || l.qtd > m.qtd ? l : m), null);
  const pctAntes = (meses: number | null) => anterior.find((l) => l.meses === meses)?.pct ?? 0;
  const botao = (sel: boolean) =>
    `px-2.5 py-[5px] rounded-lg text-[11.5px] font-semibold border transition-colors ${
      sel ? 'bg-chip text-tx border-gold/50' : 'text-dim border-line2 hover:text-tx'
    }`;
  return (
    <Panel title="Tratamentos mais vendidos" hint={rotuloPeriodo(periodo)}>
      <div className="px-[18px] py-2.5 border-b border-line flex flex-wrap items-center gap-1.5">
        <button onClick={() => setEscolha('atual')} className={botao(escolha === 'atual')}>
          Mês atual
        </button>
        <button onClick={() => setEscolha('anterior')} className={botao(escolha === 'anterior')}>
          Mês anterior
        </button>
        <button onClick={() => setEscolha('faixa')} className={botao(escolha === 'faixa')}>
          Personalizado
        </button>
        {escolha === 'faixa' && (
          // Do dia X ao dia Y — o mesmo jeito do "Custom" do topo.
          <div className="inline-flex items-center gap-2 bg-card2 border border-line2 rounded-lg px-2.5 py-[4px]">
            <input
              type="date"
              value={faixa.inicio}
              max={faixa.fim}
              onChange={(e) => e.target.value && setFaixa((f) => ({ ...f, inicio: e.target.value }))}
              aria-label="Do dia"
              className="bg-transparent text-[12px] text-tx outline-none"
            />
            <span className="text-dim2 text-xs">→</span>
            <input
              type="date"
              value={faixa.fim}
              min={faixa.inicio}
              max={hoje}
              onChange={(e) => e.target.value && setFaixa((f) => ({ ...f, fim: e.target.value }))}
              aria-label="Até o dia"
              className="bg-transparent text-[12px] text-tx outline-none"
            />
          </div>
        )}
        <span className="text-[11px] text-dim2 ml-auto">contra {rotuloAnterior}</span>
      </div>
      {atual.length === 0 ? (
        <div className="px-[18px] py-10 text-center text-[12.5px] text-dim2">Nenhum agendamento em {rotuloPeriodo(periodo)}.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead>
              <tr className="text-dim2 text-[10px] uppercase tracking-[0.1em]">
                <th className="text-left font-bold px-[18px] py-2.5">Tratamento</th>
                <th className="text-right font-bold px-3 py-2.5">Pedidos</th>
                <th className="text-right font-bold px-3 py-2.5">Ticket</th>
                <th className="text-right font-bold px-3 py-2.5">Já pagos</th>
                <th className="text-right font-bold px-[18px] py-2.5">vs {rotuloAnterior}</th>
              </tr>
            </thead>
            <tbody>
              {atual.map((l) => {
                const diff = l.pct - pctAntes(l.meses);
                return (
                  <tr key={String(l.meses)} className="border-t border-line/70">
                    <td className="px-[18px] py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-tx font-medium">{l.rotulo}</span>
                        {l === maisVendido && (
                          <span className="text-[9px] uppercase tracking-wide font-bold text-gold2 border border-gold/40 bg-gold/10 rounded-full px-[7px] py-[1px]">
                            mais vendido
                          </span>
                        )}
                      </div>
                      {/* Barra: a fatia do tratamento nos agendamentos. */}
                      <div className="h-[5px] rounded-full bg-trilha mt-1.5 w-full max-w-[180px] overflow-hidden">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round(l.pct * 100)}%` }} />
                      </div>
                      <div className="text-[10px] text-dim2 mt-1 mono">
                        {formatBRL(l.valor)}
                        {l.promo > 0 && ` · ${l.promo} promo`}
                        {l.frustrados > 0 && ` · ${l.frustrados} frustrado${l.frustrados === 1 ? '' : 's'}`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="mono font-bold text-tx">{l.qtd}</div>
                      <div className="text-[10px] text-dim2 mono">{formatPercent(l.pct)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-tx whitespace-nowrap">{formatBRL(l.ticket as Cents)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="mono text-tx">{formatPercent(l.pct_pagos)}</div>
                      <div className="text-[10px] text-dim2 mono">{l.pagos} pagos</div>
                    </td>
                    <td className="px-[18px] py-2.5 text-right mono whitespace-nowrap">
                      {Math.abs(diff) < 0.005 ? (
                        <span className="text-dim2">igual</span>
                      ) : (
                        <span className={diff > 0 ? 'text-gold2' : 'text-dim'}>
                          {diff > 0 ? '+' : '−'}
                          {(Math.abs(diff) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-[18px] py-3 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
        Pelos pedidos agendados no mês escolhido (os mesmos do Faturamento Agendado). "Já pagos" é dos agendados deste período —
        em mês em andamento ainda sobe. "vs" mostra se o tratamento ganhou ou perdeu espaço no mix (pontos percentuais).
      </div>
    </Panel>
  );
}
