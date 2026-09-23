/**
 * 앱 정보 한 곳 모음 — 이름, 색상, 배포 경로, 라우터 종류.
 *
 * vite.config.ts 에서도 import 하므로 여기에는 브라우저 전용 코드
 * (import.meta.env, window 등)를 절대 넣지 않는다.
 * 런타임 헬퍼가 필요하면 app.config.ts 에 둔다.
 */
export const APP = {
  name: '머니로그',
  /** 홈 화면 아이콘 아래에 표시되는 짧은 이름 (12자 이내 권장) */
  shortName: '머니로그',
  description: '직접 입력하는 개인 가계부 · 자산 추적',

  /** 상단 상태바 색 (index.html theme-color, 8단계 manifest 에서 재사용) */
  themeColor: '#0f172a',
  /** 스플래시 배경색 */
  backgroundColor: '#f8fafc',

  /**
   * 배포 경로. 이 값 하나만 바꾸면 하위 경로 배포가 된다.
   *   Vercel / 루트 도메인      → '/'
   *   GitHub Pages(하위 경로)   → '/finance-manager/'
   * 코드 어디에서도 '/'로 시작하는 절대 경로를 쓰지 않는 이유가 이것이다.
   */
  basePath: '/',

  /**
   * 라우터 종류. 정적 호스팅에서 새로고침 404가 나지 않으려면 'hash'.
   * 'browser'로 바꾸려면 호스팅 쪽에 SPA rewrite 설정이 필요하다.
   */
  routerMode: 'hash' as 'hash' | 'browser',

  locale: 'ko-KR',
  timeZone: 'Asia/Seoul',
} as const;
