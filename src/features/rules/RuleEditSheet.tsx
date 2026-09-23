import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { CategoryPicker } from '@/features/input/CategoryGrid';
import { countMatches, nextPriority } from '@/core/rules';
import { categoryPath } from '@/core/recent';
import type { Category, ID, Rule, Transaction } from '@/types';

type RuleData = Omit<Rule, keyof import('@/types').Entity | 'name'> & { name?: string };

const OPS = [
  { value: 'contains' as const, label: '포함' },
  { value: 'startsWith' as const, label: '시작' },
  { value: 'equals' as const, label: '일치' },
];

/**
 * 규칙 추가 · 수정.
 *
 * 입력하는 동안 **지금 몇 건에 맞는지 바로 보여준다.**
 * 오타를 쳤거나 조건이 너무 넓으면(예: '카' 한 글자) 저장하기 전에 알아챌 수 있다.
 */
export function RuleEditSheet({
  open,
  rule,
  rules,
  categories,
  transactions,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** null 이면 새로 추가 */
  rule: Rule | null;
  rules: Rule[];
  categories: Category[];
  transactions: Transaction[];
  onClose: () => void;
  onSave: (data: RuleData, id?: ID) => Promise<void>;
  onDelete: (id: ID) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [op, setOp] = useState<Rule['op']>('contains');
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [enabled, setEnabled] = useState(true);
  const [showCategories, setShowCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setShowCategories(false);
    setValue(rule?.value ?? '');
    setOp(rule?.op ?? 'contains');
    setCategoryId(rule?.categoryId);
    setEnabled(rule?.enabled ?? true);
  }, [open, rule]);

  // 입력하는 동안 실시간으로 몇 건에 맞는지 센다
  const preview = useMemo(() => {
    if (!value.trim() || !categoryId) return null;

    const draft: Rule = {
      id: 'preview', createdAt: '', updatedAt: '',
      name: '', field: 'memo', op, value,
      categoryId, priority: 0, enabled: true,
    };

    const matched = transactions.filter((tx) =>
      countMatches(draft, [tx]) > 0,
    );

    return {
      count: matched.length,
      samples: matched.slice(0, 3).map((tx) => tx.memo),
      // 이미 다른 카테고리로 분류돼 있는 것이 몇 건인지
      wouldChange: matched.filter((tx) => tx.categoryId && tx.categoryId !== categoryId).length,
    };
  }, [value, op, categoryId, transactions]);

  const category = categories.find((c) => c.id === categoryId);

  async function submit() {
    setError(null);

    if (!value.trim()) {
      setError('찾을 내용을 입력해 주세요.');
      return;
    }
    if (!categoryId) {
      setError('어느 카테고리로 분류할지 골라 주세요.');
      return;
    }

    try {
      await onSave(
        {
          field: 'memo',
          op,
          value: value.trim(),
          categoryId,
          enabled,
          priority: rule?.priority ?? nextPriority(rules),
          addTags: rule?.addTags,
        },
        rule?.id,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <BottomSheet open={open} title={rule ? '규칙 수정' : '규칙 추가'} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <label className="block">
          <span className="text-xs text-slate-500">메모에서 찾을 내용</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="예: 스타벅스"
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </label>

        <div>
          <p className="mb-1.5 text-xs text-slate-500">찾는 방법</p>
          <Segment options={OPS} value={op} onChange={setOp} />
        </div>

        <div>
          <p className="mb-1.5 text-xs text-slate-500">이 카테고리로 분류</p>
          <button
            type="button"
            onClick={() => setShowCategories(!showCategories)}
            className="min-h-12 w-full rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            {category ? categoryPath(category, categories) : '카테고리 고르기'}
          </button>

          {showCategories && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-3">
              <CategoryPicker
                categories={categories}
                flow="expense"
                selectedId={categoryId}
                onSelect={(id) => {
                  setCategoryId(id);
                  setShowCategories(false);
                }}
              />
            </div>
          )}
        </div>

        {/* 저장하기 전에 효과를 미리 본다 */}
        {preview && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs">
            <p className="font-medium text-slate-700">
              지금 기록에서 {preview.count}건에 해당합니다.
            </p>
            {preview.samples.length > 0 && (
              <p className="mt-1 truncate text-slate-500">예: {preview.samples.join(', ')}</p>
            )}
            {preview.wouldChange > 0 && (
              <p className="mt-1 text-amber-700">
                그중 {preview.wouldChange}건은 이미 다른 카테고리로 분류돼 있습니다.
              </p>
            )}
            {preview.count === 0 && (
              <p className="mt-1 text-slate-500">
                아직 해당하는 거래가 없습니다. 앞으로 입력할 거래에 적용됩니다.
              </p>
            )}
          </div>
        )}

        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5 rounded border-slate-300"
          />
          규칙 사용
        </label>

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {rule &&
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
                onClick={() => void onDelete(rule.id)}
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
              규칙 삭제
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
