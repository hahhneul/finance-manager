import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Repeat } from 'lucide-react';
import { SubScreen } from '@/features/settings/SubScreen';
import { describeSchedule, nextOccurrence, pendingOccurrences } from '@/core/recurring';
import { formatKoreanDate, todayISO } from '@/core/date';
import { formatKrw } from '@/core/money';
import { categoryPath } from '@/core/recent';
import { loadRecurring } from '@/db/repo';
import { useAccounts, useCategories } from '@/hooks/useData';
import type { RecurringTransaction } from '@/types';
import { RecurringEditSheet } from './RecurringEditSheet';

export function RecurringScreen() {
  const [editing, setEditing] = useState<RecurringTransaction | 'new' | null>(null);

  const recurrings = useLiveQuery(() => loadRecurring(), []);
  const accounts = useAccounts();
  const categories = useCategories();

  const today = todayISO();
  const pendingCount = useMemo(
    () => (recurrings ? pendingOccurrences(recurrings, today).length : 0),
    [recurrings, today],
  );

  return (
    <SubScreen
      title="반복 거래"
      action={
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label="반복 거래 추가"
          className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      <p className="bg-white px-4 py-3 text-xs text-slate-500">
        월세·구독료처럼 매번 같은 금액이 나가는 거래를 등록해 둡니다.
        <strong className="text-slate-700"> 자동으로 기록하지는 않습니다</strong> — 기록할
        때가 되면 홈 화면에서 확인을 받습니다.
      </p>

      {pendingCount > 0 && (
        <p className="mx-4 mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          기록할 것이 {pendingCount}건 있습니다. 홈 화면에서 확인해 주세요.
        </p>
      )}

      {!recurrings && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      {recurrings?.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Repeat className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">등록된 반복 거래가 없습니다.</p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            반복 거래 추가
          </button>
        </div>
      )}

      <ul className="mt-2 divide-y divide-slate-100 bg-white">
        {recurrings?.map((recurring) => {
          const next = nextOccurrence(recurring, today);
          const account = accounts?.find((a) => a.id === recurring.template.accountId);
          const category = categories?.find((c) => c.id === recurring.template.categoryId);

          return (
            <li key={recurring.id}>
              <button
                type="button"
                onClick={() => setEditing(recurring)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">
                    {recurring.name}
                    {!recurring.enabled && (
                      <span className="ml-1.5 text-[11px] text-slate-400">꺼짐</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {describeSchedule(recurring)} · {account?.name ?? '—'}
                    {category && ` · ${categoryPath(category, categories ?? [])}`}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-slate-900">
                    {formatKrw(recurring.template.amount)}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {next ? `다음 ${formatKoreanDate(next)}` : '예정 없음'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <RecurringEditSheet
        open={editing !== null}
        recurring={editing === 'new' ? null : editing}
        accounts={accounts ?? []}
        categories={categories ?? []}
        onClose={() => setEditing(null)}
      />
    </SubScreen>
  );
}
