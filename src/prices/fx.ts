import type { FxProvider } from './types';

/**
 * USD/KRW 환율 제공자.
 *
 * open.er-api.com 을 쓰는 이유
 *  - API 키가 필요 없다 (설정 화면에서 아무것도 안 받아도 된다)
 *  - CORS 를 허용한다 (access-control-allow-origin: *) — 브라우저에서 직접 호출된다
 *  - 하루 한 번 갱신되는 값이라 우리 용도(주식 평가)에 충분하다
 *
 * 실패하면 예외를 던지고, 호출하는 쪽이 마지막으로 저장된 환율을 계속 쓴다.
 */
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

interface ErApiResponse {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
}

export class ErApiFxProvider implements FxProvider {
  readonly id = 'er-api';

  async getUsdKrw(): Promise<{ rate: number; asOf: string }> {
    const response = await fetch(ENDPOINT);
    if (!response.ok) {
      throw new Error(`환율을 가져오지 못했습니다 (HTTP ${response.status})`);
    }

    const data = (await response.json()) as ErApiResponse;
    if (data.result !== 'success') {
      throw new Error('환율 응답을 이해할 수 없습니다.');
    }

    const rate = data.rates?.KRW;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('환율 값이 올바르지 않습니다.');
    }

    return {
      rate,
      // 응답이 알려주는 갱신 시각을 그대로 쓴다. 없으면 지금.
      asOf: data.time_last_update_unix
        ? new Date(data.time_last_update_unix * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
}

export const erApiFxProvider = new ErApiFxProvider();
