import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { ScreenHeader } from '@/layout/AppShell';
import {
  addMonths,
  currentMonth,
  formatKoreanMonth,
  lastNMonths,
} from '@/core/date';
import { categoryTotals, monthlyTotals, monthlyTrend } from '@/core/transactions';
import { pendingReceivable } from '@/core/settlement';
import { categoryColorMap, MAX_DONUT_SLICES, OTHER_COLOR } from '@/core/chartColors';
import { formatKrw } from '@/core/money';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCategories, useLedger } from '@/hooks/useData';
import { loadFxRate, loadRecurring, loadSnapshots } from '@/db/repo';
import { db } from '@/db/schema';
import { computeNetWorth } from '@/core/networth';
import { NetWorthCard, NetWorthTrend } from './NetWorthCard';
import { pendingOccurrences } from '@/core/recurring';
import { todayISO } from '@/core/date';
import { PendingBanner, PendingSheet } from '@/features/recurring/PendingSheet';
import { useAccounts } from '@/hooks/useData';
import { ExpenseDonut, ExpenseTrend, type DonutSlice, type TrendBar } from './charts';

export function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [showPending, setShowPending] = useState(false);
  const categories = useCategories();
  const accounts = useAccounts();
  const recurrings = useLiveQuery(() => loadRecurring(), []);
  const trades = useLiveQuery(() => db.trades.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const fx = useLiveQuery(() => loadFxRate(), []);
  const snapshots = useLiveQuery(() => loadSnapshots(), []);

  // 6개월 추이가 필요해서 이번 달만이 아니라 전체를 읽는다
  const ledger = useLedger();

  const totals = useMemo(
    () => (ledger ? monthlyTotals(ledger, month) : null),
    [ledger, month],
  );

  const slices = useMemo<DonutSlice[]>(() => {
    if (!ledger || !categories) return [];

    const breakdown = categoryTotals(ledger, categories, month);
    const colors = categoryColorMap(categories, 'expense');

    const top = breakdown.parents.slice(0, MAX_DONUT_SLICES);
    const rest = breakdown.parents.slice(MAX_DONUT_SLICES);
    const restAmount =
      rest.reduce((sum, p) => sum + p.amount, 0) + breakdown.uncategorized;

    const result: DonutSlice[] = top.map((parent) => ({
      id: parent.categoryId,
      name: parent.categoryName,
      amount: parent.amount,
      ratio: parent.ratio,
      color: colors.get(parent.categoryId) ?? OTHER_COLOR,
    }));

    // 7번째부터는 색을 더 만들지 않고 '기타'로 접는다
    if (restAmount > 0) {
      result.push({
        id: 'other',
        name: '기타',
        amount: restAmount,
        ratio: breakdown.total === 0 ? 0 : restAmount / breakdown.total,
        color: OTHER_COLOR,
      });
    }

    return result;
  }, [ledger, categories, month]);

  const bars = useMemo<TrendBar[]>(() => {
    if (!ledger) return [];

    return monthlyTrend(ledger, lastNMonths(month, 6)).map((t) => ({
      month: t.month,
      label: `${Number(t.month.slice(5, 7))}월`,
      expense: t.expense,
      current: t.month === month,
    }));
  }, [ledger, month]);

  const receivable = useMemo(
    () => (ledger ? pendingReceivable(ledger.settlements) : 0),
    [ledger],
  );

  /**
   * 순자산은 **이번 달만이 아니라 전체 기록**으로 계산한다.
   * 계좌 잔액은 앱을 쓰기 시작한 시점부터 전부 더해야 나오는 값이다.
   */
  const netWorth = useMemo(() => {
    if (!accounts || !ledger || !trades || !holdings || !quotes) return null;
    return computeNetWorth(accounts, ledger, trades, holdings, quotes, fx?.rate ?? 0);
  }, [accounts, ledger, trades, holdings, quotes, fx]);

  // 기록할 때가 지난 반복 거래 (자동으로 넣지 않고 확인을 받는다)
  const pending = useMemo(
    () => (recurrings ? pendingOccurrences(recurrings, todayISO()) : []),
    [recurrings],
  );

  return (
    <>
      <ScreenHeader title="홈" />

      {/* 월 이동 */}
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
            {/* 이 달의 한 줄 요약 — 차트보다 이게 먼저다 */}
            <p className="mt-3 text-center text-3xl font-semibold tracking-tight text-slate-900">
              {formatKrw(totals.net)}
            </p>
            <p className="mt-0.5 text-center text-xs text-slate-500">
              수입에서 지출을 뺀 금액
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="수입" amount={totals.income} className="text-blue-600" />
              <Stat label="지출" amount={totals.expense} className="text-red-600" />
            </div>
          </>
        )}
      </section>

      <PendingBanner count={pending.length} onClick={() => setShowPending(true)} />

      {receivable > 0 && (
        <Link
          to="/transactions"
          className="mt-2 flex min-h-14 items-center gap-3 bg-amber-50 px-4 active:bg-amber-100"
        >
          <Wallet className="size-5 shrink-0 text-amber-600" />
          <span className="flex-1 text-sm text-amber-900">아직 못 받은 정산금</span>
          <span className="text-sm font-semibold text-amber-900">
            {formatKrw(receivable)}
          </span>
        </Link>
      )}

      <Card title="카테고리별 지출">
        {!ledger || !categories ? <Skeleton /> : <ExpenseDonut slices={slices} total={totals?.expense ?? 0} />}
      </Card>

      <Card title="최근 6개월 지출" caption="막대를 누르면 그 달로 이동합니다">
        {!ledger ? <Skeleton /> : <ExpenseTrend bars={bars} onSelect={setMonth} />}
      </Card>

      {netWorth && <NetWorthCard breakdown={netWorth} />}

      <Card title="순자산 추이">
        {!snapshots ? <Skeleton /> : <NetWorthTrend snapshots={snapshots} />}
      </Card>

      <PendingSheet
        open={showPending}
        occurrences={pending}
        accounts={accounts ?? []}
        onClose={() => setShowPending(false)}
      />
    </>
  );
}

function Stat({
  label,
  amount,
  className,
}: {
  label: string;
  amount: number;
  className: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 py-2 text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${className}`}>{formatKrw(amount)}</p>
    </div>
  );
}

function Card({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-2 bg-white px-4 py-4">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {caption && <p className="mt-0.5 text-[11px] text-slate-400">{caption}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Skeleton() {
  return <div className="h-40 animate-pulse rounded-lg bg-slate-100" />;
}
