import { useState } from 'react';
import { BarChart3, Download, LogOut, Megaphone, PieChart, RefreshCw, TriangleAlert, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/Logo';
import { useData } from '@/store/DataProvider';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { CustoModal } from '@/components/CustoModal';
import { PnlScreen } from '@/screens/PnlScreen';
import { CustosScreen } from '@/screens/CustosScreen';
import { FrustradosScreen } from '@/screens/FrustradosScreen';
import { VizScreen } from '@/screens/VizScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { AdsScreen } from '@/screens/AdsScreen';

type Tab = 'pnl' | 'ads' | 'custos' | 'frustrados' | 'viz' | 'export';

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'pnl', label: 'Demonstração de Resultados', Icon: BarChart3 },
  { id: 'ads', label: 'Anúncios (Meta)', Icon: Megaphone },
  { id: 'custos', label: 'Custos Variáveis', Icon: Wallet },
  { id: 'frustrados', label: 'Frustrados', Icon: TriangleAlert },
  { id: 'viz', label: 'Visualização', Icon: PieChart },
  { id: 'export', label: 'Exportador', Icon: Download },
];

export function AppShell({ onLogout, email }: { onLogout?: () => void; email?: string }) {
  const { ultimoSync } = useData();
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [tab, setTab] = useState<Tab>('pnl');
  const [modal, setModal] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

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
      <aside className="lg:w-[250px] lg:shrink-0 lg:min-h-screen lg:border-r border-line/70 lg:bg-card/40 px-4 pt-5 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center gap-3 pb-4 mb-3 border-b border-line/70 lg:border-0 lg:mb-4">
          <LogoMark size={42} />
          <Wordmark />
        </div>

        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        {/* Rodapé do menu: conta (só desktop) */}
        <div className="hidden lg:flex flex-col gap-3 mt-6 pt-4 border-t border-line/70 text-[12px]">
          <span className="text-dim">
            {onLogout ? (
              <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-grn" /> Nuvem</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-dim2" /> Modo local</span>
            )}
          </span>
          <span className="text-dim">Olá, <b className="text-tx font-semibold">{nome}</b></span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-[12px] text-dim2 hover:text-red border border-line2 rounded-lg px-2.5 py-1.5 w-fit"
              title={email}
            >
              <LogOut size={14} /> Sair
            </button>
          )}
        </div>
      </aside>

      {/* ───────── Área principal ───────── */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-5 pb-16">
        {/* Barra de filtros: seletor centralizado, ações à direita.
            Os dois lados usam flex-1 para o seletor ficar no meio de verdade. */}
        <div className="flex items-center gap-3 flex-wrap justify-center lg:flex-nowrap mb-5">
          <div className="hidden lg:block flex-1" />
          <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
          <div className="flex items-center gap-2 lg:flex-1 lg:justify-end shrink-0">
            <button
              onClick={atualizar}
              disabled={atualizando}
              className="inline-flex items-center gap-2 bg-card border border-line2 text-tx hover:border-gold/50 px-[15px] py-[10px] rounded-[10px] text-[13.5px] font-semibold transition-colors disabled:opacity-60"
              title={ultimoSync ? `Última atualização: ${new Date(ultimoSync).toLocaleString('pt-BR')}` : 'Recarregar a página'}
            >
              <RefreshCw size={15} className={atualizando ? 'animate-spin' : ''} /> Atualizar
            </button>
            {/* Conta no mobile */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="lg:hidden inline-flex items-center gap-1.5 text-[12px] text-dim2 hover:text-red border border-line2 rounded-lg px-2.5 py-[9px]"
                title={email}
              >
                <LogOut size={14} /> Sair
              </button>
            )}
          </div>
        </div>

        {tab === 'pnl' && <PnlScreen periodo={periodo} onAddCusto={() => setModal(true)} onLancarManual={() => setTab('ads')} />}
        {tab === 'ads' && <AdsScreen periodo={periodo} />}
        {tab === 'custos' && <CustosScreen periodo={periodo} />}
        {tab === 'frustrados' && <FrustradosScreen periodo={periodo} />}
        {tab === 'viz' && <VizScreen periodo={periodo} />}
        {tab === 'export' && <ExportScreen periodo={periodo} />}
      </main>

      <CustoModal aberto={modal} onClose={() => setModal(false)} />
    </div>
  );
}
