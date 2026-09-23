import { describe, expect, it, vi } from 'vitest';
import { describeResult, refreshQuotes, type RefreshDeps } from '../refresh';
import { closeTimeOf, extractRows, parseAmount, toKrxRow } from '../krx';
import { recentTradingDates } from '../registry';
import { manualPriceProvider } from '../manual';
import { QuoteUnavailableError, type PriceProvider } from '../types';
import { demoHoldings, demoQuotes } from '@/demo/demoData';
import type { Market } from '@/types';

/** 항상 같은 값을 주는 가짜 제공자 */
function fakeProvider(
  behavior: (symbol: string, market: Market) => number | Error,
  markets: Market[] = ['KRX', 'US'],
): PriceProvider {
  return {
    id: 'fake',
    label: '테스트',
    requiresApiKey: false,
    supportsMarket: (m) => markets.includes(m),
    async getQuote(symbol, market) {
      const result = behavior(symbol, market);
      if (result instanceof Error) throw result;
      return {
        symbol, market, price: result,
        currency: market === 'US' ? 'USD' : 'KRW',
        asOf: '2026-09-22T06:30:00.000Z',
      };
    },
  };
}

function makeDeps(provider: PriceProvider, overrides: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    provider,
    holdings: demoHoldings,
    existingQuotes: demoQuotes,
    saveQuote: vi.fn().mockResolvedValue(undefined),
    saveFxRate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('시세 새로고침', () => {
  it('종목마다 가격을 받아 저장한다', async () => {
    const saveQuote = vi.fn().mockResolvedValue(undefined);
    const result = await refreshQuotes(
      makeDeps(fakeProvider(() => 99_000), { saveQuote }),
    );

    expect(result.updatedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(saveQuote).toHaveBeenCalledTimes(3);
    expect(saveQuote.mock.calls[0][0]).toMatchObject({ source: 'api', providerId: 'fake' });
  });

  it('하나가 실패해도 나머지는 갱신된다', async () => {
    const result = await refreshQuotes(
      makeDeps(
        fakeProvider((symbol) =>
          symbol === '035720' ? new Error('서버 오류') : 99_000,
        ),
      ),
    );

    expect(result.updatedCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });

  it('실패한 종목은 저장된 값을 건드리지 않고 그대로 둔다', async () => {
    const saveQuote = vi.fn().mockResolvedValue(undefined);
    const result = await refreshQuotes(
      makeDeps(fakeProvider(() => new Error('네트워크 끊김')), { saveQuote }),
    );

    // 하나도 저장하지 않는다
    expect(saveQuote).not.toHaveBeenCalled();

    // 마지막으로 저장돼 있던 시세를 알려준다 (화면에 "기준: …" 을 띄우기 위해)
    const samsung = result.quotes.find((q) => q.symbol === '005930')!;
    expect(samsung.status).toBe('failed');
    expect(samsung.fallback?.price).toBe(86_000);
    expect(samsung.fallback?.asOf).toBe('2026-09-20T06:30:00.000Z');
  });

  it('지원하지 않는 시장은 이유를 알려준다', async () => {
    const result = await refreshQuotes(
      // 국내만 지원하는 제공자
      makeDeps(fakeProvider(() => 99_000, ['KRX'])),
    );

    const apple = result.quotes.find((q) => q.symbol === 'AAPL')!;
    expect(apple.status).toBe('failed');
    // 뭘 해야 하는지까지 알려준다
    expect(apple.error).toContain('직접 입력');
    expect(apple.fallback?.price).toBe(200);
    // 국내 2종목은 갱신된다
    expect(result.updatedCount).toBe(2);
  });

  it('같은 종목을 두 계좌에서 들고 있어도 한 번만 묻는다', async () => {
    const getQuote = vi.fn().mockResolvedValue({
      symbol: '005930', market: 'KRX', price: 99_000,
      currency: 'KRW', asOf: '2026-09-22T06:30:00.000Z',
    });

    await refreshQuotes(
      makeDeps(
        { id: 'f', label: 'f', requiresApiKey: false, supportsMarket: () => true, getQuote },
        {
          holdings: [
            { ...demoHoldings[0], id: 'a', accountId: 'acc-1' },
            { ...demoHoldings[0], id: 'b', accountId: 'acc-2' },
          ],
        },
      ),
    );

    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it('전량 매도한 종목은 묻지 않는다', async () => {
    const getQuote = vi.fn();
    await refreshQuotes(
      makeDeps(
        { id: 'f', label: 'f', requiresApiKey: false, supportsMarket: () => true, getQuote },
        { holdings: [{ ...demoHoldings[0], quantity: 0 }] },
      ),
    );

    expect(getQuote).not.toHaveBeenCalled();
  });
});

describe('환율 새로고침', () => {
  it('달러 종목이 있으면 환율도 갱신한다', async () => {
    const saveFxRate = vi.fn().mockResolvedValue(undefined);
    const result = await refreshQuotes(
      makeDeps(fakeProvider(() => 99_000), {
        saveFxRate,
        fxProvider: {
          id: 'fx',
          async getUsdKrw() {
            return { rate: 1_375.64, asOf: '2026-09-22T00:02:31.000Z' };
          },
        },
      }),
    );

    expect(result.fx).toEqual({ status: 'updated', rate: 1_375.64 });
    expect(saveFxRate).toHaveBeenCalledWith({
      rate: 1_375.64, asOf: '2026-09-22T00:02:31.000Z', source: 'api',
    });
  });

  it('달러 종목이 없으면 환율을 부르지 않는다', async () => {
    const getUsdKrw = vi.fn();
    const result = await refreshQuotes(
      makeDeps(fakeProvider(() => 99_000), {
        holdings: demoHoldings.filter((h) => h.currency === 'KRW'),
        fxProvider: { id: 'fx', getUsdKrw },
      }),
    );

    expect(result.fx.status).toBe('skipped');
    expect(getUsdKrw).not.toHaveBeenCalled();
  });

  it('환율이 실패해도 주가 갱신은 살아 있다', async () => {
    const result = await refreshQuotes(
      makeDeps(fakeProvider(() => 99_000), {
        fxProvider: {
          id: 'fx',
          async getUsdKrw(): Promise<{ rate: number; asOf: string }> {
            throw new Error('환율 서버 응답 없음');
          },
        },
      }),
    );

    expect(result.updatedCount).toBe(3);
    expect(result.fx.status).toBe('failed');
    expect(result.fx.error).toContain('환율 서버');
  });
});

describe('결과 요약 문구', () => {
  it.each([
    [{ updatedCount: 3, failedCount: 0, fx: { status: 'updated' as const } }, '3개 종목 갱신 · 환율 갱신'],
    [{ updatedCount: 2, failedCount: 1, fx: { status: 'skipped' as const } }, '2개 종목 갱신 · 1개 실패'],
    [{ updatedCount: 0, failedCount: 0, fx: { status: 'skipped' as const } }, '갱신할 것이 없습니다.'],
  ])('%#', (partial, expected) => {
    expect(describeResult({ quotes: [], ...partial })).toBe(expected);
  });
});

describe('직접 입력 제공자', () => {
  it('네트워크를 쓰지 않고 바로 "직접 입력하라"고 알려준다', async () => {
    await expect(manualPriceProvider.getQuote('005930', 'KRX')).rejects.toThrow(
      QuoteUnavailableError,
    );
  });

  it('모든 시장을 받아들인다 (어떤 종목이든 직접 넣을 수 있다)', () => {
    expect(manualPriceProvider.supportsMarket('KRX')).toBe(true);
    expect(manualPriceProvider.supportsMarket('US')).toBe(true);
  });
});

describe('KRX 응답 해석', () => {
  it('배열이 들어 있는 필드를 찾아낸다', () => {
    expect(extractRows({ OutBlock_1: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows({ result: { rows: [] } })).toEqual([]);
    expect(extractRows(null)).toEqual([]);
  });

  it('쉼표가 낀 숫자를 읽는다', () => {
    expect(parseAmount('86,000')).toBe(86_000);
    expect(parseAmount('1234')).toBe(1_234);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('종목 한 줄을 뽑아낸다', () => {
    expect(
      toKrxRow({ ISU_SRT_CD: '005930', ISU_ABBRV: '삼성전자', TDD_CLSPRC: '86,000' }),
    ).toEqual({ symbol: '005930', name: '삼성전자', close: 86_000 });
  });

  it('필드 이름이 달라도 후보를 훑는다', () => {
    expect(toKrxRow({ ISU_CD: '035720', ISU_NM: '카카오', CLSPRC: '43500' })).toEqual({
      symbol: '035720', name: '카카오', close: 43_500,
    });
  });

  it('가격이 없거나 0이면 버린다', () => {
    expect(toKrxRow({ ISU_SRT_CD: '005930', TDD_CLSPRC: '0' })).toBeNull();
    expect(toKrxRow({ ISU_SRT_CD: '005930' })).toBeNull();
    expect(toKrxRow({ TDD_CLSPRC: '86000' })).toBeNull();
  });

  it('종목명이 없으면 종목코드를 쓴다', () => {
    expect(toKrxRow({ ISU_CD: '005930', TDD_CLSPRC: '86000' })?.name).toBe('005930');
  });

  it('실제 응답 한 줄을 그대로 읽는다', () => {
    // 2026-09-21 KRX 응답에서 그대로 가져온 형태
    const real = {
      BAS_DD: '20260921', ISU_CD: '005930', ISU_NM: '삼성전자', MKT_NM: 'KOSPI',
      SECT_TP_NM: '', TDD_CLSPRC: '274000', CMPPREVDD_PRC: '13000', FLUC_RT: '4.98',
      TDD_OPNPRC: '262000', TDD_HGPRC: '276000', TDD_LWPRC: '261000',
      ACC_TRDVOL: '12345678', ACC_TRDVAL: '3400000000000',
      MKTCAP: '1600000000000000', LIST_SHRS: '5969782550',
    };
    expect(toKrxRow(real)).toEqual({ symbol: '005930', name: '삼성전자', close: 274_000 });
  });

  it('휴장일의 빈 배열은 종목 0개로 읽힌다', () => {
    expect(extractRows({ OutBlock_1: [] })).toEqual([]);
  });

  it('오류 응답에는 배열이 없다', () => {
    expect(extractRows({ respMsg: 'Unauthorized Key', respCode: '401' })).toEqual([]);
  });
});

describe('기준 시각', () => {
  it('일별 종가는 그날 장 마감(15:30 KST)을 기준으로 삼는다', () => {
    // 06:30 UTC = 15:30 KST
    expect(closeTimeOf('20260921')).toBe('2026-09-21T06:30:00.000Z');
  });
});

describe('찾아볼 날짜 목록', () => {
  it('오늘부터 거슬러 올라간다', () => {
    // 오늘 데이터는 장 마감 뒤에야 생기므로 오늘도 후보에 넣고,
    // 없으면 어제 → 그제로 내려간다
    expect(recentTradingDates(4, '2026-09-22')).toEqual([
      '20260922', '20260921', '20260920', '20260919',
    ]);
  });

  it('긴 연휴도 넘어갈 만큼 넉넉하다', () => {
    // 기본 10일 — 설·추석 연휴가 최대 5일 정도다
    expect(recentTradingDates()).toHaveLength(10);
  });

  it('월을 넘어간다', () => {
    expect(recentTradingDates(3, '2026-03-02')).toEqual(['20260302', '20260301', '20260228']);
  });
});
