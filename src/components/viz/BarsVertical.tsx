import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from 'recharts';

export interface BarDatum {
  label: string;
  value: number;
  display: string;
}

/** Barras verticais com gradiente roxo, valor acima e nome abaixo. */
export function BarsVertical({
  data,
  gradId,
  altura = 260,
}: {
  data: BarDatum[];
  gradId: string;
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={data} margin={{ top: 26, right: 8, left: 8, bottom: 4 }} barCategoryGap="22%">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: '#7c7c8e', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <Bar dataKey="value" fill={`url(#${gradId})`} radius={[5, 5, 0, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="display"
            position="top"
            fill="#cfcfdd"
            fontSize={11}
            fontWeight={700}
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
