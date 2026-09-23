import { Delete } from 'lucide-react';

/**
 * 금액 전용 숫자 키패드.
 *
 * OS 키보드를 쓰지 않는 이유
 *  - iOS 는 글자 크기가 16px 미만이면 화면을 확대해 버린다
 *  - 키보드가 올라오면 카테고리 그리드가 가려서 "3탭 입력"이 깨진다
 *  - 한국 금액은 만원 단위가 잦아서 00 버튼이 실제로 빠르다
 *
 * 버튼은 전부 최소 44px 이상이고, hover 없이 active 상태만 쓴다.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

/** 1조원을 넘기면 더 받지 않는다 (실수로 길게 눌렀을 때 방어) */
const MAX_AMOUNT = 1_000_000_000_000;

export function appendDigit(amount: number, key: string): number {
  const next = Number(`${amount}${key}`);
  if (!Number.isFinite(next) || next > MAX_AMOUNT) return amount;
  return next;
}

export function removeDigit(amount: number): number {
  return Math.floor(amount / 10);
}

export function AmountKeypad({
  onAppend,
  onBackspace,
}: {
  onAppend: (key: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div role="group" aria-label="숫자 키패드" className="grid grid-cols-3 gap-px bg-slate-200">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onAppend(key)}
          className="min-h-14 bg-white text-xl font-medium text-slate-900 active:bg-slate-100"
        >
          {key}
        </button>
      ))}

      <button
        type="button"
        onClick={onBackspace}
        aria-label="지우기"
        className="flex min-h-14 items-center justify-center bg-white text-slate-500 active:bg-slate-100"
      >
        <Delete className="size-6" />
      </button>
    </div>
  );
}
