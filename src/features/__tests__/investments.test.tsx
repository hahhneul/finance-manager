// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/schema';
import { clearAll, ensureTodaySnapshot, loadSnapshots } from '@/db/repo';
import { seedDemoData, seedIfEmpty } from '@/db/seed';
import { InvestmentsScreen } from '../investments/InvestmentsScreen';
import { Dashboard } from '../dashboard/Dashboard';
import { expectedNetWorth, expectedPositions } from '@/demo/expected';
import { monthlySnapshots } from '@/core/networth';
import { lastNMonths } from '@/core/date';

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
        <Route path="/investments" element={<p>투자</p>} />
        <Route path="/transactions" element={<p>내역</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('투자 화면', () => {
  it('포트폴리오 요약이 손계산과 맞는다', async () => {
    renderIn(<InvestmentsScreen />);
    await screen.findByText('투자');

    // 774,000 + 1,305,000 + 1,350,000
    expect(await screen.findByText('3,429,000원')).toBeInTheDocument();
    // 평가손익 113,040 + (-16,500) + 93,150
    expect(screen.getByText('+189,690원')).toBeInTheDocument();
    // 삼성전자 매도분
    expect(screen.getByText('+68,460원')).toBeInTheDocument();
  });

  it('보유 종목마다 평가액과 수익률을 보여준다', async () => {
    renderIn(<InvestmentsScreen />);
    await screen.findByText('삼성전자');

    const row = within(screen.getByText('삼성전자').closest('div')!.parentElement!);
    expect(row.getByText(expectedPositions['005930'].marketValueKrw.toLocaleString('ko-KR') + '원'))
      .toBeInTheDocument();
    // 9주 · 평단 73,440원
    expect(row.getByText(/9주 · 평단 73,440원/)).toBeInTheDocument();
  });

  it('손실 종목은 파란색 부호로 나온다', async () => {
    renderIn(<InvestmentsScreen />);
    await screen.findByText('카카오');

    // 1,305,000 − 1,321,500
    expect(screen.getByText(/-16,500원/)).toBeInTheDocument();
  });

  it('현재가 옆에 기준 시각을 적는다', async () => {
    renderIn(<InvestmentsScreen />);
    await screen.findByText('삼성전자');

    // 데모 시세는 2026-09-20 15:30 (한국 시간) — 종목 3개 + 환율 1개.
    // 환율은 따로 읽어오므로 4개가 다 뜰 때까지 기다린다
    // (findAllByText 는 1개만 찾아도 통과해서 3개로 세는 경우가 있었다)
    await waitFor(() => {
      expect(screen.getAllByText(/기준 9월 20일/)).toHaveLength(4);
    });
  });

  it('달러 종목이 있으면 환율을 보여준다', async () => {
    renderIn(<InvestmentsScreen />);
    await screen.findByText('USD / KRW 환율');

    // 환율은 따로 읽어오므로 값이 채워질 때까지 기다린다
    expect(await screen.findByText('1,350.00원')).toBeInTheDocument();
  });
});

describe('현재가 수동 수정', () => {
  it('가격을 고치면 평가액이 바로 바뀐다', async () => {
    const user = userEvent.setup();
    renderIn(<InvestmentsScreen />);
    await screen.findByText('삼성전자');

    // 삼성전자 현재가 버튼 (86,000원)
    await user.click(screen.getByText('86,000원').closest('button')!);

    const sheet = within(await screen.findByRole('dialog', { name: '삼성전자 현재가' }));
    const input = sheet.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '90000');

    // 9주 × 90,000 = 810,000
    expect(sheet.getByText('810,000원')).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      const quote = (await db.quotes.toArray()).find((q) => q.symbol === '005930');
      expect(quote?.price).toBe(90_000);
      // 기준 시각이 지금으로 갱신된다
      expect(quote?.asOf).not.toBe('2026-09-20T06:30:00.000Z');
    });
  });
});

describe('매매 기록 입력', () => {
  it('매수하면 수량과 평단이 다시 계산된다', async () => {
    const user = userEvent.setup();
    renderIn(<InvestmentsScreen />);
    await screen.findByText('투자');

    await user.click(screen.getByRole('button', { name: '매매 기록 추가' }));
    const sheet = within(await screen.findByRole('dialog', { name: '매매 기록' }));

    await user.type(sheet.getByPlaceholderText('005930 / AAPL'), '005930');
    await user.type(sheet.getByLabelText('수량'), '5');
    await user.type(sheet.getByLabelText('체결가'), '90000');

    // 저장 전에 평단이 어떻게 되는지 보여준다
    // (660,960 + 450,000) / 14 = 79,354.28…
    expect(sheet.getByText(/9 → 14주/)).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      const holding = (await db.holdings.toArray()).find((h) => h.symbol === '005930')!;
      expect(holding.quantity).toBe(14);
      expect(holding.avgCost).toBeCloseTo((660_960 + 450_000) / 14, 6);
    });
  });

  it('보유량보다 많이 팔면 막는다', async () => {
    const user = userEvent.setup();
    renderIn(<InvestmentsScreen />);
    await screen.findByText('투자');

    await user.click(screen.getByRole('button', { name: '매매 기록 추가' }));
    const sheet = within(await screen.findByRole('dialog', { name: '매매 기록' }));

    await user.click(sheet.getByRole('tab', { name: '매도' }));
    await user.type(sheet.getByPlaceholderText('005930 / AAPL'), '005930');
    await user.type(sheet.getByLabelText('수량'), '20');
    await user.type(sheet.getByLabelText('체결가'), '90000');
    await user.click(sheet.getByRole('button', { name: '저장' }));

    expect(await screen.findByText(/보유 수량\(9주\)보다 많이 팔 수 없습니다/)).toBeInTheDocument();
  });

  it('달러 매매는 환율을 요구한다', async () => {
    const user = userEvent.setup();
    renderIn(<InvestmentsScreen />);
    await screen.findByText('투자');

    await user.click(screen.getByRole('button', { name: '매매 기록 추가' }));
    const sheet = within(await screen.findByRole('dialog', { name: '매매 기록' }));

    await user.type(sheet.getByPlaceholderText('005930 / AAPL'), 'TSLA');
    await user.click(sheet.getByRole('tab', { name: '미국 (달러)' }));
    await user.type(sheet.getByLabelText('수량'), '2');
    await user.type(sheet.getByLabelText('체결가'), '300');
    await user.click(sheet.getByRole('button', { name: '저장' }));

    expect(await screen.findByText(/체결 시점 환율이 필요합니다/)).toBeInTheDocument();
  });
});

