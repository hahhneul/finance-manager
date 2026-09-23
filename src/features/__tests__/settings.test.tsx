// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/schema';
import { clearAll, materializeOccurrences } from '@/db/repo';
import { seedDemoData } from '@/db/seed';
import { pendingOccurrences } from '@/core/recurring';
import { AccountsScreen } from '../settings/AccountsScreen';
import { CategoriesScreen } from '../settings/CategoriesScreen';
import { RecurringScreen } from '../recurring/RecurringScreen';
import { PendingSheet } from '../recurring/PendingSheet';

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
        <Route path="/more" element={<p>전체</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('계좌 관리', () => {
  it('계좌마다 계산된 잔액을 보여준다', async () => {
    renderIn(<AccountsScreen />);
    await screen.findByText('계좌');

    expect(await screen.findByText('신한은행')).toBeInTheDocument();
    // 1단계에서 손으로 계산한 값
    expect(await screen.findByText('2,194,200원')).toBeInTheDocument();
  });

  it('신용카드는 "갚을 돈"으로 보여준다', async () => {
    renderIn(<AccountsScreen />);
    await screen.findAllByText('신용카드');

    // 이름과 종류 라벨이 둘 다 '신용카드'라 첫 번째(이름) 기준으로 줄을 찾는다
    const row = within(screen.getAllByText('신용카드')[0].closest('button')!);
    expect(row.getByText('갚을 돈')).toBeInTheDocument();
    expect(row.getByText('717,000원')).toBeInTheDocument();
  });

  it('계좌를 추가할 수 있다', async () => {
    const user = userEvent.setup();
    renderIn(<AccountsScreen />);
    await screen.findByText('계좌');

    await user.click(screen.getByRole('button', { name: '계좌 추가' }));
    await user.type(screen.getByPlaceholderText('예: 카카오뱅크'), '토스뱅크');
    await user.type(screen.getByPlaceholderText('0'), '50000');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      expect(await db.accounts.count()).toBe(6);
    });

    const saved = (await db.accounts.toArray()).find((a) => a.name === '토스뱅크');
    expect(saved?.initialBalance).toBe(50_000);
  });

  it('거래가 있는 계좌는 지울 수 없고 이유를 알려준다', async () => {
    const user = userEvent.setup();
    renderIn(<AccountsScreen />);
    await screen.findByText('신한은행');

    await user.click(screen.getByText('신한은행').closest('button')!);
    await user.click(await screen.findByRole('button', { name: /계좌 삭제/ }));
    await user.click(screen.getByRole('button', { name: '정말 삭제' }));

    expect(await screen.findByText(/이 계좌를 쓰는 거래가 .*건 있습니다/)).toBeInTheDocument();
    expect(await db.accounts.count()).toBe(5);
  });
});

describe('카테고리 관리', () => {
  it('대분류를 펼치면 소분류가 나온다', async () => {
    const user = userEvent.setup();
    renderIn(<CategoriesScreen />);
    await screen.findByText('카테고리');

    expect(await screen.findByText('식비')).toBeInTheDocument();
    expect(screen.queryByText('카페')).not.toBeInTheDocument();

    const row = screen.getByText('식비').closest('div')!;
    await user.click(within(row).getByRole('button', { name: '펼치기' }));

    expect(await screen.findByText('카페')).toBeInTheDocument();
    expect(screen.getByText('외식')).toBeInTheDocument();
  });

  it('수입 카테고리로 전환된다', async () => {
    const user = userEvent.setup();
    renderIn(<CategoriesScreen />);
    await screen.findByText('식비');

    await user.click(screen.getByRole('tab', { name: '수입' }));

    expect(await screen.findByText('근로소득')).toBeInTheDocument();
    expect(screen.queryByText('식비')).not.toBeInTheDocument();
  });

  it('쓰이고 있는 카테고리는 지울 수 없다', async () => {
    const user = userEvent.setup();
    renderIn(<CategoriesScreen />);
    await screen.findByText('의료');

    // 의료는 소분류가 없고 거래가 1건 있다
    await user.click(screen.getByText('의료').closest('button')!);
    await user.click(await screen.findByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '정말 삭제' }));

    expect(await screen.findByText(/이 카테고리를 쓰는 거래가 1건 있습니다/)).toBeInTheDocument();
  });
});

