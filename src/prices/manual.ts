import type { Market } from '@/types';
import { QuoteUnavailableError, type PriceProvider, type QuoteResult } from './types';

/**
 * 기본 제공자 — 사용자가 투자 화면에서 직접 입력한 가격을 쓴다.
 *
 * 네트워크를 쓰지 않으므로 비행기 안에서도 앱이 완전히 동작한다.
 * 7단계에서 API 제공자를 붙여도 이것은 남겨 둔다.
 * (상장폐지 종목, 비상장, API 가 지원 안 하는 종목은 결국 수동 입력이 필요하다)
 */
export class ManualPriceProvider implements PriceProvider {
  readonly id = 'manual';
  readonly label = '직접 입력';
  readonly requiresApiKey = false;

  supportsMarket(_market: Market): boolean {
    return true;
  }

  async getQuote(symbol: string, market: Market): Promise<QuoteResult> {
    throw new QuoteUnavailableError(
      symbol,
      market,
      '직접 입력 모드입니다. 투자 화면에서 현재가를 입력해 주세요.',
    );
  }
}

export const manualPriceProvider = new ManualPriceProvider();
