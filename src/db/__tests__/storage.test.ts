import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { BackupError, BACKUP_FORMAT, exportBackup, importBackup, migrateBackup } from '../backup';
import { DB_SCHEMA_VERSION, db } from '../schema';
import { clearAll, countAll, loadLedger, saveSettlement, saveTrade } from '../repo';
import { seedDemoData } from '../seed';
import { computeNetWorth } from '@/core/networth';
import { DEMO_FX_RATE } from '@/demo/demoData';
import { expectedNetWorth } from '@/demo/expected';

beforeEach(async () => {
  await clearAll();
});

/** 저장된 데이터로 순자산을 다시 계산한다 */
async function netWorthFromDb() {
  const [accounts, ledger, trades, holdings, quotes] = await Promise.all([
    db.accounts.toArray(),
    loadLedger(),
    db.trades.toArray(),
    db.holdings.toArray(),
    db.quotes.toArray(),
  ]);
  return computeNetWorth(accounts, ledger, trades, holdings, quotes, DEMO_FX_RATE);
}

describe('데모 데이터 저장 · 읽기', () => {
  it('넣은 만큼 그대로 읽힌다', async () => {
    await seedDemoData();
    const counts = await countAll();

    expect(counts.accounts).toBe(5);
    expect(counts.transactions).toBe(46);
    expect(counts.settlements).toBe(3);
    expect(counts.trades).toBe(7);
    expect(counts.holdings).toBe(3);
  });

  it('IndexedDB 를 거쳐 읽은 값으로 계산해도 정답이 나온다', async () => {
    await seedDemoData();
    expect((await netWorthFromDb()).netWorth).toBe(expectedNetWorth.netWorth);
  });

  it('월별로 읽으면 그 달 것만 나온다', async () => {
    await seedDemoData();
    const september = await loadLedger('2026-09');

    expect(september.transactions).toHaveLength(13);
    expect(september.settlements).toHaveLength(1);
  });
});

describe('저장할 때 검증한다', () => {
  it('총액이 음수인 정산은 저장되지 않는다', async () => {
    await expect(
      saveSettlement({
        date: '2026-09-21', title: '테스트', totalAmount: -1, headcount: 3,
        payerAccountId: 'acc-card', receiverAccountId: 'acc-kakao', received: true,
      }),
    ).rejects.toThrow();
  });

  it('정산을 저장하면 금액이 자동으로 채워진다', async () => {
    const saved = await saveSettlement({
      date: '2026-09-21', title: '저녁', totalAmount: 100_000, headcount: 3,
      payerAccountId: 'acc-card', receiverAccountId: 'acc-kakao', received: true,
    });

    // 100,000 / 3 = 33,333 → 돌려받을 66,666, 내 몫 33,334
    expect(saved.myShare).toBe(33_334);
    expect(saved.reimbursedAmount).toBe(66_666);
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeTruthy();
  });
});

describe('매매를 저장하면 보유 종목이 따라 갱신된다', () => {
  it('Holding 의 수량·평단은 Trade 로부터 다시 계산된다', async () => {
    await saveTrade({
      date: '2026-07-10', accountId: 'acc-kiwoom', symbol: '005930',
      market: 'KRX', currency: 'KRW', side: 'buy',
      quantity: 10, price: 70_000, fee: 1_000,
    }, '삼성전자');

    let holding = (await db.holdings.toArray())[0];
    expect(holding.quantity).toBe(10);
    expect(holding.avgCost).toBe(70_100);
    expect(holding.name).toBe('삼성전자');

    await saveTrade({
      date: '2026-08-05', accountId: 'acc-kiwoom', symbol: '005930',
      market: 'KRX', currency: 'KRW', side: 'buy',
      quantity: 5, price: 80_000, fee: 600,
    });

    holding = (await db.holdings.toArray())[0];
    expect(holding.quantity).toBe(15);
    expect(holding.avgCost).toBe(73_440);
    // 종목 하나는 한 줄로 유지된다
    expect(await db.holdings.count()).toBe(1);
  });
});

