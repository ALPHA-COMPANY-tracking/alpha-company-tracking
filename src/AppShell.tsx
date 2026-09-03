import { useEffect, useRef, useState } from 'react';
import { BarChart3, Download, LogOut, Megaphone, PieChart, Receipt, RefreshCw, ShoppingBag, Trophy, TriangleAlert, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/Logo';
import { useData } from '@/store/DataProvider';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { CustoModal } from '@/components/CustoModal';
import { BotaoNotificacoes } from '@/components/BotaoNotificacoes';
import { BotaoTemaCompacto, RodapeConta } from '@/components/RodapeConta';
import { PnlScreen } from '@/screens/PnlScreen';
import { CustosScreen } from '@/screens/CustosScreen';
import { FrustradosScreen } from '@/screens/FrustradosScreen';
import { VizScreen } from '@/screens/VizScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { AdsScreen } from '@/screens/AdsScreen';
import { TaxasScreen } from '@/screens/TaxasScreen';
import { VendasScreen } from '@/screens/VendasScreen';
import { RankingScreen } from '@/screens/RankingScreen';

type Tab = 'pnl' | 'vendas' | 'ranking' | 'ads' | 'custos' | 'taxas' | 'frustrados' | 'viz' | 'export';

/** `curto` é o rótulo da barra inferior no celular, onde só cabe uma palavra. */
const TABS: { id: Tab; label: string; curto: string; Icon: LucideIcon }[] = [
  { id: 'pnl', label: 'Demonstração de Resultados', curto: 'P&L', Icon: BarChart3 },
  { id: 'vendas', label: 'Vendas Agendadas', curto: 'Vendas', Icon: ShoppingBag },
  { id: 'ranking', label: 'Ranking de Vendas', curto: 'Ranking', Icon: Trophy },
  { id: 'ads', label: 'Anúncios (Meta)', curto: 'Ads', Icon: Megaphone },
  { id: 'custos', label: 'Custos Variáveis', curto: 'Custos', Icon: Wallet },
  { id: 'taxas', label: 'Taxas de Plataforma', curto: 'Taxas', Icon: Receipt },
  { id: 'frustrados', label: 'Frustrados', curto: 'Perdas', Icon: TriangleAlert },
  { id: 'viz', label: 'Visualização', curto: 'Gráf.', Icon: PieChart },
  { id: 'export', label: 'Exportador', curto: 'CSV', Icon: Download },
];

const KEY_ABA = 'afterpay-pnl:aba';

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

export function AppShell({ onLogout, email }: { onLogout?: () => void; email?: string }) {
  const { ultimoSync } = useData();
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [tab, setTab] = useState<Tab>(abaInicial);
  const [modal, setModal] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

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

  /** Recarrega a página inteira, como um F5 — nada de estado antigo em tela. */
  function atualizar() {
    if (atualizando) return;
    setAtualizando(true); // spinner até a página trocar
    window.location.reload();
  }

  const nome = email ? email.split('@')[0] : 'Jonas';

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* ───────── Menu lateral esquerdo ───────── */}
      <aside className="hidden lg:block lg:w-[250px] lg:shrink-0 lg:min-h-screen lg:border-r border-line/70 lg:bg-card/40 px-4 pt-5 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center gap-3 pb-4 mb-3 border-b border-line/70 lg:border-0 lg:mb-4">
          <LogoMark size={42} />
          <Wordmark />
        </div>

        <nav className="flex lg:flex-col gap-1.5">
          {TABS.map(({ id, label, Icon }) => {
            const ativo = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold whitespace-nowrap shrink-0 lg:w-full text-left transition-colors ${
                  ativo
                    ? 'bg-white/[0.05] text-tx border border-line2'
                    : 'text-dim hover:text-tx hover:bg-white/[0.025] border border-transparent'
                }`}
              >
                <Icon size={16} className={ativo ? 'text-gold' : 'text-dim2'} />
                {label}
              </button>
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
        {/* Barra de filtros do desktop: seletor centralizado, ações à direita. */}
        <div className="hidden lg:flex items-center gap-3 flex-nowrap mb-5">
          <div className="flex-1" />
          <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
          <div className="flex items-center gap-2 flex-1 justify-end">
            <button
              onClick={atualizar}
              disabled={atualizando}
              className="inline-flex items-center gap-2 bg-card border border-line2 text-tx hover:border-gold/50 px-[15px] py-[10px] rounded-[10px] text-[13.5px] font-semibold transition-colors disabled:opacity-60"
              title={ultimoSync ? `Última atualização: ${new Date(ultimoSync).toLocaleString('pt-BR')}` : 'Recarregar a página'}
            >
              <RefreshCw size={15} className={atualizando ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </div>

        {tab === 'pnl' && <PnlScreen periodo={periodo} onAddCusto={() => setModal(true)} onLancarManual={() => setTab('ads')} />}
        {tab === 'vendas' && <VendasScreen periodo={periodo} />}
        {tab === 'ranking' && <RankingScreen periodo={periodo} />}
        {tab === 'ads' && <AdsScreen periodo={periodo} />}
        {tab === 'custos' && <CustosScreen periodo={periodo} />}
        {tab === 'taxas' && <TaxasScreen periodo={periodo} />}
        {tab === 'frustrados' && <FrustradosScreen periodo={periodo} />}
        {tab === 'viz' && <VizScreen periodo={periodo} />}
        {tab === 'export' && <ExportScreen periodo={periodo} />}
      </main>

      {/* ───────── Barra de navegação inferior (celular) ───────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card3/97 backdrop-blur-md border-t border-line2 pb-[env(safe-area-inset-bottom)]">
        <div ref={barraRef} className="flex overflow-x-auto no-scrollbar">
          {TABS.map(({ id, curto, Icon }) => {
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
