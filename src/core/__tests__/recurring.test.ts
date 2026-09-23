import { describe, expect, it } from 'vitest';
import {
  alreadyRecorded,
  describeSchedule,
  dueDates,
  nextOccurrence,
  occurrences,
  pendingOccurrences,
  toTransaction,
} from '../recurring';
import { demoRecurring, demoTransactions } from '@/demo/demoData';
import type { RecurringTransaction } from '@/types';

const rent = demoRecurring.find((r) => r.id === 'rec-rent')!;
const netflix = demoRecurring.find((r) => r.id === 'rec-netflix')!;

describe('매월 반복', () => {
  it('시작일부터 기준일까지 매달 하루씩', () => {
    expect(occurrences(rent, '2026-09-22')).toEqual([
      '2026-07-01', '2026-08-01', '2026-09-01',
    ]);
  });

  it('그 달에 없는 날짜는 말일로 당긴다', () => {
    const r: RecurringTransaction = {
      ...rent, id: 'x', dayOfMonth: 31, startDate: '2026-01-31',
      lastGeneratedDate: undefined,
    };
    expect(occurrences(r, '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('윤년 2월도 맞는다', () => {
    const r: RecurringTransaction = {
      ...rent, id: 'x', dayOfMonth: 30, startDate: '2028-01-30',
      lastGeneratedDate: undefined,
    };
    expect(occurrences(r, '2028-02-29')).toEqual(['2028-01-30', '2028-02-29']);
  });

  it('종료일 뒤로는 만들지 않는다', () => {
    const r: RecurringTransaction = { ...rent, id: 'x', endDate: '2026-08-15', lastGeneratedDate: undefined };
    expect(occurrences(r, '2026-09-22')).toEqual(['2026-07-01', '2026-08-01']);
  });
});

describe('매주 · 매년 반복', () => {
  it('매주 — 시작일 이후 첫 해당 요일부터 7일씩', () => {
    // 2026-09-01 은 화요일. 매주 금요일(5) 이면 9/4 부터
    const r: RecurringTransaction = {
      ...rent, id: 'w', freq: 'weekly', weekday: 5,
      startDate: '2026-09-01', lastGeneratedDate: undefined,
    };
    expect(occurrences(r, '2026-09-22')).toEqual([
      '2026-09-04', '2026-09-11', '2026-09-18',
    ]);
  });

  it('시작일이 바로 해당 요일이면 그날부터', () => {
    const r: RecurringTransaction = {
      ...rent, id: 'w', freq: 'weekly', weekday: 2,
      startDate: '2026-09-01', lastGeneratedDate: undefined,
    };
    expect(occurrences(r, '2026-09-15')[0]).toBe('2026-09-01');
  });

  it('매년 — 시작일의 월·일을 해마다', () => {
    const r: RecurringTransaction = {
      ...rent, id: 'y', freq: 'yearly',
      startDate: '2024-03-15', lastGeneratedDate: undefined,
    };
    expect(occurrences(r, '2026-09-22')).toEqual([
      '2024-03-15', '2025-03-15', '2026-03-15',
    ]);
  });
});

describe('아직 기록하지 않은 것만', () => {
  it('마지막 기록일 이후만 센다', () => {
    // 월세는 9/1 까지 기록돼 있다
    expect(dueDates(rent, '2026-09-22')).toEqual([]);
    expect(dueDates(rent, '2026-10-05')).toEqual(['2026-10-01']);
  });

  it('두 달 만에 열면 밀린 것이 모두 잡힌다', () => {
    expect(dueDates(rent, '2026-11-20')).toEqual(['2026-10-01', '2026-11-01']);
  });

  it('기록한 적이 없으면 시작일부터 전부', () => {
    const fresh: RecurringTransaction = { ...rent, lastGeneratedDate: undefined };
    expect(dueDates(fresh, '2026-09-22')).toHaveLength(3);
  });

  it('꺼진 규칙은 만들지 않는다', () => {
    expect(dueDates({ ...rent, enabled: false }, '2026-11-20')).toEqual([]);
  });
});

describe('여러 반복 거래를 한 번에', () => {
  it('날짜순으로 모은다', () => {
    const pending = pendingOccurrences(demoRecurring, '2026-11-20');

    expect(pending.map((p) => `${p.date} ${p.recurring.name}`)).toEqual([
      '2026-10-01 월세',
      '2026-10-10 넷플릭스',
      '2026-11-01 월세',
      '2026-11-10 넷플릭스',
    ]);
  });

  it('기록할 것이 없으면 빈 배열', () => {
    expect(pendingOccurrences(demoRecurring, '2026-09-22')).toEqual([]);
  });
});

describe('거래로 바꾸기', () => {
  it('틀의 내용에 날짜와 출처를 붙인다', () => {
    const tx = toTransaction({ recurring: rent, date: '2026-10-01' });

    expect(tx.date).toBe('2026-10-01');
    expect(tx.amount).toBe(500_000);
    expect(tx.accountId).toBe('acc-shinhan');
    expect(tx.categoryId).toBe('cat-home-rent');
    // 어느 반복 거래에서 나왔는지 남긴다 (나중에 되돌리거나 셀 때 쓴다)
    expect(tx.recurringId).toBe('rec-rent');
  });
});

describe('다음 예정일', () => {
  it('오늘 이후 첫 발생일', () => {
    expect(nextOccurrence(rent, '2026-09-22')).toBe('2026-10-01');
    expect(nextOccurrence(netflix, '2026-09-22')).toBe('2026-10-10');
  });

  it('그날 당일이면 다음 달로 넘어간다', () => {
    expect(nextOccurrence(rent, '2026-10-01')).toBe('2026-11-01');
  });

  it('꺼진 규칙은 없다', () => {
    expect(nextOccurrence({ ...rent, enabled: false }, '2026-09-22')).toBeNull();
  });

  it('끝난 규칙은 없다', () => {
    expect(nextOccurrence({ ...rent, endDate: '2026-09-30' }, '2026-09-22')).toBeNull();
  });
});

describe('사람이 읽는 주기', () => {
  it.each([
    [rent, '매월 1일'],
    [netflix, '매월 10일'],
  ])('%#', (r, expected) => {
    expect(describeSchedule(r)).toBe(expected);
  });

  it('매주 · 매년', () => {
    expect(describeSchedule({ ...rent, freq: 'weekly', weekday: 1 })).toBe('매주 월요일');
    expect(describeSchedule({ ...rent, freq: 'yearly', startDate: '2026-03-15' })).toBe(
      '매년 3월 15일',
    );
  });
});

describe('중복 기록 방지', () => {
  it('같은 반복 거래의 같은 날짜가 이미 있으면 알아낸다', () => {
    const recorded = [
      { ...demoTransactions[0], id: 'r1', recurringId: 'rec-rent', date: '2026-10-01' },
    ];
    expect(alreadyRecorded(recorded, 'rec-rent', '2026-10-01')).toBe(true);
    expect(alreadyRecorded(recorded, 'rec-rent', '2026-11-01')).toBe(false);
  });
});
