/**
 * 데모 데이터 — 계산이 맞는지 확인하기 위한 기준 자료.
 *
 * id 를 UUID 가 아니라 읽을 수 있는 문자열로 둔 이유:
 * 테스트가 실패했을 때 어느 거래가 문제인지 바로 보이게 하려고.
 * (실제 사용자가 만드는 레코드는 newId() 로 UUID 를 받는다)
 *
 * 날짜는 2026-07-01 ~ 2026-09-20 으로 **고정**했다.
 * "오늘"에 의존하면 하루만 지나도 테스트가 깨진다.
 *
 * 여기 숫자들의 정답은 demo/expected.ts 에 손으로 계산해 두었다.
 */
import type {
  Account,
  Budget,
  Category,
  Entity,
  FxRate,
  Holding,
  PriceQuote,
  RecurringTransaction,
  Rule,
  Settlement,
  Trade,
  Transaction,
} from '@/types';

/** 데모 데이터의 기준 월 */
export const DEMO_MONTHS = ['2026-07', '2026-08', '2026-09'] as const;
export const DEMO_CURRENT_MONTH = '2026-09';

/** 시세 기준 시각: 2026년 9월 20일 15:30 (한국 시간) */
export const DEMO_QUOTE_AS_OF = '2026-09-20T06:30:00.000Z';

const STAMP = { createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };

/** id 와 시각을 붙여주는 도우미 */
function rec<T extends Entity>(id: string, data: Omit<T, keyof Entity>): T {
  return { id, ...STAMP, ...data } as T;
}

// ---------------------------------------------------------------------------
// 계좌
// ---------------------------------------------------------------------------

export const demoAccounts: Account[] = [
  rec<Account>('acc-cash', {
    name: '현금',
    kind: 'cash',
    initialBalance: 100_000,
    isLiability: false,
    color: '#64748b',
    archived: false,
    order: 0,
  }),
  rec<Account>('acc-shinhan', {
    name: '신한은행',
    kind: 'bank',
    initialBalance: 3_000_000,
    isLiability: false,
    color: '#2563eb',
    archived: false,
    order: 1,
  }),
  rec<Account>('acc-kakao', {
    name: '카카오뱅크',
    kind: 'bank',
    initialBalance: 200_000,
    isLiability: false,
    color: '#eab308',
    archived: false,
    order: 2,
  }),
  rec<Account>('acc-card', {
    name: '신용카드',
    kind: 'credit',
    initialBalance: 0,
    isLiability: true,
    color: '#dc2626',
    archived: false,
    order: 3,
  }),
  rec<Account>('acc-kiwoom', {
    name: '키움증권',
    kind: 'brokerage',
    initialBalance: 0,
    isLiability: false,
    color: '#0891b2',
    archived: false,
    order: 4,
  }),
];

// ---------------------------------------------------------------------------
// 카테고리 (대분류 > 소분류)
// ---------------------------------------------------------------------------

let categoryOrder = 0;
function parentCategory(id: string, name: string, flow: 'income' | 'expense', color: string): Category {
  return rec<Category>(id, { name, parentId: null, flow, color, archived: false, order: categoryOrder++ });
}
function childCategory(id: string, name: string, parentId: string, flow: 'income' | 'expense'): Category {
  return rec<Category>(id, { name, parentId, flow, archived: false, order: categoryOrder++ });
}