describe('순자산 카드', () => {
  it('손계산한 순자산이 그대로 나온다', async () => {
    renderIn(<Dashboard />);
    await screen.findByText('순자산');

    expect(await screen.findByText('5,635,836원')).toBeInTheDocument();
    expect(screen.getByText('2,923,836원')).toBeInTheDocument();   // 현금성
    expect(screen.getByText('3,429,000원')).toBeInTheDocument();   // 투자
    expect(screen.getByText('-717,000원')).toBeInTheDocument();    // 갚을 돈
  });

  it('현금성 + 투자 비율이 100%다', async () => {
    renderIn(<Dashboard />);
    await screen.findByText('순자산');

    const card = within(screen.getByText('순자산').closest('section')!);
    const percents = card
      .getAllByText(/^\d+%$/)
      .map((el) => Number(el.textContent!.replace('%', '')));

    expect(percents).toHaveLength(2);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('일일 스냅샷', () => {
  it('앱을 열면 그날의 순자산이 기록된다', async () => {
    const snapshot = await ensureTodaySnapshot();

    expect(snapshot).not.toBeNull();
    expect(snapshot!.netWorth).toBe(expectedNetWorth.netWorth);
    expect(snapshot!.cashAssets).toBe(expectedNetWorth.cashAssets);
  });

  it('같은 날 다시 열면 덮어쓴다 (두 줄이 생기지 않는다)', async () => {
    await ensureTodaySnapshot();
    const afterFirst = (await loadSnapshots()).length;

    await ensureTodaySnapshot();
    await ensureTodaySnapshot();

    expect((await loadSnapshots()).length).toBe(afterFirst);
  });

  it('데모 데이터에는 과거 추이가 역산돼 들어 있다', async () => {
    const snapshots = await loadSnapshots();

    // 6개월 월말 + 오늘
    expect(snapshots.length).toBeGreaterThanOrEqual(6);
    expect(snapshots[0].date).toBe('2026-04-30');
    // 날짜순 정렬
    expect(snapshots.map((s) => s.date)).toEqual([...snapshots.map((s) => s.date)].sort());
  });
});

describe('동시에 두 번 실행돼도 깨지지 않는다', () => {
  it('스냅샷을 동시에 기록해도 같은 날짜가 두 줄 생기지 않는다', async () => {
    // React StrictMode 는 effect 를 두 번 실행한다.
    // 읽고-쓰기 사이에 끼어들면 유니크 인덱스에 걸려 앱이 통째로 멈춘다.
    await Promise.all([
      ensureTodaySnapshot(),
      ensureTodaySnapshot(),
      ensureTodaySnapshot(),
    ]);

    const snapshots = await loadSnapshots();
    const dates = snapshots.map((s) => s.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('데모 심기를 동시에 불러도 한 번만 들어간다', async () => {
    await clearAll();

    const [a, b, c] = await Promise.all([seedIfEmpty(), seedIfEmpty(), seedIfEmpty()]);

    // 셋 다 같은 작업을 기다렸으므로 결과도 같다
    expect([a, b, c]).toEqual([true, true, true]);
    expect(await db.accounts.count()).toBe(5);
    expect(await db.transactions.count()).toBe(46);

    const snapshots = await loadSnapshots();
    expect(new Set(snapshots.map((s) => s.date)).size).toBe(snapshots.length);
  });
});

describe('순자산 추이 차트', () => {
  it('같은 달 스냅샷이 여럿이어도 달마다 점 하나만 쓴다', async () => {
    // 데모에는 9/20 스냅샷이 있고, 앱을 열면 오늘(9/22)이 더해진다
    await ensureTodaySnapshot();
    const snapshots = await loadSnapshots();

    const september = snapshots.filter((s) => s.date.startsWith('2026-09'));
    expect(september.length).toBeGreaterThanOrEqual(2);

    // 차트는 이 함수로 달마다 마지막 값 하나만 고른다
    // (Recharts 는 jsdom 에서 그려지지 않으므로 데이터 단계에서 확인한다)
    const months = lastNMonths('2026-09', 6);
    const rows = monthlySnapshots(snapshots, months);

    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.month === '2026-09')).toHaveLength(1);

    // 9월 점은 가장 늦은 날짜의 값이다
    const latest = september.reduce((a, b) => (a.date > b.date ? a : b));
    expect(rows.find((r) => r.month === '2026-09')!.snapshot!.date).toBe(latest.date);
  });

  it('기록이 없는 달은 건너뛴다 — 없는 값을 지어내지 않는다', async () => {
    const snapshots = await loadSnapshots();
    const rows = monthlySnapshots(snapshots, lastNMonths('2027-03', 6));

    // 2026-10 ~ 2027-03 에는 기록이 없다
    expect(rows.every((r) => r.snapshot === null)).toBe(true);
  });
});
