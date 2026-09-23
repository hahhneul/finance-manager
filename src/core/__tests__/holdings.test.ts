import { describe, expect, it } from 'vitest';
import {
  buildPositions,
  groupTradesByHolding,
  latestQuotes,
  marketValueKrw,
  portfolioSummary,
  recomputeHolding,
  unrealizedPnl,
} from '../holdings';
import {
  DEMO_FX_RATE,
  demoHoldings,
  demoQuotes,
  demoTrades,
} from '@/demo/demoData';
import { expectedHoldingStates, expectedInvestmentAssets, expectedPositions } from '@/demo/expected';
import type { Trade } from '@/types';

const tradesOf = (symbol: string) => demoTrades.filter((t) => t.symbol === symbol);

describe('이동평균법 — 데모 종목 3개', () => {
  it.each(Object.keys(expectedHoldingStates))('%s', (symbol) => {
    const expected = expectedHoldingStates[symbol as keyof typeof expectedHoldingStates];
    const state = recomputeHolding(tradesOf(symbol));

    expect(state.quantity).toBe(expected.quantity);
    expect(state.avgCost).toBeCloseTo(expected.avgCost, 8);
    expect(state.totalCost).toBeCloseTo(expected.totalCost, 6);
    expect(state.realizedPnl).toBeCloseTo(expected.realizedPnl, 6);
  });

  it('저장된 Holding 의 수량·평단이 매매 기록과 일치한다', () => {
    // Holding 은 Trade 로부터 계산된 캐시다. 둘이 어긋나면 안 된다
    for (const holding of demoHoldings) {
      const state = recomputeHolding(tradesOf(holding.symbol));
      expect(holding.quantity).toBe(state.quantity);
      expect(holding.avgCost).toBeCloseTo(state.avgCost, 8);
    }
  });
});

describe('삼성전자 — 분할 매수 후 일부 매도', () => {
  it('1차 매수 후 평균단가는 70,100원 (수수료 포함)', () => {
    const state = recomputeHolding([tradesOf('005930')[0]]);
    // (70,000 × 10 + 1,000) / 10
    expect(state.avgCost).toBe(70_100);
  });

  it('2차 매수 후 평균단가는 73,440원', () => {
    const state = recomputeHolding(tradesOf('005930').slice(0, 2));
    // (701,000 + 400,600) / 15
    expect(state.avgCost).toBe(73_440);
    expect(state.quantity).toBe(15);
  });

  it('매도해도 평균단가는 그대로다', () => {
    // 이동평균법에서는 파는 것이 평단을 바꾸지 않는다
    expect(recomputeHolding(tradesOf('005930')).avgCost).toBe(73_440);
  });

  it('실현손익 = (체결가 − 평균단가) × 수량 − 수수료', () => {
    const state = recomputeHolding(tradesOf('005930'));
    // (85,000 − 73,440) × 6 − 900 = 69,360 − 900
    expect(state.realizedPnl).toBe(68_460);
    expect(state.realizedLots).toHaveLength(1);
    expect(state.realizedLots[0].avgCostAtSale).toBe(73_440);
  });
});

describe('카카오 — 물타기', () => {
  it('더 싸게 사면 평균단가가 내려간다', () => {
    const [first] = tradesOf('035720');
    expect(recomputeHolding([first]).avgCost).toBe(45_050);
    expect(recomputeHolding(tradesOf('035720')).avgCost).toBe(44_050);
  });
});

describe('매매 순서', () => {
  it('배열 순서가 아니라 날짜 순으로 계산한다', () => {
    const shuffled = [...tradesOf('005930')].reverse();
    expect(recomputeHolding(shuffled)).toEqual(recomputeHolding(tradesOf('005930')));
  });

  it('매매 기록이 없으면 빈 상태', () => {
    const state = recomputeHolding([]);
    expect(state).toEqual({
      quantity: 0, avgCost: 0, totalCost: 0,
      realizedPnl: 0, realizedLots: [], oversoldQuantity: 0,
    });
  });
});

describe('경계 상황', () => {
  const base = {
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    accountId: 'acc-kiwoom', symbol: 'TEST', market: 'KRX' as const, currency: 'KRW' as const,
  };

  it('전량 매도하면 수량과 원가가 0 이 된다', () => {
    const trades: Trade[] = [
      { ...base, id: 'a', date: '2026-01-01', side: 'buy', quantity: 10, price: 1_000, fee: 0 },
      { ...base, id: 'b', date: '2026-02-01', side: 'sell', quantity: 10, price: 1_200, fee: 0 },
    ];
    const state = recomputeHolding(trades);
    expect(state.quantity).toBe(0);
    expect(state.totalCost).toBe(0);
    expect(state.avgCost).toBe(0);
    expect(state.realizedPnl).toBe(2_000);
  });

  it('전량 매도 후 다시 사면 새 평단으로 시작한다', () => {
    const trades: Trade[] = [
      { ...base, id: 'a', date: '2026-01-01', side: 'buy', quantity: 10, price: 1_000, fee: 0 },
      { ...base, id: 'b', date: '2026-02-01', side: 'sell', quantity: 10, price: 1_200, fee: 0 },
      { ...base, id: 'c', date: '2026-03-01', side: 'buy', quantity: 5, price: 2_000, fee: 0 },
    ];
    const state = recomputeHolding(trades);
    expect(state.avgCost).toBe(2_000);
    expect(state.quantity).toBe(5);
  });

  it('매도 세금도 실현손익에서 뺀다', () => {
    const trades: Trade[] = [
      { ...base, id: 'a', date: '2026-01-01', side: 'buy', quantity: 10, price: 1_000, fee: 0 },
      { ...base, id: 'b', date: '2026-02-01', side: 'sell', quantity: 10, price: 1_200, fee: 100, tax: 20 },
    ];
    // (1,200 − 1,000) × 10 − 100 − 20
    expect(recomputeHolding(trades).realizedPnl).toBe(1_880);
  });

  it('보유량보다 많이 팔면 표시해 두고 앱은 멈추지 않는다', () => {
    const trades: Trade[] = [
      { ...base, id: 'a', date: '2026-01-01', side: 'buy', quantity: 5, price: 1_000, fee: 0 },
      { ...base, id: 'b', date: '2026-02-01', side: 'sell', quantity: 8, price: 1_200, fee: 0 },
    ];
    const state = recomputeHolding(trades);
    expect(state.oversoldQuantity).toBe(3);
    expect(state.quantity).toBe(0);
  });
});

