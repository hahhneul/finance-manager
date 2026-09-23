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
import { QuickInput } from '../input/QuickInput';
import { TransactionList } from '../transactions/TransactionList';

/**
 * 화면이 실제로 뜨고 저장까지 되는지 보는 스모크 테스트.
 * 타입 검사나 빌드로는 못 잡는 런타임 오류를 여기서 잡는다.
 */

/** 키패드와 인원 버튼에 같은 숫자가 있어서 영역을 좁혀 찾는다 */
const keypad = () => within(screen.getByRole('group', { name: '숫자 키패드' }));
const headcountGroup = () => within(screen.getByRole('group', { name: '정산 인원' }));

function renderAt(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/transactions" element={<p>이동 완료</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await clearAll();
  await seedDemoData();
});

// globals:false 로 쓰고 있어서 RTL 자동 정리가 걸리지 않는다. 직접 붙인다.
afterEach(cleanup);

describe('빠른 입력 화면', () => {
  it('화면이 뜨고 기본값이 채워져 있다', async () => {
    renderAt(<QuickInput />);

    await screen.findByText('거래 입력');
    // 날짜 기본값은 오늘
    expect(screen.getByText('오늘')).toBeInTheDocument();
    // 지출이 기본 선택
    expect(screen.getByRole('tab', { name: '지출' })).toHaveAttribute('aria-selected', 'true');
  });

  it('키패드로 금액이 찍힌다', async () => {
    const user = userEvent.setup();
    renderAt(<QuickInput />);
    await screen.findByText('거래 입력');

    await user.click(keypad().getByRole('button', { name: '1' }));
    await user.click(keypad().getByRole('button', { name: '2' }));
    await user.click(keypad().getByRole('button', { name: '00' }));

    expect(screen.getByText('1,200원')).toBeInTheDocument();

    await user.click(keypad().getByRole('button', { name: '지우기' }));
    expect(screen.getByText('120원')).toBeInTheDocument();
  });

  it('금액 → 카테고리 → 저장 3동작으로 지출이 기록된다', async () => {
    const user = userEvent.setup();
    const before = await db.transactions.count();
    renderAt(<QuickInput />);
    await screen.findByText('거래 입력');

    // 1) 금액
    await user.click(keypad().getByRole('button', { name: '9' }));
    await user.click(keypad().getByRole('button', { name: '00' }));
    await user.click(keypad().getByRole('button', { name: '0' }));

    // 2) 카테고리 (그리드 첫 칸 = 가장 자주 쓴 '카페')
    await user.click(screen.getByRole('button', { name: '카페' }));

    // 3) 저장
    await user.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(async () => {
      expect(await db.transactions.count()).toBe(before + 1);
    });

    const saved = (await db.transactions.toArray()).find((t) => t.amount === 9_000);
    expect(saved).toBeDefined();
    expect(saved!.categoryId).toBe('cat-food-cafe');
    expect(saved!.type).toBe('expense');
  });

  it('금액이 0원이면 저장 버튼이 눌리지 않는다', async () => {
    renderAt(<QuickInput />);
    await screen.findByText('거래 입력');

    expect(screen.getByRole('button', { name: /저장/ })).toBeDisabled();
  });
});

describe('정산 입력', () => {
  it('인원을 고르면 내 부담과 돌려받을 돈이 바로 보인다', async () => {
    const user = userEvent.setup();
    renderAt(<QuickInput />);
    await screen.findByText('거래 입력');

    await user.click(screen.getByRole('tab', { name: '정산' }));

    // 34,000원
    for (const key of ['3', '4', '00', '0']) {
      await user.click(keypad().getByRole('button', { name: key }));
    }

    await user.click(headcountGroup().getByRole('button', { name: '3' }));

    // 34,000 / 3 → 1인당 11,333 · 내 부담 11,334 · 돌려받을 22,666
    expect(screen.getByText('11,333원')).toBeInTheDocument();
    expect(screen.getByText('11,334원')).toBeInTheDocument();
    expect(screen.getByText('22,666원')).toBeInTheDocument();
    expect(screen.getByText(/잔돈 1원을 내가 부담/)).toBeInTheDocument();
  });

  it('결제 계좌와 정산 받을 계좌를 모두 고르면 저장된다', async () => {
    const user = userEvent.setup();
    renderAt(<QuickInput />);
    await screen.findByText('거래 입력');

    await user.click(screen.getByRole('tab', { name: '정산' }));
    for (const key of ['4', '5', '00', '0']) {
      await user.click(keypad().getByRole('button', { name: key }));
    }

    // 정산 받을 계좌 고르기
    await user.click(screen.getByRole('button', { name: /정산 받을 곳/ }));
    await user.click(await screen.findByRole('button', { name: /카카오뱅크/ }));

    await user.click(screen.getByRole('button', { name: /^저장$/ }));

    await waitFor(async () => {
      expect(await db.settlements.count()).toBe(4);
    });

    const saved = (await db.settlements.toArray()).find((s) => s.totalAmount === 45_000 && s.id !== 'stl-3');
    expect(saved).toBeDefined();
    expect(saved!.myShare).toBe(22_500);
    expect(saved!.reimbursedAmount).toBe(22_500);
    expect(saved!.receiverAccountId).toBe('acc-kakao');
  });
});

describe('거래 목록 화면', () => {
  it('데모 데이터가 날짜별로 보인다', async () => {
    renderAt(<TransactionList />);

    await screen.findByText('내역');
    // 데모 거래 중 하나
    expect(await screen.findByText('주말 브런치')).toBeInTheDocument();
  });

  it('정산은 결제 총액과 내 부담을 함께 보여준다', async () => {
    renderAt(<TransactionList />);
    await screen.findByText('내역');

    const title = await screen.findByText('치킨 모임');
    // 그 줄 안에서만 찾는다 (날짜별 합계에도 같은 금액이 있다)
    const row = within(title.closest('button')!);

    expect(row.getByText('정산 2명')).toBeInTheDocument();
    // 결제는 45,000원이지만 지출로 잡히는 건 22,500원
    expect(row.getByText('결제 45,000원')).toBeInTheDocument();
    expect(row.getByText('-22,500원')).toBeInTheDocument();
  });

  it('검색이 거래와 정산을 함께 훑는다', async () => {
    const user = userEvent.setup();
    renderAt(<TransactionList />);
    await screen.findByText('내역');

    await user.type(screen.getByPlaceholderText('메모·태그 검색'), '브런치');

    await waitFor(() => {
      expect(screen.getByText('주말 브런치')).toBeInTheDocument();
      expect(screen.queryByText('치킨 모임')).not.toBeInTheDocument();
    });
  });

  it('줄을 탭하면 수정 시트가 열린다', async () => {
    const user = userEvent.setup();
    renderAt(<TransactionList />);
    await screen.findByText('내역');

    await user.click(await screen.findByText('주말 브런치'));

    expect(await screen.findByText('거래 수정')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /삭제/ })).toBeInTheDocument();
  });
});
