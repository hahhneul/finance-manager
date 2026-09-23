import type { Market } from '@/types';
import { QuoteUnavailableError, type PriceProvider, type QuoteResult } from './types';

/**
 * 한국거래소(KRX) 공식 Open API.
 *
 * 확인한 것 (2026-09-22, 실제 호출로 검증)
 *  - CORS 를 허용한다 (요청한 Origin 을 그대로 돌려준다)
 *  - 무료, 인증키 하나당 하루 10,000회
 *  - 한 번 호출하면 **그날 전 종목**이 온다 → 종목이 몇 개든 시장당 1회
 *  - 제공 데이터는 실시간이 아니라 **일별 종가**
 *
 *  - **인증키를 쿼리 파라미터로 받아준다** (2026-09-22 확인).
 *    그래서 단순 요청이 되어 preflight 가 아예 없고, 브라우저에서 확실히 통과한다.
 *    (헤더로 보내면 preflight 응답에 Access-Control-Allow-Headers 가 없어서 막힌다)
 *
 * 실제 응답 형태
 *   { "OutBlock_1": [
 *       { "BAS_DD":"20260921", "ISU_CD":"005930", "ISU_NM":"삼성전자",
 *         "MKT_NM":"KOSPI", "TDD_CLSPRC":"274000", ... }, ... ] }
 *   KOSPI 한 번에 942종목 · 약 290KB · 3초. 종목이 몇 개든 시장당 1회다.
 */

const BASE = 'https://data-dbg.krx.co.kr/svc/apis';

/** 시장별 일별매매정보 엔드포인트 (둘 다 경로 존재를 확인했다) */
const ENDPOINTS = {
  KOSPI: 'sto/stk_bydd_trd',
  KOSDAQ: 'sto/ksq_bydd_trd',
} as const;

/** KRX 응답 한 줄에서 우리가 쓰는 값 */
export interface KrxRow {
  symbol: string;
  name: string;
  close: number;
}

/**
 * 응답에서 종목 배열을 찾아낸다.
 *
 * KRX Data Marketplace 응답은 보통 `OutBlock_1` 배열이지만,
 * 서비스마다 이름이 다를 수 있어 **배열인 첫 번째 값**을 쓴다.
 */
export function extractRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];

  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return [];
}

/**
 * 필드 이름 후보를 순서대로 본다.
 * 실제 응답은 ISU_CD / ISU_NM / TDD_CLSPRC 를 쓰지만,
 * 다른 시장 엔드포인트가 조금 다를 수 있어 대비해 둔다.
 */
function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

