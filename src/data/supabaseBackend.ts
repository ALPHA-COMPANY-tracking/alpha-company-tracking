// ─────────────────────────────────────────────────────────────
// Backend Supabase. RLS garante que cada query só vê os dados do
// usuário logado. Atendentes/plataformas seguem de exemplo até o
// webhook do Afterpay entrar (Etapa 8).
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AfterpayDaily, CategoriaCusto, CustoVariavel } from '@/types';
import type { Dataset } from '@/data/db';
import { SEED_ATENDENTES, SEED_CATEGORIAS, SEED_PLATAFORMAS } from '@/data/seed';
import type { Backend } from '@/data/backend';

const N = (v: unknown) => Number(v ?? 0);

function mapDaily(r: Record<string, unknown>): AfterpayDaily {
  return {
    data: String(r.data),
    receita_aprovada: N(r.receita_aprovada),
    qtd_pagamentos: N(r.qtd_pagamentos),
    taxas_plataforma: N(r.taxas_plataforma),
    custo_produtos: N(r.custo_produtos),
    frete: N(r.frete),
    comissoes_vendedor: N(r.comissoes_vendedor),
    comissoes_cobranca: N(r.comissoes_cobranca),
    investimento_ads: N(r.investimento_ads),
    taxas_investimento: N(r.taxas_investimento),
    leads: N(r.leads),
    valor_frustrado: N(r.valor_frustrado),
    qtd_frustrados: N(r.qtd_frustrados),
    valor_agendado: N(r.valor_agendado),
    qtd_agendados: N(r.qtd_agendados),
  };
}

export class SupabaseBackend implements Backend {
  private db: SupabaseClient;
  private userId: string;

  constructor(db: SupabaseClient, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  async load(): Promise<Dataset> {
    const [cats, custos, dailies, pedidos] = await Promise.all([
      this.db.from('categorias_custo').select('*').order('ordem'),
      this.db.from('custos_variaveis').select('*').order('data', { ascending: false }),
      this.db.from('afterpay_daily').select('*').order('data'),
      this.db.from('bluesales_pedidos').select('*').order('data', { ascending: false }),
    ]);
    if (cats.error) throw cats.error;
    if (custos.error) throw custos.error;
    if (dailies.error) throw dailies.error;
    // Tolerante: se a tabela de pedidos ainda não foi criada (migration
    // 0002 não rodada), segue com pedidos vazios em vez de quebrar o app.
    if (pedidos.error) console.warn('bluesales_pedidos indisponível:', pedidos.error.message);

    let categorias: CategoriaCusto[] = (cats.data ?? []).map((r) => ({
      id: String(r.id),
      nome: String(r.nome),
      icone: r.icone ?? null,
      cor: r.cor ?? null,
      ativo: Boolean(r.ativo),
      ordem: N(r.ordem),
    }));

    // Primeiro acesso sem categorias (ex.: conta antiga num projeto já
    // existente, onde o gatilho do banco não rodou): semeia as 14.
    if (categorias.length === 0) {
      const novas: CategoriaCusto[] = SEED_CATEGORIAS.map((c) => ({ ...c, id: crypto.randomUUID() }));
      const { error } = await this.db
        .from('categorias_custo')
        .insert(novas.map((c) => ({ ...c, user_id: this.userId })));
      if (!error) categorias = novas;
    }
    const custosMap: CustoVariavel[] = (custos.data ?? []).map((r) => ({
      id: String(r.id),
      data: String(r.data),
      categoria_id: r.categoria_id ?? null,
      descricao: String(r.descricao),
      valor: N(r.valor),
      recorrencia: r.recorrencia === 'mensal' ? 'mensal' : 'unico',
      recorrencia_fim: r.recorrencia_fim ?? null,
      ratear_por_dias: Boolean(r.ratear_por_dias),
      observacao: r.observacao ?? null,
    }));
    const dailiesMap = (dailies.data ?? []).map(mapDaily);
    const ultimoSync =
      dailies.data && dailies.data.length
        ? (dailies.data[dailies.data.length - 1].sincronizado_em ?? null)
        : null;

    const pedidosMap = (pedidos.data ?? []).map((r) => ({
      id: String(r.id),
      internal_id: r.internal_id ?? null,
      status: r.status ?? null,
      data: String(r.data),
      data_aprovacao: r.data_aprovacao != null ? String(r.data_aprovacao) : null,
      valor: N(r.valor),
      valor_bruto: r.valor_bruto != null ? N(r.valor_bruto) : null,
      produto_nome: r.produto_nome ?? null,
      produto_plano: r.produto_plano ?? null,
      codigo_plano: r.codigo_plano ?? null,
      metodo_pagamento: r.metodo_pagamento ?? null,
      vendedor: r.vendedor ?? null,
      rastreamento: r.rastreamento ?? null,
    }));

    return {
      categorias,
      dailies: dailiesMap,
      custos: custosMap,
      atendentes: SEED_ATENDENTES,
      plataformas: SEED_PLATAFORMAS,
      pedidos: pedidosMap,
      ultimoSync,
    };
  }

  async addCusto(c: CustoVariavel) {
    const { error } = await this.db.from('custos_variaveis').insert({ ...c, user_id: this.userId });
    if (error) throw error;
  }
  async updateCusto(id: string, patch: Partial<CustoVariavel>) {
    const { error } = await this.db
      .from('custos_variaveis')
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
  async deleteCusto(id: string) {
    const { error } = await this.db.from('custos_variaveis').delete().eq('id', id);
    if (error) throw error;
  }
  async importarCustos(cs: CustoVariavel[]) {
    const { error } = await this.db
      .from('custos_variaveis')
      .insert(cs.map((c) => ({ ...c, user_id: this.userId })));
    if (error) throw error;
  }
  async addCategoria(c: CategoriaCusto) {
    const { error } = await this.db.from('categorias_custo').insert({ ...c, user_id: this.userId });
    if (error) throw error;
  }
  async updateCategoria(id: string, patch: Partial<CategoriaCusto>) {
    const { error } = await this.db.from('categorias_custo').update(patch).eq('id', id);
    if (error) throw error;
  }
  async deleteCategoria(id: string) {
    // A FK é `on delete set null`: os custos lançados continuam existindo,
    // apenas ficam sem categoria.
    const { error } = await this.db.from('categorias_custo').delete().eq('id', id);
    if (error) throw error;
  }
  async lancarDaily(d: AfterpayDaily) {
    const { error } = await this.db
      .from('afterpay_daily')
      .upsert({ ...d, user_id: this.userId, sincronizado_em: new Date().toISOString() }, { onConflict: 'user_id,data' });
    if (error) throw error;
  }
  async lancarDailies(arr: AfterpayDaily[]) {
    if (arr.length === 0) return;
    const agora = new Date().toISOString();
    const { error } = await this.db
      .from('afterpay_daily')
      .upsert(
        arr.map((d) => ({ ...d, user_id: this.userId, sincronizado_em: agora })),
        { onConflict: 'user_id,data' },
      );
    if (error) throw error;
  }
  async marcarSync() {
    // Sem tabela dedicada: o timestamp de sync fica no estado do cliente.
  }
}
