// ─────────────────────────────────────────────────────────────
// Painel do Vendedor: o que o PETER / Matheus veem ao entrar com o login
// deles. Só os PRÓPRIOS pedidos — o banco (RLS, migração 0021) nem
// entrega o resto: nada de P&L, custos, anúncios ou pedidos dos outros.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarCheck, Check, HandCoins, Loader2, LogOut, Pencil, Percent, RefreshCw, Search, ShieldAlert, Target, TriangleAlert } from 'lucide-react';
import type { Pedido } from '@/types';
import { supabase } from '@/lib/supabase';
import { pedidoDaLinha } from '@/data/supabaseBackend';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { LogoMark, Wordmark } from '@/components/Logo';
import { BotaoTemaCompacto } from '@/components/RodapeConta';
import { KpiCard, Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { COR } from '@/lib/cores';
import { formatBRL, formatPercent, reaisToCents } from '@/lib/money';
import { formatDiaMes, hojeIso } from '@/lib/dates';
import { chaveVendedor } from '@/lib/pnl';
import { type Situacao, situacaoDoPedido } from '@/lib/indicadores';
import { resumoDoVendedor } from '@/lib/vendedor';
import { type AlertaCliente, pedidoEmAberto } from '@/lib/clientes';
import { alertasDoVendedor, alertasRegistradosDoVendedor } from '@/lib/clientesApi';
import type { AlertaRegistrado } from '@/lib/alertasRegistro';
import { AvisoAlertas, alertasNovos } from '@/components/alertas/AvisoAlertas';
import { SeloAlerta } from '@/components/alertas/SeloAlerta';
import { VerificarCliente } from '@/components/alertas/VerificarCliente';

const CAMPOS =
  'id,internal_id,status,data,data_aprovacao,valor,valor_agendado,produto_plano,metodo_pagamento,vendedor,cliente,removido_em,passou_correios';

/** Como o BlueSales mostra a etapa (o webhook manda sem acento). */
const ETAPAS: Record<string, string> = {
  aguard_coleta: 'Aguard. coleta',
  aguardando_devolucao: 'Aguard. devolução',
  requer_atencao: 'Atenção',
  negociacao: 'Negociação',
  inadimplencias: 'Jurídico',
  retirar_nos_correios: 'Retirar nos Correios',
  saiu_para_entrega: 'Saiu p/ entrega',
};

/** "saiu_para_entrega" → "Saiu p/ entrega". */
function rotuloEtapa(status: string | null): string {
  const bruto = (status ?? '').trim();
  if (ETAPAS[bruto.toLowerCase()]) return ETAPAS[bruto.toLowerCase()];
  const s = bruto.replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

const COR_SITUACAO: Record<Situacao, string> = {
  pago: 'text-grn border-grn/35 bg-grn/10',
  rota: 'text-gold2 border-gold/35 bg-gold/10',
  preparo: 'text-tx2 border-line2 bg-chip',
  aguardando: 'text-tx border-line2 bg-card2',
  negociacao: 'text-yel border-yel/35 bg-yel/10',
  frustracao: 'text-red border-red/35 bg-red/10',
};

export function PainelVendedor({
  donoId,
  vendedor,
  onLogout,
}: {
  donoId: string;
  vendedor: string;
  onLogout: () => void;
}) {
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [alertas, setAlertas] = useState<Map<string, AlertaCliente>>(new Map());

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setCarregando(true);
    // O banco só devolve os pedidos em que este login é o vendedor.
    const [{ data, error }, meusAlertas] = await Promise.all([
      supabase.from('bluesales_pedidos').select(CAMPOS).eq('user_id', donoId),
      alertasDoVendedor(),
    ]);
    setCarregando(false);
    if (error) return setErro(error.message);
    setErro(null);
    setPedidos((data ?? []).map((r) => pedidoDaLinha(r as Record<string, unknown>)));
    setAlertas(meusAlertas);
  }, [donoId]);

  // ── Aviso de alerta de cliente: o mesmo do dono, só dos pedidos dele ──
  // undefined = carregando; null = a função do banco ainda não existe
  // (migração 0026): fica o resumo antigo. O "visto" é deste aparelho —
  // não mexe no do dono.
  const [registrados, setRegistrados] = useState<AlertaRegistrado[] | null | undefined>(undefined);
  const chaveVistos = `afterpay-vendedor:alertas-vistos:${chaveVendedor(vendedor)}`;
  const [vistos, setVistos] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(chaveVistos) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  /** Se o alerta piorar depois (atualizado_em muda), ele volta como novo. */
  const chaveDo = (a: AlertaRegistrado) => `${a.id}:${a.atualizado_em}`;
  function marcarVisto(ids: number[]) {
    setVistos((atual) => {
      const novo = new Set(atual);
      for (const a of registrados ?? []) if (ids.includes(a.id)) novo.add(chaveDo(a));
      try {
        localStorage.setItem(chaveVistos, JSON.stringify([...novo].slice(-500)));
      } catch {
        /* só neste aparelho */
      }
      return novo;
    });
  }
  const registroVisivel = useMemo(
    () => (registrados ?? []).map((a) => ({ ...a, visto_em: vistos.has(chaveDo(a)) ? 'visto' : null })),
    [registrados, vistos],
  );

  // Com o painel aberto, confere a cada minuto: o pedido duplicado ou de
  // cliente com roubo aparece logo depois de agendado no BlueSales.
  useEffect(() => {
    const atualizar = () => {
      carregar();
      alertasRegistradosDoVendedor().then(setRegistrados);
    };
    atualizar();
    const t = setInterval(atualizar, 60_000);
    const aoVoltar = () => document.visibilityState === 'visible' && atualizar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [carregar]);

  // Na aba do navegador: "(2) ⚠️" enquanto houver alerta novo.
  const qtdNovos = alertasNovos(registroVisivel, pedidos ?? []).length;
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\) ⚠️ /, '');
    document.title = qtdNovos > 0 ? `(${qtdNovos}) ⚠️ ${original}` : original;
    return () => {
      document.title = original;
    };
  }, [qtdNovos]);

  const hoje = hojeIso();
  const r = useMemo(() => (pedidos ? resumoDoVendedor(pedidos, vendedor, periodo, hoje) : null), [pedidos, vendedor, periodo, hoje]);

  // ── Meta do dia (de cada vendedor, guardada neste aparelho) ──
  const chaveMeta = `afterpay-vendedor:meta:${chaveVendedor(vendedor)}`;
  const [meta, setMeta] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(chaveMeta)) || 0;
    } catch {
      return 0;
    }
  });
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaRascunho, setMetaRascunho] = useState(meta);
  function salvarMeta() {
    setMeta(metaRascunho);
    setEditandoMeta(false);
    try {
      localStorage.setItem(chaveMeta, String(metaRascunho));
    } catch {
      /* só neste aparelho; sem armazenamento, vale até fechar */
    }
  }

  // ── Lista de pedidos ──
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(40);
  const lista = useMemo(() => {
    if (!r) return [];
    const q = busca
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()
      .replace(/^#/, '');
    if (!q) return r.pedidos;
    return r.pedidos.filter(
      (p) =>
        String(p.internal_id ?? '') === q ||
        (p.cliente ?? '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(q),
    );
  }, [r, busca]);

  const nome = vendedor.charAt(0).toUpperCase() + vendedor.slice(1).toLowerCase();
  const pctMeta = meta > 0 && r ? Math.min(1, r.agendado_hoje.valor / meta) : 0;

  /** Alerta de um pedido dele que ainda dá tempo de segurar (em aberto). */
  const alertaAberto = (p: Pedido) => {
    const a = alertas.get(p.id);
    return a && a.nivel !== 'recompra' && pedidoEmAberto(p) ? a : undefined;
  };
  const emAlerta = (pedidos ?? []).filter((p) => !p.removido_em && alertaAberto(p));

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-line/70">
        <div className="max-w-[1100px] mx-auto px-3 lg:px-6 py-3 flex items-center gap-3">
          <LogoMark size={36} />
          <div className="hidden sm:block">
            <Wordmark />
          </div>
          <div className="flex-1" />
          <button
            onClick={carregar}
            title="Atualizar"
            className="inline-grid place-items-center w-9 h-9 rounded-[10px] border border-line2 text-dim hover:text-tx"
          >
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
          </button>
          <BotaoTemaCompacto />
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] border border-line2 text-[12.5px] text-dim hover:text-tx"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-3 lg:px-6 py-4 lg:py-6 flex flex-col gap-4 lg:gap-5">
        <div>
          <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Olá, {nome}!</h1>
          <p className="text-[13px] text-dim mt-0.5">Seus agendamentos, pagamentos e comissão</p>
        </div>
        <div className="overflow-x-auto -mx-3 px-3">
          <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
        </div>

        {erro && (
          <div className="flex items-start gap-2.5 rounded-[12px] border border-yel/40 bg-yel/[0.07] px-4 py-3 text-[12.5px] text-dim">
            <TriangleAlert size={15} className="text-yel shrink-0 mt-[2px]" />
            Não consegui carregar seus pedidos: {erro}
          </div>
        )}

        {!r ? (
          <div className="py-16 grid place-items-center text-dim">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (
          <>
            {/* O mesmo aviso do dono: pedido dele que chegou do BlueSales com
                alerta de cliente (duplicado, roubo, não pagou…). */}
            {Array.isArray(registrados) && <AvisoAlertas registro={registroVisivel} pedidos={pedidos ?? []} onVisto={marcarVisto} />}

            {/* Sem a migração 0026: o resumo pelos pedidos em aberto. */}
            {registrados === null && emAlerta.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-[12px] border border-red/40 bg-red/[0.07] px-4 py-3 text-[12.5px] text-dim leading-relaxed">
                <ShieldAlert size={16} className="text-red shrink-0 mt-[1px]" />
                <span>
                  <b className="text-tx">
                    {emAlerta.length} pedido{emAlerta.length === 1 ? '' : 's'} seu{emAlerta.length === 1 ? '' : 's'} em aberto com alerta
                  </b>{' '}
                  (cliente com roubo, frustração ou pedido duplicado): {emAlerta.map((p) => `#${p.internal_id ?? '?'}`).join(', ')}. Confirme
                  com a cliente antes do envio.
                </span>
              </div>
            )}

            {/* Meta do dia */}
            <div className="rounded-card border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-card to-card px-4 lg:px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.13em] uppercase text-tx2">Hoje você agendou</div>
                  <div className="mono text-[28px] lg:text-[32px] font-extrabold text-gold2 leading-none mt-1.5">
                    {formatBRL(r.agendado_hoje.valor)}
                  </div>
                  <div className="text-[12px] text-dim mt-1">
                    {r.agendado_hoje.qtd} pedido{r.agendado_hoje.qtd === 1 ? '' : 's'}
                    {meta > 0 && ` · meta ${formatBRL(meta)}`}
                  </div>
                </div>
                {editandoMeta ? (
                  <div className="flex items-center gap-2">
                    <div className="w-[150px]">
                      <MoneyInput cents={metaRascunho} onChange={setMetaRascunho} />
                    </div>
                    <button onClick={salvarMeta} className="inline-flex items-center gap-1.5 px-3.5 py-[10px] rounded-[10px] text-[12.5px] font-semibold bg-white text-bg">
                      <Check size={14} /> Salvar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setMetaRascunho(meta);
                      setEditandoMeta(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] text-[12.5px] font-semibold border border-line2 text-tx hover:bg-white/[0.04]"
                  >
                    {meta > 0 ? <Pencil size={13} /> : <Target size={14} />}
                    {meta > 0 ? 'Mudar meta' : 'Definir meta do dia'}
                  </button>
                )}
              </div>
              {meta > 0 && (
                <div className="mt-3.5">
                  <div className="h-[10px] bg-trilha rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pctMeta >= 1 ? 'bg-grn' : 'bg-gold-metal'}`}
                      style={{ width: `${Math.max(2, pctMeta * 100)}%` }}
                    />
                  </div>
                  <div className={`text-[11.5px] mt-1.5 ${pctMeta >= 1 ? 'text-grn font-semibold' : 'text-dim2'}`}>
                    {pctMeta >= 1
                      ? 'Meta batida!'
                      : `${formatPercent(pctMeta, 0)} da meta · faltam ${formatBRL(meta - r.agendado_hoje.valor)}`}
                  </div>
                </div>
              )}
            </div>

            <Panel title="Verificar cliente antes de agendar" hint="pelo CPF ou WhatsApp">
              <div className="p-3.5 lg:p-5">
                <VerificarCliente />
              </div>
            </Panel>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-[14px]">
              <KpiCard
                Icon={CalendarCheck}
                color={COR.ouro}
                valueColor={COR.texto}
                label="Agendado"
                value={formatBRL(r.agendado.valor)}
                sub={`${r.agendado.qtd} pedidos`}
              />
              <KpiCard
                Icon={BadgeCheck}
                color={COR.verde}
                label="Pagos"
                value={formatBRL(r.pagos.valor)}
                sub={`${r.pagos.qtd} pagamentos`}
              />
              <KpiCard
                Icon={HandCoins}
                color={COR.ouro}
                label="Sua comissão"
                value={formatBRL(r.comissao)}
                sub={`${formatPercent(r.pct, 0)} dos pagos`}
              />
              <KpiCard
                Icon={Percent}
                color={COR.ouro}
                valueColor={COR.texto}
                label="Conversão"
                value={formatPercent(r.conversao)}
                sub="pagos ÷ agendados"
              />
            </div>

            {/* Onde estão os pedidos */}
            <Panel title="Onde estão seus pedidos" hint={`agendados de ${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`}>
              <div className="p-3.5 lg:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
                {(
                  [
                    ['pago', 'Pagos', 'já pagaram'],
                    ['rota', 'Em rota', 'na rua'],
                    ['preparo', 'A enviar', 'ainda não saiu'],
                    ['aguardando', 'Entregues', 'falta pagar'],
                    ['negociacao', 'Negociação', 'atenção e jurídico'],
                    ['frustracao', 'Frustração', 'roubo, devolução…'],
                  ] as [Situacao, string, string][]
                ).map(([id, rotulo, nota]) => (
                  <div key={id} className="rounded-[12px] border border-line bg-card2/60 px-3 py-2.5 min-w-0">
                    <div className="text-[11px] text-dim truncate">{rotulo}</div>
                    <div className="mono text-[20px] font-extrabold text-tx leading-tight mt-0.5">{r.situacao[id].qtd}</div>
                    <div className="mono text-[11.5px] font-semibold text-tx2">{formatBRL(r.situacao[id].valor)}</div>
                    <div className="text-[10px] text-dim2 truncate">{nota}</div>
                  </div>
                ))}
              </div>
              {r.comissao_em_rota > 0 && (
                <div className="px-3.5 lg:px-5 pb-4 text-[12px] text-dim">
                  Se os <b className="text-tx">{r.situacao.rota.qtd}</b> pedidos em rota forem pagos, você ganha mais{' '}
                  <b className="text-gold2 mono">{formatBRL(r.comissao_em_rota)}</b> de comissão.
                </div>
              )}
            </Panel>

            {/* Lista */}
            <Panel title="Seus pedidos" hint={`${r.pedidos.length} no período`}>
              <div className="px-3.5 lg:px-5 pt-3.5">
                <label className="flex items-center gap-2 bg-card2 border border-line2 rounded-[10px] px-3 py-[9px]">
                  <Search size={15} className="text-dim2 shrink-0" />
                  <input
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setLimite(40);
                    }}
                    placeholder="Buscar por nome do cliente ou #número"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-tx placeholder:text-dim2"
                  />
                </label>
              </div>
              {lista.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-dim2">Nenhum pedido no período.</div>
              ) : (
                <div className="mt-2">
                  {lista.slice(0, limite).map((p) => {
                    const s = situacaoDoPedido(p.status);
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3.5 lg:px-5 py-2.5 border-t border-line/70">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-tx truncate">{p.cliente || 'Cliente sem nome'}</div>
                          {alertaAberto(p) && (
                            <div className="mt-0.5">
                              <SeloAlerta alerta={alertaAberto(p)!} />
                            </div>
                          )}
                          <div className="text-[11px] text-dim2 mono">
                            #{p.internal_id ?? '—'} · {formatDiaMes(p.data)}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10.5px] font-semibold rounded-full border px-2 py-[2px] ${COR_SITUACAO[s]}`}>
                          {rotuloEtapa(p.status)}
                        </span>
                        <span className="shrink-0 mono text-[12.5px] font-bold text-tx w-[86px] text-right">
                          {formatBRL(reaisToCents(Number(p.valor_agendado ?? p.valor) || 0))}
                        </span>
                      </div>
                    );
                  })}
                  {lista.length > limite && (
                    <button
                      onClick={() => setLimite((l) => l + 40)}
                      className="w-full py-3 border-t border-line text-[12.5px] font-semibold text-gold2 hover:text-gold"
                    >
                      Ver mais {Math.min(40, lista.length - limite)}
                    </button>
                  )}
                </div>
              )}
            </Panel>

            <p className="text-[11px] text-dim2 leading-relaxed">
              Comissão = {formatPercent(r.pct, 0)} do valor pago, na data do pagamento — como no BlueSales. Pedido excluído da
              plataforma não entra. A meta do dia fica guardada neste aparelho.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
