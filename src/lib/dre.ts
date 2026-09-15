// ─────────────────────────────────────────────────────────────
// Estrutura do Demonstrativo de Resultados (DRE): os grupos de custo e
// os subtotais contábeis, da receita até o lucro.
//
//   Receita aprovada
//   (−) Deduções ................ taxa de plataforma
//   (=) Receita líquida
//   (−) Custo da operação ....... produto + frete
//   (−) Comissões ............... vendedor + cobrança
//   (=) Margem de contribuição
//   (−) Marketing ............... anúncios + taxas sobre investimento
//   (=) Resultado operacional     ← o lucro que o BlueSales mostra
//   (−) Custos variáveis ........ lançados à mão
//   (−) Perdas .................. frustrados, só se o botão mandar descontar
//   (=) Lucro real
//
// Não calcula nada novo: só reagrupa o PnlResult. Os testes garantem que
// a cascata termina exatamente no lucro_real.
// ─────────────────────────────────────────────────────────────

import type { Cents } from '@/lib/money';
import { safeDiv } from '@/lib/money';
import type { PnlResult } from '@/lib/pnl';
import { HEX } from '@/lib/cores';

export type IdGrupo = 'deducoes' | 'operacao' | 'comissoes' | 'marketing' | 'variaveis' | 'perdas';

export interface GrupoDRE {
  id: IdGrupo;
  nome: string;
  total: Cents;
  /** Fração da receita (0..1). */
  pctReceita: number;
  /** Cor do grupo na cascata e no "para onde foi cada real" (HEX). */
  cor: string;
}

export interface SubtotalDRE {
  nome: string;
  valor: Cents;
  pctReceita: number;
}

export interface DRE {
  receita: Cents;
  grupos: Record<IdGrupo, GrupoDRE>;
  receitaLiquida: SubtotalDRE;
  margemContribuicao: SubtotalDRE;
  resultadoOperacional: SubtotalDRE;
  lucroReal: SubtotalDRE;
}

/** Tons da marca por grupo: a cascata e a legenda usam as mesmas cores. */
export const COR_GRUPO: Record<IdGrupo | 'lucro', string> = {
  deducoes: HEX.ouroEscuro,
  operacao: HEX.ouro,
  comissoes: HEX.ouroClaro,
  marketing: HEX.ouroPalido,
  variaveis: '#a09c92',
  perdas: HEX.ambar,
  lucro: HEX.verde,
};

export function montarDRE(pnl: PnlResult): DRE {
  const receita = pnl.receita_aprovada;
  const grupo = (id: IdGrupo, nome: string, total: Cents): GrupoDRE => ({
    id,
    nome,
    total,
    pctReceita: safeDiv(total, receita),
    cor: COR_GRUPO[id],
  });
  const sub = (nome: string, valor: Cents): SubtotalDRE => ({ nome, valor, pctReceita: safeDiv(valor, receita) });

  const grupos: Record<IdGrupo, GrupoDRE> = {
    deducoes: grupo('deducoes', 'Deduções', pnl.taxas_plataforma),
    operacao: grupo('operacao', 'Custo da operação', pnl.custo_produtos + pnl.frete),
    comissoes: grupo('comissoes', 'Comissões', pnl.comissoes_vendedor + pnl.comissoes_cobranca),
    marketing: grupo('marketing', 'Marketing', pnl.investimento_ads + pnl.taxas_investimento),
    variaveis: grupo('variaveis', 'Custos variáveis', pnl.custos_variaveis_total),
    perdas: grupo('perdas', 'Perdas', pnl.desconto_frustrados),
  };

  const receitaLiquida = receita - grupos.deducoes.total;
  const margemContribuicao = receitaLiquida - grupos.operacao.total - grupos.comissoes.total;
  const resultadoOperacional = margemContribuicao - grupos.marketing.total;
  const lucroReal = resultadoOperacional - grupos.variaveis.total - grupos.perdas.total;

  return {
    receita,
    grupos,
    receitaLiquida: sub('Receita líquida', receitaLiquida),
    margemContribuicao: sub('Margem de contribuição', margemContribuicao),
    resultadoOperacional: sub('Resultado operacional', resultadoOperacional),
    lucroReal: sub(lucroReal >= 0 ? 'Lucro real' : 'Prejuízo real', lucroReal),
  };
}

export interface DegrauCascata {
  id: IdGrupo | 'receita' | 'lucro';
  nome: string;
  valor: Cents;
  /** Base e altura da barra, em fração da escala (0..1). */
  base: number;
  altura: number;
  cor: string;
  tipo: 'total' | 'saida';
}

/**
 * Degraus do gráfico de cascata. A escala é a receita — ou o total de
 * custos, se eles passarem da receita (prejuízo), para nenhuma barra
 * sair do quadro.
 */
export function degrausCascata(dre: DRE, incluirPerdas: boolean): DegrauCascata[] {
  const ordem: IdGrupo[] = ['deducoes', 'operacao', 'comissoes', 'marketing', 'variaveis'];
  if (incluirPerdas) ordem.push('perdas');

  const custos = ordem.reduce((s, id) => s + dre.grupos[id].total, 0);
  const escala = Math.max(dre.receita, custos, 1);
  const f = (v: Cents) => Math.max(0, v) / escala;

  const degraus: DegrauCascata[] = [
    { id: 'receita', nome: 'Receita', valor: dre.receita, base: 0, altura: f(dre.receita), cor: HEX.ouro, tipo: 'total' },
  ];
  let restante = dre.receita;
  for (const id of ordem) {
    const g = dre.grupos[id];
    const topo = restante;
    restante -= g.total;
    // A barra vai do que sobrava até o que sobrou (sem descer abaixo de zero).
    const base = Math.max(0, restante);
    degraus.push({ id, nome: g.nome, valor: g.total, base: f(base), altura: f(topo) - f(base), cor: g.cor, tipo: 'saida' });
  }
  const lucro = dre.lucroReal.valor;
  degraus.push({
    id: 'lucro',
    nome: lucro >= 0 ? 'Lucro' : 'Prejuízo',
    valor: lucro,
    base: 0,
    altura: f(lucro),
    cor: lucro >= 0 ? HEX.verde : HEX.vermelho,
    tipo: 'total',
  });
  return degraus;
}
