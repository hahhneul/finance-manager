import { useMemo, useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import {
  buildMonthGrid,
  expenseCutoffs,
  intensityOf,
  type CalendarCell,
} from '@/core/calendar';
import { intensityColor } from '@/core/chartColors';
import { dailyExpenseTotals, groupRowsByDate, ledgerRows } from '@/core/transactions';
import { formatKoreanDate, todayISO, weekdayKo } from '@/core/date';
import { formatKrw, formatKrwCompact } from '@/core/money';
import { categoryPath } from '@/core/recent';
import type { Account, Category, ISODate, Ledger, YearMonth } from '@/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 달력 뷰.
 *
 * 칸 색만으로 금액을 읽게 하지 않고 **숫자를 같이 적는다**.
 * 색은 "많이 쓴 날이 어디쯤인지" 훑어보는 용도고, 정확한 값은 글자가 담당한다.
 */
export function CalendarView({
  month,
  ledger,
  accounts,
  categories,
}: {
  month: YearMonth;
  ledger: Ledger;
  accounts: Account[];
  categories: Category[];
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);

  const weeks = useMemo(() => buildMonthGrid(month, todayISO()), [month]);

  const byDate = useMemo(() => dailyExpenseTotals(ledger, month), [ledger, month]);

  // 농도 기준은 이번 달 지출이 있는 날들만으로 잡는다
  const cutoffs = useMemo(() => expenseCutoffs([...byDate.values()]), [byDate]);

  const dayRows = useMemo(() => {
    if (!selected) return null;
    const rows = ledgerRows(ledger).filter((r) => r.date === selected);
    return groupRowsByDate(rows)[0] ?? null;
  }, [ledger, selected]);

  return (
    <>
      <div className="bg-white px-2 pb-4">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((day, index) => (
            <p
              key={day}
              className={`py-2 text-center text-[11px] font-medium ${
                index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-slate-400'
              }`}
            >
              {day}
            </p>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 gap-0.5">
            {week.map((cell) => (
              <DayCell
                key={cell.date}
                cell={cell}
                amount={byDate.get(cell.date) ?? 0}
                intensity={intensityOf(byDate.get(cell.date) ?? 0, cutoffs)}
                onClick={() => setSelected(cell.date)}
              />
            ))}
          </div>
        ))}
      </div>

      <BottomSheet
        open={selected !== null}
        title={selected ? `${formatKoreanDate(selected)} (${weekdayKo(selected)})` : ''}
        onClose={() => setSelected(null)}
      >
        {dayRows ? (
          <>
            <div className="mb-3 flex gap-2 text-sm">
              {dayRows.income > 0 && (
                <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">
                  수입 {formatKrw(dayRows.income)}
                </span>
              )}
              {dayRows.expense > 0 && (
                <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700">
                  지출 {formatKrw(dayRows.expense)}
                </span>
              )}
            </div>

            <ul className="divide-y divide-slate-100">
              {dayRows.rows.map((row) => {
                const s = row.settlement;
                const tx = row.transaction;
                const accountName = (id?: string) =>
                  accounts.find((a) => a.id === id)?.name ?? '—';
                const categoryName = (id?: string) =>
                  categoryPath(categories.find((c) => c.id === id), categories);

                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-900">
                        {s ? s.title : tx!.memo || categoryName(tx!.categoryId)}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {s
                          ? `정산 ${s.headcount}명 · ${accountName(s.payerAccountId)}`
                          : tx!.type === 'transfer'
                            ? `${accountName(tx!.accountId)} → ${accountName(tx!.toAccountId)}`
                            : `${categoryName(tx!.categoryId)} · ${accountName(tx!.accountId)}`}
                      </span>
                    </span>

                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        s
                          ? 'text-red-600'
                          : tx!.type === 'transfer'
                            ? 'text-slate-400'
                            : tx!.type === 'income'
                              ? 'text-blue-600'
                              : 'text-red-600'
                      }`}
                    >
                      {s ? `-${formatKrw(s.myShare)}` : formatKrw(tx!.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">이 날은 기록이 없습니다.</p>
        )}
      </BottomSheet>
    </>
  );
}

function DayCell({
  cell,
  amount,
  intensity,
  onClick,
}: {
  cell: CalendarCell;
  amount: number;
  intensity: ReturnType<typeof intensityOf>;
  onClick: () => void;
}) {
  const background = intensityColor(intensity);

  return (
    <button
      type="button"
      onClick={onClick}
      /* 터치 영역 최소 44px */
      className={`flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-lg py-1.5 active:bg-slate-100 ${
        cell.inMonth ? '' : 'opacity-35'
      }`}
      style={background ? { backgroundColor: background } : undefined}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
          cell.isToday
            ? 'bg-slate-900 font-semibold text-white'
            : intensity >= 3
              ? 'font-medium text-white'
              : cell.weekday === 0
                ? 'text-red-500'
                : cell.weekday === 6
                  ? 'text-blue-500'
                  : 'text-slate-700'
        }`}
      >
        {Number(cell.date.slice(8, 10))}
      </span>

      {/* 색만으로 읽게 하지 않는다 — 금액을 같이 적는다 */}
      {amount > 0 && (
        <span
          className={`text-[9px] leading-tight tabular-nums ${
            intensity >= 3 ? 'text-white' : 'text-slate-500'
          }`}
        >
          {formatKrwCompact(amount)}
        </span>
      )}
    </button>
  );
}
