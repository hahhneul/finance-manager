import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, X } from 'lucide-react';

/**
 * 새 버전 안내.
 *
 * 바로 갈아끼우지 않는 이유: 거래를 입력하는 중에 페이지가 새로고침되면
 * 치던 내용이 날아간다. 안내만 띄우고 사용자가 누를 때 넘어간다.
 *
 * 화면 위쪽이 아니라 **탭 바 바로 위**에 띄운다. 엄지가 닿는 자리다.
 */
export function UpdateBanner() {
  const [applying, setApplying] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      // 앱을 열어둔 채로 하루가 지나도 새 버전을 알아채게 한다
      setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  /**
   * 새 워커로 넘어간 뒤 페이지를 다시 읽는다.
   *
   * 순서가 중요하다. 직접 겪은 두 가지를 피하려고 이렇게 짰다.
   *
   *  1. updateServiceWorker(true) 에 맡기면 새로고침이 아예 안 일어나는 경우가 있었다.
   *     → 새로고침은 우리가 직접 한다.
   *  2. skipWaiting 만 보내고 바로 새로고침하면 **옛 워커가 아직 페이지를 쥐고 있어서**
   *     옛 화면이 그대로 나온다. 배너도 다시 뜬다.
   *     → controllerchange(새 워커가 넘겨받음)를 기다린 뒤에 새로고침한다.
   *
   * 이벤트가 안 올 수도 있으니 3초 뒤에는 그냥 진행한다.
   * 새로고침만 해도 결국 새 워커를 만나게 된다.
   */
  async function applyUpdate() {
    setApplying(true);

    const handover = new Promise<void>((resolve) => {
      navigator.serviceWorker?.addEventListener('controllerchange', () => resolve(), {
        once: true,
      });
      setTimeout(resolve, 3_000);
    });

    try {
      // false = 새로고침은 맡기지 않는다. 넘겨받기만 시킨다.
      await updateServiceWorker(false);
    } catch {
      // 실패해도 새로고침하면 어차피 새 워커를 만난다
    }

    await handover;
    window.location.reload();
  }

  if (!needRefresh) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-[4.5rem] z-40 mx-auto max-w-lg px-3">
      <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 shadow-lg shadow-slate-900/25">
        <Download className="size-5 shrink-0 text-white" />

        <p className="flex-1 text-sm text-white">
          업데이트가 있습니다
          <span className="mt-0.5 block text-xs text-slate-300">
            기록한 내용은 그대로 남습니다
          </span>
        </p>

        <button
          type="button"
          onClick={() => void applyUpdate()}
          disabled={applying}
          className="min-h-11 shrink-0 rounded-lg bg-white px-3.5 text-sm font-semibold text-slate-900 active:bg-slate-200 disabled:opacity-60"
        >
          {applying ? '적용 중…' : '새로고침'}
        </button>

        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="나중에"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-800"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
