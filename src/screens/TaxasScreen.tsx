import { useMemo, useState } from 'react';
import { Check, Info, Pencil, Receipt, RotateCcw, X, Zap } from 'lucide-react';
import type { AfterpayDaily, Periodo } from '@/types';
import { formatBRL, reaisToCents } from '@/lib/money';
import { diasDaTabelaDeTaxas, pagamentosPorDia } from '@/lib/taxas';
import { ehBoleto, TAXA_BOLETO } from '@/lib/custosConfig';
import { hojeIso } from '@/lib/dates';
import { useData } from '@/store/DataProvider';
import { Panel } from '@/components/ui';
import { MoneyInput } from '@/components/MoneyInput';

/** 'YYYY-MM-DD' → 'DD/MM'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** 'YYYY-MM-DD' → 'seg', 'ter'… — ajuda a achar o dia na lista do mês. */
function diaDaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function zeroDaily(data: string): AfterpayDaily {
  return {
    data,
    receita_aprovada: 0, qtd_pagamentos: 0, taxas_plataforma: 0, custo_produtos: 0,
    frete: 0, comissoes_vendedor: 0, comissoes_cobranca: 0, investimento_ads: 0,
    taxas_investimento: 0, valor_frustrado: 0, qtd_frustrados: 0, valor_agendado: 0,
    qtd_agendados: 0, leads: 0,
  };
}

