import { useMemo, useState } from 'react';
import { RotateCcw, ShoppingBag, Trash2, TriangleAlert } from 'lucide-react';
import type { Pedido, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { isDentro } from '@/lib/dates';
import { statusBucket } from '@/lib/pedidos';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';

/** 'YYYY-MM-DD' → 'DD/MM'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Resumo do plano: "6 potes" / "3 potes". */
function planoCurto(plano?: string | null): string {
  const p = plano ?? '';
  if (/6\s*pote/i.test(p)) return '6 potes';
  if (/3\s*pote/i.test(p)) return '3 potes';
  return '—';
}

/** Como o status aparece na tela, com a cor do que ele significa. */
function selo(p: Pedido): { texto: string; classe: string } {
  const bucket = statusBucket(p.status);
  const cru = (p.status ?? '').replace(/_/g, ' ');
  if (bucket === 'aprovado') return { texto: 'Pago', classe: 'text-grn border-grn/35 bg-grn/10' };
  if (bucket === 'frustrado') return { texto: 'Frustrado', classe: 'text-red border-red/35 bg-red/10' };
  return { texto: cru || 'agendado', classe: 'text-dim border-line2 bg-chip' };
}

export function VendasScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, removerPedido } = useData();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  // Pela data de CRIAÇÃO: é a lista do que foi agendado no período,
  // independente de já ter sido pago.
  const doPeriodo = useMemo(
    () =>
      pedidos
        .filter((p) => isDentro(p.data, periodo.inicio, periodo.fim))
        // Dentro do dia, pela numeração do BlueSales (#528, #529...):
        // é a ordem cronológica e a mesma que aparece lá.
        .sort(
          (a, b) =>
            b.data.localeCompare(a.data) ||
            (b.internal_id ?? 0) - (a.internal_id ?? 0) ||
            a.id.localeCompare(b.id),
        ),
    [pedidos, periodo],
  );

  const ativos = doPeriodo.filter((p) => !p.removido_em);
  const removidos = doPeriodo.filter((p) => p.removido_em);

  const totalAtivo = ativos.reduce((s, p) => s + (Number(p.valor_agendado ?? p.valor) || 0), 0);
  const pagos = ativos.filter((p) => statusBucket(p.status) === 'aprovado').length;

  function linha(p: Pedido, removido: boolean) {
    const s = selo(p);
    const valor = Number(p.valor_agendado ?? p.valor) || 0;
    const perguntando = confirmando === p.id;
    return (
      <tr key={p.id} className={`border-t border-line/70 hover:bg-white/[0.015] ${removido ? 'opacity-55' : ''}`}>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-tx font-medium whitespace-nowrap">{diaMes(p.data)}</td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4">
          {/* O nome só existe para vendas que entraram depois de 03/09;
              antes disso nada do cliente era guardado. */}
          <div className={`truncate max-w-[125px] sm:max-w-[220px] ${p.cliente ? 'text-tx' : 'text-dim2 italic'}`}>
            {p.cliente ?? 'sem nome registrado'}
          </div>
          {/* O número do BlueSales (#528) é o que aparece na lista de lá —
              é por ele que se casa uma venda daqui com uma de lá. */}
          <div className="text-[10px] mono mt-[2px]">
            {p.internal_id != null && <span className="text-dim font-bold">#{p.internal_id}</span>}
            <span className="hidden sm:inline text-dim2">{p.internal_id != null ? " · " : ""}{p.id}</span>
          </div>
        </td>
        <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-dim">{p.vendedor?.trim() || '—'}</td>
        <td className="hidden md:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-dim">{planoCurto(p.produto_plano)}</td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right">
          <span className={`mono font-bold ${removido ? 'text-dim2 line-through' : 'text-pur2'}`}>
            {formatBRL(reaisToCents(valor))}
          </span>
        </td>
        <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4">
          <span className={`text-[10.5px] border rounded-full px-[8px] py-[2px] whitespace-nowrap ${s.classe}`}>
            {s.texto}
          </span>
        </td>
        <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right whitespace-nowrap">
          {removido ? (
            <button
              onClick={() => removerPedido(p.id, false)}
              title="Devolver esta venda para a plataforma"
              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-blu hover:bg-blu/10 ml-auto"
            >
              <RotateCcw size={14} />
            </button>
          ) : perguntando ? (
            // Tirar uma venda mexe no faturamento: pede confirmação.
            <div className="inline-flex items-center gap-1.5">
              <button
                onClick={() => {
                  removerPedido(p.id, true);
                  setConfirmando(null);
                }}
                className="px-2.5 py-[5px] rounded-lg text-[11.5px] font-semibold text-red border border-red/40 bg-red/10 hover:bg-red/20"
              >
                Excluir
              </button>
              <button
                onClick={() => setConfirmando(null)}
                className="px-2.5 py-[5px] rounded-lg text-[11.5px] text-dim2 hover:text-tx"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(p.id)}
              title="Tirar esta venda da plataforma"
              className="grid place-items-center w-8 h-8 rounded-lg text-red/70 hover:text-red hover:bg-red/10 ml-auto"
            >
              <Trash2 size={15} />
            </button>
          )}
        </td>
      </tr>
    );
  }

  const cabecalho = (
    <thead>
      <tr className="text-dim2 text-[11px] uppercase tracking-wide">
        <th className="text-left font-semibold px-2 sm:px-3 lg:px-5 py-3">Data</th>
        <th className="text-left font-semibold px-3 lg:px-5 py-3">Cliente</th>
        <th className="hidden sm:table-cell text-left font-semibold px-3 lg:px-5 py-3">Vendedor</th>
        <th className="hidden md:table-cell text-left font-semibold px-3 lg:px-5 py-3">Plano</th>
        <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Valor</th>
        <th className="hidden sm:table-cell text-left font-semibold px-3 lg:px-5 py-3">Status</th>
        <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Ações</th>
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Vendas Agendadas</h1>
        <p className="text-[13px] text-dim mt-0.5">
          Tudo que foi agendado no período, com o nome do cliente — e o que tirar da plataforma
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 lg:gap-[14px]">
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Agendadas</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-pur2">{ativos.length}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">no período</div>
        </div>
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Valor agendado</div>
          <div className="mono text-[13px] lg:text-[21px] font-extrabold text-pur2 truncate">
            {formatBRL(reaisToCents(totalAtivo))}
          </div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">{pagos} já pagas</div>
        </div>
        <div className={`bg-card border rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px] ${removidos.length > 0 ? 'border-red/30' : 'border-line'}`}>
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Excluídas</div>
          <div className={`mono text-[16px] lg:text-[21px] font-extrabold ${removidos.length > 0 ? 'text-red' : 'text-dim'}`}>
            {removidos.length}
          </div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">fora dos cálculos</div>
        </div>
      </div>

      <Panel title="Vendas do período" hint="a lixeira tira a venda de todos os cálculos">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[335px] lg:min-w-[720px]">
            {cabecalho}
            <tbody>
              {ativos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-dim2">
                    Nenhuma venda agendada neste período.
                  </td>
                </tr>
              ) : (
                ativos.map((p) => linha(p, false))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {removidos.length > 0 && (
        <Panel title="Excluídas da plataforma" hint="não entram em nenhum cálculo · a seta devolve">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[420px] lg:min-w-[720px]">
              {cabecalho}
              <tbody>{removidos.map((p) => linha(p, true))}</tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <TriangleAlert size={16} className="text-yel shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          Use a lixeira quando a venda foi <b className="text-dim">cancelada e excluída no BlueSales</b>. Nesse caso ele
          não manda evento nenhum — o pedido some de lá e ficaria preso aqui, inflando o Faturamento Agendado. Nada é
          apagado do banco: a venda vai para a lista de baixo e pode voltar.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <ShoppingBag size={16} className="text-blu shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          O nome do cliente só aparece nas vendas que entraram a partir de <b className="text-dim">03/09/2026</b>. Antes
          disso nenhum dado do cliente era guardado. Nas vendas antigas, confira pelo código do pedido.
        </p>
      </div>
    </div>
  );
}
