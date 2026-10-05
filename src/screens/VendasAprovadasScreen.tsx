// ─────────────────────────────────────────────────────────────
// Vendas Aprovadas: tudo que foi pago no período, dia a dia — valor pago,
// dia do pagamento, forma de pagamento e atendente. Mesma regra da
// Receita Aprovada da Demonstração de Resultados: os totais batem.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { CheckCircle2, Receipt, Wallet } from 'lucide-react';
import type { Periodo } from '@/types';
import { useData } from '@/store/DataProvider';
import { KpiCard, Panel } from '@/components/ui';
import { COR } from '@/lib/cores';
import { formatBRL, reaisToCents } from '@/lib/money';
import { dataAprovacaoPedido, rotuloMetodo, vendasAprovadasPorDia } from '@/lib/pedidos';

const brl = (n: number) => formatBRL(reaisToCents(n));
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const atendenteDe = (v: string | null | undefined) => v?.trim() || 'Sem atendente';

/** '2026-10-03' → 'Sexta-feira, 03/10'. */
function diaDaSemana(iso: string): string {
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}, ${diaMes(iso)}`;
}

/** Totais por chave (atendente ou forma), do maior para o menor. */
function somarPor<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number) {
  const m = new Map<string, { nome: string; qtd: number; total: number }>();
  for (const i of itens) {
    const k = chave(i);
    const a = m.get(k) ?? { nome: k, qtd: 0, total: 0 };
    a.qtd += 1;
    a.total += valor(i);
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function VendasAprovadasScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos } = useData();
  const [atendente, setAtendente] = useState<string | null>(null);
  const [forma, setForma] = useState<string | null>(null);

  const dias = useMemo(() => vendasAprovadasPorDia(pedidos, periodo), [pedidos, periodo]);
  const todos = useMemo(() => dias.flatMap((d) => d.pedidos), [dias]);
  const porAtendente = useMemo(() => somarPor(todos, (p) => atendenteDe(p.vendedor), (p) => Number(p.valor) || 0), [todos]);
  const porForma = useMemo(() => somarPor(todos, (p) => rotuloMetodo(p.metodo_pagamento), (p) => Number(p.valor) || 0), [todos]);

  // Filtro que sumiu do período (ex.: atendente sem venda hoje) não prende a lista vazia.
  const atendenteAtivo = atendente && porAtendente.some((a) => a.nome === atendente) ? atendente : null;
  const formaAtiva = forma && porForma.some((f) => f.nome === forma) ? forma : null;
  const filtrados = useMemo(
    () =>
      dias
        .map((d) => {
          const lista = d.pedidos.filter(
            (p) =>
              (!atendenteAtivo || atendenteDe(p.vendedor) === atendenteAtivo) &&
              (!formaAtiva || rotuloMetodo(p.metodo_pagamento) === formaAtiva),
          );
          return { ...d, pedidos: lista, total: lista.reduce((s, p) => s + (Number(p.valor) || 0), 0) };
        })
        .filter((d) => d.pedidos.length > 0),
    [dias, atendenteAtivo, formaAtiva],
  );
  const total = filtrados.reduce((s, d) => s + d.total, 0);
  const qtd = filtrados.reduce((s, d) => s + d.pedidos.length, 0);

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Vendas Aprovadas</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Tudo que foi pago no período, dia a dia: valor pago, dia do pagamento, forma de pagamento e atendente
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 lg:gap-3.5">
        <div className="col-span-2 sm:col-span-1 grid">
          <KpiCard Icon={Wallet} color={COR.ouro} valueColor={COR.texto} label="Total recebido" value={brl(total)} sub={`${qtd} ${qtd === 1 ? 'venda paga' : 'vendas pagas'}`} />
        </div>
        <KpiCard
          Icon={CheckCircle2}
          color={COR.verde}
          label="Vendas pagas"
          value={String(qtd)}
          sub={`em ${filtrados.length} ${filtrados.length === 1 ? 'dia' : 'dias'}`}
        />
        <KpiCard Icon={Receipt} color={COR.ouro} valueColor={COR.texto} label="Ticket médio" value={qtd ? brl(total / qtd) : '—'} sub="por venda paga" />
      </div>

      {todos.length > 0 && (
        <div className="flex flex-col gap-2">
          <Filtro titulo="Atendente" itens={porAtendente} ativo={atendenteAtivo} onEscolher={setAtendente} todos="Todos" />
          <Filtro titulo="Forma" itens={porForma} ativo={formaAtiva} onEscolher={setForma} todos="Todas" />
        </div>
      )}

      {filtrados.length === 0 ? (
        <Panel>
          <div className="px-5 py-12 text-center text-[13px] text-dim2">Nenhuma venda paga neste período.</div>
        </Panel>
      ) : (
        filtrados.map((d) => (
          <Panel key={d.data} title={diaDaSemana(d.data)} hint={`${d.pedidos.length} ${d.pedidos.length === 1 ? 'venda' : 'vendas'} · ${brl(d.total)}`}>
            <div className="overflow-x-auto">
              {/* Largura fixa: as colunas ficam alinhadas de um dia para o outro. */}
              <table className="w-full table-fixed text-[13px] min-w-[335px]">
                <thead>
                  <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                    <th className="text-left font-semibold px-3 lg:px-5 py-2.5">Cliente</th>
                    <th className="w-[96px] sm:w-[19%] text-left font-semibold px-2 lg:px-3 py-2.5">Atendente</th>
                    <th className="hidden sm:table-cell sm:w-[14%] text-left font-semibold px-3 py-2.5">Forma</th>
                    <th className="hidden sm:table-cell sm:w-[12%] text-left font-semibold px-3 py-2.5">Pago em</th>
                    <th className="w-[112px] sm:w-[19%] text-right font-semibold px-3 lg:px-5 py-2.5">Valor pago</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pedidos.map((p) => {
                    const valor = Number(p.valor) || 0;
                    const agendado = Number(p.valor_agendado ?? p.valor) || 0;
                    return (
                      <tr key={p.id} className="border-t border-line/70 hover:bg-white/[0.015]">
                        <td className="px-3 lg:px-5 py-3">
                          <div className={`truncate ${p.cliente ? 'text-tx font-medium' : 'text-dim2 italic'}`}>
                            {p.cliente || 'Cliente sem nome'}
                          </div>
                          <div className="text-[10px] mono mt-[2px]">
                            {p.internal_id != null && <span className="text-dim font-bold">#{p.internal_id}</span>}
                            {/* No celular a forma vai aqui embaixo (a coluna some). */}
                            <span className="sm:hidden text-dim2"> · {rotuloMetodo(p.metodo_pagamento)}</span>
                          </div>
                        </td>
                        <td className="px-2 lg:px-3 py-3 text-dim truncate">{atendenteDe(p.vendedor)}</td>
                        <td className="hidden sm:table-cell px-3 py-3 text-dim whitespace-nowrap">{rotuloMetodo(p.metodo_pagamento)}</td>
                        <td className="hidden sm:table-cell px-3 py-3 text-dim mono whitespace-nowrap">{diaMes(dataAprovacaoPedido(p))}</td>
                        <td className="px-3 lg:px-5 py-3 text-right whitespace-nowrap">
                          <div className="mono font-bold text-grn">{brl(valor)}</div>
                          {/* Pagou diferente do agendado (desconto, acerto da planilha). */}
                          {Math.abs(agendado - valor) >= 0.01 && <div className="text-[10px] text-dim2 mono">agendado {brl(agendado)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}

      <p className="text-[11.5px] text-dim2 leading-relaxed px-1">
        Conta pela data do pagamento — a mesma regra da Receita Aprovada da Demonstração de Resultados, então os totais batem.
        O valor pago já vem com as correções da planilha de pagamentos. Venda excluída da plataforma não entra.
      </p>
    </div>
  );
}

/** Linha de botões que filtra a lista e mostra o total de cada um. */
function Filtro({
  titulo,
  itens,
  ativo,
  onEscolher,
  todos,
}: {
  titulo: string;
  itens: { nome: string; qtd: number; total: number }[];
  ativo: string | null;
  onEscolher: (v: string | null) => void;
  todos: string;
}) {
  const classe = (sel: boolean) =>
    `shrink-0 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold border transition-colors ${
      sel ? 'bg-chip text-tx border-gold/50' : 'text-dim border-line2 hover:text-tx'
    }`;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-[68px] shrink-0 text-[11px] uppercase tracking-wide font-semibold text-dim2">{titulo}</span>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0">
        <button onClick={() => onEscolher(null)} className={classe(ativo == null)}>
          {todos}
        </button>
        {itens.map((i) => (
          <button key={i.nome} onClick={() => onEscolher(ativo === i.nome ? null : i.nome)} className={classe(ativo === i.nome)}>
            {i.nome} <span className="text-dim2 font-normal">· {i.qtd} · {brl(i.total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
