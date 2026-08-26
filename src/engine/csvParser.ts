/**
 * SPEC 2 — CSV Issuer Sign Convention Detection (2-Pass Engine)
 * 
 * Accurately detects and normalizes Chase, Amex, Capital One, and other bank CSV conventions.
 */

import { FeeType, Statement, Transaction, TransactionType } from '../types/statement';
import { parseAmountToCents } from './money';
import { parseDateStrict } from './dateParser';
import { normalizeMerchant } from './merchantNormalizer';
import { isPaymentOrCreditDesc } from './pdfParser';

export const CREDIT_KEYWORDS = ['PAYMENT', 'CREDIT', 'REFUND', 'RETURN', 'REVERSAL', 'CASHBACK', 'REWARD'];
export const DEBIT_KEYWORDS = ['SALE', 'PURCHASE', 'DEBIT', 'CHARGE', 'ADJUSTMENT', 'FEE', 'INTEREST'];

interface TempRow {
  date: string;
  postDate?: string;
  rawDesc: string;
  cents: number;
  typeStr: string;
  debit: number;
  credit: number;
  rawLineIndex: number;
}

/**
 * Robust CSV line splitter handling quoted fields containing commas.
 */
export function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Determine fee classification from description and category/type strings.
 */
export function detectFeeType(desc: string, typeStr: string = ''): { feeType: FeeType | null; isAvoidable: boolean } {
  const text = `${desc} ${typeStr}`.toUpperCase();

  if (text.includes('LATE FEE') || text.includes('LATE PAYMENT FEE')) {
    return { feeType: 'FEE_LATE_PAYMENT', isAvoidable: true };
  }
  if (text.includes('ANNUAL MEMBERSHIP') || text.includes('ANNUAL FEE')) {
    return { feeType: 'FEE_ANNUAL', isAvoidable: false };
  }
  if (text.includes('FOREIGN TRANSACTION') || text.includes('FOREIGN TX') || text.includes('INTL TRANSACTION')) {
    return { feeType: 'FEE_FOREIGN_TX', isAvoidable: true };
  }
  if (text.includes('OVERLIMIT') || text.includes('OVER LIMIT')) {
    return { feeType: 'FEE_OVERLIMIT', isAvoidable: true };
  }
  if (text.includes('RETURNED PAYMENT') || text.includes('RETURNED CHECK')) {
    return { feeType: 'FEE_RETURNED_PAYMENT', isAvoidable: true };
  }
  if (text.includes('CASH ADVANCE FEE')) {
    return { feeType: 'FEE_CASH_ADVANCE', isAvoidable: true };
  }
  if (text.includes('PURCHASE INTEREST') || text.includes('INTEREST CHARGE') || text.includes('INTEREST CHARGED')) {
    return { feeType: 'INTEREST_PURCHASE', isAvoidable: true };
  }
  if (text.includes('CASH ADVANCE INTEREST')) {
    return { feeType: 'INTEREST_CASH', isAvoidable: true };
  }
  if (text.includes('INTEREST') || text.includes('FINANCE CHARGE')) {
    return { feeType: 'INTEREST_OTHER', isAvoidable: true };
  }
  if (text.includes('FEE') && !text.includes('COFFEE')) {
    return { feeType: 'FEE_OTHER', isAvoidable: true };
  }

  return { feeType: null, isAvoidable: false };
}

