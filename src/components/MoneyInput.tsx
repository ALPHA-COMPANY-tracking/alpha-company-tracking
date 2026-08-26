// Input de moeda BRL. Trabalha em centavos; exibe 'R$ 1.234,56'.
import { formatBRL } from '@/lib/money';

export function MoneyInput({
  cents,
  onChange,
  autoFocus,
  id,
}: {
  cents: number;
  onChange: (cents: number) => void;
  autoFocus?: boolean;
  id?: string;
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
      className="w-full bg-card2 border border-line2 rounded-[10px] px-3 py-[10px] text-tx mono text-[15px] outline-none focus:border-pur"
    />
  );
}
