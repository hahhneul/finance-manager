import { parseKrwInput } from '@/core/amountInput';
import { formatKrw } from '@/core/money';

/**
 * 원화 금액 입력칸.
 *
 * 입력한 글자를 조용히 고치지 않는다. 사용자가 친 그대로 두고,
 * 해석할 수 없으면 아래에 이유를 적는다.
 * (전에는 '1.5' 를 '15' 로 지워서 10배가 되는 일이 있었다)
 */
export function AmountField({
  label,
  value,
  onChange,
  placeholder = '0',
  autoFocus,
}: {
  label: string;
  /** 사용자가 친 글자 그대로 */
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const parsed = parseKrwInput(value);

  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>

      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={parsed.error !== null}
        className={`mt-1 min-h-12 w-full rounded-lg border px-3 text-right ${
          parsed.error ? 'border-red-400 bg-red-50' : 'border-slate-200'
        }`}
      />

      {parsed.error ? (
        <span className="mt-1 block text-xs text-red-600">{parsed.error}</span>
      ) : (
        parsed.value > 0 && (
          <span className="mt-1 block text-right text-xs text-slate-500">
            {formatKrw(parsed.value)}
          </span>
        )
      )}
    </label>
  );
}
