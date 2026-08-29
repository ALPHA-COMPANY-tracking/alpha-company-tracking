// ─────────────────────────────────────────────────────────────
// Store React (Context). Carrega o dataset via Backend (Local ou
// Supabase), mantém estado otimista e persiste cada mudança. Em
// erro de persistência, re-sincroniza a partir do backend.
// ─────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { AfterpayDaily, AtendenteStat, CategoriaCusto, CustoVariavel, Pedido, PlataformaStat } from '@/types';
import { type Dataset, novoId } from '@/data/db';
import { type Backend, LocalBackend } from '@/data/backend';

interface DataContextValue {
  categorias: CategoriaCusto[];
  dailies: AfterpayDaily[];
  custos: CustoVariavel[];
  atendentes: AtendenteStat[];
  plataformas: PlataformaStat[];
  pedidos: Pedido[];
  ultimoSync: string | null;

  addCusto: (input: Omit<CustoVariavel, 'id'>) => CustoVariavel;
  updateCusto: (id: string, patch: Partial<Omit<CustoVariavel, 'id'>>) => void;
  deleteCusto: (id: string) => void;
  importarCustos: (inputs: Omit<CustoVariavel, 'id'>[]) => number;

  addCategoria: (input: Omit<CategoriaCusto, 'id'>) => CategoriaCusto;
  updateCategoria: (id: string, patch: Partial<Omit<CategoriaCusto, 'id'>>) => void;
  /** Remove a categoria; os lançamentos ficam sem categoria (não são apagados). */
  deleteCategoria: (id: string) => void;

