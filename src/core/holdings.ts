import type {
  Currency,
  Dec,
  Holding,
  ID,
  Krw,
  Market,
  PriceQuote,
  Timestamp,
  Trade,
} from '@/types';
import { toKrw } from './money';

/** 같은 계좌·시장·종목이면 같은 포지션이다 */
export function holdingKey(accountId: ID, market: Market, symbol: string): string {
  return `${accountId}:${market}:${symbol}`;
}

export function tradeKey(trade: Trade): string {
  return holdingKey(trade.accountId, trade.market, trade.symbol);
}

/** 체결 순서대로. 같은 날이면 입력한 순서를 따른다 */
function byTradeOrder(a: Trade, b: Trade): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface RealizedLot {
  tradeId: ID;
  date: string;
  quantity: Dec;
  /** 매도 시점의 평균 매입가 */
  avgCostAtSale: Dec;
  /** (체결가 − 평균단가) × 수량 − 수수료 − 세금 */
  pnl: Dec;
}

export interface HoldingState {
  /** 남은 수량 */
  quantity: Dec;
  /** 통화 기준 평균 매입가 (매수 수수료 포함) */
  avgCost: Dec;
  /** 남은 수량의 취득원가 총액 = quantity × avgCost */
  totalCost: Dec;
  /** 실현손익 누계 (통화 기준) */
  realizedPnl: Dec;
  /** 매도 건별 실현손익 */
  realizedLots: RealizedLot[];
  /** 보유 수량보다 많이 매도한 수량. 정상이면 0 */
  oversoldQuantity: Dec;
}

const EMPTY_STATE: HoldingState = {
  quantity: 0,
  avgCost: 0,
  totalCost: 0,
  realizedPnl: 0,
  realizedLots: [],
  oversoldQuantity: 0,
};

/**
 * 매매 기록으로부터 수량·평균단가·실현손익을 계산한다 (이동평균법).
 *
 * Trade 가 단일 진실 원천이고 Holding 의 quantity/avgCost 는 이 함수의 결과를
 * 저장해 둔 캐시다. 그래서 과거 매매를 수정해도 평균단가가 어긋나지 않는다.
 *
 * 수수료 처리
 *  - 매수 수수료는 취득원가에 **더한다** (평균단가가 올라간다)
 *  - 매도 수수료·세금은 실현손익에서 **뺀다**
 *  → 실현손익 = (체결가 − 평균단가) × 수량 − 수수료 − 세금
 *
 * 예) 10주@70,000 수수료1,000  → 평균 70,100
 *      5주@80,000 수수료  600  → 평균 73,440
 *      6주 매도@85,000 수수료900 → 실현 +68,460, 잔여 9주 평균 73,440 유지
 */
export function recomputeHolding(trades: Trade[]): HoldingState {
  if (trades.length === 0) return { ...EMPTY_STATE, realizedLots: [] };

  let quantity = 0;
  let totalCost = 0;
  let realizedPnl = 0;
  let oversoldQuantity = 0;
  const realizedLots: RealizedLot[] = [];

  for (const trade of [...trades].sort(byTradeOrder)) {
    if (trade.side === 'buy') {
      totalCost += trade.price * trade.quantity + trade.fee;
      quantity += trade.quantity;
      continue;
    }

    // 매도
    const avgCostAtSale = quantity > 0 ? totalCost / quantity : 0;

    // 보유량보다 많이 팔면 있는 만큼만 원가를 덜어낸다 (데이터가 깨졌을 때의 방어)
    const sellable = Math.min(trade.quantity, quantity);
    oversoldQuantity += trade.quantity - sellable;

    const proceeds = trade.price * trade.quantity - trade.fee - (trade.tax ?? 0);
    const costOfSold = avgCostAtSale * sellable;
    const pnl = proceeds - costOfSold;

    realizedPnl += pnl;
    realizedLots.push({
      tradeId: trade.id,
      date: trade.date,
      quantity: trade.quantity,
      avgCostAtSale,
      pnl,
    });

    totalCost -= costOfSold;
    quantity -= sellable;
  }

  // 전량 매도하면 잔여 원가는 0 이어야 한다. 부동소수점 찌꺼기를 털어낸다.
  if (quantity === 0) totalCost = 0;

  return {
    quantity,
    avgCost: quantity > 0 ? totalCost / quantity : 0,
    totalCost,
    realizedPnl,
    realizedLots,
    oversoldQuantity,
  };
}

/** 계좌·종목별로 매매를 묶는다 */
export function groupTradesByHolding(trades: Trade[]): Map<string, Trade[]> {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = tradeKey(trade);
    const list = groups.get(key);
    if (list) list.push(trade);
    else groups.set(key, [trade]);
  }
  return groups;
}

export interface NativePnl {
  /** 통화 기준 평가액 */
  marketValue: Dec;
  /** 통화 기준 취득원가 */
  costBasis: Dec;
  /** 평가손익 */
  pnl: Dec;
  /** 수익률 (0.1710 = +17.10%) */
  returnRate: Dec;
}

/** 통화 기준 평가손익. 환율이 끼기 전의 값이라 수익률이 정확하다 */
export function unrealizedPnl(state: HoldingState, price: Dec): NativePnl {
  const marketValue = state.quantity * price;
  const costBasis = state.totalCost;
  const pnl = marketValue - costBasis;

  return {
    marketValue,
    costBasis,
    pnl,
    returnRate: costBasis === 0 ? 0 : pnl / costBasis,
  };
}

