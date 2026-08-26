import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  BarChart3,
  Filter,
  CheckCircle2,
  AlertCircle,
  Landmark,
  CreditCard,
  Plus,
  RotateCcw,
  Sparkles,
  ChevronRight,
  GitCompare,
  Layers,
  PieChart as PieChartIcon
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { isPaymentOrCreditDesc } from '../../engine/pdfParser';
import { detectCardName } from '../../engine/cardDetector';
import { NavTab } from '../layout/Sidebar';
import { AddExpenseModal } from '../manual/AddExpenseModal';

interface MonthlyTrackerViewProps {
  onNavigate?: (tab: NavTab) => void;
}

interface MonthlyData {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "Jul 2026"
  year: number;
  monthIndex: number; // 1 to 12
  purchasesCents: number; // Total Outflow (Credit + Checking)
  creditCardPurchasesCents: number; // Credit card portion
  checkingBillsCents: number; // Checking bills portion
  paymentsCents: number;
  feesCents: number;
  netSpendCents: number;
  txCount: number;
  categorySpend: Record<string, number>;
  categoryTxCount: Record<string, number>;
  cardSpend: Record<string, number>; // key: cardName
  cardTxCount: Record<string, number>; // key: cardName
  cardPayments: Record<string, number>; // key: cardName
  momPercent: number | null; // % change from previous month
  momDollarDiff: number | null;
  statementIds: string[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MonthlyTrackerView: React.FC<MonthlyTrackerViewProps> = ({ onNavigate }) => {
  const {
    allTransactions,
    statements,
    accounts,
    categories,
    availableYears,
    setSelectedStatementId,
    setSelectedCategoryFilter,
    setSelectedTypeFilter
  } = useStatements();

  // Mode: 'SINGLE' (standard single year) | 'CARDS' (By Credit Card comparison) | 'YOY' (Year-over-Year comparison)
  const [viewMode, setViewMode] = useState<'SINGLE' | 'CARDS' | 'YOY'>('SINGLE');

  // Matrix table view toggle in SINGLE mode: 'CATEGORIES' | 'CARDS'
  const [singleMatrixMode, setSingleMatrixMode] = useState<'CATEGORIES' | 'CARDS'>('CATEGORIES');

  // Default selectedYear to latest active year
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return availableYears.length > 0 ? availableYears[0].toString() : 'ALL';
  });

  // Comparison year for YoY
  const [compareYear, setCompareYear] = useState<string>(() => {
    return availableYears.length > 1 ? availableYears[1].toString() : availableYears[0]?.toString() || '2025';
  });

  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'CREDIT' | 'CHECKING'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL'); // 'ALL' or cat.id
  const [selectedCard, setSelectedCard] = useState<string>('ALL'); // 'ALL' or card.name
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Sync selectedYear if availableYears changes and selectedYear is unselected
  useEffect(() => {
    if (availableYears.length > 0 && selectedYear !== 'ALL' && !availableYears.includes(parseInt(selectedYear, 10))) {
      setSelectedYear(availableYears[0].toString());
    }
  }, [availableYears, selectedYear]);

  // Map statements to card identities
  const statementCardMap = useMemo(() => {
    const map: Record<string, { cardName: string; color: string; last4: string; issuer: string }> = {};
    for (const stmt of statements) {
      const stmtTxs = allTransactions.filter((t) => t.statementId === stmt.id);
      const detected = detectCardName(stmt, stmtTxs);
      map[stmt.id] = {
        cardName: detected.cardName,
        color: detected.color,
        last4: stmt.accountLast4 || '',
        issuer: detected.issuer
      };
    }
    return map;
  }, [statements, allTransactions]);

