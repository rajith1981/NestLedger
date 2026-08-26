/**
 * SPEC 4 — Merchant Descriptor Normalization
 * 
 * Cleans noisy card transaction descriptors into recognizable brand names.
 */

// Step 1: Mandatory Processor Prefix Stripping (requires separator *, #, /)
const PROCESSOR_PREFIX_REGEX = /^(SQ|SQC|TST|PP|PAYPAL|SP|IC|WPY|EB|TOAST|CLOVER|PY|STRIPE)\s*[\*#/]\s*/i;

// Step 2: City / State Suffix Stripping
const CITY_STATE_SUFFIX_REGEX = /\s+[A-Z][A-Z'.]*(?:\s+[A-Z][A-Z'.]*){0,1}\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|USA|US)\b\s*$/i;

// Standalone US / USA suffix
const COUNTRY_SUFFIX_REGEX = /\s+(USA|US)\b\s*$/i;

// Store / Terminal / Phone / Web clutter regexes
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
const STORE_NUM_REGEX = /\b(?:STORE|LOC|UNIT|TERMINAL|ST|T-?|#)\s*#?[0-9A-Z\-]+\b/gi;
const STANDALONE_STORE_DIGITS_REGEX = /\s+#?[0-9]{3,8}\b/g;
const WEB_TLD_REGEX = /\b(HTTP:\/\/|HTTPS:\/\/)?(WWW\.)?([A-Z0-9\-_]+)\.(COM|NET|ORG|IO|CO|APP|ME|INFO|TV|US|CC)\b(?:\/[A-Z0-9_\-\/]*)?/gi;

// High-confidence exact & regex aliases
interface MerchantAlias {
  match: RegExp | string;
  name: string;
}

const MERCHANT_ALIASES: MerchantAlias[] = [
  // Amazon platform
  { match: /\b(?:AMZN|AMAZON|AMZ\*)\b/i, name: 'Amazon' },
  // Apple platform
  { match: /\b(?:APPLE\.COM\/BILL|APL\*|APPLE\.COM|ITUNES|APPLE\s+SERVICES|APPLE\s+STORE)\b/i, name: 'Apple Services' },
  // Google platform
  { match: /\b(?:GOOGLE\s*\*|GOOGLE\s+PLAY|GOOGLE\s+STORAGE|GOOGLE\s+CLOUD|GOOGLE\s+PAY|GOOGLE\s+SERVICES)\b/i, name: 'Google' },
  // Common merchants & subscriptions
  { match: /\bSPOTIFY\b/i, name: 'Spotify' },
  { match: /\bNETFLIX\b/i, name: 'Netflix' },
  { match: /\bHULU\b/i, name: 'Hulu' },
  { match: /\bDISNEY(?:\s*PLUS|\+|\s*STREAMING)?\b/i, name: 'Disney+' },
  { match: /\bHBO\s*MAX|MAX\s*STREAMING\b/i, name: 'Max' },
  { match: /\bUBER\s*EATS\b/i, name: 'Uber Eats' },
  { match: /\bUBER\s*TRIP|UBER\s*\*TRIP|UBER\s*PENDING|\bUBER\b/i, name: 'Uber' },
  { match: /\bLYFT\b/i, name: 'Lyft' },
  { match: /\bDOORDASH|DOOR\s*DASH\b/i, name: 'DoorDash' },
  { match: /\bGRUBHUB\b/i, name: 'Grubhub' },
  { match: /\bINSTACART\b/i, name: 'Instacart' },
  { match: /\bTRADER\s*JOE'?S\b/i, name: "Trader Joe's" },
  { match: /\bWHOLEFDS|WHOLE\s*FOODS\b/i, name: 'Whole Foods' },
  { match: /\bCOSTCO(?:\s*GAS|\s*WHSE|\s*WHOLESALE)?\b/i, name: 'Costco' },
  { match: /\bTARGET\b/i, name: 'Target' },
  { match: /\bWAL-?MART\b/i, name: 'Walmart' },
  { match: /\bDILLARD'?S\b/i, name: "Dillard's" },
  { match: /\bMARSHALLS\b/i, name: 'Marshalls' },
  { match: /\bNORDSTROM(?:\s*RACK)?\b/i, name: 'Nordstrom Rack' },
  { match: /\bSTARBUCKS\b/i, name: 'Starbucks' },
  { match: /\bBLUE\s*BOTTLE(?:\s*COFFEE)?\b/i, name: 'Blue Bottle Coffee' },
  { match: /\bSHELL(?:\s*OIL)?\b/i, name: 'Shell' },
  { match: /\bCHEVRON\b/i, name: 'Chevron' },
  { match: /\bEXXON(?:\s*MOBIL)?\b/i, name: 'ExxonMobil' },
  { match: /\bBP\s*GAS|BP\s*CONNECT|BP\s*#\b/i, name: 'BP' },
  { match: /\bCVS(?:\s*PHARMACY)?\b/i, name: 'CVS Pharmacy' },
  { match: /\bWALGREENS\b/i, name: 'Walgreens' },
  { match: /\bCHIPOTLE\b/i, name: 'Chipotle' },
  { match: /\bSWEETGREEN\b/i, name: 'Sweetgreen' },
  { match: /\bMCDONALD'?S\b/i, name: "McDonald's" },
  { match: /\bSHAKE\s*SHACK\b/i, name: 'Shake Shack' },
  { match: /\bPANERA\b/i, name: 'Panera Bread' },
  { match: /\bDUNKIN\b/i, name: "Dunkin'" },
  { match: /\bNEW\s*YORK\s*TIMES|NYTIMES\b/i, name: 'The New York Times' },
  { match: /\bWSJ|WALL\s*STREET\s*JOURNAL\b/i, name: 'Wall Street Journal' },
  { match: /\bCHATGPT|OPENAI\b/i, name: 'OpenAI' },
  { match: /\b(?:GEMINI|GOOGLE\s*GEMINI|GOOGLE\s*ONE)\b/i, name: 'Google Gemini' },
  { match: /\b(?:AMC|AMC\s*THEATRES|AMC\s*CINEMAS)\b/i, name: 'AMC Theatres' },
  { match: /\b(?:REGAL|REGAL\s*CINEMAS)\b/i, name: 'Regal Cinemas' },
  { match: /\b(?:CINEMARK|CINEMARK\s*THEATRES)\b/i, name: 'Cinemark' },
  { match: /\b(?:WATER\s*PARK|WATERPARK|SIX\s*FLAGS|CEDAR\s*POINT|UNIVERSAL\s*STUDIOS)\b/i, name: 'Theme & Water Park' },
  { match: /\bGITHUB\b/i, name: 'GitHub' },
  { match: /\bCLOUDFLARE\b/i, name: 'Cloudflare' },
  { match: /\bHEROKU\b/i, name: 'Heroku' },
  { match: /\bAWS\s*SERVICES|AMAZON\s*WEB\s*SERVICES\b/i, name: 'AWS' },
  { match: /\bMICROSOFT|MSFT\b/i, name: 'Microsoft' },
  { match: /\bEQUINOX\b/i, name: 'Equinox' },
  { match: /\bPLANET\s*FITNESS\b/i, name: 'Planet Fitness' },
  { match: /\bAIRBNB\b/i, name: 'Airbnb' },
  { match: /\bHOTELS\.COM\b/i, name: 'Hotels.com' },
  { match: /\bEXPEDIA\b/i, name: 'Expedia' },
  { match: /\bDELTA\s*AIR\b/i, name: 'Delta Air Lines' },
  { match: /\bUNITED\s*AIRLINES\b/i, name: 'United Airlines' },
  { match: /\bAMERICAN\s*AIRLINES|AA\s*AIR\b/i, name: 'American Airlines' },
  { match: /\bSOUTHWEST\s*AIR\b/i, name: 'Southwest Airlines' }
];

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => {
      // Special acronyms/words
      if (['us', 'usa', 'llc', 'inc', 'co', 'tv', 'bp', 'ai', 'atm'].includes(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function normalizeMerchant(rawDescription: string): string {
  if (!rawDescription || !rawDescription.trim()) {
    return 'Unknown Merchant';
  }

  let cleaned = rawDescription.trim();

  // 1. Mandatory Processor Prefix Stripping
  cleaned = cleaned.replace(PROCESSOR_PREFIX_REGEX, '').trim();

  // 2. City / State Suffix Stripping (before store numbers)
  if (CITY_STATE_SUFFIX_REGEX.test(cleaned)) {
    const afterStrip = cleaned.replace(CITY_STATE_SUFFIX_REGEX, '').trim();
    if (afterStrip.length > 0) {
      cleaned = afterStrip;
    }
  }

  if (COUNTRY_SUFFIX_REGEX.test(cleaned)) {
    const afterStrip = cleaned.replace(COUNTRY_SUFFIX_REGEX, '').trim();
    if (afterStrip.length > 0) {
      cleaned = afterStrip;
    }
  }

  // 3. Platform & Brand Alias Matching (early return for known brands)
  for (const alias of MERCHANT_ALIASES) {
    if (typeof alias.match === 'string') {
      if (cleaned.toLowerCase().includes(alias.match.toLowerCase())) {
        return alias.name;
      }
    } else if (alias.match.test(cleaned) || alias.match.test(rawDescription)) {
      return alias.name;
    }
  }

  // 4. Secondary clutter cleaning (phone numbers, store numbers, urls)
  cleaned = cleaned.replace(PHONE_REGEX, ' ').trim();
  cleaned = cleaned.replace(STORE_NUM_REGEX, ' ').trim();
  cleaned = cleaned.replace(STANDALONE_STORE_DIGITS_REGEX, ' ').trim();
  cleaned = cleaned.replace(WEB_TLD_REGEX, '$3').trim();

  // Strip dangling symbols and trailing digits
  cleaned = cleaned.replace(/[*#/\-_:]+/g, ' ').trim();
  cleaned = cleaned.replace(/\s+\d+\s*$/, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  if (!cleaned || cleaned.length === 0) {
    return 'Unknown Merchant';
  }

  return toTitleCase(cleaned);
}

/**
 * Extract a high-confidence signature pattern from a transaction description
 * for auto-learning user category assignments.
 */
export function extractMerchantSignature(rawDescription: string, normalizedMerchant?: string): string {
  if (!rawDescription || !rawDescription.trim()) {
    return normalizedMerchant || 'UNKNOWN';
  }

  const upper = rawDescription.toUpperCase();

  // 1. High-priority sub-brand patterns (e.g. Costco Gas vs Costco Wholesale vs Costco.com)
  if (upper.includes('COSTCO GAS') || upper.includes('COSTCO FUEL')) return 'COSTCO GAS';
  if (upper.includes('COSTCO WHSE') || upper.includes('COSTCO WHOLESALE')) return 'COSTCO WHSE';
  if (upper.includes('COSTCO.COM') || upper.includes('COSTCO COM')) return 'COSTCO COM';

  if (upper.includes("SAM'S CLUB GAS") || upper.includes("SAMS CLUB GAS")) return "SAMS CLUB GAS";
  if (upper.includes("SAM'S CLUB WHSE") || upper.includes("SAMS CLUB WHSE")) return "SAMS CLUB WHSE";
  if (upper.includes("SAM'S CLUB") || upper.includes("SAMS CLUB")) return "SAMS CLUB";

  if (upper.includes('KROGER FUEL')) return 'KROGER FUEL';
  if (upper.includes('HEB FUEL')) return 'HEB FUEL';
  if (upper.includes('WALMART FUEL') || upper.includes('WAL-MART GAS')) return 'WALMART GAS';

  if (upper.includes('UBER EATS') || upper.includes('UBEREATS')) return 'UBER EATS';
  if (upper.includes('UBER TRIP') || upper.includes('UBER* TRIP')) return 'UBER';
  if (upper.includes('APPLE.COM/BILL')) return 'APPLE.COM/BILL';

  // 2. Clean processor prefixes, city/states, store numbers
  let cleaned = upper.replace(PROCESSOR_PREFIX_REGEX, ' ').trim();
  cleaned = cleaned.replace(PHONE_REGEX, ' ');
  cleaned = cleaned.replace(CITY_STATE_SUFFIX_REGEX, ' ');
  cleaned = cleaned.replace(COUNTRY_SUFFIX_REGEX, ' ');
  cleaned = cleaned.replace(STORE_NUM_REGEX, ' ');
  cleaned = cleaned.replace(STANDALONE_STORE_DIGITS_REGEX, ' ');
  cleaned = cleaned.replace(WEB_TLD_REGEX, '$3 COM');
  cleaned = cleaned.replace(/[*#/\-_:,.]+/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Strip trailing pure digits
  cleaned = cleaned.replace(/\s+[0-9]{2,}\b/g, '').trim();

  if (cleaned.length >= 3) {
    return cleaned;
  }

  return (normalizedMerchant || upper).trim();
}
