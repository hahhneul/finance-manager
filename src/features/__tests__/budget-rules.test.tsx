// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/schema';
import { clearAll } from '@/db/repo';
import { seedDemoData } from '@/db/seed';
import { BudgetScreen } from '../budget/BudgetScreen';
import { RulesScreen } from '../rules/RulesScreen';
import { QuickInput } from '../input/QuickInput';

beforeEach(async () => {
  await clearAll();
  await seedDemoData();
});
afterEach(cleanup);

const renderIn = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/transactions" element={<p>이동 완료</p>} />
        <Route path="/more" element={<p>전체</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('예산 화면', () => {
  it('카테고리별 사용액과 예산을 보여준다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('예산');

    // 식비 400,000 예산에 130,000 사용
    expect(await screen.findByText('식비')).toBeInTheDocument();
    expect(screen.getByText('130,000원')).toBeInTheDocument();
    expect(screen.getByText('/ 400,000원')).toBeInTheDocument();
  });

  it('초과한 카테고리에 색뿐 아니라 "초과" 글자를 붙인다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('쇼핑');

    // 쇼핑 10,000 예산에 12,000 사용 → 초과
    const row = within(screen.getByText('쇼핑').closest('button')!);
    expect(row.getByText('초과')).toBeInTheDocument();
    expect(row.getByText('2,000원 초과')).toBeInTheDocument();
  });

  it('80%를 넘으면 "주의"로 알린다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('문화');

    // 문화 30,000 예산에 29,500 사용 = 98%
    const row = within(screen.getByText('문화').closest('button')!);
    expect(row.getByText('주의')).toBeInTheDocument();
    expect(row.getByText('500원 남음')).toBeInTheDocument();
  });

  it('여유 있는 카테고리에는 경고를 띄우지 않는다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('식비');

    // 식비 32.5% — 경고 없음
    const row = within(screen.getByText('식비').closest('button')!);
    expect(row.queryByText('주의')).not.toBeInTheDocument();
    expect(row.queryByText('초과')).not.toBeInTheDocument();
  });

  it('전체 요약이 맞는다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('전체');

    // 예산 합계 1,070,000 / 사용 760,500
    expect(await screen.findByText('760,500원')).toBeInTheDocument();
    expect(screen.getByText('/ 1,070,000원')).toBeInTheDocument();
    expect(screen.getByText(/309,500원 남음/)).toBeInTheDocument();
  });

  it('예산을 고치면 바로 반영된다', async () => {
    const user = userEvent.setup();
    renderIn(<BudgetScreen />);
    await screen.findByText('쇼핑');

    await user.click(screen.getByText('쇼핑').closest('button')!);
    await screen.findByText('쇼핑 예산');

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '50000');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      const budget = await db.budgets.get('bdg-shop');
      expect(budget?.amount).toBe(50_000);
    });

    // 초과가 사라진다
    await waitFor(() => {
      const row = within(screen.getByText('쇼핑').closest('button')!);
      expect(row.queryByText('초과')).not.toBeInTheDocument();
    });
  });

  it('예산이 없는 달에는 지난달 복사를 권한다', async () => {
    const user = userEvent.setup();
    renderIn(<BudgetScreen />);
    await screen.findByText('2026년 9월');

    await user.click(screen.getByRole('button', { name: '이전 달' }));
    await screen.findByText('2026년 8월');

    expect(await screen.findByText('2026년 8월 예산이 없습니다.')).toBeInTheDocument();

    // 7월 예산도 없으므로 가져올 것이 없다고 알려준다
    await user.click(screen.getByRole('button', { name: /예산 그대로 가져오기/ }));
    expect(await screen.findByText('가져올 예산이 없습니다.')).toBeInTheDocument();
  });
});

