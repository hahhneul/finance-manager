import type { PriceProvider } from './types';
import { manualPriceProvider } from './manual';
import { KrxPriceProvider } from './krx';
import { erApiFxProvider } from './fx';
import { todayISO, addDays } from '@/core/date';

/**
 * 고를 수 있는 시세 제공자 목록.
 *
 * 설정 화면이 이 목록을 그려서 사용자가 고른다.
 * API 키는 코드에 하드코딩하지 않고 설정 화면에서 받아 로컬에만 둔다.
 */
export interface ProviderInfo {
  id: string;
  label: string;
  requiresApiKey: boolean;
  description: string;
  /** 키를 어디서 받는지 안내 */
  keyUrl?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'manual',
    label: '직접 입력',
    requiresApiKey: false,
    description: '네트워크를 쓰지 않습니다. 현재가를 투자 화면에서 직접 입력합니다.',
  },
  {
    id: 'krx',
    label: '한국거래소 (국내 주식)',
    requiresApiKey: true,
    description:
      '무료, 하루 10,000회. 실시간이 아니라 전 거래일 종가입니다. 미국 주식은 직접 입력해야 합니다.',
    keyUrl: 'https://openapi.krx.co.kr',
  },
];

/**
 * 시세를 찾아볼 날짜들 (최근 것부터).
 *
 * KRX 는 일별 종가라 **오늘 데이터는 장 마감 뒤에야 생긴다.**
 * 주말·공휴일도 빈 배열이 온다. 그래서 오늘부터 거슬러 올라가며 찾는다.
 * 설·추석 연휴가 최대 5일 정도라 10일이면 충분하다.
 */
export function recentTradingDates(count = 10, from = todayISO()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, -i).replace(/-/g, ''));
}

export function createProvider(id: string, apiKey?: string, dates?: string[]): PriceProvider {
  if (id === 'krx') {
    if (!apiKey) {
      throw new Error('KRX 인증키가 필요합니다. 설정 화면에서 입력해 주세요.');
    }
    return new KrxPriceProvider(apiKey, dates ?? recentTradingDates());
  }

  return manualPriceProvider;
}

export { erApiFxProvider };
