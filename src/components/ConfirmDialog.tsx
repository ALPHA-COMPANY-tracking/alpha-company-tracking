import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({
  aberto,
  titulo,
  mensagem,
  confirmarLabel = 'Excluir',
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  confirmarLabel?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancelar}>
      <div className="w-full max-w-[380px] bg-card border border-line2 rounded-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <span className="w-9 h-9 rounded-[10px] bg-red/15 grid place-items-center text-red shrink-0">
            <AlertTriangle size={18} />
          </span>
          <div>
            <h3 className="m-0 text-[15px] font-bold text-tx">{titulo}</h3>
            <p className="mt-1 mb-0 text-[13px] text-dim leading-relaxed">{mensagem}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-dim border border-line2 hover:text-tx"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-white bg-red hover:brightness-110"
          >
            {confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
