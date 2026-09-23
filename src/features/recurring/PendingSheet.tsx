import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { describeSchedule, type PendingOccurrence } from '@/core/recurring';
import { formatKoreanDate } from '@/core/date';
import { formatKrw } from '@/core/money';
import { materializeOccurrences } from '@/db/repo';
import type { Account } from '@/types';

/**
 * 기록할 때가 된 반복 거래를 확인받는다.
 *
 * 자동으로 넣지 않는 이유: 해지한 구독료가 계속 기록되면
 * 지출 통계가 조용히 틀어지고, 나중에 찾아서 지우기도 번거롭다.
 */
export function PendingSheet({
  open,
  occurrences,
  accounts,
  onClose,
}: {
  open: boolean;
  occurrences: PendingOccurrence[];
  accounts: Account[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(action: 'record' | 'skip') {
    setBusy(true);
    const created = await materializeOccurrences(occurrences, action);
    setResult(
      action === 'record'
        ? `${created}건을 기록했습니다.`
        : `${occurrences.length}건을 건너뛰었습니다.`,
    );
    setBusy(false);
  }

  return (
    <BottomSheet open={open} title="기록할 반복 거래" onClose={onClose} maxHeight="80vh">
      {result ? (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-700">{result}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            닫기
          </button>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <p className="text-xs text-slate-500">
            등록해 둔 반복 거래 중 기록할 때가 지난 것들입니다. 맞으면 기록하고,
            해지했거나 이미 따로 적었다면 건너뛰세요.
          </p>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {occurrences.map((occurrence) => (
              <li
                key={`${occurrence.recurring.id}-${occurrence.date}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {occurrence.recurring.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatKoreanDate(occurrence.date)} · {describeSchedule(occurrence.recurring)}
                    {' · '}
                    {accounts.find((a) => a.id === occurrence.recurring.template.accountId)?.name ??
                      '—'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-red-600">
                  -{formatKrw(occurrence.recurring.template.amount)}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void run('record')}
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-50"
          >
            {occurrences.length}건 모두 기록
          </button>

          <button
            type="button"
            onClick={() => void run('skip')}
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200 disabled:opacity-50"
          >
            이번엔 건너뛰기
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/** 홈 화면 배너 */
export function PendingBanner({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex min-h-14 w-full items-center gap-3 bg-blue-50 px-4 text-left active:bg-blue-100"
    >
      <Repeat className="size-5 shrink-0 text-blue-600" />
      <span className="flex-1 text-sm text-blue-900">기록할 반복 거래</span>
      <span className="text-sm font-semibold text-blue-900">{count}건</span>
    </button>
  );
}
