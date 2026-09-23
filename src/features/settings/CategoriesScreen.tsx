import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { db } from '@/db/schema';
import { insert, patch } from '@/db/repo';
import { useCategories } from '@/hooks/useData';
import type { Category, FlowKind, ID } from '@/types';
import { SubScreen } from './SubScreen';

const FLOWS: { value: FlowKind; label: string }[] = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
];

export function CategoriesScreen() {
  const [flow, setFlow] = useState<FlowKind>('expense');
  const [expanded, setExpanded] = useState<Set<ID>>(new Set());
  const [editing, setEditing] = useState<
    { category: Category | null; parentId: ID | null } | null
  >(null);

  const categories = useCategories();
  const parents = categories?.filter((c) => c.parentId === null && c.flow === flow) ?? [];

  function toggle(id: ID) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <SubScreen
      title="카테고리"
      action={
        <button
          type="button"
          onClick={() => setEditing({ category: null, parentId: null })}
          aria-label="대분류 추가"
          className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      <div className="bg-white px-4 py-3">
        <Segment options={FLOWS} value={flow} onChange={setFlow} />
      </div>

      {!categories && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      <ul className="mt-2 divide-y divide-slate-100 bg-white">
        {parents.map((parent) => {
          const children = categories?.filter((c) => c.parentId === parent.id) ?? [];
          const open = expanded.has(parent.id);

          return (
            <li key={parent.id}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(parent.id)}
                  aria-label={open ? '접기' : '펼치기'}
                  className="flex size-11 shrink-0 items-center justify-center text-slate-400"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setEditing({ category: parent, parentId: null })}
                  className="flex min-h-14 flex-1 items-center gap-2 pr-2 text-left active:bg-slate-50"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: parent.color ?? '#94a3b8' }}
                  />
                  <span className="flex-1 text-sm font-medium text-slate-900">
                    {parent.name}
                    {parent.archived && (
                      <span className="ml-1.5 text-[11px] text-slate-400">숨김</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">{children.length}</span>
                </button>
              </div>

              {open && (
                <ul className="bg-slate-50/60 pl-11">
                  {children.map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ category: child, parentId: parent.id })}
                        className="min-h-12 w-full pr-4 text-left text-sm text-slate-700 active:bg-slate-100"
                      >
                        {child.name}
                        {child.archived && (
                          <span className="ml-1.5 text-[11px] text-slate-400">숨김</span>
                        )}
                      </button>
                    </li>
                  ))}

                  <li>
                    <button
                      type="button"
                      onClick={() => setEditing({ category: null, parentId: parent.id })}
                      className="min-h-12 w-full pr-4 text-left text-sm text-slate-400 active:bg-slate-100"
                    >
                      + 소분류 추가
                    </button>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <CategorySheet
        open={editing !== null}
        category={editing?.category ?? null}
        parentId={editing?.parentId ?? null}
        flow={flow}
        onClose={() => setEditing(null)}
      />
    </SubScreen>
  );
}

function CategorySheet({
  open,
  category,
  parentId,
  flow,
  onClose,
}: {
  open: boolean;
  category: Category | null;
  parentId: ID | null;
  flow: FlowKind;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const key = `${open}-${category?.id ?? `new-${parentId ?? 'root'}`}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setName(category?.name ?? '');
    setArchived(category?.archived ?? false);
    setError(null);
    setConfirmDelete(false);
  }

  const isChild = parentId !== null;

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }

    if (category) {
      await patch(db.categories, category.id, { name: name.trim(), archived });
    } else {
      const count = await db.categories.count();
      await insert(db.categories, {
        name: name.trim(), parentId, flow,
        archived: false, order: count,
      });
    }
    onClose();
  }

  async function destroy() {
    if (!category) return;

    // 쓰이고 있으면 지우지 않는다 — 지우면 그 거래들이 '미분류'가 된다
    const used = await db.transactions.filter((t) => t.categoryId === category.id).count();
    const childCount = await db.categories.filter((c) => c.parentId === category.id).count();

    if (used > 0) {
      setError(`이 카테고리를 쓰는 거래가 ${used}건 있습니다. 대신 '숨김'으로 두세요.`);
      setConfirmDelete(false);
      return;
    }
    if (childCount > 0) {
      setError(`소분류가 ${childCount}개 있습니다. 먼저 정리해 주세요.`);
      setConfirmDelete(false);
      return;
    }

    await db.categories.delete(category.id);
    onClose();
  }

  const title = category
    ? '카테고리 수정'
    : isChild
      ? '소분류 추가'
      : `${flow === 'expense' ? '지출' : '수입'} 대분류 추가`;

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <label className="block">
          <span className="text-xs text-slate-500">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isChild ? '예: 카페' : '예: 식비'}
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </label>

        {category && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
              className="size-5 rounded border-slate-300"
            />
            숨기기
            <span className="text-xs text-slate-400">(지난 기록은 그대로 남습니다)</span>
          </label>
        )}

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {category &&
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
                onClick={() => void destroy()}
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
              삭제
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
