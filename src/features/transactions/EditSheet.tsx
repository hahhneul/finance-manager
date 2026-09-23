import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { db } from '@/db/schema';
import { patch, remove } from '@/db/repo';
import { splitBill, validateSettlement } from '@/core/settlement';
import { formatKrw } from '@/core/money';
import { categoryPath } from '@/core/recent';
import type { Account, Category, ID } from '@/types';
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
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 시트가 열릴 때마다 지금 줄의 값으로 다시 채운다
  useEffect(() => {
    if (!row) return;

    setError(null);
    setConfirmDelete(false);
    setDate(row.date);

    if (row.settlement) {
      setAmount(String(row.settlement.totalAmount));
      setMemo(row.settlement.title);
      setHeadcount(row.settlement.headcount);
    } else if (row.transaction) {
      setAmount(String(row.transaction.amount));
      setMemo(row.transaction.memo);
    }
  }, [row]);

  if (!row) return null;

  const numericAmount = Number(amount.replace(/[^0-9]/g, '')) || 0;
  const preview =
    row.settlement && numericAmount > 0 ? splitBill(numericAmount, headcount) : null;

  const accountName = (id?: ID) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id?: ID) =>
    categoryPath(categories.find((c) => c.id === id), categories);

  async function save() {
    setError(null);

    try {
      if (row!.settlement) {
        const split = splitBill(numericAmount, headcount);
        const errors = validateSettlement({
          totalAmount: numericAmount,
          headcount,
          myShare: split.myShare,
          reimbursedAmount: split.reimbursedAmount,
        });
        if (errors.length > 0) throw new Error(errors.join(' '));

        await patch(db.settlements, row!.id, {
          date,
          title: memo || '정산',
          totalAmount: numericAmount,
          headcount,
          myShare: split.myShare,
          reimbursedAmount: split.reimbursedAmount,
        });
      } else {
        if (numericAmount <= 0) throw new Error('금액은 0원보다 커야 합니다.');
        await patch(db.transactions, row!.id, { date, amount: numericAmount, memo });
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
        {/* 바꿀 수 없는 정보는 읽기 전용으로 보여준다 */}
        <dl className="rounded-lg bg-slate-50 p-3 text-xs">
          {row.settlement ? (
            <>
              <Line label="계산한 계좌" value={accountName(row.settlement.payerAccountId)} />
              <Line label="정산 받을 계좌" value={accountName(row.settlement.receiverAccountId)} />
              <Line label="카테고리" value={categoryName(row.settlement.categoryId)} />
              <Line
                label="정산 상태"
                value={row.settlement.receivedDate ? '받음' : '아직 못 받음'}
              />
            </>
          ) : (
            <>
              <Line
                label="유형"
                value={
                  tx?.type === 'income' ? '수입' : tx?.type === 'transfer' ? '이체' : '지출'
                }
              />
              <Line label="계좌" value={accountName(tx?.accountId)} />
              {tx?.type === 'transfer' && (
                <Line label="받는 계좌" value={accountName(tx.toAccountId)} />
              )}
              {tx?.type !== 'transfer' && (
                <Line label="카테고리" value={categoryName(tx?.categoryId)} />
              )}
            </>
          )}
        </dl>

        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </Field>

        <Field label={row.settlement ? '결제 총액' : '금액'}>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            className="min-h-12 w-full rounded-lg border border-slate-200 px-3 text-right"
          />
        </Field>

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
    </BottomSheet>
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
