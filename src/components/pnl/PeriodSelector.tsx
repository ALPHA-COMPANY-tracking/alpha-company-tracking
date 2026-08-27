import type { Periodo } from '@/types';
import { formatDiaMes } from '@/lib/dates';
import { PRESETS, type PresetPeriodo } from '@/lib/periodo';

export function PeriodSelector({
  preset,
  periodo,
  onPreset,
  onCustom,
}: {
  preset: PresetPeriodo;
  periodo: Periodo;
  onPreset: (p: PresetPeriodo) => void;
  onCustom: (p: Periodo) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap max-w-full">
      <div className="flex items-center gap-1 bg-card border border-line2 rounded-[10px] p-1 overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((p) => {
          const ativo = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              className={`px-[11px] py-[6px] rounded-lg text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                ativo ? 'bg-pur3 text-white' : 'text-dim hover:text-tx'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === 'personalizado' ? (
        <div className="inline-flex items-center gap-2 bg-card border border-line2 rounded-[10px] px-3 py-[7px]">
          <input
            type="date"
            value={periodo.inicio}
            max={periodo.fim}
            onChange={(e) => onCustom({ ...periodo, inicio: e.target.value })}
            className="bg-transparent text-[12.5px] text-tx outline-none [color-scheme:dark]"
          />
          <span className="text-dim2 text-xs">até</span>
          <input
            type="date"
            value={periodo.fim}
            min={periodo.inicio}
            onChange={(e) => onCustom({ ...periodo, fim: e.target.value })}
            className="bg-transparent text-[12.5px] text-tx outline-none [color-scheme:dark]"
          />
        </div>
      ) : (
        <span className="text-[12.5px] text-dim2 mono">
          {formatDiaMes(periodo.inicio)} – {formatDiaMes(periodo.fim)}
        </span>
      )}
    </div>
  );
}
