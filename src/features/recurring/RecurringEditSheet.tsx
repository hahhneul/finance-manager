import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { CategoryPicker } from '@/features/input/CategoryGrid';
import { AccountPicker } from '@/features/input/pickers';
import { validateAmount } from '@/core/amountInput';
import { AmountField } from '@/components/AmountField';
import { categoryPath } from '@/core/recent';
import { todayISO } from '@/core/date';
import { deleteRecurring, saveRecurring, updateRecurring } from '@/db/repo';
import type { Account, Category, ID, RecurringFreq, RecurringTransaction } from '@/types';

const FREQS: { value: RecurringFreq; label: string }[] = [
  { value: 'monthly', label: '매월' },
  { value: 'weekly', label: '매주' },
  { value: 'yearly', label: '매년' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function RecurringEditSheet({
  open,
  recurring,
  accounts,
  categories,
  onClose,
}: {
  open: boolean;
  recurring: RecurringTransaction | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<RecurringFreq>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [accountId, setAccountId] = useState<ID | undefined>();
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [enabled, setEnabled] = useState(true);
  const [sheet, setSheet] = useState<'account' | 'category' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const key = `${open}-${recurring?.id ?? 'new'}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setName(recurring?.name ?? '');
    setAmount(recurring ? String(recurring.template.amount) : '');
    setFreq(recurring?.freq ?? 'monthly');
    setDayOfMonth(recurring?.dayOfMonth ?? 1);
    setWeekday(recurring?.weekday ?? 1);
    setAccountId(recurring?.template.accountId);
    setCategoryId(recurring?.template.categoryId);
    setEnabled(recurring?.enabled ?? true);
    setError(null);
    setConfirmDelete(false);
    setSheet(null);
  }

  const account = accounts.find((a) => a.id === accountId);
  const category = categories.find((c) => c.id === categoryId);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('이름을 입력해 주세요.');
    const checked = validateAmount(amount);
    if (checked.error) return setError(checked.error);
    if (!accountId) return setError('계좌를 골라 주세요.');

    const template = {
      type: 'expense' as const,
      amount: checked.value,
      accountId,
      categoryId,
      memo: name.trim(),
      tags: ['고정지출'],
    };

    try {
      if (recurring) {
        await updateRecurring(recurring.id, {
          name: name.trim(), freq, dayOfMonth, weekday, enabled, template,
        });
      } else {
        await saveRecurring({
          name: name.trim(), freq, dayOfMonth, weekday, enabled, template,
          // 오늘부터 시작 — 과거 것을 한꺼번에 만들어내지 않는다
          startDate: todayISO(),
          lastGeneratedDate: todayISO(),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <BottomSheet
      open={open}
      title={recurring ? '반복 거래 수정' : '반복 거래 추가'}
      onClose={onClose}
      maxHeight="88vh"
    >
      <div className="space-y-3 pb-2">
        <label className="block">
          <span className="text-xs text-slate-500">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 넷플릭스"
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </label>

        <AmountField label="금액" value={amount} onChange={setAmount} />

        <div>
          <p className="mb-1.5 text-xs text-slate-500">주기</p>
          <Segment options={FREQS} value={freq} onChange={setFreq} />
        </div>

        {freq === 'monthly' && (
          <div>
            <p className="mb-1.5 text-xs text-slate-500">며칠에</p>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}일
                </option>
              ))}
            </select>
            {dayOfMonth > 28 && (
              <p className="mt-1 text-xs text-slate-500">
                2월처럼 짧은 달에는 말일에 기록됩니다.
              </p>
            )}
          </div>
        )}

        {freq === 'weekly' && (
          <div>
            <p className="mb-1.5 text-xs text-slate-500">무슨 요일</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setWeekday(index)}
                  className={`min-h-11 rounded-lg text-sm font-medium ${
                    index === weekday
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSheet('account')}
            className="min-h-12 rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            <span className="block text-[10px] text-slate-400">계좌</span>
            {account?.name ?? '고르기'}
          </button>

          <button
            type="button"
            onClick={() => setSheet('category')}
            className="min-h-12 truncate rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            <span className="block text-[10px] text-slate-400">카테고리</span>
            {category ? categoryPath(category, categories) : '고르기'}
          </button>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5 rounded border-slate-300"
          />
          사용
        </label>

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {recurring &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-12 flex-1 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteRecurring(recurring.id);
                  onClose();
                }}
                className="min-h-12 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
              >
                정말 삭제
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 active:bg-red-50"
            >
              <Trash2 className="size-4" />
              반복 거래 삭제
            </button>
          ))}
      </div>

      <BottomSheet open={sheet === 'account'} title="계좌" onClose={() => setSheet(null)}>
        <AccountPicker
          accounts={accounts}
          selectedId={accountId}
          onSelect={(id) => {
            setAccountId(id);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'category'} title="카테고리" onClose={() => setSheet(null)}>
        <CategoryPicker
          categories={categories}
          flow="expense"
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setSheet(null);
          }}
        />
      </BottomSheet>
    </BottomSheet>
  );
}
