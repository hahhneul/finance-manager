import { describe, expect, it } from 'vitest';
import { accountBalance, accountBalanceView, allAccountBalances, tradeCashflowKrw } from '../accounts';
import { DEMO_FX_RATE, demoAccounts, demoLedger, demoTrades } from '@/demo/demoData';
import { expectedAccountBalances } from '@/demo/expected';
import type { Trade } from '@/types';

const options = { fallbackFxRate: DEMO_FX_RATE };

describe('계좌 잔액', () => {
  it.each(demoAccounts)('$name', (account) => {
    const expected = expectedAccountBalances[account.id as keyof typeof expectedAccountBalances];
    expect(accountBalance(account, demoLedger, demoTrades, options)).toBe(expected);
  });

  it('allAccountBalances 도 같은 값을 준다', () => {
    const balances = allAccountBalances(demoAccounts, demoLedger, demoTrades, options);
    for (const [id, expected] of Object.entries(expectedAccountBalances)) {
      expect(balances.get(id)).toBe(expected);
    }
  });
});

describe('이체는 양쪽 계좌에 반대로 반영된다', () => {
  it('7월 8일 신한 → 키움 250만원', () => {
    const shinhan = demoAccounts.find((a) => a.id === 'acc-shinhan')!;
    const kiwoom = demoAccounts.find((a) => a.id === 'acc-kiwoom')!;

    const ledgerWithout = {
      settlements: demoLedger.settlements,
      transactions: demoLedger.transactions.filter((t) => t.id !== 'tx-07'),
    };

    const shinhanDiff =
      accountBalance(shinhan, demoLedger, demoTrades, options) -
      accountBalance(shinhan, ledgerWithout, demoTrades, options);
    const kiwoomDiff =
      accountBalance(kiwoom, demoLedger, demoTrades, options) -
      accountBalance(kiwoom, ledgerWithout, demoTrades, options);

    expect(shinhanDiff).toBe(-2_500_000);
    expect(kiwoomDiff).toBe(2_500_000);
    // 전체 합계는 변하지 않는다 — 돈이 사라지거나 생기지 않는다
    expect(shinhanDiff + kiwoomDiff).toBe(0);
  });
});

describe('정산이 두 계좌에 나뉘어 반영된다', () => {
  const card = demoAccounts.find((a) => a.id === 'acc-card')!;
  const kakao = demoAccounts.find((a) => a.id === 'acc-kakao')!;

  it('결제한 계좌에서는 총액이 나간다', () => {
    const onlyTeamDinner = { transactions: [], settlements: [demoLedger.settlements[0]] };
    // 팀 회식 총액 120,000
    expect(accountBalance(card, onlyTeamDinner, [], options)).toBe(-120_000);
  });

  it('정산 계좌에는 내 몫을 뺀 90,000원이 들어온다', () => {
    const onlyTeamDinner = { transactions: [], settlements: [demoLedger.settlements[0]] };
    expect(accountBalance(kakao, onlyTeamDinner, [], options)).toBe(200_000 + 90_000);
  });

  it('아직 못 받은 정산금은 잔액에 반영되지 않는다', () => {
    const onlyChicken = { transactions: [], settlements: [demoLedger.settlements[2]] };
    // 치킨 모임 22,500원은 receivedDate 가 없다
    expect(accountBalance(kakao, onlyChicken, [], options)).toBe(200_000);
  });
});

describe('매매 현금흐름', () => {
  const base = { id: 't', createdAt: '', updatedAt: '', date: '2026-09-01', accountId: 'acc-kiwoom' };

  it('국내 매수는 체결금액 + 수수료만큼 나간다', () => {
    const trade: Trade = {
      ...base, symbol: '005930', market: 'KRX', currency: 'KRW',
      side: 'buy', quantity: 10, price: 70_000, fee: 1_000,
    };
    expect(tradeCashflowKrw(trade)).toBe(-701_000);
  });

  it('국내 매도는 수수료와 세금을 뺀 금액이 들어온다', () => {
    const trade: Trade = {
      ...base, symbol: '005930', market: 'KRX', currency: 'KRW',
      side: 'sell', quantity: 6, price: 85_000, fee: 900, tax: 1_020,
    };
    // 510,000 − 900 − 1,020
    expect(tradeCashflowKrw(trade)).toBe(508_080);
  });

  it('달러 매수는 체결 시점 환율로 환산한다', () => {
    const trade: Trade = {
      ...base, symbol: 'AAPL', market: 'US', currency: 'USD',
      side: 'buy', quantity: 3, price: 180, fee: 0.5, fxRateAtTrade: 1_320,
    };
    // ($540 + $0.5) × 1,320 = 713,460
    expect(tradeCashflowKrw(trade)).toBe(-713_460);
  });

  it('체결 환율이 없으면 넘겨준 환율을 쓴다', () => {
    const trade: Trade = {
      ...base, symbol: 'AAPL', market: 'US', currency: 'USD',
      side: 'buy', quantity: 1, price: 100, fee: 0, fxRateAtTrade: undefined,
    };
    expect(tradeCashflowKrw(trade, 1_400)).toBe(-140_000);
  });

  it('환율을 전혀 모르면 0 으로 두고 앱이 멈추지 않게 한다', () => {
    const trade: Trade = {
      ...base, symbol: 'AAPL', market: 'US', currency: 'USD',
      side: 'buy', quantity: 1, price: 100, fee: 0,
    };
    expect(tradeCashflowKrw(trade)).toBe(0);
  });
});

describe('신용카드 표시', () => {
  const card = demoAccounts.find((a) => a.id === 'acc-card')!;

  it('잔액은 음수로 계산된다', () => {
    expect(accountBalance(card, demoLedger, demoTrades, options)).toBe(-717_000);
  });

  it('화면에는 "갚을 돈 717,000원"으로 보여준다', () => {
    const view = accountBalanceView(card, -717_000);
    expect(view.label).toBe('갚을 돈');
    expect(view.displayAmount).toBe(717_000);
    expect(view.isDebt).toBe(true);
  });

  it('카드를 다 갚아서 0원이면 부채가 아니다', () => {
    expect(accountBalanceView(card, 0).isDebt).toBe(false);
  });

  it('일반 계좌는 잔액 그대로 보여준다', () => {
    const bank = demoAccounts.find((a) => a.id === 'acc-shinhan')!;
    const view = accountBalanceView(bank, 2_194_200);
    expect(view.label).toBe('잔액');
    expect(view.displayAmount).toBe(2_194_200);
  });
});

describe('부분 입금이 잔액에 반영된다', () => {
  const kakao = demoAccounts.find((a) => a.id === 'acc-kakao')!;

  it('일부만 받았으면 그만큼만 들어온다', () => {
    const partial = {
      ...demoLedger.settlements[2], // 치킨 모임 22,500
      receivedDate: '2026-09-23',
      receivedAmount: 10_000,
    };
    const ledger = { transactions: [], settlements: [partial] };

    expect(accountBalance(kakao, ledger, [], options)).toBe(200_000 + 10_000);
  });

  it('다 받으면 전액 들어온다', () => {
    const full = {
      ...demoLedger.settlements[2],
      receivedDate: '2026-09-23',
      receivedAmount: 22_500,
    };
    const ledger = { transactions: [], settlements: [full] };

    expect(accountBalance(kakao, ledger, [], options)).toBe(200_000 + 22_500);
  });
});
