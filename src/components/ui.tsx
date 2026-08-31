// Primitivos visuais compartilhados (estilo do mockup).
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
}: {
  title?: string;
  hint?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card border border-line rounded-card overflow-hidden ${className}`}>
      {(title || right) && (
        <div className="px-[18px] py-[15px] flex items-center justify-between border-b border-line">
          <h2 className="m-0 text-[14.5px] font-bold text-tx">{title}</h2>
          {right ?? (hint && <div className="text-[11.5px] text-dim2">{hint}</div>)}
        </div>
      )}
      {children}
    </div>
  );
}

/** Quadrado do ícone: fundo na cor a 13% + ícone na cor cheia. */
export function IconSquare({
  Icon,
  color,
  size = 38,
}: {
  Icon: LucideIcon;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="grid place-items-center shrink-0 rounded-icon"
      style={{ width: size, height: size, background: `${color}22`, color }}
    >
      <Icon size={Math.round(size / 2)} strokeWidth={1.9} />
    </div>
  );
}

export function KpiCard({
  Icon,
  color,
  label,
  value,
  sub,
}: {
  Icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-card border border-line rounded-kpi px-3 lg:px-4 py-3 lg:py-[15px] flex items-center gap-2.5 lg:gap-[13px]">
      {/* No celular o ícone encolhe para sobrar largura ao número */}
      <span className="hidden xs:block">
        <IconSquare Icon={Icon} color={color} />
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] lg:text-[11px] text-dim font-medium mb-[3px] leading-tight">{label}</div>
        <div className="mono text-[17px] lg:text-[21px] font-extrabold tracking-tight leading-tight truncate" style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-[9.5px] lg:text-[10.5px] text-dim2 mt-[3px] truncate">{sub}</div>}
      </div>
    </div>
  );
}