export const demoCategories: Category[] = [
  // 지출
  parentCategory('cat-food', '식비', 'expense', '#f97316'),
  childCategory('cat-food-dining', '외식', 'cat-food', 'expense'),
  childCategory('cat-food-cafe', '카페', 'cat-food', 'expense'),
  childCategory('cat-food-delivery', '배달', 'cat-food', 'expense'),
  childCategory('cat-food-grocery', '장보기', 'cat-food', 'expense'),

  parentCategory('cat-transport', '교통', 'expense', '#3b82f6'),
  childCategory('cat-transport-transit', '대중교통', 'cat-transport', 'expense'),
  childCategory('cat-transport-taxi', '택시', 'cat-transport', 'expense'),

  parentCategory('cat-home', '주거', 'expense', '#8b5cf6'),
  childCategory('cat-home-rent', '월세', 'cat-home', 'expense'),
  childCategory('cat-home-utility', '공과금', 'cat-home', 'expense'),

  parentCategory('cat-culture', '문화', 'expense', '#ec4899'),
  childCategory('cat-culture-movie', '영화', 'cat-culture', 'expense'),
  childCategory('cat-culture-book', '도서', 'cat-culture', 'expense'),
  childCategory('cat-culture-sub', '구독', 'cat-culture', 'expense'),
  childCategory('cat-culture-travel', '여행', 'cat-culture', 'expense'),

  parentCategory('cat-shop', '쇼핑', 'expense', '#14b8a6'),
  childCategory('cat-shop-clothes', '의류', 'cat-shop', 'expense'),
  childCategory('cat-shop-daily', '생필품', 'cat-shop', 'expense'),

  // 소분류 없이 대분류에 바로 기록하는 경우도 있다
  parentCategory('cat-health', '의료', 'expense', '#10b981'),

  // 수입
  parentCategory('cat-salary', '근로소득', 'income', '#0ea5e9'),
  childCategory('cat-salary-main', '월급', 'cat-salary', 'income'),
  parentCategory('cat-allowance', '용돈', 'income', '#a3e635'),
  parentCategory('cat-etc-income', '기타수입', 'income', '#94a3b8'),
  childCategory('cat-etc-income-interest', '이자', 'cat-etc-income', 'income'),
];

// ---------------------------------------------------------------------------
// 거래 46건
// ---------------------------------------------------------------------------

let txSeq = 0;

function expense(date: string, amount: number, accountId: string, categoryId: string, memo: string, tags: string[] = []): Transaction {
  return rec<Transaction>(`tx-${String(++txSeq).padStart(2, '0')}`, {
    date, type: 'expense', amount, accountId, categoryId, memo, tags,
  });
}
function income(date: string, amount: number, accountId: string, categoryId: string, memo: string, tags: string[] = []): Transaction {
  return rec<Transaction>(`tx-${String(++txSeq).padStart(2, '0')}`, {
    date, type: 'income', amount, accountId, categoryId, memo, tags,
  });
}
function transfer(date: string, amount: number, fromId: string, toId: string, memo: string): Transaction {
  return rec<Transaction>(`tx-${String(++txSeq).padStart(2, '0')}`, {
    date, type: 'transfer', amount, accountId: fromId, toAccountId: toId, memo, tags: [],
  });
}

