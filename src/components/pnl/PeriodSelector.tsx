import { CalendarDays } from 'lucide-react';
import type { Periodo } from '@/types';
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
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-grn tracking-[0.14em] mr-0.5">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-grn opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-grn" />
        </span>
        AO VIVO
      </span>

      <div className="flex items-center gap-1 bg-card border border-line2 rounded-full p-1 overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((p) => {
          const ativo = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              className={`inline-flex items-center gap-1.5 px-[16px] py-[8px] rounded-full text-[13.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                ativo ? 'bg-tx text-[#141419]' : 'text-dim hover:text-tx'
              }`}
            >
              {p.id === 'personalizado' && <CalendarDays size={13} />}
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === 'personalizado' && (
        <div className="inline-flex items-center gap-2 bg-card border border-line2 rounded-full px-3 py-[7px]">
          <input
            type="date"
            value={periodo.inicio}
            max={periodo.fim}
            onChange={(e) => onCustom({ ...periodo, inicio: e.target.value })}
            className="bg-transparent text-[12.5px] text-tx outline-none [color-scheme:dark]"
          />
          <span className="text-dim2 text-xs">→</span>
          <input
            type="date"
            value={periodo.fim}
            min={periodo.inicio}
            onChange={(e) => onCustom({ ...periodo, fim: e.target.value })}
            className="bg-transparent text-[12.5px] text-tx outline-none [color-scheme:dark]"
          />
        </div>
      )}
    </div>
  );
}
