import type { ID, ISODate, RecurringTransaction, Transaction } from '@/types';
import { addDays, addMonths, clampDayOfMonth, monthOf } from './date';
import { weekdayIndex } from './calendar';

/**
 * 반복 거래의 발생일 계산.
 *
 * 앱을 두 달 만에 열어도 그동안 밀린 월세가 모두 잡혀야 한다.
 * 그래서 "다음 한 건"이 아니라 **마지막으로 기록한 날 이후 오늘까지 전부**를 구한다.
 */

/** 한 번에 만들 수 있는 최대 건수. 시작일을 잘못 넣어도 폭주하지 않게 */
const MAX_OCCURRENCES = 120;

/**
 * 규칙이 만들어내는 모든 발생일 (시작일부터 기준일까지).
 * 이미 기록했는지는 보지 않는다 — dueDates() 가 그걸 걸러낸다.
 */
export function occurrences(recurring: RecurringTransaction, until: ISODate): ISODate[] {
  const { freq, startDate, endDate } = recurring;
  const last = endDate && endDate < until ? endDate : until;
  if (startDate > last) return [];

  const dates: ISODate[] = [];

  if (freq === 'monthly') {
    const day = recurring.dayOfMonth ?? Number(startDate.slice(8, 10));

    let month = monthOf(startDate);
    while (month <= monthOf(last) && dates.length < MAX_OCCURRENCES) {
      // 31일짜리 규칙을 2월에 적용하면 말일로 당긴다
      const date = clampDayOfMonth(month, day);
      if (date >= startDate && date <= last) dates.push(date);
      month = addMonths(month, 1);
    }

    return dates;
  }

  if (freq === 'weekly') {
    const weekday = recurring.weekday ?? weekdayIndex(startDate);

    // 시작일 이후 첫 번째 해당 요일
    let date = startDate;
    const shift = (weekday - weekdayIndex(startDate) + 7) % 7;
    date = addDays(startDate, shift);

    while (date <= last && dates.length < MAX_OCCURRENCES) {
      dates.push(date);
      date = addDays(date, 7);
    }

    return dates;
  }

  // yearly — 시작일의 월·일을 해마다
  const monthDay = startDate.slice(5);
  let year = Number(startDate.slice(0, 4));

  while (dates.length < MAX_OCCURRENCES) {
    const date: ISODate = `${year}-${monthDay}`;
    if (date > last) break;
    if (date >= startDate) dates.push(date);
    year += 1;
  }

  return dates;
}

/**
 * 아직 기록하지 않은 발생일.
 * lastGeneratedDate 다음부터 센다.
 */
export function dueDates(recurring: RecurringTransaction, today: ISODate): ISODate[] {
  if (!recurring.enabled) return [];

  const since = recurring.lastGeneratedDate;
  return occurrences(recurring, today).filter((date) => !since || date > since);
}

export interface PendingOccurrence {
  recurring: RecurringTransaction;
  date: ISODate;
}

/** 모든 반복 거래에서 기록할 것들을 날짜순으로 모은다 */
export function pendingOccurrences(
  recurrings: RecurringTransaction[],
  today: ISODate,
): PendingOccurrence[] {
  return recurrings
    .flatMap((recurring) => dueDates(recurring, today).map((date) => ({ recurring, date })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 발생일 하나를 실제 거래 모양으로 */
export function toTransaction(
  occurrence: PendingOccurrence,
): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  const { recurring, date } = occurrence;
  return { ...recurring.template, date, recurringId: recurring.id };
}

/** 다음 발생 예정일 (목록 화면에 "다음: 10월 1일" 표시용) */
export function nextOccurrence(
  recurring: RecurringTransaction,
  today: ISODate,
): ISODate | null {
  if (!recurring.enabled) return null;

  // 오늘 이후 1년 안에서 찾는다
  const horizon: ISODate = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const future = occurrences(recurring, horizon).filter((date) => date > today);

  return future[0] ?? null;
}

/** 반복 주기를 사람이 읽는 말로 */
export function describeSchedule(recurring: RecurringTransaction): string {
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  switch (recurring.freq) {
    case 'monthly':
      return `매월 ${recurring.dayOfMonth ?? Number(recurring.startDate.slice(8, 10))}일`;
    case 'weekly': {
      const weekday = recurring.weekday ?? weekdayIndex(recurring.startDate);
      return `매주 ${WEEKDAYS[weekday]}요일`;
    }
    case 'yearly':
      return `매년 ${Number(recurring.startDate.slice(5, 7))}월 ${Number(recurring.startDate.slice(8, 10))}일`;
  }
}

/** 이미 만들어진 거래인지 (중복 기록 방지용 보조 검사) */
export function alreadyRecorded(
  transactions: Transaction[],
  recurringId: ID,
  date: ISODate,
): boolean {
  return transactions.some((tx) => tx.recurringId === recurringId && tx.date === date);
}
