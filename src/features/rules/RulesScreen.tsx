import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/BottomSheet';
import { countMatches, isDangling } from '@/core/rules';
import { categoryPath } from '@/core/recent';
import { applyRulesToExisting, deleteRule, loadRules, saveRule, updateRule } from '@/db/repo';
import { useAllTransactions, useCategories } from '@/hooks/useData';
import type { Rule } from '@/types';
import { RuleEditSheet } from './RuleEditSheet';

const OP_LABEL: Record<Rule['op'], string> = {
  contains: '포함',
  equals: '정확히 일치',
  startsWith: '으로 시작',
};

export function RulesScreen() {
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);

  const rules = useLiveQuery(() => loadRules(), []);
  const categories = useCategories();
  const transactions = useAllTransactions();

  const matchCounts = useMemo(() => {
    if (!rules || !transactions) return new Map<string, number>();
    return new Map(rules.map((rule) => [rule.id, countMatches(rule, transactions)]));
  }, [rules, transactions]);

  async function runOnExisting(onlyUncategorized: boolean) {
    const { scanned, changed } = await applyRulesToExisting(onlyUncategorized);
    setApplyResult(
      changed === 0
        ? `${scanned}건을 살펴봤지만 바꿀 것이 없었습니다.`
        : `${scanned}건 중 ${changed}건의 카테고리를 바꿨습니다.`,
    );
  }

  return (
    <>
      <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex min-h-14 items-center gap-1 px-2">
          <Link
            to="/more"
            aria-label="뒤로"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-semibold">자동 분류 규칙</h1>
          <button
            type="button"
            onClick={() => setEditing('new')}
            aria-label="규칙 추가"
            className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </header>

      <p className="bg-white px-4 py-3 text-xs text-slate-500">
        메모에 특정 단어가 들어가면 카테고리를 자동으로 골라 줍니다. 거래를 입력할 때
        바로 적용되고, 이미 저장된 거래에도 한 번에 적용할 수 있습니다.
      </p>

      {!rules && <p className="p-8 text-center text-sm text-slate-500">불러오는 중…</p>}

      {rules?.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-slate-500">아직 규칙이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            자주 가는 가게 이름을 하나 넣어보세요. 예: 스타벅스 → 식비 &gt; 카페
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-5 min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            규칙 추가
          </button>
        </div>
      )}

      {rules && rules.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-slate-100 bg-white">
            {rules.map((rule) => {
              const dangling = categories ? isDangling(rule, categories) : false;
              const count = matchCounts.get(rule.id) ?? 0;

              return (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(rule)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-900">
                        메모에 <span className="font-semibold">{rule.value}</span>{' '}
                        {OP_LABEL[rule.op]}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        →{' '}
                        {dangling ? (
                          <span className="text-red-600">지워진 카테고리</span>
                        ) : (
                          categoryPath(
                            categories?.find((c) => c.id === rule.categoryId),
                            categories ?? [],
                          )
                        )}
                        {rule.addTags?.length ? ` · #${rule.addTags.join(' #')}` : ''}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      {!rule.enabled && (
                        <span className="block text-[11px] text-slate-400">꺼짐</span>
                      )}
                      <span className="block text-xs text-slate-400">{count}건 해당</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 bg-white px-4 py-4">
            <button
              type="button"
              onClick={() => { setApplyResult(null); setShowApply(true); }}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
            >
              <Wand2 className="size-4" />
              이미 저장된 거래에 적용하기
            </button>
          </div>
        </>
      )}

      <BottomSheet open={showApply} title="저장된 거래에 적용" onClose={() => setShowApply(false)}>
        <div className="space-y-3 pb-2">
          <p className="text-xs text-slate-500">
            지금까지 기록한 거래에 규칙을 한 번에 적용합니다.
          </p>

          <button
            type="button"
            onClick={() => void runOnExisting(true)}
            className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
          >
            분류 안 된 거래만 (권장)
          </button>

          <button
            type="button"
            onClick={() => void runOnExisting(false)}
            className="min-h-12 w-full rounded-xl bg-slate-100 text-sm font-medium text-slate-700 active:bg-slate-200"
          >
            모든 거래 — 직접 고른 분류도 덮어씀
          </button>

          {applyResult && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{applyResult}</p>
          )}
        </div>
      </BottomSheet>

      <RuleEditSheet
        open={editing !== null}
        rule={editing === 'new' ? null : editing}
        rules={rules ?? []}
        categories={categories ?? []}
        transactions={transactions ?? []}
        onClose={() => setEditing(null)}
        onSave={async (data, id) => {
          if (id) await updateRule(id, data);
          else await saveRule({ ...data, name: `${data.value} → 자동 분류` });
          setEditing(null);
        }}
        onDelete={async (id) => {
          await deleteRule(id);
          setEditing(null);
        }}
      />
    </>
  );
}
