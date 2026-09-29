// Aviso no topo da Demonstração de Resultados: pedidos que acabaram de
// chegar do BlueSales com alerta de cliente (duplicado, roubo…). Some
// quando marcado como visto — o registro continua na tela Alerta de Clientes.
import { Check, ChevronRight, ShieldAlert } from 'lucide-react';
import type { Pedido } from '@/types';
import { formatDiaMes } from '@/lib/dates';
import { GRAVIDADE, pedidoEmAberto } from '@/lib/clientes';
import type { AlertaRegistrado } from '@/lib/alertasRegistro';
import { EtiquetaAlerta } from '@/components/alertas/SeloAlerta';

const MAX = 5;

/** Alertas novos (não vistos) de pedidos que ainda dá tempo de segurar. */
export function alertasNovos(registro: AlertaRegistrado[], pedidos: Pedido[]): { a: AlertaRegistrado; p: Pedido | undefined }[] {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  return registro
    .filter((a) => !a.visto_em)
    .map((a) => ({ a, p: porId.get(a.pedido_id) }))
    .filter(({ p }) => !p || (!p.removido_em && pedidoEmAberto(p)))
    .sort((x, y) => GRAVIDADE[x.a.nivel] - GRAVIDADE[y.a.nivel] || y.a.criado_em.localeCompare(x.a.criado_em));
}

export function AvisoAlertas({
  registro,
  pedidos,
  onVisto,
  onVerTodos,
}: {
  registro: AlertaRegistrado[];
  pedidos: Pedido[];
  onVisto: (ids: number[]) => void;
  onVerTodos: () => void;
}) {
  const novos = alertasNovos(registro, pedidos);
  if (novos.length === 0) return null;
  const temRoubo = novos.some(({ a }) => a.nivel === 'roubo');

  return (
    <section
      className={`rounded-card border overflow-hidden ${temRoubo ? 'border-red/45 bg-red/[0.05]' : 'border-yel/40 bg-yel/[0.05]'}`}
    >
      <div className="px-4 lg:px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/70">
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={18} className={temRoubo ? 'text-red' : 'text-yel'} />
          <div>
            <div className="text-[14px] font-bold text-tx">
              {novos.length} {novos.length === 1 ? 'pedido com alerta de cliente' : 'pedidos com alerta de cliente'}
            </div>
            <div className="text-[11.5px] text-dim">Conferido sozinho quando o pedido chegou do BlueSales — confirme antes de enviar</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onVisto(novos.map(({ a }) => a.id))}
            className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold text-dim hover:text-tx border border-line2"
          >
            <Check size={13} /> Marcar todos como vistos
          </button>
          <button
            onClick={onVerTodos}
            className="inline-flex items-center gap-1 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold text-gold2 hover:text-gold"
          >
            Ver todos <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div>
        {novos.slice(0, MAX).map(({ a, p }) => (
          <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 lg:px-5 py-2.5 border-t border-line/60 first:border-t-0">
            <EtiquetaAlerta nivel={a.nivel} />
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="text-[13px] font-semibold text-tx truncate">{p?.cliente || `Pedido #${a.pedido_numero ?? '—'}`}</div>
              <div className="text-[11px] text-dim2 truncate">
                #{a.pedido_numero ?? '—'}
                {p && ` · ${formatDiaMes(p.data)} · ${p.vendedor || 'sem vendedor'}`}
                {a.texto && ` · ${a.texto}`}
              </div>
            </div>
            <button
              onClick={() => onVisto([a.id])}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-[5px] rounded-[8px] text-[11.5px] font-semibold text-dim hover:text-tx border border-line2"
            >
              <Check size={12} /> Visto
            </button>
          </div>
        ))}
        {novos.length > MAX && (
          <button onClick={onVerTodos} className="w-full py-2.5 border-t border-line/60 text-[12px] font-semibold text-gold2 hover:text-gold">
            Mais {novos.length - MAX} na tela Alerta de Clientes
          </button>
        )}
      </div>
    </section>
  );
}
