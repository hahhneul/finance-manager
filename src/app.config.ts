import { APP } from './app.meta';

export { APP };

/**
 * public/ 안의 파일 경로를 base 경로에 맞춰 만든다.
 *
 *   assetUrl('icons/icon-192.png')
 *     → '/icons/icon-192.png'                   (base '/')
 *     → '/finance-manager/icons/icon-192.png'   (base '/finance-manager/')
 *
 * 이미지·아이콘을 참조할 때는 반드시 이 함수를 거친다.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
