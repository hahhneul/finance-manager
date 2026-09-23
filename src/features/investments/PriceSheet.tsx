import { useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { formatKrw, formatMoney } from '@/core/money';
import { formatQuoteTime, nowTimestamp } from '@/core/date';
import { marketValueKrw } from '@/core/holdings';
import { saveFxRate, saveQuote } from '@/db/repo';
import type { Position } from '@/core/holdings';

/**
 * 현재가 · 환율 수동 입력.
 *
 * 7단계에서 API 를 붙여도 이 화면은 남는다.
 * 상장폐지·비상장·API 미지원 종목은 결국 직접 넣어야 하고,
 * API 가 이상한 값을 줬을 때 고칠 수단도 필요하다.
 *
 * 저장하면 기준 시각이 **지금**으로 찍힌다. 그래야 "언제 기준 가격인지"가
 * 화면에 정확히 표시된다.
 */
export function PriceSheet({
  position,
  fxOnly = false,
  open,
  fxRate,
  onClose,
}: {
  position?: Position | null;
  /** 종목 없이 환율만 고칠 때 */
  fxOnly?: boolean;
  open?: boolean;
  fxRate: number;
  onClose: () => void;
}) {
  const isOpen = fxOnly ? (open ?? false) : position != null;

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const key = `${isOpen}-${fxOnly ? 'fx' : (position?.holding.id ?? '')}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (isOpen && loadedKey !== key) {
    setLoadedKey(key);
    setValue(
      fxOnly
        ? fxRate > 0
          ? String(fxRate)
          : ''
        : position?.priceMissing
          ? ''
          : String(position?.price ?? ''),
    );
    setError(null);
  }

  const numeric = Number(value) || 0;

  async function save() {
    setError(null);
    if (numeric <= 0) {
      setError(fxOnly ? '환율을 입력해 주세요.' : '가격을 입력해 주세요.');
      return;
    }

    try {
      if (fxOnly) {
        await saveFxRate({
          base: 'USD', quote: 'KRW', rate: numeric,
          asOf: nowTimestamp(), source: 'manual',
        });
      } else if (position) {
        await saveQuote({
          symbol: position.holding.symbol,
          market: position.holding.market,
          price: numeric,
          currency: position.holding.currency,
          asOf: nowTimestamp(),
          source: 'manual',
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const currency = position?.holding.currency ?? 'KRW';

  // 입력한 값으로 평가액이 얼마가 되는지 바로 보여준다
  const preview =
    !fxOnly && position && numeric > 0
      ? marketValueKrw(position.state, numeric, currency, fxRate)
      : null;

  return (
    <BottomSheet
      open={isOpen}
      title={fxOnly ? 'USD / KRW 환율' : `${position?.holding.name ?? ''} 현재가`}
      onClose={onClose}
    >
      <div className="space-y-3 pb-2">
        {!fxOnly && position && (
          <dl className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">보유</dt>
              <dd className="font-medium text-slate-700">{position.state.quantity}주</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">평균 매입가</dt>
              <dd className="font-medium text-slate-700">
                {formatMoney(position.state.avgCost, currency)}
              </dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">지금 저장된 기준 시각</dt>
              <dd className="font-medium text-slate-700">
                {position.priceAsOf ? formatQuoteTime(position.priceAsOf) : '없음'}
              </dd>
            </div>
          </dl>
        )}

        <label className="block">
          <span className="text-xs text-slate-500">
            {fxOnly ? '1달러당 원화' : `현재가 (${currency})`}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={fxOnly ? '1350' : '0'}
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right text-lg"
          />
        </label>

        {preview !== null && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">평가액 </span>
            <span className="font-semibold text-slate-900">{formatKrw(preview)}</span>
          </p>
        )}

        <p className="text-xs text-slate-400">
          저장하면 기준 시각이 지금으로 바뀝니다.
          {fxOnly && ' 달러 종목의 원화 평가액에 쓰입니다.'}
        </p>

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>
      </div>
    </BottomSheet>
  );
}