describe('백업 · 복원', () => {
  it('내보낸 뒤 다시 불러오면 그대로 돌아온다', async () => {
    await seedDemoData();
    const backup = await exportBackup();

    await clearAll();
    expect((await countAll()).transactions).toBe(0);

    await importBackup(backup, 'replace');
    expect((await countAll()).transactions).toBe(46);
    expect((await netWorthFromDb()).netWorth).toBe(expectedNetWorth.netWorth);
  });

  it('백업 파일에 스키마 버전이 들어간다', async () => {
    await seedDemoData();
    const backup = await exportBackup();

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(DB_SCHEMA_VERSION);
    expect(backup.exportedAt).toBeTruthy();
  });

  it('API 키는 백업에 담기지 않는다', async () => {
    await seedDemoData();
    expect('priceApiKey' in (await exportBackup()).settings).toBe(false);
  });

  it('replace 는 기존 데이터를 지우고, merge 는 남긴다', async () => {
    await seedDemoData();
    const backup = await exportBackup();

    await clearAll();
    await saveSettlement({
      date: '2026-09-21', title: '복원 전에 넣은 것', totalAmount: 10_000, headcount: 2,
      payerAccountId: 'acc-card', receiverAccountId: 'acc-kakao', received: true,
    });

    await importBackup(backup, 'merge');
    // 백업의 3건 + 내가 넣은 1건
    expect(await db.settlements.count()).toBe(4);

    await importBackup(backup, 'replace');
    expect(await db.settlements.count()).toBe(3);
  });
});

describe('옛 버전 백업 복원', () => {
  it('v1 백업을 현재 버전으로 끌어올린다', () => {
    const old = {
      format: BACKUP_FORMAT, app: '머니로그',
      schemaVersion: 1, exportedAt: '2026-09-21T00:00:00.000Z',
      settings: {},
      data: {
        transactions: [
          { id: 'tx-old', date: '2026-09-01', type: 'expense', amount: 1_000,
            accountId: 'acc-cash', memo: '옛 거래', tags: [],
            // 지금은 없는 필드
            importHash: 'abc123',
            createdAt: '', updatedAt: '' },
        ],
      },
    };

    const migrated = migrateBackup(old);

    expect(migrated.schemaVersion).toBe(DB_SCHEMA_VERSION);
    const tx = migrated.data.transactions[0] as Record<string, unknown>;
    // 없어진 필드는 털어낸다
    expect('importHash' in tx).toBe(false);
    // 나머지는 그대로
    expect(tx.amount).toBe(1_000);
    expect(tx.memo).toBe('옛 거래');
  });

  it('v1 백업을 실제로 복원할 수 있다', async () => {
    await clearAll();

    await importBackup({
      format: BACKUP_FORMAT, app: '머니로그',
      schemaVersion: 1, exportedAt: '2026-09-21T00:00:00.000Z',
      settings: {},
      data: {
        accounts: [{
          id: 'acc-old', name: '옛 계좌', kind: 'cash', initialBalance: 10_000,
          isLiability: false, archived: false, order: 0,
          createdAt: '', updatedAt: '',
        }],
        transactions: [{
          id: 'tx-old', date: '2026-09-01', type: 'expense', amount: 1_000,
          accountId: 'acc-old', memo: '옛 거래', tags: [], importHash: 'abc',
          createdAt: '', updatedAt: '',
        }],
      },
    }, 'replace');

    expect(await db.accounts.count()).toBe(1);
    const saved = await db.transactions.get('tx-old');
    expect(saved).toBeDefined();
    expect('importHash' in (saved as object)).toBe(false);
  });
});

describe('백업 파일 검사', () => {
  const valid = {
    format: BACKUP_FORMAT, app: '머니로그',
    schemaVersion: DB_SCHEMA_VERSION, exportedAt: '2026-09-21T00:00:00.000Z',
    settings: {}, data: {},
  };

  it('정상 파일은 통과한다', () => {
    expect(migrateBackup(valid).schemaVersion).toBe(DB_SCHEMA_VERSION);
  });

  it('다른 앱의 JSON 은 거부한다', () => {
    expect(() => migrateBackup({ foo: 'bar' })).toThrow(BackupError);
    expect(() => migrateBackup(null)).toThrow(BackupError);
  });

  it('버전 정보가 없으면 거부한다', () => {
    expect(() => migrateBackup({ ...valid, schemaVersion: undefined })).toThrow(/버전 정보/);
  });

  it('앱보다 새로운 백업은 업데이트하라고 알려준다', () => {
    expect(() => migrateBackup({ ...valid, schemaVersion: DB_SCHEMA_VERSION + 1 })).toThrow(/업데이트/);
  });
});
