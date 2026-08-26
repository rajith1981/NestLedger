/**
 * SPEC 11 — Goals & Subscription Cadence Logic
 * 
 * Detects recurring subscription patterns, cadences, price increases, and status.
 */

import { CadenceType, Subscription, SubscriptionStatus, Transaction } from '../types/statement';

export const CADENCE_MULTIPLIERS: Record<CadenceType, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUAL: 1
};

export const CADENCE_LABELS: Record<CadenceType, string> = {
  WEEKLY: '/wk',
  BIWEEKLY: '/2wk',
  MONTHLY: '/mo',
  QUARTERLY: '/qtr',
  ANNUAL: '/yr'
};

export const KNOWN_SUBSCRIPTION_MERCHANTS = new Set([
  'Spotify',
  'Netflix',
  'Hulu',
  'Disney+',
  'Disney',
  'Max',
  'HBO',
  'Apple Services',
  'Apple.com/Bill',
  'Apple Music',
  'iCloud',
  'Google',
  'Google One',
  'Google Gemini',
  'Gemini',
  'OpenAI',
  'ChatGPT',
  'GitHub',
  'Cloudflare',
  'The New York Times',
  'NYTimes',
  'Wall Street Journal',
  'WSJ',
  'Planet Fitness',
  'Equinox',
  'LA Fitness',
  'Amazon Prime',
  'Prime Video',
  'Microsoft',
  'Microsoft 365',
  'Heroku',
  'Adobe',
  'Dropbox',
  'YouTube Premium',
  'YouTube',
  'PlayStation Network',
  'PlayStation',
  'Xbox Game Pass',
  'Xbox',
  'Nintendo',
  'Sling TV',
  'Sling',
  'HP Instant Ink',
  'Audible',
  'Paramount+',
  'Peacock',
  'Crunchyroll',
  'Midjourney',
  'Canva',
  'Notion',
  'Figma',
  '1Password',
  'Bitwarden',
  'Zoom',
  'Squarespace',
  'Wix',
  'Costco Membership'
]);

/**
 * Validates whether a transaction qualifies as a true digital/service subscription
 * (excluding municipal utility bills, tuition, rent, groceries, and fuel).
 */
export function isTrueSubscriptionTx(tx: Transaction): boolean {
  if (tx.amountCents <= 0 || tx.feeType || tx.type === 'PAYMENT') return false;

  // Explicit non-subscription categories
  if (
    tx.categoryId === 'cat_utilities' ||
    tx.categoryId === 'cat_education' ||
    tx.categoryId === 'cat_housing' ||
    tx.categoryId === 'cat_insurance' ||
    tx.categoryId === 'cat_groceries' ||
    tx.categoryId === 'cat_dining' ||
    tx.categoryId === 'cat_transport' ||
    tx.categoryId === 'cat_travel' ||
    tx.categoryId === 'cat_shopping' ||
    tx.categoryId === 'cat_personal_care' ||
    tx.categoryId === 'cat_fees' ||
    tx.categoryId === 'cat_payments'
  ) {
    return false;
  }

  // Explicit subscription category
  if (tx.categoryId === 'cat_subscriptions') {
    return true;
  }

  const norm = (tx.normalizedMerchant || '').toLowerCase();
  const desc = (tx.rawDescription || '').toLowerCase();

  for (const known of KNOWN_SUBSCRIPTION_MERCHANTS) {
    if (norm.includes(known.toLowerCase()) || desc.includes(known.toLowerCase())) {
      return true;
    }
  }

  // Common subscription descriptor patterns
  if (
    desc.includes('subscription') ||
    desc.includes('membership') ||
    desc.includes('subscr') ||
    desc.includes('recurring') ||
    desc.includes('monthly charge')
  ) {
    return true;
  }

  return false;
}

