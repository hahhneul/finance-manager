import { describe, expect, it } from 'vitest';
import { applyRules, countMatches, isDangling, matchRule, nextPriority } from '../rules';
import { demoCategories, demoRules, demoTransactions } from '@/demo/demoData';
import type { Rule } from '@/types';

const base: Rule = {
  id: 'r', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  name: '테스트', field: 'memo', op: 'contains', value: '스타벅스',
  categoryId: 'cat-food-cafe', priority: 10, enabled: true,
};

describe('규칙 매칭', () => {
  it('메모에 포함되면 맞는다', () => {
    expect(matchRule(base, { memo: '스타벅스 아메리카노', tags: [] })).toBe(true);
    expect(matchRule(base, { memo: '투썸 아메리카노', tags: [] })).toBe(false);
  });

  it('대소문자를 가리지 않는다', () => {
    const rule = { ...base, value: 'Starbucks' };
    expect(matchRule(rule, { memo: 'STARBUCKS coffee', tags: [] })).toBe(true);
    expect(matchRule(rule, { memo: 'starbucks', tags: [] })).toBe(true);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(matchRule({ ...base, value: '  스타벅스  ' }, { memo: '스타벅스', tags: [] })).toBe(true);
  });

  it('equals 는 정확히 같아야 한다', () => {
    const rule = { ...base, op: 'equals' as const, value: '월세' };
    expect(matchRule(rule, { memo: '월세', tags: [] })).toBe(true);
    expect(matchRule(rule, { memo: '9월 월세', tags: [] })).toBe(false);
  });

  it('startsWith 는 앞부분만 본다', () => {
    const rule = { ...base, op: 'startsWith' as const, value: '배달' };
    expect(matchRule(rule, { memo: '배달의민족 치킨', tags: [] })).toBe(true);
    expect(matchRule(rule, { memo: '치킨 배달', tags: [] })).toBe(false);
  });

  it('태그는 하나라도 맞으면 된다', () => {
    const rule = { ...base, field: 'tag' as const, value: '구독' };
    expect(matchRule(rule, { memo: '', tags: ['고정지출', '구독'] })).toBe(true);
    expect(matchRule(rule, { memo: '', tags: ['고정지출'] })).toBe(false);
  });

  it('꺼진 규칙은 맞지 않는다', () => {
    expect(matchRule({ ...base, enabled: false }, { memo: '스타벅스', tags: [] })).toBe(false);
  });

  it('빈 값은 아무것도 맞히지 않는다 (실수로 전부 분류되는 것 방지)', () => {
    expect(matchRule({ ...base, value: '' }, { memo: '아무거나', tags: [] })).toBe(false);
    expect(matchRule({ ...base, value: '   ' }, { memo: '아무거나', tags: [] })).toBe(false);
  });
});

describe('여러 규칙이 겹칠 때', () => {
  const rules: Rule[] = [
    { ...base, id: 'r1', value: '커피', categoryId: 'cat-food-cafe', priority: 20 },
    { ...base, id: 'r2', value: '스타벅스', categoryId: 'cat-food-dining', priority: 10 },
  ];

  it('priority 가 낮은 것이 이긴다', () => {
    const match = applyRules({ memo: '스타벅스 커피', tags: [] }, rules);
    expect(match?.rule.id).toBe('r2');
    expect(match?.categoryId).toBe('cat-food-dining');
  });

  it('priority 가 같으면 먼저 만든 규칙이 이긴다', () => {
    const tied: Rule[] = [
      { ...base, id: 'late', value: '커피', priority: 10, createdAt: '2026-02-01T00:00:00.000Z' },
      { ...base, id: 'early', value: '커피', priority: 10, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(applyRules({ memo: '커피', tags: [] }, tied)?.rule.id).toBe('early');
  });

  it('맞는 규칙이 없으면 null', () => {
    expect(applyRules({ memo: '택시비', tags: [] }, rules)).toBeNull();
  });

  it('규칙이 없어도 깨지지 않는다', () => {
    expect(applyRules({ memo: '스타벅스', tags: [] }, [])).toBeNull();
  });
});

describe('규칙이 붙이는 태그', () => {
  it('이미 있는 태그는 다시 붙이지 않는다', () => {
    const rule = { ...base, addTags: ['배달', '외식'] };
    const match = applyRules({ memo: '스타벅스', tags: ['배달'] }, [rule]);
    expect(match?.addTags).toEqual(['외식']);
  });

  it('addTags 가 없으면 빈 배열', () => {
    expect(applyRules({ memo: '스타벅스', tags: [] }, [base])?.addTags).toEqual([]);
  });
});

describe('데모 규칙을 실제 거래에 적용', () => {
  it('스타벅스 규칙은 3건에 맞는다', () => {
    const rule = demoRules.find((r) => r.id === 'rule-starbucks')!;
    expect(countMatches(rule, demoTransactions)).toBe(3);
  });

  it('배달의민족 규칙은 2건에 맞는다', () => {
    const rule = demoRules.find((r) => r.id === 'rule-baemin')!;
    expect(countMatches(rule, demoTransactions)).toBe(2);
  });

  it('교통카드 규칙은 3건에 맞는다', () => {
    const rule = demoRules.find((r) => r.id === 'rule-transit')!;
    expect(countMatches(rule, demoTransactions)).toBe(3);
  });

  it('규칙이 실제로 맞는 카테고리를 가리킨다', () => {
    // 데모 거래가 이미 그 카테고리로 분류돼 있는지 확인 — 규칙과 데이터가 어긋나면 안 된다
    for (const rule of demoRules) {
      const matched = demoTransactions.filter((tx) =>
        matchRule(rule, { memo: tx.memo, tags: tx.tags }),
      );
      expect(matched.length).toBeGreaterThan(0);
      expect(matched.every((tx) => tx.categoryId === rule.categoryId)).toBe(true);
    }
  });
});

describe('규칙 관리', () => {
  it('지워진 카테고리를 가리키는 규칙을 찾아낸다', () => {
    expect(isDangling(base, demoCategories)).toBe(false);
    expect(isDangling({ ...base, categoryId: 'cat-없음' }, demoCategories)).toBe(true);
  });

  it('새 규칙은 맨 뒤 우선순위를 받는다', () => {
    expect(nextPriority([])).toBe(10);
    expect(nextPriority(demoRules)).toBe(40);
  });
});
