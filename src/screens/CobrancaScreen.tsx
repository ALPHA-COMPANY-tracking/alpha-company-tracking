// ─────────────────────────────────────────────────────────────
// Fila de Cobrança: quem recebeu e ainda não pagou, do mais antigo para o
// mais novo, com o total a receber por faixa de dias desde a entrega.
// Situação de agora: o seletor de período não muda esta tela.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { formatBRL, formatPercent, reaisToCents } from '@/lib/money';
import { formatDiaMes, hojeIso } from '@/lib/dates';
import { rotuloMetodo } from '@/lib/pedidos';
import { FRUSTRACAO_PREVISTA } from '@/lib/previsao';
import { FAIXAS, type Faixa, type ItemCobranca, filaDeCobranca } from '@/lib/cobranca';

const brl = (n: number) => formatBRL(reaisToCents(n));

/** Cor de cada faixa: quanto mais velho, mais perto da perda. */
const COR_FAIXA: Record<Faixa, { texto: string; borda: string; fundo: string }> = {
  '0-3': { texto: 'text-tx', borda: 'border-line2', fundo: 'bg-card' },
  '4-7': { texto: 'text-yel', borda: 'border-yel/30', fundo: 'bg-yel/[0.04]' },
  '8-15': { texto: 'text-yel', borda: 'border-yel/50', fundo: 'bg-yel/[0.08]' },
  '16+': { texto: 'text-red', borda: 'border-red/45', fundo: 'bg-red/[0.07]' },
};

