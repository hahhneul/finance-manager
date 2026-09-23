import { useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { AccountPicker, DatePicker, formatDateLabel } from '@/features/input/pickers';
import { formatKrw, formatMoney } from '@/core/money';
import { todayISO } from '@/core/date';
import { saveTrade } from '@/db/repo';
import type { Account, Currency, Holding, ID, Market, TradeSide } from '@/types';

const SIDES: { value: TradeSide; label: string }[] = [
  { value: 'buy', label: '매수' },
  { value: 'sell', label: '매도' },
];

const MARKETS: { value: Market; label: string }[] = [
  { value: 'KRX', label: '국내 (원)' },
  { value: 'US', label: '미국 (달러)' },
];

/**
 * 매매 기록 입력.
 *
 * 수량·평균단가는 저장하지 않는다 — Trade 가 단일 진실 원천이고
 * Holding 은 저장할 때 자동으로 다시 계산된다.
 */
export function TradeSheet({
  open,
  accounts,
  holdings,
  onClose,
}: {
  open: boolean;
  accounts: Account[];
  holdings: Holding[];
  onClose: () => void;
}) {
  const [side, setSide] = useState<TradeSide>('buy');
  const [market, setMarket] = useState<Market>('KRX');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [tax, setTax] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<ID | undefined>();
  const [sheet, setSheet] = useState<'account' | 'date' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = `${open}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setSide('buy'); setMarket('KRX'); setSymbol(''); setName('');
    setQuantity(''); setPrice(''); setFee(''); setTax(''); setFxRate('');
    setDate(todayISO()); setError(null); setSheet(null);
    setAccountId(accounts.find((a) => a.kind === 'brokerage')?.id);
  }
  if (!open && loadedKey === key) setLoadedKey('');

  const currency: Currency = market === 'US' ? 'USD' : 'KRW';
  const brokerages = accounts.filter((a) => a.kind === 'brokerage');

  const numQuantity = Number(quantity) || 0;
  const numPrice = Number(price) || 0;
  const numFee = Number(fee) || 0;
  const numTax = Number(tax) || 0;
  const numFx = Number(fxRate) || 0;

  /** 이미 산 적 있는 종목이면 이름·시장을 채워 준다 */
  function applyKnownSymbol(value: string) {
    setSymbol(value);
    const known = holdings.find((h) => h.symbol.toLowerCase() === value.trim().toLowerCase());
    if (known) {
      setName(known.name);
      setMarket(known.market);
    }
  }

  // 매도할 때 지금 몇 주를 들고 있는지 보여준다
  const currentHolding = holdings.find(
    (h) => h.symbol.toLowerCase() === symbol.trim().toLowerCase() && h.accountId === accountId,
  );

  const gross = numPrice * numQuantity;
  const cashflow =
    side === 'buy' ? -(gross + numFee) : gross - numFee - numTax;
  const cashflowKrw = currency === 'USD' ? cashflow * numFx : cashflow;

  async function save() {
    setError(null);

    if (!symbol.trim()) return setError('종목코드를 입력해 주세요.');
    if (!accountId) return setError('증권계좌를 골라 주세요.');
    if (numQuantity <= 0) return setError('수량은 0보다 커야 합니다.');
    if (numPrice <= 0) return setError('체결가는 0보다 커야 합니다.');
    if (currency === 'USD' && numFx <= 0) {
      return setError('달러 매매는 체결 시점 환율이 필요합니다.');
    }

    if (side === 'sell' && currentHolding && numQuantity > currentHolding.quantity) {
      return setError(
        `보유 수량(${currentHolding.quantity}주)보다 많이 팔 수 없습니다.`,
      );
    }

    try {
      await saveTrade(
        {
          date,
          accountId,
          symbol: symbol.trim().toUpperCase(),
          market,
          currency,
          side,
          quantity: numQuantity,
          price: numPrice,
          fee: numFee,
          tax: side === 'sell' && numTax > 0 ? numTax : undefined,
          fxRateAtTrade: currency === 'USD' ? numFx : undefined,
        },
        name.trim() || undefined,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 저장하면 평단이 어떻게 되는지 미리 보여준다
  const preview = (() => {
    if (!currentHolding || numQuantity <= 0 || numPrice <= 0) return null;

    const before = { quantity: currentHolding.quantity, avgCost: currentHolding.avgCost };
    if (side === 'sell') {
      return {
        before,
        after: { quantity: before.quantity - numQuantity, avgCost: before.avgCost },
        realized: (numPrice - before.avgCost) * numQuantity - numFee - numTax,
      };
    }

    const totalCost = before.quantity * before.avgCost + gross + numFee;
    const nextQuantity = before.quantity + numQuantity;
    return {
      before,
      after: { quantity: nextQuantity, avgCost: totalCost / nextQuantity },
      realized: null,
    };
  })();

  return (
    <BottomSheet open={open} title="매매 기록" onClose={onClose} maxHeight="90vh">
      <div className="space-y-3 pb-2">
        <Segment options={SIDES} value={side} onChange={setSide} />

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">종목코드</span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => applyKnownSymbol(e.target.value)}
              placeholder="005930 / AAPL"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">종목명</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="삼성전자"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
            />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-slate-500">시장</p>
          <Segment options={MARKETS} value={market} onChange={setMarket} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">수량</span>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="수량"
              placeholder="0"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
            />
            {currentHolding && (
              <span className="mt-1 block text-right text-[11px] text-slate-400">
                보유 {currentHolding.quantity}주
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">체결가 ({currency})</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="체결가"
              placeholder="0"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">수수료 ({currency})</span>
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="수수료"
              placeholder="0"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
            />
          </label>

          {side === 'sell' ? (
            <label className="block">
              <span className="text-xs text-slate-500">세금 ({currency})</span>
              <input
                type="text"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value.replace(/[^0-9.]/g, ''))}
                aria-label="세금"
                placeholder="0"
                className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
              />
            </label>
          ) : (
            <div />
          )}
        </div>

        {currency === 'USD' && (
          <label className="block">
            <span className="text-xs text-slate-500">체결 시점 환율 (USD/KRW)</span>
            <input
              type="text"
              inputMode="decimal"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="체결 시점 환율"
              placeholder="1350"
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              증권계좌 현금이 원화로 얼마 움직였는지 계산할 때 씁니다.
            </span>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSheet('account')}
            className="min-h-12 truncate rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            <span className="block text-[10px] text-slate-400">증권계좌</span>
            {accounts.find((a) => a.id === accountId)?.name ?? '고르기'}
          </button>

          <button
            type="button"
            onClick={() => setSheet('date')}
            className="min-h-12 rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            <span className="block text-[10px] text-slate-400">체결일</span>
            {formatDateLabel(date)}
          </button>
        </div>

        {/* 저장하면 어떻게 되는지 미리 보여준다 */}
        {gross > 0 && (
          <dl className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">체결금액</dt>
              <dd className="font-medium text-slate-700">{formatMoney(gross, currency)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">계좌 현금</dt>
              <dd className={`font-medium ${cashflow < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {currency === 'USD' && numFx <= 0
                  ? '환율 필요'
                  : formatKrw(Math.round(cashflowKrw))}
              </dd>
            </div>

            {preview && (
              <>
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
                  <dt className="text-slate-500">저장 후 수량</dt>
                  <dd className="font-medium text-slate-700">
                    {preview.before.quantity} → {preview.after.quantity}주
                  </dd>
                </div>
                <div className="flex justify-between py-0.5">
                  <dt className="text-slate-500">저장 후 평단</dt>
                  <dd className="font-medium text-slate-700">
                    {formatMoney(preview.after.avgCost, currency)}
                  </dd>
                </div>
                {preview.realized !== null && (
                  <div className="flex justify-between py-0.5">
                    <dt className="text-slate-500">실현손익</dt>
                    <dd
                      className={`font-semibold ${
                        preview.realized >= 0 ? 'text-red-600' : 'text-blue-600'
                      }`}
                    >
                      {formatMoney(preview.realized, currency)}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        )}

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>
      </div>

      <BottomSheet open={sheet === 'account'} title="증권계좌" onClose={() => setSheet(null)}>
        {brokerages.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            증권계좌가 없습니다. 전체 &gt; 계좌에서 먼저 만들어 주세요.
          </p>
        ) : (
          <AccountPicker
            accounts={brokerages}
            selectedId={accountId}
            onSelect={(id) => {
              setAccountId(id);
              setSheet(null);
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'date'} title="체결일" onClose={() => setSheet(null)}>
        <DatePicker
          value={date}
          onChange={(next) => {
            setDate(next);
            setSheet(null);
          }}
        />
      </BottomSheet>
    </BottomSheet>
  );
}
