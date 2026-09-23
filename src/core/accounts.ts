import type { Account, Dec, ID, Krw, Ledger, Trade } from '@/types';
import { toKrw } from './money';
import { receivedSoFar } from './settlement';

/**
 * 매매 한 건이 증권계좌 현금에 주는 영향 (원화).
 *
 *   매수 → −(체결금액 + 수수료)
 *   매도 → +(체결금액 − 수수료 − 세금)
 *
 * 미국 주식은 달러로 계산한 뒤 체결 시점 환율로 원화 환산한다.
 * 환율 반올림은 여기서 **마지막에 한 번만** 한다.
 */
export function tradeCashflowKrw(trade: Trade, fallbackFxRate?: Dec): Krw {
  const gross = trade.price * trade.quantity;
  const native =
    trade.side === 'buy'
      ? -(gross + trade.fee)
      : gross - trade.fee - (trade.tax ?? 0);

  if (trade.currency === 'KRW') return toKrw(native);

  const fxRate = trade.fxRateAtTrade ?? fallbackFxRate;
  // 환율을 모르면 원화 잔액에 반영할 방법이 없다. 0 으로 두고 화면에서 경고한다.
  if (!fxRate) return 0;

  return toKrw(native * fxRate);
}

export interface AccountBalanceOptions {
  /** 체결 시점 환율이 없는 미국 주식 매매에 쓸 환율 */
  fallbackFxRate?: Dec;
}

/**
 * 계좌 잔액.
 *
 * 부호 규칙은 **모든 계좌가 동일하다**. 신용카드라고 계산식을 뒤집지 않는다.
 * 신용카드로 717,000원을 쓰면 잔액은 그냥 -717,000 이 되고,
 * 순자산 계산에서 자연스럽게 빠진다. isLiability 는 화면 표시에만 쓴다.
 */
export function accountBalance(
  account: Account,
  ledger: Ledger,
  trades: Trade[],
  options: AccountBalanceOptions = {},
): Krw {
  let balance = account.initialBalance;

  for (const tx of ledger.transactions) {
    if (tx.type === 'income' && tx.accountId === account.id) {
      balance += tx.amount;
    } else if (tx.type === 'expense' && tx.accountId === account.id) {
      balance -= tx.amount;
    } else if (tx.type === 'transfer') {
      if (tx.accountId === account.id) balance -= tx.amount;
      if (tx.toAccountId === account.id) balance += tx.amount;
    }
  }

  for (const settlement of ledger.settlements) {
    // 결제한 계좌에서는 총액이 전부 나간다
    if (settlement.payerAccountId === account.id) {
      balance -= settlement.totalAmount;
    }
    // 정산 계좌에는 **실제로 받은 만큼만** 들어온다 (일부만 받았을 수도 있다)
    if (settlement.receiverAccountId === account.id) {
      balance += receivedSoFar(settlement);
    }
  }

  for (const trade of trades) {
    if (trade.accountId !== account.id) continue;
    balance += tradeCashflowKrw(trade, options.fallbackFxRate);
  }

  return balance;
}

export interface AccountBalanceView {
  account: Account;
  /** 부호 있는 잔액. 신용카드는 음수 */
  balance: Krw;
  /** 화면 라벨 — 신용카드는 '갚을 돈' */
  label: string;
  /** 화면에 찍을 금액 — 신용카드는 양수로 뒤집는다 */
  displayAmount: Krw;
  isDebt: boolean;
}

export function accountBalanceView(account: Account, balance: Krw): AccountBalanceView {
  const isDebt = account.isLiability && balance < 0;
  return {
    account,
    balance,
    label: isDebt ? '갚을 돈' : '잔액',
    displayAmount: isDebt ? -balance : balance,
    isDebt,
  };
}

/** 전 계좌 잔액을 한 번에 */
export function allAccountBalances(
  accounts: Account[],
  ledger: Ledger,
  trades: Trade[],
  options: AccountBalanceOptions = {},
): Map<ID, Krw> {
  return new Map(
    accounts.map((a) => [a.id, accountBalance(a, ledger, trades, options)]),
  );
}