function getDayDiff(date1Str: string, date2Str: string): number {
  const d1 = new Date(date1Str).getTime();
  const d2 = new Date(date2Str).getTime();
  return Math.abs(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

/**
 * Infer cadence from average interval days
 */
export function inferCadenceFromInterval(avgDays: number): CadenceType {
  if (avgDays >= 5 && avgDays <= 10) return 'WEEKLY';
  if (avgDays >= 11 && avgDays <= 20) return 'BIWEEKLY';
  if (avgDays >= 21 && avgDays <= 45) return 'MONTHLY';
  if (avgDays >= 70 && avgDays <= 120) return 'QUARTERLY';
  return 'ANNUAL';
}

/**
 * Detect all subscriptions from a list of transactions
 */
export function detectSubscriptions(
  transactions: Transaction[],
  referenceDateISO?: string
): Subscription[] {
  const nowISO = referenceDateISO || new Date().toISOString().split('T')[0];

  // Filter only true subscription debit purchases
  const debitTxs = transactions.filter(isTrueSubscriptionTx);

  // Group by normalized merchant
  const grouped: Record<string, Transaction[]> = {};
  for (const tx of debitTxs) {
    const m = tx.normalizedMerchant;
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(tx);
  }

  const subscriptions: Subscription[] = [];

  for (const [merchant, txs] of Object.entries(grouped)) {
    if (merchant === 'Unknown Merchant') continue;

    // Sort chronologically ascending
    txs.sort((a, b) => a.date.localeCompare(b.date));

    const isKnownSubscription = KNOWN_SUBSCRIPTION_MERCHANTS.has(merchant);
    const count = txs.length;

    // Require known merchant OR explicit subscription category / keywords
    if (!isKnownSubscription && !txs.some(t => t.categoryId === 'cat_subscriptions' || /subscr|membership|recurring/i.test(t.rawDescription))) {
      continue;
    }

    if (count < 2 && !isKnownSubscription) {
      continue;
    }

    let cadence: CadenceType = 'MONTHLY';
    let status: SubscriptionStatus = 'ACTIVE';

    if (count >= 2) {
      // Calculate intervals
      const intervals: number[] = [];
      for (let i = 1; i < count; i++) {
        intervals.push(getDayDiff(txs[i - 1].date, txs[i].date));
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      cadence = inferCadenceFromInterval(avgInterval);
    } else {
      // Single transaction for known subscription merchant
      cadence = 'MONTHLY';
      status = 'SUSPECTED';
    }

    const latestTx = txs[count - 1];
    const latestAmount = latestTx.amountCents;
    const lastSeenDate = latestTx.date;

    // Check price changes
    let previousAmountCents: number | undefined = undefined;
    let priceIncreaseCents: number | undefined = undefined;
    let annualizedIncreaseCents: number | undefined = undefined;

    if (count >= 2) {
      const prevTx = txs[count - 2];
      if (prevTx.amountCents !== latestAmount) {
        previousAmountCents = prevTx.amountCents;
        const diff = latestAmount - prevTx.amountCents;
        if (diff > 0) {
          priceIncreaseCents = diff;
          const mult = CADENCE_MULTIPLIERS[cadence];
          annualizedIncreaseCents = diff * mult;
        }
      }
    }

    // Determine status (ACTIVE vs LAPSED)
    const daysSinceLastSeen = getDayDiff(lastSeenDate, nowISO);
    let maxExpectedDays = 40;
    if (cadence === 'WEEKLY') maxExpectedDays = 14;
    else if (cadence === 'BIWEEKLY') maxExpectedDays = 25;
    else if (cadence === 'MONTHLY') maxExpectedDays = 45;
    else if (cadence === 'QUARTERLY') maxExpectedDays = 110;
    else if (cadence === 'ANNUAL') maxExpectedDays = 400;

    if (daysSinceLastSeen > maxExpectedDays * 1.5 && count >= 2) {
      status = 'LAPSED';
    } else if (count >= 2) {
      status = 'ACTIVE';
    }

    subscriptions.push({
      id: `sub_${merchant.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      normalizedMerchant: merchant,
      amountCents: latestAmount,
      cadence,
      status,
      lastSeenDate,
      previousAmountCents,
      priceIncreaseCents,
      annualizedIncreaseCents,
      transactionCount: count,
      transactionIds: txs.map(t => t.id)
    });
  }

  // Sort: ACTIVE first, then highest monthly cost
  return subscriptions.sort((a, b) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
    if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
    const aMonthly = (a.amountCents * CADENCE_MULTIPLIERS[a.cadence]) / 12;
    const bMonthly = (b.amountCents * CADENCE_MULTIPLIERS[b.cadence]) / 12;
    return bMonthly - aMonthly;
  });
}