export const demoTransactions: Transaction[] = [
  // ----- 2026년 7월 -----
  expense('2026-07-01', 500_000, 'acc-shinhan', 'cat-home-rent', '7월 월세', ['고정지출']),
  expense('2026-07-02', 50_000, 'acc-shinhan', 'cat-transport-transit', '교통카드 충전'),
  expense('2026-07-03', 12_000, 'acc-card', 'cat-food-dining', '점심 김치찌개'),
  income('2026-07-05', 300_000, 'acc-shinhan', 'cat-allowance', '부모님 용돈'),
  expense('2026-07-05', 5_500, 'acc-card', 'cat-food-cafe', '스타벅스 아메리카노'),
  expense('2026-07-08', 43_000, 'acc-card', 'cat-food-grocery', '이마트 장보기'),
  transfer('2026-07-08', 2_500_000, 'acc-shinhan', 'acc-kiwoom', '증권계좌 입금'),
  expense('2026-07-10', 13_500, 'acc-card', 'cat-culture-sub', '넷플릭스', ['구독']),
  expense('2026-07-12', 15_000, 'acc-card', 'cat-culture-movie', '영화 관람'),
  expense('2026-07-15', 39_000, 'acc-shinhan', 'cat-home-utility', '통신비', ['고정지출']),
  expense('2026-07-18', 8_900, 'acc-cash', 'cat-transport-taxi', '심야 택시'),
  expense('2026-07-20', 78_000, 'acc-card', 'cat-shop-clothes', '여름 셔츠'),
  expense('2026-07-22', 11_000, 'acc-card', 'cat-food-dining', '점심 돈까스'),
  income('2026-07-25', 2_000_000, 'acc-shinhan', 'cat-salary-main', '7월 월급'),
  expense('2026-07-28', 23_400, 'acc-card', 'cat-shop-daily', '생필품 구매'),
  expense('2026-07-30', 6_100, 'acc-card', 'cat-food-cafe', '카페 라떼'),

  // ----- 2026년 8월 -----
  expense('2026-08-01', 500_000, 'acc-shinhan', 'cat-home-rent', '8월 월세', ['고정지출']),
  transfer('2026-08-01', 800_000, 'acc-shinhan', 'acc-kiwoom', '증권계좌 입금'),
  expense('2026-08-03', 18_000, 'acc-card', 'cat-food-delivery', '배달의민족 치킨'),
  expense('2026-08-05', 5_500, 'acc-card', 'cat-food-cafe', '스타벅스 아메리카노'),
  expense('2026-08-07', 50_000, 'acc-shinhan', 'cat-transport-transit', '교통카드 충전'),
  expense('2026-08-09', 52_000, 'acc-card', 'cat-food-grocery', '이마트 장보기'),
  expense('2026-08-10', 13_500, 'acc-card', 'cat-culture-sub', '넷플릭스', ['구독']),
  expense('2026-08-13', 15_000, 'acc-cash', 'cat-health', '병원 진료비'),
  expense('2026-08-15', 39_000, 'acc-shinhan', 'cat-home-utility', '통신비', ['고정지출']),
  expense('2026-08-16', 24_000, 'acc-card', 'cat-culture-book', '책 2권'),
  expense('2026-08-19', 32_000, 'acc-card', 'cat-food-dining', '친구와 저녁'),
  expense('2026-08-21', 12_400, 'acc-cash', 'cat-transport-taxi', '택시'),
  expense('2026-08-24', 18_700, 'acc-card', 'cat-shop-daily', '생필품 구매'),
  income('2026-08-25', 2_000_000, 'acc-shinhan', 'cat-salary-main', '8월 월급'),
  expense('2026-08-27', 4_800, 'acc-card', 'cat-food-cafe', '편의점 커피'),
  expense('2026-08-29', 27_000, 'acc-card', 'cat-food-dining', '가족 외식'),
  income('2026-08-31', 1_200, 'acc-shinhan', 'cat-etc-income-interest', '예금 이자'),

  // ----- 2026년 9월 (오늘은 9월 21일, 월급일 전) -----
  expense('2026-09-01', 500_000, 'acc-shinhan', 'cat-home-rent', '9월 월세', ['고정지출']),
  expense('2026-09-02', 5_500, 'acc-card', 'cat-food-cafe', '스타벅스 아메리카노'),
  expense('2026-09-04', 14_000, 'acc-card', 'cat-food-dining', '점심 파스타'),
  income('2026-09-05', 300_000, 'acc-shinhan', 'cat-allowance', '부모님 용돈'),
  expense('2026-09-06', 50_000, 'acc-shinhan', 'cat-transport-transit', '교통카드 충전'),
  expense('2026-09-08', 38_000, 'acc-card', 'cat-food-grocery', '이마트 장보기'),
  expense('2026-09-10', 13_500, 'acc-card', 'cat-culture-sub', '넷플릭스', ['구독']),
  expense('2026-09-11', 16_000, 'acc-card', 'cat-culture-movie', '영화 관람'),
  expense('2026-09-14', 21_000, 'acc-card', 'cat-food-delivery', '배달의민족 피자'),
  expense('2026-09-15', 39_000, 'acc-shinhan', 'cat-home-utility', '통신비', ['고정지출']),
  expense('2026-09-17', 6_000, 'acc-card', 'cat-food-cafe', '카페 라떼'),
  expense('2026-09-19', 12_000, 'acc-card', 'cat-shop-daily', '생필품 구매'),
  expense('2026-09-20', 23_000, 'acc-card', 'cat-food-dining', '주말 브런치'),
];

// ---------------------------------------------------------------------------
// 정산 3건 — 나누어떨어지는 경우 / 잔돈이 남는 경우 / 아직 못 받은 경우
// ---------------------------------------------------------------------------

