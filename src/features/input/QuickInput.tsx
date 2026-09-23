import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Users, Wand2, X } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Segment } from '@/components/Segment';
import { formatKrw } from '@/core/money';
import { todayISO } from '@/core/date';
import { lastUsedAccountId, rankCategories } from '@/core/recent';
import { splitBill } from '@/core/settlement';
import { applyRules } from '@/core/rules';
import { objectParticle } from '@/core/korean';
import { loadRules } from '@/db/repo';
import { saveSettlement, saveTransaction } from '@/db/repo';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccounts, useAllTransactions, useCategories } from '@/hooks/useData';
import type { ID, TxType } from '@/types';
import { AmountKeypad, appendDigit, removeDigit } from './AmountKeypad';
import { CategoryGrid, CategoryPicker } from './CategoryGrid';
import { AccountPicker, DatePicker, formatDateLabel } from './pickers';

/** 화면에서 고를 수 있는 입력 종류. 정산은 Transaction 이 아니라 Settlement 로 저장된다 */
type InputMode = TxType | 'settlement';

const MODES = [
  { value: 'expense' as const, label: '지출' },
  { value: 'income' as const, label: '수입' },
  { value: 'transfer' as const, label: '이체' },
  { value: 'settlement' as const, label: '정산' },
];

type SheetName = 'account' | 'toAccount' | 'date' | 'category' | null;

/**
 * 빠른 입력.
 *
 * 목표는 "금액 → 카테고리 → 저장" 3동작이다.
 * 그래서 날짜·계좌는 기본값(오늘 / 마지막 쓴 계좌)으로 미리 채워 두고,
 * 바꾸고 싶을 때만 시트를 열게 한다.
 */
