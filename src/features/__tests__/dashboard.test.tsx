// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearAll } from '@/db/repo';
import { seedDemoData } from '@/db/seed';
import { Dashboard } from '../dashboard/Dashboard';
import { TransactionList } from '../transactions/TransactionList';

/**
 * Recharts 는 ResponsiveContainer 가 부모 크기를 재는데,
 * jsdom 은 레이아웃을 계산하지 않아 0x0 이 되어 차트가 그려지지 않는다.
 * 그래서 차트 그림 자체가 아니라 **숫자와 목록**을 확인한다.
 * (어차피 색 대비가 낮은 조각도 숫자로 읽을 수 있어야 하므로,
 *  이 목록이 있다는 것 자체가 요구사항이다)
 */

beforeEach(async () => {
  await clearAll();
  await seedDemoData();
});
afterEach(cleanup);

const renderIn = (ui: React.ReactElement) =>
  render(<MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>);

describe('대시보드', () => {
  it('이번 달 수입·지출·잔액을 보여준다', async () => {
    renderIn(<Dashboard />);
    await screen.findByText('홈');

    // 2026년 9월: 수입 300,000 / 지출 760,500 / 잔액 -460,500
    expect(await screen.findByText('300,000원')).toBeInTheDocument();
    expect(screen.getByText('760,500원')).toBeInTheDocument();
    expect(screen.getByText('-460,500원')).toBeInTheDocument();
  });

  it('카테고리별 지출이 금액과 함께 목록으로 나온다', async () => {
    renderIn(<Dashboard />);
    await screen.findByText('카테고리별 지출');

    // 주거 539,000 · 식비 130,000 (정산 치킨값 22,500 포함)
    expect(await screen.findByText('주거')).toBeInTheDocument();
    expect(screen.getByText('539,000원')).toBeInTheDocument();
    expect(screen.getByText('식비')).toBeInTheDocument();
    expect(screen.getByText('130,000원')).toBeInTheDocument();
  });

  it('카테고리 비율의 합이 100%다', async () => {
    renderIn(<Dashboard />);
    // 제목은 데이터를 읽기 전에도 뜨므로 목록이 나올 때까지 기다린다
    await screen.findByText('주거');

    // 순자산 카드에도 퍼센트가 있으므로 이 카드 안에서만 센다
    const card = within(screen.getByText('카테고리별 지출').closest('section')!);
    const percents = card
      .getAllByText(/^\d+%$/)
      .map((el) => Number(el.textContent!.replace('%', '')));

    // 9월 대분류 5개: 71 + 17 + 7 + 4 + 2 = 101 (각자 반올림한 결과)
    expect(percents).toHaveLength(5);
    const sum = percents.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  it('아직 못 받은 정산금을 알려준다', async () => {
    renderIn(<Dashboard />);
    // 치킨 모임 22,500원
    expect(await screen.findByText('아직 못 받은 정산금')).toBeInTheDocument();
    expect(screen.getByText('22,500원')).toBeInTheDocument();
  });

  it('이전 달로 이동하면 숫자가 바뀐다', async () => {
    const user = userEvent.setup();
    renderIn(<Dashboard />);
    await screen.findByText('2026년 9월');

    await user.click(screen.getByRole('button', { name: '이전 달' }));

    expect(await screen.findByText('2026년 8월')).toBeInTheDocument();
    // 8월 지출 925,234원 (정산 여행 숙소 113,334 포함)
    expect(await screen.findByText('925,234원')).toBeInTheDocument();
  });
});

describe('달력 뷰', () => {
  it('내역 탭에서 달력으로 전환된다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');

    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    // 요일 머리글
    expect(await screen.findByText('일')).toBeInTheDocument();
    expect(screen.getByText('토')).toBeInTheDocument();
    // 검색창은 사라진다
    expect(screen.queryByPlaceholderText('메모·태그 검색')).not.toBeInTheDocument();
  });

  it('금액을 줄이지 않고 숫자 그대로 적는다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');
    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    // 9월 1일: 월세 500,000 지출뿐 → 순액 500,000
    expect(await screen.findByText('500,000')).toBeInTheDocument();
  });

  it('수입이 더 많은 날도 표시한다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');
    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    // 9월 5일: 용돈 300,000 수입만 → 순액 300,000 (파랑 쪽)
    expect(await screen.findByText('300,000')).toBeInTheDocument();
  });

  it('색이 무슨 뜻인지 글자로도 적는다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');
    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    expect(await screen.findByText(/지출이 더 많은 날/)).toBeInTheDocument();
    expect(screen.getByText(/수입이 더 많은 날/)).toBeInTheDocument();
  });

  it('날짜를 누르면 그날 거래가 나온다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');
    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    // 9월 13일 = 정산 '치킨 모임'
    await screen.findByText('500,000');
    const dayButton = screen.getAllByRole('button').find((b) => b.textContent?.startsWith('13'));
    await user.click(dayButton!);

    expect(await screen.findByText('치킨 모임')).toBeInTheDocument();
    const sheet = within(screen.getByText('치킨 모임').closest('ul')!);
    expect(sheet.getByText(/정산 2명/)).toBeInTheDocument();
  });

  it('기록이 없는 날은 그렇다고 말해준다', async () => {
    const user = userEvent.setup();
    renderIn(<TransactionList />);
    await screen.findByText('내역');
    await user.click(screen.getByRole('button', { name: '달력으로 보기' }));

    // 9월 3일은 거래가 없다
    const dayButton = screen.getAllByRole('button').find((b) => b.textContent === '3');
    await user.click(dayButton!);

    expect(await screen.findByText('이 날은 기록이 없습니다.')).toBeInTheDocument();
  });
});