export const demoSettlements: Settlement[] = [
  // 120,000 / 4명 → 딱 떨어진다. 내 몫 30,000, 돌려받을 90,000
  rec<Settlement>('stl-1', {
    date: '2026-07-19',
    title: '팀 회식',
    totalAmount: 120_000,
    headcount: 4,
    payerAccountId: 'acc-card',
    receiverAccountId: 'acc-kakao',
    categoryId: 'cat-food-dining',
    myShare: 30_000,
    reimbursedAmount: 90_000,
    receivedDate: '2026-07-19',
    memo: '내가 법인카드로 전부 결제',
    tags: ['정산'],
  }),

  // 340,000 / 3명 → 1인당 113,333, 잔돈 1원은 결제자가 부담해서 내 몫 113,334
  rec<Settlement>('stl-2', {
    date: '2026-08-22',
    title: '여행 숙소',
    totalAmount: 340_000,
    headcount: 3,
    payerAccountId: 'acc-shinhan',
    receiverAccountId: 'acc-kakao',
    categoryId: 'cat-culture-travel',
    myShare: 113_334,
    reimbursedAmount: 226_666,
    receivedDate: '2026-08-22',
    memo: '강릉 펜션 2박',
    tags: ['정산', '여행'],
  }),

  // 아직 못 받음 → receivedDate 없음. 카카오뱅크 잔액에 반영되지 않는다
  rec<Settlement>('stl-3', {
    date: '2026-09-13',
    title: '치킨 모임',
    totalAmount: 45_000,
    headcount: 2,
    payerAccountId: 'acc-card',
    receiverAccountId: 'acc-kakao',
    categoryId: 'cat-food-dining',
    myShare: 22_500,
    reimbursedAmount: 22_500,
    receivedDate: undefined,
    memo: '아직 안 보내줌',
    tags: ['정산'],
  }),
];

// ---------------------------------------------------------------------------
// 예산 (2026년 9월)
// ---------------------------------------------------------------------------

export const demoBudgets: Budget[] = [
  rec<Budget>('bdg-food', { month: '2026-09', categoryId: 'cat-food', amount: 400_000 }),
  rec<Budget>('bdg-transport', { month: '2026-09', categoryId: 'cat-transport', amount: 80_000 }),
  rec<Budget>('bdg-culture', { month: '2026-09', categoryId: 'cat-culture', amount: 30_000 }),
  rec<Budget>('bdg-shop', { month: '2026-09', categoryId: 'cat-shop', amount: 10_000 }),
  rec<Budget>('bdg-home', { month: '2026-09', categoryId: 'cat-home', amount: 550_000 }),
];

// ---------------------------------------------------------------------------
// 자동 분류 규칙
// ---------------------------------------------------------------------------

export const demoRules: Rule[] = [
  rec<Rule>('rule-starbucks', {
    name: '스타벅스 → 식비 > 카페',
    field: 'memo', op: 'contains', value: '스타벅스',
    categoryId: 'cat-food-cafe', priority: 10, enabled: true,
  }),
  rec<Rule>('rule-baemin', {
    name: '배달의민족 → 식비 > 배달',
    field: 'memo', op: 'contains', value: '배달의민족',
    categoryId: 'cat-food-delivery', addTags: ['배달'], priority: 20, enabled: true,
  }),
  rec<Rule>('rule-transit', {
    name: '교통카드 → 교통 > 대중교통',
    field: 'memo', op: 'contains', value: '교통카드',
    categoryId: 'cat-transport-transit', priority: 30, enabled: true,
  }),
];

// ---------------------------------------------------------------------------
// 반복 거래
// ---------------------------------------------------------------------------

export const demoRecurring: RecurringTransaction[] = [
  rec<RecurringTransaction>('rec-rent', {
    name: '월세',
    freq: 'monthly',
    dayOfMonth: 1,
    startDate: '2026-07-01',
    enabled: true,
    lastGeneratedDate: '2026-09-01',
    template: {
      type: 'expense', amount: 500_000,
      accountId: 'acc-shinhan', categoryId: 'cat-home-rent',
      memo: '월세', tags: ['고정지출'],
    },
  }),
  rec<RecurringTransaction>('rec-netflix', {
    name: '넷플릭스',
    freq: 'monthly',
    dayOfMonth: 10,
    startDate: '2026-07-10',
    enabled: true,
    lastGeneratedDate: '2026-09-10',
    template: {
      type: 'expense', amount: 13_500,
      accountId: 'acc-card', categoryId: 'cat-culture-sub',
      memo: '넷플릭스', tags: ['구독'],
    },
  }),
];

// ---------------------------------------------------------------------------
// 매매 기록
// ---------------------------------------------------------------------------

