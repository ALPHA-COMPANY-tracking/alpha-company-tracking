import { useMemo, useState } from 'react';
import { Check, Pencil, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { Pedido, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { pedidosAtivos, statusBucket } from '@/lib/pedidos';
import { MOTIVOS, motivoFrustracao } from '@/lib/indicadores';
import { custoProdutoDoPlano, FRETE_POR_PEDIDO, perdaRealDePedido } from '@/lib/custosConfig';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';

/** 'YYYY-MM-DD' → 'DD/MM'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Resumo do plano: "6 potes" / "3 potes". */
function planoCurto(plano?: string | null): string {
  // Lê a quantidade do próprio texto: plano novo no BlueSales já aparece
  // certo aqui, sem precisar de mais uma linha de código.
  const m = /(\d+)\s*pote/i.exec(plano ?? '');
  if (!m) return (plano ?? '').trim() || '—';
  return `${m[1]} pote${m[1] === '1' ? '' : 's'}`;
}

export function FrustradosScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, definirPerdaPedido } = useData();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState(0);

  const frustrados = useMemo(
    () =>
      // Vendas tiradas da plataforma (lixeira) não contam aqui também.
      pedidosAtivos(pedidos)
        .filter((p) => statusBucket(p.status) === 'frustrado' && isDentro(p.data, periodo.inicio, periodo.fim))
        .sort((a, b) => b.data.localeCompare(a.data)),
    [pedidos, periodo],
  );

  const totalPedidos = frustrados.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const totalPerda = frustrados.reduce((s, p) => s + perdaRealDePedido(p), 0);

  // Quantos por motivo — os seis sempre à vista, mesmo zerados.
  const porMotivo = MOTIVOS.map((m) => ({ ...m, qtd: frustrados.filter((p) => motivoFrustracao(p) === m.id).length })).filter(
    (m) => m.id !== 'outros' || m.qtd > 0,
  );
  const rotuloMotivo = Object.fromEntries(MOTIVOS.map((m) => [m.id, m.rotulo]));

  function abrir(p: Pedido) {
    setEditando(p.id);
    setRascunho(reaisToCents(perdaRealDePedido(p)));
  }

  function salvar(id: string) {
    definirPerdaPedido(id, rascunho / 100);
    setEditando(null);
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Frustrados</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Quanto os pedidos não pagos realmente custaram — produto enviado + frete, não o valor da venda
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 lg:gap-[14px]">
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Pedidos frustrados</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-yel">{frustrados.length}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">no período</div>
        </div>
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Valor dos pedidos</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-dim truncate">{formatBRL(reaisToCents(totalPedidos))}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">não entrou</div>
        </div>
        <div className="bg-card border border-red/30 rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Perda real</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-red truncate">{formatBRL(reaisToCents(totalPerda))}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">saiu do caixa</div>
        </div>
      </div>

      {/* Por motivo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {porMotivo.map((m) => (
          <div
            key={m.id}
            className={`rounded-[12px] border px-3 py-2.5 ${m.qtd > 0 ? 'border-red/30 bg-red/[0.05]' : 'border-line bg-card opacity-60'}`}
          >
            <div className="text-[11px] text-dim leading-tight">{m.rotulo}</div>
            <div className={`mono text-[20px] font-extrabold leading-tight mt-0.5 ${m.qtd > 0 ? 'text-red' : 'text-dim2'}`}>{m.qtd}</div>
            <div className="text-[9.5px] text-dim2 leading-snug">{m.nota}</div>
          </div>
        ))}
      </div>

      <Panel title="Pedidos frustrados no período" hint="clique no lápis para ajustar a perda">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead>
              <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Data</th>
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Cliente / pedido</th>
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Motivo</th>
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Plano</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Valor do pedido</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Perda real</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {frustrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-dim2">
                    Nenhum pedido frustrado neste período. 🎉
                  </td>
                </tr>
              ) : (
                frustrados.map((p) => {
                  const perda = perdaRealDePedido(p);
                  const cogs = custoProdutoDoPlano(p.produto_plano);
                  const ajustado = p.perda_real != null;
                  const emEdicao = editando === p.id;
                  return (
                    <tr key={p.id} className="border-t border-line/70 hover:bg-white/[0.015]">
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-tx font-medium whitespace-nowrap">{diaMes(p.data)}</td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4">
                        <div className="text-tx text-[12.5px] truncate max-w-[220px]">{p.cliente ?? '—'}</div>
                        <div className="text-[10px] mono text-dim2">
                          {p.internal_id != null && <b className="text-dim">#{p.internal_id} · </b>}
                          {p.id}
                        </div>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4">
                        <span className="text-[10.5px] border rounded-full px-[8px] py-[2px] whitespace-nowrap text-red border-red/35 bg-red/10">
                          {rotuloMotivo[motivoFrustracao(p)]}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-dim">{planoCurto(p.produto_plano)}</td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right text-dim mono">{formatBRL(reaisToCents(Number(p.valor) || 0))}</td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                        {emEdicao ? (
                          <div className="w-[140px] ml-auto">
                            <MoneyInput cents={rascunho} onChange={setRascunho} autoFocus />
                          </div>
                        ) : (
                          <div>
                            <span className={`mono font-bold ${ajustado ? 'text-yel' : 'text-red'}`}>
                              {formatBRL(reaisToCents(perda))}
                            </span>
                            <div className="text-[10px] text-dim2 mt-[2px]">
                              {ajustado ? 'ajustado por você' : `produto ${formatBRL(reaisToCents(cogs))} + frete ${formatBRL(reaisToCents(FRETE_POR_PEDIDO))}`}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right whitespace-nowrap">
                        {emEdicao ? (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => salvar(p.id)}
                              title="Salvar"
                              className="grid place-items-center w-8 h-8 rounded-lg text-grn hover:bg-grn/10"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => setEditando(null)}
                              title="Cancelar"
                              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-tx hover:bg-white/5"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => abrir(p)}
                              title="Ajustar a perda deste pedido"
                              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-tx hover:bg-white/5"
                            >
                              <Pencil size={14} />
                            </button>
                            {ajustado && (
                              <button
                                onClick={() => definirPerdaPedido(p.id, null)}
                                title="Voltar ao cálculo automático"
                                className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-gold hover:bg-gold/10"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <TriangleAlert size={16} className="text-yel shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          Por padrão a perda é <b className="text-dim">custo do produto + frete de ida</b> — o dinheiro que de fato saiu.
          Se num caso o produto voltou e você só perdeu o frete, ajuste no lápis. O total daqui é o que aparece como
          <b className="text-dim"> “Valor real perdido”</b> na Demonstração de Resultados.
        </p>
      </div>
    </div>
  );
}
