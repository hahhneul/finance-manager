# 아이콘

지금 파일들은 **자리표시자**다. 배경색과 막대그래프 모양만 들어 있다.

8단계(PWA 전환)에서 실제 아이콘으로 교체한다. 그때 지켜야 할 것:

- `icon-192.png`, `icon-512.png` — 일반 아이콘. 아이콘이 화면에 그대로 나온다.
- `maskable-512.png` — 안드로이드가 원형·둥근사각형 등으로 **잘라내는** 아이콘.
  바깥 20%가 잘려도 되도록 그림을 안쪽 60% 안에 넣는다.
- 색상은 `src/app.meta.ts` 의 `themeColor` / `backgroundColor` 와 맞춘다.
- 파일 이름을 바꾸면 `index.html` 의 `apple-touch-icon` 과
  8단계에서 만들 manifest 도 같이 고쳐야 한다.
