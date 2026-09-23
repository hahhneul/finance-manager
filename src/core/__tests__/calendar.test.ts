import { describe, expect, it } from 'vitest';
import { buildMonthGrid, dayNet, expenseCutoffs, intensityOf, weekdayIndex } from '../calendar';
import {
  CATEGORICAL,
  SEQUENTIAL_BLUE,
  SEQUENTIAL_RED,
  categoryColorMap,
  dayColor,
  intensityColor,
} from '../chartColors';
import { formatKrwNumber } from '../money';
import { dailyExpenseTotals } from '../transactions';
import { demoCategories, demoLedger } from '@/demo/demoData';

describe('달력 격자', () => {
  // 2026년 9월 1일은 화요일, 30일은 수요일
  const weeks = buildMonthGrid('2026-09', '2026-09-21');

  it('항상 7칸짜리 주로 나뉜다', () => {
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('첫 칸은 일요일이다', () => {
    expect(weeks[0][0].weekday).toBe(0);
  });

  it('앞뒤 빈칸은 이웃 달 날짜로 채운다', () => {
    // 9월 1일이 화요일 → 앞에 8월 30일(일), 31일(월)
    expect(weeks[0][0].date).toBe('2026-08-30');
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][2].date).toBe('2026-09-01');
    expect(weeks[0][2].inMonth).toBe(true);
  });

  it('마지막 주는 토요일로 끝난다', () => {
    const last = weeks[weeks.length - 1];
    expect(last[6].weekday).toBe(6);
    // 9월 30일이 수요일 → 뒤에 10월 1~3일
    expect(last[6].date).toBe('2026-10-03');
  });

  it('이번 달 날짜가 30개다', () => {
    const inMonth = weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
  });

  it('오늘을 표시한다', () => {
    const today = weeks.flat().filter((c) => c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0].date).toBe('2026-09-21');
  });

  it('1일이 일요일인 달도 앞 칸을 만들지 않는다', () => {
    // 2026년 2월 1일은 일요일
    const feb = buildMonthGrid('2026-02', '2026-02-01');
    expect(feb[0][0].date).toBe('2026-02-01');
    expect(feb[0][0].inMonth).toBe(true);
  });

  it('윤년 2월도 맞는다', () => {
    const feb = buildMonthGrid('2028-02', '2028-02-01');
    expect(feb.flat().filter((c) => c.inMonth)).toHaveLength(29);
  });
});

describe('weekdayIndex', () => {
  it('일요일이 0', () => {
    expect(weekdayIndex('2026-09-20')).toBe(0);
    expect(weekdayIndex('2026-09-21')).toBe(1);
    expect(weekdayIndex('2026-09-26')).toBe(6);
  });
});

describe('지출 농도', () => {
  it('금액이 아니라 순위로 나눈다', () => {
    // 월세 50만원 하나 때문에 나머지가 전부 1단계가 되면 안 된다
    const amounts = [5_000, 10_000, 20_000, 40_000, 500_000];
    const cuts = expenseCutoffs(amounts);

    expect(intensityOf(5_000, cuts)).toBe(1);
    expect(intensityOf(500_000, cuts)).toBe(4);
    // 중간값들이 서로 다른 단계로 흩어진다
    const middle = [10_000, 20_000, 40_000].map((a) => intensityOf(a, cuts));
    expect(new Set(middle).size).toBeGreaterThan(1);
  });

  it('지출이 없는 날은 0단계', () => {
    const cuts = expenseCutoffs([10_000, 20_000]);
    expect(intensityOf(0, cuts)).toBe(0);
    expect(intensityColor(0)).toBeUndefined();
  });

  it('0원인 날은 기준점 계산에서 빼고 센다', () => {
    expect(expenseCutoffs([0, 0, 0, 10_000])).toEqual([10_000, 10_000, 10_000]);
  });

  it('빈 달도 깨지지 않는다', () => {
    expect(expenseCutoffs([])).toEqual([0, 0, 0]);
    expect(intensityOf(0, [0, 0, 0])).toBe(0);
  });

  it('실제 9월 데이터로 4단계가 모두 쓰인다', () => {
    const totals = [...dailyExpenseTotals(demoLedger, '2026-09').values()];
    const cuts = expenseCutoffs(totals);
    const levels = new Set(totals.map((t) => intensityOf(t, cuts)));

    expect(levels.size).toBe(4);
    // 월세 낸 9월 1일이 가장 진하다
    expect(intensityOf(500_000, cuts)).toBe(4);
  });
});

