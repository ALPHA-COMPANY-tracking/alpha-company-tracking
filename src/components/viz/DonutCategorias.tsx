import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { type Cents, formatBRL } from '@/lib/money';

export interface DonutSlice {
  nome: string;
  valor: Cents;
  cor: string;
}

export function DonutCategorias({ data, total }: { data: DonutSlice[]; total: Cents }) {
  const totalReais = formatBRL(total);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 p-[18px]">
      <div className="relative w-[200px] h-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.length ? data : [{ nome: '—', valor: 1, cor: '#23232c' }]}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={82}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {(data.length ? data : [{ cor: '#23232c' }]).map((s, i) => (
                <Cell key={i} fill={s.cor} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="mono text-[19px] font-extrabold text-tx leading-none">{totalReais}</div>
          <div className="text-[9.5px] text-dim2 mt-1">custos variáveis</div>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col gap-[9px]">
        {data.map((s) => (
          <div key={s.nome} className="flex items-center text-[12px] text-[#c6c6d4]">
            <span className="w-[9px] h-[9px] rounded-full mr-[9px] shrink-0" style={{ background: s.cor }} />
            <span className="flex-1 truncate">{s.nome}</span>
            <span className="mono text-dim text-[11.5px] ml-2">{formatBRL(s.valor)}</span>
          </div>
        ))}
        {data.length === 0 && <div className="text-[12px] text-dim2">Sem custos no período.</div>}
      </div>
    </div>
  );
}
