import { type AlertaCliente, type NivelAlerta, ROTULO_ALERTA, pedidoDoMotivo } from '@/lib/clientes';
import { formatDiaMes } from '@/lib/dates';

export const COR_ALERTA: Record<NivelAlerta, string> = {
  roubo: 'text-red border-red/45 bg-red/10',
  frustracao: 'text-yel border-yel/40 bg-yel/10',
  duplicado: 'text-yel border-yel/40 bg-yel/10',
  whatsapp: 'text-yel border-yel/40 bg-yel/10',
  recompra: 'text-grn border-grn/35 bg-grn/10',
};

const POR: Record<AlertaCliente['por'], string> = { cpf: 'pelo CPF', telefone: 'pelo WhatsApp', nome: 'só pelo nome' };

/** "no #1296 (16/09) · pelo CPF" — de onde vem o alerta. */
export function motivoDoAlerta(a: AlertaCliente): string {
  const o = pedidoDoMotivo(a);
  const ref = o ? `#${o.internal_id ?? '?'} (${formatDiaMes(o.data)})` : '';
  return `${ref}${ref ? ' · ' : ''}${POR[a.por]}`;
}

/** Etiqueta do alerta num pedido. */
export function SeloAlerta({ alerta, detalhe = false }: { alerta: AlertaCliente; detalhe?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={`${ROTULO_ALERTA[alerta.nivel]} — ${motivoDoAlerta(alerta)}`}>
      <span className={`shrink-0 text-[10.5px] font-bold rounded-full border px-2 py-[2px] ${COR_ALERTA[alerta.nivel]}`}>
        {alerta.nivel === 'roubo' ? '🚨 ' : alerta.nivel === 'recompra' ? '' : '⚠️ '}
        {ROTULO_ALERTA[alerta.nivel]}
      </span>
      {detalhe && <span className="text-[11px] text-dim2 truncate">{motivoDoAlerta(alerta)}</span>}
    </span>
  );
}
