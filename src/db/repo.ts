import type { EntityTable, IDType } from 'dexie';
import { db, DATA_TABLES, type DataTableName } from './schema';
import { newId } from '@/core/ids';
import { nowTimestamp, todayISO } from '@/core/date';
import { recomputeHolding, tradeKey } from '@/core/holdings';
import { computeNetWorth, reconstructSnapshots, toSnapshot } from '@/core/networth';
import { refreshQuotes, type RefreshResult } from '@/prices/refresh';
import { createProvider, erApiFxProvider } from '@/prices/registry';
import {
  applyReceipt,
  buildSettlement,
  outstanding,
  type SettlementDraft,
  validateSettlement,
} from '@/core/settlement';
import { applyRules } from '@/core/rules';
import {
  alreadyRecorded,
  toTransaction,
  type PendingOccurrence,
} from '@/core/recurring';
import { DEFAULT_SETTINGS } from '@/types';
import type {
  Account,
  AppSettings,
  Budget,
  Entity,
  FxRate,
  ID,
  Krw,
  Ledger,
  NetWorthSnapshot,
  NewRecord,
  PriceQuote,
  RecurringTransaction,
  Rule,
  Settlement,
  Trade,
  Transaction,
  YearMonth,
} from '@/types';

/**
 * IndexedDB 접근은 전부 이 모듈을 거친다.
 * UI 컴포넌트는 Dexie 를 직접 import 하지 않는다.
 * 나중에 저장 방식을 바꾸더라도 고칠 곳이 여기 하나가 되도록.
 */

// ---------------------------------------------------------------------------
// 공통 CRUD
// ---------------------------------------------------------------------------

/** id 와 시각을 붙여서 저장한다 */
export async function insert<T extends Entity>(
  table: EntityTable<T, 'id'>,
  data: NewRecord<T>,
): Promise<T> {
  const now = nowTimestamp();
  const record = {
    ...data,
    id: data.id ?? newId(),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  } as T;

  await table.add(record);
  return record;
}

/** updatedAt 을 자동으로 갱신한다 */
export async function patch<T extends Entity>(
  table: EntityTable<T, 'id'>,
  id: IDType<T, 'id'>,
  changes: Partial<Omit<T, keyof Entity>>,
): Promise<T | undefined> {
  await table.update(id, { ...changes, updatedAt: nowTimestamp() } as never);
  return table.get(id);
}

export async function remove<T extends Entity>(
  table: EntityTable<T, 'id'>,
  id: IDType<T, 'id'>,
): Promise<void> {
  await table.delete(id);
}

// ---------------------------------------------------------------------------
// 장부 읽기
// ---------------------------------------------------------------------------

/**
 * 계산 함수에 넘길 장부 묶음.
 *
 * month 를 주면 그 달만 읽지만, **계좌 잔액에는 쓰면 안 된다**.
 * 잔액은 앱을 쓰기 시작한 시점부터 전부 더해야 나오는 값이다.
 */
export async function loadLedger(month?: YearMonth): Promise<Ledger> {
  if (!month) {
    const [transactions, settlements] = await Promise.all([
      db.transactions.toArray(),
      db.settlements.toArray(),
    ]);
    return { transactions, settlements };
  }

  const [transactions, settlements] = await Promise.all([
    db.transactions.where('date').startsWith(month).toArray(),
    db.settlements.where('date').startsWith(month).toArray(),
  ]);
  return { transactions, settlements };
}

export function loadAccounts(): Promise<Account[]> {
  return db.accounts.orderBy('order').toArray();
}

export function loadCategories() {
  return db.categories.orderBy('order').toArray();
}

export function loadTrades(): Promise<Trade[]> {
  return db.trades.toArray();
}

export function loadQuotes(): Promise<PriceQuote[]> {
  return db.quotes.toArray();
}

// ---------------------------------------------------------------------------
// 거래
// ---------------------------------------------------------------------------