export function QuickInput() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useAllTransactions();

  const [mode, setMode] = useState<InputMode>('expense');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<ID | undefined>();
  const [toAccountId, setToAccountId] = useState<ID | undefined>();
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const [memo, setMemo] = useState('');
  const [headcount, setHeadcount] = useState(2);
  const [received, setReceived] = useState(true);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 규칙이 골라 준 카테고리인지 (직접 고른 것을 덮어쓰지 않으려고 구분한다) */
  const [autoPicked, setAutoPicked] = useState<{ ruleValue: string } | null>(null);

  const rules = useLiveQuery(() => loadRules(), []);

  // 정산은 늘 지출이므로 지출 카테고리를 쓴다
  const flow = mode === 'income' ? 'income' : 'expense';

  const quickCategories = useMemo(() => {
    if (!categories || !transactions) return [];
    // 4열 그리드에서 '전체' 버튼이 마지막 칸을 쓰므로 7개만 띄운다 (2줄로 딱 맞는다)
    return rankCategories(transactions, categories, { flow, today: todayISO(), limit: 7 });
  }, [categories, transactions, flow]);

  // 마지막으로 쓴 계좌를 기본값으로. 없으면 첫 계좌.
  const defaultAccountId = useMemo(() => {
    if (!accounts?.length) return undefined;
    const last = transactions ? lastUsedAccountId(transactions) : undefined;
    return last && accounts.some((a) => a.id === last) ? last : accounts[0].id;
  }, [accounts, transactions]);

  const effectiveAccountId = accountId ?? defaultAccountId;
  const account = accounts?.find((a) => a.id === effectiveAccountId);
  const toAccount = accounts?.find((a) => a.id === toAccountId);
  const category = categories?.find((c) => c.id === categoryId);

  const split = mode === 'settlement' && amount > 0 ? splitBill(amount, headcount) : null;

  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    (mode !== 'transfer' || (!!toAccountId && toAccountId !== effectiveAccountId)) &&
    (mode !== 'settlement' || (!!toAccountId && headcount >= 1));

  /**
   * 메모를 칠 때마다 규칙을 맞춰 본다.
   *
   * 사용자가 **직접 고른 카테고리는 덮어쓰지 않는다.**
   * 규칙이 고른 것(autoPicked)만 다시 계산한다.
   */
  function onMemoChange(next: string) {
    setMemo(next);

    if (mode === 'transfer' || !rules) return;
    if (categoryId && !autoPicked) return;

    const match = applyRules({ memo: next, tags: [] }, rules);

    if (match) {
      setCategoryId(match.categoryId);
      setAutoPicked({ ruleValue: match.rule.value });
    } else if (autoPicked) {
      // 규칙이 더 이상 맞지 않으면 자동으로 골랐던 것을 거둔다
      setCategoryId(undefined);
      setAutoPicked(null);
    }
  }

  async function save() {
    if (!canSave || !effectiveAccountId || saving) return;

    setSaving(true);
    setError(null);

    try {
      if (mode === 'settlement') {
        await saveSettlement({
          date,
          title: memo || '정산',
          totalAmount: amount,
          headcount,
          payerAccountId: effectiveAccountId,
          receiverAccountId: toAccountId!,
          categoryId,
          received,
          memo: '',
          tags: ['정산'],
        });
      } else {
        await saveTransaction({
          date,
          type: mode,
          amount,
          accountId: effectiveAccountId,
          toAccountId: mode === 'transfer' ? toAccountId : undefined,
          categoryId: mode === 'transfer' ? undefined : categoryId,
          memo,
          tags: [],
        });
      }

      navigate('/transactions');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  if (!accounts || !categories) {
    return <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col bg-white">
      <header className="pt-safe shrink-0 border-b border-slate-100">
        <div className="flex min-h-14 items-center justify-between px-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="닫기"
            className="flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <X className="size-5" />
          </button>
          <h1 className="text-base font-semibold">거래 입력</h1>
          <div className="size-11" aria-hidden />
        </div>
      </header>

      <div className="shrink-0 px-4 py-3">
        <Segment
          options={MODES}
          value={mode}
          onChange={(next) => {
            setMode(next);
            // 이체·정산은 받는 계좌가 따로 필요하고, 유형이 바뀌면 카테고리도 맞지 않는다
            setCategoryId(undefined);
            setAutoPicked(null);
            if (next !== 'transfer' && next !== 'settlement') setToAccountId(undefined);
          }}
        />
      </div>

      {/* 금액 */}
      <div className="shrink-0 px-4 pb-3">
        <p className="text-right text-3xl font-semibold tracking-tight text-slate-900">
          {formatKrw(amount)}
        </p>

        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <SelectorChip
            label={account?.name ?? '계좌 선택'}
            caption={mode === 'transfer' || mode === 'settlement' ? '보내는 곳' : undefined}
            onClick={() => setSheet('account')}
          />

          {(mode === 'transfer' || mode === 'settlement') && (
            <>
              <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
              <SelectorChip
                label={toAccount?.name ?? '받는 계좌'}
                caption={mode === 'settlement' ? '정산 받을 곳' : '받는 곳'}
                onClick={() => setSheet('toAccount')}
              />
            </>
          )}

          <SelectorChip label={formatDateLabel(date)} onClick={() => setSheet('date')} />
        </div>
      </div>

      {/* 카테고리 (이체는 없다) */}
      {mode !== 'transfer' && (
        <div className="shrink-0 px-4 pb-3">
          <CategoryGrid
            categories={quickCategories}
            selectedId={categoryId}
            onSelect={(id) => { setCategoryId(id); setAutoPicked(null); }}
            onOpenAll={() => setSheet('category')}
          />
          {category && (
            <p className="mt-1.5 text-xs text-slate-500">선택: {category.name}</p>
          )}
        </div>
      )}

      {/* 정산 전용 — 인원과 계산 결과 미리보기 */}
      {mode === 'settlement' && (
        <SettlementPanel
          headcount={headcount}
          onHeadcountChange={setHeadcount}
          received={received}
          onReceivedChange={setReceived}
          split={split}
        />
      )}

      <div className="shrink-0 px-4 pb-3">
        <input
          type="text"
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder={mode === 'settlement' ? '정산 이름 (예: 팀 회식)' : '메모'}
          className="min-h-12 w-full rounded-lg bg-slate-50 px-3 placeholder:text-slate-400"
        />

        {autoPicked && category && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
            <Wand2 className="size-3.5 shrink-0" />
            '{autoPicked.ruleValue}' 규칙으로 {objectParticle(category.name)} 골랐습니다.
            <button
              type="button"
              onClick={() => { setCategoryId(undefined); setAutoPicked(null); }}
              className="ml-auto shrink-0 font-medium text-slate-700 underline"
            >
              취소
            </button>
          </p>
        )}
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>
      )}

      {/* 키패드와 저장은 항상 화면 아래에 붙어 있다 */}
      <div className="pb-safe mt-auto shrink-0">
        <AmountKeypad
          onAppend={(key) => setAmount((current) => appendDigit(current, key))}
          onBackspace={() => setAmount(removeDigit)}
        />

        <div className="p-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Check className="size-5" />
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {/* --- 시트들 --- */}
      <BottomSheet
        open={sheet === 'account'}
        title={mode === 'settlement' ? '계산한 계좌' : '계좌'}
        onClose={() => setSheet(null)}
      >
        <AccountPicker
          accounts={accounts}
          selectedId={effectiveAccountId}
          onSelect={(id) => {
            setAccountId(id);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'toAccount'}
        title={mode === 'settlement' ? '정산 받을 계좌' : '받는 계좌'}
        onClose={() => setSheet(null)}
      >
        <AccountPicker
          accounts={accounts}
          selectedId={toAccountId}
          // 이체는 같은 계좌끼리 못 한다. 정산은 같은 계좌로 받아도 된다.
          excludeId={mode === 'transfer' ? effectiveAccountId : undefined}
          onSelect={(id) => {
            setToAccountId(id);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'date'} title="날짜" onClose={() => setSheet(null)}>
        <DatePicker
          value={date}
          onChange={(next) => {
            setDate(next);
            setSheet(null);
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
            setAutoPicked(null);
            setSheet(null);
          }}
        />
      </BottomSheet>
    </div>
  );
}