/**
 * 원화 환산.
 *
 * 평가액과 원가를 **각각** 반올림한 뒤 빼야 화면의 세 숫자가 서로 맞는다.
 * (차액을 반올림하면 평가액 − 원가 ≠ 평가손익 이 되는 경우가 생긴다)
 */
export function toKrwPnl(native: NativePnl, currency: Currency, fxRate: Dec): {
  marketValueKrw: Krw;
  costBasisKrw: Krw;
  pnlKrw: Krw;
} {
  const rate = currency === 'KRW' ? 1 : fxRate;
  const marketValueKrw = toKrw(native.marketValue * rate);
  const costBasisKrw = toKrw(native.costBasis * rate);

  return { marketValueKrw, costBasisKrw, pnlKrw: marketValueKrw - costBasisKrw };
}

/** 한 종목의 원화 평가액 */
export function marketValueKrw(
  state: HoldingState,
  price: Dec,
  currency: Currency,
  fxRate: Dec,
): Krw {
  const rate = currency === 'KRW' ? 1 : fxRate;
  return toKrw(state.quantity * price * rate);
}

/** 투자 화면 한 줄에 필요한 모든 값 */
export interface Position {
  holding: Holding;
  state: HoldingState;
  /** 평가에 쓴 가격 */
  price: Dec;
  /** 가격의 기준 시각. 시세가 없으면 null */
  priceAsOf: Timestamp | null;
  /** 시세가 없어 평균단가로 대신 평가했는가 */
  priceMissing: boolean;
  native: NativePnl;
  marketValueKrw: Krw;
  costBasisKrw: Krw;
  pnlKrw: Krw;
}

export function quoteKey(market: Market, symbol: string): string {
  return `${market}:${symbol}`;
}

/** 종목별 최신 시세만 남긴다 */
export function latestQuotes(quotes: PriceQuote[]): Map<string, PriceQuote> {
  const latest = new Map<string, PriceQuote>();
  for (const quote of quotes) {
    const key = quoteKey(quote.market, quote.symbol);
    const current = latest.get(key);
    if (!current || quote.asOf > current.asOf) latest.set(key, quote);
  }
  return latest;
}

/**
 * 보유 종목 + 매매 + 시세 → 화면에 그릴 포지션 목록.
 *
 * 시세를 못 가져왔으면 평균 매입가로 평가한다 (평가손익 0).
 * 앱이 멈추지 않고, 화면에는 "시세 없음"으로 표시한다.
 */
export function buildPositions(
  holdings: Holding[],
  trades: Trade[],
  quotes: PriceQuote[],
  fxRate: Dec,
): Position[] {
  const tradeGroups = groupTradesByHolding(trades);
  const quoteMap = latestQuotes(quotes);

  return holdings
    .map((holding) => {
      const key = holdingKey(holding.accountId, holding.market, holding.symbol);
      const state = recomputeHolding(tradeGroups.get(key) ?? []);
      const quote = quoteMap.get(quoteKey(holding.market, holding.symbol));

      const priceMissing = !quote;
      const price = quote?.price ?? state.avgCost;

      const native = unrealizedPnl(state, price);
      const krw = toKrwPnl(native, holding.currency, fxRate);

      return {
        holding,
        state,
        price,
        priceAsOf: quote?.asOf ?? null,
        priceMissing,
        native,
        ...krw,
      };
    })
    // 전량 매도한 종목은 목록에서 뺀다
    .filter((p) => p.state.quantity > 0)
    .sort((a, b) => b.marketValueKrw - a.marketValueKrw);
}

export interface PortfolioSummary {
  marketValueKrw: Krw;
  costBasisKrw: Krw;
  pnlKrw: Krw;
  returnRate: Dec;
  /** 실현손익 누계 (원화 환산) */
  realizedPnlKrw: Krw;
}

export function portfolioSummary(positions: Position[], fxRate: Dec): PortfolioSummary {
  const marketValueKrw = positions.reduce((s, p) => s + p.marketValueKrw, 0);
  const costBasisKrw = positions.reduce((s, p) => s + p.costBasisKrw, 0);
  const realizedPnlKrw = positions.reduce(
    (s, p) => s + toKrw(p.state.realizedPnl * (p.holding.currency === 'KRW' ? 1 : fxRate)),
    0,
  );

  const pnlKrw = marketValueKrw - costBasisKrw;

  return {
    marketValueKrw,
    costBasisKrw,
    pnlKrw,
    returnRate: costBasisKrw === 0 ? 0 : pnlKrw / costBasisKrw,
    realizedPnlKrw,
  };
}

/**
 * 매매 기록만으로 보유 종목 목록을 만든다.
 *
 * 과거 시점의 순자산을 역산할 때 쓴다 (그때의 Holding 레코드는 남아 있지 않다).
 * 종목명은 지금 저장된 Holding 에서 빌려오고, 없으면 종목코드를 그대로 쓴다.
 */
export function holdingsFromTrades(trades: Trade[], known: Holding[] = []): Holding[] {
  const groups = groupTradesByHolding(trades);
  const result: Holding[] = [];

  for (const [key, group] of groups) {
    const state = recomputeHolding(group);
    if (state.quantity <= 0) continue;

    const first = group[0];
    const existing = known.find(
      (h) => holdingKey(h.accountId, h.market, h.symbol) === key,
    );

    result.push({
      id: existing?.id ?? key,
      createdAt: existing?.createdAt ?? first.createdAt,
      updatedAt: existing?.updatedAt ?? first.updatedAt,
      accountId: first.accountId,
      symbol: first.symbol,
      name: existing?.name ?? first.symbol,
      market: first.market,
      currency: first.currency,
      quantity: state.quantity,
      avgCost: state.avgCost,
    });
  }

  return result;
}
