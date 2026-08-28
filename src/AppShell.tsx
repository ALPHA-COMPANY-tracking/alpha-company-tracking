import { useState } from 'react';
import { LogOut, Plus, RefreshCw } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/Logo';
import { useData } from '@/store/DataProvider';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { CustoModal } from '@/components/CustoModal';
import { PnlScreen } from '@/screens/PnlScreen';
import { CustosScreen } from '@/screens/CustosScreen';
import { VizScreen } from '@/screens/VizScreen';
import { ExportScreen } from '@/screens/ExportScreen';
import { AdsScreen } from '@/screens/AdsScreen';

type Tab = 'pnl' | 'ads' | 'custos' | 'viz' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'ads', label: 'Ads (Meta)' },
  { id: 'custos', label: 'Custos Variáveis' },
  { id: 'viz', label: 'Visualização' },
  { id: 'export', label: 'Exportar' },
];

export function AppShell({ onLogout, email }: { onLogout?: () => void; email?: string }) {
  const { ultimoSync, marcarSync } = useData();
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [tab, setTab] = useState<Tab>('pnl');
  const [modal, setModal] = useState(false);

  const nome = email ? email.split('@')[0] : 'Jonas';

  return (
    <div className="min-h-full max-w-[1400px] mx-auto px-4 sm:px-6 py-5 pb-16">
      {/* Barra de marca */}
      <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-line/70">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <Wordmark />
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="text-[11.5px] text-dim2 hidden sm:inline">
            {onLogout ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-grn" /> Nuvem
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-dim2" /> Modo local
              </span>
            )}
          </span>
          <span className="text-[12.5px] text-dim hidden sm:inline">Olá, <b className="text-tx font-semibold">{nome}</b></span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-[12px] text-dim2 hover:text-red border border-line2 rounded-lg px-2.5 py-1.5"
              title={email}
            >
              <LogOut size={14} /> Sair
            </button>
          )}
        </div>
      </div>

      {/* Barra de filtros / ações */}
      <div className="flex items-center gap-[10px] flex-wrap mb-4">
        <PeriodSelector preset={preset} periodo={periodo} onPreset={selecionarPreset} onCustom={definirPersonalizado} />
        <div className="flex-1" />
        <button
          onClick={marcarSync}
          className="inline-flex items-center gap-2 bg-card border border-line2 text-tx px-[14px] py-[9px] rounded-[10px] text-[13px] font-semibold hover:border-pur/60"
          title={ultimoSync ? `Último sync: ${new Date(ultimoSync).toLocaleString('pt-BR')}` : 'Modo local — sincronização real na Etapa 8'}
        >
          <RefreshCw size={15} /> Sincronizar
        </button>
        <button
          onClick={() => setModal(true)}
          className="inline-flex items-center gap-2 text-white px-[14px] py-[9px] rounded-[10px] text-[13px] font-semibold bg-gradient-to-br from-pur3 to-pur"
        >
          <Plus size={15} /> Adicionar custo
        </button>
      </div>

      {/* Navegação */}
      <div className="flex items-center gap-1 mb-5 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-[10px] text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-pur text-tx' : 'border-transparent text-dim hover:text-tx'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pnl' && <PnlScreen periodo={periodo} onAddCusto={() => setModal(true)} onLancarManual={() => setTab('ads')} />}
      {tab === 'ads' && <AdsScreen periodo={periodo} />}
      {tab === 'custos' && <CustosScreen periodo={periodo} />}
      {tab === 'viz' && <VizScreen periodo={periodo} />}
      {tab === 'export' && <ExportScreen periodo={periodo} />}

      <CustoModal aberto={modal} onClose={() => setModal(false)} />
    </div>
  );
}
