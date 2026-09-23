import { BottomSheet } from '@/components/BottomSheet';
import { deleteTrade } from '@/db/repo';
import { formatKoreanDate } from '@/core/date';
import { formatMoney, formatQuantity } from '@/core/money';
import { holdingKey, tradeKey, type Position } from '@/core/holdings';
import type { Trade } from '@/types';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

/** 한 종목의 매매 기록. 지우면 수량·평단이 자동으로 다시 계산된다 */
export function TradeHistorySheet({
  position,
  trades,
  onClose,
}: {
  position: Position | null;
  trades: Trade[];
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (!position) return null;

  const key = holdingKey(
    position.holding.accountId,
    position.holding.market,
    position.holding.symbol,
  );
  const rows = trades
    .filter((t) => tradeKey(t) === key)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const currency = position.holding.currency;

  return (
    <BottomSheet
      open
      title={`${position.holding.name} 매매 기록`}
      onClose={onClose}
      maxHeight="80vh"
    >
      <div className="pb-2">
        <p className="mb-3 text-xs text-slate-500">
          수량과 평균 매입가는 이 기록에서 계산됩니다. 하나를 지우면 다시 계산됩니다.
        </p>

        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((trade) => (
            <li key={trade.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm">
                  <span
                    className={`font-medium ${
                      trade.side === 'buy' ? 'text-red-600' : 'text-blue-600'
                    }`}
                  >
                    {trade.side === 'buy' ? '매수' : '매도'}
                  </span>
                  <span className="ml-1.5 text-slate-900">
                    {formatQuantity(trade.quantity)}주
                  </span>
                </span>
                <span className="text-sm text-slate-700">
                  {formatMoney(trade.price, currency)}
                </span>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-slate-500">
                <span>
                  {formatKoreanDate(trade.date)}
                  {trade.fee > 0 && ` · 수수료 ${formatMoney(trade.fee, currency)}`}
                  {trade.tax ? ` · 세금 ${formatMoney(trade.tax, currency)}` : ''}
                </span>

                {confirmId === trade.id ? (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="text-slate-500"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteTrade(trade.id);
                        setConfirmId(null);
                      }}
                      className="font-medium text-red-600"
                    >
                      정말 삭제
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(trade.id)}
                    aria-label="이 기록 삭제"
                    className="flex size-8 shrink-0 items-center justify-center text-slate-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {position.state.realizedPnl !== 0 && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">실현손익 누계 </span>
            <span
              className={`font-semibold ${
                position.state.realizedPnl >= 0 ? 'text-red-600' : 'text-blue-600'
              }`}
            >
              {formatMoney(position.state.realizedPnl, currency)}
            </span>
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
