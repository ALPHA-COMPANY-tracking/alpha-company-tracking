// ─────────────────────────────────────────────────────────────
// Persistência local (localStorage). Camada isolada: na Etapa 7
// trocamos esta implementação pelo Supabase mantendo a mesma API.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, AtendenteStat, CategoriaCusto, CustoVariavel, Pedido, PlataformaStat } from '@/types';
import {
  SEED_CATEGORIAS,
  gerarCustos,
  gerarDailies,
} from '@/data/seed';

const KEY = 'afterpay-pnl:v1';

export interface Dataset {
  categorias: CategoriaCusto[];
  dailies: AfterpayDaily[];
  custos: CustoVariavel[];
  atendentes: AtendenteStat[];
  plataformas: PlataformaStat[];
  pedidos: Pedido[];
  ultimoSync: string | null;
}

function seedInicial(): Dataset {
  return {
    categorias: SEED_CATEGORIAS,
    dailies: gerarDailies(),
    custos: gerarCustos(),
    atendentes: [],
    plataformas: [],
    pedidos: [],
    ultimoSync: null,
  };
}

export function carregar(): Dataset {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seed = seedInicial();
      salvar(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<Dataset>;
    return {
      categorias: parsed.categorias ?? SEED_CATEGORIAS,
      dailies: parsed.dailies ?? [],
      custos: parsed.custos ?? [],
      atendentes: parsed.atendentes ?? [],
      plataformas: parsed.plataformas ?? [],
      pedidos: parsed.pedidos ?? [],
      ultimoSync: parsed.ultimoSync ?? null,
    };
  } catch {
    return seedInicial();
  }
}

export function salvar(data: Dataset): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage cheio/indisponível — ignora (dados seguem em memória)
  }
}

/** Reseta para a semente (usado em "restaurar exemplo"). */
export function resetar(): Dataset {
  const seed = seedInicial();
  salvar(seed);
  return seed;
}

export function novoId(): string {
  return crypto.randomUUID();
}
