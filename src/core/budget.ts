import type { Budget, Category, ID, Krw, Ledger, YearMonth } from '@/types';
import { spentOnCategory } from './transactions';

export type BudgetStatus = 'ok' | 'warning' | 'over';

export interface BudgetUsage {
  budgetId: ID;
  categoryId: ID;
  categoryName: string;
  /** 예산 금액 */
  amount: Krw;
  /** 쓴 금액 (하위 소분류 포함) */
  spent: Krw;
  /** 남은 금액. 초과하면 음수 */
  remaining: Krw;
  /** 사용률 0~1 이상. 예산이 0원이면 Infinity */
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetUsageOptions {
  /** 이 비율을 넘으면 경고 색. 기본 0.8 */
  warningRatio?: number;
}

/** 카테고리별 예산 사용률 */
export function budgetUsage(
  budgets: Budget[],
  ledger: Ledger,
  categories: Category[],
  month: YearMonth,
  options: BudgetUsageOptions = {},
): BudgetUsage[] {
  const warningRatio = options.warningRatio ?? 0.8;
  const byId = new Map(categories.map((c) => [c.id, c]));

  return budgets
    .filter((b) => b.month === month)
    .map((budget) => {
      const spent = spentOnCategory(ledger, categories, budget.categoryId, month);

      // 예산 0원에 지출이 있으면 사용률은 무한대다. 0/0 은 0으로 본다.
      const ratio = budget.amount === 0 ? (spent > 0 ? Infinity : 0) : spent / budget.amount;

      const status: BudgetStatus =
        ratio >= 1 ? 'over' : ratio >= warningRatio ? 'warning' : 'ok';

      return {
        budgetId: budget.id,
        categoryId: budget.categoryId,
        categoryName: byId.get(budget.categoryId)?.name ?? '알 수 없음',
        amount: budget.amount,
        spent,
        remaining: budget.amount - spent,
        ratio,
        status,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface BudgetSummary {
  totalBudget: Krw;
  totalSpent: Krw;
  totalRemaining: Krw;
  ratio: number;
  /** 예산을 넘긴 카테고리 수 */
  overCount: number;
}

/** 예산 화면 상단 요약 */
export function budgetSummary(usages: BudgetUsage[]): BudgetSummary {
  const totalBudget = usages.reduce((s, u) => s + u.amount, 0);
  const totalSpent = usages.reduce((s, u) => s + u.spent, 0);

  return {
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    ratio: totalBudget === 0 ? (totalSpent > 0 ? Infinity : 0) : totalSpent / totalBudget,
    overCount: usages.filter((u) => u.status === 'over').length,
  };
}
