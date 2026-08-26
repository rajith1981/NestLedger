/**
 * SPEC 8 & SPEC 10 — PDF/Text Summary Block Extraction & Transaction Line Parsing
 * 
 * Extracts summary blocks, reconciles balances, strips post-dates, infers years,
 * and robustly parses multi-bank statements (Discover, Citi, Chase, Amex, Capital One, etc.).
 */

import { Statement, Transaction, TransactionType } from '../types/statement';
import { parseAmountToCents } from './money';
import { extractStatementPeriod, inferYearForTransaction, parseDateStrict, extractDateFromFileName } from './dateParser';
import { normalizeMerchant } from './merchantNormalizer';
import { detectFeeType } from './csvParser';
import { matchCategory } from '../db/repository';
import { DEFAULT_CATEGORY_RULES } from '../db/seedData';
import { reconcileStatementSummary } from './reconciliation';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface ExtractedSummary {
  previousBalance: number;
  payments: number;
  purchases: number;
  fees: number;
  interest: number;
  newBalance: number;
  hasNewBalance: boolean;
  minPayment?: number;
  paymentDueDate?: string;
  periodStart?: string;
  periodEnd: string;
  accountLast4?: string;
  cardName?: string;
}

// Check if description is an explicit payment transfer (e.g. ACH, AutoPay, Online payment)
export function isPaymentOrCreditDesc(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const upper = desc.toUpperCase().trim();

  // Exclude fees that mention payment (e.g. "LATE PAYMENT FEE", "RETURNED PAYMENT FEE")
  if (/\b(?:LATE FEE|RETURNED PAYMENT|OVERLIMIT|INTEREST CHARGE|FINANCE CHARGE|ANNUAL FEE)\b/i.test(upper)) {
    return false;
  }

  // Strong explicit payment markers
  const explicitPaymentRegexes = [
    /\b(?:AUTOMATIC PAYMENT|ONLINE PAYMENT|AUTOPAY|AUTO-PAY|AUTO PAYMENT|AUTO-PAYMENT|AUTOPAYMENT)\b/i,
    /\b(?:DIRECTPAY|DIRECT-PAY|DIRECT PAY|DIRECT DEBIT|ACH PAYMENT|ACH WITHDRAWAL|ACH DEPOSIT)\b/i,
    /\b(?:CITI AUTOPAY|CITICARDS AUTOPAY|CITI PAYMENT|AMEX EPAYMENT|AMEX PAYMENT|AMERICAN EXPRESS PAYMENT)\b/i,
    /\b(?:CHASE EPAY|CHASE PAYMENT|CAPITAL ONE PAYMENT|DISCOVER PAYMENT|DISCOVER EPAY)\b/i,
    /\b(?:STATEMENT CREDIT|ANNUAL FEE CREDIT|CASHBACK BONUS|CASHBACK BONUS REDEMPTION|CASHBACK BONUS CREDIT|CASHBACK CREDIT)\b/i,
    /\b(?:REWARDS REDEMPTION|REWARD REDEMPTION|MERCHANDISE CREDIT|PROMOTIONAL CREDIT|CREDIT ADJUSTMENT|ACCOUNT CREDIT)\b/i,
    /\b(?:REFUND \/ ADJUSTMENT|INTERNET PAYMENT|PAYMENTS AND CREDITS|PAYMENTS & CREDITS|PAYMENT\/CREDIT|PAYMENT APPLIED)\b/i,
    /\b(?:PMT THANK YOU|PMT RECEIVED|ONLINE PMT|PAYMENT - WEB|PAYMENT - MOBILE|CHECK PAYMENT|PAYMENT SENT|CREDIT - THANK YOU)\b/i,
    /\b(?:PAYMENT\s*[-–,]\s*THANK\s*YOU|PAYMENT\s+THANK\s*YOU|THANK\s*YOU\s+FOR\s+(?:YOUR\s+)?PAYMENT|PAYMENT\s+RECEIVED|RECEIVED\s+PAYMENT)\b/i,
    /^(?:ONLINE\s+)?PAYMENT,?\s*THANK\s*YOU$/i,
    /^THANK\s*YOU$/i
  ];

  for (const re of explicitPaymentRegexes) {
    if (re.test(upper)) {
      return true;
    }
  }

  // Exclude actual household/living expense phrases with strict word boundaries
  if (/\b(?:MORTGAGE|TUITION|KARATE|INSURANCE|UTILITY|UTILITIES|ELECTRIC|GAS BILL|WATER BILL|POWER BILL|INTERNET BILL|PHONE BILL|CAR PAYMENT|AUTO LOAN|LOAN PAYMENT)\b/i.test(upper)) {
    return false;
  }

  return false;
}

