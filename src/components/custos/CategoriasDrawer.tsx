import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useData } from '@/store/DataProvider';

const CORES = ['#a855f7', '#c084fc', '#f472b6', '#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf', '#94a3b8', '#6b7280'];

export function CategoriasDrawer({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { categorias, custos, addCategoria, updateCategoria, deleteCategoria } = useData();
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(CORES[0]);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  /** Quantos lançamentos usam esta categoria (ficarão "Sem categoria"). */
  const usos = (id: string) => custos.filter((c) => c.categoria_id === id).length;

  function excluir(id: string) {
    deleteCategoria(id);
    setConfirmar(null);
  }

  function criar() {
    if (!novoNome.trim()) return;
    addCategoria({
      nome: novoNome.trim(),
      cor: novaCor,
      icone: 'ellipsis',
      ativo: true,
      ordem: categorias.length,
    });
    setNovoNome('');
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${aberto ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-[400px] bg-card border-l border-line2 flex flex-col transition-transform ${
          aberto ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h3 className="m-0 text-[15px] font-bold">Gerenciar categorias</h3>
          <button onClick={onClose} className="text-dim2 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 border-b border-line shrink-0">
          <div className="text-[11px] text-dim2 font-medium mb-2 uppercase tracking-wide">Nova categoria</div>
          <div className="flex gap-2 mb-2">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criar()}
              placeholder="Nome da categoria"
              className="flex-1 bg-card2 border border-line2 rounded-[10px] px-3 py-2 text-tx text-[13px] outline-none focus:border-pur placeholder:text-dim2"
            />
            <button
              onClick={criar}
              className="inline-flex items-center gap-1 px-3 rounded-[10px] text-white text-[13px] font-semibold bg-gradient-to-br from-pur3 to-pur"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {CORES.map((c) => (
              <button
                key={c}
                onClick={() => setNovaCor(c)}
                className={`w-5 h-5 rounded-full transition-transform ${novaCor === c ? 'ring-2 ring-white/70 scale-110' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {categorias.map((cat) => {
            const n = usos(cat.id);
            if (confirmar === cat.id) {
              return (
                <div key={cat.id} className="px-3 py-[10px] rounded-[10px] border border-red/40 bg-red/[0.07] mb-1">
                  <div className="text-[12.5px] text-tx font-semibold mb-1">Excluir “{cat.nome}”?</div>
                  <div className="text-[11.5px] text-dim mb-[10px]">
                    {n > 0
                      ? `${n} lançamento${n > 1 ? 's' : ''} ficará${n > 1 ? 'ão' : ''} sem categoria (o valor continua no P&L).`
                      : 'Nenhum lançamento usa esta categoria.'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => excluir(cat.id)}
                      className="px-3 py-[6px] rounded-lg text-[12px] font-semibold text-white bg-red/80 hover:bg-red"
                    >
                      Excluir
                    </button>
                    <button
                      onClick={() => setConfirmar(null)}
                      className="px-3 py-[6px] rounded-lg text-[12px] font-semibold text-dim border border-line2 hover:text-tx"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={cat.id} className="group flex items-center gap-2 px-2 py-[7px] rounded-[10px] hover:bg-card2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.cor ?? '#a855f7' }} />
                <input
                  value={cat.nome}
                  onChange={(e) => updateCategoria(cat.id, { nome: e.target.value })}
                  className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none border-b border-transparent focus:border-line2 ${
                    cat.ativo ? 'text-tx' : 'text-dim2 line-through'
                  }`}
                />
                <label className="inline-flex items-center cursor-pointer shrink-0" title={cat.ativo ? 'Ativa' : 'Desativada'}>
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={cat.ativo}
                    onChange={(e) => updateCategoria(cat.id, { ativo: e.target.checked })}
                  />
                  <span className="w-[29px] h-4 rounded-full bg-line2 relative transition-colors peer-checked:bg-grn/70 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:w-[11px] after:h-[11px] after:rounded-full after:bg-dim2 after:transition-all peer-checked:after:left-[15px] peer-checked:after:bg-white" />
                </label>
                <button
                  onClick={() => setConfirmar(cat.id)}
                  title="Excluir categoria"
                  className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-dim2 hover:text-red hover:bg-red/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