describe('평가손익', () => {
  it('통화 기준으로 먼저 계산한다', () => {
    const state = recomputeHolding(tradesOf('AAPL'));
    const native = unrealizedPnl(state, 200);

    expect(native.marketValue).toBe(1_000);
    expect(native.costBasis).toBe(931);
    expect(native.pnl).toBe(69);
    expect(native.returnRate).toBeCloseTo(69 / 931, 10);
  });

  it('원화 평가액은 마지막에 한 번만 반올림한다', () => {
    const state = recomputeHolding(tradesOf('AAPL'));
    // 5 × $200 × 1,350 = 1,350,000
    expect(marketValueKrw(state, 200, 'USD', DEMO_FX_RATE)).toBe(1_350_000);
  });

  it('원화 종목은 환율을 곱하지 않는다', () => {
    const state = recomputeHolding(tradesOf('005930'));
    expect(marketValueKrw(state, 86_000, 'KRW', DEMO_FX_RATE)).toBe(774_000);
  });
});

describe('포지션 — 투자 화면 한 줄', () => {
  const positions = buildPositions(demoHoldings, demoTrades, demoQuotes, DEMO_FX_RATE);

  it.each(Object.keys(expectedPositions))('%s 평가액·평가손익·수익률', (symbol) => {
    const expected = expectedPositions[symbol as keyof typeof expectedPositions];
    const position = positions.find((p) => p.holding.symbol === symbol)!;

    expect(position.marketValueKrw).toBe(expected.marketValueKrw);
    expect(position.costBasisKrw).toBe(expected.costBasisKrw);
    expect(position.pnlKrw).toBe(expected.pnlKrw);
    expect(position.native.returnRate).toBeCloseTo(expected.returnRate, 10);
  });

  it('평가액 − 원가 = 평가손익 이 화면에서 정확히 맞는다', () => {
    // 각각 반올림한 뒤 빼기 때문에 세 숫자가 서로 어긋나지 않는다
    for (const p of positions) {
      expect(p.marketValueKrw - p.costBasisKrw).toBe(p.pnlKrw);
    }
  });

  it('평가액이 큰 순으로 정렬된다', () => {
    expect(positions.map((p) => p.holding.symbol)).toEqual(['AAPL', '035720', '005930']);
  });

  it('시세가 없으면 평균단가로 평가하고 표시해 둔다', () => {
    const [position] = buildPositions(
      demoHoldings.filter((h) => h.symbol === '005930'), demoTrades, [], DEMO_FX_RATE,
    );
    expect(position.priceMissing).toBe(true);
    expect(position.priceAsOf).toBeNull();
    expect(position.price).toBe(73_440);
    // 평균단가로 평가하니 평가손익은 0
    expect(position.pnlKrw).toBe(0);
  });

  it('전량 매도한 종목은 목록에 없다', () => {
    const sold = { ...demoHoldings[0], quantity: 0 };
    const extraSell: Trade = {
      ...demoTrades[2], id: 'trd-sell-all', date: '2026-09-19',
      side: 'sell', quantity: 9, price: 86_000, fee: 0,
    };
    const positions = buildPositions([sold], [...demoTrades, extraSell], demoQuotes, DEMO_FX_RATE);
    expect(positions).toHaveLength(0);
  });
});

describe('포트폴리오 요약', () => {
  const positions = buildPositions(demoHoldings, demoTrades, demoQuotes, DEMO_FX_RATE);
  const summary = portfolioSummary(positions, DEMO_FX_RATE);

  it('평가액 합계', () => {
    expect(summary.marketValueKrw).toBe(expectedInvestmentAssets);
  });

  it('실현손익 누계는 삼성전자 매도분', () => {
    expect(summary.realizedPnlKrw).toBe(68_460);
  });

  it('총 평가손익', () => {
    // 113,040 + (−16,500) + 93,150
    expect(summary.pnlKrw).toBe(189_690);
  });
});

describe('시세 고르기', () => {
  it('같은 종목이 여러 건이면 가장 최근 것을 쓴다', () => {
    const older = { ...demoQuotes[0], id: 'old', price: 80_000, asOf: '2026-09-19T06:30:00.000Z' };
    const latest = latestQuotes([older, demoQuotes[0]]);
    expect(latest.get('KRX:005930')?.price).toBe(86_000);
  });

  it('계좌·시장·종목이 같아야 한 포지션이다', () => {
    expect(groupTradesByHolding(demoTrades).size).toBe(3);
  });
});
