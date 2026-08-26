import { FeeType, Statement, Transaction, TransactionType } from './statement';

export interface RawParsedTransaction {
  date: string;
  postDate?: string;
  description: string;
  cents: number;
  type?: string;
  debit?: number;
  credit?: number;
  feeType?: FeeType | null;
  isAvoidable?: boolean;
}

export interface StatementSummaryBlock {
  previousBalance?: number;
  payments?: number;
  purchases?: number;
  fees?: number;
  interest?: number;
  newBalance?: number;
  hasNewBalance: boolean;
  minPayment?: number;
  paymentDueDate?: string;
  periodStart?: string;
  periodEnd?: string;
  accountNumberLast4?: string;
}

export interface ParseResult {
  statement: Omit<Statement, 'id' | 'accountId'>;
  transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>;
  detectedIssuer?: string;
  rawRowCount: number;
  skippedRowCount: number;
  warnings: string[];
}

export interface ImportSummary {
  statement: Statement;
  insertedTransactions: number;
  skippedDuplicates: number;
  warnings: string[];
}
