import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  Megaphone,
  Plus,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Users,
} from 'lucide-react';
import type { CategoriaCusto, CustoVariavel, Periodo } from '@/types';
import type { Cents } from '@/lib/money';
import { formatBRL, formatBRLSigned, formatPercent } from '@/lib/money';
import { type PnlResult, custoNoPeriodo } from '@/lib/pnl';

function Sec({ children, hl = false }: { children: React.ReactNode; hl?: boolean }) {
  return (
    <div
      className={`px-[18px] pt-[14px] pb-[5px] text-[9.5px] tracking-[0.16em] uppercase font-bold ${
        hl ? 'text-pur2' : 'text-dim2'
      }`}
    >
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  note,
  value,
  tone = 'neg',
  className = '',
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  note?: React.ReactNode;
  value: string;
  tone?: 'neg' | 'pos' | 'zero' | 'warn';
  className?: string;
}) {
  const color =
    tone === 'pos' ? 'text-grn' : tone === 'neg' ? 'text-red' : tone === 'warn' ? 'text-yel' : 'text-dim';
  return (
    <div className={`flex items-center justify-between px-[18px] py-[10.5px] border-b border-[#22222b] ${className}`}>
      <div className="flex items-center gap-[10px] text-[13.5px] text-[#d6d6e2]">
        {icon && <span className="text-dim2">{icon}</span>}
        <span>
          {label}
          {note && <span className="block text-[10.5px] text-dim2 mt-0.5">{note}</span>}
        </span>
      </div>
      <div className={`mono text-[13.5px] font-semibold whitespace-nowrap ${color}`}>{value}</div>
    </div>
  );
}

