/**
 * SPEC 9 — Date Parsing & Year Inference Engine
 * 
 * Strict date parsing, named-month ranges, and statement-cycle year inference.
 */

const MONTH_NAMES: { [key: string]: number } = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isValidYear(year: number): boolean {
  return year >= 1990 && year <= 2100;
}

/**
 * Validate that a year, month, day combination actually exists on the calendar (e.g. leap year Feb 29, 30 vs 31 days)
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!isValidYear(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Format Date into YYYY-MM-DD
 */
export function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${padZero(month)}-${padZero(day)}`;
}

/**
 * Parse 2-digit year (e.g. 26 -> 2026, 99 -> 1999)
 */
export function normalizeTwoDigitYear(twoDigit: number): number {
  if (twoDigit >= 70) {
    return 1900 + twoDigit;
  }
  return 2000 + twoDigit;
}

/**
 * Strict date string parsing into YYYY-MM-DD
 */
export function parseDateStrict(dateStr: string | null | undefined): string | null {
  if (!dateStr || !dateStr.trim()) return null;

  // Clean trailing commas and whitespace (e.g., "May 14," -> "May 14")
  let cleanStr = dateStr.trim().replace(/,\s*$/, '').replace(/\s+/g, ' ');

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleanStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  // 2. US standard: MM/DD/YYYY or MM-DD-YYYY
  const usFullMatch = cleanStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (usFullMatch) {
    const month = parseInt(usFullMatch[1], 10);
    const day = parseInt(usFullMatch[2], 10);
    const year = parseInt(usFullMatch[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  // 3. US 2-digit: MM/DD/YY or MM-DD-YY
  const usTwoMatch = cleanStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (usTwoMatch) {
    const month = parseInt(usTwoMatch[1], 10);
    const day = parseInt(usTwoMatch[2], 10);
    const year = normalizeTwoDigitYear(parseInt(usTwoMatch[3], 10));
    if (isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  // 4. Named month format: e.g., "May 14, 2026" or "14 May 2026" or "Aug 01 26"
  const namedMatch1 = cleanStr.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i);
  if (namedMatch1) {
    const monthKey = namedMatch1[1].toLowerCase();
    const month = MONTH_NAMES[monthKey];
    const day = parseInt(namedMatch1[2], 10);
    let year = parseInt(namedMatch1[3], 10);
    if (year < 100) year = normalizeTwoDigitYear(year);
    if (month && isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  const namedMatch2 = cleanStr.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{2,4})$/i);
  if (namedMatch2) {
    const day = parseInt(namedMatch2[1], 10);
    const monthKey = namedMatch2[2].toLowerCase();
    const month = MONTH_NAMES[monthKey];
    let year = parseInt(namedMatch2[3], 10);
    if (year < 100) year = normalizeTwoDigitYear(year);
    if (month && isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  return null;
}

/**
 * Infer year for MM/DD dates in PDF statements where year is omitted from row items.
 */
export function inferYearForTransaction(
  monthDayStr: string,
  periodEndISO: string,
  _periodStartISO?: string
): string | null {
  const clean = monthDayStr.trim().replace(/,\s*$/, '');

  // Match MM/DD or Month Day (e.g. "07/16", "7/16", "Jul 16")
  let month = 0;
  let day = 0;

  const mmdd = clean.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (mmdd) {
    month = parseInt(mmdd[1], 10);
    day = parseInt(mmdd[2], 10);
  } else {
    const named = clean.match(/^([A-Za-z]{3,9})\s+(\d{1,2})$/i);
    if (named) {
      const mKey = named[1].toLowerCase();
      month = MONTH_NAMES[mKey] || 0;
      day = parseInt(named[2], 10);
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Use periodEnd year as the reference year
  const endParts = periodEndISO.split('-').map(Number);
  if (endParts.length !== 3 || !isValidYear(endParts[0])) {
    return null;
  }

  const periodEndYear = endParts[0];
  const candidateDate = new Date(periodEndYear, month - 1, day);
  const periodEndDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  // If candidate date is > 45 days after periodEnd, it belongs to the previous year (e.g. Dec tx on Jan statement)
  const diffDays = (candidateDate.getTime() - periodEndDate.getTime()) / (1000 * 60 * 60 * 24);

  let finalYear = periodEndYear;
  if (diffDays > 45) {
    finalYear = periodEndYear - 1;
  }

  if (!isValidCalendarDate(finalYear, month, day)) {
    return null;
  }

  return formatDateISO(finalYear, month, day);
}

/**
 * Extract date from filename (e.g. Discover-AccountActivity-20260720.pdf, statement_2026-06-17.pdf)
 */
export function extractDateFromFileName(fileName: string): string | null {
  if (!fileName) return null;

  // 1. YYYYMMDD e.g. Discover-AccountActivity-20260720.pdf
  const yyyymmdd = fileName.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1], 10);
    const m = parseInt(yyyymmdd[2], 10);
    const d = parseInt(yyyymmdd[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
    }
  }

  // 2. YYYY-MM-DD or YYYY_MM_DD
  const iso = fileName.match(/(?:^|[^0-9])(20\d{2})[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  // 3. MM-DD-YYYY or MM_DD_YYYY
  const us = fileName.match(/(?:^|[^0-9])(0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])[-_](20\d{2})(?:[^0-9]|$)/);
  if (us) {
    const y = parseInt(us[3], 10);
    const m = parseInt(us[1], 10);
    const d = parseInt(us[2], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${us[3]}-${us[1]}-${us[2]}`;
    }
  }

  // 4. "January 19" or "Jan 19"
  const named = fileName.match(/(?:^|[^A-Za-z])(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[-_ ]+(\d{1,2})(?:[-_ ]+(\d{2,4}))?/i);
  if (named) {
    const mKey = named[1].toLowerCase();
    const month = MONTH_NAMES[mKey];
    const day = parseInt(named[2], 10);
    let year = named[3] ? parseInt(named[3], 10) : new Date().getFullYear();
    if (year < 100) year = normalizeTwoDigitYear(year);
    if (month && isValidCalendarDate(year, month, day)) {
      return formatDateISO(year, month, day);
    }
  }

  return null;
}

