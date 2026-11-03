import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HEX } from '@/lib/cores';

const pct = (t: number) => `${Math.round(t * 100)}%`;
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const curto = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k` : `${Math.round(a)}`;
  return v < 0 ? `-${s}` : s;
};

/**
 * Lucro projetado conforme a taxa de recebimento (30% a 90%): a linha
 * tracejada é o lucro desejado, a cheia o zero, e o ponto é a taxa de hoje.
 */
export function CurvaLucro({
  pontos,
  desejado,
  taxaAtual,
  lucroAtual,
  altura = 240,
}: {
  pontos: { taxa: number; lucro: number }[];
  desejado: number;
  taxaAtual: number;
  lucroAtual: number | null;
  altura?: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[11px] text-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-[3px] rounded-full" style={{ background: HEX.ouroClaro }} /> Lucro projetado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke={HEX.verde} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Lucro desejado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: HEX.ouro }} /> Taxa atual
        </span>
      </div>
      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={pontos} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={HEX.grade} />
          <XAxis
            dataKey="taxa"
            type="number"
            domain={[0.3, 0.9]}
            ticks={[0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]}
            tickFormatter={pct}
            tick={{ fill: HEX.eixo, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tickFormatter={curto} tick={{ fill: HEX.eixo, fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
          <ReferenceLine y={0} stroke={HEX.eixo} />
          <ReferenceLine y={desejado} stroke={HEX.verde} strokeDasharray="5 4" />
          <Tooltip
            cursor={{ stroke: HEX.eixo, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { taxa: number; lucro: number };
              return (
                <div className="rounded-[9px] border border-line2 bg-card2 px-2.5 py-1.5 shadow-lg">
                  <div className="text-[10px] text-dim2">taxa de recebimento {pct(p.taxa)}</div>
                  <div className={`mono text-[12px] font-bold ${p.lucro >= 0 ? 'text-grn' : 'text-red'}`}>{reais(p.lucro)}</div>
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="lucro" stroke={HEX.ouroClaro} strokeWidth={2} dot={false} isAnimationActive={false} />
          {lucroAtual != null && taxaAtual >= 0.3 && taxaAtual <= 0.9 && (
            <ReferenceDot x={taxaAtual} y={lucroAtual} r={5} fill={HEX.ouro} stroke="#000" strokeWidth={1.5} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