export async function saveTransaction(data: NewRecord<Transaction>): Promise<Transaction> {
  if (!Number.isInteger(data.amount) || data.amount < 0) {
    throw new Error(`금액은 0 이상의 정수여야 합니다: ${data.amount}`);
  }
  if (data.type === 'transfer' && !data.toAccountId) {
    throw new Error('이체는 받는 계좌가 필요합니다.');
  }
  if (data.type === 'transfer' && data.accountId === data.toAccountId) {
    throw new Error('같은 계좌로는 이체할 수 없습니다.');
  }
  return insert(db.transactions, data);
}

// ---------------------------------------------------------------------------
// 정산
// ---------------------------------------------------------------------------

/**
 * 총액과 인원만 넣으면 나머지는 자동으로 계산해서 저장한다.
 *   결제한 계좌 → 총액이 빠진다
 *   정산 계좌   → 내 몫을 뺀 금액이 들어온다
 */
export async function saveSettlement(draft: SettlementDraft): Promise<Settlement> {
  const data = buildSettlement(draft);

  const errors = validateSettlement(data);
  if (errors.length > 0) throw new Error(errors.join(' '));

  return insert(db.settlements, data);
}

/**
 * 정산금 입금을 기록한다.
 *
 * 일부만 받아도 되고, 여러 번 나눠 받아도 된다 — 받은 금액이 누적된다.
 * 받은 돈은 **수입이 아니다**. 내가 빌려준 돈을 돌려받은 것이라
 * 계좌 잔액만 늘고 수입 통계에는 잡히지 않는다.
 */
export async function recordSettlementReceipt(
  id: ID,
  amount: Krw,
  date: string,
): Promise<Settlement | undefined> {
  const settlement = await db.settlements.get(id);
  if (!settlement) throw new Error('정산 기록을 찾을 수 없습니다.');

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('입금액은 0원보다 큰 정수여야 합니다.');
  }

  const remaining = outstanding(settlement);
  if (amount > remaining) {
    throw new Error(`남은 금액(${remaining.toLocaleString('ko-KR')}원)보다 많이 넣을 수 없습니다.`);
  }

  return patch(db.settlements, id, applyReceipt(settlement, amount, date));
}

/** 입금 기록을 되돌린다 (잘못 눌렀을 때) */
export async function clearSettlementReceipt(id: ID): Promise<Settlement | undefined> {
  return patch(db.settlements, id, { receivedDate: undefined, receivedAmount: undefined });
}

// ---------------------------------------------------------------------------
// 매매 · 보유 종목
// ---------------------------------------------------------------------------

/**
 * 매매를 저장하고 해당 보유 종목의 수량·평균단가를 다시 계산한다.
 *
 * Holding 의 quantity/avgCost 는 Trade 로부터 계산되는 파생값이다.
 * 매매가 추가·수정·삭제될 때마다 여기서 다시 계산해 둬야 둘이 어긋나지 않는다.
 */
export async function saveTrade(data: NewRecord<Trade>, holdingName?: string): Promise<Trade> {
  const trade = await insert(db.trades, data);
  await syncHolding(trade.accountId, trade.market, trade.symbol, holdingName);
  return trade;
}

export async function deleteTrade(id: ID): Promise<void> {
  const trade = await db.trades.get(id);
  if (!trade) return;

  await db.trades.delete(id);
  await syncHolding(trade.accountId, trade.market, trade.symbol);
}

/** 매매 기록으로부터 보유 종목을 다시 만든다 */
export async function syncHolding(
  accountId: ID,
  market: Trade['market'],
  symbol: string,
  name?: string,
): Promise<void> {
  const key = `${accountId}:${market}:${symbol}`;
  const allTrades = await db.trades.toArray();
  const trades = allTrades.filter((t) => tradeKey(t) === key);

  const existing = (await db.holdings.toArray()).find(
    (h) => h.accountId === accountId && h.market === market && h.symbol === symbol,
  );

  // 매매 기록이 전부 지워졌으면 보유 종목도 지운다
  if (trades.length === 0) {
    if (existing) await db.holdings.delete(existing.id);
    return;
  }

  const state = recomputeHolding(trades);
  const currency = trades[0].currency;

  if (existing) {
    await patch(db.holdings, existing.id, {
      quantity: state.quantity,
      avgCost: state.avgCost,
      ...(name ? { name } : {}),
    });
    return;
  }

  await insert(db.holdings, {
    accountId, symbol, market, currency,
    name: name ?? symbol,
    quantity: state.quantity,
    avgCost: state.avgCost,
  });
}

