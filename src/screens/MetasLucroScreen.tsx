// ─────────────────────────────────────────────────────────────
// Metas & Lucro: simulador mensal (pedido do Jonas, 02/11/2026).
// Premissas do mês → o mês fecha no lucro? Quanto de bônus e se cabe?
// Mais o comparativo mês anterior × mês atual × meta salva.
// Cálculo em src/lib/metasLucro.ts (testes de aceite lá).
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Megaphone, Plus, RotateCcw, Save, Target, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';
import { CurvaLucro } from '@/components/metas/CurvaLucro';
import { COR } from '@/lib/cores';
import { hojeIso } from '@/lib/dates';
import {
  FAIXAS_PADRAO,
  type Faixa,
  type Faixas,
  type MetaMensal,
  type Premissas,
  type Resultado,
  curvaPorTaxa,
  faixaAtingida,
  mesAntes,
  nomeDoMes,
  periodoDoMesInteiro,
  premissasIniciais,
  projetarPeloRitmo,
  realizado,
  referenciasDe,
  simular,
  taxasDe,
} from '@/lib/metasLucro';

// ── Formatação pt-BR (null/NaN = "—") ───────────────────────

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const r0 = (v: number | null | undefined) =>
  ok(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 }) : '—';
const r2 = (v: number | null | undefined) => (ok(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
const pct = (v: number | null | undefined) =>
  ok(v) ? `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
const n1 = (v: number | null | undefined) => (ok(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—');
const corSinal = (v: number | null | undefined) => (!ok(v) ? 'text-dim2' : v < 0 ? 'text-red' : 'text-grn');
const taxaTxt = (t: number | null) => (!ok(t) ? '—' : t > 1 ? 'mais de 100%' : pct(t));
const cpaTxt = (c: number | null) => (!ok(c) ? '—' : c <= 0 ? 'nenhum CPA fecha' : r2(c));

export function MetasLucroScreen() {
  const { dailies, custos, pedidos, carregarMetaMensal, salvarMetaMensal } = useData();
  const hoje = hojeIso();
  const mesAtual = hoje.slice(0, 7);
  const [mes, setMes] = useState(mesAtual);

  // O último mês fechado antes do mês escolhido: de onde vêm as premissas iniciais.
  const refAnterior = useMemo(
    () => referenciasDe(realizado(dailies, custos, pedidos, periodoDoMesInteiro(mesAntes(mes)))),
    [dailies, custos, pedidos, mes],
  );
  const refRef = useRef(refAnterior);
  refRef.current = refAnterior;

  const [premissas, setPremissas] = useState<Premissas>(() => premissasIniciais(refAnterior));
  const [faixas, setFaixas] = useState<Faixas>(FAIXAS_PADRAO);
  const [salva, setSalva] = useState<MetaMensal | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Ao abrir (e ao trocar o mês): a meta salva do mês, ou os valores iniciais.
  useEffect(() => {
    let vivo = true;
    setAviso(null);
    carregarMetaMensal(`${mes}-01`)
      .then((m) => {
        if (!vivo) return;
        setSalva(m);
        setPremissas(m ? m.premissas : premissasIniciais(refRef.current));
        setFaixas(m ? m.faixas : FAIXAS_PADRAO);
      })
      .catch((e) => {
        if (!vivo) return;
        setSalva(null);
        setPremissas(premissasIniciais(refRef.current));
        setFaixas(FAIXAS_PADRAO);
        setAviso({ tipo: 'erro', texto: `Não deu para ler a meta salva (${String(e?.message ?? e)}). Rode a migração 0031 no Supabase.` });
      });
    return () => {
      vivo = false;
    };
  }, [mes, carregarMetaMensal]);

  // A meta salva do MÊS ATUAL, para a coluna do comparativo.
  const [metaDoMesAtual, setMetaDoMesAtual] = useState<MetaMensal | null>(null);
  useEffect(() => {
    let vivo = true;
    carregarMetaMensal(`${mesAtual}-01`)
      .then((m) => vivo && setMetaDoMesAtual(m))
      .catch(() => vivo && setMetaDoMesAtual(null));
    return () => {
      vivo = false;
    };
  }, [mesAtual, carregarMetaMensal]);

  const res = useMemo(() => simular(premissas, faixas), [premissas, faixas]);
  const curva = useMemo(() => curvaPorTaxa(premissas, faixas), [premissas, faixas]);
  const set = (patch: Partial<Premissas>) => setPremissas((p) => ({ ...p, ...patch }));

  async function salvar() {
    if (!res) return;
    try {
      const meta: MetaMensal = { mes: `${mes}-01`, premissas, faixas, resultado: res };
      await salvarMetaMensal(meta);
      setSalva({ ...meta, atualizado_em: new Date().toISOString() });
      if (mes === mesAtual) setMetaDoMesAtual(meta);
      setAviso({ tipo: 'ok', texto: `Meta de ${nomeDoMes(mes)} salva.` });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: `Não salvou (${String((e as Error)?.message ?? e)}). Rode a migração 0031 no Supabase.` });
    }
  }

  function voltarAoPadrao() {
    setPremissas(premissasIniciais(refAnterior));
    setFaixas(FAIXAS_PADRAO);
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      {/* Cabeçalho: mês, salvar, voltar ao padrão */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Metas &amp; Lucro</h1>
          <p className="text-[13px] text-dim mt-0.5">
            Simule o mês: o lucro fecha? Quanto de bônus a equipe ganha e se cabe no lucro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            aria-label="Mês da meta"
            className="bg-card border border-line2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-tx outline-none focus:border-gold"
          />
          <button
            onClick={voltarAoPadrao}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[12px] font-semibold text-dim border border-line2 hover:text-tx"
          >
            <RotateCcw size={13} /> Voltar ao padrão
          </button>
          <button
            onClick={salvar}
            disabled={!res}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[12px] font-bold bg-gold text-black hover:brightness-110 disabled:opacity-40"
          >
            <Save size={13} /> Salvar como meta de {nomeDoMes(mes)}
          </button>
        </div>
      </div>
      <div className="text-[11.5px] text-dim2 -mt-2">
        {salva
          ? `Meta de ${nomeDoMes(mes)} salva${salva.atualizado_em ? ` em ${new Date(salva.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''} — os campos abaixo vêm dela.`
          : `Sem meta salva para ${nomeDoMes(mes)}: valores iniciais (ticket, CPA e custos de ${nomeDoMes(mesAntes(mes))}).`}
        {aviso && <span className={`ml-2 font-semibold ${aviso.tipo === 'ok' ? 'text-grn' : 'text-red'}`}>{aviso.texto}</span>}
      </div>

      {/* 1. Frase-resumo */}
      <Resumo res={res} p={premissas} />

      {/* 2. Premissas */}
      <FormPremissas p={premissas} res={res} refAnterior={refAnterior} set={set} />
      <FormFaixas faixas={faixas} setFaixas={setFaixas} />

      {/* 3. Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-[14px]">
        <KpiCard
          Icon={TrendingUp}
          color={res && res.LF < 0 ? COR.vermelho : COR.verde}
          label="Lucro projetado"
          value={r0(res?.LF)}
          sub={`desejado ${r0(premissas.lucro_desejado)} · mês anterior ${r0(refAnterior.lucro_real)}`}
        />
        <KpiCard Icon={Target} color={COR.ouro} valueColor={COR.texto} label="Faturamento agendado" value={r0(res?.M)} sub={`${n1(res?.N)} agendamentos`} />
        <KpiCard Icon={Wallet} color={COR.ouro} valueColor={COR.texto} label="Recebido" value={r0(res?.R)} sub={`taxa ${pct(premissas.taxa_recebimento)}`} />
        <KpiCard
          Icon={Megaphone}
          color={COR.vermelho}
          label="Anúncios"
          value={r0(res?.A)}
          sub={`${pct(res && res.R ? res.A / res.R : null)} do recebido`}
        />
        <KpiCard
          Icon={Gift}
          color={COR.ouro}
          valueColor={COR.texto}
          label="Bônus"
          value={r0(res?.B)}
          sub={
            res ? (
              <span
                className={`inline-block text-[9.5px] uppercase tracking-wide font-bold rounded-full px-[7px] py-[1px] border ${
                  res.status === 'liberado' ? 'text-grn border-grn/40 bg-grn/10' : 'text-red border-red/40 bg-red/10'
                }`}
              >
                {res.status === 'liberado' ? 'liberado' : 'bloqueado'}
              </span>
            ) : (
              '—'
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* 4. Do agendado ao lucro */}
        <Cascata res={res} />
        {/* 5. O que destrava o lucro */}
        <Destrava res={res} p={premissas} curva={curva} />
      </div>

      {/* 6. Bônus do cenário */}
      <TabelaBonus res={res} p={premissas} faixas={faixas} />

      {/* 7. Comparativo */}
      <Comparativo hoje={hoje} meta={metaDoMesAtual} />
    </div>
  );
}

