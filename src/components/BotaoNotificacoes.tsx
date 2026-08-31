import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { type EstadoPush, desligarPush, estadoPush, ligarPush, pushSuportado } from '@/lib/push';

/**
 * Liga/desliga as notificações de pedido pago e agendado neste aparelho.
 * Some quando o navegador não suporta push.
 */
export function BotaoNotificacoes({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<EstadoPush>('indisponivel');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    estadoPush().then(setEstado);
  }, []);

  if (!pushSuportado() || estado === 'indisponivel') return null;

  async function alternar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      setEstado(estado === 'ligado' ? await desligarPush() : await ligarPush());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ativar as notificações.');
    } finally {
      setOcupado(false);
    }
  }

  const ligado = estado === 'ligado';
  const bloqueado = estado === 'bloqueado';

  const titulo = bloqueado
    ? 'Notificações bloqueadas nas configurações do navegador'
    : ligado
      ? 'Notificações ligadas — toque para desligar'
      : 'Receber aviso de pedido pago e agendado';

  const Icone = ocupado ? Loader2 : bloqueado ? BellOff : ligado ? BellRing : Bell;

  if (compacto) {
    return (
      <button
        onClick={alternar}
        disabled={ocupado || bloqueado}
        title={titulo}
        aria-label={titulo}
        className={`grid place-items-center w-9 h-9 rounded-full border active:bg-white/5 disabled:opacity-60 ${
          ligado ? 'border-gold/50 text-gold' : 'border-line2 text-dim2'
        }`}
      >
        <Icone size={16} className={ocupado ? 'animate-spin' : ''} />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={alternar}
        disabled={ocupado || bloqueado}
        title={titulo}
        className={`inline-flex items-center gap-2 px-[13px] py-[9px] rounded-[10px] text-[12.5px] font-semibold border transition-colors disabled:opacity-60 ${
          ligado ? 'border-gold/50 text-gold bg-gold/[0.07]' : 'border-line2 text-dim hover:text-tx'
        }`}
      >
        <Icone size={15} className={ocupado ? 'animate-spin' : ''} />
        {bloqueado ? 'Notificações bloqueadas' : ligado ? 'Notificações ligadas' : 'Ativar notificações'}
      </button>
      {erro && <span className="text-[11px] text-red">{erro}</span>}
      {bloqueado && (
        <span className="text-[11px] text-dim2">
          Libere nas configurações do navegador para este site.
        </span>
      )}
    </div>
  );
}
