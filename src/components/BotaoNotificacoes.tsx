import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, Check, Loader2, Send, X } from 'lucide-react';
import {
  type EstadoPush,
  desligarPush,
  enviarTeste,
  estadoPush,
  ligarPush,
  pushSuportado,
} from '@/lib/push';
import { ItemMenu } from '@/components/RodapeConta';

/**
 * Liga/desliga as notificações de pedido pago e agendado neste aparelho,
 * e permite disparar um teste. Some quando o navegador não suporta push.
 */
export function BotaoNotificacoes({
  compacto = false,
  formato = 'botao',
}: {
  compacto?: boolean;
  /** 'menu' = linha do menu lateral; 'botao' = botão com moldura. */
  formato?: 'botao' | 'menu';
}) {
  const [estado, setEstado] = useState<EstadoPush>('indisponivel');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    estadoPush().then(setEstado);
  }, []);

  // Fecha o menuzinho ao tocar fora.
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [menu]);

  if (!pushSuportado() || estado === 'indisponivel') return null;

  const ligado = estado === 'ligado';
  const bloqueado = estado === 'bloqueado';

  async function alternar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setRecado(null);
    try {
      setEstado(ligado ? await desligarPush() : await ligarPush());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ativar as notificações.');
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setRecado(null);
    try {
      setRecado(await enviarTeste());
      setTimeout(() => setRecado(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar o teste.');
    } finally {
      setOcupado(false);
      setMenu(false);
    }
  }

  const titulo = bloqueado
    ? 'Notificações bloqueadas nas configurações do navegador'
    : ligado
      ? 'Notificações ligadas'
      : 'Receber aviso de pedido pago e agendado';

  const Icone = ocupado ? Loader2 : bloqueado ? BellOff : ligado ? BellRing : Bell;

  // ── Menu lateral (desktop) ──
  if (formato === 'menu') {
    return (
      <>
        <ItemMenu
          Icon={Icone}
          rotulo={bloqueado ? 'Notificações bloqueadas' : ligado ? 'Notificações Ativas' : 'Ativar notificações'}
          onClick={alternar}
          ativo={ligado}
          desabilitado={ocupado || bloqueado}
          girando={ocupado}
        />
        {/* O teste só faz sentido depois de ativar */}
        {ligado && <ItemMenu Icon={Send} rotulo="Notificação teste" onClick={testar} desabilitado={ocupado} />}
        {recado && (
          <span className="px-1 pb-1 text-[11px] text-grn flex items-center gap-1">
            <Check size={12} /> {recado}
          </span>
        )}
        {erro && <span className="px-1 pb-1 text-[11px] text-red">{erro}</span>}
      </>
    );
  }

  // ── Botão redondo do celular ──
  if (compacto) {
    return (
      <div className="relative" ref={caixa}>
        <button
          onClick={() => (ligado ? setMenu((v) => !v) : alternar())}
          disabled={ocupado || bloqueado}
          title={titulo}
          aria-label={titulo}
          className={`grid place-items-center w-10 h-10 rounded-full border active:bg-tx/5 disabled:opacity-60 ${
            ligado ? 'border-gold/50 text-gold' : 'border-line2 text-dim2'
          }`}
        >
          <Icone size={16} className={ocupado ? 'animate-spin' : ''} />
        </button>

        {menu && (
          <div className="absolute right-0 top-[46px] z-50 w-[210px] rounded-[12px] border border-line2 bg-card shadow-xl overflow-hidden">
            <button
              onClick={testar}
              disabled={ocupado}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[13px] text-tx active:bg-tx/5 disabled:opacity-60"
            >
              <Send size={15} className="text-gold" /> Notificação teste
            </button>
            <button
              onClick={alternar}
              disabled={ocupado}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[13px] text-dim border-t border-line active:bg-tx/5 disabled:opacity-60"
            >
              <X size={15} /> Desativar notificações
            </button>
          </div>
        )}

        {/* Resultado do teste, flutuando abaixo do botão */}
        {(recado || erro) && (
          <div
            className={`absolute right-0 top-[46px] z-50 w-[220px] rounded-[10px] border px-3 py-2 text-[11.5px] shadow-xl ${
              erro ? 'border-red/40 bg-card text-red' : 'border-grn/40 bg-card text-grn'
            }`}
          >
            {erro ?? recado}
          </div>
        )}
      </div>
    );
  }

  // ── Botão com moldura (uso genérico) ──
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
      {ligado && (
        <button
          onClick={testar}
          disabled={ocupado}
          className="inline-flex items-center gap-2 px-[13px] py-[8px] rounded-[10px] text-[12px] text-dim border border-line2 hover:text-tx disabled:opacity-60"
        >
          <Send size={14} /> Notificação teste
        </button>
      )}
      {recado && <span className="text-[11px] text-grn">{recado}</span>}
      {erro && <span className="text-[11px] text-red">{erro}</span>}
      {bloqueado && (
        <span className="text-[11px] text-dim2">Libere nas configurações do navegador para este site.</span>
      )}
    </div>
  );
}
