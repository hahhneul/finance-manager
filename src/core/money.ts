import type { Dec, Krw } from '@/types';

/**
 * 원화 반올림. **이 함수 밖에서는 절대 반올림하지 않는다.**
 *
 * 달러 평가액처럼 소수가 섞인 계산은 끝까지 소수로 끌고 가다가,
 * 화면에 보여주기 직전에 여기서 한 번만 정수로 만든다.
 *
 * Math.round 는 -0.5 를 -0 으로 올려버려서 손실 금액의 부호가 어긋난다.
 * 그래서 0 을 기준으로 대칭이 되도록 직접 처리한다.
 */
export function toKrw(value: number): Krw {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** 정수 원화인지 확인 (저장 직전 검증용) */
export function isValidKrw(value: unknown): value is Krw {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

const krwFormatter = new Intl.NumberFormat('ko-KR');

/** 12340 → '12,340원' */
export function formatKrw(value: Krw): string {
  return `${krwFormatter.format(value)}원`;
}

/** 12340 → '+12,340원' / -12340 → '-12,340원' */
export function formatKrwSigned(value: Krw): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${krwFormatter.format(value)}원`;
}

/**
 * 단위 없이 숫자만. 38000 → '38,000'
 * 달력처럼 칸이 좁아도 축약하지 않고 실제 금액을 보여야 할 때 쓴다.
 */
export function formatKrwNumber(value: Krw): string {
  return krwFormatter.format(Math.abs(value));
}

/** 부호 없이 금액만. 신용카드 "갚을 돈" 처럼 부호를 따로 설명할 때 */
export function formatKrwAbs(value: Krw): string {
  return `${krwFormatter.format(Math.abs(value))}원`;
}

/**
 * 좁은 화면용 축약 표기.
 *
 * 만 단위를 버림하면 38,000원이 '3만'이 되어 실제보다 훨씬 적어 보인다.
 * 그래서 10만원 미만은 소수 첫째 자리를 살린다.
 *
 *   5,500 → '5,500'   38,000 → '3.8만'   123,000 → '12만'
 *   1,234,000 → '123만'   123,400,000 → '1.2억'
 */
export function formatKrwCompact(value: Krw): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`;
  }

  if (abs >= 100_000) {
    // 10만원 이상은 만 단위만으로도 크기가 충분히 읽힌다
    return `${sign}${krwFormatter.format(Math.floor(abs / 10_000))}만`;
  }

  if (abs >= 10_000) {
    // 1만~10만 구간에서 버림하면 오차가 커 보인다 (38,000 → '3만')
    return `${sign}${(abs / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  }

  return `${sign}${krwFormatter.format(abs)}`;
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 180.16666 → '$180.17' */
export function formatUsd(value: Dec): string {
  return `$${usdFormatter.format(value)}`;
}

/** 통화에 맞춰 표기 */
export function formatMoney(value: Dec, currency: 'KRW' | 'USD'): string {
  return currency === 'USD' ? formatUsd(value) : formatKrw(toKrw(value));
}

/** 소수 주식 수량. 3 → '3', 1.5 → '1.5' */
export function formatQuantity(value: Dec): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 8 }).format(value);
}

/**
 * 비율을 퍼센트 문자열로. 0.1710 → '+17.10%'
 * 수익률처럼 부호가 의미 있는 값에 쓴다.
 */
export function formatPercentSigned(ratio: Dec, digits = 2): string {
  if (!Number.isFinite(ratio)) return '—';
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(digits)}%`;
}

/** 0.325 → '32.5%' (예산 사용률처럼 부호가 없는 값) */
export function formatPercent(ratio: Dec, digits = 1): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/**
 * 환율 표시. 1375.642214 → '1,375.64원'
 * 소수점 셋째 자리까지 보여줄 이유가 없다 (원화 환산은 어차피 정수로 반올림된다).
 */
export function formatFxRate(rate: Dec): string {
  return `${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate)}원`;
}
