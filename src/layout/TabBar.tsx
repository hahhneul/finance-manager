import { NavLink, useNavigate } from 'react-router-dom';
import { Home, LayoutGrid, List, PiggyBank, Plus } from 'lucide-react';

/**
 * 하단 탭 4개 + 가운데 입력 버튼.
 *
 * 입력이 가장 잦은 동작이라 엄지가 자연스럽게 닿는 가운데에 크게 뒀다.
 * 아이폰 홈바에 가리지 않도록 pb-safe 로 아래 여백을 준다.
 */
interface Tab {
  to: string;
  label: string;
  icon: typeof Home;
  end: boolean;
}

/** null 은 가운데 ＋ 버튼이 들어갈 빈 자리 */
const SLOTS: (Tab | null)[] = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/transactions', label: '내역', icon: List, end: false },
  null,
  { to: '/budget', label: '예산', icon: PiggyBank, end: false },
  { to: '/more', label: '전체', icon: LayoutGrid, end: false },
];

export function TabBar() {
  const navigate = useNavigate();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {SLOTS.map((tab) =>
          tab === null ? (
            <div key="center-slot" aria-hidden />
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  isActive ? 'text-slate-900' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} />
                  {tab.label}
                </>
              )}
            </NavLink>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate('/input')}
        aria-label="거래 입력"
        className="absolute inset-x-0 -top-5 mx-auto flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 active:bg-slate-700"
      >
        <Plus className="size-7" strokeWidth={2.4} />
      </button>
    </nav>
  );
}
