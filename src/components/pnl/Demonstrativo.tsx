import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  type LucideIcon,
  Megaphone,
  Plus,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Users,
} from 'lucide-react';
import type { CategoriaCusto, CustoVariavel, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { formatBRL, formatBRLSigned, formatPercent, safeDiv } from '@/lib/money';
import { type DescontoFrustrados, type PnlResult, custoNoPeriodo } from '@/lib/pnl';

function Sec({ children, hl = false }: { children: React.ReactNode; hl?: boolean }) {
  return (
    <div
      className={`px-[18px] pt-[16px] pb-[7px] text-[9.5px] tracking-[0.16em] uppercase font-bold ${
        hl ? 'text-pur2' : 'text-dim2'
      }`}
    >
      {children}
    </div>
  );
}

/** Linha de custo do Afterpay: chip + label + valor + % receita + barra. */
function LinhaCusto({
  Icon,
  label,
  note,
  cents,
  receita,
  zero = false,
}: {
  Icon: LucideIcon;
  label: string;
  note?: string;
  cents: Cents;
  receita: Cents;
  zero?: boolean;
}) {
  const pct = safeDiv(cents, receita);
  const barW = cents > 0 ? Math.max(1.5, Math.min(100, pct * 100)) : 0;
  return (
    <div className="group px-[18px] py-[10px] border-b border-[#212129] hover:bg-[#1e1e27] transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-[11px] min-w-0">
          <span className="w-[30px] h-[30px] rounded-[9px] bg-[#23232c] grid place-items-center text-dim2 shrink-0 group-hover:text-dim transition-colors">
            <Icon size={15} strokeWidth={1.9} />
          </span>
          <span className="text-[13.5px] text-[#dcdce6] truncate">
            {label}
            {note && <span className="block text-[10.5px] text-dim2 mt-0.5">{note}</span>}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className={`mono text-[13.5px] font-semibold ${zero ? 'text-dim' : 'text-red'}`}>
            {zero ? formatBRL(0) : formatBRLSigned(cents, 'custo')}
          </div>
          <div className="text-[10px] text-dim2 mono mt-0.5">{formatPercent(pct)} da receita</div>
        </div>
      </div>
      <div className="mt-[9px] ml-[41px] h-[3px] rounded-full bg-[#22222b] overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-red/40 to-red" style={{ width: `${barW}%` }} />
      </div>
    </div>
  );
}

/** Selo que marca qual das duas perdas está descontando do lucro. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-wide font-bold text-red border border-red/40 bg-red/10 rounded-full px-[7px] py-[1.5px] shrink-0">
      {children}
    </span>
  );
}

/** Barra segmentada: cada categoria vira um trecho colorido. */
function BarraSegmentada({
  segmentos,
}: {
  segmentos: { total: Cents; cor: string }[];
}) {
  const soma = segmentos.reduce((a, s) => a + s.total, 0) || 1;
  return (
    <div className="flex h-[7px] rounded-full overflow-hidden gap-[2px] bg-[#22222b]">
      {segmentos.map((s, i) => (
        <div key={i} style={{ width: `${(s.total / soma) * 100}%`, background: s.cor }} className="h-full first:rounded-l-full last:rounded-r-full" />
      ))}
    </div>
  );
}

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
  const lucroPositivo = pnl.lucro_real >= 0;

  function toggleCat(id: string | null) {
    setAberta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Segmentos da barra "para onde foi cada real"
  const composicao = [
    { label: 'Custos Afterpay', total: pnl.custos_afterpay, cor: '#fb7185' },
    { label: 'Custos variáveis', total: pnl.custos_variaveis_total, cor: '#a855f7' },
    { label: 'Perda dos frustrados', total: pnl.desconto_frustrados, cor: '#fbbf24' },
    { label: 'Lucro real', total: Math.max(0, pnl.lucro_real), cor: '#34d399' },
  ];
  const somaComp = composicao.reduce((a, s) => a + s.total, 0) || 1;

  return (
    <div className="bg-card border border-line rounded-card overflow-hidden">
      <div className="px-[18px] py-[15px] border-b border-line">
        <h2 className="m-0 text-[14.5px] font-bold">Demonstrativo P&amp;L</h2>
      </div>

      {/* RECEITA — destaque */}
      <Sec>Receita</Sec>
      <div className="mx-[18px] mb-1 rounded-[12px] border border-grn/20 bg-grn/[0.06] px-4 py-[13px] flex items-center justify-between">
        <div className="flex items-center gap-[11px]">
          <span className="w-[34px] h-[34px] rounded-[10px] bg-grn/15 grid place-items-center text-grn shrink-0">
            <DollarSign size={17} strokeWidth={2} />
          </span>
          <div>
            <div className="text-[13.5px] text-tx font-semibold">Faturamento Aprovado</div>
            <div className="text-[10.5px] text-dim2 mt-0.5">{pnl.qtd_pagamentos} pagamentos confirmados</div>
          </div>
        </div>
        <div className="mono text-[17px] font-extrabold text-grn">{formatBRL(receita)}</div>
      </div>

      <Sec>Deduções</Sec>
      <LinhaCusto Icon={DollarSign} label="Taxas de Plataforma" cents={pnl.taxas_plataforma} receita={receita} />

      <Sec>Custos operacionais</Sec>
      <LinhaCusto Icon={ShoppingCart} label="Custo dos Produtos" cents={pnl.custo_produtos} receita={receita} />
      <LinhaCusto Icon={Truck} label="Frete" cents={pnl.frete} receita={receita} />
      <LinhaCusto Icon={Users} label="Comissões Vendedor" cents={pnl.comissoes_vendedor} receita={receita} />
      <LinhaCusto Icon={Users} label="Comissões Cobrança" cents={pnl.comissoes_cobranca} receita={receita} />

      <Sec>Marketing</Sec>
      <LinhaCusto Icon={Megaphone} label="Investimento em Ads" cents={pnl.investimento_ads} receita={receita} />
      <LinhaCusto Icon={DollarSign} label="Taxas sobre Investimento" cents={pnl.taxas_investimento} receita={receita} zero={pnl.taxas_investimento === 0} />

      {/* CUSTOS VARIÁVEIS */}
      <Sec hl>Custos variáveis · lançados por você</Sec>
      <div className="mx-[18px] mb-2 rounded-[12px] border border-pur/25 bg-pur/[0.05] overflow-hidden">
        <div className="px-4 py-[13px]">
          <div className="flex items-center justify-between mb-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-pur2 font-bold text-[13.5px]">Total de custos variáveis</span>
              <span className="text-[9.5px] text-dim2 border border-line2 rounded-full px-[7px] py-[2px]">
                {pnl.custos_variaveis_por_categoria.length} categorias · {pnl.qtd_lancamentos} lançamentos
              </span>
            </div>
            <span className="mono text-[15px] font-extrabold text-pur2">{formatBRLSigned(pnl.custos_variaveis_total, 'custo')}</span>
          </div>
          <BarraSegmentada
            segmentos={pnl.custos_variaveis_por_categoria.map((agg) => ({
              total: agg.total,
              cor: catMap.get(agg.categoria_id ?? '')?.cor ?? '#a855f7',
            }))}
          />
        </div>

        <div className="border-t border-pur/15">
          {pnl.custos_variaveis_por_categoria.map((agg) => {
            const cat = catMap.get(agg.categoria_id ?? '');
            const cor = cat?.cor ?? '#a855f7';
            const nome = cat?.nome ?? 'Sem categoria';
            const isOpen = aberta.has(agg.categoria_id);
            const shareVar = safeDiv(agg.total, pnl.custos_variaveis_total);
            const lancs = custos
              .filter((c) => c.categoria_id === agg.categoria_id && custoNoPeriodo(c, periodo) > 0)
              .map((c) => ({ c, valor: custoNoPeriodo(c, periodo) as Cents }));
            return (
              <div key={String(agg.categoria_id)} className="border-b border-pur/10 last:border-b-0">
                <button
                  onClick={() => toggleCat(agg.categoria_id)}
                  className="w-full text-left px-4 py-[11px] hover:bg-pur/[0.06] transition-colors"
                  style={{ boxShadow: `inset 3px 0 0 ${cor}` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-[9px] min-w-0">
                      {isOpen ? <ChevronDown size={13} className="text-dim2 shrink-0" /> : <ChevronRight size={13} className="text-dim2 shrink-0" />}
                      <span className="w-[9px] h-[9px] rounded-full inline-block shrink-0" style={{ background: cor }} />
                      <span className="text-[13.5px] text-[#dcdce6] truncate">{nome}</span>
                      <span className="text-[9.5px] text-dim2 border border-line2 rounded-full px-[7px] py-[1.5px] shrink-0">{agg.qtd} lanç.</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="mono text-[13.5px] font-semibold text-red block">{formatBRLSigned(agg.total, 'custo')}</span>
                      <span className="text-[10px] text-dim2 mono">{formatPercent(shareVar)} dos variáveis</span>
                    </span>
                  </div>
                  <div className="mt-[9px] ml-[27px] h-[3px] rounded-full bg-[#22222b] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, shareVar * 100)}%`, background: cor }} />
                  </div>
                </button>
                {isOpen &&
                  lancs.map(({ c, valor }) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between pl-[40px] pr-4 py-[7px] border-t border-pur/10 bg-[#161620]"
                    >
                      <span className="text-[12.5px] text-dim truncate">
                        {c.descricao}
                        <span className="text-dim2 ml-2 mono text-[11px]">
                          {c.data.split('-').reverse().slice(0, 2).join('/')}
                        </span>
                        {c.recorrencia === 'mensal' && (
                          <span className="ml-2 text-[9px] text-pur2 border border-pur/30 rounded px-1 py-[1px] uppercase tracking-wide">mensal</span>
                        )}
                      </span>
                      <span className="mono text-[12.5px] text-dim shrink-0">{formatBRLSigned(valor, 'custo')}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        <button
          onClick={onAddCusto}
          className="w-full flex items-center justify-center gap-[7px] py-[11px] text-[12.5px] text-pur2 font-semibold border-t border-dashed border-pur/25 hover:bg-pur/[0.06] transition-colors"
        >
          <Plus size={13} strokeWidth={1.9} /> Adicionar custo
        </button>
      </div>

      {/* PERDAS — valor do pedido (informativo) e perda real (esta desconta) */}
      <Sec>Perdas · pedidos frustrados</Sec>
      <div className="mx-[18px] mb-3 rounded-[12px] border border-yel/25 bg-yel/[0.04] overflow-hidden">
        {/* Valor cheio dos pedidos — desconta quando o botão está DESLIGADO */}
        <div
          className={`px-4 py-[13px] flex items-center justify-between gap-3 border-b border-yel/15 ${
            modoFrustrados === 'cheio' ? 'bg-red/[0.07]' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TriangleAlert size={15} className={modoFrustrados === 'cheio' ? 'text-red shrink-0' : 'text-yel shrink-0'} />
              <span className={`text-[13.5px] ${modoFrustrados === 'cheio' ? 'font-semibold text-tx' : 'text-[#dcdce6]'}`}>
                Valor perdido
              </span>
              <span className="text-[9.5px] text-dim2 border border-line2 rounded-full px-[7px] py-[1.5px] shrink-0">
                {pnl.qtd_frustrados} pedidos
              </span>
              {modoFrustrados === 'cheio' && <Chip>descontando</Chip>}
            </div>
            <div className="text-[11px] text-dim2 mt-[3px] ml-[23px]">receita que não entrou</div>
          </div>
          <span className={`mono shrink-0 ${modoFrustrados === 'cheio' ? 'text-[15px] font-extrabold text-red' : 'text-[14px] font-bold text-dim'}`}>
            {modoFrustrados === 'cheio' ? formatBRLSigned(pnl.valor_frustrado, 'custo') : formatBRL(pnl.valor_frustrado)}
          </span>
        </div>

        {/* Perda de caixa — desconta quando o botão está LIGADO */}
        <div className={`px-4 py-[13px] flex items-center justify-between gap-3 ${modoFrustrados === 'real' ? 'bg-red/[0.07]' : ''}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TriangleAlert size={15} className={modoFrustrados === 'real' ? 'text-red shrink-0' : 'text-yel shrink-0'} />
              <span className={`text-[13.5px] ${modoFrustrados === 'real' ? 'font-semibold text-tx' : 'text-[#dcdce6]'}`}>
                Valor real perdido
              </span>
              {modoFrustrados === 'real' && <Chip>descontando</Chip>}
            </div>
            <div className="text-[11px] text-dim2 mt-[3px] ml-[23px]">custo do produto + frete</div>
          </div>
          <span className={`mono shrink-0 ${modoFrustrados === 'real' ? 'text-[15px] font-extrabold text-red' : 'text-[14px] font-bold text-dim'}`}>
            {modoFrustrados === 'real' ? formatBRLSigned(pnl.perda_real_frustrados, 'custo') : formatBRL(pnl.perda_real_frustrados)}
          </span>
        </div>

        {/* O que os frustrados descontam do Lucro Real */}
        <div className="px-4 py-[12px] border-t border-yel/15 bg-[#17171e]">
          <div className="text-[11px] text-dim2 mb-[8px]">Descontar do Lucro Real:</div>
          <div className="flex flex-wrap gap-[6px]">
            {(
              [
                { id: 'nenhum', label: 'Nada', hint: 'igual ao BlueSales' },
                { id: 'real', label: 'Valor real perdido', hint: 'produto + frete' },
                { id: 'cheio', label: 'Valor perdido total', hint: 'valor dos pedidos' },
              ] as const
            ).map((op) => {
              const ativo = modoFrustrados === op.id;
              return (
                <button
                  key={op.id}
                  onClick={() => onModoFrustrados(op.id)}
                  className={`text-left px-3 py-[7px] rounded-[9px] border text-[12px] font-semibold transition-colors ${
                    ativo
                      ? 'border-red/50 bg-red/15 text-tx'
                      : 'border-line2 text-dim hover:text-tx hover:border-line2'
                  }`}
                >
                  {op.label}
                  <span className="block text-[10px] font-medium text-dim2 mt-[1px]">{op.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* PARA ONDE FOI CADA REAL */}
      <div className="mx-[18px] mb-2 rounded-[12px] bg-[#17171e] border border-line px-4 py-[14px]">
        <div className="text-[9.5px] tracking-[0.16em] uppercase font-bold text-dim2 mb-[10px]">Para onde foi cada real do faturamento</div>
        <div className="flex h-[10px] rounded-full overflow-hidden gap-[2px]">
          {composicao.map((s, i) => (
            <div key={i} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.total / somaComp) * 100}%`, background: s.cor }} title={s.label} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-[10px]">
          {composicao.map((s, i) => (
            <span key={i} className="flex items-center gap-[6px] text-[11px] text-dim">
              <span className="w-[8px] h-[8px] rounded-sm" style={{ background: s.cor }} />
              {s.label}
              <span className="mono text-dim2">{formatPercent(safeDiv(s.total, somaComp))}</span>
            </span>
          ))}
        </div>
      </div>

      {/* LUCRO REAL — o card inteiro fica verde no lucro e vermelho no prejuízo */}
      <div
        className={`px-[18px] py-[20px] flex items-end justify-between gap-4 bg-gradient-to-br border-t transition-colors ${
          lucroPositivo
            ? 'from-[#12281f] via-[#141f1b] to-[#141a18] border-grn/40'
            : 'from-[#2c1620] via-[#25181e] to-[#1f171a] border-red/40'
        }`}
      >
        <div className="text-[15px] font-extrabold tracking-wide">
          <span className={lucroPositivo ? 'text-grn' : 'text-red'}>
            {lucroPositivo ? 'LUCRO REAL' : 'PREJUÍZO REAL'}
          </span>
          <span className="block font-medium text-[11px] text-dim2 tracking-normal mt-[6px] max-w-[220px] leading-relaxed">
            receita − custos Afterpay − custos variáveis
            {modoFrustrados === 'real' && ' − perda real dos frustrados'}
            {modoFrustrados === 'cheio' && ' − valor dos frustrados'}
          </span>
        </div>
        <div className="text-right">
          <div
            className={`mono text-[32px] font-extrabold tracking-tight leading-none ${
              lucroPositivo
                ? 'text-grn drop-shadow-[0_0_18px_rgba(52,211,153,0.25)]'
                : 'text-red drop-shadow-[0_0_18px_rgba(251,113,133,0.25)]'
            }`}
          >
            {formatBRL(pnl.lucro_real)}
          </div>
          <div className="inline-flex items-center gap-2 mt-2 text-[11px]">
            <span
              className={`rounded-full px-[9px] py-[3px] mono border ${
                lucroPositivo ? 'text-grn border-grn/35 bg-grn/10' : 'text-red border-red/35 bg-red/10'
              }`}
            >
              Margem {formatPercent(pnl.margem_real)}
            </span>
          </div>
        </div>
      </div>

      {/* COMPARAÇÃO AFTERPAY */}
      <div className="px-[18px] py-[13px] flex items-center justify-between flex-wrap gap-2 bg-[#141319] border-t border-[#22222b] text-[12px] text-dim">
        <div>
          Lucro segundo o Afterpay: <b className="text-[#cfcfdd] font-semibold mono">{formatBRL(pnl.lucro_afterpay)}</b>{' '}
          <span className="text-dim2">(margem {formatPercent(pnl.margem_afterpay)})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dim2">o Afterpay escondia</span>
          <span className="mono font-bold text-yel bg-yel/10 border border-yel/25 rounded-full px-[10px] py-[3px]">
            {formatBRLSigned(pnl.diferenca_afterpay, 'entrada')}
          </span>
        </div>
      </div>
    </div>
  );
}
