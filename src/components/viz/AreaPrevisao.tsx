import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HEX } from '@/lib/cores';
import { formatBRL } from '@/lib/money';
import type { PontoDia } from '@/lib/previsao';

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Faturamento acumulado do mês: o que entrou de verdade (área cheia, até
 * hoje) e o previsto (linha tracejada, de hoje ao último dia). É a mesma
 * medida — por isso a mesma cor; o traço diz o que é real e o que é conta.
 */
export function AreaPrevisao({ serie, hoje, altura = 250 }: { serie: PontoDia[]; hoje: string; altura?: number }) {
  const dados = serie.map((p) => ({
    rotulo: dm(p.data),
    real: p.real == null ? null : p.real / 100,
    previsto: p.previsto == null ? null : p.previsto / 100,
  }));
  return (
    <div>
      <div className="flex items-center gap-4 px-1 pb-2 text-[11px] text-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-[3px] rounded-full" style={{ background: HEX.ouro }} /> Recebido
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke={HEX.ouroClaro} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Previsto
        </span>
      </div>
      <ResponsiveContainer width="100%" height={altura}>
        <ComposedChart data={dados} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="previsao-real" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.ouro} stopOpacity={0.26} />
              <stop offset="100%" stopColor={HEX.ouro} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={HEX.grade} />
          <XAxis
            dataKey="rotulo"
            tick={{ fill: HEX.eixo, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={22}
          />
          <YAxis
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`)}
            tick={{ fill: HEX.eixo, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ReferenceLine
            x={dm(hoje)}
            stroke={HEX.eixo}
            strokeDasharray="3 3"
            label={{ value: 'hoje', position: 'insideTopLeft', fill: HEX.eixo, fontSize: 10 }}
          />
          <Tooltip
            cursor={{ stroke: HEX.eixo, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { rotulo: string; real: number | null; previsto: number | null };
              const real = p.real != null;
              const v = real ? p.real! : p.previsto!;
              return (
                <div className="rounded-[9px] border border-line2 bg-card2 px-2.5 py-1.5 shadow-lg">
                  <div className="text-[10px] text-dim2">
                    {p.rotulo} · {real ? 'recebido até o dia' : 'previsto até o dia'}
                  </div>
                  <div className="mono text-[12px] font-bold text-tx">{formatBRL(Math.round(v * 100))}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="real"
            stroke={HEX.ouro}
            strokeWidth={2}
            fill="url(#previsao-real)"
            isAnimationActive={false}
            connectNulls={false}
            activeDot={{ r: 4, fill: HEX.ouro, stroke: HEX.vazio, strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="previsto"
            stroke={HEX.ouroClaro}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
            activeDot={{ r: 4, fill: HEX.ouroClaro, stroke: HEX.vazio, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
