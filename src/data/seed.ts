// ─────────────────────────────────────────────────────────────
// Semente de dados (modo local). Reproduz os números reais do
// Jonas para o dashboard nascer idêntico ao mockup. Estes valores
// são só ponto de partida — tudo é editável na interface.
// ─────────────────────────────────────────────────────────────

import type { AfterpayDaily, CategoriaCusto, CustoVariavel } from '@/types';
import { addDias, hojeIso } from '@/lib/dates';

export const SEED_CATEGORIAS: CategoriaCusto[] = [
  { id: 'cat-chips', nome: 'Chips / Números WhatsApp', icone: 'smartphone', cor: '#22d3ee', ativo: true, ordem: 0 },
  { id: 'cat-ferramentas', nome: 'Ferramentas e SaaS', icone: 'wrench', cor: '#60a5fa', ativo: true, ordem: 1 },
  { id: 'cat-disparador', nome: 'Disparador / Automação', icone: 'zap', cor: '#818cf8', ativo: true, ordem: 2 },
  { id: 'cat-crm', nome: 'CRM', icone: 'contact', cor: '#38bdf8', ativo: true, ordem: 3 },
  { id: 'cat-equipe', nome: 'Equipe / Freelancer', icone: 'users', cor: '#a855f7', ativo: true, ordem: 4 },
  { id: 'cat-criativos', nome: 'Criativos / UGC', icone: 'clapperboard', cor: '#f472b6', ativo: true, ordem: 5 },
  { id: 'cat-embalagem', nome: 'Embalagem e Insumos', icone: 'package', cor: '#fbbf24', ativo: true, ordem: 6 },
  { id: 'cat-estorno', nome: 'Estorno / Chargeback', icone: 'rotate-ccw', cor: '#fb7185', ativo: true, ordem: 7 },
  { id: 'cat-bancarias', nome: 'Taxas Bancárias', icone: 'landmark', cor: '#f59e0b', ativo: true, ordem: 8 },
  { id: 'cat-trafego', nome: 'Tráfego fora do Meta', icone: 'megaphone', cor: '#34d399', ativo: true, ordem: 9 },
  { id: 'cat-juridico', nome: 'Contador / Jurídico', icone: 'scale', cor: '#94a3b8', ativo: true, ordem: 10 },
  { id: 'cat-prolabore', nome: 'Pró-labore', icone: 'wallet', cor: '#c084fc', ativo: true, ordem: 11 },
  { id: 'cat-infra', nome: 'Infraestrutura (servidor, domínio)', icone: 'server', cor: '#2dd4bf', ativo: true, ordem: 12 },
  { id: 'cat-outros', nome: 'Outros', icone: 'ellipsis', cor: '#6b7280', ativo: true, ordem: 13 },
];

// Totais reais do período (em reais) que a distribuição diária precisa somar.
const TOTAIS = {
  receita_aprovada: 20813.25,
  qtd_pagamentos: 30,
  taxas_plataforma: 22.5,
  custo_produtos: 2288.0,
  frete: 990.0,
  comissoes_vendedor: 1039.54,
  comissoes_cobranca: 208.13,
  investimento_ads: 10224.0,
  taxas_investimento: 0,
  valor_frustrado: 2940.0,
  qtd_frustrados: 4,
  valor_agendado: 48150.0,
  qtd_agendados: 70,
};

/** Distribui um total inteiro entre pesos, exato, por maior resto. */
function distribuir(totalInt: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const bruto = pesos.map((p) => (totalInt * p) / soma);
  const base = bruto.map(Math.floor);
  let resto = totalInt - base.reduce((a, b) => a + b, 0);
  const ordem = bruto
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < resto && k < ordem.length; k++) base[ordem[k].i] += 1;
  return base;
}

