import type { ISODate, Timestamp, YearMonth } from '@/types';
import { APP } from '@/app.meta';

export const TIME_ZONE = APP.timeZone;

/**
 * 'en-CA' 로케일은 날짜를 'YYYY-MM-DD' 로 출력한다.
 * 이걸 이용해 **서울 기준** 달력 날짜를 얻는다.
 * 폰 타임존이 뉴욕이어도 한국 날짜가 나온다.
 */
const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 지금 서울은 며칠인가 → '2026-09-21' */
export function todayISO(now: Date = new Date()): ISODate {
  return seoulDateFormatter.format(now);
}

/** 기록용 시각 (UTC) */
export function nowTimestamp(now: Date = new Date()): Timestamp {
  return now.toISOString();
}

/** '2026-09-21' → '2026-09' */
export function monthOf(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

/** 지금 서울 기준 이번 달 */
export function currentMonth(now: Date = new Date()): YearMonth {
  return monthOf(todayISO(now));
}

/** '2026-09-21' → 21 */
export function dayOf(date: ISODate): number {
  return Number(date.slice(8, 10));
}

export function isInMonth(date: ISODate, month: YearMonth): boolean {
  return date.startsWith(month);
}

/**
 * 월 문자열 덧셈. Date 객체를 거치지 않으므로 타임존 영향이 없다.
 * addMonths('2026-01', -1) → '2025-12'
 */
export function addMonths(month: YearMonth, delta: number): YearMonth {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  // 1~12 를 0~11 로 옮겨서 계산해야 음수 나머지 문제가 안 생긴다
  const total = year * 12 + (m - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/** 해당 월의 일수. 2026-02 → 28 */
export function daysInMonth(month: YearMonth): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  // Date.UTC 의 day 0 은 "전달의 마지막 날"이다
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** 월의 첫날/마지막날 */
export function monthRange(month: YearMonth): { start: ISODate; end: ISODate } {
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
  };
}

/**
 * 최근 n개월 목록을 오래된 순으로.
 * lastNMonths('2026-09', 3) → ['2026-07', '2026-08', '2026-09']
 */
export function lastNMonths(month: YearMonth, n: number): YearMonth[] {
  return Array.from({ length: n }, (_, i) => addMonths(month, i - (n - 1)));
}

/**
 * 반복 거래용 — 그 달에 없는 날짜는 말일로 당긴다.
 * clampDayOfMonth('2026-02', 31) → '2026-02-28'
 */
export function clampDayOfMonth(month: YearMonth, day: number): ISODate {
  const last = daysInMonth(month);
  const clamped = Math.min(Math.max(Math.trunc(day), 1), last);
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

/** 날짜 문자열은 사전순 = 시간순이라 그냥 비교하면 된다 */
export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 두 날짜 사이(양끝 포함)인지 */
export function isBetween(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** '2026-09-21' → '9월 21일' */
export function formatKoreanDate(date: ISODate): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

/** '2026-09' → '2026년 9월' */
export function formatKoreanMonth(month: YearMonth): string {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-09-21' → '월' (서울 기준) */
export function weekdayKo(date: ISODate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const seoulDateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * 시세 기준 시각 표시용.
 * '2026-09-20T06:30:00.000Z' → '9월 20일 15:30'
 */
export function formatQuoteTime(timestamp: Timestamp): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '—';
  return seoulDateTimeFormatter.format(d);
}

/** 시세가 오래됐는지 (기본 24시간) */
export function isStale(timestamp: Timestamp, maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()): boolean {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > maxAgeMs;
}

/**
 * 날짜 더하기. Date 를 UTC 로만 다뤄서 타임존 영향을 받지 않는다.
 * addDays('2026-03-01', -1) → '2026-02-28'
 */
export function addDays(date: ISODate, days: number): ISODate {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));

  return [
    String(shifted.getUTCFullYear()).padStart(4, '0'),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
