import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import { UpdateBanner } from '@/pwa/UpdateBanner';

/**
 * 하단 탭이 있는 화면들의 공통 틀.
 *
 * 입력 화면(/input)은 이 틀 밖에 있다. 탭 바를 가리고 전체 화면을 쓴다.
 */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col bg-slate-50">
      {/* 탭 바(56px) + 홈바 높이만큼 아래를 비워 둬야 마지막 항목이 가리지 않는다 */}
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <UpdateBanner />
      <TabBar />
    </div>
  );
}

/** 화면 상단 제목 줄. 노치 아래로 내려오도록 pt-safe 를 준다 */
export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex min-h-14 items-center justify-between gap-2 px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
