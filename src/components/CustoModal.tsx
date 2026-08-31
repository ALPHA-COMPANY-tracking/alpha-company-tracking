import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CustoVariavel } from '@/types';
import { hojeIso } from '@/lib/dates';
import { reaisToCents } from '@/lib/money';
import { useData } from '@/store/DataProvider';
import { MoneyInput } from '@/components/MoneyInput';

type Rascunho = Omit<CustoVariavel, 'id'>;

function vazio(): { data: string; categoria_id: string; descricao: string; cents: number; mensal: boolean; observacao: string } {
  return { data: hojeIso(), categoria_id: '', descricao: '', cents: 0, mensal: false, observacao: '' };
}

export function CustoModal({
  aberto,
  onClose,
  editar,
}: {
  aberto: boolean;
  onClose: () => void;
  editar?: CustoVariavel | null;
}) {
  const { categorias, addCusto, updateCusto } = useData();
  const [form, setForm] = useState(vazio());
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    if (editar) {
      setForm({
        data: editar.data,
        categoria_id: editar.categoria_id ?? '',
        descricao: editar.descricao,
        cents: reaisToCents(editar.valor),
        mensal: editar.recorrencia === 'mensal',
        observacao: editar.observacao ?? '',
      });
    } else {
      setForm((f) => ({ ...vazio(), categoria_id: f.categoria_id || categorias[0]?.id || '' }));
    }
    setErro('');
  }, [aberto, editar, categorias]);

  if (!aberto) return null;

  function montar(): Rascunho | null {
    if (!form.descricao.trim()) {
      setErro('Descreva o custo.');
      return null;
    }
    if (form.cents <= 0) {
      setErro('Informe um valor maior que zero.');
      return null;
    }
    return {
      data: form.data,
      categoria_id: form.categoria_id || null,
      descricao: form.descricao.trim(),
      valor: form.cents / 100,
      recorrencia: form.mensal ? 'mensal' : 'unico',
      recorrencia_fim: null,
      ratear_por_dias: true,
      observacao: form.observacao.trim() || null,
    };
  }

  function salvar(fechar: boolean) {
    const r = montar();
    if (!r) return;
    if (editar) updateCusto(editar.id, r);
    else addCusto(r);
    if (fechar) onClose();
    else setForm((f) => ({ ...vazio(), categoria_id: f.categoria_id, data: f.data })); // salvar e adicionar outro
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] bg-card border border-line2 rounded-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="m-0 text-[15px] font-bold">{editar ? 'Editar custo' : 'Adicionar custo'}</h3>
          <button onClick={onClose} className="text-dim2 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Data">
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur "
              />
            </Campo>
            <Campo label="Valor">
              <MoneyInput cents={form.cents} onChange={(c) => setForm({ ...form, cents: c })} autoFocus />
            </Campo>
          </div>

          <Campo label="Categoria">
            <select
              value={form.categoria_id}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur"
            >
              {categorias
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </Campo>

          <Campo label="Descrição">
            <input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex.: Chip novo, UGC criador A…"
              className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur placeholder:text-dim2"
            />
          </Campo>

          <label className="flex items-center gap-[9px] text-[12.5px] text-dim cursor-pointer select-none">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.mensal}
              onChange={(e) => setForm({ ...form, mensal: e.target.checked })}
            />
            <span className="w-[29px] h-4 rounded-full bg-line2 relative transition-colors peer-checked:bg-pur3 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:w-[11px] after:h-[11px] after:rounded-full after:bg-dim2 after:transition-all peer-checked:after:left-[15px] peer-checked:after:bg-white" />
            Repete todo mês (rateia pelos dias do período)
          </label>

          <Campo label="Observação (opcional)">
            <input
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx text-[13px] outline-none focus:border-pur"
            />
          </Campo>

          {erro && <div className="text-red text-[12px]">{erro}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
          {!editar && (
            <button
              onClick={() => salvar(false)}
              className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-pur2 border border-line2 hover:bg-[#20182e]"
            >
              Salvar e adicionar outro
            </button>
          )}
          <button
            onClick={() => salvar(true)}
            className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-white bg-gradient-to-br from-pur3 to-pur"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-dim2 font-medium mb-[6px] uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
