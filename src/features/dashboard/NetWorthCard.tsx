import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatKrw, formatKrwCompact, formatPercent } from '@/core/money';
import { currentMonth, formatKoreanDate, formatKoreanMonth, lastNMonths } from '@/core/date';
import { monthlySnapshots } from '@/core/networth';
import { ACCENT_BAR, CATEGORICAL } from '@/core/chartColors';
import type { NetWorthBreakdown } from '@/core/networth';
import type { NetWorthSnapshot } from '@/types';

const CASH_COLOR = CATEGORICAL[0];
const INVEST_COLOR = CATEGORICAL[2];

/**
 * 순자산 카드.
 *
 * 순자산 = 모든 계좌 잔액 − 부채 + 주식 평가액(원화 환산)
 * 증권계좌 현금은 매수할 때 줄고 그 자리를 주식 평가액이 대신하므로
 * 이중으로 잡히지 않는다.
 */
export function NetWorthCard({
  breakdown,
  receivable = 0,
}: {
  breakdown: NetWorthBreakdown;
  /** 아직 못 받은 정산금. 순자산에는 넣지 않되 기준을 밝힌다 */
  receivable?: number;
}) {
  return (
    <section className="mt-2 bg-white px-4 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">순자산</h2>
        <Link to="/investments" className="flex items-center text-xs text-slate-400">
          투자 <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
        {formatKrw(breakdown.netWorth)}
      </p>

      {/* 현금성 / 투자 비율 — 두 조각뿐이라 도넛보다 가로 막대가 읽기 쉽다 */}
      <div className="mt-3">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100">
          <div
            style={{
              width: `${breakdown.cashRatio * 100}%`,
              backgroundColor: CASH_COLOR,
            }}
          />
          <div
            style={{
              width: `${breakdown.investmentRatio * 100}%`,
              backgroundColor: INVEST_COLOR,
            }}
          />
        </div>

        <ul className="mt-2 space-y-1.5 text-sm">
          <Row
            color={CASH_COLOR}
            label="현금성 자산"
            amount={breakdown.cashAssets}
            ratio={breakdown.cashRatio}
          />
          <Row
            color={INVEST_COLOR}
            label="투자 자산"
            amount={breakdown.investmentAssets}
            ratio={breakdown.investmentRatio}
          />
          {breakdown.liabilities > 0 && (
            <li className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-slate-300" />
              <span className="flex-1 text-slate-700">갚을 돈</span>
              <span className="w-28 text-right font-medium tabular-nums text-red-600">
                -{formatKrw(breakdown.liabilities)}
              </span>
            </li>
          )}
        </ul>
      </div>

      {/*
        못 받을 수도 있는 돈이라 순자산에 넣지 않는다.
        다만 기준을 적지 않으면 "왜 22,500원이 빠졌지?" 하고 헷갈린다.
      */}
      {receivable > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          아직 못 받은 정산금 {formatKrw(receivable)}은 순자산에 넣지 않았습니다. 받으면
          현금성 자산으로 잡힙니다.
        </p>
      )}
    </section>
  );
}

function Row({
  color,
  label,
  amount,
  ratio,
}: {
  color: string;
  label: string;
  amount: number;
  ratio: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-slate-700">{label}</span>
      <span className="tabular-nums text-slate-400">{formatPercent(ratio, 0)}</span>
      <span className="w-28 text-right font-medium tabular-nums text-slate-900">
        {formatKrw(amount)}
      </span>
    </li>
  );
}

export interface TrendPoint {
  date: string;
  label: string;
  netWorth: number;
}

/**
 * 순자산 추이 — 최근 6개월.
 *
 * 스냅샷은 앱을 열 때마다 하루 하나씩 쌓이므로 1년이면 365개가 된다.
 * 그걸 다 그리면 읽을 수 없으니 **각 달의 마지막 값**만 쓴다.
 * (달마다 점 하나 → x축 라벨이 겹치지 않고, 달 사이 흐름이 보인다)
 *
 * 값 하나만 시간에 따라 보는 차트라 색을 여럿 쓰지 않는다.
 */
export function NetWorthTrend({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  const months = lastNMonths(currentMonth(), 6);

  const points: TrendPoint[] = monthlySnapshots(snapshots, months)
    // 기록이 없는 달은 건너뛴다 — 없는 값을 지어내지 않는다
    .filter((row): row is { month: string; snapshot: NetWorthSnapshot } => row.snapshot !== null)
    .map((row) => ({
      date: row.snapshot.date,
      label: `${Number(row.month.slice(5, 7))}월`,
      netWorth: row.snapshot.netWorth,
    }));

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-slate-400">
        앱을 열 때마다 그날의 순자산이 기록됩니다.
        <br />
        달이 바뀌면 여기에 추이가 그려집니다.
      </p>
    );
  }

  const first = points[0].netWorth;
  const last = points[points.length - 1].netWorth;
  const change = last - first;

  return (
    <div>
      <p className="text-xs text-slate-500">
        {formatKoreanMonth(months.find((m) => points[0].date.startsWith(m)) ?? months[0])} 이후{' '}
        <span className={`font-medium ${change >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
          {change >= 0 ? '+' : ''}
          {formatKrwCompact(change)}원
        </span>
      </p>

      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_BAR} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ACCENT_BAR} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              interval="preserveStartEnd"
              dy={2}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#cbd5e1' }} />

            <Area
              type="monotone"
              dataKey="netWorth"
              stroke={ACCENT_BAR}
              strokeWidth={2}
              fill="url(#netWorthFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{formatKoreanDate(point.date)}</p>
      <p className="text-slate-600">{formatKrw(point.netWorth)}</p>
    </div>
  );
}