// Robust line-by-line summary value extractor
export function extractSummaryValue(fullText: string, labelPatterns: string[], excludeWords?: string[]): number | null {
  const lines = fullText.split(/\r?\n/);

  for (const label of labelPatterns) {
    const labelRegex = new RegExp(`\\b(?:${label})\\b`, 'i');

    for (const line of lines) {
      if (labelRegex.test(line)) {
        if (excludeWords && excludeWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(line))) {
          continue;
        }

        // Match currency tokens on the line
        const amountMatches = Array.from(
          line.matchAll(/(?:[+\-]?\s?\$?\s?[0-9,]+\.[0-9]{2}(?:\s?(?:CR|DR))?|\([+\-]?\s?\$?\s?[0-9,]+\.[0-9]{2}\))/gi)
        );

        if (amountMatches.length > 0) {
          // Take the LAST token on the line (which is the column value)
          const lastToken = amountMatches[amountMatches.length - 1][0];
          const cents = parseAmountToCents(lastToken);
          return cents;
        }
      }
    }
  }

  // Fallback regex over whole text
  for (const label of labelPatterns) {
    const regex = new RegExp(`\\b(?:${label})\\b[^$\\d\\-(]{0,40}(?:as\\s+of\\s+[^$]{0,25})?([+\\-]?\s?\\$?\\s?[0-9,]+\\.[0-9]{2}(?:\\s?CR)?)`, 'i');
    const match = fullText.match(regex);
    if (match && match[1]) {
      return parseAmountToCents(match[1]);
    }
  }

  return null;
}

/**
 * Extract summary figures from raw PDF statement text
 */
