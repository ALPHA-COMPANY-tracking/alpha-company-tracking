import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { HEX } from '@/lib/cores';

export interface PontoArea {
  /** 'DD/MM' */
  rotulo: string;
  valor: number;
  /** Texto do tooltip: "R$ 1.470,00". */
  exibir: string;
}

/**
 * Gráfico de área dos cards do topo. `cor` precisa ser HEX: é usada em
 * atributo SVG, que não resolve var().
 */
export function AreaTendencia({
  dados,
  cor,
  id,
  altura,
  eixo = true,
  ponto = true,
}: {
  dados: PontoArea[];
  cor: string;
  /** Único na página — é o id do degradê. */
  id: string;
  altura: number;
  /** Datas embaixo. Os cards pequenos escondem. */
  eixo?: boolean;
  /** Bolinha no último ponto, como na referência. */
  ponto?: boolean;
}) {
  const ultimo = dados.length - 1;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        {eixo && (
          <XAxis
            dataKey="rotulo"
            tick={{ fill: HEX.eixo, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
        )}
        <Tooltip
          cursor={{ stroke: HEX.eixo, strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as PontoArea;
            return (
              <div className="rounded-[9px] border border-line2 bg-card2 px-2.5 py-1.5 shadow-lg">
                <div className="text-[10px] text-dim2">{p.rotulo}</div>
                <div className="mono text-[12px] font-bold text-tx">{p.exibir}</div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke={cor}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={(props) => {
            const { cx, cy, index } = props as { cx: number; cy: number; index: number };
            if (!ponto || index !== ultimo) return <g key={index} />;
            return <circle key={index} cx={cx} cy={cy} r={3.5} fill={cor} stroke={HEX.vazio} strokeWidth={2} />;
          }}
          activeDot={{ r: 4, fill: cor, stroke: HEX.vazio, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
