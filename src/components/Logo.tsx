// Marca da AJ Alpha Company. Arquivos em /public.

/** Logo completa (monograma + texto). */
export function Logo({ width = 260, className = '' }: { width?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="AJ Alpha Company · After Pay"
      width={width}
      className={`select-none ${className}`}
      draggable={false}
    />
  );
}

/** Monograma AJ (só a marca) — para cabeçalhos. Fica dentro de um chip escuro. */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center overflow-hidden rounded-[11px] border border-gold/25 shrink-0 ${className}`}
      style={{ width: size, height: size, background: '#161310' }}
    >
      <img
        src="/logo-mark.png"
        alt="AJ Alpha Company"
        className="w-full h-full object-cover scale-[1.08]"
        draggable={false}
      />
    </span>
  );
}

/** Assinatura em texto dourado. */
export function Wordmark({ className = '', sub = true }: { className?: string; sub?: boolean }) {
  return (
    <span className={`leading-none ${className}`}>
      <span className="block text-gold-metal font-extrabold tracking-[0.06em] text-[15px]">AJ ALPHA COMPANY</span>
      {sub && (
        <span className="block text-gold3/80 text-[9px] tracking-[0.32em] font-semibold mt-[3px]">AFTER PAY</span>
      )}
    </span>
  );
}
