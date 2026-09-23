import { describe, expect, it } from 'vitest';
import {
  applyReceipt,
  buildSettlement,
  isPending,
  outstanding,
  pendingReceivable,
  receivedSoFar,
  splitBill,
  validateSettlement,
} from '../settlement';
import { demoSettlements } from '@/demo/demoData';
import { expectedPendingReceivable, expectedSettlements } from '@/demo/expected';

describe('splitBill — N빵 계산', () => {
  it('딱 떨어지는 경우', () => {
    // 120,000원을 4명이서 → 1인당 30,000
    expect(splitBill(120_000, 4)).toEqual({
      perPerson: 30_000,
      myShare: 30_000,
      reimbursedAmount: 90_000,
    });
  });

  it('잔돈이 남으면 결제한 내가 더 부담한다', () => {
    // 340,000 / 3 = 113,333.33… → 1인당 113,333, 남는 1원은 내 몫
    expect(splitBill(340_000, 3)).toEqual({
      perPerson: 113_333,
      myShare: 113_334,
      reimbursedAmount: 226_666,
    });
  });

  it('내 부담 + 돌려받을 금액 = 총액 이 항상 정확히 맞는다', () => {
    // 1인당 금액을 반올림해서 곱하는 방식이면 여기서 어긋난다
    for (let total = 1; total <= 2_000; total += 1) {
      for (let n = 1; n <= 9; n += 1) {
        const { myShare, reimbursedAmount } = splitBill(total, n);
        expect(myShare + reimbursedAmount).toBe(total);
      }
    }
  });

  it('혼자면 전액 내 부담', () => {
    expect(splitBill(45_000, 1)).toEqual({
      perPerson: 45_000,
      myShare: 45_000,
      reimbursedAmount: 0,
    });
  });

  it('총액이 인원보다 적어도 깨지지 않는다', () => {
    expect(splitBill(2, 5)).toEqual({ perPerson: 0, myShare: 2, reimbursedAmount: 0 });
  });

  it('잘못된 입력은 막는다', () => {
    expect(() => splitBill(-1, 3)).toThrow();
    expect(() => splitBill(1_000.5, 3)).toThrow();
    expect(() => splitBill(1_000, 0)).toThrow();
    expect(() => splitBill(1_000, 2.5)).toThrow();
  });
});

describe('데모 정산 3건이 정답과 맞는가', () => {
  it.each(demoSettlements)('$title', (settlement) => {
    const expected = expectedSettlements[settlement.id as keyof typeof expectedSettlements];
    const actual = splitBill(settlement.totalAmount, settlement.headcount);

    expect(actual).toEqual(expected);
    // 저장된 값도 같아야 한다
    expect(settlement.myShare).toBe(expected.myShare);
    expect(settlement.reimbursedAmount).toBe(expected.reimbursedAmount);
  });
});

describe('buildSettlement — 입력 화면에서 저장할 형태로', () => {
  const draft = {
    date: '2026-09-13',
    title: '치킨 모임',
    totalAmount: 45_000,
    headcount: 2,
    payerAccountId: 'acc-card',
    receiverAccountId: 'acc-kakao',
    categoryId: 'cat-food-dining',
    received: true,
  };

  it('인원만 넣으면 금액이 자동으로 채워진다', () => {
    const result = buildSettlement(draft);
    expect(result.myShare).toBe(22_500);
    expect(result.reimbursedAmount).toBe(22_500);
  });

  it('바로 받았으면 결제일이 수령일이 된다', () => {
    expect(buildSettlement(draft).receivedDate).toBe('2026-09-13');
  });

  it('아직 못 받았으면 수령일이 비어 있다', () => {
    expect(buildSettlement({ ...draft, received: false }).receivedDate).toBeUndefined();
  });
});

describe('미수금', () => {
  it('아직 못 받은 정산금만 더한다', () => {
    expect(pendingReceivable(demoSettlements)).toBe(expectedPendingReceivable);
  });
});

describe('validateSettlement', () => {
  it('금액 합이 안 맞으면 잡아낸다', () => {
    const errors = validateSettlement({
      totalAmount: 100_000, myShare: 30_000, reimbursedAmount: 60_000, headcount: 4,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('총액');
  });

  it('정상이면 빈 배열', () => {
    expect(validateSettlement({
      totalAmount: 120_000, myShare: 30_000, reimbursedAmount: 90_000, headcount: 4,
    })).toEqual([]);
  });
});

describe('정산금 입금 (부분 입금 포함)', () => {
  const base = demoSettlements[2]; // 치킨 모임: 돌려받을 22,500, 아직 못 받음

  it('아직 못 받았으면 받은 금액 0, 남은 금액 전부', () => {
    expect(receivedSoFar(base)).toBe(0);
    expect(outstanding(base)).toBe(22_500);
    expect(isPending(base)).toBe(true);
  });

  it('일부만 받으면 그만큼만 쌓인다', () => {
    const after = { ...base, ...applyReceipt(base, 10_000, '2026-09-23') };

    expect(receivedSoFar(after)).toBe(10_000);
    expect(outstanding(after)).toBe(12_500);
    // 아직 다 못 받았으므로 여전히 미수
    expect(isPending(after)).toBe(true);
  });

  it('나눠 받으면 누적된다', () => {
    let s = { ...base, ...applyReceipt(base, 10_000, '2026-09-23') };
    s = { ...s, ...applyReceipt(s, 12_500, '2026-09-25') };

    expect(receivedSoFar(s)).toBe(22_500);
    expect(outstanding(s)).toBe(0);
    expect(isPending(s)).toBe(false);
  });

  it('돌려받을 금액보다 많이 넣어도 넘치지 않는다', () => {
    const after = { ...base, ...applyReceipt(base, 99_999, '2026-09-23') };
    expect(receivedSoFar(after)).toBe(22_500);
    expect(outstanding(after)).toBe(0);
  });

  it('receivedAmount 가 없던 옛 기록은 전액 받은 것으로 본다', () => {
    // 부분 입금을 지원하기 전에 저장된 형태
    const old = demoSettlements[0]; // 팀 회식: receivedDate 있고 receivedAmount 없음
    expect(old.receivedAmount).toBeUndefined();
    expect(receivedSoFar(old)).toBe(90_000);
    expect(outstanding(old)).toBe(0);
  });

  it('미수금 합계는 남은 금액만 센다', () => {
    const partial = { ...base, ...applyReceipt(base, 10_000, '2026-09-23') };
    const list = [demoSettlements[0], demoSettlements[1], partial];

    // 팀 회식·여행은 다 받았고, 치킨은 12,500 남음
    expect(pendingReceivable(list)).toBe(12_500);
  });
});
