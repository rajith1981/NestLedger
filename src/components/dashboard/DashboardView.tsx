import React, { useMemo, useState, useEffect } from 'react';
import {
  CreditCard,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Repeat,
  Tv,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  BarChart3,
  Landmark,
  X,
  Filter
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { detectSubscriptions } from '../../engine/subscriptionDetector';
import { isPaymentOrCreditDesc } from '../../engine/pdfParser';
import { detectCardName } from '../../engine/cardDetector';
import { CategoryPieChart } from './CategoryPieChart';
import { NavTab } from '../layout/Sidebar';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onOpenUpload: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenUpload }) => {
  const {
    statements,
    latestStatement,
    activeStatement,
    activeTransactions,
    allTransactions,
    accounts,
    categories,
    selectedStatementId,
    setSelectedStatementId,
    changeTransactionCategory,
    setSelectedCategoryFilter,
    setSelectedTypeFilter
  } = useStatements();

  // State to filter dashboard views (Category Breakdown & Monthly Trend) to a specific credit card
  const [selectedCardFilter, setSelectedCardFilter] = useState<string | null>(null);

  // Reset card filter when changing selected statement / calendar scope in topbar
  useEffect(() => {
    setSelectedCardFilter(null);
  }, [selectedStatementId]);

  // SPEC 3: Scope strictly to the active statement cycle (fallback to all if no statement exists)
  const currentStatement = activeStatement || latestStatement;
  const currentStatementTxs = activeTransactions;

  const isAggregateView =
    selectedStatementId === 'ALL' ||
    selectedStatementId.startsWith('MONTH:') ||
    selectedStatementId.startsWith('YEAR:');

  const getCardColor = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('amex') || n.includes('american express') || n.includes('gold')) return '#d97706'; // Amber/Gold
    if (n.includes('sapphire') || n.includes('chase')) return '#0d6efd'; // Chase Blue
    if (n.includes('strata')) return '#0284c7'; // Sky Blue
    if (n.includes('costco')) return '#e11d48'; // Red
    if (n.includes('discover')) return '#f97316'; // Orange
    if (n.includes('capital one') || n.includes('venture')) return '#6366f1'; // Indigo
    return '#8b5cf6'; // Violet
  };

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

  // Control whether checking bills (mortgage, direct debits) are included in the Dashboard view
  const [includeChecking, setIncludeChecking] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dashboard_include_checking') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleIncludeChecking = (val: boolean) => {
    setIncludeChecking(val);
    try {
      localStorage.setItem('dashboard_include_checking', val ? 'true' : 'false');
    } catch (e) {}
  };

  const isCheckingTx = (t: { isManual?: boolean; accountType?: string; statementId?: string; accountId?: string }) => {
    return (
      t.isManual ||
      t.accountType === 'CHECKING' ||
      t.statementId === 'manual_checking' ||
      (t.accountId === 'acc_checking' && (!t.statementId || t.statementId === 'manual_checking'))
    );
  };

  // Checking bills amount present in the active period
  const checkingSpendInScope = useMemo(() => {
    return currentStatementTxs
      .filter((tx) => isCheckingTx(tx) && tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT')
      .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
  }, [currentStatementTxs]);

  // Transactions scoped to the active cycle (and optionally filtered by selected card, and checking exclusion if toggled off)
  const scopedCurrentTxs = useMemo(() => {
    let txs = currentStatementTxs;
    if (!includeChecking) {
      txs = txs.filter((tx) => !isCheckingTx(tx));
    }
    if (!selectedCardFilter) return txs;
    return txs.filter((tx) => {
      if (isCheckingTx(tx)) return false;
      return getCardInfoForTx(tx).cardName === selectedCardFilter;
    });
  }, [currentStatementTxs, selectedCardFilter, includeChecking, statementCardMap, accounts]);

  // All transactions across all statements (and optionally filtered by selected card, and checking exclusion if toggled off)
  const scopedAllTxs = useMemo(() => {
    let txs = allTransactions;
    if (!includeChecking) {
      txs = txs.filter((tx) => !isCheckingTx(tx));
    }
    if (!selectedCardFilter) return txs;
    return txs.filter((tx) => {
      if (isCheckingTx(tx)) return false;
      return getCardInfoForTx(tx).cardName === selectedCardFilter;
    });
  }, [allTransactions, selectedCardFilter, includeChecking, statementCardMap, accounts]);

  // Pure Credit Card Breakdown (excludes manual checking expenses)
  // Pure Credit Card Breakdown (excludes manual checking expenses)
  const creditCardsBreakdown = useMemo(() => {
    if (!isAggregateView) return [];

    const cardMap: Record<
      string,
      {
        id: string;
        name: string;
        last4?: string;
        color: string;
        spendCents: number;
        paymentsCents: number;
        txCount: number;
        statementIds: Set<string>;
      }
    > = {};

    // 1. Group from active row transactions in scope
    for (const tx of currentStatementTxs) {
      // Exclude manual checking bills
      if (isCheckingTx(tx)) {
        continue;
      }

      const isPayment = tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription);
      const isFee = tx.feeType !== null && tx.feeType !== undefined;

      const info = getCardInfoForTx(tx);
      const cardName = info.cardName;
      const last4 = info.last4;
      const cardColor = info.color;
      const cardKey = cardName;

      if (!cardMap[cardKey]) {
        cardMap[cardKey] = {
          id: cardKey,
          name: cardName,
          last4: last4 || '',
          color: cardColor,
          spendCents: 0,
          paymentsCents: 0,
          txCount: 0,
          statementIds: new Set<string>()
        };
      } else if (!cardMap[cardKey].last4 && last4) {
        cardMap[cardKey].last4 = last4;
      }

      const cardEntry = cardMap[cardKey];
      cardEntry.txCount++;
      if (tx.statementId) cardEntry.statementIds.add(tx.statementId);

      if (isPayment) {
        cardEntry.paymentsCents += Math.abs(tx.amountCents);
      } else if (!isFee) {
        cardEntry.spendCents += Math.abs(tx.amountCents);
      }
    }

    // 2. Reconcile with statement summary for statements whose row items do not include payment or purchase rows
    const statementsInScope = selectedStatementId.startsWith('MONTH:')
      ? statements.filter((s) => s.periodEnd && s.periodEnd.startsWith(selectedStatementId.replace('MONTH:', '')))
      : selectedStatementId.startsWith('YEAR:')
      ? statements.filter((s) => s.periodEnd && s.periodEnd.startsWith(selectedStatementId.replace('YEAR:', '')))
      : statements;

    for (const stmt of statementsInScope) {
      const stmtTxs = allTransactions.filter((t) => t.statementId === stmt.id);
      const detected = detectCardName(stmt, stmtTxs);
      const cardName = detected.cardName;
      const cardColor = detected.color;
      const last4 = stmt.accountLast4 || '';
      const cardKey = cardName;

      if (!cardMap[cardKey]) {
        cardMap[cardKey] = {
          id: cardKey,
          name: cardName,
          last4: last4 || '',
          color: cardColor,
          spendCents: 0,
          paymentsCents: 0,
          txCount: 0,
          statementIds: new Set<string>([stmt.id])
        };
      } else {
        cardMap[cardKey].statementIds.add(stmt.id);
        if (!cardMap[cardKey].last4 && last4) {
          cardMap[cardKey].last4 = last4;
        }
      }

      // If statement has no parsed purchase row items, use statement summary purchases
      const stmtPurchasesInRows = stmtTxs
        .filter((t) => t.amountCents > 0 && !t.feeType && t.type !== 'PAYMENT' && !isPaymentOrCreditDesc(t.rawDescription))
        .reduce((sum, t) => sum + t.amountCents, 0);

      if (stmtPurchasesInRows === 0 && stmt.purchases) {
        cardMap[cardKey].spendCents += stmt.purchases;
      }

      // If statement has no parsed payment row items, use statement summary payments
      const stmtPaymentsInRows = stmtTxs
        .filter((t) => t.amountCents < 0 || t.type === 'PAYMENT' || isPaymentOrCreditDesc(t.rawDescription))
        .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

      if (stmtPaymentsInRows === 0 && stmt.payments) {
        cardMap[cardKey].paymentsCents += stmt.payments;
      }
    }

    const totalSpend = Object.values(cardMap).reduce((sum, c) => sum + c.spendCents, 0);

    return Object.values(cardMap)
      .map((c) => ({
        ...c,
        percent: totalSpend > 0 ? (c.spendCents / totalSpend) * 100 : 0
      }))
      .sort((a, b) => b.spendCents - a.spendCents);
  }, [isAggregateView, currentStatementTxs, statements, accounts, selectedStatementId, allTransactions, statementCardMap]);

  const totalCardsSpend = useMemo(() => {
    return creditCardsBreakdown.reduce((sum, c) => sum + c.spendCents, 0);
  }, [creditCardsBreakdown]);

  const totalCardsPayments = useMemo(() => {
    return creditCardsBreakdown.reduce((sum, c) => sum + c.paymentsCents, 0);
  }, [creditCardsBreakdown]);

  // 1. Total Spend Hero Headline: Sum of all non-fee, non-payment purchase amounts in scopedCurrentTxs (matches Category & Card totals)
  const totalSpendCents = useMemo(() => {
    if (selectedCardFilter) {
      const card = creditCardsBreakdown.find((c) => c.name === selectedCardFilter);
      if (card) return card.spendCents;
    }
    if (isAggregateView) {
      return totalCardsSpend + (includeChecking ? checkingSpendInScope : 0);
    }
    const purchaseTxs = scopedCurrentTxs.filter(
      tx => tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT' && !isPaymentOrCreditDesc(tx.rawDescription)
    );
    const sum = purchaseTxs.reduce((acc, tx) => acc + tx.amountCents, 0);

    if (sum === 0 && currentStatement?.purchases) {
      return currentStatement.purchases + (includeChecking ? checkingSpendInScope : 0);
    }
    return sum;
  }, [scopedCurrentTxs, selectedCardFilter, isAggregateView, totalCardsSpend, includeChecking, checkingSpendInScope, creditCardsBreakdown, currentStatement]);

  // 2. Subtitle: Statement balance and close date
  const subtitleText = useMemo(() => {
    if (selectedCardFilter) {
      return `${selectedCardFilter} active filter • ${scopedCurrentTxs.length} transactions`;
    }
    if (selectedStatementId.startsWith('YEAR:')) {
      const year = selectedStatementId.replace('YEAR:', '');
      if (includeChecking && checkingSpendInScope > 0) {
        return `${year} Total • ${formatCurrency(totalCardsSpend)} cards + ${formatCurrency(checkingSpendInScope)} checking`;
      }
      return `${year} Full Year Total • ${scopedCurrentTxs.length} transactions`;
    }
    if (selectedStatementId.startsWith('MONTH:')) {
      const monthKey = selectedStatementId.replace('MONTH:', '');
      const [y, m] = monthKey.split('-').map(Number);
      const dateObj = new Date(y, m - 1, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (includeChecking && checkingSpendInScope > 0) {
        return `${monthLabel} Total • ${formatCurrency(totalCardsSpend)} cards + ${formatCurrency(checkingSpendInScope)} checking`;
      }
      return `${monthLabel} Monthly Total • ${scopedCurrentTxs.length} transactions`;
    }
    if (!currentStatement) {
      return `All Transactions (${currentStatementTxs.length} records)`;
    }
    const balanceStr = formatCurrency(Math.abs(currentStatement.newBalance));
    const closeDate = new Date(currentStatement.periodEnd + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `Statement balance ${balanceStr} • closed ${closeDate}`;
  }, [currentStatement, currentStatementTxs, selectedCardFilter, scopedCurrentTxs, selectedStatementId, includeChecking, checkingSpendInScope, totalCardsSpend]);

  // 3. Category Breakdown: amountCents > 0 && feeType == null && NOT payment
  const categoryBreakdown = useMemo(() => {
    const nonFeeCharges = scopedCurrentTxs.filter(
      tx => tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT' && !isPaymentOrCreditDesc(tx.rawDescription)
    );
    const totalCategoryCharges = nonFeeCharges.reduce((sum, tx) => sum + tx.amountCents, 0);

    const spendByCatId: Record<string, number> = {};
    const countByCatId: Record<string, number> = {};
    for (const tx of nonFeeCharges) {
      spendByCatId[tx.categoryId] = (spendByCatId[tx.categoryId] || 0) + tx.amountCents;
      countByCatId[tx.categoryId] = (countByCatId[tx.categoryId] || 0) + 1;
    }

    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const items = Object.entries(spendByCatId).map(([catId, amount]) => {
      const cat = categoryMap.get(catId) || {
        id: catId,
        name: 'General & Uncategorized',
        color: '#64748b',
        icon: 'MoreHorizontal'
      };
      const percent = totalCategoryCharges > 0 ? (amount / totalCategoryCharges) * 100 : 0;
      return {
        ...cat,
        amount,
        percent,
        count: countByCatId[catId] || 0
      };
    });

    return {
      total: totalCategoryCharges,
      items: items.sort((a, b) => b.amount - a.amount)
    };
  }, [scopedCurrentTxs, categories]);

  // 4. Fees Card: Avoidable vs Standard
  const feesSummary = useMemo(() => {
    const feeTxs = scopedCurrentTxs.filter(tx => tx.feeType !== null && tx.feeType !== undefined);
    const totalFeesCents = feeTxs.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
    const avoidableFeesCents = feeTxs
      .filter(tx => tx.isAvoidable)
      .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);

    return {
      totalFeesCents,
      avoidableFeesCents,
      count: feeTxs.length
    };
  }, [scopedCurrentTxs]);

  // 5. Payments & Credits (Synchronized with Credit Card Breakdown, plus Checking bills when toggled on)
  const paymentsSummary = useMemo(() => {
    const checkingPaymentsInScope = includeChecking ? checkingSpendInScope : 0;
    const checkingCount = includeChecking
      ? currentStatementTxs.filter(
          (tx) =>
            (tx.isManual ||
              tx.accountType === 'CHECKING' ||
              tx.accountId === 'acc_checking' ||
              tx.statementId === 'manual_checking') &&
            tx.amountCents > 0 &&
            !tx.feeType &&
            tx.type !== 'PAYMENT'
        ).length
      : 0;

    if (selectedCardFilter) {
      const card = creditCardsBreakdown.find((c) => c.name === selectedCardFilter);
      const paymentTxs = scopedCurrentTxs.filter(
        (tx) => tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription)
      );
      const paymentAmt = card ? card.paymentsCents : paymentTxs.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
      return {
        totalPaymentsCents: paymentAmt,
        cardPaymentsCents: paymentAmt,
        checkingPaymentsCents: 0,
        count: paymentTxs.length > 0 ? paymentTxs.length : (paymentAmt > 0 ? 1 : 0),
        isFromSummary: card ? card.paymentsCents > 0 && paymentTxs.length === 0 : false
      };
    }

    if (isAggregateView) {
      const paymentTxs = scopedCurrentTxs.filter(
        (tx) => tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription)
      );
      return {
        totalPaymentsCents: totalCardsPayments + checkingPaymentsInScope,
        cardPaymentsCents: totalCardsPayments,
        checkingPaymentsCents: checkingPaymentsInScope,
        count: paymentTxs.length + checkingCount,
        isFromSummary: false
      };
    }

    const paymentTxs = scopedCurrentTxs.filter(
      (tx) => tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription)
    );
    let basePaymentsCents = paymentTxs.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);

    const statementPayments = currentStatement?.payments ? currentStatement.payments : 0;
    const finalCardPaymentsCents = basePaymentsCents > 0 ? basePaymentsCents : statementPayments;

    return {
      totalPaymentsCents: finalCardPaymentsCents + checkingPaymentsInScope,
      cardPaymentsCents: finalCardPaymentsCents,
      checkingPaymentsCents: checkingPaymentsInScope,
      count: paymentTxs.length + checkingCount,
      isFromSummary: basePaymentsCents === 0 && statementPayments > 0
    };
  }, [
    scopedCurrentTxs,
    selectedCardFilter,
    currentStatement,
    isAggregateView,
    totalCardsPayments,
    creditCardsBreakdown,
    includeChecking,
    checkingSpendInScope,
    currentStatementTxs
  ]);

  // 6. Recurring Card: Count only ACTIVE recurring series
  const activeRecurringCount = useMemo(() => {
    const analysis = detectSubscriptions(scopedAllTxs);
    return analysis.filter(s => s.status === 'ACTIVE').length;
  }, [scopedAllTxs]);

  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string | null>(null);

  // Clear selectedMonthFilter if active statement or card filter changes
  useEffect(() => {
    setSelectedMonthFilter(null);
  }, [selectedStatementId, selectedCardFilter]);

  // Active Month Label for display
  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonthFilter) return null;
    const [y, m] = selectedMonthFilter.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonthFilter]);

  // Transactions filtered by active cycle, selected card, and selected month
  const statementActivityTxs = useMemo(() => {
    let txs = scopedCurrentTxs;
    if (selectedMonthFilter) {
      txs = txs.filter((tx) => tx.date && tx.date.startsWith(selectedMonthFilter));
    }
    return txs;
  }, [scopedCurrentTxs, selectedMonthFilter]);

  const recentTxs = useMemo(() => {
    return statementActivityTxs.slice(0, selectedMonthFilter ? 20 : 7);
  }, [statementActivityTxs, selectedMonthFilter]);

  // Monthly Spending Trend Data for Dashboard teaser (filtered to selected card if active)
  const recentMonthlyTrends = useMemo(() => {
    const buckets: Record<string, { monthKey: string; monthLabel: string; purchasesCents: number; paymentsCents: number }> = {};
    const targetYear = selectedStatementId.startsWith('YEAR:') ? selectedStatementId.replace('YEAR:', '') : null;

    for (const tx of scopedAllTxs) {
      if (!tx.date) continue;
      if (targetYear && !tx.date.startsWith(targetYear)) continue;
      const key = tx.date.slice(0, 7);
      const isPayment = tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription);
      const isFee = tx.feeType !== null && tx.feeType !== undefined;

      if (!buckets[key]) {
        const [y, m] = key.split('-').map(Number);
        const dateObj = new Date(y, m - 1, 1);
        buckets[key] = {
          monthKey: key,
          monthLabel: dateObj.toLocaleDateString('en-US', { month: 'short' }),
          purchasesCents: 0,
          paymentsCents: 0
        };
      }

      if (isPayment) {
        buckets[key].paymentsCents += Math.abs(tx.amountCents);
      } else if (!isFee) {
        buckets[key].purchasesCents += Math.abs(tx.amountCents);
      }
    }

    // Also factor in statements summary purchases if needed
    let statementsToFactor = selectedCardFilter
      ? statements.filter((s) => statementCardMap[s.id]?.cardName === selectedCardFilter)
      : statements;

    if (targetYear) {
      statementsToFactor = statementsToFactor.filter((s) => s.periodEnd && s.periodEnd.startsWith(targetYear));
    }

    for (const stmt of statementsToFactor) {
      if (!stmt.periodEnd) continue;
      const key = stmt.periodEnd.slice(0, 7);
      if (!buckets[key]) {
        const [y, m] = key.split('-').map(Number);
        const dateObj = new Date(y, m - 1, 1);
        buckets[key] = {
          monthKey: key,
          monthLabel: dateObj.toLocaleDateString('en-US', { month: 'short' }),
          purchasesCents: stmt.purchases || 0,
          paymentsCents: stmt.payments || 0
        };
      }
    }

    const sorted = Object.values(buckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return targetYear ? sorted : sorted.slice(-6); // all months for that year, or last 6 months
  }, [scopedAllTxs, selectedCardFilter, statements, statementCardMap, selectedStatementId]);

  const selectedCardColor = selectedCardFilter ? getCardColor(selectedCardFilter) : 'var(--brand-primary)';

  const handleCardClick = (cardName: string) => {
    setSelectedMonthFilter(null);
    if (selectedCardFilter === cardName) {
      setSelectedCardFilter(null); // Toggle off
    } else {
      setSelectedCardFilter(cardName); // Focus on this card
    }
  };

  const handleTrendMonthClick = (monthKey: string) => {
    if (selectedMonthFilter === monthKey) {
      setSelectedMonthFilter(null);
    } else {
      setSelectedMonthFilter(monthKey);
      // Smoothly scroll down to Recent Statement Activity
      setTimeout(() => {
        const el = document.getElementById('statement-activity-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Checking Bills Inclusion Toggle Banner (Visible when manual checking bills exist in scope) */}
      {checkingSpendInScope > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            padding: '0.65rem 1rem',
            background: includeChecking ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${includeChecking ? 'rgba(6, 182, 212, 0.3)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius-md)',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Landmark size={18} color={includeChecking ? '#06b6d4' : 'var(--text-muted)'} />
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: includeChecking ? '#06b6d4' : 'var(--text-primary)' }}>
                {includeChecking
                  ? `Checking Bills Included in Dashboard (${formatCurrency(checkingSpendInScope)})`
                  : `Credit Cards Only View Active`}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {includeChecking
                  ? `Showing combined total living outflow (${formatCurrency(totalCardsSpend)} cards + ${formatCurrency(checkingSpendInScope)} checking)`
                  : `Mortgage and bank payments (${formatCurrency(checkingSpendInScope)}) are isolated`}
              </span>
            </div>
          </div>

          <div style={{ display: 'inline-flex', gap: '6px' }}>
            <button
              type="button"
              className={`btn btn-sm ${!includeChecking ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleToggleIncludeChecking(false)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
            >
              <CreditCard size={12} style={{ marginRight: '4px' }} /> Cards Only ({formatCurrency(totalCardsSpend)})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${includeChecking ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleToggleIncludeChecking(true)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
            >
              <Landmark size={12} style={{ marginRight: '4px' }} /> + Include Checking Bills (+{formatCurrency(checkingSpendInScope)})
            </button>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-grid">
        {/* HERO CARD: Total Spend */}
        <div
          className="metric-card hero-spend"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setSelectedCategoryFilter('ALL');
            setSelectedTypeFilter('PURCHASES');
            onNavigate('transactions');
          }}
          title="Click to view all purchase transactions"
        >
          <div className="metric-label-row">
            <span className="metric-label">
              {includeChecking && checkingSpendInScope > 0 ? 'Total Living Outflow (Cards + Checking)' : 'Cycle Gross Spend'}
            </span>
            <CreditCard size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{formatCurrency(totalSpendCents)}</div>
          <div className="metric-subtitle">
            <span>{subtitleText} • View purchases →</span>
          </div>
        </div>

        {/* Payments Card - INTERACTIVE */}
        <div
          className="metric-card"
          style={{
            cursor: 'pointer',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
            border: '1px solid rgba(16, 185, 129, 0.25)'
          }}
          onClick={() => {
            setSelectedCategoryFilter('ALL');
            setSelectedTypeFilter('PAYMENTS');
            onNavigate('transactions');
          }}
          title="Click to inspect all payments and return credits"
        >
          <div className="metric-label-row">
            <span className="metric-label" style={{ color: 'var(--success)' }}>
              {includeChecking && checkingSpendInScope > 0 ? 'Total Payments & Direct Debits' : 'Payments & Credits'}
            </span>
            <ArrowDownRight size={18} color="var(--success)" />
          </div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>
            {formatCurrency(paymentsSummary.totalPaymentsCents)}
          </div>
          <div className="metric-subtitle">
            <span style={{ color: 'var(--text-secondary)' }}>
              {includeChecking && checkingSpendInScope > 0
                ? `${formatCurrency(paymentsSummary.cardPaymentsCents)} card payments + ${formatCurrency(paymentsSummary.checkingPaymentsCents)} checking bills`
                : paymentsSummary.isFromSummary
                ? 'Stated in statement summary • View rows →'
                : `${paymentsSummary.count} payment/credit transaction${paymentsSummary.count === 1 ? '' : 's'} • View all →`}
            </span>
          </div>
        </div>

        {/* Fees & Interest Card */}
        <div
          className="metric-card"
          style={{
            cursor: 'pointer',
            borderColor: feesSummary.avoidableFeesCents > 0 ? 'var(--danger-border)' : 'var(--border-subtle)'
          }}
          onClick={() => {
            setSelectedCategoryFilter('ALL');
            setSelectedTypeFilter('FEES');
            onNavigate('transactions');
          }}
          title="Click to view fee and interest transactions"
        >
          <div className="metric-label-row">
            <span className="metric-label">Fees & Interest</span>
            <AlertTriangle
              size={18}
              color={feesSummary.avoidableFeesCents > 0 ? 'var(--danger)' : 'var(--text-muted)'}
            />
          </div>
          <div className="metric-value" style={{ color: feesSummary.totalFeesCents > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {formatCurrency(feesSummary.totalFeesCents)}
          </div>
          <div className="metric-subtitle">
            {feesSummary.avoidableFeesCents > 0 ? (
              <span style={{ color: 'var(--danger)' }}>
                {formatCurrency(feesSummary.avoidableFeesCents)} avoidable fees • View →
              </span>
            ) : (
              <span style={{ color: 'var(--success)' }}>Zero avoidable fees in cycle</span>
            )}
          </div>
        </div>

        {/* Recurring Series Card */}
        <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('subscriptions')}>
          <div className="metric-label-row">
            <span className="metric-label">Active Subscriptions</span>
            <Tv size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{activeRecurringCount}</div>
          <div className="metric-subtitle">
            <span>True digital & service subscriptions</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Category Distribution & Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Category Breakdown Card with PIE CHART */}
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 className="card-title">Category Breakdown</h2>
                {selectedCardFilter && (
                  <span
                    className="badge"
                    style={{
                      backgroundColor: selectedCardColor,
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <CreditCard size={11} /> {selectedCardFilter}
                  </span>
                )}
              </div>
              <p className="card-desc">
                {selectedCardFilter
                  ? `Showing non-fee purchase distribution specifically for ${selectedCardFilter}`
                  : includeChecking
                  ? 'Non-fee purchase & checking bill distribution'
                  : 'Non-fee card purchase distribution & pie visualization'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {checkingSpendInScope > 0 && !selectedCardFilter && (
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.72rem'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleIncludeChecking(false)}
                    className={`btn btn-sm ${!includeChecking ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)'
                    }}
                    title="Show credit cards only"
                  >
                    <CreditCard size={11} style={{ marginRight: '3px' }} /> Cards Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleIncludeChecking(true)}
                    className={`btn btn-sm ${includeChecking ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)'
                    }}
                    title={`Include checking bills (${formatCurrency(checkingSpendInScope)})`}
                  >
                    <Landmark size={11} style={{ marginRight: '3px' }} /> + Checking
                  </button>
                </div>
              )}

              {selectedCardFilter && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedCardFilter(null)}
                  title="Show all cards combined"
                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem' }}
                >
                  <X size={12} style={{ marginRight: '3px' }} /> Show All Cards
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('categories')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Full Breakdown</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {categoryBreakdown.items.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No purchase transactions recorded {selectedCardFilter ? `for ${selectedCardFilter} ` : ''}in this cycle.
            </div>
          ) : (
            <div>
              {/* Stacked distribution bar */}
              <div className="dist-bar-track">
                {categoryBreakdown.items.map(item => (
                  <div
                    key={item.id}
                    className="dist-bar-fill"
                    style={{
                      width: `${item.percent}%`,
                      backgroundColor: item.color,
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setSelectedCategoryFilter(item.id);
                      onNavigate('transactions');
                    }}
                    title={`Click to inspect ${item.name}: ${formatCurrency(item.amount)} (${item.percent.toFixed(1)}%) • ${item.count} transactions`}
                  />
                ))}
              </div>

              {/* Side-by-side: Donut/Pie Chart on left, Interactive rows on right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <div style={{ flex: '0 0 230px', margin: '0 auto' }}>
                  <CategoryPieChart
                    items={categoryBreakdown.items}
                    totalAmountCents={categoryBreakdown.total}
                    size={230}
                    onSelectCategory={(catId) => {
                      setSelectedCategoryFilter(catId);
                      onNavigate('transactions');
                    }}
                  />
                </div>

                <div
                  style={{
                    flex: '1 1 240px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}
                >
                  {categoryBreakdown.items.slice(0, 9).map(item => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'cat_utilities') {
                          onNavigate('utilities');
                        } else if (item.id === 'cat_education') {
                          onNavigate('education');
                        } else if (item.id === 'cat_subscriptions') {
                          onNavigate('subscriptions');
                        } else {
                          setSelectedCategoryFilter(item.id);
                          onNavigate('transactions');
                        }
                      }}
                      className="category-breakdown-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        padding: '0.4rem 0.55rem',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease, transform 0.1s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-surface-raised)';
                        e.currentTarget.style.transform = 'translateX(3px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }}
                      title={`View all ${item.count} transactions in ${item.name}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: item.color,
                            flexShrink: 0
                          }}
                        />
                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-surface-raised)',
                            padding: '1px 5px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          {item.count} {item.count === 1 ? 'tx' : 'txs'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', minWidth: '38px', textAlign: 'right' }}>
                          {item.percent.toFixed(1)}%
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: '65px', textAlign: 'right' }}>
                          {formatCurrency(item.amount)}
                        </span>
                        <ChevronRight size={13} color="var(--text-muted)" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* If viewing Combined / Calendar Month: Show Credit Card Spending Breakdown. If viewing Single Statement: Show Statement Reconciliation */}
        {isAggregateView ? (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 className="card-title">Credit Card Spending Breakdown</h2>
                <p className="card-desc">Click any card to filter Category Breakdown & Monthly Trends</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {selectedCardFilter && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedCardFilter(null)}
                    style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem' }}
                  >
                    <X size={12} style={{ marginRight: '3px' }} /> Clear Filter
                  </button>
                )}
                <span
                  className="badge"
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--brand-primary)',
                    fontWeight: 600,
                    fontSize: '0.75rem'
                  }}
                >
                  <CreditCard size={12} style={{ marginRight: '4px' }} />
                  {creditCardsBreakdown.length} Card{creditCardsBreakdown.length === 1 ? '' : 's'} Active
                </span>
              </div>
            </div>

            {creditCardsBreakdown.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No credit card transactions recorded in this period.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Proportional Card Spending Distribution Bar */}
                <div className="dist-bar-track" style={{ height: '7px', borderRadius: '4px' }}>
                  {creditCardsBreakdown.map((card) => (
                    <div
                      key={card.id}
                      className="dist-bar-fill"
                      style={{
                        width: `${card.percent}%`,
                        backgroundColor: card.color,
                        opacity: selectedCardFilter && selectedCardFilter !== card.name ? 0.35 : 1,
                        cursor: 'pointer'
                      }}
                      onClick={() => handleCardClick(card.name)}
                      title={`Click to focus on ${card.name}: ${formatCurrency(card.spendCents)} (${card.percent.toFixed(1)}%)`}
                    />
                  ))}
                </div>

                {/* Scrollable Credit Cards List (All cards clickable to filter) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}
                >
                  {creditCardsBreakdown.map((card) => {
                    const isSelected = selectedCardFilter === card.name;
                    return (
                      <div
                        key={card.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.7rem 0.9rem',
                          background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'var(--bg-surface-raised)',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? `2px solid ${card.color}` : '1px solid var(--border-subtle)',
                          boxShadow: isSelected ? `0 0 12px ${card.color}33` : 'none',
                          cursor: 'pointer',
                          opacity: selectedCardFilter && !isSelected ? 0.75 : 1,
                          transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = card.color;
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                            e.currentTarget.style.transform = 'translateX(0)';
                          }
                        }}
                        onClick={() => handleCardClick(card.name)}
                        title={isSelected ? `Click to clear filter for ${card.name}` : `Click to focus entire dashboard on ${card.name}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '7px',
                              backgroundColor: card.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              flexShrink: 0,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                          >
                            <CreditCard size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{card.name}</span>
                              {card.last4 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                  (*{card.last4})
                                </span>
                              )}
                              {isSelected && (
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor: card.color,
                                    color: '#fff',
                                    fontSize: '0.68rem',
                                    padding: '1px 5px',
                                    borderRadius: '4px'
                                  }}
                                >
                                  ✓ Focus Active
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {card.txCount} transaction{card.txCount === 1 ? '' : 's'} • {card.percent.toFixed(1)}% of card spend
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            {formatCurrency(card.spendCents)}
                          </div>
                          {card.paymentsCents > 0 && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                              -{formatCurrency(card.paymentsCents)} paid
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Card Totals Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Total Card Spend: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-primary)' }}>
                      {formatCurrency(totalCardsSpend)}
                    </span>
                  </div>
                  {totalCardsPayments > 0 && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {includeChecking && checkingSpendInScope > 0 ? 'Total Paid Out: ' : 'Payments: '}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>
                        -{formatCurrency(totalCardsPayments + (includeChecking ? checkingSpendInScope : 0))}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.15rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onNavigate('transactions')}
                  >
                    View All Transactions
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onNavigate('trends')}
                  >
                    Open Monthly Tracker
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Single Statement Quick Reconciliation & Health */
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Statement Reconciliation</h2>
                <p className="card-desc">Integrity audit & summary equation verification</p>
              </div>
              {currentStatement?.isReconciled ? (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> Reconciled
                </span>
              ) : (
                <span className="badge badge-warning">
                  <AlertTriangle size={12} /> Discrepancy
                </span>
              )}
            </div>

            {currentStatement ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div
                  style={{
                    background: 'var(--bg-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    fontSize: '0.85rem'
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Previous Balance</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatCurrency(currentStatement.previousBalance)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Payments & Credits</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--success)' }}>
                      -{formatCurrency(currentStatement.payments)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Purchases & Charges</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      +{formatCurrency(currentStatement.purchases)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Fees & Interest</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: (currentStatement.fees + currentStatement.interest) > 0 ? 'var(--danger)' : 'inherit' }}>
                      +{formatCurrency(currentStatement.fees + currentStatement.interest)}
                    </div>
                  </div>
                </div>

                {/* Ending Balance Headline */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Ending Statement Balance</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: '1.25rem',
                      color: 'var(--brand-primary)'
                    }}
                  >
                    {formatCurrency(currentStatement.newBalance)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onNavigate('insights')}
                  >
                    Debt Payoff Simulator
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onNavigate('transactions')}
                  >
                    View All {currentStatementTxs.length} Rows
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active statement selected.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Monthly Spending Trend Teaser Card */}
      {recentMonthlyTrends.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <TrendingUp size={20} color={selectedCardColor} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 className="card-title">Monthly Spending Trend Overview</h2>
                  {selectedCardFilter && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: selectedCardColor,
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <CreditCard size={11} /> {selectedCardFilter}
                    </span>
                  )}
                </div>
                <p className="card-desc">
                  {selectedCardFilter
                    ? `Month-by-month spending trajectory specifically for ${selectedCardFilter}`
                    : 'Multi-month spending trajectory across all imported statement cycles'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedCardFilter && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedCardFilter(null)}
                  title="Show all cards combined"
                  style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem' }}
                >
                  <X size={12} style={{ marginRight: '3px' }} /> Show All Cards
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => onNavigate('trends')}>
                <span>Open Monthly Tracker</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem', padding: '1rem 0.5rem', overflowX: 'auto' }}>
            {recentMonthlyTrends.map((m) => {
              const maxSpend = Math.max(...recentMonthlyTrends.map(t => t.purchasesCents), 1000);
              const height = Math.max(12, Math.round((m.purchasesCents / maxSpend) * 110));
              const isMonthActive = selectedMonthFilter === m.monthKey;

              return (
                <div
                  key={m.monthKey}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '1 1 50px',
                    minWidth: '50px',
                    cursor: 'pointer',
                    transform: isMonthActive ? 'scale(1.06)' : 'none',
                    transition: 'transform 0.2s ease'
                  }}
                  onClick={() => handleTrendMonthClick(m.monthKey)}
                  title={`Click to view ${m.monthLabel} statement activity below (${formatCurrency(m.purchasesCents)})${isMonthActive ? ' • Click again to show all months' : ''}`}
                >
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: isMonthActive ? 700 : 600,
                      color: isMonthActive ? selectedCardColor : 'var(--text-secondary)',
                      marginBottom: '4px'
                    }}
                  >
                    {formatCurrency(m.purchasesCents)}
                  </span>
                  <div
                    style={{
                      width: '24px',
                      height: `${height}px`,
                      backgroundColor: isMonthActive ? selectedCardColor : selectedCardFilter ? selectedCardColor : 'var(--brand-primary)',
                      borderRadius: '4px 4px 0 0',
                      boxShadow: isMonthActive ? `0 0 12px ${selectedCardColor}88` : 'none',
                      outline: isMonthActive ? '2px solid rgba(255,255,255,0.7)' : 'none',
                      transition: 'transform 0.2s ease, height 0.3s ease, box-shadow 0.2s ease'
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: isMonthActive ? 700 : 600,
                      color: isMonthActive ? selectedCardColor : 'var(--text-muted)',
                      marginTop: '6px'
                    }}
                  >
                    {m.monthLabel}
                  </span>
                  {isMonthActive && (
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: selectedCardColor,
                        marginTop: '3px'
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions Section */}
      <div className="card" id="statement-activity-section">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 className="card-title">Recent Statement Activity</h2>
              {selectedCardFilter && (
                <span
                  className="badge"
                  style={{
                    backgroundColor: selectedCardColor,
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <CreditCard size={11} /> {selectedCardFilter}
                </span>
              )}
              {selectedMonthFilter && (
                <span
                  className="badge badge-primary"
                  style={{
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedMonthFilter(null)}
                  title="Click to clear month filter"
                >
                  <Calendar size={11} /> {selectedMonthLabel} ({statementActivityTxs.length} txs)
                  <X size={12} />
                </span>
              )}
            </div>
            <p className="card-desc">
              {selectedMonthFilter
                ? `Showing transactions for ${selectedMonthLabel}${selectedCardFilter ? ` on ${selectedCardFilter}` : ''} • Click month bar or "✕" to show all months`
                : selectedCardFilter
                ? `Latest transactions recorded for ${selectedCardFilter} • Click any monthly trend bar above to filter by month`
                : 'Normalized transactions from active statement • Click any monthly trend bar above to filter by month'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectedMonthFilter && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedMonthFilter(null)}
                title="Show all months in cycle"
                style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem' }}
              >
                <X size={12} style={{ marginRight: '3px' }} /> Show All Months
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('transactions')}>
              View Full Ledger <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {recentTxs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No transactions recorded {selectedCardFilter ? `for ${selectedCardFilter} ` : ''}
            {selectedMonthFilter ? `in ${selectedMonthLabel}` : 'in this cycle'}.
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  return (
                    <tr key={tx.id}>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{tx.normalizedMerchant}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.rawDescription}
                      </div>
                    </td>
                    <td>
                      <select
                        className="select-control"
                        value={tx.categoryId}
                        onChange={e => changeTransactionCategory(tx.id, e.target.value)}
                        style={{
                          padding: '0.2rem 0.4rem',
                          fontSize: '0.78rem',
                          maxWidth: '180px',
                          borderLeft: `3px solid ${cat?.color || '#94a3b8'}`
                        }}
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {tx.feeType ? (
                        <span className="badge badge-danger">
                          {tx.feeType.replace('FEE_', '').replace('INTEREST_', '')}
                        </span>
                      ) : tx.type === 'PAYMENT' ? (
                        <span className="badge badge-success">Payment</span>
                      ) : (
                        <span className="badge badge-neutral">Purchase</span>
                      )}
                    </td>
                    <td
                      className={`money-cell ${
                        tx.amountCents < 0 ? 'money-credit' : tx.feeType ? 'money-fee' : 'money-positive'
                      }`}
                    >
                      {formatCurrency(tx.amountCents, { showSign: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
};
