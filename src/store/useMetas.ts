// Metas da operação editadas na tela Indicadores — guardadas neste
// navegador, como a meta diária e a meta de lucro do mês.
import { useCallback, useState } from 'react';
import { type Metas, METAS, normalizarMetas } from '@/lib/metasOperacao';

const KEY = 'afterpay-pnl:metas-operacao';

function ler(): Metas {
  try {
    return normalizarMetas(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return METAS;
  }
}

export function useMetas(): [Metas, (m: Metas) => void, () => void] {
  const [metas, setMetas] = useState<Metas>(ler);
  const salvar = useCallback((m: Metas) => {
    const certas = normalizarMetas(m);
    setMetas(certas);
    try {
      localStorage.setItem(KEY, JSON.stringify(certas));
    } catch {
      // Sem armazenamento (aba anônima): vale só enquanto a página estiver aberta.
    }
  }, []);
  const restaurar = useCallback(() => {
    setMetas(METAS);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // idem
    }
  }, []);
  return [metas, salvar, restaurar];
}
