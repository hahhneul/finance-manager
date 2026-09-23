/**
 * 한글 조사 처리.
 *
 * "카페을(를) 골랐습니다" 처럼 괄호를 치면 읽기 불편하다.
 * 앞 글자에 받침이 있는지 보고 맞는 조사를 고른다.
 */

/** 한글 음절인지 (가 ~ 힣) */
function isHangulSyllable(code: number): boolean {
  return code >= 0xac00 && code <= 0xd7a3;
}

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 한글 음절은 (초성 × 21 + 중성) × 28 + 종성 으로 만들어진다.
 * 그래서 28로 나눈 나머지가 0이면 종성(받침)이 없다.
 */
export function hasFinalConsonant(word: string): boolean {
  const trimmed = word.trim();
  if (trimmed === '') return false;

  const code = trimmed.charCodeAt(trimmed.length - 1);

  if (isHangulSyllable(code)) return (code - 0xac00) % 28 !== 0;

  // 숫자로 끝나면 읽는 소리를 기준으로 한다 (1 일, 3 삼, 6 육, 7 칠, 8 팔 → 받침 있음)
  if (code >= 0x30 && code <= 0x39) {
    return [true, true, false, true, false, false, true, true, true, false][code - 0x30];
  }

  // 영문·기호는 판단할 수 없다. 받침 없는 쪽을 고른다 (보통 덜 어색하다)
  return false;
}

/** 받침 여부에 따라 조사를 고른다 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/** '카페' → '카페를', '생필품' → '생필품을' */
export function objectParticle(word: string): string {
  return `${word}${josa(word, '을', '를')}`;
}

/** '카페' → '카페가', '생필품' → '생필품이' */
export function subjectParticle(word: string): string {
  return `${word}${josa(word, '이', '가')}`;
}

/** '카페' → '카페는', '생필품' → '생필품은' */
export function topicParticle(word: string): string {
  return `${word}${josa(word, '은', '는')}`;
}

/** '카페' → '카페와', '생필품' → '생필품과' */
export function withParticle(word: string): string {
  return `${word}${josa(word, '과', '와')}`;
}