  const getCardInfoForTx = (tx: { statementId?: string; accountId?: string }) => {
    if (tx.statementId && statementCardMap[tx.statementId]) {
      return statementCardMap[tx.statementId];
    }
    if (tx.accountId) {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) {
        return {
          cardName: acc.name,
          color: acc.color || 'var(--brand-primary)',
          last4: acc.last4 || '',
          issuer: acc.issuer || 'Credit Card'
        };
      }
    }
    return {
      cardName: 'Credit Card',
      color: 'var(--brand-primary)',
      last4: '',
      issuer: 'Credit Card'
    };
  };

  // Distinct list of all credit cards found in statements/transactions
  const availableCards = useMemo(() => {
    const cardMap: Record<string, { id: string; name: string; last4?: string; color: string; totalSpend: number; txCount: number }> = {};

    for (const stmt of statements) {
      const stmtTxs = allTransactions.filter((t) => t.statementId === stmt.id);
      const detected = detectCardName(stmt, stmtTxs);
      const key = detected.cardName;
      if (!cardMap[key]) {
        cardMap[key] = {
          id: key,
          name: detected.cardName,
          last4: stmt.accountLast4 || '',
          color: detected.color,
          totalSpend: 0,
          txCount: 0
        };
      }
    }

    for (const tx of allTransactions) {
      if (tx.isManual || tx.accountType === 'CHECKING' || tx.accountId === 'acc_checking') continue;
      const info = getCardInfoForTx(tx);
      const key = info.cardName;
      if (!cardMap[key]) {
        cardMap[key] = {
          id: key,
          name: info.cardName,
          last4: info.last4,
          color: info.color,
          totalSpend: 0,
          txCount: 0
        };
      }
      if (tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT' && !isPaymentOrCreditDesc(tx.rawDescription)) {
        cardMap[key].totalSpend += tx.amountCents;
        cardMap[key].txCount += 1;
      }
    }

    return Object.values(cardMap).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [statements, allTransactions, statementCardMap, accounts]);

  // Group all transactions & statements into monthly buckets
  const monthlyDataList = useMemo<MonthlyData[]>(() => {
    const buckets: Record<
      string,
      {
        monthKey: string;
        year: number;
        monthIndex: number;
        creditCardPurchasesCents: number;
        checkingBillsCents: number;
        paymentsCents: number;
        feesCents: number;
        txCount: number;
        categorySpend: Record<string, number>;
        categoryTxCount: Record<string, number>;
        cardSpend: Record<string, number>;
        cardTxCount: Record<string, number>;
        cardPayments: Record<string, number>;
        statementIds: Set<string>;
      }
    > = {};

    // 1. Group from row transactions
    for (const tx of allTransactions) {
      if (!tx.date) continue;
      const monthKey = tx.date.slice(0, 7); // "YYYY-MM"
      const year = parseInt(tx.date.slice(0, 4), 10);
      const monthIndex = parseInt(tx.date.slice(5, 7), 10);

      if (!buckets[monthKey]) {
        buckets[monthKey] = {
          monthKey,
          year,
          monthIndex,
          creditCardPurchasesCents: 0,
          checkingBillsCents: 0,
          paymentsCents: 0,
          feesCents: 0,
          txCount: 0,
          categorySpend: {},
          categoryTxCount: {},
          cardSpend: {},
          cardTxCount: {},
          cardPayments: {},
          statementIds: new Set<string>()
        };
      }

      const b = buckets[monthKey];
      b.txCount++;
      if (tx.statementId && tx.statementId !== 'manual_checking') {
        b.statementIds.add(tx.statementId);
      }

      const isChecking =
        tx.isManual ||
        tx.accountType === 'CHECKING' ||
        tx.accountId === 'acc_checking' ||
        tx.statementId === 'manual_checking';
      const isFee = tx.feeType !== null && tx.feeType !== undefined;
      const isPayment = !isChecking && (tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription));

      const cardInfo = !isChecking ? getCardInfoForTx(tx) : null;
      const cardName = cardInfo?.cardName;

      if (isChecking) {
        // Manual checking expenses are always positive expense outflows
        b.checkingBillsCents += Math.abs(tx.amountCents);
        const catId = tx.categoryId && tx.categoryId !== 'cat_payments' ? tx.categoryId : 'cat_housing';
        b.categorySpend[catId] = (b.categorySpend[catId] || 0) + Math.abs(tx.amountCents);
        b.categoryTxCount[catId] = (b.categoryTxCount[catId] || 0) + 1;
      } else if (isFee) {
        b.feesCents += Math.abs(tx.amountCents);
      } else if (isPayment) {
        b.paymentsCents += Math.abs(tx.amountCents);
        if (cardName) {
          b.cardPayments[cardName] = (b.cardPayments[cardName] || 0) + Math.abs(tx.amountCents);
        }
      } else {
        b.creditCardPurchasesCents += Math.abs(tx.amountCents);
        const catId = tx.categoryId || 'cat_general';
        b.categorySpend[catId] = (b.categorySpend[catId] || 0) + Math.abs(tx.amountCents);
        b.categoryTxCount[catId] = (b.categoryTxCount[catId] || 0) + 1;

        if (cardName) {
          b.cardSpend[cardName] = (b.cardSpend[cardName] || 0) + Math.abs(tx.amountCents);
          b.cardTxCount[cardName] = (b.cardTxCount[cardName] || 0) + 1;
        }
      }
    }

    // 2. Also factor in statements summary figures if any
    for (const stmt of statements) {
      if (!stmt.periodEnd) continue;
      const monthKey = stmt.periodEnd.slice(0, 7);
      const year = parseInt(stmt.periodEnd.slice(0, 4), 10);
      const monthIndex = parseInt(stmt.periodEnd.slice(5, 7), 10);

      const stmtTxs = allTransactions.filter((t) => t.statementId === stmt.id);
      const detected = detectCardName(stmt, stmtTxs);
      const cardName = detected.cardName;

      if (!buckets[monthKey]) {
        buckets[monthKey] = {
          monthKey,
          year,
          monthIndex,
          creditCardPurchasesCents: stmt.purchases || 0,
          checkingBillsCents: 0,
          paymentsCents: stmt.payments || 0,
          feesCents: stmt.fees || 0,
          txCount: 0,
          categorySpend: {},
          categoryTxCount: {},
          cardSpend: { [cardName]: stmt.purchases || 0 },
          cardTxCount: {},
          cardPayments: { [cardName]: stmt.payments || 0 },
          statementIds: new Set<string>([stmt.id])
        };
      } else {
        buckets[monthKey].statementIds.add(stmt.id);
        if (buckets[monthKey].creditCardPurchasesCents === 0 && stmt.purchases > 0) {
          buckets[monthKey].creditCardPurchasesCents = stmt.purchases;
        }
        if (buckets[monthKey].paymentsCents === 0 && stmt.payments > 0) {
          buckets[monthKey].paymentsCents = stmt.payments;
        }
        if (!buckets[monthKey].cardSpend[cardName] && stmt.purchases > 0) {
          buckets[monthKey].cardSpend[cardName] = stmt.purchases;
        }
        if (!buckets[monthKey].cardPayments[cardName] && stmt.payments > 0) {
          buckets[monthKey].cardPayments[cardName] = stmt.payments;
        }
      }
    }

    // Sort chronologically ascending
    const sortedKeys = Object.keys(buckets).sort();

    let previousNetSpend: number | null = null;

    return sortedKeys.map((key) => {
      const b = buckets[key];
      const [y, m] = key.split('-').map(Number);
      const dateObj = new Date(y, m - 1, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      // Effective purchases based on sourceFilter
      let purchasesCents = b.creditCardPurchasesCents + b.checkingBillsCents;
      if (sourceFilter === 'CREDIT') purchasesCents = b.creditCardPurchasesCents;
      if (sourceFilter === 'CHECKING') purchasesCents = b.checkingBillsCents;

      const netSpendCents = purchasesCents + b.feesCents;

      let momPercent: number | null = null;
      let momDollarDiff: number | null = null;

      if (previousNetSpend !== null && previousNetSpend > 0) {
        momDollarDiff = netSpendCents - previousNetSpend;
        momPercent = ((netSpendCents - previousNetSpend) / previousNetSpend) * 100;
      }

      previousNetSpend = netSpendCents;

      return {
        monthKey: key,
        monthLabel,
        year: b.year,
        monthIndex: b.monthIndex,
        purchasesCents,
        creditCardPurchasesCents: b.creditCardPurchasesCents,
        checkingBillsCents: b.checkingBillsCents,
        paymentsCents: b.paymentsCents,
        feesCents: b.feesCents,
        netSpendCents,
        txCount: b.txCount,
        categorySpend: b.categorySpend,
        categoryTxCount: b.categoryTxCount,
        cardSpend: b.cardSpend,
        cardTxCount: b.cardTxCount,
        cardPayments: b.cardPayments,
        momPercent,
        momDollarDiff,
        statementIds: Array.from(b.statementIds)
      };
    });
  }, [allTransactions, statements, sourceFilter, statementCardMap, accounts]);

  // Filtered by single year (if not 'ALL')
  const filteredMonths = useMemo(() => {
    if (selectedYear === 'ALL') return monthlyDataList;
    const y = parseInt(selectedYear, 10);
    return monthlyDataList.filter((m) => m.year === y);
  }, [monthlyDataList, selectedYear]);

  // Active Category Object
  const activeCategory = useMemo(() => {
    if (selectedCategory === 'ALL') return null;
    return categories.find((c) => c.id === selectedCategory) || null;
  }, [categories, selectedCategory]);

  // Category-specific Monthly Series Data
  const categoryMonthlySeries = useMemo(() => {
    let prevCatAmount: number | null = null;

    return filteredMonths.map((m) => {
      const isTotal = selectedCategory === 'ALL';
      const amountCents = isTotal ? m.purchasesCents : m.categorySpend[selectedCategory] || 0;
      const count = isTotal ? m.txCount : m.categoryTxCount[selectedCategory] || 0;

      let momPercent: number | null = null;
      let momDollarDiff: number | null = null;

      if (prevCatAmount !== null && prevCatAmount > 0) {
        momDollarDiff = amountCents - prevCatAmount;
        momPercent = ((amountCents - prevCatAmount) / prevCatAmount) * 100;
      }

      prevCatAmount = amountCents;

      return {
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        amountCents,
        count,
        creditCardPurchasesCents: m.creditCardPurchasesCents,
        checkingBillsCents: m.checkingBillsCents,
        paymentsCents: m.paymentsCents,
        momPercent,
        momDollarDiff,
        statementIds: m.statementIds
      };
    });
  }, [filteredMonths, selectedCategory]);

  // Max spend for scaling the single-year bar chart
  const maxBarValueInView = useMemo(() => {
    if (selectedCategory === 'ALL') {
      return Math.max(...filteredMonths.map((m) => Math.max(m.purchasesCents, m.paymentsCents)), 10000);
    }
    const maxCat = Math.max(...categoryMonthlySeries.map((s) => s.amountCents), 1000);
    return maxCat;
  }, [selectedCategory, filteredMonths, categoryMonthlySeries]);

  // Single-Year KPI Metrics
  const categoryMetrics = useMemo(() => {
    if (categoryMonthlySeries.length === 0) {
      return {
        avgSpendCents: 0,
        totalSpendCents: 0,
        totalCreditCents: 0,
        totalCheckingCents: 0,
        totalPaymentsCents: 0,
        peakMonth: null as (typeof categoryMonthlySeries)[0] | null,
        lowestMonth: null as (typeof categoryMonthlySeries)[0] | null,
        latestMomPercent: null as number | null,
        latestMomDiff: null as number | null
      };
    }

    const totalSpendCents = categoryMonthlySeries.reduce((sum, s) => sum + s.amountCents, 0);
    const totalCreditCents = filteredMonths.reduce((sum, m) => sum + m.creditCardPurchasesCents, 0);
    const totalCheckingCents = filteredMonths.reduce((sum, m) => sum + m.checkingBillsCents, 0);
    const totalPaymentsCents = filteredMonths.reduce((sum, m) => sum + m.paymentsCents, 0);
    const avgSpendCents = Math.round(totalSpendCents / categoryMonthlySeries.length);

    let peak = categoryMonthlySeries[0];
    let lowest = categoryMonthlySeries[0];

    for (const s of categoryMonthlySeries) {
      if (s.amountCents > peak.amountCents) peak = s;
      if (s.amountCents < lowest.amountCents && s.amountCents > 0) lowest = s;
    }

    const latest = categoryMonthlySeries[categoryMonthlySeries.length - 1];

    return {
      avgSpendCents,
      totalSpendCents,
      totalCreditCents,
      totalCheckingCents,
      totalPaymentsCents,
      peakMonth: peak,
      lowestMonth: lowest,
      latestMomPercent: latest?.momPercent ?? null,
      latestMomDiff: latest?.momDollarDiff ?? null
    };
  }, [categoryMonthlySeries, filteredMonths]);

  // ==========================================
  // CREDIT CARD COMPARISON ENGINE
  // ==========================================
  // Active Card Object
  const activeCard = useMemo(() => {
    if (selectedCard === 'ALL') return null;
    return availableCards.find((c) => c.name === selectedCard) || null;
  }, [availableCards, selectedCard]);

  // Card-specific Monthly Series Data
  const cardMonthlySeries = useMemo(() => {
    let prevCardAmount: number | null = null;

    return filteredMonths.map((m) => {
      const isTotal = selectedCard === 'ALL';
      const amountCents = isTotal ? m.creditCardPurchasesCents : m.cardSpend[selectedCard] || 0;
      const count = isTotal
        ? Object.values(m.cardTxCount).reduce((a, b) => a + b, 0)
        : m.cardTxCount[selectedCard] || 0;
      const paymentsCents = isTotal ? m.paymentsCents : m.cardPayments[selectedCard] || 0;

      let momPercent: number | null = null;
      let momDollarDiff: number | null = null;

      if (prevCardAmount !== null && prevCardAmount > 0) {
        momDollarDiff = amountCents - prevCardAmount;
        momPercent = ((amountCents - prevCardAmount) / prevCardAmount) * 100;
      }

      prevCardAmount = amountCents;

      return {
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        amountCents,
        count,
        paymentsCents,
        cardSpend: m.cardSpend,
        momPercent,
        momDollarDiff,
        statementIds: m.statementIds
      };
    });
  }, [filteredMonths, selectedCard]);

  const maxCardBarValue = useMemo(() => {
    if (selectedCard === 'ALL') {
      return Math.max(...filteredMonths.map((m) => m.creditCardPurchasesCents), 1000);
    }
    return Math.max(...cardMonthlySeries.map((s) => s.amountCents), 1000);
  }, [selectedCard, filteredMonths, cardMonthlySeries]);

  const cardMetrics = useMemo(() => {
    if (cardMonthlySeries.length === 0) {
      return {
        avgSpendCents: 0,
        totalSpendCents: 0,
        totalPaymentsCents: 0,
        peakMonth: null as (typeof cardMonthlySeries)[0] | null,
        lowestMonth: null as (typeof cardMonthlySeries)[0] | null,
        latestMomPercent: null as number | null,
        latestMomDiff: null as number | null,
        topCardName: 'None',
        topCardSpend: 0
      };
    }

    const totalSpendCents = cardMonthlySeries.reduce((sum, s) => sum + s.amountCents, 0);
    const totalPaymentsCents = cardMonthlySeries.reduce((sum, s) => sum + s.paymentsCents, 0);
    const avgSpendCents = Math.round(totalSpendCents / cardMonthlySeries.length);

    let peak = cardMonthlySeries[0];
    let lowest = cardMonthlySeries[0];

    for (const s of cardMonthlySeries) {
      if (s.amountCents > (peak?.amountCents || 0)) peak = s;
      if (s.amountCents < (lowest?.amountCents || Infinity) && s.amountCents > 0) lowest = s;
    }

    const latest = cardMonthlySeries[cardMonthlySeries.length - 1];

    // Find top card in selected year
    const cardTotals: Record<string, number> = {};
    for (const m of filteredMonths) {
      for (const [cName, amt] of Object.entries(m.cardSpend)) {
        cardTotals[cName] = (cardTotals[cName] || 0) + amt;
      }
    }
    const sortedCards = Object.entries(cardTotals).sort((a, b) => b[1] - a[1]);
    const topCardName = sortedCards[0]?.[0] || 'None';
    const topCardSpend = sortedCards[0]?.[1] || 0;

    return {
      totalSpendCents,
      avgSpendCents,
      totalPaymentsCents,
      peakMonth: peak,
      lowestMonth: lowest,
      latestMomPercent: latest?.momPercent ?? null,
      latestMomDiff: latest?.momDollarDiff ?? null,
      topCardName,
      topCardSpend
    };
  }, [cardMonthlySeries, filteredMonths]);

  // ==========================================
  // YEAR-OVER-YEAR (YoY) COMPARISON ENGINE
  // ==========================================
  const primaryYearNum = useMemo(() => parseInt(selectedYear, 10) || availableYears[0] || 2026, [selectedYear, availableYears]);
  const compareYearNum = useMemo(() => parseInt(compareYear, 10) || availableYears[1] || 2025, [compareYear, availableYears]);

  const yoyMonthlyComparison = useMemo(() => {
    const isTotal = selectedCategory === 'ALL';

    return Array.from({ length: 12 }, (_, idx) => {
      const monthNum = idx + 1;
      const monthPad = monthNum.toString().padStart(2, '0');
      const monthName = MONTH_NAMES[idx];

      const key1 = `${primaryYearNum}-${monthPad}`;
      const key2 = `${compareYearNum}-${monthPad}`;

      const m1 = monthlyDataList.find((m) => m.monthKey === key1);
      const m2 = monthlyDataList.find((m) => m.monthKey === key2);

      const spend1 = m1 ? (isTotal ? m1.purchasesCents : m1.categorySpend[selectedCategory] || 0) : 0;
      const spend2 = m2 ? (isTotal ? m2.purchasesCents : m2.categorySpend[selectedCategory] || 0) : 0;

      let diffCents = spend1 - spend2;
      let diffPercent: number | null = null;
      if (spend2 > 0) {
        diffPercent = ((spend1 - spend2) / spend2) * 100;
      }

      return {
        monthNum,
        monthName,
        monthLabel: `${monthName}`,
        key1,
        key2,
        spend1,
        spend2,
        diffCents,
        diffPercent,
        hasData: spend1 > 0 || spend2 > 0
      };
    });
  }, [primaryYearNum, compareYearNum, monthlyDataList, selectedCategory]);

  const maxYoySpend = useMemo(() => {
    const max = Math.max(...yoyMonthlyComparison.map((m) => Math.max(m.spend1, m.spend2)), 1000);
    return max;
  }, [yoyMonthlyComparison]);

  const yoySummary = useMemo(() => {
    const totalYear1 = yoyMonthlyComparison.reduce((sum, m) => sum + m.spend1, 0);
    const totalYear2 = yoyMonthlyComparison.reduce((sum, m) => sum + m.spend2, 0);
    const diffCents = totalYear1 - totalYear2;
    const diffPercent = totalYear2 > 0 ? ((totalYear1 - totalYear2) / totalYear2) * 100 : null;

    // Matching months with spend in both
    const matchingMonths = yoyMonthlyComparison.filter((m) => m.spend1 > 0 && m.spend2 > 0);
    const matchingYear1 = matchingMonths.reduce((sum, m) => sum + m.spend1, 0);
    const matchingYear2 = matchingMonths.reduce((sum, m) => sum + m.spend2, 0);
    const matchingDiffPercent = matchingYear2 > 0 ? ((matchingYear1 - matchingYear2) / matchingYear2) * 100 : null;

    return {
      totalYear1,
      totalYear2,
      diffCents,
      diffPercent,
      matchingCount: matchingMonths.length,
      matchingDiffPercent
    };
  }, [yoyMonthlyComparison]);

  const handleMonthClick = (monthKey: string) => {
    setSelectedStatementId(`MONTH:${monthKey}`);
    if (selectedCategory !== 'ALL') {
      setSelectedCategoryFilter(selectedCategory);
    } else {
      setSelectedCategoryFilter('ALL');
    }
    setSelectedTypeFilter('ALL');
    onNavigate?.('transactions');
  };

  return (
    <div className="page-wrapper">
      {/* Header & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={24} color="var(--brand-primary)" />
            <h1 className="page-title" style={{ margin: 0 }}>Monthly Spending Tracker</h1>
          </div>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
            Multi-year spending velocity, credit card breakdown, and Year-over-Year (YoY) comparison.
          </p>
        </div>

        {/* Global Multi-Year & Dimension Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Mode Switcher: Single Year vs By Credit Card vs YoY Comparison */}
          <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            <button
              className={`btn btn-sm ${viewMode === 'SINGLE' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
              onClick={() => setViewMode('SINGLE')}
            >
              <Layers size={13} /> Single Year
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'CARDS' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
              onClick={() => setViewMode('CARDS')}
            >
              <CreditCard size={13} /> By Credit Card
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'YOY' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
              onClick={() => setViewMode('YOY')}
            >
              <GitCompare size={13} /> YoY Comparison
            </button>
          </div>

          {/* Year Picker */}
          {viewMode !== 'YOY' ? (
            <select
              className="select-control"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{ minWidth: '120px', fontWeight: 600 }}
            >
              {availableYears.map((y) => (
                <option key={y} value={y.toString()}>
                  {y} {y === availableYears[0] ? '(Current)' : ''}
                </option>
              ))}
              <option value="ALL">All Years Timeline</option>
            </select>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                className="select-control"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                style={{ width: '100px', fontWeight: 600 }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y.toString()}>
                    {y}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>vs</span>
              <select
                className="select-control"
                value={compareYear}
                onChange={(e) => setCompareYear(e.target.value)}
                style={{ width: '100px', fontWeight: 600 }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y.toString()}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Outflow Source Toggle (In Single Year Mode) */}
          {viewMode === 'SINGLE' && (
            <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
              <button
                className={`btn btn-sm ${sourceFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
                onClick={() => setSourceFilter('ALL')}
              >
                All Outflows
              </button>
              <button
                className={`btn btn-sm ${sourceFilter === 'CREDIT' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
                onClick={() => setSourceFilter('CREDIT')}
              >
                <CreditCard size={12} /> Cards
              </button>
              <button
                className={`btn btn-sm ${sourceFilter === 'CHECKING' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
                onClick={() => setSourceFilter('CHECKING')}
              >
                <Landmark size={12} /> Checking
              </button>
            </div>
          )}

          <button className="btn btn-secondary btn-sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} /> Add Bill
          </button>
        </div>
      </div>

      {/* KPI Cards (Dynamically reflects Single Year, By Credit Card, or YoY Comparison) */}
      {viewMode === 'SINGLE' ? (
        <div className="metrics-grid" style={{ marginBottom: '1.75rem' }}>
          {/* Metric 1: Average Monthly Spend */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">
                {activeCategory ? `Avg Monthly ${activeCategory.name}` : `Avg Monthly Outflow (${selectedYear})`}
              </span>
              <DollarSign size={18} color={activeCategory?.color || 'var(--brand-primary)'} />
            </div>
            <div className="metric-value">{formatCurrency(categoryMetrics.avgSpendCents)}</div>
            <div className="metric-subtitle">
              <span>
                {activeCategory
                  ? `Total ${formatCurrency(categoryMetrics.totalSpendCents)} in ${selectedYear}`
                  : `${formatCurrency(categoryMetrics.totalCreditCents)} cards • ${formatCurrency(categoryMetrics.totalCheckingCents)} checking`}
              </span>
            </div>
          </div>

          {/* Metric 2: Month-over-Month Shift */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">
                {activeCategory ? `${activeCategory.name} MoM Shift` : 'Latest MoM Shift'}
              </span>
              {categoryMetrics.latestMomPercent !== null && categoryMetrics.latestMomPercent > 0 ? (
                <ArrowUpRight size={18} color="var(--danger)" />
              ) : (
                <ArrowDownRight size={18} color="var(--success)" />
              )}
            </div>
            <div
              className="metric-value"
              style={{
                color:
                  categoryMetrics.latestMomPercent === null
                    ? 'var(--text-primary)'
                    : categoryMetrics.latestMomPercent > 0
                    ? 'var(--danger)'
                    : 'var(--success)'
              }}
            >
              {categoryMetrics.latestMomPercent !== null
                ? `${categoryMetrics.latestMomPercent > 0 ? '+' : ''}${categoryMetrics.latestMomPercent.toFixed(1)}%`
                : 'N/A'}
            </div>
            <div className="metric-subtitle">
              <span>
                {categoryMetrics.latestMomDiff !== null
                  ? `${categoryMetrics.latestMomDiff > 0 ? '+' : ''}${formatCurrency(categoryMetrics.latestMomDiff)} vs prev month`
                  : 'First recorded cycle'}
              </span>
            </div>
          </div>

          {/* Metric 3: Highest Spend Month */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">Peak Month ({selectedYear})</span>
              <TrendingUp size={18} color="var(--warning)" />
            </div>
            <div className="metric-value" style={{ color: 'var(--warning)' }}>
              {categoryMetrics.peakMonth ? formatCurrency(categoryMetrics.peakMonth.amountCents) : '$0.00'}
            </div>
            <div className="metric-subtitle">
              <span>{categoryMetrics.peakMonth ? categoryMetrics.peakMonth.monthLabel : 'None'}</span>
            </div>
          </div>

          {/* Metric 4: Total Outflow */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">
                {activeCategory ? `Total ${activeCategory.name} (${selectedYear})` : `Annual Outflow (${selectedYear})`}
              </span>
              {activeCategory ? (
                <Receipt size={18} color={activeCategory.color || 'var(--brand-primary)'} />
              ) : (
                <CheckCircle2 size={18} color="var(--success)" />
              )}
            </div>
            <div className="metric-value" style={{ color: activeCategory ? 'var(--text-primary)' : 'var(--brand-primary)' }}>
              {formatCurrency(categoryMetrics.totalSpendCents)}
            </div>
            <div className="metric-subtitle">
              <span>
                {activeCategory
                  ? `In ${categoryMonthlySeries.reduce((s, m) => s + m.count, 0)} transactions`
                  : `Across ${filteredMonths.length} tracked months`}
              </span>
            </div>
          </div>
        </div>
      ) : viewMode === 'CARDS' ? (
        /* BY CREDIT CARD KPI CARDS */
        <div className="metrics-grid" style={{ marginBottom: '1.75rem' }}>
          {/* Card Metric 1: Total or Active Card Spend */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">
                {activeCard ? `${activeCard.name} Spend (${selectedYear})` : `Total Card Outflow (${selectedYear})`}
              </span>
              <CreditCard size={18} color={activeCard?.color || 'var(--brand-primary)'} />
            </div>
            <div className="metric-value" style={{ color: activeCard?.color || 'var(--brand-primary)' }}>
              {formatCurrency(cardMetrics.totalSpendCents)}
            </div>
            <div className="metric-subtitle">
              <span>
                {activeCard
                  ? `Avg ${formatCurrency(cardMetrics.avgSpendCents)} / month`
                  : `Across ${availableCards.length} credit cards in ${selectedYear}`}
              </span>
            </div>
          </div>

          {/* Card Metric 2: MoM Shift */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">
                {activeCard ? `${activeCard.name} MoM Shift` : 'Card Outflow MoM Shift'}
              </span>
              {cardMetrics.latestMomPercent !== null && cardMetrics.latestMomPercent > 0 ? (
                <ArrowUpRight size={18} color="var(--danger)" />
              ) : (
                <ArrowDownRight size={18} color="var(--success)" />
              )}
            </div>
            <div
              className="metric-value"
              style={{
                color:
                  cardMetrics.latestMomPercent === null
                    ? 'var(--text-primary)'
                    : cardMetrics.latestMomPercent > 0
                    ? 'var(--danger)'
                    : 'var(--success)'
              }}
            >
              {cardMetrics.latestMomPercent !== null
                ? `${cardMetrics.latestMomPercent > 0 ? '+' : ''}${cardMetrics.latestMomPercent.toFixed(1)}%`
                : 'N/A'}
            </div>
            <div className="metric-subtitle">
              <span>
                {cardMetrics.latestMomDiff !== null
                  ? `${cardMetrics.latestMomDiff > 0 ? '+' : ''}${formatCurrency(cardMetrics.latestMomDiff)} vs prev month`
                  : 'First recorded cycle'}
              </span>
            </div>
          </div>

          {/* Card Metric 3: Peak Month */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">Peak Month ({selectedYear})</span>
              <TrendingUp size={18} color="var(--warning)" />
            </div>
            <div className="metric-value" style={{ color: 'var(--warning)' }}>
              {cardMetrics.peakMonth ? formatCurrency(cardMetrics.peakMonth.amountCents) : '$0.00'}
            </div>
            <div className="metric-subtitle">
              <span>{cardMetrics.peakMonth ? cardMetrics.peakMonth.monthLabel : 'None'}</span>
            </div>
          </div>

          {/* Card Metric 4: Top Card or Average Spend */}
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">Top Spending Card ({selectedYear})</span>
              <Sparkles size={18} color="var(--brand-primary)" />
            </div>
            <div className="metric-value" style={{ fontSize: '1.25rem' }}>
              {cardMetrics.topCardName}
            </div>
            <div className="metric-subtitle">
              <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>
                {formatCurrency(cardMetrics.topCardSpend)} in {selectedYear}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* YoY Summary KPI Cards */
        <div className="metrics-grid" style={{ marginBottom: '1.75rem' }}>
          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">{primaryYearNum} Total Outflow</span>
              <DollarSign size={18} color="var(--brand-primary)" />
            </div>
            <div className="metric-value" style={{ color: 'var(--brand-primary)' }}>
              {formatCurrency(yoySummary.totalYear1)}
            </div>
            <div className="metric-subtitle">
              <span>Primary Year Selected</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">{compareYearNum} Total Outflow</span>
              <DollarSign size={18} color="#94a3b8" />
            </div>
            <div className="metric-value" style={{ color: '#94a3b8' }}>
              {formatCurrency(yoySummary.totalYear2)}
            </div>
            <div className="metric-subtitle">
              <span>Comparison Year</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">Year-over-Year Delta</span>
              {yoySummary.diffPercent !== null && yoySummary.diffPercent > 0 ? (
                <ArrowUpRight size={18} color="var(--danger)" />
              ) : (
                <ArrowDownRight size={18} color="var(--success)" />
              )}
            </div>
            <div
              className="metric-value"
              style={{
                color:
                  yoySummary.diffPercent === null
                    ? 'var(--text-primary)'
                    : yoySummary.diffPercent > 0
                    ? 'var(--danger)'
                    : 'var(--success)'
              }}
            >
              {yoySummary.diffPercent !== null
                ? `${yoySummary.diffPercent > 0 ? '+' : ''}${yoySummary.diffPercent.toFixed(1)}%`
                : 'N/A'}
            </div>
            <div className="metric-subtitle">
              <span>
                {yoySummary.diffCents > 0 ? '+' : ''}{formatCurrency(yoySummary.diffCents)} ({primaryYearNum} vs {compareYearNum})
              </span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label-row">
              <span className="metric-label">Matching Months Velocity</span>
              <GitCompare size={18} color="var(--brand-primary)" />
            </div>
            <div className="metric-value">
              {yoySummary.matchingDiffPercent !== null
                ? `${yoySummary.matchingDiffPercent > 0 ? '+' : ''}${yoySummary.matchingDiffPercent.toFixed(1)}%`
                : 'N/A'}
            </div>
            <div className="metric-subtitle">
              <span>Across {yoySummary.matchingCount} overlapping month cycles</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Monthly Bar Chart Card */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {viewMode === 'CARDS' && activeCard ? (
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: activeCard.color || 'var(--brand-primary)'
                  }}
                />
              ) : viewMode === 'SINGLE' && activeCategory ? (
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: activeCategory.color || 'var(--brand-primary)'
                  }}
                />
              ) : null}
              <h2 className="card-title" style={{ margin: 0 }}>
                {viewMode === 'CARDS'
                  ? activeCard
                    ? `${activeCard.name}: Monthly Spending Comparison (${selectedYear})`
                    : `Credit Card Spending Comparison (${selectedYear})`
                  : viewMode === 'YOY'
                  ? `${activeCategory ? activeCategory.name : 'Total Outflow'}: ${primaryYearNum} vs ${compareYearNum} YoY Comparison`
                  : activeCategory
                  ? `${activeCategory.name}: Monthly Spending Comparison (${selectedYear})`
                  : `Monthly Total Spending & Outflow (${selectedYear})`}
              </h2>
            </div>
            <p className="card-desc" style={{ margin: '4px 0 0 0' }}>
              {viewMode === 'CARDS'
                ? activeCard
                  ? `Viewing month-by-month spending trajectory for ${activeCard.name} • Click any bar to inspect transactions`
                  : 'Comparing month-by-month spending across all your credit cards • Click any card or bar to inspect'
                : viewMode === 'YOY'
                ? `Comparing side-by-side matching months for ${primaryYearNum} (Blue) vs ${compareYearNum} (Slate)`
                : activeCategory
                ? `Comparing ${activeCategory.name} expenses month-over-month • Click any bar to view that month's transactions`
                : 'Comparing total monthly spending across all cycles • Click any bar to inspect'}
            </p>
          </div>

          {/* Filter Controls for active mode */}
          {viewMode === 'CARDS' ? (
            /* Card Selector Dropdown & Reset */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Credit Card:</span>
              <select
                className="select-control"
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                style={{
                  minWidth: '220px',
                  fontWeight: 600,
                  borderLeft: activeCard ? `4px solid ${activeCard.color}` : undefined
                }}
              >
                <option value="ALL">⭐ All Credit Cards Combined</option>
                {availableCards.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} {c.last4 ? `(*${c.last4})` : ''}
                  </option>
                ))}
              </select>

              {selectedCard !== 'ALL' && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedCard('ALL')}
                  title="Reset to All Credit Cards"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          ) : viewMode === 'SINGLE' ? (
            /* Category Selector Dropdown & Reset */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Category:</span>
              <select
                className="select-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  minWidth: '220px',
                  fontWeight: 600,
                  borderLeft: activeCategory ? `4px solid ${activeCategory.color}` : undefined
                }}
              >
                <option value="ALL">⭐ All Categories (Total Outflow)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {selectedCategory !== 'ALL' && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedCategory('ALL')}
                  title="Reset to Total Outflow chart"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* 1-Click Filter Pills */}
        {viewMode === 'CARDS' ? (
          /* Credit Card Pills */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1.25rem 1rem 1.25rem',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${selectedCard === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
              onClick={() => setSelectedCard('ALL')}
            >
              All Credit Cards Combined
            </button>
            {availableCards.map((c) => {
              const isSelected = selectedCard === c.name;
              const cardYearSpend = filteredMonths.reduce((sum, m) => sum + (m.cardSpend[c.name] || 0), 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderColor: isSelected ? undefined : 'var(--border-subtle)'
                  }}
                  onClick={() => setSelectedCard(c.name)}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: c.color
                    }}
                  />
                  <span>{c.name}</span>
                  {cardYearSpend > 0 && (
                    <span style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                      ({formatCurrency(cardYearSpend)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : viewMode === 'SINGLE' ? (
          /* Category Pill Buttons */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1.25rem 1rem 1.25rem',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${selectedCategory === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
              onClick={() => setSelectedCategory('ALL')}
            >
              All Categories
            </button>
            {categories.map((c) => {
              const isSelected = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderColor: isSelected ? undefined : 'var(--border-subtle)'
                  }}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: c.color || '#94a3b8'
                    }}
                  />
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Visual Monthly Charts */}
        {viewMode === 'CARDS' ? (
          /* BY CREDIT CARD VISUAL CHART */
          filteredMonths.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No credit card spending recorded for year {selectedYear}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', padding: '1.25rem 0.5rem' }}>
              {/* Color legend when all cards are combined */}
              {selectedCard === 'ALL' && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '0 1rem 1rem 1rem', fontSize: '0.75rem' }}>
                  {availableCards.map((c) => (
                    <div
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                      onClick={() => setSelectedCard(c.name)}
                      title={`Click to focus chart on ${c.name}`}
                    >
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: c.color }} />
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', minHeight: '260px', padding: '0 1rem' }}>
                {cardMonthlySeries.map((s) => {
                  const isTotal = selectedCard === 'ALL';
                  const isHovered = hoveredMonth === s.monthKey;
                  const barColor = activeCard?.color || 'var(--brand-primary)';

                  const totalBarHeight = Math.max(
                    s.amountCents > 0 ? 10 : 4,
                    Math.round((s.amountCents / maxCardBarValue) * 180)
                  );

                  return (
                    <div
                      key={s.monthKey}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: '1 1 65px',
                        minWidth: '60px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease'
                      }}
                      onClick={() => handleMonthClick(s.monthKey)}
                      onMouseEnter={() => setHoveredMonth(s.monthKey)}
                      onMouseLeave={() => setHoveredMonth(null)}
                    >
                      {/* Amount label */}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: isHovered ? barColor : 'var(--text-secondary)',
                          marginBottom: '6px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatCurrency(s.amountCents)}
                      </span>

                      {/* Bars Container */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: '4px',
                          height: '180px',
                          background: isHovered ? 'var(--bg-surface-raised)' : 'transparent',
                          padding: '4px',
                          borderRadius: 'var(--radius-md)',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {isTotal ? (
                          /* Stacked multi-color cards bar */
                          <div
                            style={{
                              width: '24px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              height: `${totalBarHeight}px`,
                              borderRadius: '4px 4px 0 0',
                              overflow: 'hidden'
                            }}
                            title={`Total Card Spend: ${formatCurrency(s.amountCents)}\n${availableCards
                              .map((c) => `${c.name}: ${formatCurrency(s.cardSpend[c.name] || 0)}`)
                              .join('\n')}`}
                          >
                            {availableCards.map((c, idx) => {
                              const amt = s.cardSpend[c.name] || 0;
                              if (amt === 0) return null;
                              const segHeight = Math.max(2, Math.round((amt / maxCardBarValue) * 180));
                              return (
                                <div
                                  key={c.id}
                                  style={{
                                    width: '100%',
                                    height: `${segHeight}px`,
                                    backgroundColor: c.color,
                                    transition: 'height 0.2s ease'
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          /* Single Focused Card Bar */
                          <div
                            style={{
                              width: '24px',
                              height: `${totalBarHeight}px`,
                              backgroundColor: barColor,
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.3s ease, filter 0.2s ease',
                              filter: isHovered ? 'brightness(1.2)' : 'none'
                            }}
                            title={`${activeCard?.name}: ${formatCurrency(s.amountCents)} (${s.count} transactions)`}
                          />
                        )}
                      </div>

                      {/* Month Label */}
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: isHovered ? barColor : 'var(--text-muted)',
                          marginTop: '8px',
                          textAlign: 'center'
                        }}
                      >
                        {s.monthLabel}
                      </span>

                      {/* MoM % Badge */}
                      {s.momPercent !== null ? (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-sm)',
                            marginTop: '4px',
                            backgroundColor: s.momPercent > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: s.momPercent > 0 ? 'var(--danger)' : 'var(--success)'
                          }}
                        >
                          {s.momPercent > 0 ? '↑+' : '↓'}{s.momPercent.toFixed(0)}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'transparent', marginTop: '4px' }}>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : viewMode === 'SINGLE' ? (
          /* SINGLE YEAR CATEGORY CHART */
          filteredMonths.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No statement or spending data recorded for year {selectedYear}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', padding: '1.25rem 0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', minHeight: '260px', padding: '0 1rem' }}>
                {categoryMonthlySeries.map((s) => {
                  const isTotal = selectedCategory === 'ALL';
                  const isHovered = hoveredMonth === s.monthKey;
                  const barColor = activeCategory?.color || 'var(--brand-primary)';

                  const totalBarHeight = Math.max(
                    s.amountCents > 0 ? 10 : 4,
                    Math.round((s.amountCents / maxBarValueInView) * 180)
                  );
                  const checkingHeight = isTotal ? Math.round((s.checkingBillsCents / maxBarValueInView) * 180) : 0;
                  const creditHeight = isTotal
                    ? Math.max(s.creditCardPurchasesCents > 0 ? 6 : 0, totalBarHeight - checkingHeight)
                    : totalBarHeight;
                  const paymentHeight = isTotal ? Math.max(6, Math.round((s.paymentsCents / maxBarValueInView) * 180)) : 0;

                  return (
                    <div
                      key={s.monthKey}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: '1 1 65px',
                        minWidth: '60px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease'
                      }}
                      onClick={() => handleMonthClick(s.monthKey)}
                      onMouseEnter={() => setHoveredMonth(s.monthKey)}
                      onMouseLeave={() => setHoveredMonth(null)}
                    >
                      {/* Amount label */}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: isHovered ? barColor : 'var(--text-secondary)',
                          marginBottom: '6px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatCurrency(s.amountCents)}
                      </span>

                      {/* Bars Container */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: '4px',
                          height: '180px',
                          background: isHovered ? 'var(--bg-surface-raised)' : 'transparent',
                          padding: '4px',
                          borderRadius: 'var(--radius-md)',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {isTotal ? (
                          <div
                            style={{
                              width: '22px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              height: `${totalBarHeight}px`
                            }}
                            title={`Total Outflow: ${formatCurrency(s.amountCents)} (Cards: ${formatCurrency(s.creditCardPurchasesCents)}, Checking: ${formatCurrency(s.checkingBillsCents)})`}
                          >
                            {checkingHeight > 0 && (
                              <div
                                style={{
                                  width: '100%',
                                  height: `${checkingHeight}px`,
                                  backgroundColor: '#06b6d4',
                                  borderRadius: '4px 4px 0 0'
                                }}
                              />
                            )}
                            <div
                              style={{
                                width: '100%',
                                height: `${creditHeight}px`,
                                backgroundColor: 'var(--brand-primary)',
                                borderRadius: checkingHeight > 0 ? '0 0 0 0' : '4px 4px 0 0'
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: '24px',
                              height: `${totalBarHeight}px`,
                              backgroundColor: barColor,
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.3s ease, filter 0.2s ease',
                              filter: isHovered ? 'brightness(1.2)' : 'none'
                            }}
                            title={`${activeCategory?.name}: ${formatCurrency(s.amountCents)} (${s.count} transactions)`}
                          />
                        )}

                        {isTotal && (
                          <div
                            style={{
                              width: '18px',
                              height: `${paymentHeight}px`,
                              backgroundColor: 'var(--success)',
                              borderRadius: '4px 4px 0 0',
                              opacity: 0.85,
                              transition: 'height 0.3s ease, filter 0.2s ease',
                              filter: isHovered ? 'brightness(1.2)' : 'none'
                            }}
                            title={`Payments: ${formatCurrency(s.paymentsCents)}`}
                          />
                        )}
                      </div>

                      {/* Month Label */}
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: isHovered ? barColor : 'var(--text-muted)',
                          marginTop: '8px',
                          textAlign: 'center'
                        }}
                      >
                        {s.monthLabel}
                      </span>

                      {/* MoM % Badge */}
                      {s.momPercent !== null ? (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-sm)',
                            marginTop: '4px',
                            backgroundColor: s.momPercent > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: s.momPercent > 0 ? 'var(--danger)' : 'var(--success)'
                          }}
                        >
                          {s.momPercent > 0 ? '↑+' : '↓'}{s.momPercent.toFixed(0)}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'transparent', marginTop: '4px' }}>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* YEAR-OVER-YEAR (YoY) DUAL-BAR COMPARISON CHART */
          <div style={{ overflowX: 'auto', padding: '1.25rem 0.5rem' }}>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1.25rem', paddingRight: '1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: activeCategory?.color || 'var(--brand-primary)' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{primaryYearNum}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#64748b' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{compareYearNum}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', minHeight: '260px', padding: '0 1rem' }}>
              {yoyMonthlyComparison.map((m) => {
                const height1 = m.spend1 > 0 ? Math.max(8, Math.round((m.spend1 / maxYoySpend) * 180)) : 0;
                const height2 = m.spend2 > 0 ? Math.max(8, Math.round((m.spend2 / maxYoySpend) * 180)) : 0;
                const barColor = activeCategory?.color || 'var(--brand-primary)';

                return (
                  <div
                    key={m.monthNum}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: '1 1 65px',
                      minWidth: '60px'
                    }}
                  >
                    {/* Amount label for Year 1 */}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: m.spend1 > 0 ? barColor : 'var(--text-muted)',
                        marginBottom: '6px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {m.spend1 > 0 ? formatCurrency(m.spend1) : '—'}
                    </span>

                    {/* Dual Bars Container */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '4px',
                        height: '180px',
                        padding: '4px',
                        borderRadius: 'var(--radius-md)'
                      }}
                    >
                      {/* Year 1 Bar (Primary) */}
                      <div
                        style={{
                          width: '18px',
                          height: `${height1}px`,
                          backgroundColor: barColor,
                          borderRadius: '3px 3px 0 0',
                          cursor: m.spend1 > 0 ? 'pointer' : 'default'
                        }}
                        onClick={() => m.spend1 > 0 && handleMonthClick(m.key1)}
                        title={`${primaryYearNum} ${m.monthName}: ${formatCurrency(m.spend1)}`}
                      />

                      {/* Year 2 Bar (Comparison) */}
                      <div
                        style={{
                          width: '18px',
                          height: `${height2}px`,
                          backgroundColor: '#64748b',
                          borderRadius: '3px 3px 0 0',
                          cursor: m.spend2 > 0 ? 'pointer' : 'default'
                        }}
                        onClick={() => m.spend2 > 0 && handleMonthClick(m.key2)}
                        title={`${compareYearNum} ${m.monthName}: ${formatCurrency(m.spend2)}`}
                      />
                    </div>

                    {/* Month Label */}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginTop: '8px',
                        textAlign: 'center'
                      }}
                    >
                      {m.monthName}
                    </span>

                    {/* YoY % Change Badge */}
                    {m.diffPercent !== null ? (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-sm)',
                          marginTop: '4px',
                          backgroundColor: m.diffPercent > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: m.diffPercent > 0 ? 'var(--danger)' : 'var(--success)'
                        }}
                      >
                        {m.diffPercent > 0 ? '↑+' : '↓'}{m.diffPercent.toFixed(0)}%
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: 'transparent', marginTop: '4px' }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Matrix Table Card */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="card-title">
              {viewMode === 'CARDS'
                ? `Credit Card Spending Comparison Matrix (${selectedYear})`
                : viewMode === 'YOY'
                ? `Category Spending: ${primaryYearNum} vs ${compareYearNum} Year-over-Year Shift`
                : singleMatrixMode === 'CARDS'
                ? `Credit Card Spending Comparison Matrix (${selectedYear})`
                : `Category Spending Comparison Matrix (${selectedYear})`}
            </h2>
            <p className="card-desc">
              {viewMode === 'CARDS' || (viewMode === 'SINGLE' && singleMatrixMode === 'CARDS')
                ? 'Detailed breakdown of monthly spend per credit card • Click any card row to plot its monthly comparison chart'
                : viewMode === 'YOY'
                ? `Detailed category breakdown and dollar change between ${primaryYearNum} and ${compareYearNum}`
                : 'Detailed monthly spend per category • Click any row to plot its comparison chart'}
            </p>
          </div>

          {/* Toggle between Category Matrix and Credit Card Matrix when in SINGLE mode */}
          {viewMode === 'SINGLE' && (
            <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
              <button
                className={`btn btn-sm ${singleMatrixMode === 'CATEGORIES' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
                onClick={() => setSingleMatrixMode('CATEGORIES')}
              >
                <Layers size={13} /> Category Matrix
              </button>
              <button
                className={`btn btn-sm ${singleMatrixMode === 'CARDS' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}
                onClick={() => setSingleMatrixMode('CARDS')}
              >
                <CreditCard size={13} /> Credit Card Matrix
              </button>
            </div>
          )}
        </div>

        {viewMode === 'CARDS' || (viewMode === 'SINGLE' && singleMatrixMode === 'CARDS') ? (
          /* CREDIT CARD COMPARISON MATRIX TABLE */
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Credit Card (Click to Chart)</th>
                  {filteredMonths.map((m) => (
                    <th key={m.monthKey} style={{ textAlign: 'right' }}>
                      {m.monthLabel}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Total ({selectedYear})</th>
                  <th style={{ textAlign: 'right' }}>% Share</th>
                </tr>
              </thead>
              <tbody>
                {availableCards.map((card) => {
                  const totalCardSpend = filteredMonths.reduce(
                    (sum, m) => sum + (m.cardSpend[card.name] || 0),
                    0
                  );

                  if (totalCardSpend === 0) return null;

                  const totalAllCardsSpend = filteredMonths.reduce(
                    (sum, m) => sum + m.creditCardPurchasesCents,
                    0
                  );
                  const sharePct = totalAllCardsSpend > 0 ? (totalCardSpend / totalAllCardsSpend) * 100 : 0;
                  const isSelected = selectedCard === card.name;

                  return (
                    <tr
                      key={card.id}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--bg-surface-raised)' : 'transparent',
                        borderLeft: isSelected ? `4px solid ${card.color}` : undefined,
                        transition: 'background-color 0.15s ease'
                      }}
                      onClick={() => {
                        if (viewMode !== 'CARDS') setViewMode('CARDS');
                        setSelectedCard(card.name);
                        window.scrollTo({ top: 120, behavior: 'smooth' });
                      }}
                      title={`Click to plot ${card.name} monthly comparison chart above`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: card.color
                              }}
                            />
                            <div>
                              <span style={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--brand-primary)' : 'inherit' }}>
                                {card.name}
                              </span>
                              {card.last4 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px', fontFamily: 'var(--font-mono)' }}>
                                  (*{card.last4})
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                              Active Chart
                            </span>
                          )}
                        </div>
                      </td>

                      {filteredMonths.map((m) => {
                        const amount = m.cardSpend[card.name] || 0;
                        return (
                          <td key={m.monthKey} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {amount > 0 ? formatCurrency(amount) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        );
                      })}

                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {formatCurrency(totalCardSpend)}
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {sharePct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}

                {/* Credit Cards Monthly Totals Row */}
                <tr
                  style={{
                    borderTop: '2px solid var(--border-subtle)',
                    backgroundColor: selectedCard === 'ALL' ? 'var(--bg-surface-raised)' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedCard('ALL');
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  title="Click to view all cards combined comparison chart"
                >
                  <td style={{ fontWeight: 700 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Total Credit Card Outflow ({selectedYear})</span>
                      {selectedCard === 'ALL' && (
                        <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                          Active Chart
                        </span>
                      )}
                    </div>
                  </td>
                  {filteredMonths.map((m) => (
                    <td key={m.monthKey} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                      {formatCurrency(m.creditCardPurchasesCents)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                    {formatCurrency(
                      filteredMonths.reduce((sum, m) => sum + m.creditCardPurchasesCents, 0)
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                    100.0%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : viewMode === 'SINGLE' ? (
          /* SINGLE YEAR CATEGORY MATRIX TABLE */
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category (Click to Chart)</th>
                  {filteredMonths.map((m) => (
                    <th key={m.monthKey} style={{ textAlign: 'right' }}>
                      {m.monthLabel}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Total ({selectedYear})</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const totalCatSpend = filteredMonths.reduce(
                    (sum, m) => sum + (m.categorySpend[cat.id] || 0),
                    0
                  );

                  if (totalCatSpend === 0) return null;

                  const isSelected = selectedCategory === cat.id;

                  return (
                    <tr
                      key={cat.id}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--bg-surface-raised)' : 'transparent',
                        borderLeft: isSelected ? `4px solid ${cat.color || 'var(--brand-primary)'}` : undefined,
                        transition: 'background-color 0.15s ease'
                      }}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        window.scrollTo({ top: 120, behavior: 'smooth' });
                      }}
                      title={`Click to plot ${cat.name} monthly comparison chart above`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: cat.color || '#94a3b8'
                              }}
                            />
                            <span style={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--brand-primary)' : 'inherit' }}>
                              {cat.name}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                              Active Chart
                            </span>
                          )}
                        </div>
                      </td>

                      {filteredMonths.map((m) => {
                        const amount = m.categorySpend[cat.id] || 0;
                        return (
                          <td key={m.monthKey} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {amount > 0 ? formatCurrency(amount) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        );
                      })}

                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {formatCurrency(totalCatSpend)}
                      </td>
                    </tr>
                  );
                })}

                {/* Monthly Totals Row */}
                <tr
                  style={{
                    borderTop: '2px solid var(--border-subtle)',
                    backgroundColor: selectedCategory === 'ALL' ? 'var(--bg-surface-raised)' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedCategory('ALL');
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  title="Click to view Total Outflow comparison chart"
                >
                  <td style={{ fontWeight: 700 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Total Outflow ({selectedYear})</span>
                      {selectedCategory === 'ALL' && (
                        <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                          Active Chart
                        </span>
                      )}
                    </div>
                  </td>
                  {filteredMonths.map((m) => (
                    <td key={m.monthKey} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                      {formatCurrency(m.purchasesCents)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                    {formatCurrency(categoryMetrics.totalSpendCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          /* YoY Comparison Table */
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>{primaryYearNum} Spend</th>
                  <th style={{ textAlign: 'right' }}>{compareYearNum} Spend</th>
                  <th style={{ textAlign: 'right' }}>Dollar Difference</th>
                  <th style={{ textAlign: 'right' }}>YoY Shift (%)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const spendYear1 = monthlyDataList
                    .filter((m) => m.year === primaryYearNum)
                    .reduce((sum, m) => sum + (m.categorySpend[cat.id] || 0), 0);

                  const spendYear2 = monthlyDataList
                    .filter((m) => m.year === compareYearNum)
                    .reduce((sum, m) => sum + (m.categorySpend[cat.id] || 0), 0);

                  if (spendYear1 === 0 && spendYear2 === 0) return null;

                  const diff = spendYear1 - spendYear2;
                  const pct = spendYear2 > 0 ? ((spendYear1 - spendYear2) / spendYear2) * 100 : null;

                  return (
                    <tr
                      key={cat.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        window.scrollTo({ top: 120, behavior: 'smooth' });
                      }}
                      title={`Click to plot ${cat.name} in YoY comparison above`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: cat.color || '#94a3b8'
                            }}
                          />
                          <span style={{ fontWeight: 600 }}>{cat.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {spendYear1 > 0 ? formatCurrency(spendYear1) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {spendYear2 > 0 ? formatCurrency(spendYear2) : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'inherit'
                        }}
                      >
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {pct !== null ? (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: pct > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: pct > 0 ? 'var(--danger)' : 'var(--success)'
                            }}
                          >
                            {pct > 0 ? '↑+' : '↓'}{pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Total Outflow Row */}
                <tr style={{ borderTop: '2px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-raised)', fontWeight: 700 }}>
                  <td>Total Annual Outflow</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)', fontSize: '1rem' }}>
                    {formatCurrency(yoySummary.totalYear1)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#94a3b8', fontSize: '1rem' }}>
                    {formatCurrency(yoySummary.totalYear2)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1rem',
                      color: yoySummary.diffCents > 0 ? 'var(--danger)' : 'var(--success)'
                    }}
                  >
                    {yoySummary.diffCents > 0 ? '+' : ''}{formatCurrency(yoySummary.diffCents)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {yoySummary.diffPercent !== null && (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: yoySummary.diffPercent > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: yoySummary.diffPercent > 0 ? 'var(--danger)' : 'var(--success)',
                          fontSize: '0.82rem'
                        }}
                      >
                        {yoySummary.diffPercent > 0 ? '↑+' : '↓'}{yoySummary.diffPercent.toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddExpenseModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  );
};
