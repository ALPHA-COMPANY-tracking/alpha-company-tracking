import { useMemo, useState } from 'react';
import { FolderCog, Pencil, Plus, Search, Trash2, Upload, Wallet } from 'lucide-react';
import type { CustoVariavel, Periodo } from '@/types';
import { diasInclusivos } from '@/lib/dates';
import { type Cents, formatBRL } from '@/lib/money';
import { custoNoPeriodo } from '@/lib/pnl';
import { useData } from '@/store/DataProvider';
import { CustoModal } from '@/components/CustoModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ImportCsvModal } from '@/components/custos/ImportCsvModal';
import { CategoriasDrawer } from '@/components/custos/CategoriasDrawer';

export function CustosScreen({ periodo }: { periodo: Periodo }) {
  const { custos, categorias, deleteCusto } = useData();
  const catMap = new Map(categorias.map((c) => [c.id, c]));

  const [editar, setEditar] = useState<CustoVariavel | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [excluir, setExcluir] = useState<CustoVariavel | null>(null);
  const [filtroCat, setFiltroCat] = useState('');
  const [busca, setBusca] = useState('');

  // Custos que contribuem para o período, com o valor rateado no período.
  const doPeriodo = useMemo(
    () =>
      custos
        .map((c) => ({ c, valor: custoNoPeriodo(c, periodo) as Cents }))
        .filter((x) => x.valor > 0)
        .sort((a, b) => b.c.data.localeCompare(a.c.data)),
    [custos, periodo],
  );

  const total = doPeriodo.reduce((a, x) => a + x.valor, 0);
  const dias = diasInclusivos(periodo.inicio, periodo.fim) || 1;
  const mediaMensal = Math.round((total / dias) * 30);

  const porCategoria = new Map<string | null, Cents>();
  for (const { c, valor } of doPeriodo) porCategoria.set(c.categoria_id, (porCategoria.get(c.categoria_id) ?? 0) + valor);
  const maior = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0];
  const maiorNome = maior ? catMap.get(maior[0] ?? '')?.nome ?? 'Sem categoria' : '—';

  const filtrados = doPeriodo.filter(({ c }) => {
    if (filtroCat && c.categoria_id !== filtroCat) return false;
    if (busca && !c.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  function abrirAdd() {
    setEditar(null);
    setModalAberto(true);
  }
  function abrirEdit(c: CustoVariavel) {
    setEditar(c);
    setModalAberto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        <ResumoCard cor="#c084fc" label="Total do período" valor={formatBRL(total)} sub={`${doPeriodo.length} lançamentos`} />
        <ResumoCard cor="#60a5fa" label="Maior categoria" valor={maiorNome} sub={maior ? formatBRL(maior[1]) : '—'} texto />
        <ResumoCard cor="#34d399" label="Média mensal (estimada)" valor={formatBRL(mediaMensal)} sub="projeção de 30 dias" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 bg-card border border-line2 rounded-[10px] px-3 py-[8px]">
          <Search size={15} className="text-dim2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar descrição…"
            className="bg-transparent text-[13px] text-tx outline-none placeholder:text-dim2 w-[150px]"
          />
        </div>
        <select
          value={filtroCat}
          onChange={(e) => setFiltroCat(e.target.value)}
          className="bg-card border border-line2 rounded-[10px] px-3 py-[9px] text-[13px] text-tx outline-none focus:border-pur"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setDrawerAberto(true)}
          className="inline-flex items-center gap-2 bg-card border border-line2 text-tx px-3 py-[9px] rounded-[10px] text-[13px] font-semibold hover:border-pur/60"
        >
          <FolderCog size={15} /> Categorias
        </button>
        <button
          onClick={() => setImportAberto(true)}
          className="inline-flex items-center gap-2 bg-card border border-line2 text-tx px-3 py-[9px] rounded-[10px] text-[13px] font-semibold hover:border-pur/60"
        >
          <Upload size={15} /> Importar CSV
        </button>
        <button
          onClick={abrirAdd}
          className="inline-flex items-center gap-2 text-white px-[14px] py-[9px] rounded-[10px] text-[13px] font-semibold bg-gradient-to-br from-pur3 to-pur"
        >
          <Plus size={15} /> Adicionar custo
        </button>
      </div>

      {/* Tabela / cards */}
      <div className="bg-card border border-line rounded-card overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="p-10 text-center text-dim">
            <Wallet size={28} className="mx-auto mb-3 text-dim2" />
            <div className="text-[14px] font-semibold text-tx mb-1">Nenhum custo neste período</div>
            <div className="text-[13px]">Adicione um custo, importe um CSV ou troque o período no topo.</div>
          </div>
        ) : (
          <>
            {/* Desktop: tabela */}
            <table className="w-full text-[13px] hidden md:table">
              <thead>
                <tr className="text-[9.5px] tracking-[0.12em] uppercase text-dim2">
                  <th className="text-left font-bold px-4 py-3 border-b border-line">Data</th>
                  <th className="text-left font-bold px-4 py-3 border-b border-line">Categoria</th>
                  <th className="text-left font-bold px-4 py-3 border-b border-line w-full">Descrição</th>
                  <th className="text-right font-bold px-4 py-3 border-b border-line">Valor</th>
                  <th className="text-left font-bold px-4 py-3 border-b border-line">Recorrência</th>
                  <th className="px-4 py-3 border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(({ c, valor }) => {
                  const cat = catMap.get(c.categoria_id ?? '');
                  return (
                    <tr key={c.id} className="hover:bg-card2 group">
                      <td className="px-4 py-3 border-b border-trilha mono text-dim whitespace-nowrap">{fmtData(c.data)}</td>
                      <td className="px-4 py-3 border-b border-trilha whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-[8px] h-[8px] rounded-full" style={{ background: cat?.cor ?? '#6b7280' }} />
                          <span className="text-tx2">{cat?.nome ?? 'Sem categoria'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-trilha text-tx2">{c.descricao}</td>
                      <td className="px-4 py-3 border-b border-trilha text-right mono font-semibold text-red whitespace-nowrap">
                        {formatBRL(valor)}
                        {c.recorrencia === 'mensal' && <div className="text-[10px] text-dim2 font-normal">de {formatBRL(Math.round(c.valor * 100))}/mês</div>}
                      </td>
                      <td className="px-4 py-3 border-b border-trilha">
                        {c.recorrencia === 'mensal' ? (
                          <span className="text-[10px] font-semibold rounded-md px-2 py-[3px] bg-pur/15 text-pur2">Mensal</span>
                        ) : (
                          <span className="text-[10px] font-semibold rounded-md px-2 py-[3px] bg-[#26262f] text-dim">Único</span>
                        )}
                      </td>
                      <td className="px-4 py-3 border-b border-trilha text-right whitespace-nowrap">
                        <button onClick={() => abrirEdit(c)} className="text-dim2 hover:text-blu p-1" title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setExcluir(c)} className="text-dim2 hover:text-red p-1 ml-1" title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile: cards empilhados */}
            <div className="md:hidden divide-y divide-[#22222b]">
              {filtrados.map(({ c, valor }) => {
                const cat = catMap.get(c.categoria_id ?? '');
                return (
                  <div key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] text-tx font-medium truncate">{c.descricao}</div>
                        <div className="flex items-center gap-2 mt-1 text-[11.5px] text-dim2">
                          <span className="w-[8px] h-[8px] rounded-full" style={{ background: cat?.cor ?? '#6b7280' }} />
                          {cat?.nome ?? 'Sem categoria'} · {fmtData(c.data)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="mono font-semibold text-red">{formatBRL(valor)}</div>
                        {c.recorrencia === 'mensal' && <div className="text-[10px] text-pur2 mt-0.5">Mensal</div>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => abrirEdit(c)} className="flex-1 inline-flex items-center justify-center gap-1 text-[12.5px] text-dim border border-line2 rounded-lg py-[7px]">
                        <Pencil size={14} /> Editar
                      </button>
                      <button onClick={() => setExcluir(c)} className="flex-1 inline-flex items-center justify-center gap-1 text-[12.5px] text-red border border-red/30 rounded-lg py-[7px]">
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <CustoModal aberto={modalAberto} onClose={() => setModalAberto(false)} editar={editar} />
      <ImportCsvModal aberto={importAberto} onClose={() => setImportAberto(false)} />
      <CategoriasDrawer aberto={drawerAberto} onClose={() => setDrawerAberto(false)} />
      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir custo?"
        mensagem={excluir ? `"${excluir.descricao}" será removido permanentemente.` : ''}
        onConfirmar={() => {
          if (excluir) deleteCusto(excluir.id);
          setExcluir(null);
        }}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}

function ResumoCard({ cor, label, valor, sub, texto = false }: { cor: string; label: string; valor: string; sub: string; texto?: boolean }) {
  return (
    <div className="bg-card border border-line rounded-kpi px-4 py-[15px]">
      <div className="text-[11px] text-dim font-medium mb-[6px]">{label}</div>
      <div className={`font-extrabold tracking-tight ${texto ? 'text-[16px]' : 'mono text-[22px]'}`} style={{ color: cor }}>
        {valor}
      </div>
      <div className="text-[10.5px] text-dim2 mt-[4px]">{sub}</div>
    </div>
  );
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
