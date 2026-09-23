import type {
  Category,
  FlowKind,
  ID,
  ISODate,
  Krw,
  Ledger,
  Settlement,
  Transaction,
  YearMonth,
} from '@/types';
import { isInMonth } from './date';

/**
 * 통계에서 빼야 하는 거래인가.
 *
 * 이체는 내 돈이 계좌 사이를 옮겨간 것뿐이라 수입도 지출도 아니다.
 * 주식 매수·매도도 같은 이유로 통계에서 빠지는데,
 * 그건 애초에 Trade 라는 별도 테이블이라 여기 오지도 않는다.
 */
export function isExcludedFromStats(tx: Transaction): boolean {
  return tx.type === 'transfer' || tx.excludeFromStats === true;
}

/**
 * 통계용으로 정규화한 한 줄.
 *
 * 거래와 정산은 생김새가 다르지만 "언제, 어느 분류로, 얼마 썼나"는 같다.
 * 이체 제외 / 정산은 내 몫만 같은 규칙을 **이 함수 한 곳에만** 두고,
 * 월 합계·카테고리 합계·예산 사용률은 전부 이 결과를 쓴다.
 */
export interface StatsEntry {
  id: ID;
  source: 'transaction' | 'settlement';
  date: string;
  flow: FlowKind;
  /** 정산이면 총액이 아니라 내 몫(myShare) */
  amount: Krw;
  categoryId?: ID;
  accountId: ID;
  memo: string;
  tags: string[];
}

export function statsEntries(ledger: Ledger): StatsEntry[] {
  const fromTransactions: StatsEntry[] = ledger.transactions
    .filter((tx) => !isExcludedFromStats(tx))
    .map((tx) => ({
      id: tx.id,
      source: 'transaction' as const,
      date: tx.date,
      // 이체는 위에서 걸러졌으므로 여기는 income/expense 뿐이다
      flow: tx.type as FlowKind,
      amount: tx.amount,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      memo: tx.memo,
      tags: tx.tags,
    }));

  const fromSettlements: StatsEntry[] = ledger.settlements.map((s) => ({
    id: s.id,
    source: 'settlement' as const,
    date: s.date,
    flow: 'expense' as const,
    // 총액 12만원을 결제했어도 4명이면 지출은 3만원이다
    amount: s.myShare,
    categoryId: s.categoryId,
    accountId: s.payerAccountId,
    memo: s.title,
    tags: s.tags,
  }));

  return [...fromTransactions, ...fromSettlements].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

export function entriesInMonth(ledger: Ledger, month: YearMonth): StatsEntry[] {
  return statsEntries(ledger).filter((e) => isInMonth(e.date, month));
}

export interface MonthlyTotals {
  month: YearMonth;
  income: Krw;
  expense: Krw;
  /** 수입 − 지출 */
  net: Krw;
}

/** 한 달 수입·지출·잔액 */
export function monthlyTotals(ledger: Ledger, month: YearMonth): MonthlyTotals {
  let income = 0;
  let expense = 0;

  for (const entry of entriesInMonth(ledger, month)) {
    if (entry.flow === 'income') income += entry.amount;
    else expense += entry.amount;
  }

  return { month, income, expense, net: income - expense };
}

/** 여러 달치를 한 번에 (최근 6개월 추이 차트용) */
export function monthlyTrend(ledger: Ledger, months: YearMonth[]): MonthlyTotals[] {
  return months.map((m) => monthlyTotals(ledger, m));
}

export interface CategoryTotal {
  categoryId: ID;
  categoryName: string;
  /** 대분류면 null */
  parentId: ID | null;
  amount: Krw;
  /** 전체 지출 대비 비율 (0~1) */
  ratio: number;
}

export interface CategoryBreakdown {
  total: Krw;
  /** 대분류 합계 (하위 소분류 포함), 금액 큰 순 */
  parents: CategoryTotal[];
  /** 소분류 합계, 금액 큰 순 */
  children: CategoryTotal[];
  /** 카테고리가 없는 거래의 합계 */
  uncategorized: Krw;
}

/**
 * 카테고리별 합계.
 * 소분류 금액은 자기 대분류에도 더해진다 (식비>카페 5,500원은 식비에도 잡힌다).
 */
export function categoryTotals(
  ledger: Ledger,
  categories: Category[],
  month: YearMonth,
  flow: FlowKind = 'expense',
): CategoryBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<ID, Krw>();
  let total = 0;
  let uncategorized = 0;

  for (const entry of entriesInMonth(ledger, month)) {
    if (entry.flow !== flow) continue;
    total += entry.amount;

    const category = entry.categoryId ? byId.get(entry.categoryId) : undefined;
    if (!category) {
      uncategorized += entry.amount;
      continue;
    }

    sums.set(category.id, (sums.get(category.id) ?? 0) + entry.amount);

    // 소분류면 대분류에도 더한다
    if (category.parentId) {
      sums.set(category.parentId, (sums.get(category.parentId) ?? 0) + entry.amount);
    }
  }

  const toTotal = (categoryId: ID, amount: Krw): CategoryTotal => {
    const category = byId.get(categoryId);
    return {
      categoryId,
      categoryName: category?.name ?? '알 수 없음',
      parentId: category?.parentId ?? null,
      amount,
      ratio: total === 0 ? 0 : amount / total,
    };
  };

  const rows = [...sums.entries()].map(([id, amount]) => toTotal(id, amount));
  const byAmountDesc = (a: CategoryTotal, b: CategoryTotal) => b.amount - a.amount;

  return {
    total,
    parents: rows.filter((r) => r.parentId === null).sort(byAmountDesc),
    children: rows.filter((r) => r.parentId !== null).sort(byAmountDesc),
    uncategorized,
  };
}

