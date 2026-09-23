import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * 아래에서 올라오는 시트.
 *
 * 모바일에서 모달 대신 쓴다. 손가락이 닿는 화면 아래쪽에 버튼이 오고,
 * 뒷배경을 탭하면 닫혀서 "뒤로" 동작이 자연스럽다.
 * hover 에 기대는 동작이 없어야 하므로 닫기 버튼을 항상 보여준다.
 */
export interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 화면 높이의 몇 %까지 차오를지 */
  maxHeight?: string;
}

export function BottomSheet({ open, title, onClose, children, maxHeight = '80vh' }: BottomSheetProps) {
  // 시트가 열려 있는 동안 뒤 화면이 스크롤되지 않게 막는다
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pb-safe relative flex flex-col rounded-t-2xl bg-white shadow-xl"
        style={{ maxHeight }}
      >
        <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
