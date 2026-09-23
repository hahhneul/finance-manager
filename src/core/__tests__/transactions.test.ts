import { describe, expect, it } from 'vitest';
import {
  categoryTotals,
  dailyExpenseTotals,
  filterTransactions,
  monthlyTotals,
  monthlyTrend,
  statsEntries,
} from '../transactions';
import { demoCategories, demoLedger, demoTransactions } from '@/demo/demoData';
import {
  expectedCategoryTotals202609,
  expectedMonthlyTotals,
  expectedTransferExcluded,
} from '@/demo/expected';

describe('월 합계', () => {
  it.each(['2026-07', '2026-08', '2026-09'])('%s 수입·지출·잔액', (month) => {
    const expected = expectedMonthlyTotals[month as keyof typeof expectedMonthlyTotals];
    expect(monthlyTotals(demoLedger, month)).toEqual({ month, ...expected });
  });

  it('데이터가 없는 달은 0원', () => {
    expect(monthlyTotals(demoLedger, '2026-05')).toEqual({
      month: '2026-05', income: 0, expense: 0, net: 0,
    });
  });

  it('최근 3개월 추이', () => {
    const trend = monthlyTrend(demoLedger, ['2026-07', '2026-08', '2026-09']);
    expect(trend.map((t) => t.expense)).toEqual([835_400, 925_234, 760_500]);
  });
});

describe('이체는 통계에서 빠진다', () => {
  const { month, transferAmount, expenseWithoutTransfer } = expectedTransferExcluded;

  it('7월에 증권계좌로 250만원을 옮겼지만 지출에 잡히지 않는다', () => {
    const transfers = demoTransactions.filter((t) => t.type === 'transfer' && t.date.startsWith(month));
    expect(transfers.some((t) => t.amount === transferAmount)).toBe(true);
    expect(monthlyTotals(demoLedger, month).expense).toBe(expenseWithoutTransfer);
  });

  it('수입에도 잡히지 않는다', () => {
    expect(monthlyTotals(demoLedger, month).income).toBe(2_300_000);
  });

  it('정규화 결과에 이체가 하나도 없다', () => {
    const entries = statsEntries(demoLedger);
    const transferIds = new Set(demoTransactions.filter((t) => t.type === 'transfer').map((t) => t.id));
    expect(entries.some((e) => transferIds.has(e.id))).toBe(false);
  });

  it('excludeFromStats 를 켠 거래도 빠진다', () => {
    const ledger = {
      settlements: [],
      transactions: [
        { ...demoTransactions[0], id: 'x1', excludeFromStats: true },
      ],
    };
    expect(monthlyTotals(ledger, '2026-07').expense).toBe(0);
  });
});

describe('정산은 총액이 아니라 내 몫만 지출로 잡힌다', () => {
  it('7월 팀 회식 120,000원 결제 → 지출 30,000원', () => {
    const entries = statsEntries(demoLedger).filter((e) => e.source === 'settlement');
    const teamDinner = entries.find((e) => e.id === 'stl-1');

    expect(teamDinner?.amount).toBe(30_000);
    expect(teamDinner?.flow).toBe('expense');
  });

  it('정산 3건이 모두 지출로 들어간다', () => {
    const settlementEntries = statsEntries(demoLedger).filter((e) => e.source === 'settlement');
    expect(settlementEntries).toHaveLength(3);
    expect(settlementEntries.every((e) => e.flow === 'expense')).toBe(true);
  });
});

describe('2026년 9월 카테고리별 지출', () => {
  const breakdown = categoryTotals(demoLedger, demoCategories, '2026-09');

  it('전체 합계', () => {
    expect(breakdown.total).toBe(expectedCategoryTotals202609.total);
  });

  it.each(Object.entries(expectedCategoryTotals202609.parents))(
    '대분류 %s = %i원',
    (categoryId, amount) => {
      expect(breakdown.parents.find((p) => p.categoryId === categoryId)?.amount).toBe(amount);
    },
  );

  it.each(Object.entries(expectedCategoryTotals202609.children))(
    '소분류 %s = %i원',
    (categoryId, amount) => {
      expect(breakdown.children.find((c) => c.categoryId === categoryId)?.amount).toBe(amount);
    },
  );

  it('대분류 합계는 전체 지출과 같다', () => {
    const parentSum = breakdown.parents.reduce((s, p) => s + p.amount, 0);
    expect(parentSum + breakdown.uncategorized).toBe(breakdown.total);
  });

  it('금액이 큰 순으로 정렬된다 (도넛 차트용)', () => {
    const amounts = breakdown.parents.map((p) => p.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(breakdown.parents[0].categoryId).toBe('cat-home');
  });

  it('비율의 합은 1 이다', () => {
    const sum = breakdown.parents.reduce((s, p) => s + p.ratio, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('수입도 같은 방식으로 집계된다', () => {
    const incomeBreakdown = categoryTotals(demoLedger, demoCategories, '2026-08', 'income');
    expect(incomeBreakdown.total).toBe(2_001_200);
    expect(incomeBreakdown.parents.find((p) => p.categoryId === 'cat-salary')?.amount).toBe(2_000_000);
  });
});

describe('거래 목록 필터', () => {
  it('월로 거른다', () => {
    expect(filterTransactions(demoTransactions, { month: '2026-09' })).toHaveLength(13);
  });

  it('계좌로 거른다 — 이체는 받는 쪽에서도 보인다', () => {
    const kiwoom = filterTransactions(demoTransactions, { accountIds: ['acc-kiwoom'] });
    expect(kiwoom).toHaveLength(2);
    expect(kiwoom.every((t) => t.type === 'transfer')).toBe(true);
  });

  it('태그로 거른다', () => {
    expect(filterTransactions(demoTransactions, { tags: ['구독'] })).toHaveLength(3);
  });

  it('메모 검색은 대소문자를 가리지 않는다', () => {
    expect(filterTransactions(demoTransactions, { query: '스타벅스' })).toHaveLength(3);
  });

  it('조건을 겹쳐 쓸 수 있다', () => {
    const result = filterTransactions(demoTransactions, {
      month: '2026-09', accountIds: ['acc-card'], query: '카페',
    });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(6_000);
  });
});

describe('달력 뷰 — 날짜별 지출', () => {
  const byDate = dailyExpenseTotals(demoLedger, '2026-09');

  it('거래가 있는 날만 들어간다', () => {
    expect(byDate.get('2026-09-01')).toBe(500_000);
    expect(byDate.get('2026-09-03')).toBeUndefined();
  });

  it('정산도 내 몫으로 포함된다', () => {
    expect(byDate.get('2026-09-13')).toBe(22_500);
  });

  it('날짜별 합계를 모두 더하면 월 지출이 된다', () => {
    const sum = [...byDate.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(760_500);
  });
});
