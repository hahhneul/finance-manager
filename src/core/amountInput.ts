import type { Krw } from '@/types';

/**
 * 금액 입력칸의 글자를 원화 정수로 해석한다.
 *
 * 전에는 입력할 때마다 `replace(/[^0-9]/g, '')` 로 숫자가 아닌 글자를 지웠다.
 * 그러면 사용자가 모르는 사이에 값이 **다른 금액으로 바뀐다.**
 *
 *   '1.5'   → '15'    →     15원   (10배)
 *   '100.5' → '1005'  →  1,005원   (10배)
 *   '-100'  → '100'   →    100원   (부호가 사라짐)
 *
 * 그래서 두 가지를 갈라 놓는다.
 *  - **정리**: 쉼표·공백처럼 의미 없는 글자는 조용히 없앤다 ('1,500' 은 1500 이 맞다)
 *  - **검증**: 소수점·부호·글자가 섞였으면 지우지 말고 **오류로 알린다**
 */

/** 1조원. 실수로 길게 눌렀을 때를 막는다 */
export const MAX_KRW = 1_000_000_000_000;

export interface AmountParse {
  /** 해석된 금액. 오류가 있거나 비었으면 0 */
  value: Krw;
  /** 사용자에게 보여줄 오류. 없으면 null */
  error: string | null;
  /** 아직 아무것도 안 쳤는가 (오류로 다그치지 않기 위해) */
  empty: boolean;
}

/** 쉼표와 공백만 없앤다. 나머지는 그대로 둬서 검증이 볼 수 있게 한다 */
function normalize(raw: string): string {
  return raw.replace(/[,\s]/g, '');
}

export function parseKrwInput(raw: string): AmountParse {
  const text = normalize(raw);

  if (text === '') return { value: 0, error: null, empty: true };

  if (text.includes('-') || text.includes('−')) {
    return {
      value: 0,
      empty: false,
      error: '금액은 음수로 넣을 수 없습니다. 수입인지 지출인지는 위에서 고릅니다.',
    };
  }

  if (text.includes('.')) {
    return {
      value: 0,
      empty: false,
      error: '원 단위로만 넣을 수 있습니다. 소수점은 쓸 수 없습니다.',
    };
  }

  if (!/^\d+$/.test(text)) {
    return { value: 0, empty: false, error: '숫자만 넣을 수 있습니다.' };
  }

  const value = Number(text);

  if (!Number.isSafeInteger(value)) {
    return { value: 0, empty: false, error: '금액이 너무 큽니다.' };
  }
  if (value > MAX_KRW) {
    return { value: 0, empty: false, error: '1조원을 넘는 금액은 넣을 수 없습니다.' };
  }

  return { value, error: null, empty: false };
}

/**
 * 저장할 수 있는 상태인지.
 * 0원도 막는다 — 금액이 0인 거래는 기록할 이유가 없다.
 */
export function validateAmount(raw: string): { value: Krw; error: string | null } {
  const parsed = parseKrwInput(raw);

  if (parsed.error) return { value: 0, error: parsed.error };
  if (parsed.empty) return { value: 0, error: '금액을 넣어 주세요.' };
  if (parsed.value <= 0) return { value: 0, error: '금액은 0원보다 커야 합니다.' };

  return { value: parsed.value, error: null };
}

/** 소수를 허용하는 칸(주식 수량·체결가·환율)에 쓴다 */
export function parseDecimalInput(raw: string): { value: number; error: string | null } {
  const text = raw.replace(/[,\s]/g, '');

  if (text === '') return { value: 0, error: null };

  if (text.includes('-') || text.includes('−')) {
    return { value: 0, error: '음수는 넣을 수 없습니다.' };
  }
  if (!/^\d*\.?\d*$/.test(text) || text === '.') {
    return { value: 0, error: '숫자만 넣을 수 있습니다.' };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return { value: 0, error: '숫자만 넣을 수 있습니다.' };

  return { value, error: null };
}
