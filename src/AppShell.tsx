import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, BarChart3, Briefcase, Camera, ChevronDown, Download, LayoutDashboard, LogOut, MapPinned, Megaphone, PieChart, Plug, Receipt, RefreshCw, ShieldAlert, ShoppingBag, Trophy, TriangleAlert, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/Logo';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { CustoModal } from '@/components/CustoModal';
import { BotaoNotificacoes } from '@/components/BotaoNotificacoes';
import { BotaoTemaCompacto, RodapeConta } from '@/components/RodapeConta';
import { PnlScreen } from '@/screens/PnlScreen';
import { CustosScreen } from '@/screens/CustosScreen';
import { FrustradosScreen } from '@/screens/FrustradosScreen';
import { MapaScreen } from '@/screens/MapaScreen';
import { AlertasScreen } from '@/screens/AlertasScreen';
import { VizScreen } from '@/screens/VizScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { AdsScreen } from '@/screens/AdsScreen';
import { FacebookScreen } from '@/screens/FacebookScreen';
import { TaxasScreen } from '@/screens/TaxasScreen';
import { VendasScreen } from '@/screens/VendasScreen';
import { VendasAprovadasScreen } from '@/screens/VendasAprovadasScreen';
import { RankingScreen } from '@/screens/RankingScreen';
import { InstagramScreen } from '@/screens/InstagramScreen';
import { haQuanto, resumoDoPeriodo, saudacao } from '@/lib/saudacao';
import { metaDisponivel, sincronizarMeta } from '@/lib/metaAds';
import { useData } from '@/store/DataProvider';
import { useRegistroAlertas } from '@/store/useRegistroAlertas';

/** De quanto em quanto tempo a dashboard aberta busca o gasto do Meta. */
const SYNC_META_MS = 10 * 60_000;

type Tab = 'pnl' | 'vendas' | 'aprovadas' | 'ranking' | 'instagram' | 'ads' | 'facebook' | 'custos' | 'taxas' | 'frustrados' | 'mapa' | 'alertas' | 'viz' | 'export';

/** `curto` é o rótulo da barra inferior no celular, onde só cabe uma palavra. */
const TABS: { id: Tab; label: string; curto: string; Icon: LucideIcon }[] = [
  { id: 'pnl', label: 'Demonstração de Resultados', curto: 'P&L', Icon: BarChart3 },
  { id: 'vendas', label: 'Vendas Agendadas', curto: 'Vendas', Icon: ShoppingBag },
  { id: 'aprovadas', label: 'Vendas Aprovadas', curto: 'Pagas', Icon: BadgeCheck },
  { id: 'ranking', label: 'Ranking de Vendas', curto: 'Ranking', Icon: Trophy },
  { id: 'instagram', label: 'Instagram', curto: 'Insta', Icon: Camera },
  { id: 'ads', label: 'Anúncios (Meta)', curto: 'Ads', Icon: Megaphone },
  { id: 'facebook', label: 'Integração Facebook', curto: 'Face', Icon: Plug },
  { id: 'custos', label: 'Custos Variáveis', curto: 'Custos', Icon: Wallet },
  { id: 'taxas', label: 'Taxas de Plataforma', curto: 'Taxas', Icon: Receipt },
  { id: 'frustrados', label: 'Frustrados', curto: 'Perdas', Icon: TriangleAlert },
  { id: 'mapa', label: 'Mapa de Frustração', curto: 'Mapa', Icon: MapPinned },
  { id: 'alertas', label: 'Alerta de Clientes', curto: 'Alerta', Icon: ShieldAlert },
  { id: 'viz', label: 'Visualização', curto: 'Gráf.', Icon: PieChart },
  { id: 'export', label: 'Exportador', curto: 'CSV', Icon: Download },
];

/**
 * Menu lateral: telas soltas e grupos que abrem e fecham na setinha.
 * Tela nova entra aqui — solta ou dentro do grupo certo.
 */
type ItemMenu = { aba: Tab } | { grupo: string; label: string; Icon: LucideIcon; abas: Tab[] };
const MENU: ItemMenu[] = [
  {
    grupo: 'vendas',
    label: 'Dashboard | Vendas',
    Icon: LayoutDashboard,
    abas: ['pnl', 'vendas', 'aprovadas', 'viz', 'instagram', 'ranking'],
  },
  { grupo: 'meta', label: 'Meta Ads', Icon: Megaphone, abas: ['ads', 'facebook'] },
  {
    grupo: 'admin',
    label: 'Gerenciamento Administrativo',
    Icon: Briefcase,
    abas: ['frustrados', 'mapa', 'alertas', 'taxas', 'custos'],
  },
  { aba: 'export' },
];

