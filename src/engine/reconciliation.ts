/**
 * SPEC 8 — Statement Summary Reconciliation Engine & Semantic Duplicate Detection
 * 
 * Reconciles stated summary figures against row-level transactions and computes discrepancy.
 * Detects duplicate statements uploaded under different file names.
 */

import { Statement, Transaction } from '../types/statement';

export interface ReconciliationInput {
  previousBalance: number; // integer cents
  payments: number;        // positive magnitude in cents
  purchases: number;       // positive magnitude in cents
  fees: number;            // positive magnitude in cents
  interest: number;        // positive magnitude in cents
  newBalance: number;       // stated new balance in cents
  hasNewBalance: boolean;
}

export interface ReconciliationResult {
  isReconciled: boolean;
  discrepancy: number;     // in integer cents (0 means perfect match)
  calculatedNewBalance: number;
  statedNewBalance: number;
  confidenceScore: 'HIGH' | 'MEDIUM' | 'UNVERIFIED';
  details: string;
}

export function reconcileStatementSummary(summary: ReconciliationInput): ReconciliationResult {
  // If no stated new balance exists, set discrepancy = 0, isReconciled = true, UNVERIFIED confidence
  if (!summary.hasNewBalance) {
    const calcBal = summary.previousBalance - summary.payments + summary.purchases + summary.fees + summary.interest;
    return {
      isReconciled: true,
      discrepancy: 0,
      calculatedNewBalance: calcBal,
      statedNewBalance: calcBal,
      confidenceScore: 'UNVERIFIED',
      details: 'No stated summary block found. Balance computed directly from transactions.'
    };
  }

  // Exact formula: (previousBalance - payments + purchases + fees + interest) - newBalance
  const calculatedNewBalance =
    summary.previousBalance - summary.payments + summary.purchases + summary.fees + summary.interest;
  const discrepancy = calculatedNewBalance - summary.newBalance;

  const isReconciled = Math.abs(discrepancy) === 0;

  let confidenceScore: 'HIGH' | 'MEDIUM' | 'UNVERIFIED' = 'UNVERIFIED';
  let details = '';

  if (isReconciled) {
    confidenceScore = 'HIGH';
    details = 'Statement summary perfectly matches calculated transaction activity.';
  } else if (Math.abs(discrepancy) <= 100) {
    // minor rounding difference
    confidenceScore = 'MEDIUM';
    details = `Minor reconciliation discrepancy of $${(Math.abs(discrepancy) / 100).toFixed(2)}.`;
  } else {
    confidenceScore = 'UNVERIFIED';
    details = `Reconciliation discrepancy of $${(Math.abs(discrepancy) / 100).toFixed(2)}. Please verify statement line items.`;
  }

  return {
    isReconciled,
    discrepancy,
    calculatedNewBalance,
    statedNewBalance: summary.newBalance,
    confidenceScore,
    details
  };
}

/**
 * Robust semantic duplicate detector:
 * Identifies if an uploaded file contains the same statement data as an existing record,
 * even when the user renames the file or downloads it with a different file hash.
 */
export function isStatementDuplicate(
  existing: Statement,
  incoming: Omit<Statement, 'id' | 'accountId'>,
  incomingTxs?: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>
): boolean {
  // 1. Direct file binary hash match
  if (existing.sourceHash === incoming.sourceHash) {
    return true;
  }

  // 2. Billing cycle end date must match
  if (existing.periodEnd !== incoming.periodEnd) {
    return false;
  }

  // If both statements have known card account numbers that differ, they are distinct cards
  if (
    existing.accountLast4 &&
    incoming.accountLast4 &&
    existing.accountLast4 !== incoming.accountLast4
  ) {
    return false;
  }

  // 3. Exact match on statement ending balance (if > 0)
  if (existing.newBalance === incoming.newBalance && incoming.newBalance > 0) {
    return true;
  }

  // 4. Exact match on purchases & payments
  if (existing.purchases === incoming.purchases && existing.payments === incoming.payments) {
    return true;
  }

  // 5. Exact match on previous balance & purchases
  if (
    existing.previousBalance === incoming.previousBalance &&
    existing.purchases === incoming.purchases &&
    incoming.purchases > 0
  ) {
    return true;
  }

  return false;
}