describe('반복 거래', () => {
  it('등록된 반복 거래와 다음 예정일을 보여준다', async () => {
    renderIn(<RecurringScreen />);
    await screen.findByText('반복 거래');

    expect(await screen.findByText('월세')).toBeInTheDocument();
    const row = within(screen.getByText('월세').closest('button')!);
    expect(row.getByText(/매월 1일/)).toBeInTheDocument();
    expect(row.getByText('500,000원')).toBeInTheDocument();
  });

  it('반복 거래를 추가하면 오늘부터 시작한다', async () => {
    const user = userEvent.setup();
    renderIn(<RecurringScreen />);
    await screen.findByText('반복 거래');

    await user.click(screen.getByRole('button', { name: '반복 거래 추가' }));
    await user.type(screen.getByPlaceholderText('예: 넷플릭스'), '헬스장');
    await user.type(screen.getByPlaceholderText('0'), '55000');
    await user.click(screen.getByRole('button', { name: /계좌/ }));

    // 목록 화면에도 '신한은행'이 적힌 줄이 있으므로 계좌 고르기 시트 안에서만 찾는다
    const picker = within(await screen.findByRole('dialog', { name: '계좌' }));
    await user.click(picker.getByRole('button', { name: /신한은행/ }));

    const editor = within(screen.getByRole('dialog', { name: '반복 거래 추가' }));
    await user.click(editor.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      expect(await db.recurring.count()).toBe(3);
    });

    const saved = (await db.recurring.toArray()).find((r) => r.name === '헬스장')!;
    expect(saved.template.amount).toBe(55_000);
    // 과거 것을 한꺼번에 만들어내지 않도록 오늘부터 시작한다
    expect(saved.lastGeneratedDate).toBe(saved.startDate);
  });
});

describe('밀린 반복 거래 확인', () => {
  /** 데모 반복 거래를 두 달 밀린 상태로 만든다 */
  const twoMonthsLater = '2026-11-20';

  it('기록을 누르면 거래가 만들어진다', async () => {
    const user = userEvent.setup();
    const recurrings = await db.recurring.toArray();
    const pending = pendingOccurrences(recurrings, twoMonthsLater);
    const accounts = await db.accounts.toArray();

    expect(pending).toHaveLength(4);

    render(
      <PendingSheet open occurrences={pending} accounts={accounts} onClose={() => {}} />,
    );

    await user.click(screen.getByRole('button', { name: '4건 모두 기록' }));

    expect(await screen.findByText('4건을 기록했습니다.')).toBeInTheDocument();

    const created = (await db.transactions.toArray()).filter((t) => t.recurringId);
    expect(created).toHaveLength(4);
    expect(created.filter((t) => t.date === '2026-10-01')[0].amount).toBe(500_000);
  });

  it('건너뛰면 거래는 안 생기고 다시 묻지도 않는다', async () => {
    const user = userEvent.setup();
    const recurrings = await db.recurring.toArray();
    const pending = pendingOccurrences(recurrings, twoMonthsLater);
    const before = await db.transactions.count();

    render(
      <PendingSheet open occurrences={pending} accounts={[]} onClose={() => {}} />,
    );

    await user.click(screen.getByRole('button', { name: '이번엔 건너뛰기' }));
    await screen.findByText('4건을 건너뛰었습니다.');

    expect(await db.transactions.count()).toBe(before);

    // 마지막 기록일이 올라가서 다시 뜨지 않는다
    const after = await db.recurring.toArray();
    expect(pendingOccurrences(after, twoMonthsLater)).toHaveLength(0);
  });

  it('두 번 눌러도 같은 거래가 두 번 생기지 않는다', async () => {
    const recurrings = await db.recurring.toArray();
    const pending = pendingOccurrences(recurrings, twoMonthsLater);

    await materializeOccurrences(pending, 'record');
    await materializeOccurrences(pending, 'record');

    const created = (await db.transactions.toArray()).filter((t) => t.recurringId);
    expect(created).toHaveLength(4);
  });
});
