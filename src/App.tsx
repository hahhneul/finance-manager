import { useEffect, useState } from 'react';
import { AppRouter } from './routes';
import { seedIfEmpty } from './db/seed';
import { ensureTodaySnapshot } from './db/repo';
import { requestPersistentStorage } from './pwa/persistStorage';

/**
 * 앱 진입점.
 *
 * 처음 열었을 때 저장소가 비어 있으면 데모 데이터를 넣는다.
 * (실제로 쓰기 시작할 때는 '전체 > 데모 데이터 다시 넣기'로 되돌릴 수 있다)
 * 비어 있지 않으면 손대지 않으므로, 지운 데모가 되살아나지 않는다.
 *
 * 그리고 그날의 순자산을 한 번 기록한다. 이 기록이 쌓여서 추이 차트가 된다.
 * 같은 날 다시 열면 덮어쓴다 — 저녁 값이 더 최신이다.
 *
 * 저장소 영구 보존도 여기서 한 번 요청한다. 서버가 없어서 기록이
 * 브라우저 안에만 있으므로, 브라우저가 공간을 비우며 지워버리면 끝이다.
 * 거절당해도 앱은 그대로 돌아가니 결과를 기다리지 않는다.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(() => ensureTodaySnapshot())
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    // 결과를 기다리지 않는다 — 거절당해도 앱은 그대로 쓴다
    void requestPersistentStorage();
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-700">저장소를 열 수 없습니다: {error}</p>
        <p className="mt-2 text-xs text-slate-500">
          시크릿 모드에서는 IndexedDB 가 막혀 있을 수 있습니다.
        </p>
      </div>
    );
  }

  if (!ready) {
    return <p className="p-12 text-center text-sm text-slate-400">불러오는 중…</p>;
  }

  return <AppRouter />;
}
