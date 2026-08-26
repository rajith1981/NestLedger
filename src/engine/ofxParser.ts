/**
 * SPEC 12 — OFX / QFX Parser
 * 
 * Maps OFX negative amounts directly to positive charges (cents = -parsedCents).
 */

import { Statement, Transaction, TransactionType } from '../types/statement';
import { parseAmountToCents } from './money';
import { formatDateISO } from './dateParser';
import { normalizeMerchant } from './merchantNormalizer';
import { detectFeeType } from './csvParser';

function parseOfxDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) {
    return new Date().toISOString().split('T')[0];
  }
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10);
  const day = parseInt(dateStr.slice(6, 8), 10);
  return formatDateISO(year, month, day);
}

function extractTagValue(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}>([^<\r\n]+)`, 'i'));
  return match ? match[1].trim() : null;
}

export function parseOfxStatement(
  ofxText: string,
  fileName: string,
  sourceHash: string
): {
  statement: Omit<Statement, 'id' | 'accountId'>;
  transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Match all <STMTTRN>...</STMTTRN> or unclosed <STMTTRN>
  const trnBlocks = ofxText.split(/<STMTTRN>/i).slice(1);

  if (trnBlocks.length === 0) {
    throw new Error('No transaction records found in the OFX/QFX file.');
  }

  const transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>> = [];
  const dates: string[] = [];

  let totalPurchases = 0;
  let totalPayments = 0;
  let totalFees = 0;
  let totalInterest = 0;

  for (const block of trnBlocks) {
    const rawAmt = extractTagValue(block, 'TRNAMT') || '0';
    const parsedCents = parseAmountToCents(rawAmt);
    // SPEC 12: Invert OFX sign (negative charge -> positive cents, positive payment -> negative cents)
    const finalCents = -parsedCents;

    const rawDate = extractTagValue(block, 'DTPOSTED') || extractTagValue(block, 'DTUSER') || '';
    const isoDate = parseOfxDate(rawDate);
    dates.push(isoDate);

    const name = extractTagValue(block, 'NAME') || '';
    const memo = extractTagValue(block, 'MEMO') || '';
    const rawDesc = memo ? `${name} ${memo}` : name || 'Transaction';

    const { feeType, isAvoidable } = detectFeeType(rawDesc);
    let txType: TransactionType = 'DEBIT';

    if (feeType) {
      if (feeType.startsWith('INTEREST')) {
        txType = 'INTEREST';
        totalInterest += Math.abs(finalCents);
      } else {
        txType = 'FEE';
        totalFees += Math.abs(finalCents);
      }
    } else if (finalCents < 0) {
      txType = 'PAYMENT';
      totalPayments += Math.abs(finalCents);
    } else {
      txType = 'DEBIT';
      totalPurchases += finalCents;
    }

    transactions.push({
      date: isoDate,
      rawDescription: rawDesc,
      normalizedMerchant: normalizeMerchant(name || memo || rawDesc),
      categoryId: finalCents < 0 || txType === 'PAYMENT' ? 'cat_payments' : 'cat_general',
      amountCents: finalCents,
      type: txType,
      feeType,
      isAvoidable
    });
  }

  dates.sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  // Check for ledger balance tag
  const ledgerBalStr = extractTagValue(ofxText, 'BALAMT');
  const hasNewBalance = ledgerBalStr !== null;
  const newBalance = hasNewBalance ? parseAmountToCents(ledgerBalStr) : (totalPurchases + totalFees + totalInterest - totalPayments);

  const statement: Omit<Statement, 'id' | 'accountId'> = {
    periodStart,
    periodEnd,
    previousBalance: 0,
    payments: totalPayments,
    purchases: totalPurchases,
    fees: totalFees,
    interest: totalInterest,
    newBalance,
    hasNewBalance,
    minPayment: Math.max(3500, Math.round(Math.max(0, newBalance) * 0.01)),
    sourceHash,
    fileName,
    fileType: 'OFX',
    parsedAt: new Date().toISOString(),
    isReconciled: true,
    discrepancy: 0
  };

  return {
    statement,
    transactions,
    warnings
  };
}
