// ─────────────────────────────────────────────────────────────
// Tipos do domínio. Valores monetários "de entrada" (vindos do
// banco / Afterpay) chegam em REAIS (numeric(12,2)). O motor de
// cálculo converte tudo para CENTAVOS inteiros internamente.
// ─────────────────────────────────────────────────────────────

/** Data no formato ISO date-only: 'YYYY-MM-DD'. */
export type IsoDate = string;

/** Snapshot diário vindo do Afterpay. Valores em reais. */
export interface AfterpayDaily {
  data: IsoDate;

  // Receita
  receita_aprovada: number;
  qtd_pagamentos: number;

  // Deduções
  taxas_plataforma: number;

  // Custos operacionais
  custo_produtos: number;
  frete: number;
  comissoes_vendedor: number;
  comissoes_cobranca: number;

  // Marketing
  investimento_ads: number;
  taxas_investimento: number;
  leads?: number; // qtd de leads do dia (lançamento manual)

  // Perdas
  valor_frustrado: number;
  qtd_frustrados: number;

  // Funil
  valor_agendado: number;
  qtd_agendados: number;
}

export type Recorrencia = 'unico' | 'mensal';

/** Categoria de custo variável (editável pelo usuário). */
export interface CategoriaCusto {
  id: string;
  nome: string;
  icone?: string | null;
  cor?: string | null;
  ativo: boolean;
  ordem: number;
}

/** Custo variável — o que o Afterpay NÃO conhece. Valor em reais. */
export interface CustoVariavel {
  id: string;
  data: IsoDate; // data de competência
  categoria_id: string | null;
  descricao: string;
  valor: number;
  recorrencia: Recorrencia;
  recorrencia_fim: IsoDate | null; // null = indefinido
  ratear_por_dias: boolean;
  observacao?: string | null;
}

/** Período fechado e inclusivo [inicio, fim]. */
export interface Periodo {
  inicio: IsoDate;
  fim: IsoDate;
}

/**
 * Desempenho por atendente. Hoje vem de dados de exemplo; quando o
 * webhook do Afterpay estiver ligado (Etapa 8), passa a ser real por
 * pedido. Valores em reais.
 */
export interface AtendenteStat {
  nome: string;
  valor_agendado: number;
  pedidos: number;
}

/** Origem do lead / plataforma de venda. */
export interface PlataformaStat {
  nome: string;
  pedidos: number;
}

/** Pedido espelhado do BlueSales (sem PII do cliente). Valor em reais. */
export interface Pedido {
  id: string;
  internal_id?: number | null;
  status: string | null;
  data: IsoDate; // data de criação do pedido — base do agendado
  data_aprovacao?: IsoDate | null; // data do pagamento — base da receita aprovada (BlueSales conta por aqui)
  valor: number; // líquido (com desconto %) — base da receita aprovada
  valor_bruto?: number | null; // valor cheio do pedido — base do agendado
  produto_nome?: string | null;
  produto_plano?: string | null;
  codigo_plano?: string | null;
  metodo_pagamento?: string | null;
  vendedor?: string | null;
  rastreamento?: string | null;
}
