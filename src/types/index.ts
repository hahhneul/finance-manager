/**
 * 앱 전체 데이터 모델.
 *
 * 값 표현 규칙 (여기서 어긋나면 나중에 전부 틀어진다)
 *  - 원화(Krw)는 **정수**로만 저장한다. 중간 계산에서 절대 반올림하지 않는다.
 *  - 달러 가격·환율·주식 수량(Dec)은 소수를 그대로 저장한다.
 *  - 원화 환산 반올림은 계산 마지막 단계에서 core/money.ts 의 toKrw() 로 한 번만 한다.
 *  - 달력 날짜(ISODate)는 'YYYY-MM-DD' 문자열이다. Date 객체를 저장하지 않는다.
 *    (기기 타임존이 바뀌어도 6월 1일 거래가 5월 31일로 보이는 일이 없게 한다)
 *  - 기록 시각(Timestamp)은 ISO 8601 UTC 문자열이다.
 */

/** UUID */
export type ID = string;

/** 'YYYY-MM-DD' — Asia/Seoul 기준 달력 날짜 */
export type ISODate = string;

/** 'YYYY-MM' — 월 */
export type YearMonth = string;

/** ISO 8601 UTC 문자열 — 기록 시각 */
export type Timestamp = string;

/** 원화. 항상 정수(원 단위) */
export type Krw = number;

/** 소수를 허용하는 값 — 달러 가격, 환율, 주식 수량 */
export type Dec = number;

