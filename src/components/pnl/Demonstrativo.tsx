import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Coins,
  type LucideIcon,
  Megaphone,
  Package,
  Plus,
  Receipt,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import type { CategoriaCusto, CustoVariavel, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { formatBRL, formatPercent, safeDiv } from '@/lib/money';
import { type DescontoFrustrados, type PnlResult, custoNoPeriodo } from '@/lib/pnl';
import { COMISSAO_COBRANCA, RESPONSAVEL_COBRANCA } from '@/lib/custosConfig';
import { COR_GRUPO, type DegrauCascata, type GrupoDRE, degrausCascata, montarDRE } from '@/lib/dre';
import { alfa, corDaCategoria } from '@/lib/cores';
import { hojeIso } from '@/lib/dates';
import { seloPeriodo } from '@/lib/tendencia';

/** "− R$ 322,50" para custo; "R$ 0,00" quando zerado. */
function saida(cents: Cents): string {
  return cents > 0 ? `− ${formatBRL(cents)}` : formatBRL(0);
}

/** Selo de percentual (comissão do vendedor, cobrança). */
function SeloPct({ pct }: { pct: number }) {
  return (
    <span className="mono text-[10px] font-bold text-gold border border-gold/30 bg-gold/10 rounded-full px-[7px] py-[1px] shrink-0">
      {formatPercent(pct)}
    </span>
  );
}

// ─────────────────────────────── Cascata ───────────────────────────────

/**
 * A receita "descendo" até o lucro. No computador, barras verticais em
 * cascata; no celular a mesma cascata deitada, uma linha por etapa.
 */
function Cascata({ degraus, receita }: { degraus: DegrauCascata[]; receita: Cents }) {
  const pct = (d: DegrauCascata) => formatPercent(safeDiv(Math.abs(d.valor), receita));
  const valor = (d: DegrauCascata) => (d.tipo === 'saida' ? saida(d.valor) : formatBRL(d.valor));
  const corValor = (d: DegrauCascata) =>
    d.id === 'receita' ? 'text-gold2' : d.id === 'lucro' ? (d.valor >= 0 ? 'text-grn' : 'text-red') : d.valor > 0 ? 'text-tx' : 'text-dim2';

  return (
    <>
      {/* Computador */}
      <div className="hidden md:grid gap-0" style={{ gridTemplateColumns: `repeat(${degraus.length}, minmax(0, 1fr))` }}>
        {degraus.map((d, i) => {
          // Nível onde a próxima barra começa: topo da receita, ou o que
          // sobrou depois de uma saída.
          const nivel = d.tipo === 'total' ? d.base + d.altura : d.base;
          return (
            <div key={d.id} className="min-w-0 px-1">
              <div className="relative h-[170px]">
                <div className="absolute inset-x-0 bottom-0 border-b border-line2" />
                <div
                  className="absolute left-[16%] right-[16%] rounded-[7px]"
                  style={{
                    bottom: `${d.base * 100}%`,
                    height: `${Math.max(d.altura * 100, d.valor !== 0 ? 1.4 : 0)}%`,
                    background:
                      d.tipo === 'total'
                        ? `linear-gradient(180deg, ${d.cor} 0%, ${alfa(d.cor, 45)} 100%)`
                        : `linear-gradient(180deg, ${alfa(d.cor, 95)} 0%, ${alfa(d.cor, 60)} 100%)`,
                    boxShadow: d.tipo === 'total' ? `0 0 24px ${alfa(d.cor, 18)}` : undefined,
                  }}
                />
                {i < degraus.length - 1 && (
                  <div
                    className="absolute left-[84%] -right-[16%] border-t border-dashed border-dim2/50"
                    style={{ bottom: `${nivel * 100}%` }}
                  />
                )}
              </div>
              <div className="mt-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.12em] font-bold text-dim truncate">{d.nome}</div>
                <div className={`mono text-[12.5px] 2xl:text-[13.5px] font-bold mt-1 truncate ${corValor(d)}`}>{valor(d)}</div>
                <div className="mono text-[10px] text-dim2 mt-0.5">{pct(d)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Celular: cascata deitada */}
      <div className="md:hidden flex flex-col gap-2.5">
        {degraus.map((d) => (
          <div key={d.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-tx2">
                {d.tipo === 'saida' ? '− ' : d.id === 'lucro' ? '= ' : ''}
                {d.nome}
              </span>
              <span className="flex items-baseline gap-2">
                <span className={`mono text-[12.5px] font-bold ${corValor(d)}`}>{valor(d)}</span>
                <span className="mono text-[10px] text-dim2 w-[42px] text-right">{pct(d)}</span>
              </span>
            </div>
            <div className="relative h-[7px] mt-1 rounded-full bg-trilha overflow-hidden">
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  left: `${d.base * 100}%`,
                  width: `${Math.max(d.altura * 100, d.valor !== 0 ? 1 : 0)}%`,
                  background: d.cor,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────── Blocos ───────────────────────────────

/** Um grupo de custo: cabeçalho com total e peso, e as linhas embaixo. */
function Bloco({
  grupo,
  Icon,
  descricao,
  totalRotulo,
  children,
  rodape,
}: {
  grupo: GrupoDRE;
  Icon: LucideIcon;
  descricao: string;
  /** Troca o total do cabeçalho (ex.: perdas mostradas, mas não descontadas). */
  totalRotulo?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <div className="bg-card2 border border-line rounded-[14px] overflow-hidden">
      <div className="relative px-4 pt-4 pb-3.5">
        <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: grupo.cor }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Ícone no dourado do tema (legível no claro); a cor do grupo fica na faixa lateral. */}
            <span className="w-[36px] h-[36px] rounded-[11px] grid place-items-center shrink-0 border text-gold bg-gold/10 border-gold/25">
              <Icon size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              {/* Quebra linha em vez de cortar: no celular o total divide a largura. */}
              <div className="text-[11px] font-bold tracking-[0.08em] sm:tracking-[0.13em] uppercase text-tx2 leading-snug">{grupo.nome}</div>
              <div className="text-[11.5px] text-dim2 leading-snug mt-0.5">{descricao}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            {totalRotulo ?? (
              <>
                <div className={`mono text-[17px] font-extrabold leading-tight ${grupo.total > 0 ? 'text-red' : 'text-dim2'}`}>
                  {saida(grupo.total)}
                </div>
                <div className="mono text-[10.5px] text-dim2 mt-0.5">{formatPercent(grupo.pctReceita)} da receita</div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-line divide-y divide-line">{children}</div>
      {rodape}
    </div>
  );
}

/** Linha dentro de um bloco: rótulo, valor e o peso na receita. */
function Linha({
  rotulo,
  nota,
  cents,
  receita,
  cor,
  children,
}: {
  rotulo: string;
  nota?: string;
  cents: Cents;
  receita: Cents;
  cor: string;
  children?: React.ReactNode;
}) {
  const pct = safeDiv(cents, receita);
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[13px] ${cents > 0 ? 'text-tx' : 'text-dim'}`}>{rotulo}</div>
          {nota && <div className="text-[11px] text-dim2 mt-0.5">{nota}</div>}
        </div>
        <div className={`mono text-[13.5px] font-semibold shrink-0 ${cents > 0 ? 'text-tx' : 'text-dim2'}`}>{saida(cents)}</div>
      </div>
      <div className="flex items-center gap-2.5 mt-2">
        <div className="flex-1 h-[4px] rounded-full bg-trilha overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${cents > 0 ? Math.max(1.5, Math.min(100, pct * 100)) : 0}%`, background: cor }}
          />
        </div>
        <span className="mono text-[10.5px] text-dim2 w-[56px] text-right shrink-0">{formatPercent(pct)}</span>
      </div>
      {children}
    </div>
  );
}

/** Quadro interno com a quebra por pessoa. */
function Quebra({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-[10px] bg-card3 border border-line divide-y divide-line">{children}</div>;
}

// ─────────────────────────────── Principal ───────────────────────────────

export function Demonstrativo({
  pnl,
  categorias,
  custos,
  periodo,
  modoFrustrados,
  onModoFrustrados,
  onAddCusto,
}: {
  pnl: PnlResult;
  categorias: CategoriaCusto[];
  custos: CustoVariavel[];
  periodo: Periodo;
  modoFrustrados: DescontoFrustrados;
  onModoFrustrados: (v: DescontoFrustrados) => void;
  onAddCusto: () => void;
}) {
  const [aberta, setAberta] = useState<Set<string | null>>(new Set());
  const catMap = new Map(categorias.map((c) => [c.id, c]));
  const receita = pnl.receita_aprovada;
  const dre = useMemo(() => montarDRE(pnl), [pnl]);
  const degraus = useMemo(() => degrausCascata(dre, modoFrustrados === 'real'), [dre, modoFrustrados]);
  const { grupos } = dre;
  const lucroPositivo = pnl.lucro_real >= 0;
  const descontando = modoFrustrados === 'real';

  function toggleCat(id: string | null) {
    setAberta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const corCategoria = (id: string | null) =>
    corDaCategoria(catMap.get(id ?? '')?.cor, categorias.findIndex((c) => c.id === id));

  // Lucro que cada opção de desconto produz — dentro dos botões, para
  // comparar sem precisar clicar em cada uma.
  const lucroSemFrustrados = pnl.lucro_real + pnl.desconto_frustrados;
  const opcoesFrustrados: { id: DescontoFrustrados; label: string; hint: string; lucro: Cents }[] = [
    { id: 'nenhum', label: 'Nada', hint: 'igual ao BlueSales', lucro: lucroSemFrustrados },
    { id: 'real', label: 'Valor real perdido', hint: 'produto + frete', lucro: lucroSemFrustrados - pnl.perda_real_frustrados },
  ];

  // Para onde foi cada real: grupos com valor + o lucro.
  const destinos = [
    ...Object.values(grupos).filter((g) => g.total > 0),
    ...(pnl.lucro_real > 0
      ? [{ id: 'lucro', nome: 'Lucro real', total: pnl.lucro_real, pctReceita: pnl.margem_real, cor: COR_GRUPO.lucro }]
      : []),
  ];
  const somaDestinos = destinos.reduce((s, d) => s + d.total, 0) || 1;

  return (
    <section className="bg-card border border-line rounded-card overflow-hidden">
      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-3 px-4 lg:px-6 py-4 lg:py-5 border-b border-line">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] lg:text-[17px] font-extrabold text-tx tracking-tight">Demonstrativo de Resultados</h2>
          <p className="m-0 text-[12px] text-dim mt-0.5">Da receita ao lucro, etapa por etapa</p>
        </div>
        <span className="text-[10.5px] font-bold text-tx2 border border-line2 bg-card2 rounded-full px-[10px] py-[4px] whitespace-nowrap">
          {seloPeriodo(periodo, hojeIso())}
        </span>
      </header>

      {/* 1 · Cascata + subtotais */}
      <div className="px-4 lg:px-6 pt-5 pb-5 border-b border-line">
        <Cascata degraus={degraus} receita={receita} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 mt-5">
          {[dre.receitaLiquida, dre.margemContribuicao, dre.resultadoOperacional, dre.lucroReal].map((s, i, arr) => {
            const final = i === arr.length - 1;
            const cor = final ? (s.valor >= 0 ? 'text-grn' : 'text-red') : 'text-tx';
            return (
              <div
                key={s.nome}
                className={`rounded-[12px] border px-3.5 py-3 ${
                  final ? (s.valor >= 0 ? 'border-grn/30 bg-grn/[0.06]' : 'border-red/30 bg-red/[0.06]') : 'border-line bg-card2'
                }`}
              >
                <div className="text-[9.5px] uppercase tracking-[0.06em] sm:tracking-[0.12em] font-bold text-dim leading-[13px] min-h-[26px] sm:min-h-0">
                  <span className="text-dim2 mr-1">=</span>
                  {s.nome}
                </div>
                <div className={`mono text-[16px] lg:text-[18px] font-extrabold mt-1 truncate ${cor}`}>{formatBRL(s.valor)}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-[3px] rounded-full bg-trilha overflow-hidden">
                    <div
                      className={`h-full rounded-full ${final ? (s.valor >= 0 ? 'bg-grn' : 'bg-red') : 'bg-gold'}`}
                      style={{ width: `${Math.max(0, Math.min(100, s.pctReceita * 100))}%` }}
                    />
                  </div>
                  <span className="mono text-[10px] text-dim2">{formatPercent(s.pctReceita)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Receita */}
      <div className="px-4 lg:px-6 pt-5">
        <div className="rounded-[14px] border border-gold/25 bg-gradient-to-r from-gold/[0.09] via-gold/[0.03] to-transparent px-4 lg:px-5 py-4 flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-[40px] h-[40px] rounded-[12px] grid place-items-center shrink-0 text-gold bg-gold/10 border border-gold/30">
              <Coins size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.13em] uppercase text-tx2">Receita aprovada</div>
              <div className="text-[11.5px] text-dim2">
                {pnl.qtd_pagamentos} pagamento{pnl.qtd_pagamentos === 1 ? '' : 's'} confirmado{pnl.qtd_pagamentos === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          <div className="mono text-[22px] lg:text-[26px] font-extrabold text-gold2 tracking-tight shrink-0">{formatBRL(receita)}</div>
        </div>
      </div>

      {/* 2 · Blocos: à esquerda o que vai até a margem de contribuição,
            à direita o que vem depois dela. */}
      <div className="px-4 lg:px-6 py-5 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Bloco grupo={grupos.deducoes} Icon={Receipt} descricao="Cobrado pelo BlueSales sobre os pagamentos">
            <Linha rotulo="Taxas de Plataforma" cents={pnl.taxas_plataforma} receita={receita} cor={grupos.deducoes.cor} />
          </Bloco>

          <Bloco grupo={grupos.operacao} Icon={Package} descricao="Produto e frete dos pedidos pagos">
            <Linha rotulo="Custo dos Produtos" cents={pnl.custo_produtos} receita={receita} cor={grupos.operacao.cor} />
            <Linha rotulo="Frete" cents={pnl.frete} receita={receita} cor={grupos.operacao.cor} />
          </Bloco>

          <Bloco grupo={grupos.comissoes} Icon={Users} descricao="Vendedores e cobrança">
            <Linha
              rotulo="Comissões Vendedor"
              // A base não é a receita cheia: o BlueSales tira a taxa de
              // plataforma antes de comissionar. Mostrar a base deixa qualquer
              // divergência com o BlueSales visível na hora.
              nota={`sobre ${formatBRL(receita - pnl.taxas_plataforma)} (receita − taxas de plataforma)`}
              cents={pnl.comissoes_vendedor}
              receita={receita}
              cor={grupos.comissoes.cor}
            >
              {pnl.comissoes_por_vendedor.length > 0 && (
                <Quebra>
                  {pnl.comissoes_por_vendedor.map((v) => (
                    <div key={v.nome} className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[12.5px] font-semibold text-tx2 truncate">{v.nome}</span>
                          <SeloPct pct={v.pct} />
                        </div>
                        {/* Agendado explica o "R$ 0,00": vendeu, mas ainda não
                            recebeu — a comissão só entra com o pagamento. */}
                        <div className="text-[10.5px] text-dim2 mt-0.5">
                          agendou {formatBRL(v.agendado)}
                          {v.qtd_agendados > 0 && ` (${v.qtd_agendados})`} · aprovado {formatBRL(v.receita)}
                        </div>
                      </div>
                      <div className="mono text-[12.5px] font-semibold text-tx2 shrink-0">{formatBRL(v.comissao)}</div>
                    </div>
                  ))}
                </Quebra>
              )}
            </Linha>
            <Linha rotulo="Comissões Cobrança" cents={pnl.comissoes_cobranca} receita={receita} cor={grupos.comissoes.cor}>
              <Quebra>
                <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12.5px] font-semibold text-tx2 truncate">{RESPONSAVEL_COBRANCA}</span>
                    <SeloPct pct={COMISSAO_COBRANCA} />
                    <span className="text-[10.5px] text-dim2 truncate">de {formatBRL(receita)}</span>
                  </div>
                  <div className="mono text-[12.5px] font-semibold text-tx2 shrink-0">{formatBRL(pnl.comissoes_cobranca)}</div>
                </div>
              </Quebra>
            </Linha>
          </Bloco>
        </div>

        <div className="flex flex-col gap-4">
          <Bloco grupo={grupos.marketing} Icon={Megaphone} descricao="Anúncios lançados na tela Marketing">
            <Linha rotulo="Investimento em Ads" cents={pnl.investimento_ads} receita={receita} cor={grupos.marketing.cor} />
            <Linha rotulo="Taxas sobre Investimento" cents={pnl.taxas_investimento} receita={receita} cor={grupos.marketing.cor} />
          </Bloco>

          <Bloco
            grupo={grupos.variaveis}
            Icon={Wallet}
            descricao={
              pnl.qtd_lancamentos > 0
                ? `${pnl.custos_variaveis_por_categoria.length} categorias · ${pnl.qtd_lancamentos} lançamentos`
                : 'Lançados por você'
            }
            rodape={
              <button
                onClick={onAddCusto}
                className="w-full flex items-center justify-center gap-[7px] py-3 text-[12.5px] text-gold2 font-semibold border-t border-dashed border-gold/25 hover:bg-gold/[0.06] transition-colors"
              >
                <Plus size={14} strokeWidth={2} /> Adicionar custo
              </button>
            }
          >
            {pnl.custos_variaveis_por_categoria.length === 0 ? (
              <div className="px-4 py-5 text-center text-[12px] text-dim2">Nenhum custo lançado neste período.</div>
            ) : (
              <>
                {/* Peso de cada categoria no total dos variáveis */}
                <div className="px-4 py-3">
                  <div className="flex h-[8px] rounded-full overflow-hidden gap-[2px] bg-trilha">
                    {pnl.custos_variaveis_por_categoria.map((agg) => (
                      <div
                        key={String(agg.categoria_id)}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${safeDiv(agg.total, pnl.custos_variaveis_total) * 100}%`, background: corCategoria(agg.categoria_id) }}
                      />
                    ))}
                  </div>
                </div>
                {pnl.custos_variaveis_por_categoria.map((agg) => {
                  const cat = catMap.get(agg.categoria_id ?? '');
                  const cor = corCategoria(agg.categoria_id);
                  const isOpen = aberta.has(agg.categoria_id);
                  const share = safeDiv(agg.total, pnl.custos_variaveis_total);
                  const lancs = custos
                    .filter((c) => c.categoria_id === agg.categoria_id && custoNoPeriodo(c, periodo) > 0)
                    .map((c) => ({ c, valor: custoNoPeriodo(c, periodo) as Cents }));
                  return (
                    <div key={String(agg.categoria_id)}>
                      <button
                        onClick={() => toggleCat(agg.categoria_id)}
                        className="w-full text-left px-4 py-3 hover:bg-hover transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2.5 min-w-0">
                            {isOpen ? (
                              <ChevronDown size={14} className="text-dim2 shrink-0" />
                            ) : (
                              <ChevronRight size={14} className="text-dim2 shrink-0" />
                            )}
                            <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: cor }} />
                            <span className="text-[13px] text-tx leading-snug">{cat?.nome ?? 'Sem categoria'}</span>
                            <span className="text-[10px] text-dim2 border border-line2 rounded-full px-[7px] py-[1px] shrink-0">
                              {agg.qtd} lanç.
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="mono text-[13px] font-semibold text-tx block">{saida(agg.total)}</span>
                            <span className="mono text-[10px] text-dim2">{formatPercent(share)} dos variáveis</span>
                          </span>
                        </div>
                      </button>
                      {isOpen &&
                        lancs.map(({ c, valor }) => (
                          <div key={c.id} className="flex items-center justify-between gap-3 pl-[46px] pr-4 py-2 bg-card3 border-t border-line">
                            <span className="text-[12px] text-dim truncate">
                              {c.descricao}
                              <span className="text-dim2 ml-2 mono text-[10.5px]">{c.data.split('-').reverse().slice(0, 2).join('/')}</span>
                              {c.recorrencia === 'mensal' && (
                                <span className="ml-2 text-[9px] text-gold2 border border-gold/30 rounded px-1 py-[1px] uppercase tracking-wide">
                                  mensal
                                </span>
                              )}
                            </span>
                            <span className="mono text-[12px] text-dim shrink-0">{saida(valor)}</span>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </>
            )}
          </Bloco>

          {/* Perdas: sempre mostradas; só descontam se o botão mandar. */}
          <Bloco
            grupo={grupos.perdas}
            Icon={TriangleAlert}
            descricao={`${pnl.qtd_frustrados} pedido${pnl.qtd_frustrados === 1 ? '' : 's'} frustrado${pnl.qtd_frustrados === 1 ? '' : 's'}`}
            totalRotulo={
              descontando ? (
                <>
                  <div className="mono text-[17px] font-extrabold leading-tight text-red">{saida(pnl.desconto_frustrados)}</div>
                  <div className="mono text-[10.5px] text-dim2 mt-0.5">{formatPercent(grupos.perdas.pctReceita)} da receita</div>
                </>
              ) : (
                <>
                  <div className="mono text-[17px] font-extrabold leading-tight text-dim2">{formatBRL(0)}</div>
                  <div className="text-[10.5px] text-dim2 mt-0.5">mostrado, não descontado</div>
                </>
              )
            }
          >
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] text-tx">Valor perdido</div>
                <div className="text-[11px] text-dim2 mt-0.5">receita que não entrou · informativo</div>
              </div>
              <div className="mono text-[13.5px] font-semibold text-dim shrink-0">{formatBRL(pnl.valor_frustrado)}</div>
            </div>
            <div className={`px-4 py-3 flex items-start justify-between gap-3 ${descontando ? 'bg-red/[0.06]' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] ${descontando ? 'font-semibold text-tx' : 'text-tx'}`}>Valor real perdido</span>
                  {descontando && (
                    <span className="text-[9px] uppercase tracking-wide font-bold text-red border border-red/40 bg-red/10 rounded-full px-[7px] py-[1px]">
                      descontando
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-dim2 mt-0.5">custo do produto + frete</div>
              </div>
              <div className={`mono text-[13.5px] font-semibold shrink-0 ${descontando ? 'text-red' : 'text-dim'}`}>
                {descontando ? saida(pnl.perda_real_frustrados) : formatBRL(pnl.perda_real_frustrados)}
              </div>
            </div>
            <div className="px-4 py-3 bg-card3">
              <div className="text-[11px] text-dim2 mb-2">Descontar do Lucro Real:</div>
              <div className="grid grid-cols-2 gap-2">
                {opcoesFrustrados.map((op) => {
                  const ativo = modoFrustrados === op.id;
                  return (
                    <button
                      key={op.id}
                      onClick={() => onModoFrustrados(op.id)}
                      className={`text-left px-3 py-2.5 rounded-[10px] border transition-colors ${
                        ativo ? 'border-gold/50 bg-gold/10' : 'border-line2 hover:border-dim2'
                      }`}
                    >
                      <span className={`block text-[12px] font-semibold ${ativo ? 'text-tx' : 'text-dim'}`}>{op.label}</span>
                      {/* O lucro que cada opção produz, para comparar sem clicar */}
                      <span className={`block mono text-[13.5px] font-extrabold mt-0.5 ${op.lucro >= 0 ? 'text-grn' : 'text-red'}`}>
                        {formatBRL(op.lucro)}
                      </span>
                      <span className="block text-[10px] text-dim2 mt-0.5">{op.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Bloco>
        </div>
      </div>

      {/* 3 · Resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] border-t border-line">
        {/* Para onde foi cada real */}
        <div className="px-4 lg:px-6 py-5">
          <div className="text-[11px] font-bold tracking-[0.13em] uppercase text-tx2">Para onde foi cada R$ 1,00</div>
          <div className="text-[11.5px] text-dim2 mt-0.5">Quanto de cada real recebido foi para cada grupo</div>
          <div className="flex h-[12px] rounded-full overflow-hidden gap-[2px] mt-4 bg-trilha">
            {destinos.map((d) => (
              <div
                key={d.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(d.total / somaDestinos) * 100}%`, background: d.cor }}
                title={d.nome}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4">
            {destinos.map((d) => (
              <div key={d.id} className="flex items-start gap-2 min-w-0">
                <span className="w-[9px] h-[9px] rounded-[3px] mt-[5px] shrink-0" style={{ background: d.cor }} />
                <div className="min-w-0">
                  <div className="text-[11.5px] text-dim truncate">{d.nome}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`mono text-[13px] font-bold ${d.id === 'lucro' ? 'text-grn' : 'text-tx'}`}>
                      {formatBRL(Math.round(safeDiv(d.total, receita) * 100))}
                    </span>
                    <span className="mono text-[10px] text-dim2">{formatPercent(safeDiv(d.total, receita))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lucro real — o painel inteiro fica verde no lucro e vermelho no prejuízo */}
        <div
          className={`px-5 lg:px-6 py-6 flex flex-col justify-center border-t lg:border-t-0 lg:border-l bg-gradient-to-br ${
            lucroPositivo ? 'from-[#10261c] via-[#122018] to-[#111714] border-grn/30' : 'from-[#2a1419] via-[#231519] to-[#1b1416] border-red/30'
          }`}
        >
          <div className={`text-[11px] font-bold tracking-[0.16em] uppercase ${lucroPositivo ? 'text-grn' : 'text-red'}`}>
            {lucroPositivo ? 'Lucro real' : 'Prejuízo real'}
          </div>
          <div
            className={`mono text-[34px] lg:text-[38px] font-extrabold tracking-tight leading-none mt-2 ${
              lucroPositivo ? 'text-grn drop-shadow-[0_0_20px_rgba(52,211,153,0.22)]' : 'text-red drop-shadow-[0_0_20px_rgba(251,113,133,0.22)]'
            }`}
          >
            {formatBRL(pnl.lucro_real)}
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span
              className={`mono text-[11px] rounded-full px-[10px] py-[3px] border ${
                lucroPositivo ? 'text-grn border-grn/35 bg-grn/10' : 'text-red border-red/35 bg-red/10'
              }`}
            >
              Margem {formatPercent(pnl.margem_real)}
            </span>
          </div>
          <div className="text-[11px] text-dim2 mt-3 leading-relaxed">
            Resultado operacional {formatBRL(dre.resultadoOperacional.valor)} − custos variáveis {formatBRL(grupos.variaveis.total)}
            {descontando && ` − perda real dos frustrados ${formatBRL(pnl.desconto_frustrados)}`}
          </div>
        </div>
      </div>
    </section>
  );
}
