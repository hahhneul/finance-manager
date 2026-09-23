import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { AccountPicker } from '@/features/input/pickers';
import { CategoryPicker } from '@/features/input/CategoryGrid';
import { db } from '@/db/schema';
import { clearSettlementReceipt, patch, recordSettlementReceipt, remove } from '@/db/repo';
import {
  outstanding,
  receivedSoFar,
  splitBill,
  validateSettlement,
} from '@/core/settlement';
import { parseKrwInput, validateAmount } from '@/core/amountInput';
import { AmountField } from '@/components/AmountField';
import { validateAmount as checkAmount } from '@/core/amountInput';
import { formatKrw } from '@/core/money';
import { formatKoreanDate, todayISO } from '@/core/date';
import { categoryPath } from '@/core/recent';
import type { Account, Category, ID, Settlement } from '@/types';
import type { LedgerRow } from '@/core/transactions';

/**
 * 목록에서 한 줄을 탭하면 열리는 수정·삭제 시트.
 *
 * 스와이프 삭제를 쓰지 않는 이유: 화면에 보이지 않는 동작이라 발견하기 어렵고,
 * 실수로 지워지기도 쉽다. 탭해서 열고 명시적으로 지우는 쪽이 안전하다.
 */
export function EditSheet({
  row,
  accounts,
  categories,
  onClose,
}: {
  row: LedgerRow | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState('');
  const [headcount, setHeadcount] = useState(2);
  const [accountId, setAccountId] = useState<ID | undefined>();
  const [toAccountId, setToAccountId] = useState<ID | undefined>();
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [flow, setFlow] = useState<'income' | 'expense'>('expense');
  const [sheet, setSheet] = useState<'account' | 'toAccount' | 'category' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** 입금 기록 칸에 친 금액 (비어 있으면 남은 금액 전부) */
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(todayISO());

  // 시트가 열릴 때마다 지금 줄의 값으로 다시 채운다
  useEffect(() => {
    if (!row) return;

    setError(null);
    setConfirmDelete(false);
    setDate(row.date);

    setSheet(null);
    setReceiptAmount('');
    setReceiptDate(todayISO());

    if (row.settlement) {
      setAmount(String(row.settlement.totalAmount));
      setMemo(row.settlement.title);
      setHeadcount(row.settlement.headcount);
      setAccountId(row.settlement.payerAccountId);
      setToAccountId(row.settlement.receiverAccountId);
      setCategoryId(row.settlement.categoryId);
      setFlow('expense');
    } else if (row.transaction) {
      setAmount(String(row.transaction.amount));
      setMemo(row.transaction.memo);
      setAccountId(row.transaction.accountId);
      setToAccountId(row.transaction.toAccountId);
      setCategoryId(row.transaction.categoryId);
      setFlow(row.transaction.type === 'income' ? 'income' : 'expense');
    }
  }, [row]);

  if (!row) return null;

  const numericAmount = parseKrwInput(amount).value;
  const preview =
    row.settlement && numericAmount > 0 ? splitBill(numericAmount, headcount) : null;

  const accountName = (id?: ID) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id?: ID) =>
    categoryPath(categories.find((c) => c.id === id), categories);

  async function save() {
    setError(null);

    try {
      const checked = validateAmount(amount);
      if (checked.error) throw new Error(checked.error);

      if (row!.settlement) {
        const split = splitBill(checked.value, headcount);
        const errors = validateSettlement({
          totalAmount: checked.value,
          headcount,
          myShare: split.myShare,
          reimbursedAmount: split.reimbursedAmount,
        });
        if (errors.length > 0) throw new Error(errors.join(' '));

        if (!accountId || !toAccountId) throw new Error('계좌를 골라 주세요.');

        await patch(db.settlements, row!.id, {
          date,
          title: memo || '정산',
          totalAmount: checked.value,
          headcount,
          myShare: split.myShare,
          reimbursedAmount: split.reimbursedAmount,
          payerAccountId: accountId,
          receiverAccountId: toAccountId,
          categoryId,
        });
      } else {
        if (!accountId) throw new Error('계좌를 골라 주세요.');

        const isTransfer = tx?.type === 'transfer';
        if (isTransfer && !toAccountId) throw new Error('받는 계좌를 골라 주세요.');
        if (isTransfer && accountId === toAccountId) {
          throw new Error('같은 계좌로는 이체할 수 없습니다.');
        }

        await patch(db.transactions, row!.id, {
          date,
          amount: checked.value,
          memo,
          accountId,
          // 이체가 아니면 받는 계좌를 지운다
          toAccountId: isTransfer ? toAccountId : undefined,
          // 이체에는 카테고리가 없다
          categoryId: isTransfer ? undefined : categoryId,
          ...(isTransfer ? {} : { type: flow }),
        });
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function destroy() {
    if (row!.settlement) await remove(db.settlements, row!.id);
    else await remove(db.transactions, row!.id);
    onClose();
  }

  const tx = row.transaction;

  return (
    <BottomSheet open title={row.settlement ? '정산 수정' : '거래 수정'} onClose={onClose}>
      <div className="space-y-3 pb-2">
        {/* 지출 ↔ 수입 전환. 이체는 구조가 달라 여기서 바꾸지 않는다 */}
        {tx && tx.type !== 'transfer' && (
          <div>
            <p className="mb-1.5 text-xs text-slate-500">유형</p>
            <Segment
              options={[
                { value: 'expense' as const, label: '지출' },
                { value: 'income' as const, label: '수입' },
              ]}
              value={flow}
              onChange={(next) => {
                setFlow(next);
                // 지출 카테고리를 수입에 그대로 쓸 수 없다
                setCategoryId(undefined);
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSheet('account')}
            className="min-h-12 truncate rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
          >
            <span className="block text-[10px] text-slate-400">
              {row.settlement ? '계산한 계좌' : tx?.type === 'transfer' ? '보내는 계좌' : '계좌'}
            </span>
            {accountName(accountId)}
          </button>

          {(row.settlement || tx?.type === 'transfer') && (
            <button
              type="button"
              onClick={() => setSheet('toAccount')}
              className="min-h-12 truncate rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
            >
              <span className="block text-[10px] text-slate-400">
                {row.settlement ? '정산 받을 계좌' : '받는 계좌'}
              </span>
              {accountName(toAccountId)}
            </button>
          )}

          {tx?.type !== 'transfer' && (
            <button
              type="button"
              onClick={() => setSheet('category')}
              className="min-h-12 truncate rounded-lg bg-slate-50 px-3 text-left text-sm active:bg-slate-100"
            >
              <span className="block text-[10px] text-slate-400">카테고리</span>
              {categoryName(categoryId)}
            </button>
          )}
        </div>

        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </Field>

        <AmountField
          label={row.settlement ? '결제 총액' : '금액'}
          value={amount}
          onChange={setAmount}
        />

        {row.settlement && <ReceiptPanel
          settlement={row.settlement}
          amount={receiptAmount}
          date={receiptDate}
          onAmountChange={setReceiptAmount}
          onDateChange={setReceiptDate}
          onError={setError}
          onDone={onClose}
        />}

        {row.settlement && (
          <Field label="인원 (나 포함)">
            <div className="grid grid-cols-6 gap-1.5">
              {[2, 3, 4, 5, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHeadcount(n)}
                  className={`min-h-11 rounded-lg text-sm font-medium ${
                    n === headcount
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
        )}

        {preview && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">내 부담</span>
              <span className="font-semibold">{formatKrw(preview.myShare)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-600">돌려받을 돈</span>
              <span className="font-medium text-emerald-700">
                {formatKrw(preview.reimbursedAmount)}
              </span>
            </div>
          </div>
        )}

        <Field label={row.settlement ? '정산 이름' : '메모'}>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </Field>

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-12 flex-1 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void destroy()}
              className="min-h-12 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
            >
              정말 삭제
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 active:bg-red-50"
          >
            <Trash2 className="size-4" />
            삭제
          </button>
        )}
      </div>

      <BottomSheet
        open={sheet === 'account'}
        title={row.settlement ? '계산한 계좌' : tx?.type === 'transfer' ? '보내는 계좌' : '계좌'}
        onClose={() => setSheet(null)}
      >
        <AccountPicker
          accounts={accounts}
          selectedId={accountId}
          excludeId={tx?.type === 'transfer' ? toAccountId : undefined}
          onSelect={(id) => {
            setAccountId(id);
            setSheet(null);
    setReceiptAmount('');
    setReceiptDate(todayISO());
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'toAccount'}
        title={row.settlement ? '정산 받을 계좌' : '받는 계좌'}
        onClose={() => setSheet(null)}
      >
        <AccountPicker
          accounts={accounts}
          selectedId={toAccountId}
          // 이체는 같은 계좌끼리 못 한다. 정산은 같은 계좌로 받아도 된다.
          excludeId={tx?.type === 'transfer' ? accountId : undefined}
          onSelect={(id) => {
            setToAccountId(id);
            setSheet(null);
    setReceiptAmount('');
    setReceiptDate(todayISO());
          }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'category'} title="카테고리" onClose={() => setSheet(null)}>
        <CategoryPicker
          categories={categories}
          flow={flow}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setSheet(null);
    setReceiptAmount('');
    setReceiptDate(todayISO());
          }}
        />
      </BottomSheet>
    </BottomSheet>
  );
}

/**
 * 정산금 입금 기록.
 *
 * 일부만 받아도 되고, 여러 번 나눠 받아도 된다.
 * 받은 돈은 **수입이 아니다** — 빌려준 돈을 돌려받은 것이라
 * 계좌 잔액만 늘고 수입 통계에는 잡히지 않는다.
 */
function ReceiptPanel({
  settlement,
  amount,
  date,
  onAmountChange,
  onDateChange,
  onError,
  onDone,
}: {
  settlement: Settlement;
  amount: string;
  date: string;
  onAmountChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onError: (v: string | null) => void;
  onDone: () => void;
}) {
  const received = receivedSoFar(settlement);
  const remaining = outstanding(settlement);
  const done = remaining === 0;

  async function record() {
    onError(null);
    // 비워 두면 남은 금액 전부를 받은 것으로 한다 (가장 흔한 경우)
    const raw = amount.trim() === '' ? String(remaining) : amount;
    const checked = checkAmount(raw);

    if (checked.error) return onError(checked.error);

    try {
      await recordSettlementReceipt(settlement.id, checked.value, date);
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={`rounded-lg p-3 ${done ? 'bg-emerald-50' : 'bg-amber-50'}`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className={done ? 'text-emerald-800' : 'text-amber-900'}>
          {done ? '다 받았습니다' : '아직 못 받은 돈'}
        </span>
        <span className={`text-sm font-semibold ${done ? 'text-emerald-900' : 'text-amber-900'}`}>
          {formatKrw(remaining)}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-slate-600">
        돌려받을 금액 {formatKrw(settlement.reimbursedAmount)} 중 {formatKrw(received)} 받음
        {settlement.receivedDate && ` · 마지막 입금 ${formatKoreanDate(settlement.receivedDate)}`}
      </p>

      {!done && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder={`${remaining}`}
              aria-label="입금액"
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm"
            />
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              aria-label="입금일"
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => void record()}
            className="min-h-11 w-full rounded-lg bg-amber-600 text-sm font-semibold text-white active:bg-amber-700"
          >
            입금 기록 {amount.trim() === '' && `· 전액 ${formatKrw(remaining)}`}
          </button>

          <p className="text-[11px] text-slate-500">
            일부만 받았으면 금액을 적으세요. 비워 두면 전액으로 기록합니다.
            받은 돈은 수입이 아니라 계좌 잔액에만 더해집니다.
          </p>
        </div>
      )}

      {done && settlement.receivedDate && (
        <button
          type="button"
          onClick={async () => {
            await clearSettlementReceipt(settlement.id);
            onDone();
          }}
          className="mt-2 min-h-11 w-full rounded-lg bg-white text-xs font-medium text-slate-600 active:bg-slate-100"
        >
          입금 기록 취소
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