/** '86,000' 처럼 쉼표가 낀 숫자도 받는다 */
export function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const numeric = Number(value.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

export function toKrxRow(row: Record<string, unknown>): KrxRow | null {
  const symbol = pick(row, ['ISU_CD', 'ISU_SRT_CD', 'SRTN_CD']);
  const close = parseAmount(pick(row, ['TDD_CLSPRC', 'CLSPRC']));

  if (!symbol || close === null || close <= 0) return null;

  return {
    symbol,
    name: pick(row, ['ISU_NM', 'ISU_ABBRV', 'ISU_KOR_NM']) ?? symbol,
    close,
  };
}

export interface KrxFetchResult {
  rows: KrxRow[];
  /** 어느 방식으로 인증이 통했는지 (검증용) */
  authMode: 'query' | 'header';
}

/**
 * 하루치 전 종목 시세를 가져온다.
 *
 * 쿼리 파라미터를 먼저 시도하는 이유: 그러면 단순 요청이라
 * preflight 가 아예 없고, 브라우저에서 확실히 통과한다.
 */
export async function fetchKrxDayOrNull(
  apiKey: string,
  board: keyof typeof ENDPOINTS,
  basDd: string,
): Promise<KrxFetchResult | null> {
  const path = `${BASE}/${ENDPOINTS[board]}`;

  // 쿼리 파라미터가 통한다 (확인함). 단순 요청이라 preflight 가 없다.
  const viaQuery = await tryFetch(`${path}?basDd=${basDd}&AUTH_KEY=${encodeURIComponent(apiKey)}`);
  if (viaQuery) return { rows: viaQuery, authMode: 'query' };

  // 혹시 정책이 바뀌면 헤더로도 시도해 본다 (브라우저에서는 막힐 수 있다)
  const viaHeader = await tryFetch(`${path}?basDd=${basDd}`, { AUTH_KEY: apiKey });
  if (viaHeader) return { rows: viaHeader, authMode: 'header' };

  // 휴장일(빈 배열)과 인증 실패를 여기서는 구분하지 않는다.
  // 호출하는 쪽이 다음 날짜로 넘어가고, 전부 실패하면 그때 안내한다.
  return null;
}

async function tryFetch(url: string, headers?: Record<string, string>): Promise<KrxRow[] | null> {
  let response: Response;
  try {
    response = await fetch(url, headers ? { headers } : undefined);
  } catch {
    // CORS 차단이나 네트워크 실패는 여기로 온다 — 다음 방식으로 넘어간다
    return null;
  }

  if (!response.ok) return null;

  const payload: unknown = await response.json();

  // 오류는 { respMsg, respCode } 로 온다. 정상 응답에는 respCode 자체가 없다.
  if (payload && typeof payload === 'object' && 'respCode' in payload) return null;

  const rows = extractRows(payload).map(toKrxRow).filter((row): row is KrxRow => row !== null);
  return rows.length > 0 ? rows : null;
}

/**
 * KRX 기반 시세 제공자.
 *
 * 한 종목씩 묻지 않고 하루치를 통째로 받아 캐시한다.
 * 종목이 10개여도 시장당 1회만 호출한다.
 *
 * **휴장일 처리**: 주말·공휴일, 그리고 장 마감 전의 오늘은 빈 배열이 온다.
 * 그래서 최근 날짜부터 거슬러 올라가며 데이터가 있는 날을 찾는다.
 * 한 번 찾으면 그 날짜를 두 시장에 똑같이 쓴다 (기준일이 어긋나면 안 된다).
 */
export class KrxPriceProvider implements PriceProvider {
  readonly id = 'krx';
  readonly label = '한국거래소 (국내 주식)';
  readonly requiresApiKey = true;

  private readonly apiKey: string;
  /** 최근 날짜부터 순서대로 (YYYYMMDD) */
  private readonly candidateDates: string[];
  /** 데이터가 있던 날. 한 번 찾으면 재사용한다 */
  private resolvedDate: string | null = null;
  /** 시장별로 한 번만 받아서 재사용한다 */
  private cache = new Map<string, Map<string, KrxRow>>();

  constructor(apiKey: string, candidateDates: string[]) {
    this.apiKey = apiKey;
    this.candidateDates = candidateDates;
  }

  supportsMarket(market: Market): boolean {
    return market === 'KRX';
  }

  /** 실제로 쓰인 기준일 (화면에 "기준: 9월 21일 종가"로 띄운다) */
  get basisDate(): string | null {
    return this.resolvedDate;
  }

  async getQuote(symbol: string, market: Market): Promise<QuoteResult> {
    if (market !== 'KRX') {
      throw new QuoteUnavailableError(symbol, market, 'KRX 제공자는 국내 주식만 지원합니다.');
    }

    // 코스피에 없으면 코스닥에서 찾는다
    for (const board of ['KOSPI', 'KOSDAQ'] as const) {
      const rows = await this.load(board);
      const row = rows.get(symbol);
      if (row) {
        return {
          symbol,
          market,
          price: row.close,
          currency: 'KRW',
          asOf: closeTimeOf(this.resolvedDate!),
        };
      }
    }

    throw new QuoteUnavailableError(
      symbol, market,
      `${this.resolvedDate ?? '최근'} 기준 시세에서 ${symbol} 을(를) 찾지 못했습니다. 종목코드를 확인해 주세요.`,
    );
  }

  private async load(board: 'KOSPI' | 'KOSDAQ'): Promise<Map<string, KrxRow>> {
    const cached = this.cache.get(board);
    if (cached) return cached;

    // 기준일이 이미 정해졌으면 그 날짜만 받는다
    const dates = this.resolvedDate ? [this.resolvedDate] : this.candidateDates;

    for (const basDd of dates) {
      const result = await fetchKrxDayOrNull(this.apiKey, board, basDd);
      if (!result) continue;

      this.resolvedDate = basDd;
      const map = new Map(result.rows.map((row) => [row.symbol, row]));
      this.cache.set(board, map);
      return map;
    }

    // 이 시장에서 못 찾았어도 다른 시장은 시도해야 하므로 빈 값으로 둔다
    const empty = new Map<string, KrxRow>();
    this.cache.set(board, empty);

    if (!this.resolvedDate) {
      throw new Error(
        `최근 ${this.candidateDates.length}일 안에 시세 데이터를 찾지 못했습니다. ` +
          '인증키가 맞는지, openapi.krx.co.kr 에서 일별매매정보 활용 신청이 승인됐는지 확인해 주세요.',
      );
    }

    return empty;
  }
}

/** 일별 종가이므로 그 날 장 마감(15:30 KST = 06:30 UTC)을 기준 시각으로 삼는다 */
export function closeTimeOf(basDd: string): string {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}T06:30:00.000Z`;
}
