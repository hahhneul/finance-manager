import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { ACCENT_BAR, MUTED_BAR } from '@/core/chartColors';
import { formatKrw, formatKrwCompact, formatPercent } from '@/core/money';

/**
 * 차트 두 개.
 *
 * 색은 core/chartColors.ts 에서만 가져온다. 여기서 색을 새로 만들지 않는다.
 * 글자는 항상 회색 계열이고, 색은 옆의 점·막대가 담당한다
 * (숫자를 계열 색으로 칠하면 색맹인 사람에게는 그냥 읽기 힘든 글자가 된다).
 */

export interface DonutSlice {
  id: string;
  name: string;
  amount: number;
  ratio: number;
  color: string;
}

/**
 * 카테고리별 지출 도넛.
 *
 * 조각이 6개를 넘으면 읽을 수 없어서 호출하는 쪽에서 '기타'로 접어 넘긴다.
 * 도넛만으로는 가까운 값끼리 구분이 안 되므로 **아래 목록에 금액을 같이 적는다**.
 * (색 대비가 낮은 조각이 있어도 숫자로 읽을 수 있어야 한다)
 */
export function ExpenseDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  if (slices.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">이번 달 지출이 없습니다.</p>
    );
  }

  return (
    <div>
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              // 조각 사이 2px 틈 — 경계가 색에만 의존하지 않게
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.id} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* 도넛 가운데에 총액 */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-slate-500">이번 달 지출</span>
          <span className="text-lg font-semibold text-slate-900">
            {formatKrwCompact(total)}원
          </span>
        </div>
      </div>

      {/* 색만으로는 구분이 안 되므로 금액을 함께 적는다 */}
      <ul className="mt-3 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 truncate text-slate-700">{slice.name}</span>
            <span className="tabular-nums text-slate-400">{formatPercent(slice.ratio, 0)}</span>
            <span className="w-24 text-right font-medium tabular-nums text-slate-900">
              {formatKrw(slice.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { payload: DonutSlice }[] }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{slice.name}</p>
      <p className="text-slate-600">
        {formatKrw(slice.amount)} · {formatPercent(slice.ratio, 1)}
      </p>
    </div>
  );
}

export interface TrendBar {
  month: string;
  label: string;
  expense: number;
  /** 지금 보고 있는 달인가 */
  current: boolean;
}

/**
 * 최근 6개월 지출 막대.
 *
 * 한 가지 값만 보는 차트라 색을 여러 개 쓰지 않는다.
 * 지금 보고 있는 달만 진하게, 나머지는 회색으로 둬서 비교 기준이 분명해진다.
 */
export function ExpenseTrend({
  bars,
  onSelect,
}: {
  bars: TrendBar[];
  onSelect?: (month: string) => void;
}) {
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            height={38}
            interval={0}
            tick={(props: unknown) => renderTick(props, bars)}
          />
          <Tooltip
            content={<TrendTooltip />}
            cursor={{ fill: '#f1f5f9' }}
          />
          <Bar
            dataKey="expense"
            // 막대 끝만 둥글게. 바닥은 기준선에 붙어 있어야 길이를 비교할 수 있다
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(data: unknown) => {
              const bar = data as TrendBar | undefined;
              if (bar?.month && onSelect) onSelect(bar.month);
            }}
          >
            {bars.map((bar) => (
              <Cell
                key={bar.month}
                fill={bar.current ? ACCENT_BAR : MUTED_BAR}
                cursor={onSelect ? 'pointer' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * X축 눈금 — 달 이름은 모두, 금액은 **보고 있는 달에만** 적는다.
 *
 * 막대마다 숫자를 달면 여섯 개가 서로 붙어 읽기 어려워진다.
 * 나머지 달의 값은 막대를 눌러서(툴팁) 보거나 그 달로 이동해서 본다.
 */
interface TickProps {
  x?: number;
  y?: number;
  index?: number;
}

function renderTick(props: unknown, bars: TrendBar[]) {
  const { x = 0, y = 0, index = 0 } = props as TickProps;
  const bar = bars[index];
  if (!bar) return <g />;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        textAnchor="middle"
        dy={12}
        fontSize={11}
        fill={bar.current ? '#334155' : '#94a3b8'}
        fontWeight={bar.current ? 600 : 400}
      >
        {bar.label}
      </text>
      {bar.current && bar.expense > 0 && (
        <text textAnchor="middle" dy={26} fontSize={11} fontWeight={600} fill="#334155">
          {formatKrwCompact(bar.expense)}원
        </text>
      )}
    </g>
  );
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendBar }[] }) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{bar.label}</p>
      <p className="text-slate-600">{formatKrw(bar.expense)}</p>
    </div>
  );
}