  /** Ajusta a perda real de um frustrado; null volta ao cálculo automático. */
  definirPerdaPedido: (id: string, perda: number | null) => void;
  lancarDaily: (daily: AfterpayDaily) => void;
  lancarDailies: (dailies: AfterpayDaily[]) => void;
  marcarSync: () => void;
  /** Re-busca todos os dados do backend (botão Atualizar). */
  recarregar: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const backendLocalPadrao = new LocalBackend();

export function DataProvider({ backend = backendLocalPadrao, children }: { backend?: Backend; children: ReactNode }) {
  const [data, setData] = useState<Dataset | null>(null);
  const backendRef = useRef(backend);
  backendRef.current = backend;

  const resync = useCallback(() => {
    backendRef.current
      .load()
      .then(setData)
      .catch((e) => console.error('Falha ao carregar dados:', e));
  }, []);

  useEffect(() => {
    let vivo = true;
    // Não zera o estado aqui: se o backend for recriado (ex.: renovação de
    // token), a tela ficaria vazia até a recarga terminar.
    backend
      .load()
      .then((ds) => vivo && setData(ds))
      .catch((e) => console.error('Falha ao carregar dados:', e));
    return () => {
      vivo = false;
    };
  }, [backend]);

  // Aplica mudança otimista no estado e persiste no backend.
  const aplicar = useCallback(
    (otimista: (ds: Dataset) => Dataset, persistir: (b: Backend) => Promise<void>) => {
      setData((d) => (d ? otimista(d) : d));
      persistir(backendRef.current).catch((e) => {
        console.error('Falha ao salvar, re-sincronizando:', e);
        resync();
      });
    },
    [resync],
  );

  const addCusto = useCallback<DataContextValue['addCusto']>(
    (input) => {
      const novo: CustoVariavel = { ...input, id: novoId() };
      aplicar(
        (d) => ({ ...d, custos: [novo, ...d.custos] }),
        (b) => b.addCusto(novo),
      );
      return novo;
    },
    [aplicar],
  );

  const updateCusto = useCallback<DataContextValue['updateCusto']>(
    (id, patch) => {
      aplicar(
        (d) => ({ ...d, custos: d.custos.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
        (b) => b.updateCusto(id, patch),
      );
    },
    [aplicar],
  );

  const deleteCusto = useCallback<DataContextValue['deleteCusto']>(
    (id) => {
      aplicar(
        (d) => ({ ...d, custos: d.custos.filter((c) => c.id !== id) }),
        (b) => b.deleteCusto(id),
      );
    },
    [aplicar],
  );

  const importarCustos = useCallback<DataContextValue['importarCustos']>(
    (inputs) => {
      const novos = inputs.map((i) => ({ ...i, id: novoId() }));
      aplicar(
        (d) => ({ ...d, custos: [...novos, ...d.custos] }),
        (b) => b.importarCustos(novos),
      );
      return novos.length;
    },
    [aplicar],
  );

  const addCategoria = useCallback<DataContextValue['addCategoria']>(
    (input) => {
      const nova: CategoriaCusto = { ...input, id: novoId() };
      aplicar(
        (d) => ({ ...d, categorias: [...d.categorias, nova] }),
        (b) => b.addCategoria(nova),
      );
      return nova;
    },
    [aplicar],
  );

  const updateCategoria = useCallback<DataContextValue['updateCategoria']>(
    (id, patch) => {
      aplicar(
        (d) => ({ ...d, categorias: d.categorias.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
        (b) => b.updateCategoria(id, patch),
      );
    },
    [aplicar],
  );

  const deleteCategoria = useCallback<DataContextValue['deleteCategoria']>(
    (id) => {
      aplicar(
        (d) => ({
          ...d,
          categorias: d.categorias.filter((c) => c.id !== id),
          custos: d.custos.map((c) => (c.categoria_id === id ? { ...c, categoria_id: null } : c)),
        }),
        (b) => b.deleteCategoria(id),
      );
    },
    [aplicar],
  );

  const definirPerdaPedido = useCallback<DataContextValue['definirPerdaPedido']>(
    (id, perda) => {
      aplicar(
        (d) => ({ ...d, pedidos: d.pedidos.map((p) => (p.id === id ? { ...p, perda_real: perda } : p)) }),
        (b) => b.definirPerdaPedido(id, perda),
      );
    },
    [aplicar],
  );

  const lancarDaily = useCallback<DataContextValue['lancarDaily']>(
    (daily) => {
      aplicar(
        (d) => {
          const outros = d.dailies.filter((x) => x.data !== daily.data);
          return { ...d, dailies: [...outros, daily].sort((a, b) => a.data.localeCompare(b.data)) };
        },
        (b) => b.lancarDaily(daily),
      );
    },
    [aplicar],
  );

  const lancarDailies = useCallback<DataContextValue['lancarDailies']>(
    (arr) => {
      aplicar(
        (d) => {
          const datas = new Set(arr.map((x) => x.data));
          const outros = d.dailies.filter((x) => !datas.has(x.data));
          return { ...d, dailies: [...outros, ...arr].sort((a, b) => a.data.localeCompare(b.data)) };
        },
        (b) => b.lancarDailies(arr),
      );
    },
    [aplicar],
  );

  const marcarSync = useCallback(() => {
    const iso = new Date().toISOString();
    aplicar(
      (d) => ({ ...d, ultimoSync: iso }),
      (b) => b.marcarSync(iso),
    );
  }, [aplicar]);

  const recarregar = useCallback<DataContextValue['recarregar']>(async () => {
    try {
      const ds = await backendRef.current.load();
      setData({ ...ds, ultimoSync: new Date().toISOString() });
    } catch (e) {
      console.error('Falha ao atualizar:', e);
    }
  }, []);

  const value = useMemo<DataContextValue | null>(() => {
    if (!data) return null;
    return {
      categorias: data.categorias,
      dailies: data.dailies,
      custos: data.custos,
      atendentes: data.atendentes,
      plataformas: data.plataformas,
      pedidos: data.pedidos,
      ultimoSync: data.ultimoSync,
      addCusto,
      updateCusto,
      deleteCusto,
      importarCustos,
      addCategoria,
      updateCategoria,
      deleteCategoria,
      definirPerdaPedido,
      lancarDaily,
      lancarDailies,
      marcarSync,
      recarregar,
    };
  }, [data, addCusto, updateCusto, deleteCusto, importarCustos, addCategoria, updateCategoria, deleteCategoria, definirPerdaPedido, lancarDaily, lancarDailies, marcarSync, recarregar]);

  if (!value) {
    return (
      <div className="min-h-screen grid place-items-center text-dim">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin" size={20} /> Carregando…
        </div>
      </div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData precisa estar dentro de <DataProvider>');
  return ctx;
}
