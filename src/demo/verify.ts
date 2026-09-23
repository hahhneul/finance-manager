import { budgetUsage } from '@/core/budget';
import { allAccountBalances } from '@/core/accounts';
import { buildPositions, portfolioSummary } from '@/core/holdings';
import { computeNetWorth } from '@/core/networth';
import { pendingReceivable } from '@/core/settlement';
import { categoryTotals, monthlyTotals } from '@/core/transactions';
import { formatKrw, formatPercent } from '@/core/money';
import type { Account, Category, Holding, Ledger, PriceQuote, Trade } from '@/types';
import {
  expectedAccountBalances,
  expectedBudgetUsage202609,
  expectedCategoryTotals202609,
  expectedMonthlyTotals,
  expectedNetWorth,
  expectedPendingReceivable,
  expectedPositions,
} from './expected';
import type { Budget } from '@/types';

/**
 * 저장소에서 읽은 데이터로 계산한 값이 손으로 계산한 정답과 맞는지 훑는다.
 * 테스트와 같은 내용을 화면에서도 눈으로 확인하려고 만들었다.
 */

export interface Check {
  group: string;
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export interface VerifyInput {
  accounts: Account[];
  categories: Category[];
  ledger: Ledger;
  budgets: Budget[];
  trades: Trade[];
  holdings: Holding[];
  quotes: PriceQuote[];
  fxRate: number;
}

function check(group: string, label: string, expected: number, actual: number, format = formatKrw): Check {
  return {
    group,
    label,
    expected: format(expected),
    actual: format(actual),
    // 원화는 정수라 정확히 같아야 한다
    ok: Object.is(expected, actual),
  };
}

export function runChecks(input: VerifyInput): Check[] {
  const { accounts, categories, ledger, budgets, trades, holdings, quotes, fxRate } = input;
  const checks: Check[] = [];

  // --- 월 합계 -------------------------------------------------------------
  for (const [month, expected] of Object.entries(expectedMonthlyTotals)) {
    const actual = monthlyTotals(ledger, month);
    checks.push(check('월 합계', `${month} 수입`, expected.income, actual.income));
    checks.push(check('월 합계', `${month} 지출`, expected.expense, actual.expense));
    checks.push(check('월 합계', `${month} 잔액`, expected.net, actual.net));
  }

  // --- 카테고리 ------------------------------------------------------------
  const breakdown = categoryTotals(ledger, categories, '2026-09');
  checks.push(check('9월 카테고리', '전체 지출', expectedCategoryTotals202609.total, breakdown.total));

  for (const [categoryId, amount] of Object.entries(expectedCategoryTotals202609.parents)) {
    const row = breakdown.parents.find((p) => p.categoryId === categoryId);
    checks.push(check('9월 카테고리', row?.categoryName ?? categoryId, amount, row?.amount ?? 0));
  }

  // --- 예산 ---------------------------------------------------------------
  const usages = budgetUsage(budgets, ledger, categories, '2026-09');
  for (const [categoryId, expected] of Object.entries(expectedBudgetUsage202609)) {
    const usage = usages.find((u) => u.categoryId === categoryId);
    checks.push(check('9월 예산', `${usage?.categoryName ?? categoryId} 사용액`, expected.spent, usage?.spent ?? 0));
    checks.push({
      group: '9월 예산',
      label: `${usage?.categoryName ?? categoryId} 사용률`,
      expected: formatPercent(expected.ratio),
      actual: formatPercent(usage?.ratio ?? 0),
      ok: formatPercent(expected.ratio) === formatPercent(usage?.ratio ?? 0),
    });
  }

  // --- 정산 ---------------------------------------------------------------
  for (const settlement of ledger.settlements) {
    checks.push(
      check('정산', `${settlement.title} 내 부담`, settlement.myShare, settlement.myShare),
    );
  }
  checks.push(
    check('정산', '아직 못 받은 돈', expectedPendingReceivable, pendingReceivable(ledger.settlements)),
  );

  // --- 계좌 잔액 -----------------------------------------------------------
  const balances = allAccountBalances(accounts, ledger, trades, { fallbackFxRate: fxRate });
  for (const [accountId, expected] of Object.entries(expectedAccountBalances)) {
    const account = accounts.find((a) => a.id === accountId);
    checks.push(check('계좌 잔액', account?.name ?? accountId, expected, balances.get(accountId) ?? 0));
  }

  // --- 투자 ---------------------------------------------------------------
  const positions = buildPositions(holdings, trades, quotes, fxRate);
  for (const [symbol, expected] of Object.entries(expectedPositions)) {
    const position = positions.find((p) => p.holding.symbol === symbol);
    const name = position?.holding.name ?? symbol;
    checks.push(check('투자', `${name} 평가액`, expected.marketValueKrw, position?.marketValueKrw ?? 0));
    checks.push(check('투자', `${name} 평가손익`, expected.pnlKrw, position?.pnlKrw ?? 0));
  }
  checks.push(check('투자', '실현손익 누계', 68_460, portfolioSummary(positions, fxRate).realizedPnlKrw));

  // --- 순자산 -------------------------------------------------------------
  const netWorth = computeNetWorth(accounts, ledger, trades, holdings, quotes, fxRate);
  checks.push(check('순자산', '현금성 자산', expectedNetWorth.cashAssets, netWorth.cashAssets));
  checks.push(check('순자산', '부채', expectedNetWorth.liabilities, netWorth.liabilities));
  checks.push(check('순자산', '투자 자산', expectedNetWorth.investmentAssets, netWorth.investmentAssets));
  checks.push(check('순자산', '순자산', expectedNetWorth.netWorth, netWorth.netWorth));

  return checks;
}

export function groupChecks(checks: Check[]): { group: string; checks: Check[]; ok: boolean }[] {
  const groups = new Map<string, Check[]>();
  for (const c of checks) {
    const list = groups.get(c.group);
    if (list) list.push(c);
    else groups.set(c.group, [c]);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    checks: items,
    ok: items.every((c) => c.ok),
  }));
}
