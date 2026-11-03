// Input de moeda BRL. Trabalha em centavos; exibe 'R$ 1.234,56'.
import { formatBRL } from '@/lib/money';

export function MoneyInput({
  cents,
  onChange,
  autoFocus,
  id,
  compacto = false,
  ariaLabel,
}: {
  cents: number;
  onChange: (cents: number) => void;
  autoFocus?: boolean;
  id?: string;
  /** Fonte e margem menores, para tabelas apertadas (ex.: faixas de bônus). */
  compacto?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoFocus={autoFocus}
      value={formatBRL(cents)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
      aria-label={ariaLabel}
      className={`w-full bg-card2 border border-line2 rounded-[10px] text-tx mono outline-none focus:border-gold ${
        compacto ? 'px-2.5 py-[8px] text-[13px]' : 'px-3 py-[10px] text-[15px]'
      }`}
    />
  );
}
