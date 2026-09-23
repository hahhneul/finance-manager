import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  Database,
  HardDriveDownload,
  LineChart,
  Repeat,
  TestTube,
  Wallet,
  RefreshCw,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ScreenHeader } from '@/layout/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { countAll, resetData, saveSetting } from '@/db/repo';
import { seedDemoData } from '@/db/seed';
import { VerifyPanel } from '@/pages/VerifyPanel';
import { StorageCard } from '@/pwa/StorageCard';
import { useSettings } from '@/hooks/useData';
import { formatQuoteTime } from '@/core/date';

/** '전체' 탭 — 관리 화면들의 입구 */
export function MorePage() {
  const [showVerify, setShowVerify] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const settings = useSettings();

  async function openReset() {
    const counts = await countAll();
    setRecordCount(Object.values(counts).reduce((a, b) => a + b, 0));
    setShowReset(true);
  }

  async function resetDemo() {
    setBusy(true);
    await resetData();
    // 다시 넣을 수 있게 표시를 내린 뒤 심는다
    await saveSetting('demoSeeded', false);
    await seedDemoData();
    setBusy(false);
    setShowReset(false);
  }

  /**
   * 빈 상태로 시작.
   *
   * 앱을 처음 열면 데모 데이터가 들어가는데, 실제로 쓰기 시작할 때는
   * 그걸 지우고 내 계좌부터 만들어야 한다. 그 출구가 여기다.
   * 데모를 지운 뒤에는 seedIfEmpty 가 다시 넣지 않도록 표시를 남긴다.
   */
  async function startEmpty() {
    setBusy(true);
    await resetData();
    // 이 표시가 있어야 다음에 앱을 열 때 데모가 다시 들어오지 않는다
    await saveSetting('demoSeeded', true);
    setBusy(false);
    setShowReset(false);
  }

  return (
    <>
      <ScreenHeader title="전체" />

      <section className="mt-2 bg-white">
        <SectionLabel>관리</SectionLabel>

        <MenuLink
          to="/accounts"
          icon={Wallet}
          label="계좌"
          caption="현금·은행·신용카드·증권계좌와 초기 잔액"
        />
        <MenuLink
          to="/categories"
          icon={Database}
          label="카테고리"
          caption="대분류 > 소분류 2단계로 관리합니다"
        />
        <MenuLink
          to="/recurring"
          icon={Repeat}
          label="반복 거래"
          caption="월세·구독료. 기록 전에 확인을 받습니다"
        />
        <MenuLink
          to="/rules"
          icon={Wand2}
          label="자동 분류 규칙"
          caption="메모에 단어가 들어가면 카테고리를 자동으로 고릅니다"
        />
        <MenuLink
          to="/investments"
          icon={LineChart}
          label="투자"
          caption="보유 종목, 매매 기록, 현재가 입력"
        />
        <MenuLink
          to="/prices"
          icon={RefreshCw}
          label="시세 가져오기"
          caption="직접 입력 / 한국거래소 · 인증키 입력"
        />
      </section>

      <section className="mt-4 bg-white">
        <SectionLabel>데이터</SectionLabel>

        <MenuLink
          to="/backup"
          icon={HardDriveDownload}
          label="백업 · 내보내기"
          caption={
            settings?.lastBackupAt
              ? `마지막 백업 ${formatQuoteTime(settings.lastBackupAt)}`
              : '아직 백업한 적이 없습니다'
          }
        />
      </section>

      <StorageCard />

      <section className="mt-4 bg-white">
        <SectionLabel>데이터 초기화</SectionLabel>

        <button
          type="button"
          onClick={() => void openReset()}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-slate-50"
        >
          <Trash2 className="size-5 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-900">
              데이터 비우기 · 데모 되돌리기
            </span>
            <span className="block truncate text-xs text-slate-500">
              빈 상태로 시작하거나, 데모 데이터로 되돌립니다
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-slate-300" />
        </button>
      </section>

      <section className="mt-4 bg-white">
        <SectionLabel>개발용</SectionLabel>

        <button
          type="button"
          onClick={() => setShowVerify(true)}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-slate-50"
        >
          <TestTube className="size-5 shrink-0 text-slate-400" />
          <span className="flex-1">
            <span className="block text-sm font-medium text-slate-900">계산 정확성 확인</span>
            <span className="block text-xs text-slate-500">
              손으로 계산한 정답과 코드 결과 비교
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-slate-300" />
        </button>
      </section>

      <BottomSheet
        open={showVerify}
        title="계산 정확성 확인"
        onClose={() => setShowVerify(false)}
        maxHeight="88vh"
      >
        <VerifyPanel />
      </BottomSheet>

      <BottomSheet open={showReset} title="데이터 초기화" onClose={() => setShowReset(false)}>
        <div className="space-y-3 pb-2">
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900">
              되돌릴 수 없습니다. 지금 기록이 {recordCount ?? 0}건 있습니다.
              필요하면 <Link to="/backup" className="underline">백업</Link>부터 받아 두세요.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void startEmpty()}
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-50"
          >
            빈 상태로 시작하기
          </button>
          <p className="text-xs text-slate-500">
            전부 지우고 내 계좌부터 직접 만듭니다. 데모는 다시 들어오지 않습니다.
          </p>

          <button
            type="button"
            onClick={() => void resetDemo()}
            disabled={busy}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200 disabled:opacity-50"
          >
            <Database className="size-4" />
            {busy ? '처리 중…' : '데모 데이터로 되돌리기'}
          </button>
          <p className="text-xs text-slate-500">
            3개월치 거래와 주식 기록이 다시 채워집니다. 기능을 둘러볼 때 쓰세요.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">
      {children}
    </h2>
  );
}

function MenuLink({
  to,
  icon: Icon,
  label,
  caption,
}: {
  to: string;
  icon: typeof LineChart;
  label: string;
  caption: string;
}) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 active:bg-slate-50">
      <Icon className="size-5 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500">{caption}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </Link>
  );
}