// ---------------------------------------------------------------------------
// 시세 · 환율 — 종목당 최신 1건만 둔다
// ---------------------------------------------------------------------------

export async function saveQuote(quote: NewRecord<PriceQuote>): Promise<PriceQuote> {
  const existing = (await db.quotes.toArray()).find(
    (q) => q.market === quote.market && q.symbol === quote.symbol,
  );

  if (existing) {
    const updated = await patch(db.quotes, existing.id, {
      price: quote.price,
      currency: quote.currency,
      asOf: quote.asOf,
      source: quote.source,
      providerId: quote.providerId,
    });
    return updated!;
  }

  return insert(db.quotes, quote);
}

export async function saveFxRate(rate: NewRecord<FxRate>): Promise<FxRate> {
  const existing = await db.fxRates.toArray();
  if (existing.length > 0) {
    const updated = await patch(db.fxRates, existing[0].id, {
      rate: rate.rate, asOf: rate.asOf, source: rate.source,
    });
    return updated!;
  }
  return insert(db.fxRates, rate);
}

/** 환율이 없으면 null. 호출하는 쪽에서 "환율을 입력해 주세요"를 띄운다 */
export async function loadFxRate(): Promise<FxRate | null> {
  const rates = await db.fxRates.toArray();
  if (rates.length === 0) return null;
  return rates.reduce((latest, r) => (r.asOf > latest.asOf ? r : latest));
}

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

export async function loadSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export async function saveSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------------------
// 전체 관리
// ---------------------------------------------------------------------------

export async function isEmpty(): Promise<boolean> {
  return (await db.accounts.count()) === 0;
}

/** 설정까지 포함해 전부 지운다 (주로 테스트에서 쓴다) */
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

/**
 * 기록만 비우고 설정은 남긴다.
 *
 * 시세 API 키나 제공자 선택은 '데이터'가 아니라 환경 설정이다.
 * 데모를 되돌린다고 매번 키를 다시 입력하게 만들면 번거롭다.
 */
export async function resetData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(DATA_TABLES.map((name) => db.table(name).clear()));
  });
}

export async function countAll(): Promise<Record<DataTableName, number>> {
  const entries = await Promise.all(
    DATA_TABLES.map(async (name) => [name, await db.table(name).count()] as const),
  );
  return Object.fromEntries(entries) as Record<DataTableName, number>;
}

// ---------------------------------------------------------------------------
// 예산
// ---------------------------------------------------------------------------

/**
 * 예산 저장. 같은 달 · 같은 카테고리는 하나만 둔다.
 * (두 개가 생기면 사용률이 두 줄로 나와서 어느 쪽이 맞는지 알 수 없다)
 */
export async function saveBudget(
  month: YearMonth,
  categoryId: ID,
  amount: Krw,
): Promise<Budget> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`예산은 0 이상의 정수여야 합니다: ${amount}`);
  }

  const existing = await db.budgets.where('[month+categoryId]').equals([month, categoryId]).first();
  if (existing) {
    const updated = await patch(db.budgets, existing.id, { amount });
    return updated!;
  }

  return insert(db.budgets, { month, categoryId, amount });
}

export async function deleteBudget(id: ID): Promise<void> {
  await db.budgets.delete(id);
}

export function loadBudgets(month: YearMonth): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray();
}

/**
 * 지난달 예산을 이번 달로 복사한다.
 * 매달 같은 금액을 다시 입력하는 게 제일 귀찮은 부분이라 버튼 하나로 끝낸다.
 * 이미 이번 달에 정해 둔 카테고리는 건드리지 않는다.
 */
export async function copyBudgetsFrom(source: YearMonth, target: YearMonth): Promise<number> {
  const [from, to] = await Promise.all([loadBudgets(source), loadBudgets(target)]);
  const taken = new Set(to.map((b) => b.categoryId));

  const toCopy = from.filter((b) => !taken.has(b.categoryId));
  for (const budget of toCopy) {
    await insert(db.budgets, {
      month: target,
      categoryId: budget.categoryId,
      amount: budget.amount,
    });
  }

  return toCopy.length;
}

