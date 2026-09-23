import type { Holding, PriceQuote, Timestamp } from '@/types';
import type { FxProvider, PriceProvider, RefreshOutcome } from './types';

/**
 * 시세 · 환율 새로고침.
 *
 * 원칙 하나: **실패해도 앱이 계속 돌아간다.**
 * 못 가져온 종목은 마지막으로 저장된 값을 그대로 쓰고,
 * 화면에는 "기준: 9월 20일 종가"처럼 언제 값인지 표시한다.
 *
 * 자동으로 반복 호출하지 않는다 — 앱 시작 시 1회, 그리고 새로고침 버튼뿐이다.
 */

export interface RefreshDeps {
  provider: PriceProvider;
  fxProvider?: FxProvider;
  holdings: Holding[];
  /** 지금 저장돼 있는 시세 (실패했을 때 그대로 둘 값) */
  existingQuotes: PriceQuote[];
  saveQuote: (quote: {
    symbol: string;
    market: Holding['market'];
    price: number;
    currency: Holding['currency'];
    asOf: Timestamp;
    source: 'api';
    providerId: string;
  }) => Promise<unknown>;
  saveFxRate: (rate: { rate: number; asOf: Timestamp; source: 'api' }) => Promise<unknown>;
}

export interface FxOutcome {
  status: 'updated' | 'failed' | 'skipped';
  rate?: number;
  error?: string;
}

export interface RefreshResult {
  quotes: RefreshOutcome[];
  fx: FxOutcome;
  updatedCount: number;
  failedCount: number;
}

export async function refreshQuotes(deps: RefreshDeps): Promise<RefreshResult> {
  const { provider, holdings, existingQuotes, saveQuote } = deps;

  // 같은 종목을 두 계좌에서 들고 있어도 한 번만 묻는다
  const targets = new Map<string, Holding>();
  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    targets.set(`${holding.market}:${holding.symbol}`, holding);
  }

  const quotes: RefreshOutcome[] = [];

  for (const holding of targets.values()) {
    const fallback = existingQuotes.find(
      (q) => q.market === holding.market && q.symbol === holding.symbol,
    );

    if (!provider.supportsMarket(holding.market)) {
      quotes.push({
        symbol: holding.symbol,
        market: holding.market,
        status: 'failed',
        fallback,
        error: `${provider.label}에서 가져올 수 없는 시장입니다. 가격을 눌러 직접 입력해 주세요.`,
      });
      continue;
    }

    try {
      const result = await provider.getQuote(holding.symbol, holding.market);

      await saveQuote({
        symbol: result.symbol,
        market: result.market,
        price: result.price,
        currency: result.currency,
        asOf: result.asOf,
        source: 'api',
        providerId: provider.id,
      });

      quotes.push({ symbol: holding.symbol, market: holding.market, status: 'updated' });
    } catch (e) {
      // 못 가져와도 계속 간다. 저장된 값은 건드리지 않는다.
      quotes.push({
        symbol: holding.symbol,
        market: holding.market,
        status: 'failed',
        fallback,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const fx = await refreshFx(deps);

  return {
    quotes,
    fx,
    updatedCount: quotes.filter((q) => q.status === 'updated').length,
    failedCount: quotes.filter((q) => q.status === 'failed').length,
  };
}

async function refreshFx(deps: RefreshDeps): Promise<FxOutcome> {
  const { fxProvider, holdings, saveFxRate } = deps;

  if (!fxProvider) return { status: 'skipped' };

  // 달러 종목이 없으면 환율을 부를 이유가 없다
  const needsFx = holdings.some((h) => h.currency !== 'KRW' && h.quantity > 0);
  if (!needsFx) return { status: 'skipped' };

  try {
    const { rate, asOf } = await fxProvider.getUsdKrw();
    await saveFxRate({ rate, asOf, source: 'api' });
    return { status: 'updated', rate };
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/** 새로고침 결과를 한 줄로 요약한다 */
export function describeResult(result: RefreshResult): string {
  const parts: string[] = [];

  if (result.updatedCount > 0) parts.push(`${result.updatedCount}개 종목 갱신`);
  if (result.failedCount > 0) parts.push(`${result.failedCount}개 실패`);
  if (result.fx.status === 'updated') parts.push('환율 갱신');
  if (result.fx.status === 'failed') parts.push('환율 실패');

  if (parts.length === 0) return '갱신할 것이 없습니다.';
  return parts.join(' · ');
}