/** Gera os snapshots diários que somam os totais reais. */
export function gerarDailies(fim = hojeIso(), dias = 30): AfterpayDaily[] {
  const datas = Array.from({ length: dias }, (_, i) => addDias(fim, -(dias - 1 - i)));
  const pesos = datas.map((_, i) => {
    const t = i / (dias - 1);
    return Math.max(0.35, 1 + 0.45 * Math.sin(t * Math.PI * 1.6) + 0.25 * Math.cos(t * Math.PI * 3));
  });

  // Distribui os campos em CENTAVOS (money) e em unidades (qtd).
  const cents = (reais: number) => Math.round(reais * 100);
  const dRec = distribuir(cents(TOTAIS.receita_aprovada), pesos);
  const dTax = distribuir(cents(TOTAIS.taxas_plataforma), pesos);
  const dProd = distribuir(cents(TOTAIS.custo_produtos), pesos);
  const dFrete = distribuir(cents(TOTAIS.frete), pesos);
  const dCv = distribuir(cents(TOTAIS.comissoes_vendedor), pesos);
  const dCc = distribuir(cents(TOTAIS.comissoes_cobranca), pesos);
  const dAds = distribuir(cents(TOTAIS.investimento_ads), pesos);
  const dFrus = distribuir(cents(TOTAIS.valor_frustrado), pesos);
  const dAge = distribuir(cents(TOTAIS.valor_agendado), pesos);
  const dQtdPag = distribuir(TOTAIS.qtd_pagamentos, pesos);
  const dQtdFrus = distribuir(TOTAIS.qtd_frustrados, pesos);
  const dQtdAge = distribuir(TOTAIS.qtd_agendados, pesos);

  return datas.map((data, i) => ({
    data,
    receita_aprovada: dRec[i] / 100,
    qtd_pagamentos: dQtdPag[i],
    taxas_plataforma: dTax[i] / 100,
    custo_produtos: dProd[i] / 100,
    frete: dFrete[i] / 100,
    comissoes_vendedor: dCv[i] / 100,
    comissoes_cobranca: dCc[i] / 100,
    investimento_ads: dAds[i] / 100,
    taxas_investimento: 0,
    valor_frustrado: dFrus[i] / 100,
    qtd_frustrados: dQtdFrus[i],
    valor_agendado: dAge[i] / 100,
    qtd_agendados: dQtdAge[i],
  }));
}

/** Custos variáveis do mockup: 22 lançamentos, 6 categorias, R$ 3.669,30. */
export function gerarCustos(fim = hojeIso()): CustoVariavel[] {
  const base = (
    id: string,
    off: number,
    categoria_id: string,
    descricao: string,
    valor: number,
  ): CustoVariavel => ({
    id,
    data: addDias(fim, -off),
    categoria_id,
    descricao,
    valor,
    recorrencia: 'unico',
    recorrencia_fim: null,
    ratear_por_dias: true,
    observacao: null,
  });

  return [
    // Equipe / Freelancer — R$ 1.200,00 (3)
    base('seed-eq-1', 2, 'cat-equipe', 'Closer — comissão extra', 500),
    base('seed-eq-2', 9, 'cat-equipe', 'Freelancer edição', 400),
    base('seed-eq-3', 16, 'cat-equipe', 'Suporte fim de semana', 300),
    // Criativos / UGC — R$ 850,00 (5)
    base('seed-cr-1', 1, 'cat-criativos', 'UGC criador A', 250),
    base('seed-cr-2', 5, 'cat-criativos', 'UGC criador B', 200),
    base('seed-cr-3', 8, 'cat-criativos', 'Edição de VSL', 150),
    base('seed-cr-4', 12, 'cat-criativos', 'Banco de imagens', 150),
    base('seed-cr-5', 20, 'cat-criativos', 'Locução', 100),
    // Ferramentas e SaaS — R$ 697,00 (4)
    base('seed-fs-1', 3, 'cat-ferramentas', 'Assinatura design', 199),
    base('seed-fs-2', 7, 'cat-ferramentas', 'Encurtador/analytics', 149),
    base('seed-fs-3', 14, 'cat-ferramentas', 'Planilhas/BI', 199),
    base('seed-fs-4', 21, 'cat-ferramentas', 'Armazenamento', 150),
    // Chips / Números — R$ 420,00 (7)
    base('seed-ch-1', 1, 'cat-chips', 'Chip novo', 60),
    base('seed-ch-2', 4, 'cat-chips', 'Chip novo', 60),
    base('seed-ch-3', 6, 'cat-chips', 'Recarga', 60),
    base('seed-ch-4', 11, 'cat-chips', 'Chip novo', 60),
    base('seed-ch-5', 15, 'cat-chips', 'Recarga', 60),
    base('seed-ch-6', 19, 'cat-chips', 'Chip novo', 60),
    base('seed-ch-7', 25, 'cat-chips', 'Recarga', 60),
    // Embalagem — R$ 312,40 (2)
    base('seed-em-1', 2, 'cat-embalagem', 'Caixas e plástico bolha', 200),
    base('seed-em-2', 13, 'cat-embalagem', 'Etiquetas e fitas', 112.4),
    // Estorno / Chargeback — R$ 189,90 (1)
    base('seed-es-1', 6, 'cat-estorno', 'Chargeback pedido #1042', 189.9),
  ];
}