function trade(
  id: string,
  date: string,
  symbol: string,
  market: 'KRX' | 'US',
  currency: 'KRW' | 'USD',
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  fee: number,
  fxRateAtTrade?: number,
): Trade {
  return {
    id,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    date, accountId: 'acc-kiwoom', symbol, market, currency,
    side, quantity, price, fee, fxRateAtTrade,
  };
}

export const demoTrades: Trade[] = [
  // 삼성전자 — 분할 매수 후 일부 매도 (이동평균 검증용)
  trade('trd-1', '2026-07-10', '005930', 'KRX', 'KRW', 'buy', 10, 70_000, 1_000),
  trade('trd-4', '2026-08-05', '005930', 'KRX', 'KRW', 'buy', 5, 80_000, 600),
  trade('trd-6', '2026-09-08', '005930', 'KRX', 'KRW', 'sell', 6, 85_000, 900),

  // 카카오 — 물타기 (평단이 내려간다)
  trade('trd-2', '2026-07-15', '035720', 'KRX', 'KRW', 'buy', 20, 45_000, 1_000),
  trade('trd-5', '2026-09-02', '035720', 'KRX', 'KRW', 'buy', 10, 42_000, 500),

  // 애플 — 달러 매매 (소수점 · 환율 검증용)
  trade('trd-3', '2026-07-22', 'AAPL', 'US', 'USD', 'buy', 3, 180, 0.5, 1_320),
  trade('trd-7', '2026-09-15', 'AAPL', 'US', 'USD', 'buy', 2, 195, 0.5, 1_340),
];

/**
 * 보유 종목.
 * quantity / avgCost 는 위 매매로부터 계산된 값이며,
 * 테스트가 recomputeHolding() 결과와 이 값이 같은지 확인한다.
 */
export const demoHoldings: Holding[] = [
  rec<Holding>('hld-005930', {
    accountId: 'acc-kiwoom', symbol: '005930', name: '삼성전자',
    market: 'KRX', currency: 'KRW', quantity: 9, avgCost: 73_440,
  }),
  rec<Holding>('hld-035720', {
    accountId: 'acc-kiwoom', symbol: '035720', name: '카카오',
    market: 'KRX', currency: 'KRW', quantity: 30, avgCost: 44_050,
  }),
  rec<Holding>('hld-AAPL', {
    accountId: 'acc-kiwoom', symbol: 'AAPL', name: '애플',
    market: 'US', currency: 'USD', quantity: 5, avgCost: 186.2,
  }),
];

// ---------------------------------------------------------------------------
// 시세 · 환율 (2026-09-20 종가 기준)
// ---------------------------------------------------------------------------

export const demoQuotes: PriceQuote[] = [
  rec<PriceQuote>('qt-005930', {
    symbol: '005930', market: 'KRX', price: 86_000, currency: 'KRW',
    asOf: DEMO_QUOTE_AS_OF, source: 'manual',
  }),
  rec<PriceQuote>('qt-035720', {
    symbol: '035720', market: 'KRX', price: 43_500, currency: 'KRW',
    asOf: DEMO_QUOTE_AS_OF, source: 'manual',
  }),
  rec<PriceQuote>('qt-AAPL', {
    symbol: 'AAPL', market: 'US', price: 200, currency: 'USD',
    asOf: DEMO_QUOTE_AS_OF, source: 'manual',
  }),
];

export const demoFxRate: FxRate = rec<FxRate>('fx-usdkrw', {
  base: 'USD', quote: 'KRW', rate: 1_350,
  asOf: DEMO_QUOTE_AS_OF, source: 'manual',
});

export const DEMO_FX_RATE = demoFxRate.rate;

/** 계산 함수에 넘길 장부 묶음 */
export const demoLedger = {
  transactions: demoTransactions,
  settlements: demoSettlements,
};

export const demoDataset = {
  accounts: demoAccounts,
  categories: demoCategories,
  transactions: demoTransactions,
  settlements: demoSettlements,
  budgets: demoBudgets,
  rules: demoRules,
  recurring: demoRecurring,
  holdings: demoHoldings,
  trades: demoTrades,
  quotes: demoQuotes,
  fxRates: [demoFxRate],
  snapshots: [],
};
