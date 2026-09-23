import { db, DATA_TABLES, DB_SCHEMA_VERSION, type DataTableName } from './schema';
import { loadSettings, saveSetting } from './repo';
import { nowTimestamp } from '@/core/date';
import { APP } from '@/app.meta';
import type { AppSettings } from '@/types';

/**
 * 전체 데이터 JSON 백업 · 복원.
 *
 * 파일 안에 schemaVersion 을 넣는 이유:
 * 6개월 전에 받아 둔 백업을 새 버전 앱에서 복원할 수 있어야 한다.
 * 스키마가 바뀌면 MIGRATIONS 에 변환 단계를 추가하고,
 * 옛 백업은 여기를 거쳐 현재 모양으로 올라온다.
 */

export const BACKUP_FORMAT = 'finance-manager-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** 이 파일을 만든 앱 이름 (사람이 보기 위한 값) */
  app: string;
  schemaVersion: number;
  exportedAt: string;
  settings: Partial<AppSettings>;
  data: Record<DataTableName, unknown[]>;
}

// ---------------------------------------------------------------------------
// 내보내기
// ---------------------------------------------------------------------------

export async function exportBackup(): Promise<BackupFile> {
  const settings = await loadSettings();

  const entries = await Promise.all(
    DATA_TABLES.map(async (name) => [name, await db.table(name).toArray()] as const),
  );

  return {
    format: BACKUP_FORMAT,
    app: APP.name,
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: nowTimestamp(),
    // API 키는 백업에 넣지 않는다. 파일이 남의 손에 들어갈 수 있다.
    settings: { monthStartDay: settings.monthStartDay, theme: settings.theme },
    data: Object.fromEntries(entries) as Record<DataTableName, unknown[]>,
  };
}

/** 사용자가 받을 파일 이름: 머니로그-백업-2026-09-21.json */
export function backupFileName(date: string): string {
  return `${APP.name}-백업-${date}.json`;
}

// ---------------------------------------------------------------------------
// 버전 올리기
// ---------------------------------------------------------------------------

type BackupUpgrade = (file: BackupFile) => BackupFile;

/**
 * 옛 백업을 현재 스키마로 끌어올리는 변환들.
 * 키는 "이 버전에서 다음 버전으로" 를 뜻한다.
 *
 * 스키마를 v2 로 올릴 때 여기에 { 1: (file) => ... } 를 추가한다.
 */
const BACKUP_UPGRADES: Record<number, BackupUpgrade> = {
  // v1 → v2: CSV 가져오기를 없애면서 importHash 필드를 걷어냈다.
  // 옛 백업에 남아 있어도 복원되지 않도록 여기서 털어낸다.
  1: (file) => ({
    ...file,
    schemaVersion: 2,
    data: {
      ...file.data,
      transactions: (file.data.transactions ?? []).map((row) => {
        const { importHash: _importHash, ...rest } = row as Record<string, unknown>;
        return rest;
      }),
    },
  }),
};

export class BackupError extends Error {}

/** 파일이 이 앱의 백업이 맞는지 확인하고, 필요하면 현재 버전으로 올린다 */
export function migrateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') {
    throw new BackupError('백업 파일을 읽을 수 없습니다.');
  }

  const file = raw as Partial<BackupFile>;

  if (file.format !== BACKUP_FORMAT) {
    throw new BackupError('이 앱의 백업 파일이 아닙니다.');
  }
  if (typeof file.schemaVersion !== 'number') {
    throw new BackupError('백업 파일에 버전 정보가 없습니다.');
  }
  if (file.schemaVersion > DB_SCHEMA_VERSION) {
    throw new BackupError(
      `더 새로운 버전(v${file.schemaVersion})의 백업입니다. 앱을 먼저 업데이트해 주세요.`,
    );
  }

  let current = file as BackupFile;
  while (current.schemaVersion < DB_SCHEMA_VERSION) {
    const upgrade = BACKUP_UPGRADES[current.schemaVersion];
    if (!upgrade) {
      throw new BackupError(`v${current.schemaVersion} 백업을 변환할 방법이 없습니다.`);
    }
    current = upgrade(current);
  }

  return current;
}

// ---------------------------------------------------------------------------
// 복원
// ---------------------------------------------------------------------------

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  mode: RestoreMode;
  counts: Record<string, number>;
}

/**
 * replace — 지금 데이터를 전부 지우고 백업 내용으로 바꾼다
 * merge   — 같은 id 는 백업 쪽으로 덮어쓰고, 없던 것은 추가한다
 */
export async function importBackup(raw: unknown, mode: RestoreMode = 'replace'): Promise<RestoreResult> {
  const file = migrateBackup(raw);
  const counts: Record<string, number> = {};

  await db.transaction('rw', db.tables, async () => {
    for (const name of DATA_TABLES) {
      const rows = file.data[name] ?? [];
      const table = db.table(name);

      if (mode === 'replace') await table.clear();
      if (rows.length > 0) await table.bulkPut(rows);

      counts[name] = rows.length;
    }
  });

  if (file.settings) {
    for (const [key, value] of Object.entries(file.settings)) {
      await saveSetting(key as keyof AppSettings, value as never);
    }
  }

  return { mode, counts };
}

/** 설정 화면의 "마지막 백업: 9월 21일" 표시용 */
export async function recordBackupTime(): Promise<void> {
  await saveSetting('lastBackupAt', nowTimestamp());
}