// ---------------------------------------------------------------------------
// 자동 분류 규칙
// ---------------------------------------------------------------------------

export function loadRules(): Promise<Rule[]> {
  return db.rules.orderBy('priority').toArray();
}

export async function saveRule(data: NewRecord<Rule>): Promise<Rule> {
  if (!data.value.trim()) throw new Error('찾을 내용을 입력해 주세요.');
  return insert(db.rules, data);
}

export async function updateRule(
  id: ID,
  changes: Partial<Omit<Rule, keyof Entity>>,
): Promise<Rule | undefined> {
  if (changes.value !== undefined && !changes.value.trim()) {
    throw new Error('찾을 내용을 입력해 주세요.');
  }
  return patch(db.rules, id, changes);
}

export async function deleteRule(id: ID): Promise<void> {
  await db.rules.delete(id);
}

/**
 * 이미 저장된 거래들에 규칙을 한 번에 적용한다.
 * 규칙을 새로 만들었을 때 과거 기록도 정리할 수 있게.
 *
 * @param onlyUncategorized 카테고리가 없는 거래만 건드릴지.
 *        기본값 true — 사용자가 직접 고른 분류를 규칙이 멋대로 덮어쓰면 안 된다.
 */
export async function applyRulesToExisting(
  onlyUncategorized = true,
): Promise<{ scanned: number; changed: number }> {
  const [rules, transactions] = await Promise.all([loadRules(), db.transactions.toArray()]);

  const targets = onlyUncategorized ? transactions.filter((t) => !t.categoryId) : transactions;
  let changed = 0;

  for (const tx of targets) {
    // 이체에는 카테고리가 없다
    if (tx.type === 'transfer') continue;

    const match = applyRules({ memo: tx.memo, tags: tx.tags }, rules);
    if (!match || match.categoryId === tx.categoryId) continue;

    await patch(db.transactions, tx.id, {
      categoryId: match.categoryId,
      tags: [...tx.tags, ...match.addTags],
    });
    changed += 1;
  }

  return { scanned: targets.length, changed };
}

// ---------------------------------------------------------------------------
// 반복 거래
// ---------------------------------------------------------------------------

export function loadRecurring(): Promise<RecurringTransaction[]> {
  return db.recurring.toArray();
}

export async function saveRecurring(
  data: NewRecord<RecurringTransaction>,
): Promise<RecurringTransaction> {
  if (!Number.isInteger(data.template.amount) || data.template.amount <= 0) {
    throw new Error('금액은 0원보다 큰 정수여야 합니다.');
  }
  return insert(db.recurring, data);
}

export async function updateRecurring(
  id: ID,
  changes: Partial<Omit<RecurringTransaction, keyof Entity>>,
): Promise<RecurringTransaction | undefined> {
  return patch(db.recurring, id, changes);
}

export async function deleteRecurring(id: ID): Promise<void> {
  await db.recurring.delete(id);
}

/**
 * 기록할 반복 거래를 실제 거래로 만든다.
 *
 * 자동으로 하지 않고 사용자가 확인한 것만 넘겨받는다.
 * (해지한 구독료가 계속 기록되는 것을 막으려고)
 *
 * lastGeneratedDate 를 함께 올려서 다음에 또 뜨지 않게 한다.
 * 건너뛴 것도 날짜를 올린다 — 안 그러면 매번 다시 물어본다.
 */
export async function materializeOccurrences(
  occurrences: PendingOccurrence[],
  action: 'record' | 'skip',
): Promise<number> {
  if (occurrences.length === 0) return 0;

  const existing = await db.transactions.toArray();
  let created = 0;

  for (const occurrence of occurrences) {
    if (action === 'record') {
      // 같은 반복 거래의 같은 날짜가 이미 있으면 건너뛴다 (두 번 눌렀을 때 방어)
      if (alreadyRecorded(existing, occurrence.recurring.id, occurrence.date)) continue;

      await insert(db.transactions, toTransaction(occurrence));
      created += 1;
    }
  }

  // 반복 거래별로 가장 늦은 날짜까지 처리한 것으로 표시한다
  const latest = new Map<ID, string>();
  for (const occurrence of occurrences) {
    const current = latest.get(occurrence.recurring.id);
    if (!current || occurrence.date > current) latest.set(occurrence.recurring.id, occurrence.date);
  }

  for (const [recurringId, date] of latest) {
    await patch(db.recurring, recurringId, { lastGeneratedDate: date });
  }

  return created;
}

