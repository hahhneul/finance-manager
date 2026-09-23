import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** 설정 하위 화면들의 공통 머리 (뒤로 가기 + 제목 + 오른쪽 버튼) */
export function SubScreen({
  title,
  backTo = '/more',
  action,
  children,
}: {
  title: string;
  backTo?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex min-h-14 items-center gap-1 px-2">
          <Link
            to={backTo}
            aria-label="뒤로"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-semibold">{title}</h1>
          {action}
        </div>
      </header>
      {children}
    </>
  );
}
