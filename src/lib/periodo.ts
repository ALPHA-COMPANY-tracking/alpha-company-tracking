// ─────────────────────────────────────────────────────────────
// Presets do seletor de período. Todos retornam Periodo inclusivo.
// ─────────────────────────────────────────────────────────────

import type { IsoDate, Periodo } from '@/types';
import { addDias, hojeIso, parseYmd, primeiroDiaMes, ultimoDiaMes } from '@/lib/dates';

export type PresetPeriodo = 'hoje' | '7d' | '30d' | 'mes_atual' | 'mes_passado' | 'personalizado';

export const PRESETS: { id: PresetPeriodo; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'mes_atual', label: 'Mês atual' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'personalizado', label: 'Personalizado' },
];

export function periodoDoPreset(preset: PresetPeriodo, hoje: IsoDate = hojeIso()): Periodo {
  const { y, m } = parseYmd(hoje);
  switch (preset) {
    case 'hoje':
      return { inicio: hoje, fim: hoje };
    case '7d':
      return { inicio: addDias(hoje, -6), fim: hoje };
    case '30d':
      return { inicio: addDias(hoje, -29), fim: hoje };
    case 'mes_atual':
      return { inicio: primeiroDiaMes(y, m), fim: hoje };
    case 'mes_passado': {
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      return { inicio: primeiroDiaMes(py, pm), fim: ultimoDiaMes(py, pm) };
    }
    case 'personalizado':
      // fallback: últimos 30 dias; o usuário escolhe as datas na UI
      return { inicio: addDias(hoje, -29), fim: hoje };
  }
}
