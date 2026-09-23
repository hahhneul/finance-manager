/**
 * 파일 내려받기 · 읽기.
 *
 * `<a download>` 는 대부분의 환경에서 잘 동작하지만,
 * **아이폰 홈 화면에 추가한 PWA 안에서는 아무 일도 일어나지 않는다.**
 * 그래서 그 경우에만 공유 시트로 넘긴다.
 *
 * 공유 시트를 기본으로 쓰지 않는 이유:
 * 데스크톱 크롬도 navigator.canShare({files}) 가 true 를 주지만,
 * 실제로 share() 를 부르면 응답하지 않고 멈추는 경우가 있다.
 */

export type SaveResult = 'shared' | 'downloaded' | 'failed';

/** 아이폰에서 홈 화면 아이콘으로 실행한 상태인가 */
function isIosStandalone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;

  // iOS 사파리만 navigator.standalone 을 갖는다
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return isIos && (standalone || window.matchMedia('(display-mode: standalone)').matches);
}

async function shareFile(filename: string, blob: Blob, mimeType: string): Promise<SaveResult> {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') {
    return 'failed';
  }

  try {
    const file = new File([blob], filename, { type: mimeType });
    if (!navigator.canShare({ files: [file] })) return 'failed';

    await navigator.share({ files: [file], title: filename });
    return 'shared';
  } catch (e) {
    // 사용자가 공유를 취소한 것은 실패가 아니지만, 결과적으로 저장되지 않았다
    if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
    return 'failed';
  }
}

function downloadFile(filename: string, blob: Blob): SaveResult {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // 바로 해제하면 사파리에서 내려받기가 취소되는 경우가 있다
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export async function saveTextFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<SaveResult> {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });

  if (isIosStandalone()) {
    const shared = await shareFile(filename, blob, mimeType);
    if (shared !== 'failed') return shared;
    // 공유가 안 되면 그래도 내려받기를 시도해 본다
  }

  return downloadFile(filename, blob);
}

/** 사용자가 고른 파일을 글자로 읽는다 */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file, 'utf-8');
  });
}

/** 클립보드 복사 (내려받기가 막혔을 때의 마지막 수단) */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
