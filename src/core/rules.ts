import type { Category, ID, Rule, Transaction } from '@/types';

/**
 * 자동 분류 규칙.
 *
 * "메모에 '스타벅스'가 들어가면 식비 > 카페" 같은 규칙을 거래에 맞춰 본다.
 * 빠른 입력에서 메모를 칠 때 쓴다.
 */

export interface RuleInput {
  memo: string;
  tags: string[];
}

export interface RuleMatch {
  rule: Rule;
  categoryId: ID;
  /** 규칙이 함께 붙이는 태그 중 아직 없는 것만 */
  addTags: string[];
}

/** 대소문자를 가리지 않는다 (STARBUCKS 와 starbucks 를 같게 본다) */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesText(haystack: string, op: Rule['op'], needle: string): boolean {
  const target = normalize(haystack);
  const value = normalize(needle);
  if (value === '') return false;

  switch (op) {
    case 'contains':
      return target.includes(value);
    case 'equals':
      return target === value;
    case 'startsWith':
      return target.startsWith(value);
  }
}

export function matchRule(rule: Rule, input: RuleInput): boolean {
  if (!rule.enabled) return false;

  if (rule.field === 'memo') return matchesText(input.memo, rule.op, rule.value);

  // 태그는 하나라도 맞으면 된다
  return input.tags.some((tag) => matchesText(tag, rule.op, rule.value));
}

/**
 * 가장 먼저 맞는 규칙 하나를 돌려준다.
 *
 * 여러 규칙이 동시에 맞을 수 있으므로 priority 가 낮은 것부터 본다.
 * 여러 개를 겹쳐 적용하지 않는 이유: 카테고리는 하나뿐이라
 * 나중 규칙이 앞 규칙을 덮어쓰면 어느 규칙이 이겼는지 알기 어렵다.
 */
export function applyRules(input: RuleInput, rules: Rule[]): RuleMatch | null {
  const sorted = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  for (const rule of sorted) {
    if (!matchRule(rule, input)) continue;

    return {
      rule,
      categoryId: rule.categoryId,
      addTags: (rule.addTags ?? []).filter((tag) => !input.tags.includes(tag)),
    };
  }

  return null;
}

/**
 * 규칙을 만들 때 "이 규칙이 지금 몇 건에 맞는지" 보여주기 위한 개수.
 * 저장하기 전에 오타나 너무 넓은 조건을 알아차릴 수 있다.
 */
export function countMatches(rule: Rule, transactions: Transaction[]): number {
  return transactions.filter((tx) => matchRule(rule, { memo: tx.memo, tags: tx.tags })).length;
}

/** 규칙이 가리키는 카테고리가 사라졌는지 (카테고리를 지운 뒤 남은 규칙) */
export function isDangling(rule: Rule, categories: Category[]): boolean {
  return !categories.some((c) => c.id === rule.categoryId);
}

/** 새 규칙의 기본 우선순위 — 기존 것들 뒤에 붙인다 */
export function nextPriority(rules: Rule[]): number {
  if (rules.length === 0) return 10;
  return Math.max(...rules.map((r) => r.priority)) + 10;
}
