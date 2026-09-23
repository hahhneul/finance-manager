import { describe, expect, it } from 'vitest';
import {
  addMonths,
  clampDayOfMonth,
  currentMonth,
  daysInMonth,
  lastNMonths,
  monthOf,
  monthRange,
  todayISO,
  weekdayKo,
} from '../date';

describe('todayISO — Asia/Seoul 기준', () => {
  it('UTC 로 전날 15:00 이후면 서울은 이미 다음 날이다', () => {
    // 2026-09-20T15:00Z = 2026-09-21 00:00 KST
    expect(todayISO(new Date('2026-09-20T15:00:00Z'))).toBe('2026-09-21');
  });

  it('UTC 로 같은 날 14:59 면 서울은 아직 그날이다', () => {
    expect(todayISO(new Date('2026-09-20T14:59:00Z'))).toBe('2026-09-20');
  });

  it('연말에도 밀리지 않는다', () => {
    expect(todayISO(new Date('2025-12-31T15:30:00Z'))).toBe('2026-01-01');
  });

  it('currentMonth 도 서울 기준', () => {
    expect(currentMonth(new Date('2026-09-30T15:00:00Z'))).toBe('2026-10');
  });
});

describe('월 계산', () => {
  it('monthOf', () => {
    expect(monthOf('2026-09-21')).toBe('2026-09');
  });

  it('addMonths 는 연도를 넘어간다', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-09', -14)).toBe('2025-07');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('daysInMonth 는 윤년을 안다', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('monthRange', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('lastNMonths 는 오래된 순으로', () => {
    expect(lastNMonths('2026-09', 3)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(lastNMonths('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('clampDayOfMonth 는 없는 날짜를 말일로 당긴다', () => {
    // 매달 31일 자동이체를 2월에 적용하면
    expect(clampDayOfMonth('2026-02', 31)).toBe('2026-02-28');
    expect(clampDayOfMonth('2026-09', 31)).toBe('2026-09-30');
    expect(clampDayOfMonth('2026-09', 15)).toBe('2026-09-15');
  });

  it('weekdayKo', () => {
    expect(weekdayKo('2026-09-21')).toBe('월');
    expect(weekdayKo('2026-09-20')).toBe('일');
  });
});
