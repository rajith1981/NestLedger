/**
 * SPEC 1 — Money Parsing & Integer-Cent Arithmetic
 * 
 * Strict integer-cent arithmetic with ZERO floating-point multiplication errors.
 */

export function parseAmountToCents(amountStr: string | number | null | undefined): number {
  if (amountStr === null || amountStr === undefined) {
    return 0;
  }

  if (typeof amountStr === 'number') {
    if (Number.isNaN(amountStr) || !Number.isFinite(amountStr)) return 0;
    if (Math.abs(amountStr) > 1e15) return 0;
    // Format to fixed 2 decimal string to avoid scientific notation parsing bugs (e.g. 1e-7)
    return parseAmountToCents(amountStr.toFixed(2));
  }

  // 1. Clean string: trim, replace \u00A0 with standard spaces
  let str = amountStr.toString().replace(/\u00A0/g, ' ').trim();
  if (!str || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null' || str === '--') {
    return 0;
  }

  // 2. Track sign
  let isNegative = false;
  let isPositiveExplicit = false;

  // Check CR / DR suffix
  if (/CR$/i.test(str)) {
    isNegative = true;
    str = str.replace(/CR$/i, '').trim();
  } else if (/DR$/i.test(str)) {
    isPositiveExplicit = true;
    str = str.replace(/DR$/i, '').trim();
  }

  // Check Parentheses: e.g., ($45.10) or (45.10)
  if (/^\s*\((.*)\)\s*$/.test(str)) {
    isNegative = true;
    str = str.replace(/^\s*\((.*)\)\s*$/, '$1').trim();
  }

  // Check leading or trailing minus
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true;
    str = str.replace(/^-|-$/g, '').trim();
  } else if (str.startsWith('+') || str.endsWith('+')) {
    isPositiveExplicit = true;
    str = str.replace(/^\+|\+$/g, '').trim();
  }

  // 3. Clean remaining currency signs, commas, and whitespace
  str = str.replace(/[\$,\s€£¥]/g, '').trim();

  // If there are still parentheses or negative signs after nested stripping
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true;
    str = str.replace(/^-|-$/g, '').trim();
  }

  if (!str || !/\d/.test(str)) {
    return 0;
  }

  // 4. Decimal split: Split on '.' (handle integer or float)
  const parts = str.split('.');
  const wholePartStr = parts[0].replace(/\D/g, '') || '0';
  const wholeDollars = parseInt(wholePartStr, 10);
  if (Number.isNaN(wholeDollars)) {
    return 0;
  }

  let centsPart = 0;
  if (parts.length > 1) {
    const fractionStr = parts[1].replace(/\D/g, '');
    if (fractionStr.length === 0) {
      centsPart = 0;
    } else if (fractionStr.length === 1) {
      centsPart = parseInt(fractionStr, 10) * 10;
    } else if (fractionStr.length === 2) {
      centsPart = parseInt(fractionStr, 10);
    } else {
      // 3+ decimal digits -> HALF_UP rounding
      const firstTwo = parseInt(fractionStr.slice(0, 2), 10);
      const thirdDigit = parseInt(fractionStr[2], 10);
      centsPart = thirdDigit >= 5 ? firstTwo + 1 : firstTwo;
    }
  }

  const totalCents = wholeDollars * 100 + centsPart;
  return isNegative ? -totalCents : totalCents;
}

/**
 * Format integer cents into standard USD string with commas:
 * e.g., 348250 -> "$3,482.50"
 * e.g., -4510 -> "-$45.10" or "($45.10)"
 */
export function formatCurrency(
  cents: number,
  options?: {
    useParensForNegative?: boolean;
    showSign?: boolean;
    hideCentsIfZero?: boolean;
  }
): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) {
    cents = 0;
  }

  const isNeg = cents < 0;
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remainderCents = absCents % 100;

  const dollarsFormatted = dollars.toLocaleString('en-US');
  const centsFormatted = remainderCents.toString().padStart(2, '0');

  if (options?.hideCentsIfZero && remainderCents === 0) {
    const base = `$${dollarsFormatted}`;
    if (isNeg) {
      return options?.useParensForNegative ? `(${base})` : `-${base}`;
    }
    return options?.showSign && cents > 0 ? `+${base}` : base;
  }

  const formattedAbs = `$${dollarsFormatted}.${centsFormatted}`;

  if (isNeg) {
    if (options?.useParensForNegative) {
      return `(${formattedAbs})`;
    }
    return `-${formattedAbs}`;
  }

  if (options?.showSign && cents > 0) {
    return `+${formattedAbs}`;
  }

  return formattedAbs;
}

/**
 * Format cents to short human currency (e.g. "$1.2k", "$450")
 */
export function formatCompactCurrency(cents: number): string {
  const absCents = Math.abs(cents);
  const isNeg = cents < 0;
  const dollars = absCents / 100;
  let formatted = '';

  if (dollars >= 1000000) {
    formatted = `$${(dollars / 1000000).toFixed(1)}M`;
  } else if (dollars >= 1000) {
    formatted = `$${(dollars / 1000).toFixed(1)}k`;
  } else {
    formatted = `$${Math.round(dollars)}`;
  }

  return isNeg ? `-${formatted}` : formatted;
}
