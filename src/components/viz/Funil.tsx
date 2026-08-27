import { formatBRL } from '@/lib/money';
import type { PnlResult } from '@/lib/pnl';

export function Funil({ pnl }: { pnl: PnlResult }) {
  const base = pnl.valor_agendado || 1;
  const linhas = [
    { rotulo: 'Agendado', valor: pnl.valor_agendado, qtd: pnl.qtd_agendados, cor: '#a855f7', pct: 100 },
    { rotulo: 'Aprovado', valor: pnl.receita_aprovada, qtd: pnl.qtd_pagamentos, cor: '#34d399', pct: (pnl.receita_aprovada / base) * 100 },
    { rotulo: 'Frustrado', valor: pnl.valor_frustrado, qtd: pnl.qtd_frustrados, cor: '#fb7185', pct: (pnl.valor_frustrado / base) * 100 },
  ];

  return (
    <div>
      <div className="flex flex-col gap-[15px] px-[18px] py-4">
        {linhas.map((l) => (
          <div key={l.rotulo}>
            <div className="flex justify-between text-[11.5px] text-dim mb-[7px]">
              <span>{l.rotulo}</span>
              <span className="mono">{l.qtd} pedidos</span>
            </div>
            <div className="relative h-[30px] bg-[#22222b] rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg"
                style={{ width: `${Math.max(2, Math.min(100, l.pct))}%`, background: `linear-gradient(90deg, ${l.cor}aa, ${l.cor})` }}
              />
              <div className="absolute inset-y-0 left-3 flex items-center mono text-[12.5px] font-bold text-white">
                {formatBRL(l.valor)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-[18px] py-[13px] flex items-center justify-between bg-[#17171e] border-t border-[#22222b] text-[12px]">
        <span className="text-dim">Pendente de aprovação</span>
        <span>
          <b className="mono text-yel">{formatBRL(pnl.valor_pendente)}</b>{' '}
          <span className="text-dim2">· {pnl.qtd_agendados - pnl.qtd_pagamentos} pedidos</span>
        </span>
      </div>
    </div>
  );
}
