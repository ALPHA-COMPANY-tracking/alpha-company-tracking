import { formatBRL, formatPercent } from '@/lib/money';
import type { PnlResult } from '@/lib/pnl';

export function GapBlock({ pnl }: { pnl: PnlResult }) {
  const pct = Math.min(100, Math.max(0, pnl.conversao_agendado * 100));

  // O "pendente" bruto inclui os frustrados, que nunca vão entrar. O que
  // está mesmo em rota é o pendente menos esses pedidos.
  const qtdPendente = pnl.qtd_agendados - pnl.qtd_pagamentos;
  const emRota = pnl.valor_pendente - pnl.valor_frustrado;
  const qtdEmRota = qtdPendente - pnl.qtd_frustrados;

  return (
    <div className="bg-card border border-line rounded-card p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="m-0 text-[14.5px] font-bold">Gap Agendado vs Aprovado</h2>
        <span className="text-[11.5px] text-dim2">{formatPercent(pnl.conversao_agendado)} de conversão</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Num label="Agendado" value={formatBRL(pnl.valor_agendado)} sub={`${pnl.qtd_agendados} pedidos`} color="text-pur2" />
        <Num label="Aprovado" value={formatBRL(pnl.receita_aprovada)} sub={`${pnl.qtd_pagamentos} pedidos`} color="text-grn" />
        <Num
          label="Pendente geral"
          value={formatBRL(pnl.valor_pendente)}
          sub={`${qtdPendente} pedidos · com frustrados`}
          color="text-yel"
        />
        <Num
          label="Frustrado"
          value={formatBRL(pnl.valor_frustrado)}
          sub={`${pnl.qtd_frustrados} pedidos · não entra`}
          color="text-red"
        />
        <Num
          label="Em rota"
          value={formatBRL(emRota)}
          sub={`${qtdEmRota} pedidos aguardando`}
          color="text-yel"
          destaque
        />
      </div>

      <div className="h-[10px] bg-trilha rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-grn/70 to-grn" style={{ width: `${pct}%` }} />
      </div>

      <div className="text-[11px] text-dim2 mt-[10px]">
        Pendente geral = agendado − aprovado (inclui os frustrados). Em rota tira os frustrados: é o que ainda pode
        cair na conta.
      </div>
    </div>
  );
}

function Num({
  label,
  value,
  sub,
  color,
  destaque = false,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  destaque?: boolean;
}) {
  return (
    <div className={destaque ? 'rounded-[10px] border border-yel/30 bg-yel/[0.06] px-3 py-2 -my-2' : ''}>
      <div className="text-[10.5px] text-dim2 uppercase tracking-wide font-bold mb-1">{label}</div>
      <div className={`mono text-[18px] font-extrabold ${color}`}>{value}</div>
      <div className="text-[10.5px] text-dim2 mt-0.5">{sub}</div>
    </div>
  );
}
