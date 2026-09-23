import { useEffect, useState } from 'react';
import { HardDrive, ShieldCheck, ShieldAlert, Smartphone } from 'lucide-react';
import {
  checkStorage,
  formatBytes,
  isInstalled,
  requestPersistentStorage,
  type StorageInfo,
} from './persistStorage';

/**
 * 저장소 상태 카드.
 *
 * 이 앱은 기록이 브라우저 안에만 있으므로, 그게 지워질 수 있는 상태인지
 * 사용자가 알 수 있어야 한다. 특히 아이폰 사파리는 7일 안 쓰면 지운다.
 * 홈 화면에 추가하면 그 규칙에서 빠진다 — 그 안내를 여기서 한다.
 */
export function StorageCard() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [installed, setInstalled] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    void checkStorage().then(setInfo);
  }, []);

  async function ask() {
    setAsking(true);
    setInfo(await requestPersistentStorage());
    setAsking(false);
  }

  const persisted = info?.status === 'persisted';

  return (
    <section className="mt-4 bg-white px-4 py-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <HardDrive className="size-4 text-slate-400" />
        저장소
      </h2>

      {/* 영구 보존 상태 */}
      <div
        className={`mt-2 flex gap-2 rounded-lg p-3 ${
          persisted ? 'bg-emerald-50' : 'bg-amber-50'
        }`}
      >
        {persisted ? (
          <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <ShieldAlert className="size-4 shrink-0 text-amber-600" />
        )}

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${persisted ? 'text-emerald-900' : 'text-amber-900'}`}>
            {info === null
              ? '확인 중…'
              : persisted
                ? '기록이 영구 보존됩니다'
                : info.status === 'unsupported'
                  ? '이 브라우저는 영구 보존을 지원하지 않습니다'
                  : '브라우저가 기록을 지울 수 있습니다'}
          </p>

          {info && !persisted && (
            <p className="mt-1 text-xs text-amber-800">
              {info.status === 'unsupported'
                ? '백업 파일을 가끔 받아 두시는 편이 안전합니다.'
                : '저장 공간이 부족하거나 오래 안 쓰면 지워질 수 있습니다.'}
            </p>
          )}

          {info && !persisted && info.status !== 'unsupported' && (
            <button
              type="button"
              onClick={() => void ask()}
              disabled={asking}
              className="mt-2 min-h-11 w-full rounded-lg bg-amber-600 text-sm font-semibold text-white active:bg-amber-700 disabled:opacity-50"
            >
              {asking ? '요청 중…' : '영구 보존 요청하기'}
            </button>
          )}
        </div>
      </div>

      {info?.usage !== undefined && (
        <p className="mt-2 text-xs text-slate-500">
          쓰는 용량 {formatBytes(info.usage)}
          {info.quota !== undefined && ` / ${formatBytes(info.quota)}`}
        </p>
      )}

      {/* 홈 화면 추가 안내 — 이미 추가했으면 띄우지 않는다 */}
      {!installed && (
        <div className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-3">
          <Smartphone className="size-4 shrink-0 text-slate-400" />
          <div className="min-w-0 text-xs text-slate-600">
            <p className="font-medium text-slate-700">홈 화면에 추가하면 더 안전합니다</p>
            <p className="mt-1">
              <strong>아이폰</strong> — 사파리에서 공유 <span aria-hidden>↑</span> → 홈 화면에 추가
              <br />
              <strong>안드로이드</strong> — 크롬 메뉴 → 앱 설치
            </p>
            <p className="mt-1.5 text-slate-500">
              아이폰 사파리는 7일 동안 안 쓰면 저장된 기록을 지울 수 있습니다. 홈 화면에
              추가한 앱은 여기서 빠집니다.
            </p>
          </div>
        </div>
      )}

      {installed && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Smartphone className="size-3.5" />
          홈 화면 앱으로 실행 중입니다
        </p>
      )}
    </section>
  );
}