export function TaxasScreen({ periodo }: { periodo: Periodo }) {
  const { pedidos, dailies, lancarDaily } = useData();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState(0);

  // Todos os dias (1 ao 30/31 em "Este mês"), como uma planilha do mês.
  const linhas = useMemo(() => diasDaTabelaDeTaxas(pedidos, dailies, periodo), [pedidos, dailies, periodo]);
  const porDia = useMemo(() => pagamentosPorDia(pedidos, periodo), [pedidos, periodo]);
  const hoje = hojeIso();

  const total = linhas.reduce((s, l) => s + l.cents, 0);
  const pagamentos = linhas.reduce((s, l) => s + l.qtd_pagamentos, 0);
  const boletos = [...porDia.values()].flat().filter(ehBoleto).length;

  function abrir(data: string, cents: number) {
    setEditando(data);
    setRascunho(cents);
  }

  function salvar(data: string) {
    // Parte do que já existe: gravar do zero apagaria Ads e leads do dia.
    const base = dailies.find((d) => d.data === data) ?? zeroDaily(data);
    // Marca como conferido mesmo quando o valor é R$ 0,00: é resposta,
    // não ausência de resposta. O lançado passa a valer no lugar da regra.
    lancarDaily({ ...base, taxas_plataforma: rascunho / 100, taxa_conferida: true });
    setEditando(null);
  }

  /** Tira o lançamento à mão: o dia volta a ser calculado pelos boletos. */
  function voltarAoAutomatico(data: string) {
    const base = dailies.find((d) => d.data === data) ?? zeroDaily(data);
    lancarDaily({ ...base, taxas_plataforma: 0, taxa_conferida: false });
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h1 className="text-[21px] lg:text-[26px] font-extrabold text-tx tracking-tight">Taxas de Plataforma</h1>
        <p className="text-[13px] text-dim mt-0.5">
          O que o BlueSales cobrou sobre os pagamentos — não tem relação com anúncios
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 lg:gap-[14px]">
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Taxa no período</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-red truncate">{formatBRL(total)}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">deduzida da receita</div>
        </div>
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Pagamentos</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-grn">{pagamentos}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">aprovados no período</div>
        </div>
        <div className="bg-card border border-line rounded-kpi px-2.5 lg:px-4 py-3 lg:py-[15px]">
          <div className="text-[10px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">Boletos pagos</div>
          <div className="mono text-[16px] lg:text-[21px] font-extrabold text-gold2">{boletos}</div>
          <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px]">× {formatBRL(reaisToCents(TAXA_BOLETO))} de taxa cada</div>
        </div>
      </div>

      <Panel title="Taxa por dia" hint="automática pelos boletos · o lápis corrige um dia">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[330px] sm:min-w-[640px]">
            <thead>
              <tr className="text-dim2 text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-3 lg:px-5 py-3">Data</th>
                <th className="text-right font-semibold px-2 sm:px-3 lg:px-5 py-3">Pagamentos</th>
                <th className="hidden sm:table-cell text-right font-semibold px-3 lg:px-5 py-3">Receita do dia</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Taxa</th>
                <th className="text-right font-semibold px-3 lg:px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-dim2">
                    Nenhum pagamento aprovado neste período.
                  </td>
                </tr>
              ) : (
                linhas.map((l) => {
                  const receita = (porDia.get(l.data) ?? []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
                  const emEdicao = editando === l.data;
                  // Dia que já veio taxado pelo BlueSales não se edita aqui:
                  // o valor está preso a cada pagamento.
                  const doBlueSales = l.fonte === 'pagamento';
                  const futuro = l.data > hoje;
                  // Lançado à mão num dia com pagamento: dá para voltar à regra.
                  const podeVoltar = l.fonte === 'dia' && l.qtd_pagamentos > 0;
                  return (
                    <tr
                      key={l.data}
                      className={`border-t border-line/70 hover:bg-white/[0.015] ${futuro ? 'opacity-40' : ''} ${
                        l.data === hoje ? 'bg-gold/[0.04]' : ''
                      }`}
                    >
                      <td className="px-3 lg:px-5 py-3 lg:py-3.5 whitespace-nowrap">
                        <span className="text-tx font-medium">{diaMes(l.data)}</span>
                        <span className="ml-2 text-[10.5px] text-dim2">{diaDaSemana(l.data)}</span>
                        {l.data === hoje && <span className="ml-2 text-[10px] font-bold text-gold uppercase tracking-wide">hoje</span>}
                      </td>
                      <td className="px-2 sm:px-3 lg:px-5 py-3.5 lg:py-4 text-right text-dim mono">{l.qtd_pagamentos}</td>
                      <td className="hidden sm:table-cell px-3 lg:px-5 py-3.5 lg:py-4 text-right text-dim mono">{formatBRL(reaisToCents(receita))}</td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right">
                        {emEdicao ? (
                          <div className="w-[140px] ml-auto">
                            <MoneyInput cents={rascunho} onChange={setRascunho} autoFocus />
                          </div>
                        ) : (
                          <div>
                            <span className={`mono font-bold ${l.fonte === 'ausente' ? 'text-dim2' : 'text-red'}`}>
                              {futuro ? '—' : formatBRL(l.cents)}
                            </span>
                            <div className="text-[10px] text-dim2 mt-[2px] flex items-center justify-end gap-1">
                              {futuro ? (
                                'ainda não chegou'
                              ) : doBlueSales ? (
                                <>
                                  <Zap size={10} className="text-grn" />
                                  veio do BlueSales · {l.qtd_com_taxa} de {l.qtd_pagamentos}
                                </>
                              ) : l.fonte === 'regra' ? (
                                <>
                                  <Zap size={10} className="text-grn" />
                                  automático · {l.qtd_com_taxa === 0 ? 'nenhum boleto' : `${l.qtd_com_taxa} boleto${l.qtd_com_taxa === 1 ? '' : 's'}`}
                                </>
                              ) : l.fonte === 'dia' ? (
                                'lançado por você'
                              ) : (
                                'sem pagamento'
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 lg:px-5 py-3.5 lg:py-4 text-right whitespace-nowrap">
                        {emEdicao ? (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => salvar(l.data)}
                              title="Salvar"
                              className="grid place-items-center w-8 h-8 rounded-lg text-grn hover:bg-grn/10"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => setEditando(null)}
                              title="Cancelar"
                              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-tx hover:bg-white/5"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : doBlueSales ? (
                          <span className="hidden sm:inline text-[10.5px] text-dim2">vem do BlueSales</span>
                        ) : futuro ? null : (
                          <div className="inline-flex gap-1">
                            {podeVoltar && (
                              <button
                                onClick={() => voltarAoAutomatico(l.data)}
                                title="Voltar ao automático (R$ 2,50 por boleto)"
                                className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-gold hover:bg-gold/10"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => abrir(l.data, l.cents)}
                              title="Corrigir a taxa deste dia"
                              className="grid place-items-center w-8 h-8 rounded-lg text-dim2 hover:text-tx hover:bg-white/5"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <Info size={16} className="text-gold shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          O BlueSales cobra <b className="text-dim">R$ 2,50 por pagamento no boleto</b> — pix e cartão não pagam. Ele
          não manda essa taxa para a dashboard, então ela é <b className="text-dim">calculada sozinha</b> pelos boletos
          pagos em cada dia (<b className="text-dim">automático</b>). Se algum dia o valor do BlueSales for diferente,
          corrija no lápis; a seta volta o dia para o automático.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-[12px] border border-line2 bg-card2 px-4 py-[13px]">
        <Receipt size={16} className="text-gold shrink-0 mt-[2px]" />
        <p className="m-0 text-[12.5px] text-dim leading-relaxed">
          Na linha <b className="text-dim">Comissões Vendedor</b> do P&amp;L, cada vendedor desconta a taxa dos{' '}
          <b className="text-dim">boletos das próprias vendas</b> — igual ao BlueSales. Na comissão que o vendedor
          recebe, nada é descontado.
        </p>
      </div>
    </div>
  );
}
