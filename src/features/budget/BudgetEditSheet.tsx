import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { formatKrw } from '@/core/money';
import { parseKrwInput, validateAmount } from '@/core/amountInput';
import { AmountField } from '@/components/AmountField';
import type { BudgetUsage } from '@/core/budget';
import type { Category, ID } from '@/types';

/**
 * 예산 추가 · 수정.
 *
 * 예산은 **대분류에 거는 것을 기본**으로 한다.
 * 소분류마다 걸면 '식비 > 카페 3만원' 같은 것이 십여 개 생겨서 관리가 안 된다.
 * (계산은 소분류에 걸어도 되지만, 화면에서는 대분류만 권한다)
 */
export function BudgetEditSheet({
  open,
  usage,
  month,
  categories,
  existingCategoryIds,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** null 이면 새로 추가 */
  usage: BudgetUsage | null;
  month: string;
  categories: Category[];
  existingCategoryIds: ID[];
  onClose: () => void;
  onSave: (categoryId: ID, amount: number) => Promise<void>;
  onDelete: (budgetId: ID) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setCategoryId(usage?.categoryId);
    setAmount(usage ? String(usage.amount) : '');
  }, [open, usage]);

  const parents = categories.filter(
    (c) => c.parentId === null && c.flow === 'expense' && !c.archived,
  );

  // 이미 예산이 있는 카테고리는 새로 추가할 때만 숨긴다 (수정 중인 것은 보여야 한다)
  const selectable = parents.filter(
    (c) => c.id === usage?.categoryId || !existingCategoryIds.includes(c.id),
  );

  const numericAmount = parseKrwInput(amount).value;

  async function submit() {
    setError(null);

    if (!categoryId) {
      setError('카테고리를 골라 주세요.');
      return;
    }
    const checked = validateAmount(amount);
    if (checked.error) {
      setError(checked.error);
      return;
    }

    try {
      await onSave(categoryId, checked.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <BottomSheet
      open={open}
      title={usage ? `${usage.categoryName} 예산` : '예산 추가'}
      onClose={onClose}
    >
      <div className="space-y-3 pb-2">
        {!usage && (
          <div>
            <p className="mb-1.5 text-xs text-slate-500">카테고리</p>
            {selectable.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                모든 카테고리에 이미 예산이 있습니다. 기존 항목을 눌러 고쳐 주세요.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {selectable.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className={`min-h-11 rounded-lg px-1 text-sm ${
                      category.id === categoryId
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <AmountField
          label={`${month.slice(5, 7).replace(/^0/, '')}월 예산`}
          value={amount}
          onChange={setAmount}
        />

        {/* 자주 쓰는 금액을 한 번에 */}
        <div className="grid grid-cols-4 gap-1.5">
          {[100_000, 200_000, 300_000, 500_000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className="min-h-11 rounded-lg bg-slate-100 text-xs font-medium text-slate-700 active:bg-slate-200"
            >
              {preset / 10_000}만
            </button>
          ))}
        </div>

        {usage && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            이번 달 사용액 <span className="font-medium">{formatKrw(usage.spent)}</span>
            {numericAmount > 0 && numericAmount < usage.spent && (
              <span className="mt-1 block text-red-600">
                이미 쓴 금액보다 적은 예산입니다. 저장하면 바로 초과로 표시됩니다.
              </span>
            )}
          </p>
        )}

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {usage &&
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
                onClick={() => void onDelete(usage.budgetId)}
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
              예산 삭제
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