/** "cobrados" → "Cobrado"; "entregue" → "Entregue". */
function etapa(status: string | null): string {
  const s = (status ?? '').replace(/_/g, ' ').trim().toLowerCase();
  if (/cobrad/.test(s)) return 'Cobrado';
  if (/entregue/.test(s)) return 'Entregue';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

const vendedorDe = (v: string | null | undefined) => v?.trim() || 'Sem vendedor';

export function CobrancaScreen() {
  const { pedidos } = useData();
  const hoje = hojeIso();
  const fila = useMemo(() => filaDeCobranca(pedidos, hoje), [pedidos, hoje]);
  const [faixa, setFaixa] = useState<Faixa | null>(null);
  const [vendedor, setVendedor] = useState<string | null>(null);

  const vendedores = useMemo(() => {
    const m = new Map<string, { qtd: number; valor: number }>();
    for (const i of fila.itens) {
      const v = vendedorDe(i.pedido.vendedor);
      const a = m.get(v) ?? { qtd: 0, valor: 0 };
      a.qtd += 1;
      a.valor += i.valor;
      m.set(v, a);
    }
    return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
  }, [fila]);
  const vendedorAtivo = vendedor && vendedores.some(([v]) => v === vendedor) ? vendedor : null;
  const lista = fila.itens.filter(
    (i) => (!faixa || i.faixa === faixa) && (!vendedorAtivo || vendedorDe(i.pedido.vendedor) === vendedorAtivo),
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Fila de Cobrança</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Pedidos entregues que ainda não pagaram, do mais antigo para o mais novo — cada dia sem cobrar aumenta a chance de virar perda
        </p>
      </div>

      {/* Total a receber */}
      <div className="rounded-card border border-gold/30 bg-gradient-to-br from-gold/[0.07] to-transparent px-4 lg:px-6 py-4 lg:py-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HandCoins size={26} className="text-gold shrink-0" />
          <div>
            <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-gold">Total a receber</div>
            <div className="text-[12.5px] text-dim leading-snug">
              {fila.total.qtd} {fila.total.qtd === 1 ? 'pedido entregue' : 'pedidos entregues'} sem pagar · com{' '}
              {formatPercent(FRUSTRACAO_PREVISTA, 0)} de frustração, devem entrar {brl(fila.total.valor * (1 - FRUSTRACAO_PREVISTA))}
            </div>
          </div>
        </div>
        <div className="mono text-[28px] lg:text-[34px] font-extrabold tracking-tight text-tx">{brl(fila.total.valor)}</div>
      </div>

      {/* Faixas: também filtram a lista */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3.5">
        {FAIXAS.map((f) => {
          const c = COR_FAIXA[f.id];
          const t = fila.porFaixa[f.id];
          const ativo = faixa === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFaixa(ativo ? null : f.id)}
              aria-pressed={ativo}
              className={`text-left rounded-kpi border px-3.5 lg:px-4 py-3 transition-colors ${c.fundo} ${
                ativo ? 'border-gold ring-1 ring-gold/40' : c.borda
              } hover:border-gold/60`}
            >
              <div className="text-[11px] text-dim font-medium">{f.rotulo}</div>
              <div className={`mono text-[18px] lg:text-[21px] font-extrabold leading-tight ${t.qtd ? c.texto : 'text-dim2'}`}>{brl(t.valor)}</div>
              <div className="text-[10.5px] text-dim2">
                {t.qtd} {t.qtd === 1 ? 'pedido' : 'pedidos'} · {ativo ? 'filtrando' : 'desde a entrega'}
              </div>
            </button>
          );
        })}
      </div>

      {vendedores.length > 1 && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[72px] shrink-0 text-[11px] uppercase tracking-wide font-semibold text-dim2">Vendedor</span>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0">
            <Chip ativo={!vendedorAtivo} onClick={() => setVendedor(null)}>
              Todos
            </Chip>
            {vendedores.map(([v, a]) => (
              <Chip key={v} ativo={vendedorAtivo === v} onClick={() => setVendedor(vendedorAtivo === v ? null : v)}>
                {v} <span className="text-dim2 font-normal">· {a.qtd} · {brl(a.valor)}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}

      <Panel
        title="Quem cobrar primeiro"
        hint={faixa || vendedorAtivo ? `${lista.length} de ${fila.itens.length} · filtrado` : `${lista.length} ${lista.length === 1 ? 'pedido' : 'pedidos'}`}
      >
        <Tabela itens={lista} vazio={fila.itens.length ? 'Nenhum pedido neste filtro.' : 'Nenhum pedido entregue esperando pagamento. 🎉'} />
        {fila.semDiaDaEntrega > 0 && (
          <div className="px-4 lg:px-5 py-2.5 border-t border-line text-[11px] text-dim2 leading-relaxed">
            * {fila.semDiaDaEntrega} {fila.semDiaDaEntrega === 1 ? 'pedido ainda não tem' : 'pedidos ainda não têm'} o dia da entrega
            registrado: os dias contam do agendamento.
          </div>
        )}
      </Panel>

      {fila.negociacao.length > 0 && (
        <Panel title="Em negociação / jurídico" hint={`${fila.totalNegociacao.qtd} · ${brl(fila.totalNegociacao.valor)}`}>
          <Tabela itens={fila.negociacao} vazio="" />
        </Panel>
      )}

      <p className="text-[11.5px] text-dim2 leading-relaxed px-1">
        Para cobrar, procure o #número no BlueSales — o telefone da cliente não fica guardado aqui. O pedido sai da fila sozinho quando o
        pagamento chega (ou quando vira frustração).
      </p>
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold border transition-colors ${
        ativo ? 'bg-chip text-tx border-gold/50' : 'text-dim border-line2 hover:text-tx'
      }`}
    >
      {children}
    </button>
  );
}

function Tabela({ itens, vazio }: { itens: ItemCobranca[]; vazio: string }) {
  if (itens.length === 0) return <div className="px-5 py-10 text-center text-[13px] text-dim2">{vazio}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-[13px] min-w-[335px]">
        <thead>
          <tr className="text-dim2 text-[11px] uppercase tracking-wide">
            <th className="text-left font-semibold px-3 lg:px-5 py-2.5">Cliente</th>
            <th className="hidden md:table-cell md:w-[16%] text-left font-semibold px-3 py-2.5">Vendedor</th>
            <th className="hidden sm:table-cell sm:w-[14%] text-left font-semibold px-3 py-2.5">Etapa</th>
            <th className="w-[92px] sm:w-[15%] text-left font-semibold px-2 lg:px-3 py-2.5">Há</th>
            <th className="w-[104px] sm:w-[16%] text-right font-semibold px-3 lg:px-5 py-2.5">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => {
            const p = i.pedido;
            const c = COR_FAIXA[i.faixa];
            return (
              <tr key={p.id} className="border-t border-line/70 hover:bg-white/[0.015]">
                <td className="px-3 lg:px-5 py-3">
                  <div className={`truncate ${p.cliente ? 'text-tx font-medium' : 'text-dim2 italic'}`}>{p.cliente || 'Cliente sem nome'}</div>
                  <div className="text-[10px] mono mt-[2px] truncate">
                    {p.internal_id != null && <span className="text-dim font-bold">#{p.internal_id}</span>}
                    <span className="text-dim2">
                      {' '}
                      · agendado {formatDiaMes(p.data)} · {rotuloMetodo(p.metodo_pagamento)}
                      <span className="md:hidden"> · {vendedorDe(p.vendedor)}</span>
                    </span>
                  </div>
                </td>
                <td className="hidden md:table-cell px-3 py-3 text-dim truncate">{vendedorDe(p.vendedor)}</td>
                <td className="hidden sm:table-cell px-3 py-3 text-dim truncate">{etapa(p.status)}</td>
                <td className="px-2 lg:px-3 py-3">
                  <span className={`inline-block mono text-[11.5px] font-bold border rounded-full px-2 py-[2px] whitespace-nowrap ${c.texto} ${c.borda} ${c.fundo}`}>
                    {i.dias} {i.dias === 1 ? 'dia' : 'dias'}
                    {i.desde === 'agendamento' && '*'}
                  </span>
                </td>
                <td className="px-3 lg:px-5 py-3 text-right mono font-bold text-tx whitespace-nowrap">{brl(i.valor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
