export type TransactionType = 'DEBIT' | 'CREDIT' | 'PAYMENT' | 'FEE' | 'INTEREST';

export type FeeType =
  | 'FEE_LATE_PAYMENT'
  | 'FEE_ANNUAL'
  | 'FEE_FOREIGN_TX'
  | 'FEE_OVERLIMIT'
  | 'FEE_RETURNED_PAYMENT'
  | 'FEE_CASH_ADVANCE'
  | 'FEE_OTHER'
  | 'INTEREST_PURCHASE'
  | 'INTEREST_CASH'
  | 'INTEREST_OTHER';

export interface Account {
  id: string;
  name: string;
  issuer: string;
  last4?: string;
  aprPurchase?: number; // e.g., 24.99
  aprCash?: number;
  color?: string;
  createdAt: string;
}

export interface Statement {
  id: string;
  accountId: string;
  periodStart?: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD (latest statement sorting)
  previousBalance: number; // in integer cents
  payments: number; // positive magnitude in cents
  purchases: number; // positive magnitude in cents
  fees: number; // positive magnitude in cents
  interest: number; // positive magnitude in cents
  newBalance: number; // integer cents
  hasNewBalance: boolean;
  minPayment?: number; // integer cents
  paymentDueDate?: string;
  sourceHash: string; // SHA-256
  fileName: string;
  fileType: 'CSV' | 'PDF' | 'OFX' | 'QFX' | 'MANUAL';
  cardName?: string;
  issuer?: string;
  accountLast4?: string;
  parsedAt: string;
  isReconciled: boolean;
  discrepancy: number; // in integer cents
}

export interface Transaction {
  id: string;
  statementId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  postDate?: string; // YYYY-MM-DD
  rawDescription: string;
  normalizedMerchant: string;
  categoryId: string;
  amountCents: number; // Positive = charge/debit, Negative = payment/credit
  type: TransactionType;
  feeType?: FeeType | null;
  isAvoidable?: boolean;
  isManual?: boolean;
  accountType?: 'CREDIT' | 'CHECKING' | 'MANUAL';
  isRecurringBill?: boolean;
  isUserCategorized?: boolean;
  notes?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isCustom?: boolean;
  budgetMonthlyCents?: number;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  pattern: string;
  isRegex: boolean;
  priority: number;
}

export type CadenceType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type SubscriptionStatus = 'ACTIVE' | 'LAPSED' | 'SUSPECTED';

export interface Subscription {
  id: string;
  normalizedMerchant: string;
  amountCents: number;
  cadence: CadenceType;
  status: SubscriptionStatus;
  lastSeenDate: string;
  previousAmountCents?: number;
  priceIncreaseCents?: number;
  annualizedIncreaseCents?: number;
  transactionCount: number;
  transactionIds: string[];
}

export type GoalType = 'FEE_REDUCTION' | 'CATEGORY_SPEND_CAP' | 'TOTAL_SPEND_CAP' | 'DEBT_PAYOFF';

export interface Goal {
  id: string;
  type: GoalType;
  name: string;
  targetCents: number;
  categoryId?: string;
  active: boolean;
  createdAt: string;
}
