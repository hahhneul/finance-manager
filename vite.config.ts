/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { APP } from './src/app.meta.ts';

export default defineConfig({
  // 배포 경로는 app.meta.ts 한 곳에서만 관리한다.
  base: APP.basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /**
       * 'prompt' — 새 버전을 발견해도 바로 갈아끼우지 않는다.
       *
       * 'autoUpdate' 로 두면 사용자가 거래를 입력하는 중에 페이지가
       * 새로고침될 수 있다. 입력하던 내용이 날아간다.
       * 대신 "업데이트가 있습니다" 를 띄우고 사용자가 누를 때 넘어간다.
       */
      registerType: 'prompt',

      // manifest 값은 app.meta.ts 를 그대로 따른다 (index.html 의 meta 와 어긋나지 않게)
      manifest: {
        id: APP.basePath,
        name: APP.name,
        short_name: APP.shortName,
        description: APP.description,
        lang: 'ko',
        dir: 'ltr',
        theme_color: APP.themeColor,
        background_color: APP.backgroundColor,
        display: 'standalone',
        orientation: 'portrait',
        scope: APP.basePath,
        start_url: APP.basePath,
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            // 안드로이드가 원형·둥근사각형으로 잘라내도 안전하도록 그림을 안쪽에 모아 뒀다
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        /**
         * 지연 로딩한 화면(예산·투자·설정 등)까지 전부 미리 받아 둔다.
         * 이게 빠지면 오프라인에서 아직 안 열어본 탭이 열리지 않는다.
         */
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],

        /**
         * 기본 한도가 2MB 인데 Pretendard 가변 폰트가 2,057,688 바이트다.
         * 그냥 두면 **조용히 빠져서** 오프라인에서 글꼴이 깨진다.
         */
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

        // 해시 라우팅이라 모든 이동이 index.html 로 간다
        navigateFallback: 'index.html',

        // 새 버전이 올라오면 옛 캐시를 지운다
        cleanupOutdatedCaches: true,

        /**
         * 새 워커가 활성화되는 즉시 **이미 열려 있는 페이지까지 넘겨받는다.**
         *
         * 이게 없으면 "새로고침" 을 눌러 skipWaiting 이 실행돼도
         * 옛 워커가 계속 페이지를 붙들고 있어서 옛 캐시가 나온다.
         * (배너는 뜨는데 눌러도 그대로인 증상 — 실제로 겪었다)
         *
         * skipWaiting 은 켜지 않는다. 언제 넘어갈지는 사용자가 정한다.
         */
        clientsClaim: true,
        skipWaiting: false,

        /**
         * 시세·환율 API 는 캐시하지 않는다.
         * 캐시하면 새로고침을 눌러도 어제 가격이 그대로 나온다.
         * (네트워크가 없으면 실패하고, 앱은 저장된 값을 그대로 쓴다)
         */
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/api/],
      },

      devOptions: {
        // 개발 중에는 서비스워커를 끈다. 켜 두면 코드를 고쳐도 옛 화면이 나온다.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
