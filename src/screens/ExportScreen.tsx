import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { Periodo } from '@/types';
import { formatBRL } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { calcularPnl } from '@/lib/pnl';
import { exportarCsvCustos, exportarXlsx } from '@/lib/export';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';

export function ExportScreen({ periodo }: { periodo: Periodo }) {
  const { dailies, custos, categorias } = useData();
  const [gerando, setGerando] = useState(false);
  const pnl = useMemo(() => calcularPnl(dailies, custos, periodo), [dailies, custos, periodo]);

  async function baixarExcel() {
    setGerando(true);
    try {
      await exportarXlsx(dailies, custos, categorias, periodo);
    } finally {
      setGerando(false);
    }
  }

  const rangeLabel = `${formatDiaMes(periodo.inicio)} a ${formatDiaMes(periodo.fim)}`;

  return (
    <div className="flex flex-col gap-4 max-w-[760px] mx-auto w-full">
      <Panel title="Exportar período" hint={rangeLabel}>
        <div className="p-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Mini label="Receita" valor={formatBRL(pnl.receita_aprovada)} cor="#34d399" />
            <Mini label="Custos totais" valor={formatBRL(pnl.custos_totais_reais)} cor="#fb7185" />
            <Mini label="Lucro real" valor={formatBRL(pnl.lucro_real)} cor="#34d399" />
            <Mini label="Lançamentos" valor={String(pnl.qtd_lancamentos)} cor="#c084fc" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={baixarExcel}
              disabled={gerando}
              className="flex items-start gap-3 text-left p-4 rounded-[12px] border border-line2 hover:border-grn/60 bg-card2 disabled:opacity-60 transition-colors"
            >
              <span className="w-10 h-10 rounded-[10px] bg-grn/15 grid place-items-center text-grn shrink-0">
                {gerando ? <Loader2 size={20} className="animate-spin" /> : <FileSpreadsheet size={20} />}
              </span>
              <span>
                <span className="block text-[14px] font-bold text-tx">{gerando ? 'Gerando…' : 'Baixar Excel (.xlsx)'}</span>
                <span className="block text-[12px] text-dim mt-0.5">3 abas: Resumo P&L, Custos Variáveis e Diário</span>
              </span>
            </button>

            <button
              onClick={() => exportarCsvCustos(custos, categorias, periodo)}
              className="flex items-start gap-3 text-left p-4 rounded-[12px] border border-line2 hover:border-pur/60 bg-card2 transition-colors"
            >
              <span className="w-10 h-10 rounded-[10px] bg-pur/15 grid place-items-center text-pur2 shrink-0">
                <FileText size={20} />
              </span>
              <span>
                <span className="block text-[14px] font-bold text-tx">Baixar CSV</span>
                <span className="block text-[12px] text-dim mt-0.5">Custos variáveis · reimportável nesta tela</span>
              </span>
            </button>
          </div>

          <div className="text-[12px] text-dim2 leading-relaxed border-t border-line pt-4">
            Os valores saem como <b className="text-dim">número real</b> com formato de moeda — dá pra somar e
            filtrar direto no Excel/Google Sheets. O arquivo cobre exatamente o período selecionado no topo
            (<span className="mono">{rangeLabel}</span>).
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Mini({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="bg-card2 border border-line rounded-[12px] px-3 py-[11px]">
      <div className="text-[10.5px] text-dim2 font-medium">{label}</div>
      <div className="mono text-[15px] font-bold mt-1" style={{ color: cor }}>
        {valor}
      </div>
    </div>
  );
}
