import { type AlertaCliente, type NivelAlerta, ROTULO_ALERTA, motivoDoAlerta } from '@/lib/clientes';

export const COR_ALERTA: Record<NivelAlerta, string> = {
  roubo: 'text-red border-red/45 bg-red/10',
  frustracao: 'text-yel border-yel/40 bg-yel/10',
  duplicado: 'text-yel border-yel/40 bg-yel/10',
  whatsapp: 'text-yel border-yel/40 bg-yel/10',
  recompra: 'text-grn border-grn/35 bg-grn/10',
};

/** Só a etiqueta: "🚨 Já teve roubo". */
export function EtiquetaAlerta({ nivel }: { nivel: NivelAlerta }) {
  return (
    <span className={`shrink-0 text-[10.5px] font-bold rounded-full border px-2 py-[2px] ${COR_ALERTA[nivel]}`}>
      {nivel === 'roubo' ? '🚨 ' : nivel === 'recompra' ? '' : '⚠️ '}
      {ROTULO_ALERTA[nivel]}
    </span>
  );
}

/** Etiqueta do alerta num pedido (com o motivo, se `detalhe`). */
export function SeloAlerta({ alerta, detalhe = false }: { alerta: AlertaCliente; detalhe?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={`${ROTULO_ALERTA[alerta.nivel]} — ${motivoDoAlerta(alerta)}`}>
      <EtiquetaAlerta nivel={alerta.nivel} />
      {detalhe && <span className="text-[11px] text-dim2 truncate">{motivoDoAlerta(alerta)}</span>}
    </span>
  );
}
