import { ChevronRight } from 'lucide-react';
import type { Category, ID } from '@/types';

/**
 * 자주 쓰는 카테고리 8개 그리드.
 *
 * 대분류 > 소분류를 두 번 고르게 하면 "3탭 입력"이 안 된다.
 * 그래서 평소에는 최근 쓴 **소분류**를 바로 띄우고,
 * 거기 없는 것만 `전체`로 들어가서 두 단계로 고른다.
 */
export function CategoryGrid({
  categories,
  selectedId,
  onSelect,
  onOpenAll,
}: {
  categories: Category[];
  selectedId?: ID;
  onSelect: (id: ID) => void;
  onOpenAll: () => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {categories.map((category) => {
        const active = category.id === selectedId;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`min-h-11 rounded-lg px-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 active:bg-slate-200'
            }`}
          >
            {category.name}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOpenAll}
        className="flex min-h-11 items-center justify-center gap-0.5 rounded-lg bg-slate-100 px-1 text-xs font-medium text-slate-500 active:bg-slate-200"
      >
        전체
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * 전체 카테고리 시트 — 대분류로 묶어서 전부 보여준다.
 * 소분류가 없는 대분류는 그 자체를 고를 수 있다.
 */
export function CategoryPicker({
  categories,
  flow,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  flow: 'income' | 'expense';
  selectedId?: ID;
  onSelect: (id: ID) => void;
}) {
  const visible = categories.filter((c) => c.flow === flow && !c.archived);
  const parents = visible.filter((c) => c.parentId === null);

  return (
    <div className="space-y-4">
      {parents.map((parent) => {
        const children = visible.filter((c) => c.parentId === parent.id);
        // 소분류가 없으면 대분류 자체가 선택 대상이다
        const options = children.length > 0 ? children : [parent];

        return (
          <section key={parent.id}>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{parent.name}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option.id)}
                  className={`min-h-11 rounded-lg px-1 text-sm transition-colors ${
                    option.id === selectedId
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                  }`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