export function extractSummaryBlock(fullText: string, fileName?: string): ExtractedSummary {
  const periodInfo = extractStatementPeriod(fullText);
  const fallbackPeriodEnd = new Date().toISOString().split('T')[0];
  let periodEnd = periodInfo.periodEnd || fallbackPeriodEnd;
  let periodStart = periodInfo.periodStart;

  // If periodEnd is fallback, check if filename contains a valid date (e.g. Discover-AccountActivity-20260720.pdf)
  if (fileName) {
    const fileDate = extractDateFromFileName(fileName);
    if (fileDate && (!periodInfo.periodDetected || periodEnd === fallbackPeriodEnd)) {
      periodEnd = fileDate;
    }
  }

  // Previous Balance
  const prevBal = extractSummaryValue(fullText, [
    'previous balance',
    'prior balance',
    'beginning balance',
    'old balance',
    'previous statement balance'
  ]) ?? 0;

  // Payments and Credits
  const rawCombinedPayments = extractSummaryValue(fullText, [
    'total payments and other credits',
    'total payments and credits',
    'total payments & credits',
    'payments and other credits',
    'payments and credits',
    'payments & credits',
    'payments and other credits',
    'payments/credits',
    'payments and adjustments',
    'payments & other credits'
  ]);

  const rawPaymentsOnly = extractSummaryValue(
    fullText,
    [
      'total payments received',
      'payments received',
      'payments made',
      'total payments',
      'payments',
      'payment'
    ],
    ['credit', 'credits', 'other credits', 'due', 'date', 'warning', 'minimum']
  );

  const rawCreditsOnly = extractSummaryValue(
    fullText,
    [
      'other credits',
      'credits and adjustments',
      'credits & adjustments',
      'merchant credits',
      'total credits',
      'credits'
    ],
    ['payments and', 'payments &', 'payment and', 'payment &']
  );

  let payments = 0;
  // If statement has a combined "Payments and Credits" line, use that directly
  if (rawCombinedPayments !== null) {
    payments = Math.abs(rawCombinedPayments);
  } else if (rawPaymentsOnly !== null && rawCreditsOnly !== null) {
    payments = Math.abs(rawPaymentsOnly) + Math.abs(rawCreditsOnly);
  } else if (rawPaymentsOnly !== null || rawCreditsOnly !== null) {
    payments = Math.abs(rawPaymentsOnly ?? 0) + Math.abs(rawCreditsOnly ?? 0);
  }

  // Purchases & Charges
  const rawPurchases = extractSummaryValue(fullText, [
    'purchases and other charges',
    'purchases and adjustments',
    'new charges',
    'total purchases',
    'purchases'
  ]) ?? 0;
  let purchases = Math.abs(rawPurchases);

  // Cash advances
  const rawCashAdvances = extractSummaryValue(fullText, [
    'cash advances',
    'cash advance'
  ]) ?? 0;
  purchases += Math.abs(rawCashAdvances);

  // Fees
  const rawFees = extractSummaryValue(fullText, [
    'fees charged',
    'total fees',
    'fees and interest charges',
    'fees'
  ]) ?? 0;
  const fees = Math.abs(rawFees);

  // Interest
  const rawInterest = extractSummaryValue(fullText, [
    'interest charged',
    'finance charges?',
    'total interest',
    'interest'
  ]) ?? 0;
  const interest = Math.abs(rawInterest);

  // New Balance
  const rawNewBal = extractSummaryValue(fullText, [
    'new balance',
    'current balance',
    'ending balance',
    'total balance',
    'account balance'
  ]);
  const hasNewBalance = rawNewBal !== null;
  const newBalance = rawNewBal !== null ? Math.abs(rawNewBal) : (prevBal - payments + purchases + fees + interest);

  // Minimum Payment Due
  const rawMin = extractSummaryValue(fullText, [
    'minimum payment due',
    'minimum payment',
    'minimum due',
    'min payment'
  ]);
  const minPayment = rawMin !== null ? Math.abs(rawMin) : Math.max(3500, Math.round(Math.max(0, newBalance) * 0.01));

  // Payment Due Date
  const dueDateMatch = fullText.match(/(?:payment\s+due\s+date|due\s+date)[^0-9A-Za-z]{0,10}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  const paymentDueDate = dueDateMatch ? parseDateStrict(dueDateMatch[1]) || undefined : undefined;

  // Extract account last 4 digits
  let accountLast4: string | undefined = undefined;
  const last4Match = fullText.match(/(?:account\s+(?:number\s+)?ending\s+in[:\s]*|account\s*#?[:\s]*\*+|\.\.\.|ending\s+in\s+)(\d{4})/i);
  if (last4Match) {
    accountLast4 = last4Match[1];
  } else if (fileName) {
    const fileLast4 = fileName.match(/(?:[-_]|\b)(\d{4})(?:\.pdf|\.csv|$)/i);
    if (fileLast4) {
      accountLast4 = fileLast4[1];
    }
  }

  // Extract card / product name
  let cardName: string | undefined = undefined;
  if (/Discover/i.test(fullText) || (fileName && /Discover/i.test(fileName))) cardName = 'Discover Card';
  else if (/Citi Simplicity|Simplicity/i.test(fullText) || (fileName && /Simplicity/i.test(fileName))) cardName = 'Citi Simplicity';
  else if (/Citi Strata|Strata/i.test(fullText) || (fileName && /Strata/i.test(fileName))) cardName = 'Citi Strata';
  else if (/Costco/i.test(fullText) || (fileName && /Costco/i.test(fileName))) cardName = 'Citi Costco Anywhere';
  else if (/Sapphire/i.test(fullText) || (fileName && /Sapphire/i.test(fileName))) cardName = 'Chase Sapphire Preferred';
  else if (/Freedom/i.test(fullText) || (fileName && /Freedom/i.test(fileName))) cardName = 'Chase Freedom';
  else if (/Platinum Card/i.test(fullText)) cardName = 'Amex Platinum Card';
  else if (/Gold Card/i.test(fullText)) cardName = 'Amex Gold Card';
  else if (/American Express|Amex/i.test(fullText) || (fileName && /Amex/i.test(fileName))) cardName = 'American Express';
  else if (/Capital One|Venture|Quicksilver/i.test(fullText)) cardName = 'Capital One';

  return {
    previousBalance: Math.abs(prevBal),
    payments,
    purchases,
    fees,
    interest,
    newBalance,
    hasNewBalance,
    minPayment,
    paymentDueDate,
    periodStart,
    periodEnd,
    accountLast4,
    cardName
  };
}

/**
 * SPEC 10 — Transaction Line Parsing & Post-Date Stripping
 * Robustly parses line items across Discover, Citi, Chase, Amex, Capital One, etc.
 */
export function parseTransactionLine(
  line: string,
  periodEndISO: string,
  periodStartISO?: string
): {
  date: string;
  postDate?: string;
  rawDescription: string;
  amountCents: number;
} | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 5) return null;

  // 1. Match leading date token (MM/DD/YYYY, MM/DD/YY, MM/DD, Month DD, Month DD, YYYY)
  const leadingDateRegex = /^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s+\d{2,4})?)\s+/i;
  const match1 = trimmed.match(leadingDateRegex);
  if (!match1) return null;

  const dateToken1 = match1[1];
  let remainder = trimmed.slice(match1[0].length).trim();

  // 2. Check if next token is a post-date
  let postDateISO: string | undefined = undefined;
  const postDateRegex = /^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s+\d{2,4})?)\s+/i;
  const match2 = remainder.match(postDateRegex);

  if (match2) {
    const dateToken2 = match2[1];
    postDateISO = parseDateStrict(dateToken2) || inferYearForTransaction(dateToken2, periodEndISO, periodStartISO) || undefined;
    remainder = remainder.slice(match2[0].length).trim();
  }

  // 3. Optional: Strip leading bank reference / transaction sequence IDs (e.g. 10-25 digits)
  const refMatch = remainder.match(/^(\d{9,25})\s+/);
  if (refMatch) {
    remainder = remainder.slice(refMatch[0].length).trim();
  }

  // 4. Find amount token
  // Pattern A: Amount is at the very end of the line (allowing leading minus/paren or trailing CR/DR/-)
  const trailingAmountRegex = /((?:-\s*|\(\s*)?\$?\s?[0-9,]+\.[0-9]{2}(?:\s?(?:CR|DR|-|\)))?)\s*$/i;
  let amountMatch = remainder.match(trailingAmountRegex);
  let rawAmountStr = '';
  let rawDesc = '';

  if (amountMatch) {
    rawAmountStr = amountMatch[1];
    rawDesc = remainder.slice(0, remainder.length - amountMatch[0].length).trim();
  } else {
    // Pattern B: Amount is followed by a Category column at the end of line (common on Discover statements)
    // e.g. "WALMART GROCERY $54.20 Groceries", "SHELL OIL $35.00 Gasoline", "DIRECTPAY -$1,200.00 Payments and Credits"
    const midAmountRegex = /((?:-\s*|\(\s*)?\$?\s?[0-9,]+\.[0-9]{2}(?:\s?(?:CR|DR|-|\)))?)\s+([A-Za-z0-9 &/\-_',.]{2,40})\s*$/i;
    const midMatch = remainder.match(midAmountRegex);
    if (midMatch) {
      rawAmountStr = midMatch[1];
      rawDesc = remainder.slice(0, remainder.length - midMatch[0].length).trim();
    }
  }

  if (!rawAmountStr || !rawDesc) {
    return null;
  }

  let amountCents = parseAmountToCents(rawAmountStr);

  // Check if description has a trailing minus/hyphen (e.g., "SHAPERMINT 7025579792 NV -")
  if (rawDesc.endsWith('-') || rawDesc.endsWith('–') || rawDesc.endsWith('—')) {
    amountCents = -Math.abs(amountCents);
    rawDesc = rawDesc.replace(/\s*[-–—]\s*$/, '').trim();
  }

  if (!rawDesc || rawDesc.length === 0) {
    return null;
  }

  let txDateISO = parseDateStrict(dateToken1);
  if (!txDateISO) {
    txDateISO = inferYearForTransaction(dateToken1, periodEndISO, periodStartISO);
  }

  if (!txDateISO) {
    return null;
  }

  // If description indicates explicit payment, normalize sign to negative
  if (isPaymentOrCreditDesc(rawDesc)) {
    amountCents = -Math.abs(amountCents);
  }

  return {
    date: txDateISO,
    postDate: postDateISO,
    rawDescription: rawDesc,
    amountCents
  };
}

/**
 * Parse full text into structured statement and transactions
 */
export function parseTextStatement(
  rawText: string,
  fileName: string,
  sourceHash: string
): {
  statement: Omit<Statement, 'id' | 'accountId'>;
  transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>;
  warnings: string[];
} {
  const summary = extractSummaryBlock(rawText, fileName);
  const lines = rawText.split(/\r?\n/);
  const warnings: string[] = [];

  const rawTxList: Array<{
    date: string;
    postDate?: string;
    rawDescription: string;
    amountCents: number;
    sectionHint?: 'PAYMENTS' | 'PURCHASES' | 'FEES' | 'INTEREST';
  }> = [];

  let currentSection: 'PAYMENTS' | 'PURCHASES' | 'FEES' | 'INTEREST' | 'DEFAULT' = 'DEFAULT';

  for (const line of lines) {
    const parsed = parseTransactionLine(line, summary.periodEnd, summary.periodStart);
    if (parsed) {
      let finalAmt = parsed.amountCents;

      // In payments section or if description indicates payment, enforce negative sign
      if (currentSection === 'PAYMENTS' || isPaymentOrCreditDesc(parsed.rawDescription) || finalAmt < 0) {
        finalAmt = -Math.abs(finalAmt);
      }

      rawTxList.push({
        ...parsed,
        amountCents: finalAmt,
        sectionHint: currentSection !== 'DEFAULT' ? currentSection : (isPaymentOrCreditDesc(parsed.rawDescription) ? 'PAYMENTS' : undefined)
      });
      continue;
    }

    const lower = line.trim().toLowerCase();

    // Section header detection on non-transaction lines
    if (
      lower.includes('payments, credits and adjustments') ||
      lower.includes('payments and other credits') ||
      lower.includes('payments and credits') ||
      lower.includes('payments & credits') ||
      lower.includes('payments & other credits') ||
      lower.includes('payments and adjustments') ||
      lower.includes('total payments and credits') ||
      lower.startsWith('payments, credits') ||
      lower.startsWith('payments & credits') ||
      lower === 'payments and credits' ||
      lower === 'payments & credits' ||
      lower === 'payments' ||
      lower === 'credits'
    ) {
      currentSection = 'PAYMENTS';
      continue;
    } else if (
      lower.includes('standard purchases') ||
      lower.includes('purchases and adjustments') ||
      lower.includes('purchases and other charges') ||
      lower.includes('purchases') ||
      lower.includes('transactions')
    ) {
      currentSection = 'PURCHASES';
      continue;
    } else if (lower.includes('fees charged') || lower === 'fees') {
      currentSection = 'FEES';
      continue;
    } else if (lower.includes('interest charged') || lower === 'interest') {
      currentSection = 'INTEREST';
      continue;
    }
  }

  if (rawTxList.length === 0) {
    throw new Error(
      'Could not detect any transaction rows in this document. If this is a scanned or image-only PDF, please export a CSV or OFX statement from your bank.'
    );
  }

  // Normalize transactions
  const transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>> = [];
  let calculatedPurchases = 0;
  let calculatedPayments = 0;
  let calculatedFees = 0;
  let calculatedInterest = 0;

  for (const tx of rawTxList) {
    const { feeType, isAvoidable } = detectFeeType(tx.rawDescription);
    let txType: TransactionType = 'DEBIT';
    let finalCents = tx.amountCents;

    const isFee = feeType || tx.sectionHint === 'FEES' || tx.sectionHint === 'INTEREST';
    const isExplicitPayment = isPaymentOrCreditDesc(tx.rawDescription) || tx.sectionHint === 'PAYMENTS';
    const isNegativeCredit = tx.amountCents < 0;

    if (isFee) {
      if ((feeType && feeType.startsWith('INTEREST')) || tx.sectionHint === 'INTEREST') {
        txType = 'INTEREST';
        calculatedInterest += Math.abs(finalCents);
      } else {
        txType = 'FEE';
        calculatedFees += Math.abs(finalCents);
      }
    } else if (isExplicitPayment || isNegativeCredit) {
      // Payment transfer or merchant return / refund
      txType = 'PAYMENT';
      finalCents = -Math.abs(finalCents);
      calculatedPayments += Math.abs(finalCents);
    } else {
      // Standard positive purchase
      txType = 'DEBIT';
      finalCents = Math.abs(finalCents);
      calculatedPurchases += finalCents;
    }

    // Merchant Name:
    let merchantName = normalizeMerchant(tx.rawDescription);
    if (isPaymentOrCreditDesc(tx.rawDescription)) {
      merchantName = tx.rawDescription.toLowerCase().includes('autopay') ? 'Automatic Payment' : 'Online Payment';
    }

    // Assign Category:
    let assignedCategory = matchCategory(tx.rawDescription, DEFAULT_CATEGORY_RULES, finalCents);
    if (isExplicitPayment || isNegativeCredit || finalCents < 0 || txType === 'PAYMENT') {
      assignedCategory = 'cat_payments';
    }

    transactions.push({
      date: tx.date,
      postDate: tx.postDate,
      rawDescription: tx.rawDescription,
      normalizedMerchant: merchantName,
      categoryId: assignedCategory,
      amountCents: finalCents,
      feeType: feeType || undefined,
      isAvoidable: isAvoidable || undefined,
      type: txType
    });
  }

  // Reconcile and cross-verify with summary block figures
  const finalPurchases = summary.purchases > 0 ? summary.purchases : calculatedPurchases;
  const finalPayments = summary.payments > 0 ? summary.payments : calculatedPayments;
  const finalFees = summary.fees > 0 ? summary.fees : calculatedFees;
  const finalInterest = summary.interest > 0 ? summary.interest : calculatedInterest;
  const finalPrevBal = summary.previousBalance;

  const reconciliation = reconcileStatementSummary({
    previousBalance: finalPrevBal,
    payments: finalPayments,
    purchases: finalPurchases,
    fees: finalFees,
    interest: finalInterest,
    newBalance: summary.newBalance,
    hasNewBalance: summary.hasNewBalance
  });

  const statement: Omit<Statement, 'id' | 'accountId'> = {
    periodStart: summary.periodStart || transactions[0]?.date,
    periodEnd: summary.periodEnd,
    previousBalance: finalPrevBal,
    payments: finalPayments,
    purchases: finalPurchases,
    fees: finalFees,
    interest: finalInterest,
    newBalance: summary.hasNewBalance ? summary.newBalance : reconciliation.calculatedNewBalance,
    hasNewBalance: summary.hasNewBalance,
    minPayment: summary.minPayment,
    paymentDueDate: summary.paymentDueDate,
    accountLast4: summary.accountLast4,
    cardName: summary.cardName,
    sourceHash,
    fileName,
    fileType: 'PDF',
    parsedAt: new Date().toISOString(),
    isReconciled: reconciliation.isReconciled,
    discrepancy: reconciliation.discrepancy
  };

  return {
    statement,
    transactions,
    warnings
  };
}

/**
 * Extract raw text from PDF ArrayBuffer using pdfjs-dist
 * Groups text items into lines using a 3.0pt vertical baseline clustering tolerance.
 */
export async function extractTextFromPdf(pdfBuffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const fullTextLines: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by Y coordinate with a 3.0pt vertical tolerance
    const lineBuckets: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const y = item.transform[5];
        const x = item.transform[4];

        let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 3.0);
        if (!bucket) {
          bucket = { y, items: [] };
          lineBuckets.push(bucket);
        }
        bucket.items.push({ x, text: item.str });
      }
    }

    // Sort lines top-to-bottom (highest y to lowest y)
    lineBuckets.sort((a, b) => b.y - a.y);

    for (const bucket of lineBuckets) {
      // Sort items left-to-right (lowest x to highest x)
      bucket.items.sort((a, b) => a.x - b.x);
      const lineStr = bucket.items.map(it => it.text.trim()).filter(Boolean).join(' ');
      if (lineStr.length > 0) {
        fullTextLines.push(lineStr);
      }
    }
  }

  return fullTextLines.join('\n');
}
