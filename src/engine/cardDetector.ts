import { Statement, Transaction } from '../types/statement';

/**
 * Robustly detects the actual credit card brand & model
 * from statement metadata, filenames, and associated transaction patterns.
 */
export function detectCardName(
  stmt: Partial<Statement>,
  txs: Transaction[] = []
): { cardName: string; issuer: string; color: string } {
  // Check explicit cardName first if it's not a raw filename
  const existingName = stmt.cardName || '';
  const isRawFileName =
    existingName.toLowerCase().endsWith('.pdf') ||
    existingName.toLowerCase().endsWith('.csv') ||
    /^\d{4}-\d{2}-\d{2}/.test(existingName) ||
    /^[a-zA-Z]+\s+\d{1,2}/.test(existingName);

  const fileName = stmt.fileName || '';
  const combinedStr = `${existingName} ${fileName}`.toLowerCase();

  // Aggregate transaction descriptions for deep fingerprinting
  const txTexts = txs.map((t) => (t.rawDescription || '').toUpperCase()).join(' ');

  // 1. Discover Card
  if (
    combinedStr.includes('discover') ||
    txTexts.includes('DISCOVER') ||
    txTexts.includes('CASHBACK BONUS') ||
    txTexts.includes('DIRECTPAY')
  ) {
    return {
      cardName: 'Discover Card',
      issuer: 'Discover',
      color: '#f97316' // Orange
    };
  }

  // 2. American Express (Amex)
  if (
    combinedStr.includes('amex') ||
    combinedStr.includes('american express') ||
    combinedStr.includes('gold card') ||
    combinedStr.includes('platinum') ||
    txTexts.includes('AMEX') ||
    txTexts.includes('AMERICAN EXPRESS') ||
    txTexts.includes('MEMBERSHIP REWARDS') ||
    txTexts.includes('AMEX EPAYMENT')
  ) {
    return {
      cardName: 'American Express',
      issuer: 'American Express',
      color: '#d97706' // Gold / Amber
    };
  }

  // 3. Citi Costco Anywhere
  if (
    combinedStr.includes('costco') ||
    txTexts.includes('COSTCO') ||
    txTexts.includes('CITIBANK COSTCO') ||
    txTexts.includes('COSTCO WHOLESALE')
  ) {
    return {
      cardName: 'Citi Costco Anywhere',
      issuer: 'Citi',
      color: '#e11d48' // Red / Rose
    };
  }

  // 4. Citi Simplicity Card
  if (
    combinedStr.includes('simplicity') ||
    stmt.accountLast4 === '0873' ||
    combinedStr.includes('0873') ||
    txTexts.includes('866-696-5673') ||
    txTexts.includes('SUMMIT CNTY *UTILITY') ||
    txTexts.includes("HEINEN'S GROCERY")
  ) {
    return {
      cardName: 'Citi Simplicity',
      issuer: 'Citi',
      color: '#06b6d4' // Cyan / Teal
    };
  }

  // 5. Citi Strata Card
  if (
    combinedStr.includes('strata') ||
    stmt.accountLast4 === '2289' ||
    combinedStr.includes('2289') ||
    txTexts.includes('THANKYOU') ||
    txTexts.includes('MOONPRENEUR') ||
    txTexts.includes('ZAIQA INDIAN') ||
    txTexts.includes('SOMA INTIMATE')
  ) {
    return {
      cardName: 'Citi Strata',
      issuer: 'Citi',
      color: '#0284c7' // Royal Blue
    };
  }

  // 6. Generic Citi Cards fallback
  if (
    combinedStr.includes('citi') ||
    txTexts.includes('CITI') ||
    txTexts.includes('CITIBANK') ||
    txTexts.includes('ONLINE PAYMENT, THANK YOU')
  ) {
    if (combinedStr.includes('double cash') || txTexts.includes('DOUBLE CASH')) {
      return { cardName: 'Citi Double Cash', issuer: 'Citi', color: '#0284c7' };
    }
    if (combinedStr.includes('custom cash') || txTexts.includes('CUSTOM CASH')) {
      return { cardName: 'Citi Custom Cash', issuer: 'Citi', color: '#0284c7' };
    }
    if (stmt.accountLast4 === '0873') {
      return { cardName: 'Citi Simplicity', issuer: 'Citi', color: '#06b6d4' };
    }
    if (stmt.accountLast4 === '2289') {
      return { cardName: 'Citi Strata', issuer: 'Citi', color: '#0284c7' };
    }
    return {
      cardName: 'Citi Strata',
      issuer: 'Citi',
      color: '#0284c7'
    };
  }

  // 5. Chase Cards (Sapphire, Freedom, etc.)
  if (
    combinedStr.includes('chase') ||
    combinedStr.includes('sapphire') ||
    combinedStr.includes('freedom') ||
    txTexts.includes('CHASE') ||
    txTexts.includes('JPMORGAN') ||
    txTexts.includes('CHASE EPAY') ||
    txTexts.includes('AUTOMATIC PAYMENT - THANK YOU')
  ) {
    if (combinedStr.includes('sapphire') || txTexts.includes('SAPPHIRE')) {
      return { cardName: 'Chase Sapphire Preferred', issuer: 'Chase', color: '#0d6efd' };
    }
    if (combinedStr.includes('freedom') || txTexts.includes('FREEDOM')) {
      return { cardName: 'Chase Freedom', issuer: 'Chase', color: '#0d6efd' };
    }
    return {
      cardName: 'Chase Sapphire Preferred',
      issuer: 'Chase',
      color: '#0d6efd'
    };
  }

  // 6. Capital One
  if (
    combinedStr.includes('capital one') ||
    combinedStr.includes('venture') ||
    combinedStr.includes('quicksilver') ||
    txTexts.includes('CAPITAL ONE')
  ) {
    return {
      cardName: 'Capital One',
      issuer: 'Capital One',
      color: '#6366f1'
    };
  }

  // 7. Apple Card
  if (combinedStr.includes('apple card') || txTexts.includes('APPLE CARD') || txTexts.includes('GOLDMAN SACHS')) {
    return {
      cardName: 'Apple Card',
      issuer: 'Apple',
      color: '#8b5cf6'
    };
  }

  // 8. If an explicit cardName was given and is not a filename
  if (!isRawFileName && existingName) {
    return {
      cardName: existingName,
      issuer: 'Credit Card',
      color: '#8b5cf6'
    };
  }

  // 9. Fallback with last 4
  if (stmt.accountLast4) {
    return {
      cardName: `Credit Card (*${stmt.accountLast4})`,
      issuer: 'Credit Card',
      color: '#8b5cf6'
    };
  }

  return {
    cardName: fileName ? fileName.replace(/\.(pdf|csv)$/i, '') : 'Credit Card',
    issuer: 'Credit Card',
    color: '#8b5cf6'
  };
}
