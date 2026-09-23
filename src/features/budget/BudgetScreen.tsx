import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Plus,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '@/layout/AppShell';
import { budgetSummary, budgetUsage, type BudgetStatus, type BudgetUsage } from '@/core/budget';
import { addMonths, currentMonth, formatKoreanMonth } from '@/core/date';
import { formatKrw, formatPercent } from '@/core/money';
import { METER, type MeterTone } from '@/core/chartColors';
import { copyBudgetsFrom, deleteBudget, loadBudgets, saveBudget } from '@/db/repo';
import { useCategories, useLedger } from '@/hooks/useData';
import { BudgetEditSheet } from './BudgetEditSheet';

/** 상태마다 색·아이콘·이름을 한 곳에서 정한다 */
const TONE: Record<BudgetStatus, { tone: MeterTone; label: string; text: string }> = {
  ok: { tone: 'ok', label: '여유', text: 'text-blue-700' },
  warning: { tone: 'warning', label: '주의', text: 'text-amber-700' },
  over: { tone: 'over', label: '초과', text: 'text-red-700' },
};

export function BudgetScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<BudgetUsage | 'new' | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const categories = useCategories();
  const ledger = useLedger(month);
  const budgets = useLiveQuery(() => loadBudgets(month), [month]);

  const usages = useMemo(() => {
    if (!budgets || !ledger || !categories) return [];
    return budgetUsage(budgets, ledger, categories, month);
  }, [budgets, ledger, categories, month]);

  const summary = useMemo(() => budgetSummary(usages), [usages]);

  const previousMonth = addMonths(month, -1);

  async function copyPrevious() {
    const count = await copyBudgetsFrom(previousMonth, month);
    setCopied(count);
  }

  const loading = !budgets || !ledger || !categories;

  return (
    <>
      <ScreenHeader
        title="예산"
        action={
          <button
            type="button"
            onClick={() => setEditing('new')}
            aria-label="예산 추가"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <Plus className="size-5" />
          </button>
        }
      />

      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setMonth(addMonths(month, -1)); setCopied(null); }}
            aria-label="이전 달"
            className="flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="text-base font-semibold">{formatKoreanMonth(month)}</p>
          <button
            type="button"
            onClick={() => { setMonth(addMonths(month, 1)); setCopied(null); }}
            aria-label="다음 달"
            className="flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {usages.length > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-slate-600">전체</p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">
                  {formatKrw(summary.totalSpent)}
                </span>
                <span className="text-slate-400"> / {formatKrw(summary.totalBudget)}</span>
              </p>
            </div>

            {/*
              전체 바는 **전체 사용률만** 나타낸다.
              한 카테고리가 넘쳤다고 전체를 빨갛게 칠하면 예산을 다 쓴 것처럼 보인다.
              초과한 카테고리는 아래 글자로 따로 알린다.
            */}
            <Meter
              ratio={summary.ratio}
              tone={summary.ratio >= 1 ? 'over' : summary.ratio >= 0.8 ? 'warning' : 'ok'}
            />

            <p className="mt-1.5 text-xs text-slate-500">
              {summary.totalRemaining >= 0
                ? `${formatKrw(summary.totalRemaining)} 남음`
                : `${formatKrw(-summary.totalRemaining)} 초과`}
              {summary.overCount > 0 && ` · 초과한 카테고리 ${summary.overCount}개`}
            </p>
          </div>
        )}
      </section>

      {loading && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      {!loading && usages.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-slate-500">{formatKoreanMonth(month)} 예산이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            카테고리마다 한 달에 얼마까지 쓸지 정해두면 사용률이 표시됩니다.
          </p>

          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            예산 추가
          </button>

          <button
            type="button"
            onClick={() => void copyPrevious()}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
          >
            <Copy className="size-4" />
            {formatKoreanMonth(previousMonth)} 예산 그대로 가져오기
          </button>

          {copied !== null && (
            <p className="mt-2 text-xs text-slate-500">
              {copied > 0 ? `${copied}개를 가져왔습니다.` : '가져올 예산이 없습니다.'}
            </p>
          )}
        </div>
      )}

      {usages.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 bg-white">
          {usages.map((usage) => (
            <li key={usage.budgetId}>
              <BudgetRow usage={usage} onClick={() => setEditing(usage)} />
            </li>
          ))}
        </ul>
      )}

      <BudgetEditSheet
        open={editing !== null}
        usage={editing === 'new' ? null : editing}
        month={month}
        categories={categories ?? []}
        existingCategoryIds={usages.map((u) => u.categoryId)}
        onClose={() => setEditing(null)}
        onSave={async (categoryId, amount) => {
          await saveBudget(month, categoryId, amount);
          setEditing(null);
        }}
        onDelete={async (budgetId) => {
          await deleteBudget(budgetId);
          setEditing(null);
        }}
      />
    </>
  );
}

function BudgetRow({ usage, onClick }: { usage: BudgetUsage; onClick: () => void }) {
  const tone = TONE[usage.status];

  return (
    <button type="button" onClick={onClick} className="w-full px-4 py-3 text-left active:bg-slate-50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-900">{usage.categoryName}</span>
          {/* 색만으로 상태를 알리지 않는다 — 아이콘과 글자를 같이 붙인다 */}
          {usage.status !== 'ok' && (
            <span className={`flex items-center gap-0.5 text-[11px] font-medium ${tone.text}`}>
              {usage.status === 'over' ? (
                <CircleAlert className="size-3.5" />
              ) : (
                <AlertTriangle className="size-3.5" />
              )}
              {tone.label}
            </span>
          )}
        </span>

        <span className="shrink-0 text-xs text-slate-400">
          {Number.isFinite(usage.ratio) ? formatPercent(usage.ratio, 0) : '—'}
        </span>
      </div>

      <Meter ratio={usage.ratio} tone={tone.tone} />

      <div className="mt-1.5 flex items-baseline justify-between text-xs">
        <span className="text-slate-600">
          {formatKrw(usage.spent)}
          <span className="text-slate-400"> / {formatKrw(usage.amount)}</span>
        </span>
        <span className={usage.remaining < 0 ? 'font-medium text-red-600' : 'text-slate-500'}>
          {usage.remaining >= 0
            ? `${formatKrw(usage.remaining)} 남음`
            : `${formatKrw(-usage.remaining)} 초과`}
        </span>
      </div>
    </button>
  );
}

/**
 * 사용률 진행 바.
 *
 * 빈 트랙은 채운 색과 **같은 계열의 옅은 단계**를 쓴다.
 * 그래야 바를 끝까지 훑지 않아도 전체 색감만으로 상태가 읽힌다.
 */
function Meter({ ratio, tone }: { ratio: number; tone: MeterTone }) {
  const colors = METER[tone];
  const percent = Number.isFinite(ratio) ? Math.min(ratio, 1) * 100 : 100;

  return (
    <div
      className="mt-2 h-2 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: colors.track }}
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${percent}%`, backgroundColor: colors.fill }}
      />
    </div>
  );
}

