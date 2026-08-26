import { describe, it, expect } from 'vitest';
import { parseAmountToCents, formatCurrency } from '../engine/money';
import { parseCsvStatement } from '../engine/csvParser';
import { normalizeMerchant, extractMerchantSignature } from '../engine/merchantNormalizer';
import { parseDateStrict, inferYearForTransaction } from '../engine/dateParser';
import { parseTransactionLine, extractSummaryBlock, parseTextStatement } from '../engine/pdfParser';
import { reconcileStatementSummary, isStatementDuplicate } from '../engine/reconciliation';
import { simulateDebtPayoff } from '../engine/payoffSimulator';
import { detectSubscriptions, CADENCE_MULTIPLIERS, CADENCE_LABELS } from '../engine/subscriptionDetector';
import { matchCategory } from '../db/repository';
import { DEFAULT_CATEGORY_RULES } from '../db/seedData';

describe('SPEC 1: Money Parsing & Integer-Cent Arithmetic', () => {
  it('parses basic values accurately', () => {
    expect(parseAmountToCents('12.29')).toBe(1229);
    expect(parseAmountToCents('0.29')).toBe(29);
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
  });

  it('handles signs, parentheses, and CR/DR conventions', () => {
    expect(parseAmountToCents('-$45.10')).toBe(-4510);
    expect(parseAmountToCents('($45.10)')).toBe(-4510);
    expect(parseAmountToCents('45.10CR')).toBe(-4510);
    expect(parseAmountToCents('45.10DR')).toBe(4510);
    expect(parseAmountToCents('n/a')).toBe(0);
    expect(parseAmountToCents(null)).toBe(0);
    expect(parseAmountToCents('')).toBe(0);
  });

  it('roundtrips every value from 0.01 to 99.99 with exact precision', () => {
    for (let i = 1; i <= 9999; i++) {
      const dollars = (i / 100).toFixed(2);
      const parsed = parseAmountToCents(dollars);
      expect(parsed).toBe(i);
    }
  });

  it('formats currency with commas and 2 decimals', () => {
    expect(formatCurrency(348250)).toBe('$3,482.50');
    expect(formatCurrency(-4510)).toBe('-$45.10');
  });
});

