import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { accountBalance, accountBalanceView } from '@/core/accounts';
import { formatKrw } from '@/core/money';
import { parseKrwInput } from '@/core/amountInput';
import { AmountField } from '@/components/AmountField';
import { db } from '@/db/schema';
import { insert, patch } from '@/db/repo';
import { useAccounts, useLedger } from '@/hooks/useData';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Account, AccountKind, ID } from '@/types';
import { SubScreen } from './SubScreen';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: '현금' },
  { value: 'bank', label: '은행' },
  { value: 'credit', label: '신용카드' },
  { value: 'brokerage', label: '증권' },
];

const KIND_LABEL: Record<AccountKind, string> = {
  cash: '현금', bank: '은행계좌', debit: '체크카드', credit: '신용카드', brokerage: '증권계좌',
};

export function AccountsScreen() {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const accounts = useAccounts();
  const ledger = useLedger();
  const trades = useLiveQuery(() => db.trades.toArray(), []);

  const balances = useMemo(() => {
    if (!accounts || !ledger || !trades) return new Map<ID, number>();
    return new Map(
      accounts.map((a) => [a.id, accountBalance(a, ledger, trades)]),
    );
  }, [accounts, ledger, trades]);

  return (
    <SubScreen
      title="계좌"
      action={
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label="계좌 추가"
          className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      {!accounts && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      <ul className="mt-2 divide-y divide-slate-100 bg-white">
        {accounts?.map((account) => {
          const view = accountBalanceView(account, balances.get(account.id) ?? 0);

          return (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => setEditing(account)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50"
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color ?? '#94a3b8' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">
                    {account.name}
                    {account.archived && (
                      <span className="ml-1.5 text-[11px] text-slate-400">숨김</span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {KIND_LABEL[account.kind]}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] text-slate-400">{view.label}</span>
                  <span
                    className={`block text-sm font-semibold ${
                      view.isDebt ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    {formatKrw(view.displayAmount)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="px-4 py-4 text-xs text-slate-400">
        잔액은 초기 잔액에 거래·정산·매매를 모두 더한 값입니다. 직접 고칠 수 없고,
        맞지 않으면 초기 잔액을 조정하세요.
      </p>

      <AccountSheet
        open={editing !== null}
        account={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </SubScreen>
  );
}

function AccountSheet({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account: Account | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [initialBalance, setInitialBalance] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 시트를 열 때마다 대상 계좌 값으로 채운다
  const key = `${open}-${account?.id ?? 'new'}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (open && loadedKey !== key) {
    setLoadedKey(key);
    setName(account?.name ?? '');
    setKind(account?.kind ?? 'bank');
    setInitialBalance(account ? String(account.initialBalance) : '');
    setArchived(account?.archived ?? false);
    setError(null);
    setConfirmDelete(false);
  }

  const parsedBalance = parseKrwInput(initialBalance);
  const amount = parsedBalance.value;

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('계좌 이름을 입력해 주세요.');
      return;
    }
    // 초기 잔액은 0 도 정상이지만, 해석이 안 되는 글자는 막는다
    if (parsedBalance.error) {
      setError(parsedBalance.error);
      return;
    }

    try {
      if (account) {
        await patch(db.accounts, account.id, {
          name: name.trim(), kind, initialBalance: amount, archived,
          isLiability: kind === 'credit',
        });
      } else {
        const count = await db.accounts.count();
        await insert(db.accounts, {
          name: name.trim(), kind, initialBalance: amount,
          isLiability: kind === 'credit',
          archived: false, order: count,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function destroy() {
    if (!account) return;

    // 거래가 남아 있으면 지우지 않는다 — 지우면 그 거래들이 떠버린다
    const used = await db.transactions
      .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
      .count();

    if (used > 0) {
      setError(`이 계좌를 쓰는 거래가 ${used}건 있습니다. 대신 '숨김'으로 두세요.`);
      setConfirmDelete(false);
      return;
    }

    await db.accounts.delete(account.id);
    onClose();
  }

  return (
    <BottomSheet open={open} title={account ? '계좌 수정' : '계좌 추가'} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <label className="block">
          <span className="text-xs text-slate-500">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 카카오뱅크"
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 px-3"
          />
        </label>

        <div>
          <p className="mb-1.5 text-xs text-slate-500">종류</p>
          <Segment options={KINDS} value={kind} onChange={setKind} />
          {kind === 'credit' && (
            <p className="mt-1.5 text-xs text-slate-500">
              신용카드는 쓴 만큼 '갚을 돈'으로 쌓이고 순자산에서 빠집니다.
            </p>
          )}
        </div>

        <AmountField label="초기 잔액" value={initialBalance} onChange={setInitialBalance} />

        {account && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
              className="size-5 rounded border-slate-300"
            />
            숨기기
            <span className="text-xs text-slate-400">(입력 목록에서 빠집니다)</span>
          </label>
        )}

        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
        >
          저장
        </button>

        {account &&
          (confirmDelete ? (
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
              계좌 삭제
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
