// ─────────────────────────────────────────────────────────────
// Abstração de persistência. O DataProvider fala só com esta
// interface; trocar Local ↔ Supabase não toca nas telas.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CategoriaCusto, CustoVariavel } from '@/types';
import { type Dataset, carregar, salvar } from '@/data/db';

export interface Backend {
  load(): Promise<Dataset>;
  addCusto(c: CustoVariavel): Promise<void>;
  updateCusto(id: string, patch: Partial<CustoVariavel>): Promise<void>;
  deleteCusto(id: string): Promise<void>;
  importarCustos(cs: CustoVariavel[]): Promise<void>;
  addCategoria(c: CategoriaCusto): Promise<void>;
  updateCategoria(id: string, patch: Partial<CategoriaCusto>): Promise<void>;
  deleteCategoria(id: string): Promise<void>;
  /** Ajusta a perda real de um pedido frustrado (null = voltar ao cálculo). */
  definirPerdaPedido(id: string, perda: number | null): Promise<void>;
  /** Taxa de plataforma cobrada neste pagamento (null = não informada). */
  definirTaxaPedido(id: string, taxa: number | null): Promise<void>;
  lancarDaily(d: AfterpayDaily): Promise<void>;
  lancarDailies(ds: AfterpayDaily[]): Promise<void>;
  marcarSync(iso: string): Promise<void>;
}

/** Backend local: localStorage. Fonte da verdade é o próprio storage. */
export class LocalBackend implements Backend {
  async load(): Promise<Dataset> {
    return carregar();
  }
  private mut(fn: (ds: Dataset) => Dataset) {
    salvar(fn(carregar()));
  }
  async addCusto(c: CustoVariavel) {
    this.mut((ds) => ({ ...ds, custos: [c, ...ds.custos] }));
  }
  async updateCusto(id: string, patch: Partial<CustoVariavel>) {
    this.mut((ds) => ({ ...ds, custos: ds.custos.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }
  async deleteCusto(id: string) {
    this.mut((ds) => ({ ...ds, custos: ds.custos.filter((x) => x.id !== id) }));
  }
  async importarCustos(cs: CustoVariavel[]) {
    this.mut((ds) => ({ ...ds, custos: [...cs, ...ds.custos] }));
  }
  async addCategoria(c: CategoriaCusto) {
    this.mut((ds) => ({ ...ds, categorias: [...ds.categorias, c] }));
  }
  async updateCategoria(id: string, patch: Partial<CategoriaCusto>) {
    this.mut((ds) => ({ ...ds, categorias: ds.categorias.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }
  async deleteCategoria(id: string) {
    // Os lançamentos são preservados: ficam sem categoria (como no banco,
    // onde a referência é `on delete set null`).
    this.mut((ds) => ({
      ...ds,
      categorias: ds.categorias.filter((x) => x.id !== id),
      custos: ds.custos.map((c) => (c.categoria_id === id ? { ...c, categoria_id: null } : c)),
    }));
  }
  async definirPerdaPedido(id: string, perda: number | null) {
    this.mut((ds) => ({
      ...ds,
      pedidos: ds.pedidos.map((p) => (p.id === id ? { ...p, perda_real: perda } : p)),
    }));
  }
  async definirTaxaPedido(id: string, taxa: number | null) {
    this.mut((ds) => ({
      ...ds,
      pedidos: ds.pedidos.map((p) => (p.id === id ? { ...p, taxa_plataforma: taxa } : p)),
    }));
  }
  async lancarDaily(d: AfterpayDaily) {
    this.mut((ds) => {
      const outros = ds.dailies.filter((x) => x.data !== d.data);
      return { ...ds, dailies: [...outros, d].sort((a, b) => a.data.localeCompare(b.data)) };
    });
  }
  async lancarDailies(arr: AfterpayDaily[]) {
    this.mut((ds) => {
      const datas = new Set(arr.map((d) => d.data));
      const outros = ds.dailies.filter((x) => !datas.has(x.data));
      return { ...ds, dailies: [...outros, ...arr].sort((a, b) => a.data.localeCompare(b.data)) };
    });
  }
  async marcarSync(iso: string) {
    this.mut((ds) => ({ ...ds, ultimoSync: iso }));
  }
}
