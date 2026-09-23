import type { ISODate, Krw, YearMonth } from '@/types';
import { addDays, daysInMonth, todayISO } from './date';

/**
 * 달력 그리드와 지출 농도 계산.
 * 화면에 그리기 전에 필요한 계산만 모아 둔다 (React 의존 없음).
 */

export interface CalendarCell {
  date: ISODate;
  /** 이번 달 날짜인가. 앞뒤 빈칸을 채우는 이웃 달 날짜는 false */
  inMonth: boolean;
  isToday: boolean;
  /** 0=일요일 */
  weekday: number;
}

/**
 * 한 달을 주 단위 격자로 만든다.
 *
 * 앞뒤 빈칸을 null 로 두지 않고 이웃 달 날짜로 채우는 이유:
 * 월말·월초 거래가 어느 주에 걸쳐 있는지 눈으로 이어 보이고,
 * 격자 칸 수가 항상 7의 배수라 레이아웃이 흔들리지 않는다.
 */
export function buildMonthGrid(month: YearMonth, today: ISODate = todayISO()): CalendarCell[][] {
  const firstDate: ISODate = `${month}-01`;
  const lastDay = daysInMonth(month);
  const lastDate: ISODate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const firstWeekday = weekdayIndex(firstDate);
  const lastWeekday = weekdayIndex(lastDate);

  // 첫 주의 일요일까지 뒤로, 마지막 주의 토요일까지 앞으로 늘린다
  const start = addDays(firstDate, -firstWeekday);
  const end = addDays(lastDate, 6 - lastWeekday);

  const cells: CalendarCell[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    cells.push({
      date,
      inMonth: date.startsWith(month),
      isToday: date === today,
      weekday: weekdayIndex(date),
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 0=일 … 6=토. UTC 로만 계산해서 기기 타임존을 타지 않는다 */
export function weekdayIndex(date: ISODate): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * 지출 농도를 나눌 기준점 3개 (사분위).
 *
 * "최댓값의 몇 %"로 나누면 월세 50만원 하나 때문에 나머지가 전부
 * 같은 연한 색이 된다. 그래서 금액이 아니라 **순위**로 나눈다.
 * 지출이 있는 날만 센다 — 0원인 날은 아예 칠하지 않는다.
 */
export function expenseCutoffs(amounts: Krw[]): [Krw, Krw, Krw] {
  const sorted = amounts.filter((a) => a > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0];

  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return [at(0.25), at(0.5), at(0.75)];
}

/** 0 = 지출 없음, 1~4 = 옅음 → 진함 */
export type Intensity = 0 | 1 | 2 | 3 | 4;

export function intensityOf(amount: Krw, cutoffs: [Krw, Krw, Krw]): Intensity {
  if (amount <= 0) return 0;
  if (amount <= cutoffs[0]) return 1;
  if (amount <= cutoffs[1]) return 2;
  if (amount <= cutoffs[2]) return 3;
  return 4;
}
