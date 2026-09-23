import { useState } from 'react';
import type { TransactionFilter } from '@/core/transactions';
import type { Account, Category, ID, TxType } from '@/types';

/** 계좌 · 카테고리 · 태그 · 유형으로 거르기 */
export function FilterSheet({
  accounts,
  categories,
  tags,
  value,
  onChange,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  /** 지금 장부에 실제로 쓰인 태그들 */
  tags: string[];
  value: TransactionFilter;
  onChange: (filter: TransactionFilter) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TransactionFilter>(value);

  const toggle = <T,>(list: T[] | undefined, item: T): T[] | undefined => {
    const current = list ?? [];
    const next = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];
    return next.length > 0 ? next : undefined;
  };

  // 소분류가 있는 대분류는 고르게 하지 않는다. 잎사귀만 고른다.
  const parentIds = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId as ID));
  const leafCategories = categories.filter((c) => !c.archived && !parentIds.has(c.id));

  return (
    <div className="space-y-4 pb-2">
      <Group label="유형">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { value: 'expense', label: '지출' },
              { value: 'income', label: '수입' },
              { value: 'transfer', label: '이체' },
            ] as { value: TxType; label: string }[]
          ).map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={draft.types?.includes(option.value) ?? false}
              onClick={() => setDraft({ ...draft, types: toggle(draft.types, option.value) })}
            />
          ))}
        </div>
      </Group>

      <Group label="계좌">
        <div className="grid grid-cols-3 gap-1.5">
          {accounts
            .filter((a) => !a.archived)
            .map((account) => (
              <Chip
                key={account.id}
                label={account.name}
                active={draft.accountIds?.includes(account.id) ?? false}
                onClick={() =>
                  setDraft({ ...draft, accountIds: toggle(draft.accountIds, account.id) })
                }
              />
            ))}
        </div>
      </Group>

      <Group label="카테고리">
        <div className="grid grid-cols-3 gap-1.5">
          {leafCategories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              active={draft.categoryIds?.includes(category.id) ?? false}
              onClick={() =>
                setDraft({ ...draft, categoryIds: toggle(draft.categoryIds, category.id) })
              }
            />
          ))}
        </div>
      </Group>

      {tags.length > 0 && (
        <Group label="태그">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={`#${tag}`}
                active={draft.tags?.includes(tag) ?? false}
                onClick={() => setDraft({ ...draft, tags: toggle(draft.tags, tag) })}
              />
            ))}
          </div>
        </Group>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setDraft({});
            onChange({});
            onClose();
          }}
          className="min-h-12 flex-1 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(draft);
            onClose();
          }}
          className="min-h-12 flex-[2] rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          적용
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{label}</h3>
      {children}
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-lg px-2 text-xs font-medium ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 active:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
