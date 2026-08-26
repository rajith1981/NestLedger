import { Account, Category, CategoryRule, Goal, Statement, Transaction } from '../types/statement';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10b981', budgetMonthlyCents: 60000 },
  { id: 'cat_dining', name: 'Dining & takeout', icon: 'Utensils', color: '#f59e0b', budgetMonthlyCents: 45000 },
  { id: 'cat_transport', name: 'Transport & fuel', icon: 'Car', color: '#3b82f6', budgetMonthlyCents: 25000 },
  { id: 'cat_travel', name: 'Travel', icon: 'Plane', color: '#8b5cf6', budgetMonthlyCents: 30000 },
  { id: 'cat_shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#ec4899', budgetMonthlyCents: 40000 },
  { id: 'cat_utilities', name: 'Utilities & telecom', icon: 'Zap', color: '#06b6d4', budgetMonthlyCents: 20000 },
  { id: 'cat_housing', name: 'Housing', icon: 'Home', color: '#6366f1', budgetMonthlyCents: 150000 },
  { id: 'cat_health', name: 'Health & pharmacy', icon: 'HeartPulse', color: '#ef4444', budgetMonthlyCents: 15000 },
  { id: 'cat_insurance', name: 'Insurance', icon: 'Shield', color: '#14b8a6', budgetMonthlyCents: 25000 },
  { id: 'cat_subscriptions', name: 'Subscriptions & Streaming', icon: 'Tv', color: '#a855f7', budgetMonthlyCents: 15000 },
  { id: 'cat_entertainment', name: 'Entertainment & Outings', icon: 'Film', color: '#f43f5e', budgetMonthlyCents: 15000 },
  { id: 'cat_personal_care', name: 'Personal care', icon: 'Sparkles', color: '#fb7185', budgetMonthlyCents: 10000 },
  { id: 'cat_education', name: 'Education', icon: 'BookOpen', color: '#0284c7', budgetMonthlyCents: 10000 },
  { id: 'cat_fees', name: 'Fees & interest', icon: 'AlertTriangle', color: '#dc2626', budgetMonthlyCents: 0 },
  { id: 'cat_payments', name: 'Payments & credits', icon: 'ArrowDownCircle', color: '#10b981', budgetMonthlyCents: 0 },
  { id: 'cat_general', name: 'General & Uncategorized', icon: 'MoreHorizontal', color: '#64748b', budgetMonthlyCents: 20000 }
];

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  // Payments & credits (Priority 30)
  { id: 'rule_15', categoryId: 'cat_payments', pattern: "AUTOMATIC PAYMENT|ONLINE PAYMENT|AUTOPAY|DIRECTPAY|PAYMENT - THANK YOU|PAYMENT THANK YOU|THANK YOU|REFUND|MERCHANDISE CREDIT|CREDIT ADJUSTMENT|CASHBACK", isRegex: true, priority: 30 },
  // Fees & interest (Priority 25)
  { id: 'rule_14', categoryId: 'cat_fees', pattern: "LATE FEE|ANNUAL FEE|FOREIGN TRANSACTION|INTEREST CHARGE|FINANCE CHARGE|OVERLIMIT|ATM FEE", isRegex: true, priority: 25 },
  // Specialized Fuel Sub-brands (Priority 22)
  { id: 'rule_fuel_sub', categoryId: 'cat_transport', pattern: "COSTCO GAS|COSTCO FUEL|SAMS CLUB GAS|SAM'S CLUB GAS|KROGER FUEL|HEB FUEL|WALMART GAS|WAL-MART GAS|SHELL|CHEVRON|EXXON|BP |MOBIL|SPEEDWAY|GAS STATION|GASOLINE|FUEL|LUBRIZOL|CAR WASH|OIL CHANGE|AUTO PARTS", isRegex: true, priority: 22 },
  // Specialized Online & Retail Shopping (Priority 20)
  { id: 'rule_online_sub', categoryId: 'cat_shopping', pattern: "COSTCO\\.COM|WWW COSTCO COM|SAMSCLUB\\.COM|AMAZON|AMZN|TARGET|WALMART|WAL-MART|WAL MART|BEST BUY|APPLE STORE|NORDSTROM|ZARA|UNIQLO|HOME DEPOT|LOWES|IKEA|ETSY|EBAY|RETAIL|WHITE HOUSE|BLACK MARKET|TJ MAXX|T\\.J\\. MAXX|MARSHALLS|ROSS|KOHLS|MACYS|CLOTHING|OUTLET|BOUTIQUE|MALL", isRegex: true, priority: 20 },
  // Subscriptions & Streaming (Priority 18)
  { id: 'rule_10', categoryId: 'cat_subscriptions', pattern: "SPOTIFY|NETFLIX|HULU|DISNEY|DISNEY\\+|MAX|HBO|OPENAI|CHATGPT|GEMINI|GOOGLE ONE|GITHUB|CLOUDFLARE|NYTIMES|WALL STREET JOURNAL|WSJ|YOUTUBE|ADOBE|DROPBOX|APPLE\\.COM/BILL|APPLE SERVICES|ICLOUD|PRIME VIDEO|AMZN DIGITAL|PARAMOUNT|PEACOCK|CRUNCHYROLL|AUDIBLE|MIDJOURNEY|CANVA|MICROSOFT 365|OFFICE 365|SUBSCRIPTION", isRegex: true, priority: 18 },
  // Entertainment & Outings (Priority 15)
  { id: 'rule_11', categoryId: 'cat_entertainment', pattern: "CINEMA|THEATER|THEATRE|AMC|REGAL|CINEMARK|MOVIE|SHOWCASE|WATER PARK|WATERPARK|THEME PARK|AMUSEMENT PARK|SIX FLAGS|CEDAR POINT|DISNEYLAND|DISNEY WORLD|UNIVERSAL STUDIOS|SEAWORLD|ZOO|AQUARIUM|MUSEUM|BOWLING|TOPGOLF|DAVE & BUSTER|MAIN EVENT|ROUND1|MINI GOLF|ESCAPE ROOM|EVENTBRITE|TICKETMASTER|LIVE NATION|STUBHUB|SEATGEEK|CONCERT|FESTIVAL|CARNIVAL|EXHIBIT|ARCADE|PLAYSTATION|XBOX|NINTENDO|STEAM GAMES", isRegex: true, priority: 15 },
  // Groceries (Priority 10)
  { id: 'rule_1', categoryId: 'cat_groceries', pattern: "TRADER JOE|WHOLE FOODS|SAFEWAY|KROGER|ALDI|HEB|SPROUTS|COSTCO WHSE|COSTCO WHOLESALE|COSTCO|WEGMANS|SUPERMARKET|GROCERY|MARKET|FOOD LION|PUBLIX|MEIJER|GIANT EAGLE|MARKETPLACE|BAKERY|BUTCHER|PRODUCE", isRegex: true, priority: 10 },
  // Dining & takeout (Priority 10)
  { id: 'rule_2', categoryId: 'cat_dining', pattern: "STARBUCKS|BLUE BOTTLE|CHIPOTLE|SWEETGREEN|MCDONALD|SHAKE SHACK|PANERA|DUNKIN|DOMINO|PIZZA|BURGER|COFFEE|DINER|BAR & GRILL|GRILL|TACOS|TACO|PANINI|BAGEL|SUSHI|NOODLE|BISTRO|BREW|TAVERN|BBQ|KITCHEN|DONUT|CATERING|RESTAURANT|CAFE|BAKERY|UBER EATS|DOORDASH|GRUBHUB", isRegex: true, priority: 10 },
  // Transport & fuel (Priority 10)
  { id: 'rule_3', categoryId: 'cat_transport', pattern: "UBER|LYFT|TRANSIT|SUBWAY|METRO|PARKING|TOLL", isRegex: true, priority: 10 },
  // Travel (Priority 10)
  { id: 'rule_4', categoryId: 'cat_travel', pattern: "AIRBNB|HOTELS\\.COM|EXPEDIA|DELTA|UNITED AIRLINES|AMERICAN AIRLINES|SOUTHWEST|MARRIOTT|HILTON|HYATT|FLIGHT|AIRLINE|HOTEL|BOOKING\\.COM|RESORT|CRUISE", isRegex: true, priority: 10 },
  // Utilities & telecom (Priority 10)
  { id: 'rule_6', categoryId: 'cat_utilities', pattern: "AT&T|VERIZON|T-MOBILE|COMCAST|XFINITY|SPECTRUM|CONED|PG&E|FIRSTENERGY|FIRST ENERGY|UTILITY|UTILITIES|ELECTRIC|POWER|WATER|GAS BILL|SEWER|ENERGY|TELECOM|WIRELESS|INTERNET", isRegex: true, priority: 10 },
  // Housing (Priority 10)
  { id: 'rule_7', categoryId: 'cat_housing', pattern: "RENT|MORTGAGE|HOA |PROPERTY MANAGEMENT|STORAGE UNIT|HOME REPAIR", isRegex: true, priority: 10 },
  // Health & pharmacy (Priority 10)
  { id: 'rule_8', categoryId: 'cat_health', pattern: "CVS|WALGREENS|RITE AID|PHARMACY|DOCTOR|DENTAL|CLINIC|HEALTHCARE|HOSPITAL|LABCORP|QUEST DIAGNOSTICS|OPTOMETRY|VISION|MEDICINE|MEDICAL", isRegex: true, priority: 10 },
  // Insurance (Priority 10)
  { id: 'rule_9', categoryId: 'cat_insurance', pattern: "GEICO|PROGRESSIVE|STATE FARM|ALLSTATE|LIBERTY MUTUAL|LEMONADE|INSURANCE|BLUE CROSS|AETNA|CIGNA", isRegex: true, priority: 10 },
  // Personal care (Priority 10)
  { id: 'rule_12', categoryId: 'cat_personal_care', pattern: "SALON|BARBER|SPA|SEPHORA|ULTA|HAIRCUT|MASSAGE|EQUINOX|PLANET FITNESS|GYM", isRegex: true, priority: 10 },
  // Education (Priority 10)
  { id: 'rule_13', categoryId: 'cat_education', pattern: "TUITION|COLLEGE|UNIVERSITY|COURSERA|UDEMY|TEXTBOOK|SCHOOL|KARATE|MARTIAL ARTS|TAEKWONDO|DOJO|ACADEMY|INSTITUTE|TUTOR|LESSONS|CLASS|INSTRUCTION|TRAINING", isRegex: true, priority: 10 }
];

