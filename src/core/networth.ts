import type {
  Account,
  Dec,
  Holding,
  ISODate,
  Krw,
  Ledger,
  NetWorthSnapshot,
  PriceQuote,
  Trade,
} from '@/types';
import { allAccountBalances } from './accounts';
import { buildPositions, holdingsFromTrades, type Position } from './holdings';

export interface NetWorthBreakdown {
  /** 잔액이 0 이상인 계좌들의 합 */
  cashAssets: Krw;
  /** 잔액이 음수인 계좌들의 합 (신용카드 등). 양수로 담는다 */
  liabilities: Krw;
  /** 주식 평가액의 원화 환산 합 */
  investmentAssets: Krw;
  /** cashAssets − liabilities + investmentAssets */
  netWorth: Krw;
  /** 현금성 비중 (0~1) */
  cashRatio: Dec;
  /** 투자 비중 (0~1) */
  investmentRatio: Dec;
  positions: Position[];
}

/**
 * 순자산 = 모든 계좌 잔액 + 주식 평가액(원화 환산) − 부채
 *
 * 증권계좌의 현금 잔액과 주식 평가액이 **이중으로 잡히지 않는** 이유:
 * 매수를 하면 증권계좌 현금이 그만큼 줄어들고(accountBalance 가 처리),
 * 그 자리를 주식 평가액이 대신한다.
 */
export function computeNetWorth(
  accounts: Account[],
  ledger: Ledger,
  trades: Trade[],
  holdings: Holding[],
  quotes: PriceQuote[],
  fxRate: Dec,
): NetWorthBreakdown {
  const balances = allAccountBalances(accounts, ledger, trades, { fallbackFxRate: fxRate });

  let cashAssets = 0;
  let liabilities = 0;

  for (const balance of balances.values()) {
    if (balance >= 0) cashAssets += balance;
    else liabilities += -balance;
  }

  const positions = buildPositions(holdings, trades, quotes, fxRate);
  const investmentAssets = positions.reduce((sum, p) => sum + p.marketValueKrw, 0);

  const netWorth = cashAssets - liabilities + investmentAssets;

  // 비중은 "가진 것" 기준이라 부채를 빼기 전 금액으로 나눈다
  const grossAssets = cashAssets + investmentAssets;

  return {
    cashAssets,
    liabilities,
    investmentAssets,
    netWorth,
    cashRatio: grossAssets === 0 ? 0 : cashAssets / grossAssets,
    investmentRatio: grossAssets === 0 ? 0 : investmentAssets / grossAssets,
    positions,
  };
}

/** 오늘자 스냅샷 만들기 (앱을 처음 연 날 하루 한 번 저장한다) */
export function toSnapshot(
  breakdown: NetWorthBreakdown,
  date: ISODate,
): Omit<NetWorthSnapshot, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    date,
    cashAssets: breakdown.cashAssets,
    liabilities: breakdown.liabilities,
    investmentAssets: breakdown.investmentAssets,
    netWorth: breakdown.netWorth,
  };
}

/**
 * 순자산 추이 차트용 — 각 월의 마지막 스냅샷을 고른다.
 * 그 달에 스냅샷이 없으면 그 월은 건너뛴다 (없는 값을 지어내지 않는다).
 */
export function monthlySnapshots(
  snapshots: NetWorthSnapshot[],
  months: string[],
): { month: string; snapshot: NetWorthSnapshot | null }[] {
  const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));

  return months.map((month) => {
    const inMonth = sorted.filter((s) => s.date.startsWith(month));
    return { month, snapshot: inMonth.length > 0 ? inMonth[inMonth.length - 1] : null };
  });
}

/**
 * 과거 어느 날의 순자산을 거래 기록에서 되짚어 계산한다.
 *
 * 앱을 쓰기 시작한 날부터 스냅샷이 쌓이지만, 그 전 기록이 있다면
 * 추이 차트에 과거도 그릴 수 있다.
 *
 * **한계**: 현금·부채는 정확하지만, 주식은 그날의 시세를 모르므로
 * **취득원가**로 평가한다 (평가손익 0). 그래서 과거 구간은 실제보다
 * 완만하게 보인다. 오늘 이후로는 스냅샷이 실제 시세로 쌓인다.
 */
export function netWorthAsOf(
  accounts: Account[],
  ledger: Ledger,
  trades: Trade[],
  date: ISODate,
  fxRate: Dec,
  knownHoldings: Holding[] = [],
): NetWorthBreakdown {
  const ledgerUpTo: Ledger = {
    transactions: ledger.transactions.filter((tx) => tx.date <= date),
    settlements: ledger.settlements.filter((s) => s.date <= date),
  };
  const tradesUpTo = trades.filter((t) => t.date <= date);
  const holdings = holdingsFromTrades(tradesUpTo, knownHoldings);

  // 시세를 빈 배열로 넘기면 buildPositions 가 평균 매입가로 평가한다
  return computeNetWorth(accounts, ledgerUpTo, tradesUpTo, holdings, [], fxRate);
}

/**
 * 여러 날짜의 순자산을 한 번에 역산한다.
 * 데모 데이터의 과거 추이를 채울 때 쓴다.
 */
export function reconstructSnapshots(
  accounts: Account[],
  ledger: Ledger,
  trades: Trade[],
  dates: ISODate[],
  fxRate: Dec,
  knownHoldings: Holding[] = [],
): Omit<NetWorthSnapshot, 'id' | 'createdAt' | 'updatedAt'>[] {
  return dates.map((date) =>
    toSnapshot(netWorthAsOf(accounts, ledger, trades, date, fxRate, knownHoldings), date),
  );
}
