import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { SubScreen } from '@/features/settings/SubScreen';
import { buildPositions, portfolioSummary, type Position } from '@/core/holdings';
import {
  formatFxRate,
  formatKrw,
  formatKrwSigned,
  formatMoney,
  formatPercentSigned,
  formatQuantity,
} from '@/core/money';
import { formatQuoteTime, isStale } from '@/core/date';
import { db } from '@/db/schema';
import { loadFxRate, refreshAllQuotes } from '@/db/repo';
import { describeResult, type RefreshResult } from '@/prices/refresh';
import { useSettings } from '@/hooks/useData';
import { Link } from 'react-router-dom';
import { useAccounts } from '@/hooks/useData';
import { PriceSheet } from './PriceSheet';
import { TradeSheet } from './TradeSheet';
import { TradeHistorySheet } from './TradeHistorySheet';

export function InvestmentsScreen() {
  const [showTrade, setShowTrade] = useState(false);
  const [editingPrice, setEditingPrice] = useState<Position | null>(null);
  const [showFx, setShowFx] = useState(false);
  const [history, setHistory] = useState<Position | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const accounts = useAccounts();
  const settings = useSettings();
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const trades = useLiveQuery(() => db.trades.toArray(), []);
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const fx = useLiveQuery(() => loadFxRate(), []);

  const positions = useMemo(() => {
    if (!holdings || !trades || !quotes) return [];
    return buildPositions(holdings, trades, quotes, fx?.rate ?? 0);
  }, [holdings, trades, quotes, fx]);

  const summary = useMemo(
    () => portfolioSummary(positions, fx?.rate ?? 0),
    [positions, fx],
  );

  async function refresh() {
    setRefreshing(true);
    setRefreshResult(null);
    setRefreshError(null);
    try {
      setRefreshResult(await refreshAllQuotes());
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    }
    setRefreshing(false);
  }

  const providerId = settings?.priceProviderId ?? 'manual';
  const needsFx = positions.some((p) => p.holding.currency === 'USD');
  const missingFx = needsFx && !fx;
  const loading = !holdings || !trades || !quotes;

  return (
    <SubScreen
      title="투자"
      action={
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || positions.length === 0}
            aria-label="시세 새로고침"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100 disabled:opacity-40"
          >
            <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowTrade(true)}
            aria-label="매매 기록 추가"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <Plus className="size-5" />
          </button>
        </div>
      }
    >
      {loading && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      {!loading && positions.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-slate-500">아직 보유 종목이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            매수 기록을 넣으면 수량과 평균 매입가가 자동으로 계산됩니다.
          </p>
          <button
            type="button"
            onClick={() => setShowTrade(true)}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            매매 기록 추가
          </button>
        </div>
      )}

      {positions.length > 0 && (
        <>
          {/* 포트폴리오 요약 */}
          <section className="bg-white px-4 py-4">
            <p className="text-xs text-slate-500">평가액</p>
            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatKrw(summary.marketValueKrw)}
            </p>

            <p
              className={`mt-1 flex items-center gap-1 text-sm font-medium ${
                summary.pnlKrw >= 0 ? 'text-red-600' : 'text-blue-600'
              }`}
            >
              {summary.pnlKrw >= 0 ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              {formatKrwSigned(summary.pnlKrw)}
              <span className="text-slate-400">({formatPercentSigned(summary.returnRate)})</span>
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 py-2">
                <dt className="text-[11px] text-slate-500">매입 원가</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {formatKrw(summary.costBasisKrw)}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 py-2">
                <dt className="text-[11px] text-slate-500">실현손익 누계</dt>
                <dd
                  className={`text-sm font-semibold ${
                    summary.realizedPnlKrw >= 0 ? 'text-red-600' : 'text-blue-600'
                  }`}
                >
                  {formatKrwSigned(summary.realizedPnlKrw)}
                </dd>
              </div>
            </dl>
          </section>

          {/* 환율 */}
          {needsFx && (
            <button
              type="button"
              onClick={() => setShowFx(true)}
              className={`mt-2 flex min-h-14 w-full items-center gap-3 px-4 text-left ${
                missingFx ? 'bg-amber-50 active:bg-amber-100' : 'bg-white active:bg-slate-50'
              }`}
            >
              {missingFx && <AlertTriangle className="size-4 shrink-0 text-amber-600" />}
              <span className="flex-1">
                <span className="block text-sm text-slate-900">USD / KRW 환율</span>
                <span className="block text-xs text-slate-500">
                  {fx ? `기준 ${formatQuoteTime(fx.asOf)}` : '입력해야 달러 종목이 평가됩니다'}
                </span>
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {fx ? formatFxRate(fx.rate) : '미입력'}
              </span>
            </button>
          )}

          {/* 보유 종목 */}
          <ul className="mt-2 divide-y divide-slate-100 bg-white">
            {positions.map((position) => (
              <li key={position.holding.id}>
                <PositionRow
                  position={position}
                  accountName={
                    accounts?.find((a) => a.id === position.holding.accountId)?.name ?? '—'
                  }
                  onEditPrice={() => setEditingPrice(position)}
                  onShowHistory={() => setHistory(position)}
                />
              </li>
            ))}
          </ul>

          {refreshError && (
            <p className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {refreshError}
            </p>
          )}

          {refreshResult && (
            <div className="mx-4 mt-3 rounded-lg bg-slate-100 p-3 text-xs">
              <p className="font-medium text-slate-700">{describeResult(refreshResult)}</p>

              {/* '1개 실패' 만으로는 뭘 해야 할지 모른다. 종목과 이유를 적는다 */}
              {refreshResult.quotes
                .filter((q) => q.status === 'failed')
                .map((q) => (
                  <p key={`${q.market}:${q.symbol}`} className="mt-1.5 text-slate-600">
                    <span className="font-medium">{q.symbol}</span> · {q.error}
                    {q.fallback && (
                      <span className="text-slate-400">
                        {' '}저장된 {formatMoney(q.fallback.price, q.fallback.currency)} 을(를)
                        그대로 씁니다.
                      </span>
                    )}
                  </p>
                ))}

              {refreshResult.fx.status === 'failed' && (
                <p className="mt-1.5 text-slate-600">환율 · {refreshResult.fx.error}</p>
              )}
            </div>
          )}

          <div className="px-4 py-4 text-xs text-slate-400">
            {providerId === 'manual' ? (
              <p>
                지금은 <strong>직접 입력</strong> 모드입니다. 가격을 누르면 고칠 수 있습니다.{' '}
                <Link to="/prices" className="text-blue-600 underline">
                  시세 가져오기 설정
                </Link>
                에서 자동 조회로 바꿀 수 있습니다.
              </p>
            ) : (
              <p>
                가격을 누르면 직접 고칠 수도 있습니다.{' '}
                <Link to="/prices" className="text-blue-600 underline">
                  시세 설정
                </Link>
              </p>
            )}
          </div>
        </>
      )}

      <TradeSheet
        open={showTrade}
        accounts={accounts ?? []}
        holdings={holdings ?? []}
        onClose={() => setShowTrade(false)}
      />

      <PriceSheet
        position={editingPrice}
        fxRate={fx?.rate ?? 0}
        onClose={() => setEditingPrice(null)}
      />

      <PriceSheet fxOnly open={showFx} fxRate={fx?.rate ?? 0} onClose={() => setShowFx(false)} />

      <TradeHistorySheet
        position={history}
        trades={trades ?? []}
        onClose={() => setHistory(null)}
      />
    </SubScreen>
  );
}

