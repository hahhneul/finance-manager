import type { Category, FlowKind, ID, ISODate, Transaction } from '@/types';
import { addDays } from './date';

/**
 * 빠른 입력 화면에 띄울 카테고리 순서.
 *
 * 그냥 "가장 최근에 쓴 것"으로 하면 어쩌다 한 번 쓴 분류가 매일 쓰는 커피를 밀어낸다.
 * 그래서 최근 며칠 안의 **사용 횟수**를 먼저 보고, 같으면 최근에 쓴 것을 앞에 둔다.
 *
 * 한 번도 안 쓴 카테고리는 뒤쪽에 원래 순서대로 채워 넣는다.
 * (앱을 막 시작해서 기록이 없을 때도 그리드가 비어 보이지 않게)
 */
export interface RankCategoriesOptions {
  flow: FlowKind;
  today: ISODate;
  /** 몇 개를 돌려줄지 */
  limit?: number;
  /** 며칠 치를 셀지 */
  windowDays?: number;
}

export function rankCategories(
  transactions: Transaction[],
  categories: Category[],
  options: RankCategoriesOptions,
): Category[] {
  const { flow, today, limit = 8, windowDays = 60 } = options;

  // 소분류가 있는 대분류는 그리드에 띄우지 않는다. 실제로 고르는 건 잎사귀 쪽이다.
  const parentIds = new Set(
    categories.filter((c) => c.parentId !== null).map((c) => c.parentId as ID),
  );
  const selectable = categories.filter(
    (c) => c.flow === flow && !c.archived && !parentIds.has(c.id),
  );
  const selectableIds = new Set(selectable.map((c) => c.id));

  const since = addDays(today, -windowDays);
  const counts = new Map<ID, number>();
  const lastUsed = new Map<ID, ISODate>();

  for (const tx of transactions) {
    if (!tx.categoryId || !selectableIds.has(tx.categoryId)) continue;
    if (tx.date < since) continue;

    counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);

    const previous = lastUsed.get(tx.categoryId);
    if (!previous || tx.date > previous) lastUsed.set(tx.categoryId, tx.date);
  }

  const used = selectable
    .filter((c) => counts.has(c.id))
    .sort((a, b) => {
      const byCount = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      if (byCount !== 0) return byCount;

      const aDate = lastUsed.get(a.id) ?? '';
      const bDate = lastUsed.get(b.id) ?? '';
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;

      return a.order - b.order;
    });

  const unused = selectable
    .filter((c) => !counts.has(c.id))
    .sort((a, b) => a.order - b.order);

  return [...used, ...unused].slice(0, limit);
}

/** 대분류 > 소분류 를 '식비 > 카페' 처럼 한 줄로 */
export function categoryPath(category: Category | undefined, categories: Category[]): string {
  if (!category) return '미분류';
  if (!category.parentId) return category.name;

  const parent = categories.find((c) => c.id === category.parentId);
  return parent ? `${parent.name} > ${category.name}` : category.name;
}

/**
 * 마지막으로 쓴 계좌를 추측한다.
 * 기록이 없으면 호출하는 쪽이 첫 계좌로 넘어간다.
 */
export function lastUsedAccountId(transactions: Transaction[]): ID | undefined {
  if (transactions.length === 0) return undefined;

  const latest = transactions.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
  return latest.accountId;
}