export function parseCsvStatement(
  csvText: string,
  fileName: string,
  sourceHash: string
): {
  statement: Omit<Statement, 'id' | 'accountId'>;
  transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>;
  detectedIssuer: string;
  warnings: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new Error('The provided CSV file is completely empty.');
  }

  const warnings: string[] = [];
  const rows0 = splitCsvRow(lines[0]);

  // Inspect row 0 for header indicators
  const row0Lower = rows0.map(s => s.toLowerCase());
  const isHeaderRow0 = row0Lower.some(h =>
    h.includes('date') || h.includes('amount') || h.includes('desc') || h.includes('debit') || h.includes('credit') || h.includes('type')
  );

  let headerIndices = {
    date: -1,
    postDate: -1,
    desc: -1,
    amount: -1,
    type: -1,
    debit: -1,
    credit: -1
  };

  let startIndex = 0;
  if (isHeaderRow0) {
    startIndex = 1;
    row0Lower.forEach((col, idx) => {
      if (col.includes('post') && col.includes('date')) {
        headerIndices.postDate = idx;
      } else if (col.includes('trans') && col.includes('date')) {
        headerIndices.date = idx;
      } else if (col.includes('date') && headerIndices.date === -1) {
        headerIndices.date = idx;
      } else if (col.includes('desc') || col.includes('payee') || col.includes('merchant') || col.includes('details')) {
        headerIndices.desc = idx;
      } else if (col.includes('debit')) {
        headerIndices.debit = idx;
      } else if (col.includes('credit')) {
        headerIndices.credit = idx;
      } else if (col.includes('amount')) {
        headerIndices.amount = idx;
      } else if (col.includes('type') || col.includes('category')) {
        headerIndices.type = idx;
      }
    });
  }

  // PASS 1: Parse all rows into temporary records
  const tempRows: TempRow[] = [];
  const hasSplitColumns = headerIndices.debit !== -1 && headerIndices.credit !== -1;

  for (let i = startIndex; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    if (cols.length < 2) continue;

    let dateVal = '';
    let postDateVal = '';
    let descVal = '';
    let typeVal = '';
    let rawAmount = 0;
    let debitCents = 0;
    let creditCents = 0;

    if (isHeaderRow0) {
      if (headerIndices.date !== -1) dateVal = cols[headerIndices.date] || '';
      if (headerIndices.postDate !== -1) postDateVal = cols[headerIndices.postDate] || '';
      if (headerIndices.desc !== -1) descVal = cols[headerIndices.desc] || '';
      if (headerIndices.type !== -1) typeVal = cols[headerIndices.type] || '';

      if (hasSplitColumns) {
        const dStr = cols[headerIndices.debit] || '';
        const cStr = cols[headerIndices.credit] || '';
        debitCents = parseAmountToCents(dStr);
        creditCents = parseAmountToCents(cStr);

        if (debitCents !== 0) {
          rawAmount = Math.abs(debitCents);
        } else if (creditCents !== 0) {
          rawAmount = -Math.abs(creditCents);
        }
      } else if (headerIndices.amount !== -1) {
        rawAmount = parseAmountToCents(cols[headerIndices.amount] || '');
      }
    } else {
      // No header: standard fallback heuristic (col 0: date or desc, etc.)
      const parsedDate0 = parseDateStrict(cols[0]);
      if (parsedDate0) {
        dateVal = cols[0];
        descVal = cols[1] || '';
        rawAmount = parseAmountToCents(cols[2] || '');
        if (cols.length >= 4) typeVal = cols[3] || '';
      } else {
        // e.g. Amex export format: Desc, Amount
        descVal = cols[0];
        rawAmount = parseAmountToCents(cols[1] || '');
        // default date to today or later inference
        dateVal = new Date().toISOString().split('T')[0];
      }
    }

    const isoDate = parseDateStrict(dateVal) || new Date().toISOString().split('T')[0];
    const isoPostDate = parseDateStrict(postDateVal) || undefined;

    tempRows.push({
      date: isoDate,
      postDate: isoPostDate,
      rawDesc: descVal,
      cents: rawAmount,
      typeStr: typeVal,
      debit: debitCents,
      credit: creditCents,
      rawLineIndex: i
    });
  }

  if (tempRows.length === 0) {
    throw new Error('No valid transaction rows found in CSV. Please verify column formatting.');
  }

  // BETWEEN PASSES: Resolve sign convention
  let useTypeColumn = false;
  let flipSigns = false;

  let recognizedTypeCount = 0;
  for (const row of tempRows) {
    const tUpper = row.typeStr.toUpperCase();
    if (CREDIT_KEYWORDS.some(k => tUpper.includes(k)) || DEBIT_KEYWORDS.some(k => tUpper.includes(k))) {
      recognizedTypeCount++;
    }
  }

  // Condition A: If >= 50% rows contain recognized Type keyword
  if (recognizedTypeCount >= tempRows.length * 0.5 && recognizedTypeCount > 0) {
    useTypeColumn = true;
  } else if (!hasSplitColumns) {
    // Condition B: Count positive vs negative rows
    let positiveCount = 0;
    let negativeCount = 0;
    for (const row of tempRows) {
      if (row.cents > 0) positiveCount++;
      if (row.cents < 0) negativeCount++;
    }
    // If negative rows > positive rows (Chase convention where purchases are negative), flip signs
    if (negativeCount > positiveCount) {
      flipSigns = true;
    }
  }

  // Detected Issuer Heuristic
  let detectedIssuer = 'Generic Bank';
  if (hasSplitColumns) detectedIssuer = 'Capital One / Split Format';
  else if (flipSigns) detectedIssuer = 'Chase (Purchases Negative)';
  else if (useTypeColumn) detectedIssuer = 'Type-Mapped Format';
  else detectedIssuer = 'Amex / Standard (Purchases Positive)';

  // PASS 2: Emit normalized transactions
  let totalPurchases = 0;
  let totalPayments = 0;
  let totalFees = 0;
  let totalInterest = 0;

  const dates: string[] = [];
  const normalizedTransactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>> = [];

  for (const row of tempRows) {
    let finalCents = row.cents;
    const tUpper = row.typeStr.toUpperCase();
    const isExplicitPayment = isPaymentOrCreditDesc(row.rawDesc) || CREDIT_KEYWORDS.some(k => tUpper.includes(k));

    if (hasSplitColumns) {
      finalCents = row.cents;
    } else if (useTypeColumn && CREDIT_KEYWORDS.some(k => tUpper.includes(k))) {
      finalCents = -Math.abs(row.cents);
    } else if (useTypeColumn && DEBIT_KEYWORDS.some(k => tUpper.includes(k))) {
      finalCents = Math.abs(row.cents);
    } else if (isExplicitPayment) {
      finalCents = -Math.abs(row.cents);
    } else if (flipSigns) {
      finalCents = -row.cents;
    } else {
      finalCents = row.cents;
    }

    const { feeType, isAvoidable } = detectFeeType(row.rawDesc, row.typeStr);

    let txType: TransactionType = 'DEBIT';
    if (feeType) {
      if (feeType.startsWith('INTEREST')) {
        txType = 'INTEREST';
        totalInterest += Math.abs(finalCents);
      } else {
        txType = 'FEE';
        totalFees += Math.abs(finalCents);
      }
    } else if (finalCents < 0 || isExplicitPayment) {
      txType = 'PAYMENT';
      finalCents = -Math.abs(finalCents);
      totalPayments += Math.abs(finalCents);
    } else {
      txType = 'DEBIT';
      totalPurchases += finalCents;
    }

    dates.push(row.date);

    normalizedTransactions.push({
      date: row.date,
      postDate: row.postDate,
      rawDescription: row.rawDesc,
      normalizedMerchant: normalizeMerchant(row.rawDesc),
      categoryId: finalCents < 0 || txType === 'PAYMENT' ? 'cat_payments' : 'cat_general',
      amountCents: finalCents,
      type: txType,
      feeType,
      isAvoidable
    });
  }

  // Sort dates
  dates.sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  // In CSVs without explicit summary blocks, previousBalance = 0 and newBalance is computed
  const newBalance = totalPurchases + totalFees + totalInterest - totalPayments;

  const statement: Omit<Statement, 'id' | 'accountId'> = {
    periodStart,
    periodEnd,
    previousBalance: 0,
    payments: totalPayments,
    purchases: totalPurchases,
    fees: totalFees,
    interest: totalInterest,
    newBalance,
    hasNewBalance: false,
    minPayment: Math.max(3500, Math.round(Math.max(0, newBalance) * 0.01)),
    sourceHash,
    fileName,
    fileType: 'CSV',
    parsedAt: new Date().toISOString(),
    isReconciled: true,
    discrepancy: 0
  };

  return {
    statement,
    transactions: normalizedTransactions,
    detectedIssuer,
    warnings
  };
}