describe('카테고리 색', () => {
  const map = categoryColorMap(demoCategories, 'expense');

  it('대분류에 순서대로 색이 붙는다', () => {
    expect(map.get('cat-food')).toBe(CATEGORICAL[0]);
    expect(map.get('cat-transport')).toBe(CATEGORICAL[1]);
  });

  it('소분류는 대분류 색을 물려받는다', () => {
    expect(map.get('cat-food-cafe')).toBe(map.get('cat-food'));
    expect(map.get('cat-food-dining')).toBe(map.get('cat-food'));
  });

  it('금액이 아니라 카테고리 자체에 색이 묶인다', () => {
    // 지출 순위가 달마다 바뀌어도 식비는 항상 같은 색이어야
    // 지난달 차트와 이번달 차트를 비교할 수 있다
    const shuffled = [...demoCategories].reverse();
    expect(categoryColorMap(shuffled, 'expense').get('cat-food')).toBe(map.get('cat-food'));
  });

  it('수입 카테고리는 따로 번호를 매긴다', () => {
    const income = categoryColorMap(demoCategories, 'income');
    expect(income.get('cat-salary')).toBe(CATEGORICAL[0]);
    expect(income.get('cat-food')).toBeUndefined();
  });
});

describe('하루의 방향과 크기', () => {
  it('지출이 많으면 빨강 쪽', () => {
    // 월세 낸 날: 지출 500,000, 수입 0
    expect(dayNet({ income: 0, expense: 500_000 })).toEqual({
      direction: 'spent', magnitude: 500_000, empty: false,
    });
  });

  it('수입이 많으면 파랑 쪽', () => {
    // 월급날: 수입 2,000,000, 지출 0
    expect(dayNet({ income: 2_000_000, expense: 0 })).toEqual({
      direction: 'earned', magnitude: 2_000_000, empty: false,
    });
  });

  it('둘 다 있으면 차이만 남는다', () => {
    // 용돈 300,000 받고 5,500 쓴 날
    expect(dayNet({ income: 300_000, expense: 5_500 })).toEqual({
      direction: 'earned', magnitude: 294_500, empty: false,
    });
  });

  it('같으면 어느 쪽도 아니다', () => {
    expect(dayNet({ income: 50_000, expense: 50_000 })).toEqual({
      direction: 'even', magnitude: 0, empty: false,
    });
  });

  it('기록이 없는 날은 비어 있다고 알려준다', () => {
    expect(dayNet({ income: 0, expense: 0 }).empty).toBe(true);
  });
});

describe('방향별 칸 색', () => {
  it('지출이 많은 날은 빨강 계열', () => {
    expect(dayColor('spent', 1)).toBe(SEQUENTIAL_RED[0]);
    expect(dayColor('spent', 4)).toBe(SEQUENTIAL_RED[3]);
  });

  it('수입이 많은 날은 파랑 계열', () => {
    expect(dayColor('earned', 1)).toBe(SEQUENTIAL_BLUE[0]);
    expect(dayColor('earned', 4)).toBe(SEQUENTIAL_BLUE[3]);
  });

  it('기록이 없거나 수입=지출이면 칠하지 않는다', () => {
    expect(dayColor('spent', 0)).toBeUndefined();
    expect(dayColor('even', 3)).toBeUndefined();
  });

  it('빨강과 파랑은 같은 단계 수를 갖는다', () => {
    expect(SEQUENTIAL_RED).toHaveLength(SEQUENTIAL_BLUE.length);
  });
});

describe('숫자 그대로 표시', () => {
  it('만 단위로 줄이지 않는다', () => {
    expect(formatKrwNumber(38_000)).toBe('38,000');
    expect(formatKrwNumber(500_000)).toBe('500,000');
    expect(formatKrwNumber(2_000_000)).toBe('2,000,000');
  });

  it('부호 없이 크기만', () => {
    expect(formatKrwNumber(-38_000)).toBe('38,000');
  });
});
