import { describe, expect, it } from 'vitest';
import {
  formatFxRate,
  formatKrw,
  formatKrwCompact,
  formatPercentSigned,
  formatUsd,
  isValidKrw,
  toKrw,
} from '../money';

describe('toKrw — 원화 반올림', () => {
  it('0.5 는 올린다', () => {
    expect(toKrw(1234.5)).toBe(1235);
  });

  it('음수도 0 을 기준으로 대칭이다', () => {
    // Math.round(-0.5) 는 -0 을 주지만, 손실 -1 원은 -1 로 나와야 한다
    expect(toKrw(-1234.5)).toBe(-1235);
    expect(toKrw(-0.5)).toBe(-1);
    expect(toKrw(0.5)).toBe(1);
  });

  it('이미 정수면 그대로', () => {
    expect(toKrw(12_340)).toBe(12_340);
  });

  it('NaN·Infinity 는 0 으로 막는다', () => {
    expect(toKrw(NaN)).toBe(0);
    expect(toKrw(Infinity)).toBe(0);
  });
});

describe('isValidKrw', () => {
  it('정수만 통과한다', () => {
    expect(isValidKrw(12_340)).toBe(true);
    expect(isValidKrw(12_340.5)).toBe(false);
    expect(isValidKrw('12340')).toBe(false);
  });
});

describe('표시 형식', () => {
  it('원화는 12,340원 형식', () => {
    expect(formatKrw(12_340)).toBe('12,340원');
    expect(formatKrw(0)).toBe('0원');
    expect(formatKrw(-717_000)).toBe('-717,000원');
  });

  it('달러는 소수 둘째 자리까지', () => {
    expect(formatUsd(180.16666)).toBe('$180.17');
  });

  it('축약 표기', () => {
    expect(formatKrwCompact(1_234_000)).toBe('123만');
    expect(formatKrwCompact(123_400_000)).toBe('1.2억');
    expect(formatKrwCompact(5_600)).toBe('5,600');
  });

  it('수익률은 부호를 붙인다', () => {
    expect(formatPercentSigned(0.171)).toBe('+17.10%');
    expect(formatPercentSigned(-0.0125)).toBe('-1.25%');
  });
});

describe('환율 표시', () => {
  it('소수점 둘째 자리까지', () => {
    expect(formatFxRate(1375.642214)).toBe('1,375.64원');
    expect(formatFxRate(1350)).toBe('1,350.00원');
  });
});
