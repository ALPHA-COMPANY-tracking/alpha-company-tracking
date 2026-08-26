import { formatBRL, formatPercent } from '@/lib/money';
import type { PnlResult } from '@/lib/pnl';

export function GapBlock({ pnl }: { pnl: PnlResult }) {
  const pct = Math.min(100, Math.max(0, pnl.conversao_agendado * 100));
  return (
    <div className="bg-card border border-line rounded-card p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="m-0 text-[14.5px] font-bold">Gap Agendado vs Aprovado</h2>
        <span className="text-[11.5px] text-dim2">{formatPercent(pnl.conversao_agendado)} de conversão</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Num label="Agendado" value={formatBRL(pnl.valor_agendado)} sub={`${pnl.qtd_agendados} pedidos`} color="text-pur2" />
        <Num label="Aprovado" value={formatBRL(pnl.receita_aprovada)} sub={`${pnl.qtd_pagamentos} pedidos`} color="text-grn" />
        <Num label="Pendente" value={formatBRL(pnl.valor_pendente)} sub={`${pnl.qtd_agendados - pnl.qtd_pagamentos} pedidos`} color="text-yel" />
      </div>
      <div className="h-[10px] bg-[#22222b] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-grn/70 to-grn" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Num({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-dim2 uppercase tracking-wide font-bold mb-1">{label}</div>
      <div className={`mono text-[18px] font-extrabold ${color}`}>{value}</div>
      <div className="text-[10.5px] text-dim2 mt-0.5">{sub}</div>
    </div>
  );
}