export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'acc_sapphire',
    name: 'Chase Sapphire Preferred',
    issuer: 'Chase',
    last4: '4821',
    aprPurchase: 24.99,
    aprCash: 29.99,
    color: '#0d6efd',
    createdAt: '2026-06-01T00:00:00Z'
  },
  {
    id: 'acc_gold',
    name: 'Amex Gold Card',
    issuer: 'American Express',
    last4: '1094',
    aprPurchase: 28.24,
    color: '#d97706',
    createdAt: '2026-06-01T00:00:00Z'
  }
];

export const DEMO_STATEMENTS: Statement[] = [
  {
    id: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    periodStart: '2026-07-16',
    periodEnd: '2026-08-14',
    previousBalance: 289040,
    payments: 250000,
    purchases: 309210,
    fees: 1250,
    interest: 4750,
    newBalance: 354250,
    hasNewBalance: true,
    minPayment: 11000,
    paymentDueDate: '2026-09-09',
    sourceHash: 'demo_hash_chase_aug2026',
    fileName: 'Chase_Sapphire_Aug2026_Statement.pdf',
    fileType: 'PDF',
    parsedAt: '2026-08-15T10:00:00Z',
    isReconciled: true,
    discrepancy: 0
  },
  {
    id: 'stmt_demo_jul2026',
    accountId: 'acc_sapphire',
    periodStart: '2026-06-16',
    periodEnd: '2026-07-15',
    previousBalance: 245000,
    payments: 245000,
    purchases: 289040,
    fees: 0,
    interest: 0,
    newBalance: 289040,
    hasNewBalance: true,
    minPayment: 3500,
    paymentDueDate: '2026-08-09',
    sourceHash: 'demo_hash_chase_jul2026',
    fileName: 'Chase_Sapphire_Jul2026_Statement.pdf',
    fileType: 'PDF',
    parsedAt: '2026-07-16T10:00:00Z',
    isReconciled: true,
    discrepancy: 0
  }
];

