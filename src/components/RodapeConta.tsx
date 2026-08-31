import { LogOut, Moon, Sun } from 'lucide-react';
import { useTema } from '@/store/useTema';
import { BotaoNotificacoes } from '@/components/BotaoNotificacoes';

/** Iniciais para o avatar: "dermaxpro.oficial" → "DE". */
function iniciais(nome: string): string {
  const partes = nome.replace(/[._-]+/g, ' ').trim().split(/\s+/);
  const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}

/**
 * Rodapé da conta no menu lateral: quem está logado, tema, notificações
 * e sair — as ações que não pertencem a nenhuma tela.
 */
export function RodapeConta({
  nome,
  email,
  nuvem,
  onLogout,
}: {
  nome: string;
  email?: string;
  nuvem: boolean;
  onLogout?: () => void;
}) {
  const { claro, alternar } = useTema();

  return (
    <div className="mt-6 pt-4 border-t border-line/70">
      {/* Quem está logado */}
      <div className="flex items-center gap-2.5 px-1 mb-3" title={email}>
        <span className="grid place-items-center w-9 h-9 rounded-full bg-chip border border-line2 text-[12px] font-bold text-dim shrink-0">
          {iniciais(nome)}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-tx truncate">{nome}</span>
          <span className="block text-[11px] text-dim2 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${nuvem ? 'bg-grn' : 'bg-dim2'}`} />
            {nuvem ? 'Administrador' : 'Modo local'}
          </span>
        </span>
      </div>

      <div className="flex flex-col">
        <ItemMenu
          Icon={claro ? Moon : Sun}
          rotulo={claro ? 'Modo Escuro' : 'Modo Claro'}
          onClick={alternar}
        />
        <BotaoNotificacoes formato="menu" />
        {onLogout && <ItemMenu Icon={LogOut} rotulo="Sair" onClick={onLogout} perigo />}
      </div>
    </div>
  );
}

/** Botão redondo de tema para o cabeçalho do celular. */
export function BotaoTemaCompacto() {
  const { claro, alternar } = useTema();
  const Icone = claro ? Moon : Sun;
  return (
    <button
      onClick={alternar}
      aria-label={claro ? 'Modo escuro' : 'Modo claro'}
      title={claro ? 'Modo escuro' : 'Modo claro'}
      className="grid place-items-center w-9 h-9 rounded-full border border-line2 text-dim2 active:bg-tx/5"
    >
      <Icone size={16} />
    </button>
  );
}

/** Linha do menu: ícone + texto, sem moldura — como na referência. */
export function ItemMenu({
  Icon,
  rotulo,
  onClick,
  perigo = false,
  ativo = false,
  desabilitado = false,
  girando = false,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  rotulo: string;
  onClick: () => void;
  perigo?: boolean;
  ativo?: boolean;
  desabilitado?: boolean;
  girando?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      className={`flex items-center gap-2.5 px-1 py-2 rounded-lg text-[12.5px] text-left transition-colors disabled:opacity-50 ${
        perigo
          ? 'text-dim2 hover:text-red'
          : ativo
            ? 'text-gold'
            : 'text-dim hover:text-tx'
      }`}
    >
      <Icon size={16} className={girando ? 'animate-spin' : ''} />
      {rotulo}
    </button>
  );
}
