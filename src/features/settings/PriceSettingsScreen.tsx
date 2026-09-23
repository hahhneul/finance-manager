import { useState } from 'react';
import { CheckCircle2, ExternalLink, Info } from 'lucide-react';
import { SubScreen } from './SubScreen';
import { saveSetting } from '@/db/repo';
import { useSettings } from '@/hooks/useData';
import { PROVIDERS } from '@/prices/registry';
import { formatQuoteTime } from '@/core/date';

/**
 * 시세 제공자 선택 · API 키 입력.
 *
 * API 키는 코드에 하드코딩하지 않는다. 여기서 받아 IndexedDB 에만 두고,
 * 백업 JSON 에도 담지 않는다 (파일이 남의 손에 들어갈 수 있다).
 */
export function PriceSettingsScreen() {
  const settings = useSettings();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = settings?.priceProviderId ?? 'manual';
  const selected = PROVIDERS.find((p) => p.id === current) ?? PROVIDERS[0];

  // 처음 그릴 때만 저장된 키를 채운다
  const keyValue = apiKey ?? settings?.priceApiKey ?? '';

  async function selectProvider(id: string) {
    await saveSetting('priceProviderId', id);
    setSaved(false);
  }

  async function saveKey() {
    await saveSetting('priceApiKey', keyValue.trim() || undefined);
    setSaved(true);
  }

  return (
    <SubScreen title="시세 가져오기">
      <section className="mt-2 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">
          어디서 가져올까요
        </h2>

        <ul className="divide-y divide-slate-100">
          {PROVIDERS.map((provider) => (
            <li key={provider.id}>
              <button
                type="button"
                onClick={() => void selectProvider(provider.id)}
                className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
              >
                <span className="mt-0.5 shrink-0">
                  {provider.id === current ? (
                    <CheckCircle2 className="size-5 text-slate-900" />
                  ) : (
                    <span className="block size-5 rounded-full border-2 border-slate-300" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">
                    {provider.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {provider.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected.requiresApiKey && (
        <section className="mt-4 bg-white px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-700">인증키</h2>

          <label className="mt-2 block">
            <input
              type="password"
              value={keyValue}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
              placeholder="발급받은 인증키를 붙여넣으세요"
              autoComplete="off"
              className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
            />
          </label>

          <button
            type="button"
            onClick={() => void saveKey()}
            className="mt-2 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            저장
          </button>

          {saved && (
            <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">
              저장했습니다. 투자 화면에서 '시세 새로고침'을 눌러 보세요.
            </p>
          )}

          {selected.keyUrl && (
            <a
              href={selected.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-1 text-xs text-blue-600"
            >
              {selected.keyUrl.replace('https://', '')}에서 무료로 발급
              <ExternalLink className="size-3" />
            </a>
          )}

          <div className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-3">
            <Info className="size-4 shrink-0 text-slate-400" />
            <p className="text-xs text-slate-600">
              인증키는 이 기기의 브라우저 저장소에만 있습니다. 백업 파일에도 담기지
              않으니, 기기를 바꾸면 다시 입력해야 합니다.
            </p>
          </div>
        </section>
      )}

      <section className="mt-4 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-slate-700">환율</h2>
        <p className="mt-1 text-xs text-slate-500">
          USD/KRW 환율은 인증키 없이 자동으로 가져옵니다. 달러 종목을 들고 있을 때만
          호출합니다.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          마지막 갱신:{' '}
          {settings?.lastQuoteRefreshAt
            ? formatQuoteTime(settings.lastQuoteRefreshAt)
            : '아직 없음'}
        </p>
      </section>

      <p className="px-4 py-4 text-xs text-slate-400">
        시세는 자동으로 반복 호출하지 않습니다. 앱을 열 때 한 번, 그리고 새로고침 버튼을
        누를 때만 가져옵니다.
      </p>
    </SubScreen>
  );
}
