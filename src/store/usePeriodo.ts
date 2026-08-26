// Estado do seletor de período, persistido em localStorage.
import { useCallback, useEffect, useState } from 'react';
import type { Periodo } from '@/types';
import { hojeIso } from '@/lib/dates';
import { type PresetPeriodo, periodoDoPreset } from '@/lib/periodo';

const KEY = 'afterpay-pnl:periodo';

interface Estado {
  preset: PresetPeriodo;
  periodo: Periodo;
}

function inicial(): Estado {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Estado;
      if (p.preset && p.periodo?.inicio && p.periodo?.fim) return p;
    }
  } catch {
    /* ignora */
  }
  return { preset: '30d', periodo: periodoDoPreset('30d') };
}

export function usePeriodo() {
  const [estado, setEstado] = useState<Estado>(inicial);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(estado));
    } catch {
      /* ignora */
    }
  }, [estado]);

  const selecionarPreset = useCallback((preset: PresetPeriodo) => {
    if (preset === 'personalizado') {
      setEstado((e) => ({ preset, periodo: e.periodo }));
      return;
    }
    setEstado({ preset, periodo: periodoDoPreset(preset, hojeIso()) });
  }, []);

  const definirPersonalizado = useCallback((periodo: Periodo) => {
    setEstado({ preset: 'personalizado', periodo });
  }, []);

  return {
    preset: estado.preset,
    periodo: estado.periodo,
    selecionarPreset,
    definirPersonalizado,
  };
}
