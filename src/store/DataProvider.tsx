// ─────────────────────────────────────────────────────────────
// Store React (Context). Carrega o dataset local uma vez, mantém
// em memória e persiste a cada mudança. Mutations são otimistas:
// o estado muda na hora e o total no topo reflete imediatamente.
// ─────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AfterpayDaily, AtendenteStat, CategoriaCusto, CustoVariavel, PlataformaStat } from '@/types';
import { type Dataset, carregar, novoId, resetar, salvar } from '@/data/db';

interface DataContextValue {
  categorias: CategoriaCusto[];
  dailies: AfterpayDaily[];
  custos: CustoVariavel[];
  atendentes: AtendenteStat[];
  plataformas: PlataformaStat[];
  ultimoSync: string | null;

  addCusto: (input: Omit<CustoVariavel, 'id'>) => CustoVariavel;
  updateCusto: (id: string, patch: Partial<Omit<CustoVariavel, 'id'>>) => void;
  deleteCusto: (id: string) => void;
  importarCustos: (inputs: Omit<CustoVariavel, 'id'>[]) => number;

  addCategoria: (input: Omit<CategoriaCusto, 'id'>) => CategoriaCusto;
  updateCategoria: (id: string, patch: Partial<Omit<CategoriaCusto, 'id'>>) => void;

  /** Upsert de um dia (modo manual e futura sincronização). */
  lancarDaily: (daily: AfterpayDaily) => void;
  marcarSync: () => void;
  restaurarExemplo: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(() => carregar());
  const primeiraRender = useRef(true);

  // Persiste sempre que o dataset muda (menos no load inicial).
  useEffect(() => {
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    salvar(data);
  }, [data]);

  const addCusto = useCallback<DataContextValue['addCusto']>((input) => {
    const novo: CustoVariavel = { ...input, id: novoId() };
    setData((d) => ({ ...d, custos: [novo, ...d.custos] }));
    return novo;
  }, []);

  const updateCusto = useCallback<DataContextValue['updateCusto']>((id, patch) => {
    setData((d) => ({
      ...d,
      custos: d.custos.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const deleteCusto = useCallback<DataContextValue['deleteCusto']>((id) => {
    setData((d) => ({ ...d, custos: d.custos.filter((c) => c.id !== id) }));
  }, []);

  const importarCustos = useCallback<DataContextValue['importarCustos']>((inputs) => {
    const novos = inputs.map((i) => ({ ...i, id: novoId() }));
    setData((d) => ({ ...d, custos: [...novos, ...d.custos] }));
    return novos.length;
  }, []);

  const addCategoria = useCallback<DataContextValue['addCategoria']>((input) => {
    const nova: CategoriaCusto = { ...input, id: novoId() };
    setData((d) => ({ ...d, categorias: [...d.categorias, nova] }));
    return nova;
  }, []);

  const updateCategoria = useCallback<DataContextValue['updateCategoria']>((id, patch) => {
    setData((d) => ({
      ...d,
      categorias: d.categorias.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const lancarDaily = useCallback<DataContextValue['lancarDaily']>((daily) => {
    setData((d) => {
      const outros = d.dailies.filter((x) => x.data !== daily.data);
      return { ...d, dailies: [...outros, daily].sort((a, b) => a.data.localeCompare(b.data)) };
    });
  }, []);

  const marcarSync = useCallback(() => {
    setData((d) => ({ ...d, ultimoSync: new Date().toISOString() }));
  }, []);

  const restaurarExemplo = useCallback(() => {
    setData(resetar());
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      categorias: data.categorias,
      dailies: data.dailies,
      custos: data.custos,
      atendentes: data.atendentes,
      plataformas: data.plataformas,
      ultimoSync: data.ultimoSync,
      addCusto,
      updateCusto,
      deleteCusto,
      importarCustos,
      addCategoria,
      updateCategoria,
      lancarDaily,
      marcarSync,
      restaurarExemplo,
    }),
    [
      data,
      addCusto,
      updateCusto,
      deleteCusto,
      importarCustos,
      addCategoria,
      updateCategoria,
      lancarDaily,
      marcarSync,
      restaurarExemplo,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData precisa estar dentro de <DataProvider>');
  return ctx;
}