/**
 * 어떤 카테고리(그리고 그 하위 소분류)에 이번 달 쓴 금액.
 * 예산 사용률이 이걸 쓴다.
 */
export function spentOnCategory(
  ledger: Ledger,
  categories: Category[],
  categoryId: ID,
  month: YearMonth,
): Krw {
  const childIds = new Set(
    categories.filter((c) => c.parentId === categoryId).map((c) => c.id),
  );

  return entriesInMonth(ledger, month)
    .filter((e) => e.flow === 'expense')
    .filter((e) => e.categoryId === categoryId || (e.categoryId && childIds.has(e.categoryId)))
    .reduce((sum, e) => sum + e.amount, 0);
}

export interface TransactionFilter {
  month?: YearMonth;
  accountIds?: ID[];
  categoryIds?: ID[];
  tags?: string[];
  /** 메모·태그 부분 일치 */
  query?: string;
  types?: Transaction['type'][];
}

/** 거래 목록 화면의 검색·필터 */
export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] {
  const query = filter.query?.trim().toLowerCase();

  return transactions.filter((tx) => {
    if (filter.month && !isInMonth(tx.date, filter.month)) return false;
    if (filter.types && !filter.types.includes(tx.type)) return false;

    if (filter.accountIds?.length) {
      const matches =
        filter.accountIds.includes(tx.accountId) ||
        (tx.toAccountId !== undefined && filter.accountIds.includes(tx.toAccountId));
      if (!matches) return false;
    }

    if (filter.categoryIds?.length) {
      if (!tx.categoryId || !filter.categoryIds.includes(tx.categoryId)) return false;
    }

    if (filter.tags?.length) {
      if (!filter.tags.some((t) => tx.tags.includes(t))) return false;
    }

    if (query) {
      const haystack = `${tx.memo} ${tx.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/** 달력 뷰용 — 날짜별 지출 합계 */
export function dailyExpenseTotals(ledger: Ledger, month: YearMonth): Map<string, Krw> {
  const byDate = new Map<string, Krw>();
  for (const entry of entriesInMonth(ledger, month)) {
    if (entry.flow !== 'expense') continue;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount);
  }
  return byDate;
}

// ---------------------------------------------------------------------------
// 거래 목록 화면
// ---------------------------------------------------------------------------

/**
 * 목록에 뿌릴 한 줄. 거래와 정산이 한 목록에 섞여 나온다.
 *
 * 통계용 statsEntries() 와 다른 점: **이체도 보여준다**.
 * 이체는 수입·지출 통계에서 빠질 뿐, 내역에서 숨기면 안 된다.
 */
export interface LedgerRow {
  id: ID;
  kind: 'transaction' | 'settlement';
  date: ISODate;
  transaction?: Transaction;
  settlement?: Settlement;
}

/** 최근 날짜가 위로 */
export function ledgerRows(ledger: Ledger): LedgerRow[] {
  const rows: LedgerRow[] = [
    ...ledger.transactions.map((tx) => ({
      id: tx.id, kind: 'transaction' as const, date: tx.date, transaction: tx,
    })),
    ...ledger.settlements.map((s) => ({
      id: s.id, kind: 'settlement' as const, date: s.date, settlement: s,
    })),
  ];

  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    // 같은 날이면 나중에 입력한 것이 위로
    const aStamp = a.transaction?.createdAt ?? a.settlement?.createdAt ?? '';
    const bStamp = b.transaction?.createdAt ?? b.settlement?.createdAt ?? '';
    return aStamp < bStamp ? 1 : -1;
  });
}

/** 한 줄이 지출 통계에 기여하는 금액. 이체는 0 */
export function rowStatsAmount(row: LedgerRow): { flow: FlowKind | null; amount: Krw } {
  if (row.settlement) return { flow: 'expense', amount: row.settlement.myShare };

  const tx = row.transaction;
  if (!tx || isExcludedFromStats(tx)) return { flow: null, amount: 0 };

  return { flow: tx.type as FlowKind, amount: tx.amount };
}

export interface DayGroup {
  date: ISODate;
  rows: LedgerRow[];
  /** 그날 지출 합계 (이체 제외, 정산은 내 몫) */
  expense: Krw;
  income: Krw;
}

/** 날짜별로 묶는다. 목록 화면이 날짜 구분선과 일일 합계를 그릴 때 쓴다 */
export function groupRowsByDate(rows: LedgerRow[]): DayGroup[] {
  const groups = new Map<ISODate, LedgerRow[]>();

  for (const row of rows) {
    const list = groups.get(row.date);
    if (list) list.push(row);
    else groups.set(row.date, [row]);
  }

  return [...groups.entries()].map(([date, dayRows]) => {
    let expense = 0;
    let income = 0;

    for (const row of dayRows) {
      const { flow, amount } = rowStatsAmount(row);
      if (flow === 'expense') expense += amount;
      else if (flow === 'income') income += amount;
    }

    return { date, rows: dayRows, expense, income };
  });
}

/** 목록 필터를 정산에도 적용한다 */
export function filterRows(rows: LedgerRow[], filter: TransactionFilter): LedgerRow[] {
  const query = filter.query?.trim().toLowerCase();

  return rows.filter((row) => {
    if (row.transaction) {
      return filterTransactions([row.transaction], filter).length === 1;
    }

    const s = row.settlement;
    if (!s) return false;

    if (filter.month && !isInMonth(s.date, filter.month)) return false;
    // 정산은 유형 필터에서 지출로 본다
    if (filter.types && !filter.types.includes('expense')) return false;

    if (filter.accountIds?.length) {
      const matches =
        filter.accountIds.includes(s.payerAccountId) ||
        filter.accountIds.includes(s.receiverAccountId);
      if (!matches) return false;
    }

    if (filter.categoryIds?.length) {
      if (!s.categoryId || !filter.categoryIds.includes(s.categoryId)) return false;
    }

    if (filter.tags?.length && !filter.tags.some((t) => s.tags.includes(t))) return false;

    if (query) {
      const haystack = `${s.title} ${s.memo} ${s.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/** 장부에 실제로 쓰인 태그 목록 (필터 화면이 고를 수 있게) */
export function collectTags(ledger: Ledger): string[] {
  const tags = new Set<string>();
  for (const tx of ledger.transactions) for (const tag of tx.tags) tags.add(tag);
  for (const s of ledger.settlements) for (const tag of s.tags) tags.add(tag);
  return [...tags].sort();
}
