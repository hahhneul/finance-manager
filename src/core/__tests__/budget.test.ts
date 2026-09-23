import { describe, expect, it } from 'vitest';
import { budgetSummary, budgetUsage } from '../budget';
import { demoBudgets, demoCategories, demoLedger } from '@/demo/demoData';
import { expectedBudgetUsage202609 } from '@/demo/expected';

const usages = budgetUsage(demoBudgets, demoLedger, demoCategories, '2026-09');

describe('2026년 9월 예산 사용률', () => {
  it.each(Object.entries(expectedBudgetUsage202609))('%s', (categoryId, expected) => {
    const usage = usages.find((u) => u.categoryId === categoryId);

    expect(usage).toBeDefined();
    expect(usage!.amount).toBe(expected.amount);
    expect(usage!.spent).toBe(expected.spent);
    expect(usage!.remaining).toBe(expected.remaining);
    expect(usage!.ratio).toBeCloseTo(expected.ratio, 10);
    expect(usage!.status).toBe(expected.status);
  });

  it('대분류 예산은 하위 소분류 지출을 모두 합친다', () => {
    // 식비 130,000 = 카페 11,500 + 외식 59,500 + 장보기 38,000 + 배달 21,000
    expect(usages.find((u) => u.categoryId === 'cat-food')!.spent).toBe(130_000);
  });

  it('정산한 치킨값 22,500원도 식비 예산에 잡힌다', () => {
    // 정산을 뺀 장부와 비교해서 차이가 정확히 내 몫만큼인지 본다
    const withoutSettlements = budgetUsage(
      demoBudgets,
      { transactions: demoLedger.transactions, settlements: [] },
      demoCategories,
      '2026-09',
    );

    const foodWithout = withoutSettlements.find((u) => u.categoryId === 'cat-food')!.spent;
    const foodWith = usages.find((u) => u.categoryId === 'cat-food')!.spent;

    expect(foodWithout).toBe(107_500);
    expect(foodWith - foodWithout).toBe(22_500);
  });

  it('사용률이 높은 순으로 정렬된다', () => {
    const ratios = usages.map((u) => u.ratio);
    expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
    expect(usages[0].categoryId).toBe('cat-shop');
  });

  it('다른 달 예산은 섞이지 않는다', () => {
    expect(budgetUsage(demoBudgets, demoLedger, demoCategories, '2026-08')).toEqual([]);
  });
});

describe('경계값', () => {
  const categories = demoCategories;
  const ledger = demoLedger;
  const base = { id: 'b', createdAt: '', updatedAt: '', month: '2026-09' };

  it('정확히 100% 면 초과로 본다', () => {
    const budget = { ...base, categoryId: 'cat-shop', amount: 12_000 };
    expect(budgetUsage([budget], ledger, categories, '2026-09')[0].status).toBe('over');
  });

  it('79.9% 는 아직 괜찮다', () => {
    // 지출 12,000 / 예산 15,020 = 0.7989…
    const budget = { ...base, categoryId: 'cat-shop', amount: 15_020 };
    expect(budgetUsage([budget], ledger, categories, '2026-09')[0].status).toBe('ok');
  });

  it('예산 0원인데 쓰면 사용률은 무한대', () => {
    const budget = { ...base, categoryId: 'cat-shop', amount: 0 };
    const usage = budgetUsage([budget], ledger, categories, '2026-09')[0];
    expect(usage.ratio).toBe(Infinity);
    expect(usage.status).toBe('over');
  });

  it('예산 0원이고 안 쓰면 0%', () => {
    const budget = { ...base, categoryId: 'cat-health', amount: 0 };
    const usage = budgetUsage([budget], ledger, categories, '2026-09')[0];
    expect(usage.ratio).toBe(0);
    expect(usage.status).toBe('ok');
  });
});

describe('예산 요약', () => {
  const summary = budgetSummary(usages);

  it('예산 총액', () => {
    // 400,000 + 80,000 + 30,000 + 10,000 + 550,000
    expect(summary.totalBudget).toBe(1_070_000);
  });

  it('사용 총액', () => {
    // 130,000 + 50,000 + 29,500 + 12,000 + 539,000
    expect(summary.totalSpent).toBe(760_500);
    expect(summary.totalRemaining).toBe(309_500);
  });

  it('초과한 카테고리는 쇼핑 하나', () => {
    expect(summary.overCount).toBe(1);
  });
});
