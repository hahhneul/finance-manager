import { describe, expect, it } from 'vitest';
import { categoryPath, lastUsedAccountId, rankCategories } from '../recent';
import { addDays } from '../date';
import { demoCategories, demoTransactions } from '@/demo/demoData';

const TODAY = '2026-09-21';

describe('rankCategories — 빠른 입력 그리드 순서', () => {
  const ranked = rankCategories(demoTransactions, demoCategories, { flow: 'expense', today: TODAY });

  it('기본 8개를 돌려준다', () => {
    expect(ranked).toHaveLength(8);
  });

  it('소분류가 있는 대분류는 그리드에 넣지 않는다', () => {
    // '식비'가 아니라 '카페', '외식' 을 고르게 한다
    expect(ranked.some((c) => c.id === 'cat-food')).toBe(false);
    expect(ranked.some((c) => c.id === 'cat-food-cafe')).toBe(true);
  });

  it('소분류가 없는 대분류는 그리드에 들어간다', () => {
    // '의료'는 소분류가 없어서 직접 고른다
    const all = rankCategories(demoTransactions, demoCategories, {
      flow: 'expense', today: TODAY, limit: 100,
    });
    expect(all.some((c) => c.id === 'cat-health')).toBe(true);
  });

  it('최근 60일 안에 많이 쓴 것이 앞에 온다', () => {
    // 2026-07-23 이후 사용 횟수: 카페 5, 외식 4, 생필품 3, 나머지 2회 이하
    expect(ranked.slice(0, 3).map((c) => c.id)).toEqual([
      'cat-food-cafe',
      'cat-food-dining',
      'cat-shop-daily',
    ]);
  });

  it('횟수가 같으면 최근에 쓴 것이 앞에 온다', () => {
    // 전부 2회인 것들: 공과금(9/15) > 배달(9/14) > 구독(9/10) > 장보기(9/8) > 대중교통(9/6)
    expect(ranked.slice(3).map((c) => c.id)).toEqual([
      'cat-home-utility',
      'cat-food-delivery',
      'cat-culture-sub',
      'cat-food-grocery',
      'cat-transport-transit',
    ]);
  });

  it('덜 쓴 것은 8개 밖으로 밀린다', () => {
    // 월세도 2회지만 마지막 사용이 9/1 이라 9번째다
    expect(ranked.some((c) => c.id === 'cat-home-rent')).toBe(false);

    const wider = rankCategories(demoTransactions, demoCategories, {
      flow: 'expense', today: TODAY, limit: 9,
    });
    expect(wider[8].id).toBe('cat-home-rent');
  });

  it('창 밖의 거래는 세지 않는다', () => {
    // 7일만 보면 9월 14~20일 것만 남는다
    const narrow = rankCategories(demoTransactions, demoCategories, {
      flow: 'expense', today: TODAY, windowDays: 7, limit: 3,
    });
    expect(narrow.map((c) => c.id)).toContain('cat-food-dining');
  });

  it('한 번도 안 쓴 카테고리도 뒤에 채워진다', () => {
    // 기록이 하나도 없어도 그리드가 비지 않는다
    const empty = rankCategories([], demoCategories, { flow: 'expense', today: TODAY });
    expect(empty).toHaveLength(8);
    // 원래 순서대로
    expect(empty[0].id).toBe('cat-food-dining');
  });

  it('수입은 수입 카테고리만 나온다', () => {
    const incomeRanked = rankCategories(demoTransactions, demoCategories, {
      flow: 'income', today: TODAY,
    });
    expect(incomeRanked.every((c) => c.flow === 'income')).toBe(true);
    // 월급을 제일 많이 받았다
    expect(incomeRanked[0].id).toBe('cat-salary-main');
  });

  it('숨긴 카테고리는 빠진다', () => {
    const archived = demoCategories.map((c) =>
      c.id === 'cat-food-cafe' ? { ...c, archived: true } : c,
    );
    const result = rankCategories(demoTransactions, archived, {
      flow: 'expense', today: TODAY, limit: 100,
    });
    expect(result.some((c) => c.id === 'cat-food-cafe')).toBe(false);
  });
});

describe('addDays', () => {
  it('달을 넘어간다', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('연도를 넘어간다', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('윤년을 안다', () => {
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('60일 전', () => {
    expect(addDays('2026-09-21', -60)).toBe('2026-07-23');
  });
});

describe('categoryPath', () => {
  it('소분류는 대분류와 함께 보여준다', () => {
    const cafe = demoCategories.find((c) => c.id === 'cat-food-cafe');
    expect(categoryPath(cafe, demoCategories)).toBe('식비 > 카페');
  });

  it('대분류는 이름만', () => {
    const health = demoCategories.find((c) => c.id === 'cat-health');
    expect(categoryPath(health, demoCategories)).toBe('의료');
  });

  it('카테고리가 없으면 미분류', () => {
    expect(categoryPath(undefined, demoCategories)).toBe('미분류');
  });
});

describe('lastUsedAccountId', () => {
  it('가장 최근에 입력한 거래의 계좌', () => {
    const transactions = [
      { ...demoTransactions[0], id: 'a', accountId: 'acc-cash', createdAt: '2026-09-01T00:00:00.000Z' },
      { ...demoTransactions[0], id: 'b', accountId: 'acc-card', createdAt: '2026-09-05T00:00:00.000Z' },
    ];
    expect(lastUsedAccountId(transactions)).toBe('acc-card');
  });

  it('기록이 없으면 undefined', () => {
    expect(lastUsedAccountId([])).toBeUndefined();
  });
});
