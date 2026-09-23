import { describe, expect, it } from 'vitest';
import { computeNetWorth, monthlySnapshots, toSnapshot } from '../networth';
import {
  DEMO_FX_RATE,
  demoAccounts,
  demoHoldings,
  demoLedger,
  demoQuotes,
  demoTrades,
} from '@/demo/demoData';
import { expectedNetWorth } from '@/demo/expected';
import type { NetWorthSnapshot } from '@/types';

const breakdown = computeNetWorth(
  demoAccounts, demoLedger, demoTrades, demoHoldings, demoQuotes, DEMO_FX_RATE,
);

describe('순자산', () => {
  it('현금성 자산 — 잔액이 양수인 계좌들의 합', () => {
    expect(breakdown.cashAssets).toBe(expectedNetWorth.cashAssets);
  });

  it('부채 — 신용카드 미결제액', () => {
    expect(breakdown.liabilities).toBe(expectedNetWorth.liabilities);
  });

  it('투자 자산 — 주식 평가액의 원화 환산', () => {
    expect(breakdown.investmentAssets).toBe(expectedNetWorth.investmentAssets);
  });

  it('순자산 = 현금성 − 부채 + 투자', () => {
    expect(breakdown.netWorth).toBe(expectedNetWorth.netWorth);
    expect(breakdown.netWorth).toBe(
      breakdown.cashAssets - breakdown.liabilities + breakdown.investmentAssets,
    );
  });
});

describe('증권계좌 현금과 주식 평가액이 이중으로 잡히지 않는다', () => {
  it('매수하면 증권계좌 현금이 줄고 그만큼 주식이 생긴다', () => {
    // 키움 잔액 149,270원 + 주식 3,429,000원 = 3,578,270원이
    // 입금한 3,300,000원 + 평가차익이지, 3,300,000 + 3,429,000 이 아니다
    const kiwoomCash = 149_270;
    const transferred = 3_300_000;

    expect(kiwoomCash + breakdown.investmentAssets).toBeGreaterThan(transferred);
    // 평가차익 + 실현손익만큼만 늘어야 한다
    expect(kiwoomCash + breakdown.investmentAssets - transferred).toBe(278_270);
  });
});

describe('자산 비중', () => {
  it('현금성 + 투자 = 1', () => {
    expect(breakdown.cashRatio + breakdown.investmentRatio).toBeCloseTo(1, 10);
  });

  it('부채를 빼기 전 금액 기준으로 나눈다', () => {
    const gross = expectedNetWorth.cashAssets + expectedNetWorth.investmentAssets;
    expect(breakdown.investmentRatio).toBeCloseTo(3_429_000 / gross, 10);
  });

  it('자산이 하나도 없으면 0 으로 둔다 (0으로 나누지 않는다)', () => {
    const empty = computeNetWorth([], { transactions: [], settlements: [] }, [], [], [], DEMO_FX_RATE);
    expect(empty.netWorth).toBe(0);
    expect(empty.cashRatio).toBe(0);
    expect(empty.investmentRatio).toBe(0);
  });
});

describe('시세를 못 가져와도 순자산은 나온다', () => {
  it('평균 매입가로 평가한다', () => {
    const offline = computeNetWorth(
      demoAccounts, demoLedger, demoTrades, demoHoldings, [], DEMO_FX_RATE,
    );
    // 660,960 + 1,321,500 + round(931 × 1,350)
    expect(offline.investmentAssets).toBe(660_960 + 1_321_500 + 1_256_850);
    expect(offline.netWorth).toBeGreaterThan(0);
  });
});

describe('스냅샷', () => {
  it('오늘자 스냅샷을 만든다', () => {
    expect(toSnapshot(breakdown, '2026-09-21')).toEqual({
      date: '2026-09-21',
      cashAssets: expectedNetWorth.cashAssets,
      liabilities: expectedNetWorth.liabilities,
      investmentAssets: expectedNetWorth.investmentAssets,
      netWorth: expectedNetWorth.netWorth,
    });
  });

  const snap = (date: string, netWorth: number): NetWorthSnapshot => ({
    id: date, createdAt: '', updatedAt: '', date,
    cashAssets: netWorth, liabilities: 0, investmentAssets: 0, netWorth,
  });

  it('월별 추이는 그 달의 마지막 스냅샷을 고른다', () => {
    const snapshots = [snap('2026-08-05', 100), snap('2026-08-28', 200), snap('2026-09-10', 300)];
    const result = monthlySnapshots(snapshots, ['2026-08', '2026-09']);

    expect(result[0].snapshot?.netWorth).toBe(200);
    expect(result[1].snapshot?.netWorth).toBe(300);
  });

  it('스냅샷이 없는 달은 null — 없는 값을 지어내지 않는다', () => {
    const result = monthlySnapshots([snap('2026-09-10', 300)], ['2026-07', '2026-08', '2026-09']);
    expect(result.map((r) => r.snapshot?.netWorth ?? null)).toEqual([null, null, 300]);
  });
});