// ── 1. Resumo ───────────────────────────────────────────────

function Resumo({ res, p }: { res: Resultado | null; p: Premissas }) {
  if (!res) {
    return (
      <div className="rounded-card border border-line2 bg-card px-5 py-4 text-[13px] text-dim">
        Preencha o ticket e o CPA (e a meta ou a verba) para simular o mês.
      </div>
    );
  }
  const estilo =
    res.status === 'liberado'
      ? 'border-grn/35 bg-grn/[0.07] text-grn'
      : res.status === 'abaixo'
        ? 'border-yel/35 bg-yel/[0.07] text-yel'
        : 'border-red/35 bg-red/[0.07] text-red';
  const titulo = res.status === 'liberado' ? 'Bônus liberado' : res.status === 'abaixo' ? 'Mês positivo, mas abaixo do desejado: segure os bônus' : 'Prejuízo';
  return (
    <div className={`rounded-card border px-5 py-4 ${estilo}`}>
      <div className="text-[15px] lg:text-[17px] font-extrabold">{titulo}</div>
      <div className="text-[13px] text-tx2 mt-1 leading-relaxed">
        {res.status === 'liberado' &&
          `Com ${r0(res.M)} agendados e ${pct(p.taxa_recebimento)} de recebimento, o mês fecha com lucro projetado de ${r0(res.LF)} — acima do desejado de ${r0(p.lucro_desejado)} —, já pagando ${r0(res.B)} de bônus.`}
        {res.status === 'abaixo' &&
          `Lucro projetado de ${r0(res.LF)} contra ${r0(p.lucro_desejado)} desejados, já com ${r0(res.B)} de bônus. Para liberar, a taxa de recebimento precisaria ser ${taxaTxt(res.taxa_necessaria)} ou o CPA no máximo ${cpaTxt(res.cpa_max)}.`}
        {res.status === 'prejuizo' &&
          `O mês fecha com ${r0(res.LF)}. Para chegar ao lucro desejado de ${r0(p.lucro_desejado)}, a taxa de recebimento precisaria ser ${taxaTxt(res.taxa_necessaria)} (hoje ${pct(p.taxa_recebimento)}) ou o CPA no máximo ${cpaTxt(res.cpa_max)} (hoje ${r2(p.cpa)}).`}
      </div>
    </div>
  );
}