/**
 * 보유 종목 한 줄.
 *
 * 좁은 화면이라 표 대신 두 줄로 쌓는다.
 * 현재가 옆에는 **언제 기준인지**를 반드시 적는다 — 직접 입력한 값이라
 * 며칠 전 가격일 수 있고, 그걸 모르면 평가액을 믿을 수 없다.
 */
function PositionRow({
  position,
  accountName,
  onEditPrice,
  onShowHistory,
}: {
  position: Position;
  accountName: string;
  onEditPrice: () => void;
  onShowHistory: () => void;
}) {
  const { holding, state, native } = position;
  const up = position.pnlKrw >= 0;
  const stale = position.priceAsOf ? isStale(position.priceAsOf) : true;

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onShowHistory} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0">
            <span className="text-sm font-medium text-slate-900">{holding.name}</span>
            <span className="ml-1.5 text-xs text-slate-400">{holding.symbol}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-slate-900">
            {formatKrw(position.marketValueKrw)}
          </span>
        </div>

        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-slate-500">
            {formatQuantity(state.quantity)}주 · 평단{' '}
            {formatMoney(state.avgCost, holding.currency)} · {accountName}
          </span>
          <span className={`shrink-0 font-medium ${up ? 'text-red-600' : 'text-blue-600'}`}>
            {formatKrwSigned(position.pnlKrw)} ({formatPercentSigned(native.returnRate)})
          </span>
        </div>
      </button>

      {/* 현재가는 따로 눌러서 고친다 */}
      <button
        type="button"
        onClick={onEditPrice}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-left text-xs active:bg-slate-100"
      >
        <span className="text-slate-500">현재가</span>
        <span className="font-medium text-slate-900">
          {formatMoney(position.price, holding.currency)}
        </span>
        <span className="ml-auto text-slate-400">
          {position.priceMissing
            ? '시세 없음 · 평단으로 평가'
            : `기준 ${formatQuoteTime(position.priceAsOf!)}`}
        </span>
        {stale && !position.priceMissing && (
          <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
        )}
      </button>
    </div>
  );
}
