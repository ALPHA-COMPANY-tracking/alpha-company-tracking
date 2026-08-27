import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useData } from '@/store/DataProvider';
import { usePeriodo } from '@/store/usePeriodo';
import { PeriodSelector } from '@/components/pnl/PeriodSelector';
import { CustoModal } from '@/components/CustoModal';
import { PnlScreen } from '@/screens/PnlScreen';
import { CustosScreen } from '@/screens/CustosScreen';
import { VizScreen } from '@/screens/VizScreen';

type Tab = 'pnl' | 'custos' | 'viz' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'custos', label: 'Custos Variáveis' },
  { id: 'viz', label: 'Visualização' },
  { id: 'export', label: 'Exportar' },
];

export function AppShell() {
  const { ultimoSync, marcarSync } = useData();
  const { preset, periodo, selecionarPreset, definirPersonalizado } = usePeriodo();
  const [tab, setTab] = useState<Tab>('pnl');
  const [modal, setModal] = useState(false);

  return (
    <div className="min-h-full max-w-[1400px] mx-auto px-4 sm:px-6 py-5 pb-16">
      {/* Cabeçalho */}
      <div className="text-center text-[15px] font-semibold text-[#cfcfdd] pb-4">Bem-vindo, Jonas!</div>

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

      {tab === 'pnl' && <PnlScreen periodo={periodo} onAddCusto={() => setModal(true)} />}
      {tab === 'custos' && <CustosScreen periodo={periodo} />}
      {tab === 'viz' && <VizScreen periodo={periodo} />}
      {tab === 'export' && (
        <div className="bg-card border border-line rounded-card p-10 text-center text-dim">
          <div className="text-[15px] font-semibold text-tx mb-1">Em construção</div>
          <div className="text-[13px]">Esta tela chega na próxima etapa do nosso passo a passo.</div>
        </div>
      )}

      <CustoModal aberto={modal} onClose={() => setModal(false)} />
    </div>
  );
}