// ── 2. Premissas ────────────────────────────────────────────

function Campo({ rotulo, nota, extra, children }: { rotulo: string; nota?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-2 text-[11px] text-dim">
        {rotulo}
        {extra}
      </span>
      {children}
      {nota && <span className="text-[10px] text-dim2">{nota}</span>}
    </label>
  );
}

const CAMPO = 'w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx mono text-[15px] outline-none focus:border-gold';

function Reais({ valor, onChange, compacto, rotulo }: { valor: number; onChange: (v: number) => void; compacto?: boolean; rotulo?: string }) {
  return <MoneyInput cents={Math.round((Number(valor) || 0) * 100)} onChange={(c) => onChange(c / 100)} compacto={compacto} ariaLabel={rotulo} />;
}

/** Percentual digitado em "%" (11,43) e guardado em fração (0,1143). */
function Pct({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const fmt = (v: number) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const [txt, setTxt] = useState(fmt(valor));
  const [foco, setFoco] = useState(false);
  useEffect(() => {
    if (!foco) setTxt(fmt(valor));
  }, [valor, foco]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        value={txt}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = Number(e.target.value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
          if (Number.isFinite(n)) onChange(n / 100);
        }}
        className={`${CAMPO} pr-8`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dim2 text-[13px]">%</span>
    </div>
  );
}

function Inteiro({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <input
      inputMode="numeric"
      value={String(valor)}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
      className={CAMPO}
    />
  );
}

function Escolha<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { id: T; rotulo: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 px-2.5 py-[9px] rounded-[10px] text-[12px] font-semibold border transition-colors ${
            valor === o.id ? 'bg-chip text-tx border-gold/50' : 'text-dim border-line2 hover:text-tx'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

const Calculado = () => (
  <span className="text-[9px] uppercase tracking-wide font-bold text-gold2 border border-gold/40 bg-gold/10 rounded-full px-[6px] py-[0.5px]">
    calculado
  </span>
);

function FormPremissas({
  p,
  res,
  refAnterior,
  set,
}: {
  p: Premissas;
  res: Resultado | null;
  refAnterior: ReturnType<typeof referenciasDe>;
  set: (patch: Partial<Premissas>) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
      <Panel title="Meta, verba e funil">
        <div className="p-[18px] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Meta de agendado" extra={p.modo === 'verba' ? <Calculado /> : undefined}>
            <Reais valor={p.modo === 'meta' ? p.meta_agendado : (res?.M ?? 0)} onChange={(v) => set({ modo: 'meta', meta_agendado: v })} />
          </Campo>
          <Campo rotulo="Verba de anúncios" extra={p.modo === 'meta' ? <Calculado /> : undefined}>
            <Reais valor={p.modo === 'verba' ? p.verba_anuncios : (res?.A ?? 0)} onChange={(v) => set({ modo: 'verba', verba_anuncios: v })} />
          </Campo>
          <Campo rotulo="Taxa de recebimento" nota={`real do mês anterior: ${pct(refAnterior.taxa_recebimento_real)}`}>
            <Pct valor={p.taxa_recebimento} onChange={(v) => set({ taxa_recebimento: v })} />
          </Campo>
          <Campo rotulo="Ticket médio" nota={`mês anterior: ${r2(refAnterior.ticket)}`}>
            <Reais valor={p.ticket} onChange={(v) => set({ ticket: v })} />
          </Campo>
          <Campo rotulo="CPA por agendamento" nota={`mês anterior: ${r2(refAnterior.cpa)}`}>
            <Reais valor={p.cpa} onChange={(v) => set({ cpa: v })} />
          </Campo>
        </div>
      </Panel>

      <Panel title="Custos">
        <div className="p-[18px] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Produto, frete, taxas e comissões" nota={`% do recebido · mês anterior ${pct(refAnterior.outros_pct)}`}>
            <Pct valor={p.outros_pct} onChange={(v) => set({ outros_pct: v })} />
          </Campo>
          <Campo rotulo="Imposto" nota="% do recebido">
            <Pct valor={p.imposto_pct} onChange={(v) => set({ imposto_pct: v })} />
          </Campo>
          <Campo rotulo="Frustração" nota={`% dos agendados · real do mês anterior: ${pct(refAnterior.taxa_frustracao_real)}`}>
            <Pct valor={p.frustracao_pct} onChange={(v) => set({ frustracao_pct: v })} />
          </Campo>
          <Campo rotulo="Custo por pedido frustrado" nota="frete de ida e volta e perdas">
            <Reais valor={p.custo_frustrado} onChange={(v) => set({ custo_frustrado: v })} />
          </Campo>
          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-[11px] text-dim">Custos fixos do mês</span>
            {p.fixos.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={f.nome}
                  onChange={(e) => set({ fixos: p.fixos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  aria-label="Nome do custo fixo"
                  className={`${CAMPO} font-sans text-[13.5px] flex-1 min-w-0`}
                />
                <div className="w-[140px] shrink-0">
                  <Reais valor={f.valor} onChange={(v) => set({ fixos: p.fixos.map((x, j) => (j === i ? { ...x, valor: v } : x)) })} />
                </div>
                <button
                  type="button"
                  onClick={() => set({ fixos: p.fixos.filter((_, j) => j !== i) })}
                  title="Remover"
                  className="grid place-items-center w-9 h-9 shrink-0 rounded-lg text-red/70 hover:text-red hover:bg-red/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ fixos: [...p.fixos, { nome: 'Novo custo', valor: 0 }] })}
              className="self-start inline-flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[12px] font-semibold text-gold2 border border-gold/40 hover:bg-gold/10"
            >
              <Plus size={13} /> Adicionar custo fixo
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Lucro e equipe">
        <div className="p-[18px] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Lucro desejado">
            <Reais valor={p.lucro_desejado} onChange={(v) => set({ lucro_desejado: v })} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Vendedores">
              <Inteiro valor={p.vendedores} onChange={(v) => set({ vendedores: v })} />
            </Campo>
            <Campo rotulo="Cobradores">
              <Inteiro valor={p.cobradores} onChange={(v) => set({ cobradores: v })} />
            </Campo>
          </div>
          <Campo rotulo="Bônus do vendedor sobre">
            <Escolha
              valor={p.base_vendedor}
              opcoes={[
                { id: 'agendado', rotulo: 'Agendado' },
                { id: 'recebido', rotulo: 'Recebido' },
              ]}
              onChange={(v) => set({ base_vendedor: v })}
            />
          </Campo>
          <Campo rotulo="Bônus da meta empresarial">
            <Escolha
              valor={p.modo_bonus_empresa}
              opcoes={[
                { id: 'pessoa', rotulo: 'Por pessoa' },
                { id: 'time', rotulo: 'Para o time' },
              ]}
              onChange={(v) => set({ modo_bonus_empresa: v })}
            />
          </Campo>
        </div>
      </Panel>
    </div>
  );
}

function FormFaixas({ faixas, setFaixas }: { faixas: Faixas; setFaixas: (f: Faixas) => void }) {
  const equipes: { id: keyof Faixas; titulo: string; base: string }[] = [
    { id: 'vendedor', titulo: 'Vendedor', base: 'faturamento individual' },
    { id: 'cobranca', titulo: 'Cobrança', base: 'recebido individual' },
    { id: 'empresa', titulo: 'Meta empresarial', base: 'faturamento total' },
  ];
  const mudar = (id: keyof Faixas, lista: Faixa[]) => setFaixas({ ...faixas, [id]: lista });
  return (
    <Panel title="Faixas de bônus" hint="a maior faixa atingida vale">
      <div className="p-[18px] grid grid-cols-1 lg:grid-cols-3 gap-4">
        {equipes.map((e) => (
          <div key={e.id} className="min-w-0">
            <div className="text-[13px] text-tx font-semibold">{e.titulo}</div>
            <div className="text-[10.5px] text-dim2 mb-2">sobre o {e.base}</div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_100px_32px] gap-2 text-[10px] uppercase tracking-wide text-dim2">
                <span>A partir de</span>
                <span>Bônus</span>
              </div>
              {faixas[e.id].map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_32px] items-center gap-2">
                  <Reais
                    compacto
                    rotulo={`${e.titulo}: a partir de`}
                    valor={f.a_partir}
                    onChange={(v) => mudar(e.id, faixas[e.id].map((x, j) => (j === i ? { ...x, a_partir: v } : x)))}
                  />
                  <Reais
                    compacto
                    rotulo={`${e.titulo}: bônus`}
                    valor={f.bonus}
                    onChange={(v) => mudar(e.id, faixas[e.id].map((x, j) => (j === i ? { ...x, bonus: v } : x)))}
                  />
                  <button
                    type="button"
                    onClick={() => mudar(e.id, faixas[e.id].filter((_, j) => j !== i))}
                    title="Remover faixa"
                    className="grid place-items-center w-8 h-8 shrink-0 rounded-lg text-red/70 hover:text-red hover:bg-red/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => mudar(e.id, [...faixas[e.id], { a_partir: 0, bonus: 0 }])}
                className="self-start inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[11.5px] font-semibold text-gold2 border border-gold/40 hover:bg-gold/10"
              >
                <Plus size={12} /> Faixa
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── 4. Do agendado ao lucro ─────────────────────────────────

function Cascata({ res }: { res: Resultado | null }) {
  if (!res) return <Panel title="Do agendado ao lucro"><div className="px-[18px] py-10 text-center text-dim2">—</div></Panel>;
  const linhas: { rotulo: string; valor: number; sinal: '' | '−' | '='; cor: string }[] = [
    { rotulo: 'Agendado', valor: res.M, sinal: '', cor: 'bg-gold' },
    { rotulo: 'Recebido', valor: res.R, sinal: '', cor: 'bg-gold2' },
    { rotulo: 'Anúncios', valor: -res.A, sinal: '−', cor: 'bg-red' },
    { rotulo: 'Produto, frete, taxas e comissões', valor: -res.O, sinal: '−', cor: 'bg-red' },
    { rotulo: 'Imposto', valor: -res.I, sinal: '−', cor: 'bg-red' },
    { rotulo: `Frustração (${n1(res.NF)} pedidos)`, valor: -res.FR, sinal: '−', cor: 'bg-red' },
    { rotulo: 'Custos fixos', valor: -res.FX, sinal: '−', cor: 'bg-red' },
    { rotulo: 'Lucro antes dos bônus', valor: res.LB, sinal: '=', cor: res.LB >= 0 ? 'bg-grn' : 'bg-red' },
    { rotulo: 'Bônus', valor: -res.B, sinal: '−', cor: 'bg-red' },
    { rotulo: 'Lucro projetado', valor: res.LF, sinal: '=', cor: res.LF >= 0 ? 'bg-grn' : 'bg-red' },
  ];
  const base = Math.max(res.M, 1);
  return (
    <Panel title="Do agendado ao lucro">
      <div className="divide-y divide-line">
        {linhas.map((l) => (
          <div key={l.rotulo} className={`px-[18px] py-2.5 ${l.sinal === '=' ? 'bg-card2' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-[12.5px] ${l.sinal === '=' ? 'text-tx font-semibold' : 'text-tx2'}`}>
                <span className="mono text-dim2 inline-block w-3">{l.sinal}</span> {l.rotulo}
              </span>
              <span className={`mono text-[13px] font-bold shrink-0 ${l.sinal === '' ? 'text-tx' : corSinal(l.valor)}`}>{r0(Math.abs(l.valor) < 0.5 ? 0 : l.valor)}</span>
            </div>
            <div className="h-[6px] rounded-full bg-trilha mt-1.5 overflow-hidden">
              <div className={`h-full rounded-full ${l.cor}`} style={{ width: `${Math.min(100, (Math.abs(l.valor) / base) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── 5. O que destrava o lucro ───────────────────────────────

function Destrava({ res, p, curva }: { res: Resultado | null; p: Premissas; curva: { taxa: number; lucro: number }[] }) {
  return (
    <Panel title="O que destrava o lucro" hint="cada alavanca sozinha, com o bônus fixo">
      {!res ? (
        <div className="px-[18px] py-10 text-center text-dim2">—</div>
      ) : (
        <div className="p-[18px] flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-[12px] border border-line bg-card2 px-3 py-2.5">
              <div className="text-[10.5px] text-dim">Taxa de recebimento necessária</div>
              <div className={`mono text-[19px] font-extrabold ${ok(res.taxa_necessaria) && res.taxa_necessaria <= p.taxa_recebimento ? 'text-grn' : 'text-red'}`}>
                {taxaTxt(res.taxa_necessaria)}
              </div>
              <div className="text-[10px] text-dim2">atual {pct(p.taxa_recebimento)}</div>
            </div>
            <div className="rounded-[12px] border border-line bg-card2 px-3 py-2.5">
              <div className="text-[10.5px] text-dim">CPA máximo</div>
              <div className={`mono text-[19px] font-extrabold ${ok(res.cpa_max) && res.cpa_max > 0 && p.cpa <= res.cpa_max ? 'text-grn' : 'text-red'}`}>
                {cpaTxt(res.cpa_max)}
              </div>
              <div className="text-[10px] text-dim2">atual {r2(p.cpa)}</div>
            </div>
          </div>
          <div className="text-[12px] text-dim leading-relaxed">
            {!ok(res.sobra_pct) ? (
              '—'
            ) : res.sobra_pct >= 0 ? (
              <>
                De cada R$ 1 agendado sobram <b className="text-grn">{pct(res.sobra_pct)}</b> antes dos custos fixos — crescer o volume
                ajuda a pagar os fixos.
              </>
            ) : (
              <>
                De cada R$ 1 agendado sobram <b className="text-red">{pct(res.sobra_pct)}</b> antes dos custos fixos:{' '}
                <b className="text-red">crescer o volume assim aumenta o prejuízo</b>.
              </>
            )}
          </div>
          <CurvaLucro pontos={curva} desejado={p.lucro_desejado} taxaAtual={p.taxa_recebimento} lucroAtual={res.LF} />
        </div>
      )}
    </Panel>
  );
}

// ── 6. Bônus do cenário ─────────────────────────────────────

function TabelaBonus({ res, p, faixas }: { res: Resultado | null; p: Premissas; faixas: Faixas }) {
  if (!res) return null;
  const faixaTxt = (lista: Faixa[], v: number | null) => {
    const f = faixaAtingida(lista, v);
    return f ? `a partir de ${r0(f.a_partir)}` : 'nenhuma';
  };
  const V = Math.max(0, Math.floor(p.vendedores));
  const C = Math.max(0, Math.floor(p.cobradores));
  const linhas = [
    { equipe: 'Vendedores', pessoas: String(V), por: r0(res.indV), faixa: faixaTxt(faixas.vendedor, res.indV), unit: res.faixaV, total: res.bV },
    { equipe: 'Cobrança', pessoas: String(C), por: r0(res.indC), faixa: faixaTxt(faixas.cobranca, res.indC), unit: res.faixaC, total: res.bC },
    {
      equipe: 'Meta empresarial',
      pessoas: p.modo_bonus_empresa === 'pessoa' ? String(V + C) : '1 (time)',
      por: `${r0(res.M)} (total)`,
      faixa: faixaTxt(faixas.empresa, res.M),
      unit: res.faixaE,
      total: res.bE,
    },
  ];
  return (
    <Panel
      title="Bônus do cenário"
      hint={res.status === 'liberado' ? 'cabe no lucro — liberado' : 'não cabe no lucro desejado — bloqueado'}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12.5px]">
          <thead>
            <tr className="text-dim2 text-[10px] uppercase tracking-[0.1em]">
              <th className="text-left font-bold px-[18px] py-2.5">Equipe</th>
              <th className="text-right font-bold px-3 py-2.5">Pessoas</th>
              <th className="text-right font-bold px-3 py-2.5">Resultado por pessoa</th>
              <th className="text-left font-bold px-3 py-2.5">Faixa</th>
              <th className="text-right font-bold px-3 py-2.5">Bônus unitário</th>
              <th className="text-right font-bold px-[18px] py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.equipe} className="border-t border-line/70">
                <td className="px-[18px] py-2.5 text-tx">{l.equipe}</td>
                <td className="px-3 py-2.5 text-right mono text-tx2">{l.pessoas}</td>
                <td className="px-3 py-2.5 text-right mono text-tx2">{l.por}</td>
                <td className="px-3 py-2.5 text-dim">{l.faixa}</td>
                <td className="px-3 py-2.5 text-right mono text-tx2">{r0(l.unit)}</td>
                <td className="px-[18px] py-2.5 text-right mono font-bold text-tx">{r0(l.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-line bg-card2">
              <td className="px-[18px] py-2.5 text-tx font-semibold" colSpan={5}>
                Total de bônus
              </td>
              <td className="px-[18px] py-2.5 text-right mono font-extrabold text-tx">{r0(res.B)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 7. Comparativo ──────────────────────────────────────────

function Comparativo({ hoje, meta }: { hoje: string; meta: MetaMensal | null }) {
  const { dailies, custos, pedidos } = useData();
  const mesAtual = hoje.slice(0, 7);
  const anterior = useMemo(() => realizado(dailies, custos, pedidos, periodoDoMesInteiro(mesAntes(mesAtual))), [dailies, custos, pedidos, mesAtual]);
  const atual = useMemo(() => realizado(dailies, custos, pedidos, { inicio: `${mesAtual}-01`, fim: hoje }), [dailies, custos, pedidos, mesAtual, hoje]);
  const tA = taxasDe(anterior);
  const tB = taxasDe(atual);
  const ritmo = (v: number) => projetarPeloRitmo(v, hoje);
  const m = meta?.resultado;
  const mp = meta?.premissas;

  type Tipo = 'r0' | 'r2' | 'pct';
  const linhas: { nome: string; tipo: Tipo; ant: number | null; atual: number | null; proj: number | null; meta: number | null; sobeEhBom: boolean }[] = [
    { nome: 'Faturamento agendado', tipo: 'r0', ant: anterior.agendado, atual: atual.agendado, proj: ritmo(atual.agendado), meta: m?.M ?? null, sobeEhBom: true },
    { nome: 'Pagamentos aprovados', tipo: 'r0', ant: anterior.aprovado, atual: atual.aprovado, proj: ritmo(atual.aprovado), meta: m?.R ?? null, sobeEhBom: true },
    { nome: 'Taxa de recebimento', tipo: 'pct', ant: tA.taxa_recebimento, atual: tB.taxa_recebimento, proj: tB.taxa_recebimento, meta: mp?.taxa_recebimento ?? null, sobeEhBom: true },
    { nome: 'Gastos em anúncios', tipo: 'r0', ant: anterior.anuncios, atual: atual.anuncios, proj: ritmo(atual.anuncios), meta: m?.A ?? null, sobeEhBom: true },
    {
      nome: 'Anúncios ÷ recebido',
      tipo: 'pct',
      ant: tA.anuncios_sobre_recebido,
      atual: tB.anuncios_sobre_recebido,
      proj: tB.anuncios_sobre_recebido,
      meta: m && m.R ? m.A / m.R : null,
      sobeEhBom: false,
    },
    { nome: 'Taxa de frustração', tipo: 'pct', ant: tA.taxa_frustracao, atual: tB.taxa_frustracao, proj: tB.taxa_frustracao, meta: mp?.frustracao_pct ?? null, sobeEhBom: false },
    { nome: 'CPA por agendamento', tipo: 'r2', ant: tA.cpa, atual: tB.cpa, proj: tB.cpa, meta: mp?.cpa ?? null, sobeEhBom: false },
    { nome: 'Lucro real', tipo: 'r0', ant: anterior.lucro_real, atual: atual.lucro_real, proj: ritmo(atual.lucro_real), meta: m?.LF ?? null, sobeEhBom: true },
  ];
  const fmt = (t: Tipo, v: number | null) => (t === 'pct' ? pct(v) : t === 'r2' ? r2(v) : r0(v));

  return (
    <Panel title="Comparativo" hint={`${nomeDoMes(mesAntes(mesAtual))} × ${nomeDoMes(mesAtual)} até ${hoje.slice(8)}/${hoje.slice(5, 7)}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px]">
          <thead>
            <tr className="text-dim2 text-[10px] uppercase tracking-[0.1em]">
              <th className="text-left font-bold px-[18px] py-2.5">Métrica</th>
              <th className="text-right font-bold px-3 py-2.5">Mês anterior</th>
              <th className="text-right font-bold px-3 py-2.5">Mês atual (até hoje)</th>
              <th className="text-right font-bold px-3 py-2.5">Projeção pelo ritmo</th>
              <th className="text-right font-bold px-3 py-2.5">Meta salva</th>
              <th className="text-right font-bold px-[18px] py-2.5">% da meta</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              // Variação menor que 0,05% não diz nada: some.
              const v = ok(l.proj) && ok(l.ant) && l.ant !== 0 ? (l.proj - l.ant) / Math.abs(l.ant) : null;
              const variacao = v != null && Math.abs(v) >= 0.0005 ? v : null;
              const melhorou = variacao == null ? null : (variacao > 0) === l.sobeEhBom;
              // Sobre meta zero ou negativa (ex.: lucro), a porcentagem engana: "—".
              const daMeta = ok(l.proj) && ok(l.meta) && l.meta > 0 ? l.proj / l.meta : null;
              return (
                <tr key={l.nome} className="border-t border-line/70">
                  <td className="px-[18px] py-2.5 text-tx">{l.nome}</td>
                  <td className="px-3 py-2.5 text-right mono text-dim">{fmt(l.tipo, l.ant)}</td>
                  <td className="px-3 py-2.5 text-right mono text-tx2">{fmt(l.tipo, l.atual)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="mono font-bold text-tx">{fmt(l.tipo, l.proj)}</div>
                    {variacao != null && (
                      <div className={`text-[10px] mono ${melhorou == null ? 'text-dim2' : melhorou ? 'text-grn' : 'text-red'}`}>
                        {variacao > 0 ? '↑' : '↓'} {pct(Math.abs(variacao))} vs anterior
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-dim">{fmt(l.tipo, l.meta)}</td>
                  <td className="px-[18px] py-2.5 text-right mono text-tx2">{pct(daMeta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-[18px] py-3 border-t border-line text-[10.5px] text-dim2 leading-relaxed">
        Projeção pelo ritmo = realizado até hoje ÷ dias decorridos × dias do mês (só para valores em R$; as taxas ficam
        iguais). A variação compara a projeção com o mês anterior: verde quando melhora — em anúncios ÷ recebido, frustração e
        CPA, melhorar é cair. % da meta = projeção ÷ meta salva de {nomeDoMes(mesAtual)}
        {meta ? '' : ' (ainda não há meta salva para este mês)'}. Mesmos números dos cards: Faturamento Agendado, Pagamentos
        aprovados, Gastos em anúncios e o Lucro Real da Demonstração (com custos variáveis).
      </div>
    </Panel>
  );
}

