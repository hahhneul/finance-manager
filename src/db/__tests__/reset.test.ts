import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../schema';
import { clearAll, countAll, loadSettings, resetData, saveSetting } from '../repo';
import { seedDemoData, seedIfEmpty } from '../seed';

beforeEach(async () => {
  await clearAll();
});

describe('첫 실행에만 데모를 넣는다', () => {
  it('처음에는 넣는다', async () => {
    expect(await seedIfEmpty()).toBe(true);
    expect((await countAll()).accounts).toBe(5);
  });

  it('이미 데이터가 있으면 손대지 않는다', async () => {
    await seedDemoData();
    const before = await countAll();

    expect(await seedIfEmpty()).toBe(false);
    expect(await countAll()).toEqual(before);
  });

  it('빈 상태로 시작한 뒤에는 다시 넣지 않는다', async () => {
    await seedIfEmpty();

    // '빈 상태로 시작하기' 가 하는 일
    await resetData();
    await saveSetting('demoSeeded', true);

    // 앱을 다시 열어도 데모가 돌아오지 않는다
    expect(await seedIfEmpty()).toBe(false);
    expect((await countAll()).accounts).toBe(0);
    expect((await countAll()).transactions).toBe(0);
  });

  it('여러 번 다시 열어도 그대로 비어 있다', async () => {
    await resetData();
    await saveSetting('demoSeeded', true);

    await seedIfEmpty();
    await seedIfEmpty();
    await seedIfEmpty();

    expect((await countAll()).accounts).toBe(0);
  });
});

describe('설정은 데이터와 따로 다룬다', () => {
  it('resetData 는 시세 API 키를 지우지 않는다', async () => {
    await seedDemoData();
    await saveSetting('priceApiKey', 'MY-KEY');
    await saveSetting('priceProviderId', 'krx');

    await resetData();

    const settings = await loadSettings();
    expect(settings.priceApiKey).toBe('MY-KEY');
    expect(settings.priceProviderId).toBe('krx');
    // 기록은 비워진다
    expect((await countAll()).transactions).toBe(0);
  });

  it('clearAll 은 설정까지 지운다 (테스트용)', async () => {
    await saveSetting('priceApiKey', 'MY-KEY');
    await clearAll();

    expect((await loadSettings()).priceApiKey).toBeUndefined();
  });
});

describe("'데모로 되돌리기'", () => {
  it('비운 뒤에도 데모를 다시 넣을 수 있다', async () => {
    await resetData();
    await saveSetting('demoSeeded', true);

    // '데모 데이터로 되돌리기' 가 하는 일
    await resetData();
    await saveSetting('demoSeeded', false);
    await seedDemoData();

    expect((await countAll()).accounts).toBe(5);
    expect((await countAll()).transactions).toBe(46);
    // 스냅샷도 다시 채워진다
    expect((await db.snapshots.count())).toBeGreaterThanOrEqual(6);
  });
});
