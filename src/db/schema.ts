import Dexie, { type EntityTable, type Transaction as DexieTransaction } from 'dexie';
import type {
  Account,
  Budget,
  Category,
  FxRate,
  Holding,
  NetWorthSnapshot,
  PriceQuote,
  RecurringTransaction,
  Rule,
  Settlement,
  Trade,
  Transaction,
} from '@/types';

/**
 * IndexedDB 스키마.
 *
 * ## 스키마를 바꿀 때 지킬 것
 * 아래 MIGRATIONS 배열에 **새 항목만 추가**한다. 기존 항목은 절대 고치지 않는다.
 * 이미 배포된 앱을 쓰는 기기에는 옛 버전 DB가 들어 있고,
 * Dexie 는 거기서부터 차례대로 올라오며 데이터를 옮긴다.
 * 기존 항목을 수정하면 그 경로가 끊겨서 사용자 데이터가 깨진다.
 *
 * stores 문법
 *   'id'        기본 키
 *   '&date'     유니크 인덱스
 *   '*tags'     배열 안의 값마다 인덱스 (태그 검색용)
 *   '[a+b]'     복합 인덱스
 *   나열하지 않은 필드도 저장은 된다. 인덱스가 없어 검색이 느릴 뿐이다.
 */

export const DB_NAME = 'finance-manager';

/** 백업 JSON 에도 이 번호가 들어간다 */
export const DB_SCHEMA_VERSION = 2;

interface Migration {
  version: number;
  stores: Record<string, string | null>;
  /** 인덱스만 바뀌는 게 아니라 데이터 모양이 바뀔 때 쓴다 */
  upgrade?: (tx: DexieTransaction) => Promise<void> | void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    stores: {
      accounts: 'id, kind, archived, order',
      categories: 'id, parentId, flow, archived, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, *tags, recurringId, importHash',
      settlements: 'id, date, payerAccountId, receiverAccountId, categoryId, receivedDate',
      budgets: 'id, month, categoryId, [month+categoryId]',
      rules: 'id, priority, enabled',
      recurring: 'id, enabled, startDate',
      holdings: 'id, accountId, symbol, [accountId+market+symbol]',
      trades: 'id, date, accountId, symbol, [accountId+market+symbol]',
      quotes: 'id, symbol, [market+symbol], asOf',
      fxRates: 'id, asOf',
      snapshots: 'id, &date',
      settings: 'key',
    },
  },

  {
    // CSV 가져오기 기능을 없애면서 importHash 를 걷어냈다.
    // 인덱스에서 빼고, 이미 저장된 레코드에 남아 있는 값도 지운다.
    version: 2,
    stores: {
      transactions: 'id, date, type, accountId, toAccountId, categoryId, *tags, recurringId',
    },
    upgrade: async (tx) => {
      await tx
        .table('transactions')
        .toCollection()
        .modify((record: Record<string, unknown>) => {
          delete record.importHash;
        });
    },
  },
];

/** 설정은 키-값으로 저장한다 (레코드 테이블과 모양이 다르다) */
export interface SettingRow {
  key: string;
  value: unknown;
}

export class FinanceDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  settlements!: EntityTable<Settlement, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  recurring!: EntityTable<RecurringTransaction, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  trades!: EntityTable<Trade, 'id'>;
  quotes!: EntityTable<PriceQuote, 'id'>;
  fxRates!: EntityTable<FxRate, 'id'>;
  snapshots!: EntityTable<NetWorthSnapshot, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);

    for (const migration of MIGRATIONS) {
      const version = this.version(migration.version).stores(migration.stores);
      if (migration.upgrade) version.upgrade(migration.upgrade);
    }
  }
}

export const db = new FinanceDB();

/** 백업·복원이 훑는 테이블 목록 (settings 는 따로 다룬다) */
export const DATA_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'settlements',
  'budgets',
  'rules',
  'recurring',
  'holdings',
  'trades',
  'quotes',
  'fxRates',
  'snapshots',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
