import { describe, expect, it } from 'vitest';
import {
  hasFinalConsonant,
  objectParticle,
  subjectParticle,
  topicParticle,
  withParticle,
} from '../korean';

describe('받침 판별', () => {
  it('받침이 있는 글자', () => {
    expect(hasFinalConsonant('생필품')).toBe(true);
    expect(hasFinalConsonant('식비')).toBe(false);
    expect(hasFinalConsonant('월세')).toBe(false);
    expect(hasFinalConsonant('공과금')).toBe(true);
  });

  it('데모 카테고리 이름들', () => {
    expect(hasFinalConsonant('카페')).toBe(false);
    expect(hasFinalConsonant('외식')).toBe(true);
    expect(hasFinalConsonant('배달')).toBe(true);
    expect(hasFinalConsonant('장보기')).toBe(false);
    expect(hasFinalConsonant('대중교통')).toBe(true);
    expect(hasFinalConsonant('택시')).toBe(false);
  });

  it('빈 문자열은 받침 없음으로 본다', () => {
    expect(hasFinalConsonant('')).toBe(false);
    expect(hasFinalConsonant('   ')).toBe(false);
  });

  it('숫자는 읽는 소리를 따른다', () => {
    expect(hasFinalConsonant('1')).toBe(true); // 일
    expect(hasFinalConsonant('2')).toBe(false); // 이
    expect(hasFinalConsonant('3')).toBe(true); // 삼
    expect(hasFinalConsonant('5')).toBe(false); // 오
    expect(hasFinalConsonant('6')).toBe(true); // 육
    expect(hasFinalConsonant('9')).toBe(false); // 구
  });

  it('영문은 받침 없는 쪽으로 처리한다', () => {
    expect(hasFinalConsonant('AAPL')).toBe(false);
  });
});

describe('조사 붙이기', () => {
  it('을 / 를', () => {
    expect(objectParticle('카페')).toBe('카페를');
    expect(objectParticle('생필품')).toBe('생필품을');
    expect(objectParticle('외식')).toBe('외식을');
    expect(objectParticle('장보기')).toBe('장보기를');
  });

  it('이 / 가', () => {
    expect(subjectParticle('카페')).toBe('카페가');
    expect(subjectParticle('공과금')).toBe('공과금이');
  });

  it('은 / 는', () => {
    expect(topicParticle('카페')).toBe('카페는');
    expect(topicParticle('생필품')).toBe('생필품은');
  });

  it('과 / 와', () => {
    expect(withParticle('카페')).toBe('카페와');
    expect(withParticle('생필품')).toBe('생필품과');
  });
});