function SelectorChip({
  label,
  caption,
  onClick,
}: {
  label: string;
  caption?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg bg-slate-50 px-2.5 text-left active:bg-slate-100"
    >
      {caption && <span className="text-[10px] text-slate-400">{caption}</span>}
      <span className="truncate font-medium text-slate-700">{label}</span>
    </button>
  );
}

/**
 * 정산 인원과 계산 결과.
 *
 * 숫자를 입력하는 순간 "내 부담 얼마 / 돌려받을 돈 얼마"가 바로 보여야
 * 저장하기 전에 맞는지 확인할 수 있다.
 */
function SettlementPanel({
  headcount,
  onHeadcountChange,
  received,
  onReceivedChange,
  split,
}: {
  headcount: number;
  onHeadcountChange: (n: number) => void;
  received: boolean;
  onReceivedChange: (value: boolean) => void;
  split: { perPerson: number; myShare: number; reimbursedAmount: number } | null;
}) {
  return (
    <div className="shrink-0 space-y-2.5 px-4 pb-3">
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-500">
          <Users className="size-3.5" />
          인원 (나 포함)
        </p>
        <div role="group" aria-label="정산 인원" className="grid grid-cols-6 gap-1.5">
          {[2, 3, 4, 5, 6, 8].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onHeadcountChange(n)}
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
      </div>

      {split && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">1인당</span>
            <span className="font-medium">{formatKrw(split.perPerson)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-600">내 부담 (지출에 기록)</span>
            <span className="font-semibold text-slate-900">{formatKrw(split.myShare)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-600">돌려받을 돈</span>
            <span className="font-medium text-emerald-700">
              {formatKrw(split.reimbursedAmount)}
            </span>
          </div>
          {split.myShare !== split.perPerson && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              나누어떨어지지 않아 잔돈 {formatKrw(split.myShare - split.perPerson)}을 내가 부담합니다.
            </p>
          )}
        </div>
      )}

      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={received}
          onChange={(e) => onReceivedChange(e.target.checked)}
          className="size-5 rounded border-slate-300"
        />
        바로 정산받았음
        <span className="text-xs text-slate-400">(체크 해제 시 미수금)</span>
      </label>
    </div>
  );
}
