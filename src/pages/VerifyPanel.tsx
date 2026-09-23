import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { db } from '@/db/schema';
import { loadLedger } from '@/db/repo';
import { DEMO_FX_RATE } from '@/demo/demoData';
import { groupChecks, runChecks, type Check } from '@/demo/verify';

/**
 * 1단계에서 만든 검증 화면. 이제 '전체' 탭 안의 시트로 들어갔다.
 *
 * 저장소에서 읽은 값으로 계산한 결과가 demo/expected.ts 의 정답과 맞는지 보여준다.
 * 데모 데이터를 고쳤다면 어긋나는 게 정상이다.
 */
export function VerifyPanel() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [accounts, categories, ledger, budgets, trades, holdings, quotes] =
          await Promise.all([
            db.accounts.orderBy('order').toArray(),
            db.categories.orderBy('order').toArray(),
            loadLedger(),
            db.budgets.toArray(),
            db.trades.toArray(),
            db.holdings.toArray(),
            db.quotes.toArray(),
          ]);

        if (cancelled) return;
        setChecks(
          runChecks({
            accounts, categories, ledger, budgets, trades, holdings, quotes,
            fxRate: DEMO_FX_RATE,
          }),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  }
  if (!checks) {
    return <p className="py-8 text-center text-sm text-slate-500">계산 중…</p>;
  }

  const passed = checks.filter((c) => c.ok).length;
  const allOk = passed === checks.length;

  return (
    <div className="pb-2">
      <div className={`rounded-xl p-3 ${allOk ? 'bg-emerald-50' : 'bg-red-50'}`}>
        <p
          className={`flex items-center gap-2 font-semibold ${
            allOk ? 'text-emerald-800' : 'text-red-800'
          }`}
        >
          {allOk ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          {passed} / {checks.length} 항목 일치
        </p>
        <p className="mt-1 text-xs text-slate-600">
          거래를 직접 추가·수정했다면 정답과 달라지는 게 정상입니다.
        </p>
      </div>

      {groupChecks(checks).map((group) => (
        <section key={group.group} className="mt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            {group.ok ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-red-600" />
            )}
            {group.group}
          </h3>

          <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {group.checks.map((c) => (
              <li key={`${c.group}-${c.label}`} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-600">{c.label}</span>
                  <span
                    className={`text-xs font-medium ${c.ok ? 'text-slate-900' : 'text-red-600'}`}
                  >
                    {c.actual}
                  </span>
                </div>
                {!c.ok && (
                  <p className="mt-0.5 text-right text-[11px] text-slate-500">
                    정답: {c.expected}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
