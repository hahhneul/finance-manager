import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, List, Search, SlidersHorizontal } from 'lucide-react';
import { ScreenHeader } from '@/layout/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import {
  collectTags,
  filterRows,
  groupRowsByDate,
  ledgerRows,
  monthlyTotals,
  type LedgerRow,
  type TransactionFilter,
} from '@/core/transactions';
import { currentMonth, addMonths, formatKoreanDate, formatKoreanMonth, weekdayKo } from '@/core/date';
import { formatKrw } from '@/core/money';
import { categoryPath } from '@/core/recent';
import { isPending, outstanding } from '@/core/settlement';
import { useAccounts, useCategories, useLedger } from '@/hooks/useData';
import { CalendarView } from './CalendarView';
import { EditSheet } from './EditSheet';
import { FilterSheet } from './FilterSheet';

type ViewMode = 'list' | 'calendar';

export function TransactionList() {
  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<ViewMode>('list');
  /** 홈의 '아직 못 받은 정산금' 배너에서 들어오면 미수 정산만 보여준다 */
  const [params, setParams] = useSearchParams();
  const pendingOnly = params.get('pending') === '1';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [showFilter, setShowFilter] = useState(false);
  const [editing, setEditing] = useState<LedgerRow | null>(null);

  // 미수 정산은 몇 달 전 것일 수도 있으므로 전체 기간을 읽는다
  const ledger = useLedger(pendingOnly ? undefined : month);
  const accounts = useAccounts();
  const categories = useCategories();

  const totals = useMemo(
    () => (ledger ? monthlyTotals(ledger, month) : null),
    [ledger, month],
  );

  const groups = useMemo(() => {
    if (!ledger) return [];

    let rows = filterRows(ledgerRows(ledger), { ...filter, query: query || undefined });
    if (pendingOnly) rows = rows.filter((r) => r.settlement && isPending(r.settlement));

    return groupRowsByDate(rows);
  }, [ledger, filter, query, pendingOnly]);

  /** 검색·필터가 걸려 있으면 상단 합계의 뜻이 달라진다 */
  const narrowed = useMemo(() => {
    const rows = groups.flatMap((g) => g.rows);
    return {
      count: rows.length,
      income: groups.reduce((s, g) => s + g.income, 0),
      expense: groups.reduce((s, g) => s + g.expense, 0),
    };
  }, [groups]);

  useEffect(() => {
    if (pendingOnly) setView('list');
  }, [pendingOnly]);

  const filterCount =
    (filter.accountIds?.length ? 1 : 0) +
    (filter.categoryIds?.length ? 1 : 0) +
    (filter.tags?.length ? 1 : 0) +
    (filter.types?.length ? 1 : 0);

  const isNarrowed = query.trim() !== '' || filterCount > 0;

  return (
    <>
      <ScreenHeader
        title="내역"
        action={
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
              aria-label={view === 'list' ? '달력으로 보기' : '목록으로 보기'}
              className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
            >
              {view === 'list' ? <CalendarDays className="size-5" /> : <List className="size-5" />}
            </button>
          <button
            type="button"
            onClick={() => setShowFilter(true)}
            aria-label="필터"
            className="relative flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <SlidersHorizontal className="size-5" />
            {filterCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                {filterCount}
              </span>
            )}
          </button>
          </div>
        }
      />

      {/* 월 이동 + 요약 */}
      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="이전 달"
            className="flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <ChevronLeft className="size-5" />
          </button>

          <p className="text-base font-semibold">{formatKoreanMonth(month)}</p>

          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="다음 달"
            className="flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {totals && (
          <>
            {/*
              검색·필터가 걸렸는데 월 전체 합계를 그대로 두면
              "1건만 나왔는데 지출이 76만원" 처럼 읽혀 오해를 부른다.
              그래서 좁혀진 상태에서는 **그 결과의 합계**를 보여준다.
            */}
            {isNarrowed ? (
              <div className="mt-2">
                <p className="mb-1.5 text-xs text-slate-500">
                  검색 결과 {narrowed.count}건
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setFilter({}); }}
                    className="ml-2 font-medium text-slate-700 underline"
                  >
                    전체 보기
                  </button>
                </p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <Summary label="검색 수입" amount={narrowed.income} className="text-blue-600" />
                  <Summary label="검색 지출" amount={narrowed.expense} className="text-red-600" />
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Summary label="수입" amount={totals.income} className="text-blue-600" />
                <Summary label="지출" amount={totals.expense} className="text-red-600" />
                {/* '잔액' 은 계좌 잔액과 헷갈린다. 이건 수입에서 지출을 뺀 값이다 */}
                <Summary label="수입−지출" amount={totals.net} className="text-slate-900" />
              </div>
            )}
          </>
        )}
      </section>

      {view === 'calendar' && ledger && (
        <CalendarView
          month={month}
          ledger={ledger}
          accounts={accounts ?? []}
          categories={categories ?? []}
        />
      )}

      {view === 'list' && (
        <>
      {pendingOnly && (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2.5">
          <p className="flex-1 text-xs text-amber-900">
            아직 못 받은 정산만 보고 있습니다. 항목을 눌러 입금을 기록하세요.
          </p>
          <button
            type="button"
            onClick={() => setParams({})}
            className="shrink-0 text-xs font-medium text-amber-900 underline"
          >
            전체 보기
          </button>
        </div>
      )}

      <div className="bg-white px-4 pb-3">
        <label className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모·태그 검색"
            className="w-full bg-transparent placeholder:text-slate-400"
          />
        </label>
      </div>

      {/* 목록 */}
      {!ledger && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      {ledger && groups.length === 0 && (
        <p className="p-12 text-center text-sm text-slate-400">
          {query || filterCount > 0 ? '조건에 맞는 거래가 없습니다.' : '아직 기록이 없습니다.'}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.date} className="mt-2 bg-white">
          <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-2">
            <p className="text-xs font-medium text-slate-500">
              {formatKoreanDate(group.date)} ({weekdayKo(group.date)})
            </p>
            <p className="text-xs text-slate-400">
              {group.income > 0 && (
                <span className="text-blue-500">+{formatKrw(group.income)} </span>
              )}
              {group.expense > 0 && <span>-{formatKrw(group.expense)}</span>}
            </p>
          </div>

          <ul className="divide-y divide-slate-50">
            {group.rows.map((row) => (
              <li key={row.id}>
                <Row
                  row={row}
                  accountName={(id) => accounts?.find((a) => a.id === id)?.name ?? '—'}
                  categoryName={(id) =>
                    categoryPath(categories?.find((c) => c.id === id), categories ?? [])
                  }
                  onClick={() => setEditing(row)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

        </>
      )}

      <BottomSheet open={showFilter} title="필터" onClose={() => setShowFilter(false)}>
        <FilterSheet
          accounts={accounts ?? []}
          categories={categories ?? []}
          tags={ledger ? collectTags(ledger) : []}
          value={filter}
          onChange={setFilter}
          onClose={() => setShowFilter(false)}
        />
      </BottomSheet>

      <EditSheet
        row={editing}
        accounts={accounts ?? []}
        categories={categories ?? []}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function Summary({
  label,
  amount,
  className,
}: {
  label: string;
  amount: number;
  className: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${className}`}>{formatKrw(amount)}</p>
    </div>
  );
}

/**
 * 목록 한 줄.
 *
 * 정산은 결제 총액과 내 부담이 다르므로 둘 다 보여준다.
 * 이체는 수입·지출이 아니라서 금액을 회색으로 두고 부호를 붙이지 않는다.
 */
function Row({
  row,
  accountName,
  categoryName,
  onClick,
}: {
  row: LedgerRow;
  accountName: (id: string) => string;
  categoryName: (id?: string) => string;
  onClick: () => void;
}) {
  if (row.settlement) {
    const s = row.settlement;
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-900">{s.title}</span>
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              정산 {s.headcount}명
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {categoryName(s.categoryId)} · {accountName(s.payerAccountId)}
            {outstanding(s) > 0 && (
              <span className="text-amber-700"> · 못 받은 돈 {formatKrw(outstanding(s))}</span>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-red-600">
            -{formatKrw(s.myShare)}
          </span>
          <span className="block text-[11px] text-slate-400">
            결제 {formatKrw(s.totalAmount)}
          </span>
        </span>
      </button>
    );
  }

  const tx = row.transaction!;
  const isTransfer = tx.type === 'transfer';
  const isIncome = tx.type === 'income';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-900">
          {tx.memo || (isTransfer ? '이체' : categoryName(tx.categoryId))}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {isTransfer
            ? `${accountName(tx.accountId)} → ${accountName(tx.toAccountId ?? '')}`
            : `${categoryName(tx.categoryId)} · ${accountName(tx.accountId)}`}
        </span>
      </span>

      <span
        className={`shrink-0 text-sm font-semibold ${
          isTransfer ? 'text-slate-400' : isIncome ? 'text-blue-600' : 'text-red-600'
        }`}
      >
        {isTransfer ? '' : isIncome ? '+' : '-'}
        {formatKrw(tx.amount)}
      </span>
    </button>
  );
}