/** 모든 레코드가 공통으로 갖는 필드 */
export interface Entity {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 새로 만들 때 넘기는 형태 — id/시각은 저장소가 붙인다 */
export type NewRecord<T extends Entity> = Omit<T, keyof Entity> & Partial<Entity>;

// ---------------------------------------------------------------------------
// 계좌
// ---------------------------------------------------------------------------

export type AccountKind =
  | 'cash' // 현금
  | 'bank' // 은행계좌
  | 'debit' // 체크카드
  | 'credit' // 신용카드
  | 'brokerage'; // 증권계좌

export interface Account extends Entity {
  name: string;
  kind: AccountKind;
  /** 앱을 쓰기 시작한 시점의 잔액 */
  initialBalance: Krw;
  /**
   * 부채 계좌인가 (신용카드). 잔액 계산식은 모든 계좌가 동일하고,
   * 이 플래그는 **표시 방법만** 바꾼다.
   * 신용카드는 잔액이 -717,000 으로 계산되고, 화면에는 "갚을 돈 717,000원"으로 보여준다.
   */
  isLiability: boolean;
  /** 화면 표시용 색 (Tailwind 클래스가 아니라 hex) */
  color?: string;
  archived: boolean;
  order: number;
}

// ---------------------------------------------------------------------------
// 카테고리 (대분류 > 소분류 2단계)
// ---------------------------------------------------------------------------

export type FlowKind = 'income' | 'expense';

export interface Category extends Entity {
  name: string;
  /** null 이면 대분류, 값이 있으면 그 대분류의 소분류 */
  parentId: ID | null;
  flow: FlowKind;
  color?: string;
  /** lucide 아이콘 이름 */
  icon?: string;
  archived: boolean;
  order: number;
}

// ---------------------------------------------------------------------------
// 거래
// ---------------------------------------------------------------------------

export type TxType = 'income' | 'expense' | 'transfer';

export interface Transaction extends Entity {
  date: ISODate;
  type: TxType;
  /** 항상 양수. 부호는 type 이 결정한다 */
  amount: Krw;
  /** 지출·이체는 나가는 계좌, 수입은 들어오는 계좌 */
  accountId: ID;
  /** 이체 전용 — 들어가는 계좌 */
  toAccountId?: ID;
  /** 이체에는 카테고리가 없다 */
  categoryId?: ID;
  memo: string;
  tags: string[];
  /** 개인적인 이유로 통계에서 빼고 싶은 거래 */
  excludeFromStats?: boolean;
  /** 반복 거래에서 자동 생성된 경우 원본 id */
  recurringId?: ID;
}

// ---------------------------------------------------------------------------
// 정산 (N빵) — 거래와 별개의 독립 기능
// ---------------------------------------------------------------------------

/**
 * 여럿이 먹고 내가 카드로 전부 결제한 뒤, 각자에게 받는 상황.
 *
 *   결제한 계좌(payerAccount)   → 총액 전부 나간다
 *   정산 받는 계좌(receiverAccount) → 내 몫을 뺀 나머지가 들어온다
 *   지출 통계에는 내 몫(myShare)만 잡힌다
 *   들어온 정산금은 **수입이 아니다** (이체와 같은 취급)
 */
export interface Settlement extends Entity {
  date: ISODate;
  title: string;
  /** 결제 총액 */
  totalAmount: Krw;
  /** 본인 포함 인원 */
  headcount: number;
  /** 계산한 계좌 — 총액이 빠져나간다 */
  payerAccountId: ID;
  /** 정산 받는 계좌 — 돌려받은 금액이 들어온다 */
  receiverAccountId: ID;
  /** 지출 카테고리 (내 몫이 여기로 잡힌다) */
  categoryId?: ID;
  /** 내 실부담액. splitBill() 이 계산하지만 수동으로 고칠 수 있다 */
  myShare: Krw;
  /** 돌려받을 금액. myShare + reimbursedAmount === totalAmount 를 항상 유지한다 */
  reimbursedAmount: Krw;
  /** 실제로 돈이 들어온 날. 비어 있으면 "아직 못 받음"이고 잔액에 반영하지 않는다 */
  receivedDate?: ISODate;
  /**
   * 실제로 받은 금액. 일부만 받은 경우를 위해 둔다.
   * 비어 있고 receivedDate 가 있으면 전액(reimbursedAmount)을 받은 것으로 본다
   * — 이 필드가 없던 시절에 저장된 기록과 호환되게 하려는 것이다.
   */
  receivedAmount?: Krw;
  memo: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// 예산
// ---------------------------------------------------------------------------

export interface Budget extends Entity {
  /** 'YYYY-MM' */
  month: YearMonth;
  /** 대분류에 걸면 하위 소분류 지출까지 합산된다 */
  categoryId: ID;
  amount: Krw;
}

// ---------------------------------------------------------------------------
// 자동 분류 규칙
// ---------------------------------------------------------------------------

export type RuleField = 'memo' | 'tag';
export type RuleOp = 'contains' | 'equals' | 'startsWith';

export interface Rule extends Entity {
  name: string;
  field: RuleField;
  op: RuleOp;
  value: string;
  /** 매칭되면 지정할 카테고리 */
  categoryId: ID;
  /** 함께 붙일 태그 */
  addTags?: string[];
  /** 낮을수록 먼저 적용된다 */
  priority: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 반복 거래
// ---------------------------------------------------------------------------

export type RecurringFreq = 'weekly' | 'monthly' | 'yearly';

/** 반복 거래가 찍어낼 거래의 틀 (날짜는 반복 규칙이 정한다) */
export type TransactionTemplate = Omit<
  Transaction,
  keyof Entity | 'date' | 'recurringId'
>;

export interface RecurringTransaction extends Entity {
  name: string;
  freq: RecurringFreq;
  /** monthly 전용. 31 을 넣고 2월이면 말일로 보정한다 */
  dayOfMonth?: number;
  /** weekly 전용. 0=일요일 */
  weekday?: number;
  startDate: ISODate;
  endDate?: ISODate;
  template: TransactionTemplate;
  /** 어디까지 만들어 뒀는지 */
  lastGeneratedDate?: ISODate;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 투자
// ---------------------------------------------------------------------------

export type Market = 'KRX' | 'US';
export type Currency = 'KRW' | 'USD';

/**
 * 보유 종목.
 *
 * quantity / avgCost 는 Trade 들로부터 계산되는 **파생값**이다.
 * Trade 가 단일 진실 원천이고, 이 필드는 조회를 빠르게 하려고 저장해 두는 캐시다.
 * 매매 기록이 바뀌면 recomputeHolding() 으로 다시 계산해서 덮어쓴다.
 */
export interface Holding extends Entity {
  /** 증권계좌 */
  accountId: ID;
  /** '005930' | 'AAPL' */
  symbol: string;
  name: string;
  market: Market;
  currency: Currency;
  quantity: Dec;
  /** 통화 기준 평균 매입가. 매수 수수료가 포함된 취득원가 기준 */
  avgCost: Dec;
}

export type TradeSide = 'buy' | 'sell';

export interface Trade extends Entity {
  date: ISODate;
  accountId: ID;
  symbol: string;
  market: Market;
  currency: Currency;
  side: TradeSide;
  quantity: Dec;
  /** 체결가 (통화 기준) */
  price: Dec;
  /** 수수료 (통화 기준) */
  fee: Dec;
  /** 매도 시 세금 (국내 증권거래세 등) */
  tax?: Dec;
  /** 미국 주식 매매를 원화 계좌 잔액에 반영할 때 쓰는 체결 시점 환율 */
  fxRateAtTrade?: Dec;
  memo?: string;
}

export type QuoteSource = 'manual' | 'api';

export interface PriceQuote extends Entity {
  symbol: string;
  market: Market;
  price: Dec;
  currency: Currency;
  /** 이 가격의 기준 시각. 화면에 "기준: 9월 20일 종가"로 표시한다 */
  asOf: Timestamp;
  source: QuoteSource;
  /** api 인 경우 어느 provider 가 가져왔는지 */
  providerId?: string;
}

export interface FxRate extends Entity {
  base: 'USD';
  quote: 'KRW';
  rate: Dec;
  asOf: Timestamp;
  source: QuoteSource;
}

// ---------------------------------------------------------------------------
// 순자산 스냅샷
// ---------------------------------------------------------------------------

export interface NetWorthSnapshot extends Entity {
  /** 하루에 하나. 같은 날 다시 열면 덮어쓴다 */
  date: ISODate;
  /** 잔액이 양수인 계좌들의 합 */
  cashAssets: Krw;
  /** 잔액이 음수인 계좌들의 합 (신용카드 등). 양수로 저장한다 */
  liabilities: Krw;
  /** 주식 평가액의 원화 환산 합 */
  investmentAssets: Krw;
  /** cashAssets - liabilities + investmentAssets */
  netWorth: Krw;
}

// ---------------------------------------------------------------------------
// 설정 (키-값 저장)
// ---------------------------------------------------------------------------

export interface AppSettings {
  /** 어느 provider 로 시세를 가져올지 */
  priceProviderId: string;
  /** 시세 API 키. 코드에 하드코딩하지 않고 여기 로컬에만 둔다 */
  priceApiKey?: string;
  lastQuoteRefreshAt?: Timestamp;
  lastBackupAt?: Timestamp;
  /** 예산 월 시작일 (급여일 기준으로 쓰고 싶을 때). 기본 1 */
  monthStartDay: number;
  theme: 'light' | 'dark' | 'system';
  /** 데모 데이터를 넣어둔 상태인지 */
  demoSeeded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  priceProviderId: 'manual',
  monthStartDay: 1,
  theme: 'system',
  demoSeeded: false,
};

/**
 * 계산 함수들에 넘기는 장부 묶음.
 * 거래와 정산은 늘 함께 봐야 하므로 (정산도 지출을 만든다) 하나로 묶는다.
 */
export interface Ledger {
  transactions: Transaction[];
  settlements: Settlement[];
}

export const EMPTY_LEDGER: Ledger = { transactions: [], settlements: [] };