export function Demonstrativo({
  pnl,
  categorias,
  custos,
  periodo,
  considerarFrustrados,
  onToggleFrustrados,
  onAddCusto,
}: {
  pnl: PnlResult;
  categorias: CategoriaCusto[];
  custos: CustoVariavel[];
  periodo: Periodo;
  considerarFrustrados: boolean;
  onToggleFrustrados: (v: boolean) => void;
  onAddCusto: () => void;
}) {
  const [aberta, setAberta] = useState<Set<string | null>>(new Set());
  const catMap = new Map(categorias.map((c) => [c.id, c]));
  const ic = { width: 16, height: 16, strokeWidth: 1.9 };

  function toggleCat(id: string | null) {
    setAberta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-card border border-line rounded-card overflow-hidden">
      <div className="px-[18px] py-[15px] flex items-center justify-between border-b border-line">
        <h2 className="m-0 text-[14.5px] font-bold">Demonstrativo P&amp;L</h2>
        <label className="inline-flex items-center gap-[9px] text-[11px] text-dim cursor-pointer select-none">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={considerarFrustrados}
            onChange={(e) => onToggleFrustrados(e.target.checked)}
          />
          <span className="w-[29px] h-4 rounded-full bg-[#2f2f3b] relative transition-colors peer-checked:bg-pur3 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:w-[11px] after:h-[11px] after:rounded-full after:bg-[#75758a] after:transition-all peer-checked:after:left-[15px] peer-checked:after:bg-white" />
          Considerar frustrados como perda
        </label>
      </div>

      <Sec>Receita</Sec>
      <Row label="Faturamento Aprovado" note={`${pnl.qtd_pagamentos} pagamentos confirmados`} value={formatBRL(pnl.receita_aprovada)} tone="pos" />

      <Sec>Deduções</Sec>
      <Row icon={<DollarSign {...ic} />} label="Taxas de Plataforma" value={formatBRLSigned(pnl.taxas_plataforma, 'custo')} />

      <Sec>Custos operacionais</Sec>
      <Row icon={<ShoppingCart {...ic} />} label="Custo dos Produtos" value={formatBRLSigned(pnl.custo_produtos, 'custo')} />
      <Row icon={<Truck {...ic} />} label="Frete" value={formatBRLSigned(pnl.frete, 'custo')} />
      <Row icon={<Users {...ic} />} label="Comissões Vendedor" value={formatBRLSigned(pnl.comissoes_vendedor, 'custo')} />
      <Row icon={<Users {...ic} />} label="Comissões Cobrança" value={formatBRLSigned(pnl.comissoes_cobranca, 'custo')} />

      <Sec>Marketing</Sec>
      <Row icon={<Megaphone {...ic} />} label="Investimento em Ads" value={formatBRLSigned(pnl.investimento_ads, 'custo')} />
      <Row
        icon={<DollarSign {...ic} />}
        label="Taxas sobre Investimento"
        value={pnl.taxas_investimento === 0 ? formatBRL(0) : formatBRLSigned(pnl.taxas_investimento, 'custo')}
        tone={pnl.taxas_investimento === 0 ? 'zero' : 'neg'}
      />

      <Sec hl>Custos variáveis · lançados por você</Sec>
      <div className="flex items-center justify-between px-[18px] py-[10.5px] border-b border-[#22222b] bg-[#191921]">
        <div className="flex items-center gap-[10px] text-pur2 font-semibold text-[13.5px]">
          Total de custos variáveis
          <span className="text-[9.5px] text-dim2 border border-line2 rounded-full px-[7px] py-[2px]">
            {pnl.custos_variaveis_por_categoria.length} categorias · {pnl.qtd_lancamentos} lançamentos
          </span>
        </div>
        <div className="mono text-[13.5px] font-semibold text-red">{formatBRLSigned(pnl.custos_variaveis_total, 'custo')}</div>
      </div>

      {pnl.custos_variaveis_por_categoria.map((agg) => {
        const cat = catMap.get(agg.categoria_id ?? '');
        const cor = cat?.cor ?? '#a855f7';
        const nome = cat?.nome ?? 'Sem categoria';
        const isOpen = aberta.has(agg.categoria_id);
        const lancs = custos
          .filter((c) => c.categoria_id === agg.categoria_id && custoNoPeriodo(c, periodo) > 0)
          .map((c) => ({ c, valor: custoNoPeriodo(c, periodo) as Cents }));
        return (
          <div key={String(agg.categoria_id)}>
            <button
              onClick={() => toggleCat(agg.categoria_id)}
              className="w-full flex items-center justify-between pl-[34px] pr-[18px] py-[10.5px] border-b border-[#22222b] bg-[#191921] hover:bg-[#1d1d27] text-left"
            >
              <span className="flex items-center gap-[8px] text-[13.5px] text-[#d6d6e2]">
                {isOpen ? <ChevronDown size={13} className="text-dim2" /> : <ChevronRight size={13} className="text-dim2" />}
                <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: cor }} />
                {nome}
                <span className="text-[9.5px] text-dim2 border border-line2 rounded-full px-[7px] py-[2px]">{agg.qtd} lanç.</span>
              </span>
              <span className="mono text-[13.5px] font-semibold text-red">{formatBRLSigned(agg.total, 'custo')}</span>
            </button>
            {isOpen &&
              lancs.map(({ c, valor }) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between pl-[58px] pr-[18px] py-2 border-b border-[#22222b] bg-[#151519]"
                >
                  <span className="text-[12.5px] text-dim">
                    {c.descricao}
                    <span className="text-dim2 ml-2 mono text-[11px]">{c.data.split('-').reverse().slice(0, 2).join('/')}</span>
                  </span>
                  <span className="mono text-[12.5px] text-dim">{formatBRLSigned(valor, 'custo')}</span>
                </div>
              ))}
          </div>
        );
      })}

      <div className="px-[18px] py-[13px] bg-[#191921] border-b border-[#22222b]">
        <button
          onClick={onAddCusto}
          className="inline-flex items-center gap-[7px] text-[12.5px] text-pur2 font-semibold border border-dashed border-[#45356b] rounded-[9px] px-[13px] py-2 hover:bg-[#20182e]"
        >
          <Plus size={13} strokeWidth={1.9} /> Adicionar custo
        </button>
      </div>

      <Sec>
        Perdas{' '}
        <span className="text-[#45454f] tracking-normal normal-case font-medium">(informativo — não entra no lucro)</span>
      </Sec>
      <Row
        icon={<TriangleAlert {...ic} />}
        label="Frustrados (valor perdido)"
        note={`${pnl.qtd_frustrados} pedidos`}
        value={formatBRLSigned(pnl.valor_frustrado, 'custo')}
        tone={considerarFrustrados ? 'neg' : 'warn'}
      />

      <div className="px-[18px] py-[18px] flex items-end justify-between bg-gradient-to-b from-[#1e1a2a] to-[#1a1a22] border-t border-[#3a2f55]">
        <div className="text-[14.5px] font-extrabold tracking-wide">
          LUCRO REAL
          <span className="block font-medium text-[11px] text-dim2 tracking-normal mt-[5px]">
            receita − custos Afterpay − custos variáveis{considerarFrustrados ? ' − frustrados' : ''}
          </span>
        </div>
        <div className="text-right">
          <div className="mono text-[29px] font-extrabold text-grn tracking-tight">{formatBRL(pnl.lucro_real)}</div>
          <div className="text-[11px] text-dim mt-[3px]">Margem real: {formatPercent(pnl.margem_real)}</div>
        </div>
      </div>

      <div className="px-[18px] py-[11px] flex items-center justify-between bg-[#17171e] border-t border-[#22222b] text-[12px] text-dim">
        <div>
          Lucro segundo o Afterpay: <b className="text-[#cfcfdd] font-semibold">{formatBRL(pnl.lucro_afterpay)}</b>{' '}
          (margem {formatPercent(pnl.margem_afterpay)})
        </div>
        <div>
          diferença: <span className="mono font-bold text-yel">{formatBRLSigned(pnl.diferenca_afterpay, 'entrada')}</span>
        </div>
      </div>
    </div>
  );
}
