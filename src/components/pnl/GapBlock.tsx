import { formatBRL, formatPercent } from '@/lib/money';
import type { PnlResult } from '@/lib/pnl';
import type { Fatia, Situacao } from '@/lib/indicadores';

/**
 * Do agendado ao aprovado. Em rota e o resto sem pagar saem da ETAPA de
 * cada pedido agendado no período (a mesma conta da Visualização) — e não
 * de "agendado − aprovado": o aprovado tem pagamentos de pedidos agendados
 * antes do período, que não fazem parte deste agendado.
 */
export function GapBlock({
  pnl,
  situacao,
  pagosDeAntes,
}: {
  pnl: PnlResult;
  situacao: Record<Situacao, Fatia>;
  pagosDeAntes: number;
}) {
  const pct = Math.min(100, Math.max(0, pnl.conversao_agendado * 100));
  const { rota, preparo, aguardando, negociacao, frustracao } = situacao;
  // Sem pagar e fora da rua: ainda não saiu, já foi entregue e não pagou,
  // ou travou na negociação/jurídico.
  const foraDaRota = {
    qtd: preparo.qtd + aguardando.qtd + negociacao.qtd,
    valor: preparo.valor + aguardando.valor + negociacao.valor,
  };

  return (
    <div className="bg-card border border-line rounded-card p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="m-0 text-[14.5px] font-bold">Gap Agendado vs Aprovado</h2>
        <span className="text-[11.5px] text-dim2">{formatPercent(pnl.conversao_agendado)} de conversão</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Num label="Agendado" value={formatBRL(pnl.valor_agendado)} sub={`${pnl.qtd_agendados} pedidos`} color="text-gold2" />
        <Num
          label="Aprovado"
          value={formatBRL(pnl.receita_aprovada)}
          sub={`${pnl.qtd_pagamentos} pagamentos${pagosDeAntes > 0 ? ` · ${pagosDeAntes} de pedidos de antes` : ''}`}
          color="text-grn"
        />
        <Num label="Frustrado" value={formatBRL(frustracao.valor)} sub={`${frustracao.qtd} pedidos · não entra`} color="text-red" />
        <Num
          label="Sem pagar, fora da rota"
          value={formatBRL(foraDaRota.valor)}
          sub={`${foraDaRota.qtd} pedidos · a enviar, entregues e jurídico`}
          color="text-yel"
        />
        <Num label="Em rota" value={formatBRL(rota.valor)} sub={`${rota.qtd} pedidos na rua, a caminho`} color="text-gold2" destaque />
      </div>

      <div className="h-[10px] bg-trilha rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-grn/70 to-grn" style={{ width: `${pct}%` }} />
      </div>

      <div className="text-[11px] text-dim2 mt-[10px] leading-relaxed">
        Em rota = só o que está na rua: enviado, saiu para entrega ou para retirar nos Correios — o mesmo número da
        Visualização. Fora da rota, sem pagar: {preparo.qtd} a enviar, {aguardando.qtd} entregues ou cobrados e{' '}
        {negociacao.qtd} em negociação ou jurídico. Frustração (roubo, devolução, cancelado…) não entra em nenhum dos dois.
        {pagosDeAntes > 0 &&
          ` O aprovado inclui ${pagosDeAntes} pagamentos de pedidos agendados antes do período — por isso agendado − aprovado não é o que falta.`}
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
    <div className={destaque ? 'col-span-2 lg:col-span-1 rounded-[10px] border border-gold/35 bg-gold/[0.06] px-3 py-2 lg:-my-2' : ''}>
      <div className="text-[10.5px] text-dim2 uppercase tracking-wide font-bold mb-1">{label}</div>
      <div className={`mono text-[18px] font-extrabold ${color}`}>{value}</div>
      <div className="text-[10.5px] text-dim2 mt-0.5">{sub}</div>
    </div>
  );
}
