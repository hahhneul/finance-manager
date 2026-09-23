import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { loadLedger } from '@/db/repo';
import { DEFAULT_SETTINGS } from '@/types';
import type { AppSettings, Ledger, YearMonth } from '@/types';

/**
 * 화면이 쓰는 데이터 훅.
 *
 * useLiveQuery 는 IndexedDB 가 바뀌면 알아서 다시 읽어온다.
 * 거래를 저장하면 목록 화면이 저절로 갱신되므로 새로고침 코드를 짤 필요가 없다.
 *
 * 아직 읽는 중이면 undefined 를 돌려준다. 화면에서 로딩 상태를 구분할 수 있게.
 */

export function useAccounts() {
  return useLiveQuery(() => db.accounts.orderBy('order').toArray(), []);
}

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
}

/** month 를 주면 그 달만. 계좌 잔액을 계산할 때는 month 없이 전체를 읽어야 한다 */
export function useLedger(month?: YearMonth): Ledger | undefined {
  return useLiveQuery(() => loadLedger(month), [month]);
}

export function useTransactions(month?: YearMonth) {
  return useLiveQuery(
    () => (month ? db.transactions.where('date').startsWith(month).toArray() : db.transactions.toArray()),
    [month],
  );
}

/** 빠른 입력의 "최근 쓴 카테고리"는 이번 달만 보면 부족해서 전체를 읽는다 */
export function useAllTransactions() {
  return useLiveQuery(() => db.transactions.toArray(), []);
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => {
    const rows = await db.settings.toArray();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
  }, []);
}
