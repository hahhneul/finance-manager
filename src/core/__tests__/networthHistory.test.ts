import { describe, expect, it } from 'vitest';
import { netWorthAsOf, reconstructSnapshots } from '../networth';
import { holdingsFromTrades } from '../holdings';
import {
  DEMO_FX_RATE,
  demoAccounts,
  demoHoldings,
  demoLedger,
  demoTrades,
} from '@/demo/demoData';
import { expectedNetWorth } from '@/demo/expected';

describe('매매 기록에서 보유 종목 되살리기', () => {
  it('지금 저장된 것과 같은 수량·평단이 나온다', () => {
    const rebuilt = holdingsFromTrades(demoTrades, demoHoldings);

    expect(rebuilt).toHaveLength(3);
    for (const holding of demoHoldings) {
      const match = rebuilt.find((h) => h.symbol === holding.symbol)!;
      expect(match.quantity).toBe(holding.quantity);
      expect(match.avgCost).toBeCloseTo(holding.avgCost, 8);
      // 종목명도 물려받는다
      expect(match.name).toBe(holding.name);
    }
  });

  it('아직 사지 않은 시점에는 아무것도 없다', () => {
    const before = demoTrades.filter((t) => t.date <= '2026-07-09');
    expect(holdingsFromTrades(before)).toHaveLength(0);
  });

  it('첫 매수 직후에는 그 종목만', () => {
    const early = demoTrades.filter((t) => t.date <= '2026-07-10');
    const rebuilt = holdingsFromTrades(early);

    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].symbol).toBe('005930');
    expect(rebuilt[0].quantity).toBe(10);
    // 매수 수수료 포함한 취득원가
    expect(rebuilt[0].avgCost).toBe(70_100);
  });

  it('종목명을 모르면 종목코드를 쓴다', () => {
    expect(holdingsFromTrades(demoTrades)[0].name).toMatch(/^(005930|035720|AAPL)$/);
  });
});

describe('과거 순자산 역산', () => {
  it('오늘 시점은 시세가 없는 것만 빼면 현금 부분이 같다', () => {
    const asOf = netWorthAsOf(
      demoAccounts, demoLedger, demoTrades, '2026-09-20', DEMO_FX_RATE, demoHoldings,
    );

    // 현금·부채는 거래 기록만으로 정확히 나온다
    expect(asOf.cashAssets).toBe(expectedNetWorth.cashAssets);
    expect(asOf.liabilities).toBe(expectedNetWorth.liabilities);
  });

  it('주식은 취득원가로 평가한다 (그날 시세를 모르므로)', () => {
    const asOf = netWorthAsOf(
      demoAccounts, demoLedger, demoTrades, '2026-09-20', DEMO_FX_RATE, demoHoldings,
    );

    // 삼성 660,960 + 카카오 1,321,500 + 애플 round(931 × 1350)
    expect(asOf.investmentAssets).toBe(660_960 + 1_321_500 + 1_256_850);
    // 실제 평가액(3,429,000)보다 적다 — 평가차익이 빠져 있다
    expect(asOf.investmentAssets).toBeLessThan(expectedNetWorth.investmentAssets);
  });

  it('거래가 하나도 없던 시점은 초기 잔액만 남는다', () => {
    const asOf = netWorthAsOf(
      demoAccounts, demoLedger, demoTrades, '2026-06-30', DEMO_FX_RATE, demoHoldings,
    );

    // 현금 100,000 + 신한 3,000,000 + 카카오 200,000
    expect(asOf.cashAssets).toBe(3_300_000);
    expect(asOf.liabilities).toBe(0);
    expect(asOf.investmentAssets).toBe(0);
    expect(asOf.netWorth).toBe(3_300_000);
  });

  it('7월 말에는 이미 산 주식이 잡힌다', () => {
    const asOf = netWorthAsOf(
      demoAccounts, demoLedger, demoTrades, '2026-07-31', DEMO_FX_RATE, demoHoldings,
    );

    // 7월까지 산 것: 삼성 10주(701,000) + 카카오 20주(901,000) + 애플 3주($540.5)
    expect(asOf.investmentAssets).toBe(701_000 + 901_000 + Math.round(540.5 * DEMO_FX_RATE));
  });
});

describe('여러 날짜 한 번에', () => {
  const dates = ['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-20'];
  const snapshots = reconstructSnapshots(
    demoAccounts, demoLedger, demoTrades, dates, DEMO_FX_RATE, demoHoldings,
  );

  it('날짜마다 하나씩', () => {
    expect(snapshots.map((s) => s.date)).toEqual(dates);
  });

  it('각 스냅샷의 합이 맞는다', () => {
    for (const s of snapshots) {
      expect(s.netWorth).toBe(s.cashAssets - s.liabilities + s.investmentAssets);
    }
  });

  it('월급을 받으며 순자산이 늘어난다', () => {
    const values = snapshots.map((s) => s.netWorth);
    expect(values[1]).toBeGreaterThan(values[0]);
    expect(values[2]).toBeGreaterThan(values[1]);
  });
});