// ---------------------------------------------------------------------------
// 순자산 스냅샷
// ---------------------------------------------------------------------------

export function loadSnapshots(): Promise<NetWorthSnapshot[]> {
  return db.snapshots.orderBy('date').toArray();
}

/**
 * 오늘자 순자산을 기록한다. 앱을 처음 연 날 하루 한 번.
 *
 * 같은 날 다시 열면 덮어쓴다 — 아침에 연 값보다 저녁에 연 값이 더 최신이다.
 * 이 기록이 쌓여서 순자산 추이 차트가 된다.
 */
export async function ensureTodaySnapshot(): Promise<NetWorthSnapshot | null> {
  const [accounts, ledger, trades, holdings, quotes, fx] = await Promise.all([
    db.accounts.toArray(),
    loadLedger(),
    db.trades.toArray(),
    db.holdings.toArray(),
    db.quotes.toArray(),
    loadFxRate(),
  ]);

  // 계좌가 하나도 없으면 기록할 것이 없다
  if (accounts.length === 0) return null;

  const breakdown = computeNetWorth(accounts, ledger, trades, holdings, quotes, fx?.rate ?? 0);
  const today = todayISO();

  return upsertSnapshot(toSnapshot(breakdown, today));
}

/**
 * 날짜 하나에 스냅샷 하나.
 *
 * 읽고-없으면-쓰기 사이에 다른 호출이 끼어들면 같은 날짜가 두 번 들어가
 * 유니크 인덱스에 걸린다. (React StrictMode 는 effect 를 두 번 실행한다)
 * 그래서 확인과 저장을 한 트랜잭션 안에서 처리한다.
 */
async function upsertSnapshot(
  data: Omit<NetWorthSnapshot, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<NetWorthSnapshot> {
  return db.transaction('rw', db.snapshots, async () => {
    const existing = await db.snapshots.where('date').equals(data.date).first();
    if (existing) return (await patch(db.snapshots, existing.id, data))!;
    return insert(db.snapshots, data);
  });
}

/**
 * 데모 데이터의 과거 추이를 거래 기록에서 역산해 채운다.
 * 실제 사용자 데이터에는 쓰지 않는다 — 스냅샷은 그날그날 쌓이는 것이 맞다.
 */
export async function seedReconstructedSnapshots(dates: string[]): Promise<number> {
  const [accounts, ledger, trades, holdings, fx] = await Promise.all([
    db.accounts.toArray(),
    loadLedger(),
    db.trades.toArray(),
    db.holdings.toArray(),
    loadFxRate(),
  ]);

  const snapshots = reconstructSnapshots(
    accounts, ledger, trades, dates, fx?.rate ?? 0, holdings,
  );

  for (const snapshot of snapshots) {
    await upsertSnapshot(snapshot);
  }

  return snapshots.length;
}

// ---------------------------------------------------------------------------
// 시세 새로고침
// ---------------------------------------------------------------------------

/**
 * 설정에 저장된 제공자로 시세와 환율을 가져온다.
 *
 * 실패해도 저장된 값을 건드리지 않으므로, 비행기 모드에서 눌러도
 * 앱이 멈추지 않고 "몇 개 실패"라고만 알려준다.
 */
export async function refreshAllQuotes(): Promise<RefreshResult> {
  const [settings, holdings, existingQuotes] = await Promise.all([
    loadSettings(),
    db.holdings.toArray(),
    db.quotes.toArray(),
  ]);

  const provider = createProvider(settings.priceProviderId, settings.priceApiKey);

  const result = await refreshQuotes({
    provider,
    fxProvider: erApiFxProvider,
    holdings,
    existingQuotes,
    saveQuote: (quote) => saveQuote(quote),
    saveFxRate: ({ rate, asOf, source }) =>
      saveFxRate({ base: 'USD', quote: 'KRW', rate, asOf, source }),
  });

  await saveSetting('lastQuoteRefreshAt', nowTimestamp());
  return result;
}
