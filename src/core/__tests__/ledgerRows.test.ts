import { describe, expect, it } from 'vitest';
import { filterRows, groupRowsByDate, ledgerRows, rowStatsAmount } from '../transactions';
import { demoLedger } from '@/demo/demoData';

const rows = ledgerRows(demoLedger);

describe('목록에 뿌릴 줄', () => {
  it('거래 46건 + 정산 3건', () => {
    expect(rows).toHaveLength(49);
  });

  it('이체도 목록에는 보인다 (통계에서만 빠진다)', () => {
    const transfers = rows.filter((r) => r.transaction?.type === 'transfer');
    expect(transfers).toHaveLength(2);
  });

  it('최근 날짜가 위로', () => {
    expect(rows[0].date).toBe('2026-09-20');
    expect(rows[rows.length - 1].date).toBe('2026-07-01');
  });
});

describe('한 줄이 통계에 기여하는 금액', () => {
  it('이체는 0', () => {
    const transfer = rows.find((r) => r.transaction?.type === 'transfer')!;
    expect(rowStatsAmount(transfer)).toEqual({ flow: null, amount: 0 });
  });

  it('정산은 총액이 아니라 내 몫', () => {
    const settlement = rows.find((r) => r.id === 'stl-1')!;
    // 결제는 120,000원이지만 4명이라 지출은 30,000원
    expect(settlement.settlement!.totalAmount).toBe(120_000);
    expect(rowStatsAmount(settlement)).toEqual({ flow: 'expense', amount: 30_000 });
  });
});

describe('날짜별 묶기', () => {
  const septemberRows = rows.filter((r) => r.date.startsWith('2026-09'));
  const groups = groupRowsByDate(septemberRows);

  it('같은 날은 한 묶음', () => {
    const sep13 = groups.find((g) => g.date === '2026-09-13')!;
    expect(sep13.rows).toHaveLength(1);
    expect(sep13.expense).toBe(22_500);
  });

  it('일일 합계를 모두 더하면 월 지출이 된다', () => {
    expect(groups.reduce((s, g) => s + g.expense, 0)).toBe(760_500);
  });

  it('이체가 있는 날도 지출에 안 잡힌다', () => {
    const augustGroups = groupRowsByDate(rows.filter((r) => r.date === '2026-08-01'));
    // 월세 500,000 + 증권계좌 이체 800,000 이 있지만 지출은 월세만
    expect(augustGroups[0].rows).toHaveLength(2);
    expect(augustGroups[0].expense).toBe(500_000);
  });
});

describe('필터는 정산에도 적용된다', () => {
  it('제목·메모로 검색된다 — 거래와 정산을 함께 훑는다', () => {
    const result = filterRows(rows, { query: '치킨' });

    // 거래 '배달의민족 치킨'(8/3) + 정산 '치킨 모임'(9/13)
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.kind).sort()).toEqual(['settlement', 'transaction']);
  });

  it('정산 제목만으로도 찾아진다', () => {
    const result = filterRows(rows, { query: '여행 숙소' });
    expect(result).toHaveLength(1);
    expect(result[0].settlement?.totalAmount).toBe(340_000);
  });

  it('계좌 필터는 결제 계좌와 정산 계좌 양쪽에 걸린다', () => {
    const kakao = filterRows(rows, { accountIds: ['acc-kakao'] });
    // 카카오뱅크는 정산 받는 계좌로만 쓰였다 → 정산 3건
    expect(kakao).toHaveLength(3);
    expect(kakao.every((r) => r.kind === 'settlement')).toBe(true);
  });

  it('태그 필터', () => {
    expect(filterRows(rows, { tags: ['정산'] })).toHaveLength(3);
  });

  it('월 필터', () => {
    expect(filterRows(rows, { month: '2026-09' })).toHaveLength(14);
  });
});
