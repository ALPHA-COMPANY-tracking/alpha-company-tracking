import { useMemo, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { formatBRL, reaisToCents } from '@/lib/money';
import { type LinhaImport, parseCsvCustos } from '@/lib/csv';
import { useData } from '@/store/DataProvider';

// Usa ';' como separador (padrão do Excel BR) para não conflitar com
// a vírgula decimal de valores como 60,00.
const EXEMPLO = `data;categoria;descricao;valor
2026-08-20;Chips / Números WhatsApp;Chip novo;60,00
20/08/2026;Ferramentas e SaaS;Assinatura design;199,00`;

export function ImportCsvModal({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { categorias, importarCustos } = useData();
  const [texto, setTexto] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const linhas: LinhaImport[] = useMemo(
    () => (texto.trim() ? parseCsvCustos(texto, categorias) : []),
    [texto, categorias],
  );
  const validas = linhas.filter((l) => l.ok);
  const invalidas = linhas.filter((l) => !l.ok);

  if (!aberto) return null;

  function lerArquivo(f: File) {
    const reader = new FileReader();
    reader.onload = () => setTexto(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  function importar() {
    const custos = validas.map((l) => l.custo!).filter(Boolean);
    if (custos.length === 0) return;
    importarCustos(custos);
    setTexto('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-[560px] bg-card border border-line2 rounded-card overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="m-0 text-[15px] font-bold">Importar custos (CSV)</h3>
          <button onClick={onClose} className="text-dim2 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <div className="text-[12.5px] text-dim">
            Colunas: <span className="mono text-pur2">data; categoria; descrição; valor</span>. Separe por
            <span className="mono"> ;</span> (padrão do Excel BR). Datas em <span className="mono">AAAA-MM-DD</span> ou
            <span className="mono"> DD/MM/AAAA</span>; valores como <span className="mono">1.234,56</span>.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-tx border border-line2 rounded-[10px] px-3 py-2 hover:border-pur/60"
            >
              <Upload size={15} /> Escolher arquivo
            </button>
            <button
              onClick={() => setTexto(EXEMPLO)}
              className="text-[12.5px] text-dim2 hover:text-dim underline underline-offset-2"
            >
              usar exemplo
            </button>
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={EXEMPLO}
            rows={6}
            className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-2 text-tx text-[12.5px] mono outline-none focus:border-pur placeholder:text-dim2 resize-y"
          />

          {linhas.length > 0 && (
            <div className="rounded-[10px] border border-line2 overflow-hidden">
              <div className="px-3 py-2 bg-card2 text-[12px] flex gap-4 border-b border-line">
                <span className="text-grn">{validas.length} válidas</span>
                {invalidas.length > 0 && <span className="text-red">{invalidas.length} com erro</span>}
                <span className="text-dim2 ml-auto">
                  Total: {formatBRL(validas.reduce((a, l) => a + reaisToCents(l.custo!.valor), 0))}
                </span>
              </div>
              <div className="max-h-[180px] overflow-y-auto">
                {linhas.map((l, i) => (
                  <div
                    key={i}
                    className={`px-3 py-[7px] text-[11.5px] flex items-center justify-between border-b border-trilha last:border-b-0 ${
                      l.ok ? 'text-dim' : 'text-red bg-red/[0.05]'
                    }`}
                  >
                    <span className="truncate mono">{l.ok ? `${l.custo!.data} · ${l.custo!.descricao}` : l.original}</span>
                    <span className="shrink-0 ml-3 mono">{l.ok ? formatBRL(reaisToCents(l.custo!.valor)) : l.erro}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-dim border border-line2 hover:text-tx">
            Cancelar
          </button>
          <button
            onClick={importar}
            disabled={validas.length === 0}
            className="px-4 py-[9px] rounded-[10px] text-[13px] font-semibold text-white bg-gradient-to-br from-pur3 to-pur disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Importar {validas.length > 0 ? validas.length : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
