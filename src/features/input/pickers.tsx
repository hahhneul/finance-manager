import { addDays, formatKoreanDate, todayISO, weekdayKo } from '@/core/date';
import { formatKrw } from '@/core/money';
import type { Account, ID, ISODate } from '@/types';

/** 계좌 한 줄 선택 — 시트 안에서 쓴다 */
export function AccountPicker({
  accounts,
  selectedId,
  onSelect,
  /** 이체에서 "출금 계좌와 같은 곳"을 고르지 못하게 할 때 */
  excludeId,
  balances,
}: {
  accounts: Account[];
  selectedId?: ID;
  onSelect: (id: ID) => void;
  excludeId?: ID;
  balances?: Map<ID, number>;
}) {
  return (
    <ul className="space-y-1">
      {accounts
        .filter((a) => !a.archived && a.id !== excludeId)
        .map((account) => {
          const balance = balances?.get(account.id);
          const isDebt = account.isLiability && balance !== undefined && balance < 0;

          return (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => onSelect(account.id)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left ${
                  account.id === selectedId
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-800 active:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: account.color ?? '#94a3b8' }}
                  />
                  {account.name}
                </span>

                {balance !== undefined && (
                  <span
                    className={`text-xs ${
                      account.id === selectedId ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {isDebt ? `갚을 돈 ${formatKrw(-balance)}` : formatKrw(balance)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * 날짜 선택 — 오늘/어제는 버튼으로, 나머지는 달력 입력으로.
 * 실제로 기록하는 건 대부분 오늘이거나 어제다.
 */
export function DatePicker({
  value,
  onChange,
}: {
  value: ISODate;
  onChange: (date: ISODate) => void;
}) {
  const today = todayISO();
  const yesterday = addDays(today, -1);

  const quick: { label: string; date: ISODate }[] = [
    { label: '오늘', date: today },
    { label: '어제', date: yesterday },
    { label: '그저께', date: addDays(today, -2) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {quick.map((option) => (
          <button
            key={option.date}
            type="button"
            onClick={() => onChange(option.date)}
            className={`min-h-11 rounded-lg text-sm font-medium ${
              option.date === value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 active:bg-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">직접 고르기</span>
        <input
          type="date"
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
        />
      </label>
    </div>
  );
}

/** '9월 21일 (월)' */
export function formatDateLabel(date: ISODate): string {
  if (date === todayISO()) return '오늘';
  return `${formatKoreanDate(date)} (${weekdayKo(date)})`;
}
