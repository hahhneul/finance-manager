import { useRouteError } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';

/**
 * 화면을 불러오지 못했을 때 보여주는 안내.
 *
 * 화면마다 코드를 따로 내려받기 때문에(코드 분할), 그 파일을 못 받으면
 * 아무 안내 없이 "Unexpected Application Error!" 가 뜬다. 두 경우에 생긴다.
 *
 *  1. 오프라인 — 아직 안 받아본 화면으로 이동했다
 *  2. 새 버전 배포 직후 — 옛 페이지를 열어 둔 채로 이동했는데
 *     그 사이 파일 이름이 바뀌어서 옛 파일이 서버에 없다
 *
 * 2번은 새로고침하면 바로 풀린다. 1번은 연결이 돌아와야 한다.
 * 어느 쪽인지 navigator.onLine 으로 갈라서 알려준다.
 */
export function RouteError() {
  const error = useRouteError();

  const message = error instanceof Error ? error.message : String(error);
  const isChunkError = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(
    message,
  );
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return (
    <div className="pt-safe flex min-h-full flex-col items-center justify-center px-8 py-20 text-center">
      {offline ? (
        <WifiOff className="size-8 text-slate-300" />
      ) : (
        <RefreshCw className="size-8 text-slate-300" />
      )}

      <h1 className="mt-4 text-base font-semibold text-slate-900">
        {offline ? '연결이 없어 이 화면을 열 수 없습니다' : '화면을 불러오지 못했습니다'}
      </h1>

      <p className="mt-2 text-sm text-slate-500">
        {offline
          ? '기록해 둔 내용은 그대로 있습니다. 연결되면 다시 열립니다.'
          : isChunkError
            ? '앱이 업데이트된 것 같습니다. 새로고침하면 최신 버전으로 열립니다.'
            : '잠시 뒤 다시 시도해 주세요.'}
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
      >
        새로고침
      </button>

      <a
        href={import.meta.env.BASE_URL}
        className="mt-2 flex min-h-12 w-full max-w-xs items-center justify-center text-sm font-medium text-slate-600"
      >
        홈으로
      </a>

      {!isChunkError && (
        <p className="mt-6 max-w-xs break-words text-[11px] text-slate-400">{message}</p>
      )}
    </div>
  );
}
