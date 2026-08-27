import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useData } from '@/store/DataProvider';

const CORES = ['#a855f7', '#c084fc', '#f472b6', '#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf', '#94a3b8', '#6b7280'];

export function CategoriasDrawer({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { categorias, addCategoria, updateCategoria } = useData();
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(CORES[0]);

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
          {categorias.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 px-2 py-[7px] rounded-[10px] hover:bg-card2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.cor ?? '#a855f7' }} />
              <input
                value={cat.nome}
                onChange={(e) => updateCategoria(cat.id, { nome: e.target.value })}
                className={`flex-1 bg-transparent text-[13px] outline-none border-b border-transparent focus:border-line2 ${
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
                <span className="w-[29px] h-4 rounded-full bg-[#2f2f3b] relative transition-colors peer-checked:bg-grn/70 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:w-[11px] after:h-[11px] after:rounded-full after:bg-[#75758a] after:transition-all peer-checked:after:left-[15px] peer-checked:after:bg-white" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
