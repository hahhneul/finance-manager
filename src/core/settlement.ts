import type { ISODate, Krw, Settlement } from '@/types';

export interface SplitResult {
  /** 1인당 금액 */
  perPerson: Krw;
  /** 내 실부담액 — 지출 통계에 잡히는 값 */
  myShare: Krw;
  /** 돌려받을 금액 — 정산 계좌로 들어올 값 */
  reimbursedAmount: Krw;
}

/**
 * N빵 계산.
 *
 *   1인당      = floor(총액 / 인원)
 *   돌려받을 돈 = 1인당 × (인원 − 1)
 *   내 실부담   = 총액 − 돌려받을 돈
 *
 * 나누어떨어지지 않는 잔돈은 결제한 사람(나)이 부담한다.
 * 이렇게 해야 myShare + reimbursedAmount === totalAmount 가 **항상 정확히** 맞는다.
 * (1인당 금액을 반올림해서 인원수만큼 곱하면 총액과 1~2원씩 어긋난다)
 *
 *   splitBill(340000, 3) → 1인당 113,333 / 돌려받을 226,666 / 내 몫 113,334
 */
export function splitBill(totalAmount: Krw, headcount: number): SplitResult {
  if (!Number.isInteger(totalAmount) || totalAmount < 0) {
    throw new Error(`정산 총액은 0 이상의 정수여야 합니다: ${totalAmount}`);
  }
  if (!Number.isInteger(headcount) || headcount < 1) {
    throw new Error(`정산 인원은 1명 이상의 정수여야 합니다: ${headcount}`);
  }

  const perPerson = Math.floor(totalAmount / headcount);
  const reimbursedAmount = perPerson * (headcount - 1);
  const myShare = totalAmount - reimbursedAmount;

  return { perPerson, myShare, reimbursedAmount };
}

/** 정산이 지출 통계에 기여하는 금액 — 총액이 아니라 내 몫이다 */
export function settlementExpense(settlement: Settlement): Krw {
  return settlement.myShare;
}

/**
 * 실제로 받은 금액.
 *
 * receivedAmount 가 없고 receivedDate 만 있으면 전액을 받은 것으로 본다.
 * (부분 입금을 지원하기 전에 저장된 기록과 호환되게)
 */
export function receivedSoFar(settlement: Settlement): Krw {
  if (!settlement.receivedDate) return 0;
  return settlement.receivedAmount ?? settlement.reimbursedAmount;
}

/** 아직 받지 못한 금액 */
export function outstanding(settlement: Settlement): Krw {
  return Math.max(0, settlement.reimbursedAmount - receivedSoFar(settlement));
}

/** 아직 돈을 다 못 받은 정산인가 */
export function isPending(settlement: Settlement): boolean {
  return outstanding(settlement) > 0;
}

/** 아직 못 받은 돈의 합계 ("받을 돈 22,500원" 표시용) */
export function pendingReceivable(settlements: Settlement[]): Krw {
  return settlements.reduce((sum, s) => sum + outstanding(s), 0);
}

/** 입금을 기록할 때 넣을 값을 만든다 */
export function applyReceipt(
  settlement: Settlement,
  amount: Krw,
  date: ISODate,
): Pick<Settlement, 'receivedDate' | 'receivedAmount'> {
  const total = receivedSoFar(settlement) + amount;

  return {
    receivedDate: date,
    // 돌려받을 금액보다 많이 넣을 수는 없다
    receivedAmount: Math.min(total, settlement.reimbursedAmount),
  };
}

/**
 * 저장된 정산이 앞뒤가 맞는지 검사한다.
 * 사용자가 금액을 수동으로 고칠 수 있으므로 저장 직전에 한 번 확인한다.
 */
export function validateSettlement(s: Pick<Settlement, 'totalAmount' | 'myShare' | 'reimbursedAmount' | 'headcount'>): string[] {
  const errors: string[] = [];
  if (s.totalAmount < 0) errors.push('총액은 0원 이상이어야 합니다.');
  if (s.headcount < 1) errors.push('인원은 1명 이상이어야 합니다.');
  if (s.myShare < 0) errors.push('내 부담액은 0원 이상이어야 합니다.');
  if (s.reimbursedAmount < 0) errors.push('돌려받을 금액은 0원 이상이어야 합니다.');
  if (s.myShare + s.reimbursedAmount !== s.totalAmount) {
    errors.push(
      `내 부담액(${s.myShare}) + 돌려받을 금액(${s.reimbursedAmount})이 총액(${s.totalAmount})과 다릅니다.`,
    );
  }
  return errors;
}

export interface SettlementDraft {
  date: ISODate;
  title: string;
  totalAmount: Krw;
  headcount: number;
  payerAccountId: string;
  receiverAccountId: string;
  categoryId?: string;
  /** 기본값은 "바로 받았음". 체크 해제하면 receivedDate 가 비어 미수금이 된다 */
  received: boolean;
  memo?: string;
  tags?: string[];
}

/**
 * 입력 화면에서 받은 값 → 저장할 형태.
 * 총액과 인원만 넣으면 나머지 금액은 자동으로 채워진다.
 */
export function buildSettlement(draft: SettlementDraft): Omit<Settlement, 'id' | 'createdAt' | 'updatedAt'> {
  const { myShare, reimbursedAmount } = splitBill(draft.totalAmount, draft.headcount);
  return {
    date: draft.date,
    title: draft.title,
    totalAmount: draft.totalAmount,
    headcount: draft.headcount,
    payerAccountId: draft.payerAccountId,
    receiverAccountId: draft.receiverAccountId,
    categoryId: draft.categoryId,
    myShare,
    reimbursedAmount,
    // 인원만 넣으면 바로 정산된 것으로 본다. "아직 못 받음"이면 비워 둔다.
    receivedDate: draft.received ? draft.date : undefined,
    memo: draft.memo ?? '',
    tags: draft.tags ?? [],
  };
}
