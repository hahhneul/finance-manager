import type { Currency, Dec, Market, PriceQuote, Timestamp } from '@/types';

/**
 * 시세 조회 인터페이스.
 *
 * 7단계에서 실제 API 구현을 붙이더라도 화면 코드는 바뀌지 않는다.
 * 어떤 API 를 쓸지 정하기 전에도 ManualPriceProvider 로 앱 전체가 돌아간다.
 */

export interface QuoteResult {
  symbol: string;
  market: Market;
  price: Dec;
  currency: Currency;
  asOf: Timestamp;
}

export interface PriceProvider {
  id: string;
  label: string;
  /** 설정 화면에서 API 키 입력란을 보여줄지 */
  requiresApiKey: boolean;
  supportsMarket(market: Market): boolean;
  /** 못 가져오면 예외를 던진다. 호출하는 쪽이 마지막 저장값으로 넘어간다 */
  getQuote(symbol: string, market: Market): Promise<QuoteResult>;
}

export interface FxProvider {
  id: string;
  getUsdKrw(): Promise<{ rate: Dec; asOf: Timestamp }>;
}

/** 시세를 못 가져왔을 때 던지는 예외 */
export class QuoteUnavailableError extends Error {
  readonly symbol: string;
  readonly market: Market;

  constructor(symbol: string, market: Market, message: string) {
    super(message);
    this.name = 'QuoteUnavailableError';
    this.symbol = symbol;
    this.market = market;
  }
}

export interface RefreshOutcome {
  symbol: string;
  market: Market;
  status: 'updated' | 'failed';
  /** 실패했을 때 쓰는, 마지막으로 저장돼 있던 시세 */
  fallback?: PriceQuote;
  error?: string;
}