export const DEMO_TRANSACTIONS: Transaction[] = [
  // Aug Statement (Active cycle: 2026-07-16 to 2026-08-14)
  {
    id: 'tx_demo_01',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-16',
    postDate: '2026-07-17',
    rawDescription: "07/16 07/17 TRADER JOE'S #542 AUSTIN TX",
    normalizedMerchant: "Trader Joe's",
    categoryId: 'cat_groceries',
    amountCents: 14250,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_02',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-18',
    rawDescription: 'SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA',
    normalizedMerchant: 'Blue Bottle Coffee',
    categoryId: 'cat_dining',
    amountCents: 780,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_03',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-20',
    rawDescription: 'AMZN Mktp US*RT4G92JK3',
    normalizedMerchant: 'Amazon',
    categoryId: 'cat_shopping',
    amountCents: 6499,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_04',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-22',
    rawDescription: 'SPOTIFY USA',
    normalizedMerchant: 'Spotify',
    categoryId: 'cat_entertainment',
    amountCents: 1199,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_05',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-24',
    rawDescription: 'TARGET T-0892 CHICAGO IL',
    normalizedMerchant: 'Target',
    categoryId: 'cat_shopping',
    amountCents: 8940,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_06',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-28',
    rawDescription: 'NETFLIX.COM 866-579-7172 CA',
    normalizedMerchant: 'Netflix',
    categoryId: 'cat_entertainment',
    amountCents: 2299,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_07',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-07-30',
    rawDescription: 'APPLE.COM/BILL 866-712-7753 CA',
    normalizedMerchant: 'Apple Services',
    categoryId: 'cat_entertainment',
    amountCents: 1499,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_08',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-01',
    rawDescription: 'SHELL OIL 4471 AUSTIN TX',
    normalizedMerchant: 'Shell',
    categoryId: 'cat_transport',
    amountCents: 5210,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_09',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-03',
    rawDescription: 'DELTA AIR LINES 006239102948',
    normalizedMerchant: 'Delta Air Lines',
    categoryId: 'cat_travel',
    amountCents: 48560,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_10',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-05',
    rawDescription: 'OPENAI *CHATGPT SUBSCRIPTION',
    normalizedMerchant: 'OpenAI',
    categoryId: 'cat_entertainment',
    amountCents: 2000,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_11',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-07',
    rawDescription: 'AUTOMATIC PAYMENT - THANK YOU',
    normalizedMerchant: 'Payment Received',
    categoryId: 'cat_general',
    amountCents: -250000,
    type: 'PAYMENT'
  },
  {
    id: 'tx_demo_12',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-08',
    rawDescription: 'WHOLE FOODS MARKET #1029',
    normalizedMerchant: 'Whole Foods',
    categoryId: 'cat_groceries',
    amountCents: 18430,
    type: 'DEBIT'
  },
  {
    id: 'tx_demo_13',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-10',
    rawDescription: 'FOREIGN TRANSACTION FEE (EUR 120.00)',
    normalizedMerchant: 'Foreign Transaction Fee',
    categoryId: 'cat_fees',
    amountCents: 1250,
    type: 'FEE',
    feeType: 'FEE_FOREIGN_TX',
    isAvoidable: true
  },
  {
    id: 'tx_demo_14',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-12',
    rawDescription: 'INTEREST CHARGE ON PURCHASES',
    normalizedMerchant: 'Interest Charge',
    categoryId: 'cat_fees',
    amountCents: 4750,
    type: 'INTEREST',
    feeType: 'INTEREST_PURCHASE',
    isAvoidable: true
  },
  {
    id: 'tx_demo_15',
    statementId: 'stmt_demo_aug2026',
    accountId: 'acc_sapphire',
    date: '2026-08-13',
    rawDescription: 'UBER TRIP 9239 HELP.UBER.COM',
    normalizedMerchant: 'Uber',
    categoryId: 'cat_transport',
    amountCents: 3140,
    type: 'DEBIT'
  }
];

export const DEFAULT_GOALS: Goal[] = [
  {
    id: 'goal_fee_zero',
    type: 'FEE_REDUCTION',
    name: 'Zero Avoidable Fees',
    targetCents: 0,
    active: true,
    createdAt: '2026-08-01T00:00:00Z'
  },
  {
    id: 'goal_groceries_cap',
    type: 'CATEGORY_SPEND_CAP',
    name: 'Keep Groceries Under $600',
    targetCents: 60000,
    categoryId: 'cat_groceries',
    active: true,
    createdAt: '2026-08-01T00:00:00Z'
  }
];