describe('SPEC 2: CSV Issuer Sign Convention Detection (2-Pass)', () => {
  it('handles Chase CSV (Type column, negative purchases)', () => {
    const csv = `Transaction Date,Post Date,Description,Category,Type,Amount
08/01/2026,08/02/2026,TRADER JOE'S #542 AUSTIN TX,Groceries,Sale,-142.50
08/10/2026,08/10/2026,AUTOMATIC PAYMENT - THANK YOU,,Payment,2000.00
08/12/2026,08/12/2026,LATE FEE,Fees,Fee,-40.00`;

    const res = parseCsvStatement(csv, 'chase.csv', 'hash1');
    expect(res.transactions.length).toBe(3);
    
    // Purchase normalized to positive
    expect(res.transactions[0].amountCents).toBe(14250);
    expect(res.transactions[0].type).toBe('DEBIT');

    // Payment normalized to negative
    expect(res.transactions[1].amountCents).toBe(-200000);
    expect(res.transactions[1].type).toBe('PAYMENT');

    // Late fee detected as fee and avoidable
    expect(res.transactions[2].amountCents).toBe(4000);
    expect(res.transactions[2].type).toBe('FEE');
    expect(res.transactions[2].feeType).toBe('FEE_LATE_PAYMENT');
    expect(res.transactions[2].isAvoidable).toBe(true);
  });

  it('handles Amex CSV (No Type column, positive purchases, negative payments)', () => {
    const csv = `Date,Description,Amount
08/01/2026,SHELL OIL 4471 AUSTIN TX,52.10
08/10/2026,ONLINE PAYMENT - THANK YOU,-500.00`;

    const res = parseCsvStatement(csv, 'amex.csv', 'hash2');
    expect(res.transactions[0].amountCents).toBe(5210);
    expect(res.transactions[1].amountCents).toBe(-50000);
  });

  it('handles Capital One Split Columns (Debit / Credit)', () => {
    const csv = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
08/01/2026,08/02/2026,1234,TARGET T-0892 CHICAGO IL,Shopping,89.40,
08/10/2026,08/10/2026,1234,CAPITAL ONE AUTOPAY PYMT,Payment,,300.00`;

    const res = parseCsvStatement(csv, 'capone.csv', 'hash3');
    expect(res.transactions[0].amountCents).toBe(8940);
    expect(res.transactions[1].amountCents).toBe(-30000);
  });
});

describe('SPEC 4: Merchant Descriptor Normalization', () => {
  it('normalizes test descriptors accurately', () => {
    expect(normalizeMerchant('SPOTIFY USA')).toBe('Spotify');
    expect(normalizeMerchant('SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA')).toBe('Blue Bottle Coffee');
    expect(normalizeMerchant('AMZN Mktp US*RT4G92JK3')).toBe('Amazon');
    expect(normalizeMerchant('TARGET T-0892 CHICAGO IL')).toBe('Target');
    expect(normalizeMerchant('NETFLIX.COM 866-579-7172 CA')).toBe('Netflix');
    expect(normalizeMerchant('APPLE.COM/BILL 866-712-7753 CA')).toBe('Apple Services');
    expect(normalizeMerchant('   ')).toBe('Unknown Merchant');
    expect(normalizeMerchant('')).toBe('Unknown Merchant');
  });

  it('handles Shell and location before store number', () => {
    expect(normalizeMerchant('SHELL OIL 4471 AUSTIN TX')).toBe('Shell');
  });

  it('extracts distinct merchant signatures for auto-learning (Costco Gas vs Whse vs Online)', () => {
    expect(extractMerchantSignature('COSTCO GAS #1226 HUDSON OH')).toBe('COSTCO GAS');
    expect(extractMerchantSignature('COSTCO WHSE #1226 HUDSON OH')).toBe('COSTCO WHSE');
    expect(extractMerchantSignature('WWW COSTCO COM 800-955-2292 WA')).toBe('COSTCO COM');
  });

  it('accurately categorizes sub-brands and user learned rules', () => {
    expect(matchCategory('COSTCO GAS #1226 HUDSON OH', DEFAULT_CATEGORY_RULES)).toBe('cat_transport');
    expect(matchCategory('COSTCO WHSE #1226 HUDSON OH', DEFAULT_CATEGORY_RULES)).toBe('cat_groceries');
    expect(matchCategory('WWW COSTCO COM 800-955-2292 WA', DEFAULT_CATEGORY_RULES)).toBe('cat_shopping');

    // Test high priority user learned rule override
    const userLearnedRules = [
      { id: 'rule_learned_costco_com', categoryId: 'cat_groceries', pattern: 'COSTCO COM', isRegex: false, priority: 100 },
      ...DEFAULT_CATEGORY_RULES
    ];
    expect(matchCategory('WWW COSTCO COM 800-955-2292 WA', userLearnedRules)).toBe('cat_groceries');
  });
});

describe('SPEC 8, 9 & 10: Date, PDF Parsing & Reconciliation', () => {
  it('parses 2-digit years strictly to 2026', () => {
    expect(parseDateStrict('05/14/26')).toBe('2026-05-14');
    expect(parseDateStrict('May 14, 2026')).toBe('2026-05-14');
  });

  it('strips double date post-date token (SPEC 10)', () => {
    const parsed = parseTransactionLine(
      "07/16 07/17 TRADER JOE'S #542 AUSTIN TX 142.50",
      '2026-08-14'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.date).toBe('2026-07-16');
    expect(parsed?.postDate).toBe('2026-07-17');
    expect(parsed?.rawDescription).toBe("TRADER JOE'S #542 AUSTIN TX");
    expect(parsed?.amountCents).toBe(14250);
  });

  it('reconciles summary figures accurately (SPEC 8)', () => {
    const summary = {
      previousBalance: 289040,
      payments: 250000,
      purchases: 309210,
      fees: 1250,
      interest: 4750,
      newBalance: 354250,
      hasNewBalance: true
    };

    const res = reconcileStatementSummary(summary);
    expect(res.discrepancy).toBe(0);
    expect(res.isReconciled).toBe(true);
    expect(res.confidenceScore).toBe('HIGH');
  });

  it('extracts and reconciles separate Payments and Credits lines (Image 2)', () => {
    const text = `
Account Summary
Previous balance $152.30
Payments -$121.19
Credits -$31.11
Purchases +$316.81
Cash advances +$0.00
Fees +$0.00
Interest +$0.00
New balance $316.81
`;
    const summary = extractSummaryBlock(text);
    expect(summary.previousBalance).toBe(15230);
    expect(summary.payments).toBe(15230); // $121.19 + $31.11 = $152.30
    expect(summary.purchases).toBe(31681);
    expect(summary.newBalance).toBe(31681);

    const res = reconcileStatementSummary(summary);
    expect(res.isReconciled).toBe(true);
    expect(res.discrepancy).toBe(0);
  });

  it('extracts and reconciles Citi Costco statement with exact figures (Image 1)', () => {
    const citiText = `
Billing Inquiries and Customer Service
PO Box 790046 ST. LOUIS, MO 63179-0046
Costco Anywhere Visa Card by Citi
Member Since 2024. Account number ending in: 5506

AUGUST STATEMENT
Billing Period: 07/14/26-08/13/26

New balance as of 08/13/26: $920.26
Minimum payment due: $41.00
Payment due date: 09/09/26

Account Summary
Previous balance $1,059.91
Payments -$1,059.91
Credits -$0.00
Purchases +$920.26
Cash advances +$0.00
Fees +$0.00
Interest +$0.00
New balance $920.26
`;

    const summary = extractSummaryBlock(citiText);
    expect(summary.previousBalance).toBe(105991);
    expect(summary.payments).toBe(105991);
    expect(summary.purchases).toBe(92026);
    expect(summary.newBalance).toBe(92026);
    expect(summary.minPayment).toBe(4100);
    expect(summary.paymentDueDate).toBe('2026-09-09');

    const res = reconcileStatementSummary(summary);
    expect(res.isReconciled).toBe(true);
    expect(res.discrepancy).toBe(0);
  });

  it('accurately parses full Citi Strata statement with standard purchases and returns', () => {
    const strataText = `
Citi Strata Card
Member Since 2014 Account number ending in: 2289 
Billing Period: 02/19/26-03/18/26

MARCH STATEMENT
Minimum payment due: $41.00
New balance as of 03/18/26: $346.18 
Payment due date: 04/15/26

Account Summary
Previous balance $421.02
Payments -$390.02
Credits -$31.00
Purchases +$346.18
Cash advances +$0.00
Fees +$0.00
Interest +$0.00
New balance $346.18

Account Summary
Trans. date Post date Description Amount
Payments, Credits and Adjustments 
03/08 ONLINE PAYMENT, THANK YOU -$390.02
02/19 02/19 NORDSTROM RACK #2261 MACEDONIA OH -$31.00

Standard Purchases
02/24 02/24 GOOGLE *Ninja Kiwi MOUNTAIN VIEW CA $7.55
02/25 02/25 GOOGLE *Google One MOUNTAIN VIEW CA $0.81
02/28 02/28 HP *INSTANT INK PALO ALTO CA $5.86
03/02 03/02 NETFLIX.COM LOS GATOS CA $8.53
03/05 03/05 MARSHALLS #868 BAINBRIDGE OH $26.68
03/05 03/05 LEES AUTOMOTIVE TWINSBURG OH $3.19
03/11 03/11 MOONPRENEUR INC SAN JOSE CA $139.00
03/12 03/12 CLOTHES MENTOR #155 CANTON OH $43.11
03/12 03/12 DILLARDS 373 BELDEN VI CANTON OH $111.45
`;

    const result = parseTextStatement(strataText, 'citi_strata.pdf', 'hash_strata');
    expect(result.statement.previousBalance).toBe(42102);
    expect(result.statement.payments).toBe(42102); // 390.02 + 31.00 = 421.02
    expect(result.statement.purchases).toBe(34618);
    expect(result.statement.newBalance).toBe(34618);
    expect(result.statement.isReconciled).toBe(true);
    expect(result.statement.discrepancy).toBe(0);

    const debits = result.transactions.filter(t => t.type === 'DEBIT');
    const credits = result.transactions.filter(t => t.type === 'PAYMENT');
    expect(debits.length).toBe(9); // All 9 standard purchases
    expect(credits.length).toBe(2); // 1 payment + 1 Nordstrom return

    // Verify Dillards is a purchase of $111.45
    const dillards = result.transactions.find(t => t.rawDescription.includes('DILLARDS'));
    expect(dillards?.amountCents).toBe(11145);
    expect(dillards?.normalizedMerchant).toBe("Dillard's");
    expect(dillards?.type).toBe('DEBIT');

    // Verify Nordstrom Rack is a return credit of -$31.00
    const nordstrom = result.transactions.find(t => t.rawDescription.includes('NORDSTROM'));
    expect(nordstrom?.amountCents).toBe(-3100);
    expect(nordstrom?.normalizedMerchant).toBe('Nordstrom Rack');
    expect(nordstrom?.type).toBe('PAYMENT');
  });

  it('accurately parses June Citi Strata statement with purchases, return, and payment', () => {
    const juneStrataText = `
Citi Strata Card
Member Since 2014. Account number ending in: 2289
Billing Period: 05/20/26-06/17/26

JUNE STATEMENT
New balance as of 06/17/26: $152.30 
Minimum payment due: $41.00
Payment due date: 07/15/26

Account Summary
Previous balance $1,019.86
Payments -$1,019.86
Credits -$37.71
Purchases +$190.01
Cash advances +$0.00
Fees +$0.00
Interest +$0.00
New balance $152.30

Account Summary
Trans. date Post date Description Amount
Payments, Credits and Adjustments
06/07 ONLINE PAYMENT, THANK YOU -$1,019.86
06/15 06/15 SHAPERMINT 7025579792 NV -$37.71

Standard Purchases
05/20 05/20 SQ *ESSENTIALS Hudson OH $14.94
05/21 05/21 CVS/PHARMACY #08932 TWINSBURG OH $4.31
05/25 05/25 GOOGLE *Google One MOUNTAIN VIEW CA $3.23
05/28 05/28 HP *INSTANT INK PALO ALTO CA $5.86
05/28 05/28 TWILA'S TREASURES TWINSBURG OH $13.07
06/02 06/02 Netflix.com Los Gatos CA $9.60
06/11 06/11 MOONPRENEUR INC SAN JOSE CA $139.00
`;

    const result = parseTextStatement(juneStrataText, 'June_17.pdf', 'hash_june');
    expect(result.statement.previousBalance).toBe(101986);
    expect(result.statement.payments).toBe(105757); // 1019.86 + 37.71 = 1057.57
    expect(result.statement.purchases).toBe(19001); // 190.01
    expect(result.statement.newBalance).toBe(15230); // 152.30
    expect(result.statement.accountLast4).toBe('2289');
    expect(result.statement.cardName).toBe('Citi Strata');
    expect(result.statement.isReconciled).toBe(true);
    expect(result.statement.discrepancy).toBe(0);

    const debits = result.transactions.filter(t => t.type === 'DEBIT');
    const credits = result.transactions.filter(t => t.type === 'PAYMENT');
    expect(debits.length).toBe(7); // All 7 purchases
    expect(credits.length).toBe(2); // 1 online payment + 1 Shapermint return

    // Verify Moonpreneur is a debit of +$139.00
    const moon = result.transactions.find(t => t.rawDescription.includes('MOONPRENEUR'));
    expect(moon?.amountCents).toBe(13900);
    expect(moon?.type).toBe('DEBIT');

    // Verify Shapermint is a credit of -$37.71
    const shape = result.transactions.find(t => t.rawDescription.includes('SHAPERMINT'));
    expect(shape?.amountCents).toBe(-3771);
    expect(shape?.type).toBe('PAYMENT');
  });

  it('normalizes payment transaction lines with positive amounts in PDF to negative payments', () => {
    const parsed = parseTransactionLine(
      '08/02 AUTOMATIC PAYMENT - THANK YOU 121.19',
      '2026-08-14'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.amountCents).toBe(-12119); // Normalized to negative
  });

  it('correctly parses merchant refunds with separated trailing hyphens like Citi PDF', () => {
    const parsed = parseTransactionLine(
      '06/15 06/15 SHAPERMINT 7025579792 NV - $37.71',
      '2026-06-17'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.amountCents).toBe(-3771);
    expect(parsed?.rawDescription).toBe('SHAPERMINT 7025579792 NV');
  });

  it('parses Discover statement lines with trailing categories', () => {
    const parsed1 = parseTransactionLine(
      '07/14/26 07/14/26 WALMART GROCERY $54.20 Groceries',
      '2026-07-20'
    );
    expect(parsed1).not.toBeNull();
    expect(parsed1?.date).toBe('2026-07-14');
    expect(parsed1?.postDate).toBe('2026-07-14');
    expect(parsed1?.rawDescription).toBe('WALMART GROCERY');
    expect(parsed1?.amountCents).toBe(5420);

    const parsed2 = parseTransactionLine(
      '07/10/26 DIRECTPAY FULL BALANCE -$1,200.00 Payments and Credits',
      '2026-07-20'
    );
    expect(parsed2).not.toBeNull();
    expect(parsed2?.date).toBe('2026-07-10');
    expect(parsed2?.rawDescription).toBe('DIRECTPAY FULL BALANCE');
    expect(parsed2?.amountCents).toBe(-120000);
  });

  it('extracts Discover summary and infers date from filename', () => {
    const discoverRaw = `
Discover it Card
Account ending in 4321
Billing Period: 06/21/26 - 07/20/26

Previous Balance $1,200.00
Payments and Credits -$1,200.00
Purchases +$350.50
Fees Charged $0.00
Interest Charged $0.00
New Balance $350.50
Minimum Payment Due $35.00
Payment Due Date Aug 15, 2026

Transactions
07/05/26 07/05/26 TRADER JOE'S $120.50 Supermarkets
07/10/26 07/10/26 TARGET $230.00 Merchandise
07/15/26 DIRECTPAY FULL BALANCE -$1,200.00 Payments and Credits
`;
    const res = parseTextStatement(discoverRaw, 'Discover-AccountActivity-20260720.pdf', 'hash_disc');
    expect(res.statement.cardName).toBe('Discover Card');
    expect(res.statement.accountLast4).toBe('4321');
    expect(res.statement.periodEnd).toBe('2026-07-20');
    expect(res.statement.previousBalance).toBe(120000);
    expect(res.statement.payments).toBe(120000);
    expect(res.statement.purchases).toBe(35050);
    expect(res.statement.newBalance).toBe(35050);
    expect(res.transactions.length).toBe(3);
    expect(res.statement.isReconciled).toBe(true);
  });

  it('handles unstated summary without false discrepancy', () => {
    const summary = {
      previousBalance: 0,
      payments: 10000,
      purchases: 50000,
      fees: 0,
      interest: 0,
      newBalance: 0,
      hasNewBalance: false
    };

    const res = reconcileStatementSummary(summary);
    expect(res.discrepancy).toBe(0);
    expect(res.isReconciled).toBe(true);
    expect(res.confidenceScore).toBe('UNVERIFIED');
  });

  it('detects duplicate statements even when files have different names but same period and balances', () => {
    const rawStmt1 = {
      id: 'stmt_jan',
      accountId: 'acc_primary',
      periodStart: '2025-12-20',
      periodEnd: '2026-01-19',
      previousBalance: 28559,
      payments: 28559,
      purchases: 55849,
      fees: 0,
      interest: 0,
      newBalance: 55849,
      hasNewBalance: true,
      sourceHash: 'hash_original_jan_file',
      fileName: 'January 19.pdf',
      cardName: 'Citi Strata',
      accountLast4: '2289',
      fileType: 'PDF' as const,
      parsedAt: '2026-08-15T00:00:00Z',
      isReconciled: true,
      discrepancy: 0
    };

    const uploadedNewFile = {
      periodStart: '2025-12-20',
      periodEnd: '2026-01-19',
      previousBalance: 28559,
      payments: 28559,
      purchases: 55849,
      fees: 0,
      interest: 0,
      newBalance: 55849,
      hasNewBalance: true,
      sourceHash: 'different_hash_from_second_download',
      fileName: 'January 19 (1).pdf',
      cardName: 'Citi Strata',
      accountLast4: '2289',
      fileType: 'PDF' as const,
      parsedAt: '2026-08-15T00:00:00Z',
      isReconciled: true,
      discrepancy: 0
    };

    expect(isStatementDuplicate(rawStmt1, uploadedNewFile)).toBe(true);

    // Verify distinct card on same date is NOT flagged as duplicate
    const differentCardSameDate = {
      ...uploadedNewFile,
      accountLast4: '5506',
      cardName: 'Citi Costco Anywhere'
    };
    expect(isStatementDuplicate(rawStmt1, differentCardSameDate)).toBe(false);
  });
});

describe('SPEC 5: Payoff Simulator', () => {
  it('returns null simulation for 0 balance', () => {
    const res = simulateDebtPayoff(0);
    expect(res).toBeNull();
  });

  it('simulates debt payoff with positive savings', () => {
    const res = simulateDebtPayoff(354250, 24.99, 25000, 11000);
    expect(res).not.toBeNull();
    expect(res!.minScenario.monthsToPayoff).toBeGreaterThan(res!.customScenario.monthsToPayoff);
    expect(res!.interestSavedCents).toBeGreaterThan(0);
  });
});

describe('SPEC 11: Subscription Cadence', () => {
  it('verifies cadence multipliers and labels', () => {
    expect(CADENCE_MULTIPLIERS.WEEKLY).toBe(52);
    expect(CADENCE_MULTIPLIERS.BIWEEKLY).toBe(26);
    expect(CADENCE_MULTIPLIERS.MONTHLY).toBe(12);
    expect(CADENCE_MULTIPLIERS.QUARTERLY).toBe(4);
    expect(CADENCE_MULTIPLIERS.ANNUAL).toBe(1);

    expect(CADENCE_LABELS.WEEKLY).toBe('/wk');
    expect(CADENCE_LABELS.BIWEEKLY).toBe('/2wk');
    expect(CADENCE_LABELS.MONTHLY).toBe('/mo');
    expect(CADENCE_LABELS.QUARTERLY).toBe('/qtr');
    expect(CADENCE_LABELS.ANNUAL).toBe('/yr');
  });

  it('correctly separates digital subscriptions from entertainment outings and movies', () => {
    // Digital subscriptions
    expect(matchCategory('NETFLIX.COM LOS GATOS CA', DEFAULT_CATEGORY_RULES)).toBe('cat_subscriptions');
    expect(matchCategory('GOOGLE *GEMINI ADVANCED MOUNTAIN VIEW CA', DEFAULT_CATEGORY_RULES)).toBe('cat_subscriptions');
    expect(matchCategory('CHATGPT SUBSCRIPTION OPENAI', DEFAULT_CATEGORY_RULES)).toBe('cat_subscriptions');
    expect(matchCategory('SPOTIFY USA NEW YORK NY', DEFAULT_CATEGORY_RULES)).toBe('cat_subscriptions');
    expect(matchCategory('DISNEY PLUS STREAMING', DEFAULT_CATEGORY_RULES)).toBe('cat_subscriptions');

    // Entertainment & Outings
    expect(matchCategory('AMC THEATRES #2120 CHICAGO IL', DEFAULT_CATEGORY_RULES)).toBe('cat_entertainment');
    expect(matchCategory('REGAL CINEMAS CINEMA 14', DEFAULT_CATEGORY_RULES)).toBe('cat_entertainment');
    expect(matchCategory('KALAHARI WATER PARK RESORT SANDUSKY OH', DEFAULT_CATEGORY_RULES)).toBe('cat_entertainment');
    expect(matchCategory('CEDAR POINT THEME PARK TICKETS', DEFAULT_CATEGORY_RULES)).toBe('cat_entertainment');
    expect(matchCategory('DAVE & BUSTERS ARCADE', DEFAULT_CATEGORY_RULES)).toBe('cat_entertainment');
  });

  it('automatically assigns negative amounts and refund/credits to Payments & Credits category', () => {
    expect(matchCategory('ANY MERCHANT XYZ', DEFAULT_CATEGORY_RULES, -5000)).toBe('cat_payments');
    expect(matchCategory('ONLINE PAYMENT - THANK YOU', DEFAULT_CATEGORY_RULES, -20000)).toBe('cat_payments');
    expect(matchCategory('MERCHANDISE REFUND / RETURN', DEFAULT_CATEGORY_RULES, -3450)).toBe('cat_payments');
    expect(matchCategory('AUTOMATIC PAYMENT - THANK YOU', DEFAULT_CATEGORY_RULES)).toBe('cat_payments');
  });

  it('verifies that isTrueSubscriptionTx excludes utility bills and tuition from digital subscriptions', async () => {
    const { isTrueSubscriptionTx } = await import('../engine/subscriptionDetector');
    
    // True digital subscription
    const netflixTx = {
      id: '1',
      statementId: 's1',
      accountId: 'a1',
      date: '2026-01-02',
      rawDescription: 'NETFLIX.COM LOS GATOS CA',
      normalizedMerchant: 'Netflix',
      categoryId: 'cat_subscriptions',
      amountCents: 853,
      type: 'DEBIT' as const
    };
    expect(isTrueSubscriptionTx(netflixTx)).toBe(true);

    // Utility bill should be excluded
    const utilityTx = {
      id: '2',
      statementId: 's1',
      accountId: 'a1',
      date: '2026-01-20',
      rawDescription: 'SUMMIT CNTY *UTILITY AKRON OH',
      normalizedMerchant: 'Summit County Utility',
      categoryId: 'cat_utilities',
      amountCents: 30245,
      type: 'DEBIT' as const
    };
    expect(isTrueSubscriptionTx(utilityTx)).toBe(false);

    // Education / tuition bill should be excluded
    const karateTx = {
      id: '3',
      statementId: 's1',
      accountId: 'a1',
      date: '2026-01-11',
      rawDescription: 'KARATE INSTITUTE LLC TWINSBURG OH',
      normalizedMerchant: 'Karate Institute',
      categoryId: 'cat_education',
      amountCents: 15000,
      type: 'DEBIT' as const
    };
    expect(isTrueSubscriptionTx(karateTx)).toBe(false);
  });
});