describe('자동 분류 규칙 화면', () => {
  it('규칙마다 몇 건에 해당하는지 보여준다', async () => {
    renderIn(<RulesScreen />);
    await screen.findByText('자동 분류 규칙');

    expect(await screen.findByText('스타벅스')).toBeInTheDocument();
    // 스타벅스 3건, 배달의민족 2건, 교통카드 3건
    expect(screen.getAllByText('3건 해당')).toHaveLength(2);
    expect(screen.getByText('2건 해당')).toBeInTheDocument();
  });

  it('규칙을 만들 때 몇 건에 맞는지 미리 보여준다', async () => {
    const user = userEvent.setup();
    renderIn(<RulesScreen />);
    await screen.findByText('자동 분류 규칙');

    await user.click(screen.getByRole('button', { name: '규칙 추가' }));
    await screen.findByText('규칙 추가');

    await user.type(screen.getByPlaceholderText('예: 스타벅스'), '이마트');
    await user.click(screen.getByRole('button', { name: '카테고리 고르기' }));
    await user.click(await screen.findByRole('button', { name: '장보기' }));

    // 이마트 장보기 3건 (7/8, 8/9, 9/8)
    expect(await screen.findByText('지금 기록에서 3건에 해당합니다.')).toBeInTheDocument();
    // 이미 장보기로 분류돼 있으므로 바뀌는 건 없다
    expect(screen.queryByText(/이미 다른 카테고리로/)).not.toBeInTheDocument();
  });

  it('이미 다른 카테고리인 거래가 있으면 경고한다', async () => {
    const user = userEvent.setup();
    renderIn(<RulesScreen />);
    await screen.findByText('자동 분류 규칙');

    await user.click(screen.getByRole('button', { name: '규칙 추가' }));
    await user.type(screen.getByPlaceholderText('예: 스타벅스'), '이마트');
    await user.click(screen.getByRole('button', { name: '카테고리 고르기' }));
    await user.click(await screen.findByRole('button', { name: '택시' }));

    expect(await screen.findByText(/그중 3건은 이미 다른 카테고리로/)).toBeInTheDocument();
  });

  it('새 규칙이 저장된다', async () => {
    const user = userEvent.setup();
    renderIn(<RulesScreen />);
    await screen.findByText('자동 분류 규칙');

    await user.click(screen.getByRole('button', { name: '규칙 추가' }));
    await user.type(screen.getByPlaceholderText('예: 스타벅스'), '올리브영');
    await user.click(screen.getByRole('button', { name: '카테고리 고르기' }));
    await user.click(await screen.findByRole('button', { name: '생필품' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      expect(await db.rules.count()).toBe(4);
    });

    const saved = (await db.rules.toArray()).find((r) => r.value === '올리브영');
    expect(saved?.categoryId).toBe('cat-shop-daily');
    // 기존 규칙 뒤로 붙는다
    expect(saved?.priority).toBe(40);
  });
});

describe('입력할 때 규칙이 자동으로 적용된다', () => {
  it('메모에 스타벅스를 치면 카페가 골라진다', async () => {
    const user = userEvent.setup();
    renderIn(<QuickInput />);
    await screen.findByText('거래 입력');

    await user.type(screen.getByPlaceholderText('메모'), '스타벅스 라떼');

    // '카페'는 받침이 없으므로 '카페를'
    expect(await screen.findByText(/'스타벅스' 규칙으로 카페를 골랐습니다/)).toBeInTheDocument();
    expect(screen.getByText('선택: 카페')).toBeInTheDocument();
  });

  it('직접 고른 카테고리는 규칙이 덮어쓰지 않는다', async () => {
    const user = userEvent.setup();
    renderIn(<QuickInput />);
    await screen.findByText('거래 입력');

    // 먼저 직접 '외식'을 고른다
    await user.click(screen.getByRole('button', { name: '외식' }));
    expect(screen.getByText('선택: 외식')).toBeInTheDocument();

    // 그 뒤 스타벅스를 쳐도 바뀌지 않는다
    await user.type(screen.getByPlaceholderText('메모'), '스타벅스');
    expect(screen.getByText('선택: 외식')).toBeInTheDocument();
    expect(screen.queryByText(/규칙으로/)).not.toBeInTheDocument();
  });

  it('메모를 지우면 자동 선택도 거둔다', async () => {
    const user = userEvent.setup();
    renderIn(<QuickInput />);
    await screen.findByText('거래 입력');

    const memo = screen.getByPlaceholderText('메모');
    await user.type(memo, '스타벅스');
    expect(await screen.findByText('선택: 카페')).toBeInTheDocument();

    await user.clear(memo);
    await waitFor(() => {
      expect(screen.queryByText('선택: 카페')).not.toBeInTheDocument();
    });
  });

  it('자동 선택을 취소할 수 있다', async () => {
    const user = userEvent.setup();
    renderIn(<QuickInput />);
    await screen.findByText('거래 입력');

    await user.type(screen.getByPlaceholderText('메모'), '스타벅스');
    await screen.findByText('선택: 카페');

    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByText('선택: 카페')).not.toBeInTheDocument();
  });
});

describe('전체 예산 바', () => {
  it('한 카테고리가 넘쳐도 전체 사용률이 낮으면 초과로 칠하지 않는다', async () => {
    renderIn(<BudgetScreen />);
    await screen.findByText('전체');

    // 전체 760,500 / 1,070,000 = 71% — 쇼핑 하나가 초과했을 뿐이다
    const meters = screen.getAllByRole('meter');
    expect(meters[0]).toHaveAttribute('aria-valuenow', '71');

    // 초과 사실은 글자로 알린다
    expect(screen.getByText(/초과한 카테고리 1개/)).toBeInTheDocument();
  });
});