/**
 * Extract named-month statement period ranges from header text
 * e.g., "May 1, 2026 - May 31, 2026" or "07/16/2026 to 08/15/2026"
 */
export function extractStatementPeriod(
  text: string
): { periodStart?: string; periodEnd?: string; periodDetected: boolean } {
  // 1. "Month D, YYYY - Month D, YYYY" or "... through ..." / "... to ..."
  const namedRangeRegex = /([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:-|–|—|to|through)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;
  const match1 = text.match(namedRangeRegex);
  if (match1) {
    const start = parseDateStrict(match1[1]);
    const end = parseDateStrict(match1[2]);
    if (start && end) {
      return { periodStart: start, periodEnd: end, periodDetected: true };
    }
  }

  // 2. Numeric range "MM/DD/YYYY - MM/DD/YYYY" or with 2-digit years
  const numRangeRegex = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:-|–|—|to|through)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i;
  const match2 = text.match(numRangeRegex);
  if (match2) {
    const start = parseDateStrict(match2[1]);
    const end = parseDateStrict(match2[2]);
    if (start && end) {
      return { periodStart: start, periodEnd: end, periodDetected: true };
    }
  }

  // 3. Discover Billing Period: "Billing Period: MM/DD/YY - MM/DD/YY"
  const billingPeriodRegex = /(?:billing\s+period|statement\s+period)[^0-9A-Za-z]{0,10}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{2,4})\s*(?:-|–|—|to|through)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{2,4})/i;
  const matchBP = text.match(billingPeriodRegex);
  if (matchBP) {
    const start = parseDateStrict(matchBP[1]);
    const end = parseDateStrict(matchBP[2]);
    if (end) {
      return { periodStart: start || undefined, periodEnd: end, periodDetected: true };
    }
  }

  // 4. Single statement closing date: e.g. "Statement Closing Date: 08/15/2026" or "Billing Cycle Ending 08/15/2026"
  const closingRegex = /(?:statement\s+(?:closing\s+)?date|billing\s+cycle\s+end(?:ing)?|cycle\s+date|closing\s+date|account\s+activity\s*[-–—:]*)[^0-9A-Za-z]{0,10}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;
  const match3 = text.match(closingRegex);
  if (match3) {
    const end = parseDateStrict(match3[1]);
    if (end) {
      return { periodEnd: end, periodDetected: true };
    }
  }

  return { periodDetected: false };
}
