import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { backupFileName, exportBackup, importBackup, recordBackupTime } from '@/db/backup';
import { countAll } from '@/db/repo';
import { formatKoreanDate, formatQuoteTime, todayISO } from '@/core/date';
import { readTextFile, saveTextFile } from '@/lib/download';
import { useSettings } from '@/hooks/useData';
import { SubScreen } from './SubScreen';

export function BackupScreen() {
  const settings = useSettings();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function exportJson() {
    setBusy(true);
    setError(null);
    try {
      const backup = await exportBackup();
      const today = todayISO();
      const result = await saveTextFile(
        backupFileName(today),
        JSON.stringify(backup, null, 2),
        'application/json',
      );

      if (result === 'failed') {
        setError('파일을 저장하지 못했습니다. 브라우저에서 다시 시도해 주세요.');
      } else {
        await recordBackupTime();
        setMessage('백업 파일을 저장했습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPendingFile({ name: file.name, text: await readTextFile(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function restore(mode: 'replace' | 'merge') {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);

    try {
      const result = await importBackup(JSON.parse(pendingFile.text), mode);
      const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
      setMessage(`${total}건을 복원했습니다.`);
      setPendingFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <SubScreen title="백업">
      <section className="mt-2 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">
          전체 백업 (JSON)
        </h2>

        <p className="px-4 pt-3 text-xs text-slate-500">
          계좌·거래·정산·예산·규칙·매매 기록까지 전부 담깁니다. 이 파일 하나면
          새 기기에서 그대로 되살릴 수 있습니다. 시세 API 키는 담기지 않습니다.
        </p>

        <div className="space-y-2 p-4">
          <button
            type="button"
            onClick={() => void exportJson()}
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-50"
          >
            <Download className="size-4" />
            백업 파일 내려받기
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200 disabled:opacity-50"
          >
            <Upload className="size-4" />
            백업 파일에서 복원
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <p className="px-4 pb-4 text-xs text-slate-400">
          마지막 백업:{' '}
          {settings?.lastBackupAt ? formatQuoteTime(settings.lastBackupAt) : '아직 없음'}
        </p>
      </section>

      {message && (
        <p className="mx-4 mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <RestoreSheet
        file={pendingFile}
        busy={busy}
        onClose={() => setPendingFile(null)}
        onRestore={restore}
      />
    </SubScreen>
  );
}

/**
 * 복원은 되돌릴 수 없으므로 한 번 더 묻는다.
 * 지금 들어 있는 데이터가 몇 건인지 보여줘서 실수로 날리지 않게 한다.
 */
function RestoreSheet({
  file,
  busy,
  onClose,
  onRestore,
}: {
  file: { name: string; text: string } | null;
  busy: boolean;
  onClose: () => void;
  onRestore: (mode: 'replace' | 'merge') => Promise<void>;
}) {
  const [current, setCurrent] = useState<number | null>(null);

  const key = file?.name ?? '';
  const [loadedKey, setLoadedKey] = useState('');
  if (file && loadedKey !== key) {
    setLoadedKey(key);
    void countAll().then((counts) => {
      setCurrent(Object.values(counts).reduce((a, b) => a + b, 0));
    });
  }

  let info: { schemaVersion?: number; exportedAt?: string } = {};
  try {
    info = file ? JSON.parse(file.text) : {};
  } catch {
    info = {};
  }

  return (
    <BottomSheet open={file !== null} title="백업에서 복원" onClose={onClose}>
      <div className="space-y-3 pb-2">
        <dl className="rounded-lg bg-slate-50 p-3 text-xs">
          <div className="flex justify-between py-0.5">
            <dt className="text-slate-500">파일</dt>
            <dd className="truncate pl-2 font-medium text-slate-700">{file?.name}</dd>
          </div>
          {info.exportedAt && (
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">만든 날</dt>
              <dd className="font-medium text-slate-700">
                {formatKoreanDate(info.exportedAt.slice(0, 10))}
              </dd>
            </div>
          )}
          {info.schemaVersion !== undefined && (
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">스키마 버전</dt>
              <dd className="font-medium text-slate-700">v{info.schemaVersion}</dd>
            </div>
          )}
          {current !== null && (
            <div className="flex justify-between py-0.5">
              <dt className="text-slate-500">지금 들어 있는 기록</dt>
              <dd className="font-medium text-slate-700">{current}건</dd>
            </div>
          )}
        </dl>

        <div className="flex gap-2 rounded-lg bg-amber-50 p-3">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-900">
            복원은 되돌릴 수 없습니다. 지금 데이터가 걱정되면 먼저 백업을 받아 두세요.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRestore('replace')}
          disabled={busy}
          className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-50"
        >
          전부 바꾸기 — 지금 데이터를 지웁니다
        </button>

        <button
          type="button"
          onClick={() => void onRestore('merge')}
          disabled={busy}
          className="min-h-12 w-full rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200 disabled:opacity-50"
        >
          합치기 — 같은 기록만 덮어씁니다
        </button>
      </div>
    </BottomSheet>
  );
}
