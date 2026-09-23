import { db, DATA_TABLES } from './schema';
import { isEmpty, loadSettings, saveSetting, seedReconstructedSnapshots } from './repo';
import { demoDataset } from '@/demo/demoData';

/**
 * 데모 데이터를 IndexedDB 에 넣는다.
 *
 * 1단계에서는 앱을 열면 자동으로 들어간다.
 * 실제로 쓰기 시작할 때는 설정 화면에서 지우고 빈 상태로 시작하면 된다.
 */
export async function seedDemoData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of DATA_TABLES) {
      const rows = demoDataset[name as keyof typeof demoDataset] as unknown[];
      await db.table(name).bulkPut(rows ?? []);
    }
  });

  // 순자산 추이 차트가 비어 보이지 않게 과거 6개월 월말을 역산해 채운다.
  // 실제 사용자 데이터에는 하지 않는다 — 스냅샷은 그날그날 쌓이는 것이 맞다.
  await seedReconstructedSnapshots(DEMO_SNAPSHOT_DATES);

  await saveSetting('demoSeeded', true);
}

/** 데모 추이 차트에 쓸 월말 날짜들 (마지막은 데모 데이터의 최근일) */
const DEMO_SNAPSHOT_DATES = [
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
  '2026-09-20',
];

/**
 * 이미 진행 중인 심기 작업.
 *
 * React StrictMode 는 effect 를 두 번 실행한다. 그대로 두면 "비어 있나?"를
 * 두 번 확인하고 둘 다 "비었다"고 판단해 데이터를 두 벌 넣는다.
 * (스냅샷처럼 유니크 인덱스가 있는 테이블에서는 오류로 터진다)
 */
let inFlight: Promise<boolean> | null = null;

/**
 * 처음 열었을 때만 데모를 넣는다.
 *
 * 조건이 두 개인 이유:
 *  - 비어 있어야 한다 (쓰던 데이터를 덮어쓰지 않으려고)
 *  - 아직 한 번도 안 넣었어야 한다 (demoSeeded)
 *
 * 두 번째가 없으면 '빈 상태로 시작하기'를 눌러도 다음에 앱을 열 때
 * 데모가 다시 들어온다. 비어 있다는 조건만으로는 "지웠다"와
 * "처음 쓴다"를 구분할 수 없다.
 */
export function seedIfEmpty(): Promise<boolean> {
  inFlight ??= runSeedIfEmpty().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSeedIfEmpty(): Promise<boolean> {
  const settings = await loadSettings();
  if (settings.demoSeeded) return false;
  if (!(await isEmpty())) return false;

  await seedDemoData();
  return true;
}
