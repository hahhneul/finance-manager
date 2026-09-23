import { lazy, Suspense } from 'react';
import { createHashRouter, createBrowserRouter, RouterProvider } from 'react-router-dom';
import { APP } from './app.meta';
import { AppShell } from './layout/AppShell';
import { RouteError } from './components/RouteError';
import { QuickInput } from './features/input/QuickInput';
import { TransactionList } from './features/transactions/TransactionList';
import { MorePage } from './pages/MorePage';

/**
 * 대시보드만 따로 떼어 낸다.
 *
 * 차트 라이브러리(Recharts)가 번들에서 가장 큰데, 쓰는 곳은 홈 화면뿐이다.
 * 이렇게 두면 입력·내역 화면만 쓰는 동안에는 내려받지 않는다.
 */
const Dashboard = lazy(() =>
  import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })),
);

/**
 * 설정·관리 화면들도 따로 뗀다.
 *
 * 매일 쓰는 건 입력·내역·홈이고, 계좌나 백업 화면은 어쩌다 한 번 연다.
 * 첫 로딩에 같이 내려받을 이유가 없다.
 */
const BudgetScreen = lazy(() =>
  import('./features/budget/BudgetScreen').then((m) => ({ default: m.BudgetScreen })),
);
const RulesScreen = lazy(() =>
  import('./features/rules/RulesScreen').then((m) => ({ default: m.RulesScreen })),
);
const AccountsScreen = lazy(() =>
  import('./features/settings/AccountsScreen').then((m) => ({ default: m.AccountsScreen })),
);
const CategoriesScreen = lazy(() =>
  import('./features/settings/CategoriesScreen').then((m) => ({ default: m.CategoriesScreen })),
);
const BackupScreen = lazy(() =>
  import('./features/settings/BackupScreen').then((m) => ({ default: m.BackupScreen })),
);
const RecurringScreen = lazy(() =>
  import('./features/recurring/RecurringScreen').then((m) => ({ default: m.RecurringScreen })),
);
const PriceSettingsScreen = lazy(() =>
  import('./features/settings/PriceSettingsScreen').then((m) => ({
    default: m.PriceSettingsScreen,
  })),
);
const InvestmentsScreen = lazy(() =>
  import('./features/investments/InvestmentsScreen').then((m) => ({
    default: m.InvestmentsScreen,
  })),
);

function LazyScreen({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-12 text-center text-sm text-slate-400">불러오는 중…</p>}>
      {children}
    </Suspense>
  );
}

/**
 * 라우터를 바꾸는 단 한 곳.
 *
 * 기본은 HashRouter 다. GitHub Pages 같은 정적 호스팅에서
 * /transactions 를 새로고침하면 서버에 그런 파일이 없어서 404 가 난다.
 * 해시(#/transactions)는 서버로 안 가기 때문에 그 문제가 없다.
 *
 * 호스팅 쪽에 SPA rewrite 를 걸 수 있으면 app.meta.ts 에서
 * routerMode 를 'browser' 로 바꾸면 된다. 주소가 깔끔해진다.
 */
const routes = [
  {
    path: '/',
    element: <AppShell />,
    // 화면 코드를 못 받았을 때 날것의 오류 대신 안내를 띄운다
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: (
          <LazyScreen>
            <Dashboard />
          </LazyScreen>
        ),
      },
      { path: 'transactions', element: <TransactionList /> },
      { path: 'budget', element: <LazyScreen><BudgetScreen /></LazyScreen> },
      { path: 'rules', element: <LazyScreen><RulesScreen /></LazyScreen> },
      { path: 'accounts', element: <LazyScreen><AccountsScreen /></LazyScreen> },
      { path: 'categories', element: <LazyScreen><CategoriesScreen /></LazyScreen> },
      { path: 'backup', element: <LazyScreen><BackupScreen /></LazyScreen> },
      { path: 'recurring', element: <LazyScreen><RecurringScreen /></LazyScreen> },
      { path: 'investments', element: <LazyScreen><InvestmentsScreen /></LazyScreen> },
      { path: 'prices', element: <LazyScreen><PriceSettingsScreen /></LazyScreen> },
      { path: 'more', element: <MorePage /> },
    ],
  },
  // 입력은 탭 바 밖에 둔다. 전체 화면을 쓰고 키패드가 가려지지 않게.
  { path: '/input', element: <QuickInput />, errorElement: <RouteError /> },
];

const router =
  APP.routerMode === 'hash'
    ? createHashRouter(routes, { basename: undefined })
    : createBrowserRouter(routes, { basename: APP.basePath });

export function AppRouter() {
  return <RouterProvider router={router} />;
}
