import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { FinanceDB, DB_SCHEMA_VERSION } from '../schema';

/**
 * 스키마 마이그레이션 검사.
 *
 * 이미 앱을 쓰고 있는 기기에는 옛 버전 DB 가 들어 있다.
 * 새 버전을 배포했을 때 그 데이터가 깨지지 않아야 한다.
 */

const DB_NAME = 'migration-test';

/** v1 시절의 스키마 그대로 DB 를 만든다 */
async function createV1Database() {
  const old = new Dexie(DB_NAME);

  old.version(1).stores({
    accounts: 'id, kind, archived, order',
    categories: 'id, parentId, flow, archived, order',
    transactions: 'id, date, type, accountId, toAccountId, categoryId, *tags, recurringId, importHash',
    settlements: 'id, date, payerAccountId, receiverAccountId, categoryId, receivedDate',
    budgets: 'id, month, categoryId, [month+categoryId]',
    rules: 'id, priority, enabled',
    recurring: 'id, enabled, startDate',
    holdings: 'id, accountId, symbol, [accountId+market+symbol]',
    trades: 'id, date, accountId, symbol, [accountId+market+symbol]',
    quotes: 'id, symbol, [market+symbol], asOf',
    fxRates: 'id, asOf',
    snapshots: 'id, &date',
    settings: 'key',
  });

  await old.open();

  await old.table('accounts').add({
    id: 'acc-1', name: '신한은행', kind: 'bank', initialBalance: 1_000_000,
    isLiability: false, archived: false, order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });

  await old.table('transactions').bulkAdd([
    {
      id: 'tx-1', date: '2026-09-01', type: 'expense', amount: 12_000,
      accountId: 'acc-1', categoryId: 'cat-1', memo: '점심', tags: ['외식'],
      // v1 에만 있던 필드
      importHash: 'hash-abc',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tx-2', date: '2026-09-02', type: 'income', amount: 2_000_000,
      accountId: 'acc-1', memo: '월급', tags: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  old.close();
}

afterEach(async () => {
  await Dexie.delete(DB_NAME);
});

describe('v1 → v2 업그레이드', () => {
  it('기존 데이터가 그대로 남는다', async () => {
    await createV1Database();

    const db = new FinanceDB(DB_NAME);
    await db.open();

    expect(db.verno).toBe(DB_SCHEMA_VERSION);
    expect(await db.accounts.count()).toBe(1);
    expect(await db.transactions.count()).toBe(2);

    const account = await db.accounts.get('acc-1');
    expect(account?.name).toBe('신한은행');
    expect(account?.initialBalance).toBe(1_000_000);

    const tx = await db.transactions.get('tx-1');
    expect(tx?.amount).toBe(12_000);
    expect(tx?.memo).toBe('점심');
    expect(tx?.tags).toEqual(['외식']);

    db.close();
  });

  it('없어진 importHash 를 털어낸다', async () => {
    await createV1Database();

    const db = new FinanceDB(DB_NAME);
    await db.open();

    const tx = await db.transactions.get('tx-1');
    expect('importHash' in (tx as object)).toBe(false);

    db.close();
  });

  it('업그레이드 뒤에도 인덱스로 조회된다', async () => {
    await createV1Database();

    const db = new FinanceDB(DB_NAME);
    await db.open();

    // 인덱스를 바꾼 테이블이라 특히 확인한다
    expect(await db.transactions.where('date').startsWith('2026-09').count()).toBe(2);
    expect((await db.transactions.where('tags').equals('외식').toArray())[0].id).toBe('tx-1');

    db.close();
  });

  it('새로 만든 DB 는 바로 최신 버전이다', async () => {
    const db = new FinanceDB(DB_NAME);
    await db.open();

    expect(db.verno).toBe(DB_SCHEMA_VERSION);
    db.close();
  });
});