/** A mesma ordem do menu, sem os grupos — a barra de baixo do celular. */
const ORDEM_ABAS: Tab[] = MENU.flatMap((m) => ('aba' in m ? [m.aba] : m.abas));
const abaPorId = (id: Tab) => TABS.find((t) => t.id === id)!;

const KEY_ABA = 'afterpay-pnl:aba';
const KEY_GRUPOS = 'afterpay-pnl:menu-aberto';

/** Grupos abertos da última visita (só neste aparelho). */
function gruposIniciais(): string[] {
  try {
    const salvos = JSON.parse(localStorage.getItem(KEY_GRUPOS) ?? '[]');
    return Array.isArray(salvos) ? salvos.map(String) : [];
  } catch {
    return [];
  }
}

/** Aba salva da última visita. O botão Atualizar recarrega a página
 *  inteira (F5 de verdade), e sem isso o app sempre voltava para o P&L
 *  em vez de recarregar a tela em que você estava. */
function abaInicial(): Tab {
  try {
    const salva = localStorage.getItem(KEY_ABA);
    if (salva && TABS.some((t) => t.id === salva)) return salva as Tab;
  } catch {
    /* ignora */
  }
  return 'pnl';
}

export function AppShell({ onLogout, email, socio = false }: { onLogout?: () => void; email?: string; socio?: boolean }) {
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [tab, setTab] = useState<Tab>(abaInicial);
  const [gruposAbertos, setGruposAbertos] = useState<string[]>(gruposIniciais);
  function alternarGrupo(grupo: string, aberto: boolean) {
    setGruposAbertos((atual) => {
      const novo = aberto ? atual.filter((g) => g !== grupo) : [...atual, grupo];
      try {
        localStorage.setItem(KEY_GRUPOS, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  }
  const [modal, setModal] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  // "Última atualização": os dados são buscados quando a página abre, e o
  // Atualizar recarrega a página inteira — então é a hora deste carregamento.
  const [carregadoEm] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Gasto do Meta sempre fresco com a dashboard aberta: ao abrir, a cada
  // 10 minutos e ao voltar para a aba. O agendamento do GitHub, que devia
  // rodar de 30 em 30 minutos, na prática roda de 3 em 3 horas.
  const { recarregar, pedidos } = useData();
  // Alertas de clientes: gravados sozinhos pelo servidor; aqui carregados a
  // cada minuto e completados com o que a dashboard acha.
  const registroAlertas = useRegistroAlertas(pedidos);
  useEffect(() => {
    if (!metaDisponivel) return;
    // Guardado na sessão: o Atualizar já sincroniza antes do F5, e a
    // página que volta não precisa repetir.
    const KEY = 'afterpay-pnl:sync-meta';
    const ler = () => {
      try {
        return Number(sessionStorage.getItem(KEY)) || 0;
      } catch {
        return 0;
      }
    };
    let parado = false;
    async function sincronizar() {
      if (document.visibilityState !== 'visible' || Date.now() - ler() < 2 * 60_000) return;
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* ignora */
      }
      const r = await sincronizarMeta({ dias: 3 }).catch(() => null);
      // Só recarrega os dados se o Meta trouxe um valor diferente.
      if (!parado && r?.ok && !r.simulado && r.dias.some((d) => Math.abs(d.reais - d.na_dashboard) >= 0.01)) {
        await recarregar();
      }
    }
    const primeira = setTimeout(sincronizar, 1500);
    const t = setInterval(sincronizar, SYNC_META_MS);
    document.addEventListener('visibilitychange', sincronizar);
    return () => {
      parado = true;
      clearTimeout(primeira);
      clearInterval(t);
      document.removeEventListener('visibilitychange', sincronizar);
    };
  }, [recarregar]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY_ABA, tab);
    } catch {
      /* ignora */
    }
  }, [tab]);

  // A barra de baixo desliza (são 9 destinos, não cabem fixos a 375px).
  // Ao trocar de tela, traz o item ativo para a vista — senão a aba
  // selecionada pode ficar fora do campo de visão.
  const barraRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    barraRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [tab]);

  /**
   * Busca o gasto do Meta de hoje e recarrega a página inteira, como um F5 —
   * nada de estado antigo em tela. O Meta tem 8 s: se demorar ou falhar, a
   * página recarrega assim mesmo (o agendamento sincroniza depois).
   */
  async function atualizar() {
    if (atualizando) return;
    setAtualizando(true); // spinner até a página trocar
    if (metaDisponivel) {
      await Promise.race([sincronizarMeta({ dias: 3 }), new Promise((r) => setTimeout(r, 8000))]).catch(() => undefined);
      try {
        sessionStorage.setItem('afterpay-pnl:sync-meta', String(Date.now()));
      } catch {
        /* ignora */
      }
    }
    window.location.reload();
  }

  const nome = email ? email.split('@')[0] : 'Jonas';
  // Saudação: o dono é o Jonas; um sócio é chamado pelo começo do e-mail.
  const primeiroNome = socio && email ? nome.charAt(0).toUpperCase() + nome.slice(1).split(/[._-]/)[0] : 'Jonas';

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* ───────── Menu lateral esquerdo ───────── */}
      <aside className="hidden lg:block lg:w-[250px] lg:shrink-0 lg:min-h-screen lg:border-r border-line/70 lg:bg-card/40 px-4 pt-5 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center gap-3 pb-4 mb-3 border-b border-line/70 lg:border-0 lg:mb-4">
          <LogoMark size={42} />
          <Wordmark />
        </div>

        <nav className="flex flex-col gap-1.5">
          {MENU.map((m) => {
            if ('aba' in m) return <BotaoAba key={m.aba} aba={m.aba} ativo={tab === m.aba} onClick={() => setTab(m.aba)} />;
            // O grupo da tela aberta fica aberto — senão ela sumiria do menu.
            const temAtiva = m.abas.includes(tab);
            const aberto = gruposAbertos.includes(m.grupo) || temAtiva;
            return (
              <div key={m.grupo}>
                <button
                  onClick={() => alternarGrupo(m.grupo, aberto)}
                  aria-expanded={aberto}
                  className={`w-full inline-flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold text-left transition-colors border border-transparent hover:bg-white/[0.025] ${
                    temAtiva ? 'text-tx' : 'text-dim hover:text-tx'
                  }`}
                >
                  <m.Icon size={16} className={`shrink-0 ${temAtiva ? 'text-gold' : 'text-dim2'}`} />
                  <span className="flex-1 whitespace-normal leading-snug">{m.label}</span>
                  <ChevronDown
                    size={15}
                    className={`shrink-0 text-dim2 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
                  />
                </button>
                {aberto && (
                  <div className="ml-[21px] mt-1 pl-2.5 border-l border-line2 flex flex-col gap-1">
                    {m.abas.map((a) => (
                      <BotaoAba key={a} aba={a} ativo={tab === a} onClick={() => setTab(a)} pequeno />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Conta, tema, notificações e sair */}
        <RodapeConta nome={nome} email={email} nuvem={!!onLogout} onLogout={onLogout} />
      </aside>

      {/* ───────── Cabeçalho fixo do celular ───────── */}
      {/* pt-safe: instalado na tela inicial, o app ocupa a tela toda e o
          relógio/bateria ficariam por cima dos botões. */}
      <header className="lg:hidden sticky top-0 z-40 bg-bg/95 backdrop-blur-md border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-1.5 px-3 h-[52px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <LogoMark size={30} />
            <span className="text-gold-metal font-extrabold text-[13px] tracking-[0.04em] leading-none truncate">
              AJ ALPHA COMPANY
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <BotaoTemaCompacto />
            <BotaoNotificacoes compacto />
            <button
              onClick={atualizar}
              disabled={atualizando}
              aria-label="Atualizar"
              className="grid place-items-center w-10 h-10 rounded-full border border-line2 text-tx active:bg-white/5 disabled:opacity-60"
            >
              <RefreshCw size={16} className={atualizando ? 'animate-spin' : ''} />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                aria-label="Sair"
                className="grid place-items-center w-10 h-10 rounded-full border border-line2 text-dim2 active:bg-white/5"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
        {/* Períodos deslizam colados na borda, como numa aba de app */}
        <div className="px-4 pb-2.5">
          <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
        </div>
      </header>

      {/* ───────── Área principal ───────── */}
      <main className="flex-1 min-w-0 px-3 lg:px-6 py-3 lg:py-5 pb-[92px] lg:pb-16">
        {/* Barra do topo no computador: saudação à esquerda (no P&L),
            períodos no centro, atualizar à direita. */}
        <div className="hidden lg:flex items-center gap-4 flex-nowrap mb-5 pb-5 border-b border-line">
          <div className="flex-1 min-w-0">
            {tab === 'pnl' && (
              <>
                <div className="text-[19px] font-extrabold text-tx tracking-tight truncate">{saudacao()}, {primeiroNome}! 👋</div>
                <div className="text-[12.5px] text-dim leading-snug">Aqui está o resumo da sua operação {resumoDoPeriodo(preset)}.</div>
              </>
            )}
          </div>
          <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
          <div className="flex items-center gap-2 flex-1 justify-end">
            <button
              onClick={atualizar}
              disabled={atualizando}
              className="inline-flex items-center gap-2.5 bg-card border border-line2 text-tx hover:border-gold/50 px-[14px] py-[7px] rounded-[11px] transition-colors disabled:opacity-60"
              title="Recarregar os dados"
            >
              <RefreshCw size={15} className={`text-gold ${atualizando ? 'animate-spin' : ''}`} />
              <span className="text-left leading-tight">
                <span className="block text-[13px] font-semibold">Atualizar</span>
                <span className="block text-[10.5px] text-dim2">Última atualização: {haQuanto(carregadoEm, agora)}</span>
              </span>
            </button>
          </div>
        </div>

        {tab === 'pnl' && <PnlScreen
            nome={primeiroNome}
            periodo={periodo}
            onAddCusto={() => setModal(true)}
            onLancarManual={() => setTab('ads')}
            alertas={registroAlertas}
            onVerAlertas={() => setTab('alertas')}
          />}
        {tab === 'vendas' && <VendasScreen periodo={periodo} registro={registroAlertas} />}
        {tab === 'aprovadas' && <VendasAprovadasScreen periodo={periodo} />}
        {tab === 'ranking' && <RankingScreen periodo={periodo} />}
        {tab === 'instagram' && <InstagramScreen periodo={periodo} />}
        {tab === 'ads' && <AdsScreen periodo={periodo} />}
        {tab === 'facebook' && <FacebookScreen />}
        {tab === 'custos' && <CustosScreen periodo={periodo} />}
        {tab === 'taxas' && <TaxasScreen periodo={periodo} />}
        {tab === 'frustrados' && <FrustradosScreen periodo={periodo} />}
        {tab === 'mapa' && <MapaScreen periodo={periodo} />}
        {tab === 'alertas' && <AlertasScreen registro={registroAlertas} />}
        {tab === 'viz' && <VizScreen periodo={periodo} />}
        {tab === 'export' && <ExportScreen periodo={periodo} />}
      </main>

      {/* ───────── Barra de navegação inferior (celular) ───────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card3/97 backdrop-blur-md border-t border-line2 pb-[env(safe-area-inset-bottom)]">
        <div ref={barraRef} className="flex overflow-x-auto no-scrollbar">
          {ORDEM_ABAS.map(abaPorId).map(({ id, curto, Icon }) => {
            const ativo = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={ativo ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-[3px] py-2 min-h-[54px] flex-1 min-w-[62px] shrink-0 transition-colors ${
                  ativo ? 'text-gold' : 'text-dim2 active:text-dim'
                }`}
              >
                <Icon size={19} strokeWidth={ativo ? 2.3 : 1.9} />
                <span className={`text-[9.5px] leading-none ${ativo ? 'font-bold' : 'font-medium'}`}>{curto}</span>
              </button>
            );
          })}
        </div>
        {/* Sombra na borda: diz que a barra continua para o lado. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-card3 to-transparent" />
      </nav>

      <CustoModal aberto={modal} onClose={() => setModal(false)} />
    </div>
  );
}

/** Uma tela no menu lateral (solta ou dentro de um grupo). */
function BotaoAba({ aba, ativo, onClick, pequeno = false }: { aba: Tab; ativo: boolean; onClick: () => void; pequeno?: boolean }) {
  const { label, Icon } = abaPorId(aba);
  return (
    <button
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={`w-full inline-flex items-center gap-2.5 rounded-[10px] font-semibold text-left transition-colors ${
        pequeno ? 'px-2.5 py-2 text-[12.5px]' : 'px-3 py-2.5 text-[13px]'
      } ${
        ativo
          ? 'bg-white/[0.05] text-tx border border-line2'
          : 'text-dim hover:text-tx hover:bg-white/[0.025] border border-transparent'
      }`}
    >
      <Icon size={pequeno ? 15 : 16} className={`shrink-0 ${ativo ? 'text-gold' : 'text-dim2'}`} />
      {/* Nome longo quebra linha em vez de espremer o ícone. */}
      <span className="whitespace-normal leading-snug">{label}</span>
    </button>
  );
}
