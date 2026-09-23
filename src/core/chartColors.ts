import type { Category, FlowKind, ID } from '@/types';
import type { Intensity } from './calendar';

/**
 * 차트 색.
 *
 * 눈으로 고르지 않고 검증기(dataviz/scripts/validate_palette.js)를 돌려 통과한 값이다.
 * 색맹 판별 가능성, 밝기 대역, 채도 하한, 배경 대비를 모두 통과한 순서라
 * **슬롯 순서를 바꾸면 안 된다.**
 */

/** 카테고리 구분용 8색. 이 순서 자체가 색맹 안전성을 만든다 */
export const CATEGORICAL = [
  '#2a78d6', // 파랑
  '#eb6834', // 주황
  '#1baf7a', // 청록
  '#eda100', // 노랑
  '#e87ba4', // 자홍
  '#008300', // 초록
  '#4a3aa7', // 보라
  '#e34948', // 빨강
] as const;

/** 8개를 넘어가는 카테고리를 '기타'로 접을 때 쓰는 중립색 */
export const OTHER_COLOR = '#9a9a93';

/** 도넛에 한 번에 띄울 최대 조각 수. 넘으면 '기타'로 접는다 */
export const MAX_DONUT_SLICES = 6;

/**
 * 크기 비교용 파랑 한 색 (옅음 → 진함).
 * 달력의 지출 농도가 이걸 쓴다.
 */
export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6'] as const;

/** 강조하지 않는 막대의 색 */
export const MUTED_BAR = '#d7d6d1';
export const ACCENT_BAR = '#2a78d6';

/**
 * 카테고리 → 색 지도.
 *
 * 금액 순서가 아니라 **카테고리 자체**에 색을 묶는다.
 * 이렇게 해야 달이 바뀌어 순위가 뒤집혀도 식비는 계속 같은 색이다.
 * (순위로 칠하면 지난달과 이번달 차트를 비교할 수 없다)
 */
export function categoryColorMap(categories: Category[], flow: FlowKind): Map<ID, string> {
  const parents = categories
    .filter((c) => c.parentId === null && c.flow === flow)
    .sort((a, b) => a.order - b.order);

  const map = new Map<ID, string>();

  parents.forEach((parent, index) => {
    const color = index < CATEGORICAL.length ? CATEGORICAL[index] : OTHER_COLOR;
    map.set(parent.id, color);

    // 소분류는 대분류 색을 물려받는다
    for (const child of categories) {
      if (child.parentId === parent.id) map.set(child.id, color);
    }
  });

  return map;
}

/** 달력 칸 배경. 0이면 칠하지 않는다 */
export function intensityColor(intensity: Intensity): string | undefined {
  return intensity === 0 ? undefined : SEQUENTIAL_BLUE[intensity - 1];
}

/**
 * 상태 색 (좋음 / 주의 / 초과).
 *
 * 카테고리 색과는 일부러 다른 계열이다. 계열 색을 상태에 쓰면
 * "빨간 막대"가 카테고리인지 경고인지 구분이 안 된다.
 *
 * 중요: 이 색들은 **혼자 쓰면 안 된다.** 밝은 배경에서 대비가 낮아
 * 반드시 아이콘과 글자("주의", "초과")를 같이 붙인다.
 */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
} as const;

/**
 * 진행 바(미터)의 채운 색과 빈 트랙 색.
 * 트랙은 채운 색과 **같은 계열의 옅은 단계**여야 바 전체에서 상태가 읽힌다.
 */
export const METER = {
  ok: { fill: '#2a78d6', track: '#cde2fb' },
  warning: { fill: '#fab219', track: '#fdecc7' },
  over: { fill: '#d03b3b', track: '#f5d3d3' },
} as const;

export type MeterTone = keyof typeof METER;
