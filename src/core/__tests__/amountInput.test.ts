import { describe, expect, it } from 'vitest';
import { MAX_KRW, parseDecimalInput, parseKrwInput, validateAmount } from '../amountInput';

describe('금액을 조용히 바꾸지 않는다', () => {
  it('소수점은 지우지 말고 오류로 알린다', () => {
    // 전에는 '1.5' → '15' 로 지워서 10배가 됐다
    expect(parseKrwInput('1.5')).toMatchObject({ value: 0, error: expect.stringContaining('소수점') });
    expect(parseKrwInput('100.5')).toMatchObject({ value: 0, error: expect.stringContaining('소수점') });
  });

  it('음수는 지우지 말고 오류로 알린다', () => {
    // 전에는 '-100' → '100' 으로 부호만 사라졌다
    expect(parseKrwInput('-100')).toMatchObject({ value: 0, error: expect.stringContaining('음수') });
    // 유니코드 빼기 기호도 잡는다
    expect(parseKrwInput('−100').error).toContain('음수');
  });

  it('글자가 섞이면 오류', () => {
    expect(parseKrwInput('1000원').error).toContain('숫자만');
    expect(parseKrwInput('abc').error).toContain('숫자만');
  });
});

describe('의미 없는 글자만 조용히 정리한다', () => {
  it('쉼표는 천 단위 구분이므로 없앤다', () => {
    expect(parseKrwInput('1,500')).toEqual({ value: 1_500, error: null, empty: false });
    expect(parseKrwInput('1,234,567').value).toBe(1_234_567);
  });

  it('공백도 없앤다', () => {
    expect(parseKrwInput(' 1500 ').value).toBe(1_500);
  });
});

describe('빈 입력', () => {
  it('아직 안 쳤으면 오류로 다그치지 않는다', () => {
    expect(parseKrwInput('')).toEqual({ value: 0, error: null, empty: true });
    expect(parseKrwInput('   ')).toEqual({ value: 0, error: null, empty: true });
  });

  it('저장할 때는 비었다고 알려준다', () => {
    expect(validateAmount('').error).toContain('넣어 주세요');
  });
});

describe('크기 한도', () => {
  it('1조원까지 받는다', () => {
    expect(parseKrwInput(String(MAX_KRW)).value).toBe(MAX_KRW);
  });

  it('그 위는 막는다', () => {
    expect(parseKrwInput(String(MAX_KRW + 1)).error).toContain('1조원');
  });

  it('안전 정수를 넘으면 막는다', () => {
    expect(parseKrwInput('9'.repeat(20)).error).toBeTruthy();
  });
});

describe('저장 직전 검증', () => {
  it('0원은 막는다', () => {
    expect(validateAmount('0').error).toContain('0원보다 커야');
  });

  it('정상 값은 통과', () => {
    expect(validateAmount('1500')).toEqual({ value: 1_500, error: null });
  });

  it('오류가 있으면 그 오류를 그대로 전달한다', () => {
    expect(validateAmount('1.5').error).toContain('소수점');
  });
});

describe('소수를 허용하는 칸 (주식 수량·체결가·환율)', () => {
  it('소수점을 받는다', () => {
    expect(parseDecimalInput('180.17')).toEqual({ value: 180.17, error: null });
    expect(parseDecimalInput('0.5').value).toBe(0.5);
  });

  it('입력 도중의 점 하나도 허용한다', () => {
    // '1.' 을 치는 중간 상태
    expect(parseDecimalInput('1.').error).toBeNull();
  });

  it('음수와 글자는 막는다', () => {
    expect(parseDecimalInput('-5').error).toContain('음수');
    expect(parseDecimalInput('1.2.3').error).toContain('숫자만');
    expect(parseDecimalInput('abc').error).toContain('숫자만');
  });
});
