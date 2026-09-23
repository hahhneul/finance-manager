/**
 * 저장소 영구 보존 요청.
 *
 * 왜 필요한가: 이 앱은 서버가 없어서 모든 기록이 브라우저 안에만 있다.
 * 브라우저는 저장 공간이 부족하거나 오래 안 쓰면 그 데이터를 지울 수 있다.
 * (iOS 사파리는 7일 안 쓰면 지운다 — 홈 화면에 추가한 앱은 예외다)
 *
 * persist() 는 "이 데이터는 지우지 말아 달라"는 요청이다.
 * 브라우저가 거절할 수도 있어서 결과를 화면에 보여준다.
 */

export type PersistStatus =
  | 'persisted' // 영구 보존됨
  | 'denied' // 요청했지만 거절됨
  | 'unsupported'; // 이 브라우저는 이 기능이 없다

export interface StorageInfo {
  status: PersistStatus;
  /** 지금 쓰는 용량 (바이트) */
  usage?: number;
  /** 쓸 수 있는 최대 용량 */
  quota?: number;
}

export async function requestPersistentStorage(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { status: 'unsupported' };
  }

  try {
    // 이미 허락받았으면 다시 묻지 않는다
    const already = await navigator.storage.persisted();
    const granted = already || (await navigator.storage.persist());

    const estimate = await navigator.storage.estimate?.().catch(() => undefined);

    return {
      status: granted ? 'persisted' : 'denied',
      usage: estimate?.usage,
      quota: estimate?.quota,
    };
  } catch {
    return { status: 'unsupported' };
  }
}

/** 현재 상태만 확인한다 (요청하지 않는다) */
export async function checkStorage(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return { status: 'unsupported' };
  }

  try {
    const persisted = await navigator.storage.persisted();
    const estimate = await navigator.storage.estimate?.().catch(() => undefined);

    return {
      status: persisted ? 'persisted' : 'denied',
      usage: estimate?.usage,
      quota: estimate?.quota,
    };
  } catch {
    return { status: 'unsupported' };
  }
}

/** 1536000 → '1.5MB' */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

/** 홈 화면에 추가된 상태로 실행 중인가 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
