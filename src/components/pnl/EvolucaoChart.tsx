import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AfterpayDaily, CustoVariavel, Periodo } from '@/types';
import { formatBRL } from '@/lib/money';
import { formatDiaMes } from '@/lib/dates';
import { type PnlOptions, serieDiaria } from '@/lib/pnl';
import { HEX } from '@/lib/cores';

interface Ponto {
  label: string;
  receita: number;
  lucro: number;
  rc: number;
  lc: number;
}

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { payload: Ponto }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-card2 border border-line2 rounded-lg px-3 py-2 text-[11.5px] shadow-lg">
      <div className="text-dim2 mb-1">{label}</div>
      <div className="flex items-center gap-2 text-grn">
        <span className="w-2 h-2 rounded-sm bg-grn inline-block" /> Receita <span className="mono ml-auto">{formatBRL(p.rc)}</span>
      </div>
      <div className="flex items-center gap-2 text-gold2">
        <span className="w-2 h-2 rounded-sm bg-gold inline-block" /> Lucro real <span className="mono ml-auto">{formatBRL(p.lc)}</span>
      </div>
    </div>
  );
}

export function EvolucaoChart({
  dailies,
  custos,
  periodo,
  opts,
  altura = 230,
}: {
  dailies: AfterpayDaily[];
  custos: CustoVariavel[];
  periodo: Periodo;
  opts?: PnlOptions;
  altura?: number;
}) {
  const serie = serieDiaria(dailies, custos, periodo, opts);
  const data: Ponto[] = serie.map((p) => ({
    label: formatDiaMes(p.data),
    receita: p.receita / 100,
    lucro: p.lucro / 100,
    rc: p.receita,
    lc: p.lucro,
  }));

  const passo = Math.max(1, Math.ceil(data.length / 8));

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.26} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HEX.ouro} stopOpacity={0.3} />
            <stop offset="100%" stopColor={HEX.ouro} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={HEX.grade} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: HEX.eixo, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: HEX.grade }}
          interval={passo - 1}
        />
        <YAxis
          tick={{ fill: HEX.eixo, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <ReferenceLine y={0} stroke={HEX.vazio} strokeDasharray="3 4" />
        <Tooltip content={<TooltipBox />} />
        <Area type="monotone" dataKey="receita" stroke="#34d399" strokeWidth={2} fill="url(#gr)" />
        <Area type="monotone" dataKey="lucro" stroke={HEX.ouro} strokeWidth={2} fill="url(#gl)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
