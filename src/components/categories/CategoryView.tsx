import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Play,
  Sparkles,
  PieChart as PieChartIcon,
  TrendingUp,
  Layers,
  Calendar,
  ChevronRight,
  Receipt,
  DollarSign,
  CreditCard,
  Landmark
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { isPaymentOrCreditDesc } from '../../engine/pdfParser';
import { Category, CategoryRule, Transaction } from '../../types/statement';
import { CategoryPieChart, PieChartItem } from '../dashboard/CategoryPieChart';
import { NavTab } from '../layout/Sidebar';

interface CategoryViewProps {
  onNavigate?: (tab: NavTab) => void;
}

export const CategoryView: React.FC<CategoryViewProps> = ({ onNavigate }) => {
  const {
    categories,
    rules,
    statements,
    availableYears,
    availableMonths,
    selectedStatementId,
    setSelectedStatementId,
    setSelectedCategoryFilter,
    activeTransactions,
    allTransactions,
    addCategory,
    addRule,
    removeRule
  } = useStatements();

  const [activeTab, setActiveTab] = useState<'breakdown' | 'categories' | 'rules'>('breakdown');
  const [scopeStatementId, setScopeStatementId] = useState<string>('ALL');

  // Control whether checking bills (mortgage, direct debits) are included in the Category Breakdown view
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

  // New Rule Form State
  const [newRuleCategory, setNewRuleCategory] = useState<string>(categories[0]?.id || 'cat_groceries');
  const [newRulePattern, setNewRulePattern] = useState<string>('');
  const [newRuleIsRegex, setNewRuleIsRegex] = useState<boolean>(false);
  const [newRulePriority, setNewRulePriority] = useState<number>(10);

  // Filter transactions based on chosen scope (All time vs Calendar Year vs Calendar Month vs Specific statement)
  const scopedTransactions = useMemo(() => {
    let txs = allTransactions;
    if (scopeStatementId.startsWith('YEAR:')) {
      const yearKey = scopeStatementId.replace('YEAR:', '');
      txs = allTransactions.filter((tx) => tx.date && tx.date.startsWith(yearKey));
    } else if (scopeStatementId.startsWith('MONTH:')) {
      const monthKey = scopeStatementId.replace('MONTH:', '');
      txs = allTransactions.filter((tx) => tx.date && tx.date.startsWith(monthKey));
    } else if (scopeStatementId !== 'ALL') {
      txs = allTransactions.filter((tx) => tx.statementId === scopeStatementId);
    }

    if (!includeChecking) {
      txs = txs.filter(
        (tx) =>
          !tx.isManual &&
          tx.accountType !== 'CHECKING' &&
          tx.accountId !== 'acc_checking' &&
          tx.statementId !== 'manual_checking'
      );
    }

    return txs;
  }, [allTransactions, scopeStatementId, includeChecking]);

  // Compute non-fee purchase breakdown in current scope
  const breakdownData = useMemo(() => {
    const nonFeeCharges = scopedTransactions.filter(
      (tx) => tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT' && !isPaymentOrCreditDesc(tx.rawDescription)
    );
    const totalCents = nonFeeCharges.reduce((sum, tx) => sum + tx.amountCents, 0);

    const spendByCatId: Record<string, number> = {};
    const countByCatId: Record<string, number> = {};

    for (const tx of nonFeeCharges) {
      const catId = tx.categoryId || 'cat_general';
      spendByCatId[catId] = (spendByCatId[catId] || 0) + tx.amountCents;
      countByCatId[catId] = (countByCatId[catId] || 0) + 1;
    }

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const items: PieChartItem[] = Object.entries(spendByCatId).map(([catId, amount]) => {
      const cat = categoryMap.get(catId) || {
        id: catId,
        name: 'Uncategorized',
        color: '#94a3b8',
        icon: 'Folder'
      };
      const percent = totalCents > 0 ? (amount / totalCents) * 100 : 0;
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color || '#3b82f6',
        amount,
        percent,
        count: countByCatId[catId] || 0
      };
    });

    return {
      totalCents,
      totalTransactions: nonFeeCharges.length,
      items: items.sort((a, b) => b.amount - a.amount)
    };
  }, [scopedTransactions, categories]);

  // Multi-month category spending matrix
  const monthlyCategoryMatrix = useMemo(() => {
    const monthsMap: Record<string, { monthKey: string; monthLabel: string; spendByCat: Record<string, number>; total: number }> = {};

    for (const tx of allTransactions) {
      if (!tx.date) continue;
      const isPayment = tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription);
      const isFee = tx.feeType !== null && tx.feeType !== undefined;

      if (!isPayment && !isFee) {
        const monthKey = tx.date.slice(0, 7);
        if (!monthsMap[monthKey]) {
          const [y, m] = monthKey.split('-').map(Number);
          const dateObj = new Date(y, m - 1, 1);
          monthsMap[monthKey] = {
            monthKey,
            monthLabel: dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            spendByCat: {},
            total: 0
          };
        }
        const catId = tx.categoryId || 'cat_general';
        monthsMap[monthKey].spendByCat[catId] = (monthsMap[monthKey].spendByCat[catId] || 0) + Math.abs(tx.amountCents);
        monthsMap[monthKey].total += Math.abs(tx.amountCents);
      }
    }

    const sortedMonths = Object.values(monthsMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return sortedMonths;
  }, [allTransactions]);

  const testMatches = useMemo(() => {
    if (!newRulePattern.trim()) return [];
    const pattern = newRulePattern.trim();
    return allTransactions
      .filter((tx) => {
        if (newRuleIsRegex) {
          try {
            return new RegExp(pattern, 'i').test(tx.rawDescription);
          } catch (e) {
            return false;
          }
        }
        return tx.rawDescription.toUpperCase().includes(pattern.toUpperCase());
      })
      .slice(0, 5);
  }, [newRulePattern, newRuleIsRegex, allTransactions]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim()) return;

    const newRule: CategoryRule = {
      id: `rule_${Date.now()}`,
      categoryId: newRuleCategory,
      pattern: newRulePattern.trim(),
      isRegex: newRuleIsRegex,
      priority: Number(newRulePriority) || 10
    };

    await addRule(newRule);
    setNewRulePattern('');
  };

  const handleDrilldownCategory = (catId: string) => {
    if (catId === 'cat_utilities') {
      onNavigate?.('utilities');
      return;
    }
    if (catId === 'cat_education') {
      onNavigate?.('education');
      return;
    }
    if (catId === 'cat_subscriptions') {
      onNavigate?.('subscriptions');
      return;
    }
    if (scopeStatementId !== 'ALL') {
      setSelectedStatementId(scopeStatementId);
    }
    setSelectedCategoryFilter(catId);
    onNavigate?.('transactions');
  };

  // Checking bills amount present in the active period
  const checkingSpendInScope = useMemo(() => {
    let txs = allTransactions;
    if (scopeStatementId.startsWith('YEAR:')) {
      const yearKey = scopeStatementId.replace('YEAR:', '');
      txs = allTransactions.filter((tx) => tx.date && tx.date.startsWith(yearKey));
    } else if (scopeStatementId.startsWith('MONTH:')) {
      const monthKey = scopeStatementId.replace('MONTH:', '');
      txs = allTransactions.filter((tx) => tx.date && tx.date.startsWith(monthKey));
    } else if (scopeStatementId !== 'ALL') {
      txs = allTransactions.filter((tx) => tx.statementId === scopeStatementId);
    }
    return txs
      .filter(
        (tx) =>
          (tx.isManual ||
            tx.accountType === 'CHECKING' ||
            tx.accountId === 'acc_checking' ||
            tx.statementId === 'manual_checking') &&
          tx.amountCents > 0 &&
          !tx.feeType &&
          tx.type !== 'PAYMENT'
      )
      .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
  }, [allTransactions, scopeStatementId]);

  return (
    <div className="page-wrapper">
      {/* Top Header Card & Navigation Tabs */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FolderTree size={24} color="var(--brand-primary)" />
              <h1 className="page-title" style={{ margin: 0 }}>Category Breakdown & Budgets</h1>
            </div>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
              Explore comprehensive category spending distributions, monthly comparisons, budget caps, and auto-classification rules.
            </p>
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            <button
              className={`btn btn-sm ${activeTab === 'breakdown' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveTab('breakdown')}
            >
              <PieChartIcon size={14} />
              <span>Category Breakdown</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveTab('categories')}
            >
              <span>Budgets & Caps</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'rules' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveTab('rules')}
            >
              <span>Merchant Rules ({rules.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: CATEGORY BREAKDOWN & ANALYTICS */}
      {activeTab === 'breakdown' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Scope Selector Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.85rem 1.25rem',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Calendar size={18} color="var(--brand-primary)" />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select Breakdown Period:</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {checkingSpendInScope > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.75rem'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleIncludeChecking(false)}
                    className={`btn btn-sm ${!includeChecking ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '3px 9px',
                      fontSize: '0.75rem',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)'
                    }}
                    title="Show credit cards only"
                  >
                    <CreditCard size={12} style={{ marginRight: '4px' }} /> Cards Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleIncludeChecking(true)}
                    className={`btn btn-sm ${includeChecking ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '3px 9px',
                      fontSize: '0.75rem',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)'
                    }}
                    title={`Include checking bills (${formatCurrency(checkingSpendInScope)})`}
                  >
                    <Landmark size={12} style={{ marginRight: '4px' }} /> + Checking ({formatCurrency(checkingSpendInScope)})
                  </button>
                </div>
              )}

              <select
                className="select-control"
                value={scopeStatementId}
                onChange={(e) => setScopeStatementId(e.target.value)}
                style={{ maxWidth: '380px', fontWeight: 600 }}
              >
                <option value="ALL">All Statements Combined (Overall Total)</option>

                {availableYears.length > 0 && (
                  <optgroup label="🗓️ Full Year Totals (All Cards Combined)">
                    {availableYears.map((year) => (
                      <option key={`YEAR:${year}`} value={`YEAR:${year}`}>
                        {year} Full Year Total (All Cards Combined)
                      </option>
                    ))}
                  </optgroup>
                )}

                {availableYears.map((year) => {
                  const monthsInYear = availableMonths.filter((m) => m.year === year);
                  if (monthsInYear.length === 0) return null;
                  return (
                    <optgroup key={year} label={`📅 ${year} Calendar Months (All Cards Combined)`}>
                      {monthsInYear.map((m) => (
                        <option key={m.monthKey} value={`MONTH:${m.monthKey}`}>
                          {m.monthLabel} (All Cards Combined)
                        </option>
                      ))}
                    </optgroup>
                  );
                })}

                {statements.length > 0 && (
                  <optgroup label="📄 By Individual Statement File">
                    {statements.map((stmt) => {
                      const cardLabel = stmt.cardName
                        ? `${stmt.cardName}${stmt.accountLast4 ? ` (*${stmt.accountLast4})` : ''}`
                        : stmt.accountLast4
                        ? `Card (*${stmt.accountLast4})`
                        : stmt.fileName;
                      return (
                        <option key={stmt.id} value={stmt.id}>
                          {cardLabel} — {stmt.periodEnd}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Key Metric Highlights Row */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Total Spend in Scope</span>
                <DollarSign size={18} color="var(--brand-primary)" />
              </div>
              <div className="metric-value">{formatCurrency(breakdownData.totalCents)}</div>
              <div className="metric-subtitle">
                <span>{breakdownData.totalTransactions} purchase transactions</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Top Spending Category</span>
                <TrendingUp size={18} color="var(--warning)" />
              </div>
              <div className="metric-value" style={{ color: 'var(--warning)', fontSize: '1.35rem' }}>
                {breakdownData.items[0]?.name || 'None'}
              </div>
              <div className="metric-subtitle">
                <span>
                  {breakdownData.items[0]
                    ? `${formatCurrency(breakdownData.items[0].amount)} (${breakdownData.items[0].percent.toFixed(1)}%)`
                    : '$0.00'}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Active Categories</span>
                <Layers size={18} color="var(--success)" />
              </div>
              <div className="metric-value" style={{ color: 'var(--success)' }}>
                {breakdownData.items.length} of {categories.length}
              </div>
              <div className="metric-subtitle">
                <span>Categories with transaction activity</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Avg Spend per Transaction</span>
                <Receipt size={18} color="var(--brand-primary)" />
              </div>
              <div className="metric-value">
                {breakdownData.totalTransactions > 0
                  ? formatCurrency(Math.round(breakdownData.totalCents / breakdownData.totalTransactions))
                  : '$0.00'}
              </div>
              <div className="metric-subtitle">
                <span>Across all items in selected scope</span>
              </div>
            </div>
          </div>

          {/* Visual Category Centerpiece: Donut Chart & Detailed Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Category Distribution & Visual Breakdown</h2>
                <p className="card-desc">Interactive donut visualization and distribution share</p>
              </div>
            </div>

            {breakdownData.items.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No spending records found for the selected period.
              </div>
            ) : (
              <div>
                {/* Slim Stacked Color Bar */}
                <div className="dist-bar-track" style={{ height: '10px', marginBottom: '1.75rem' }}>
                  {breakdownData.items.map((item) => (
                    <div
                      key={item.id}
                      className="dist-bar-fill"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: item.color,
                        cursor: 'pointer'
                      }}
                      onClick={() => handleDrilldownCategory(item.id)}
                      title={`${item.name}: ${formatCurrency(item.amount)} (${item.percent.toFixed(1)}%)`}
                    />
                  ))}
                </div>

                {/* Donut Chart & Category Cards Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: '2rem', alignItems: 'center' }}>
                  {/* Left: Large Pie Chart */}
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
                    <CategoryPieChart
                      items={breakdownData.items}
                      totalAmountCents={breakdownData.totalCents}
                      size={280}
                      onSelectCategory={handleDrilldownCategory}
                    />
                  </div>

                  {/* Right: Detailed Category Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                    {breakdownData.items.map((item) => {
                      const catObj = categories.find((c) => c.id === item.id);
                      const cap = catObj?.budgetMonthlyCents || 0;
                      const hasCap = cap > 0;
                      const capPercent = hasCap ? Math.min(100, Math.round((item.amount / cap) * 100)) : 0;
                      const isOver = hasCap && item.amount > cap;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleDrilldownCategory(item.id)}
                          style={{
                            background: 'var(--bg-surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.85rem 1rem',
                            cursor: 'pointer',
                            transition: 'transform 0.15s ease, border-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = item.color;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                          }}
                          title={`Click to view all ${item.count} transactions in ${item.name}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: item.color
                                }}
                              />
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {item.percent.toFixed(1)}%
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {formatCurrency(item.amount)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {item.count} {item.count === 1 ? 'tx' : 'txs'}
                            </span>
                          </div>

                          {/* Cap progress */}
                          {hasCap && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${capPercent}%`,
                                    backgroundColor: isOver ? 'var(--danger)' : item.color
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <span>Cap: {formatCurrency(cap)}</span>
                                <span style={{ color: isOver ? 'var(--danger)' : 'inherit' }}>
                                  {isOver ? 'Over Cap' : `${capPercent}%`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Multi-Month Category Spending Comparison Matrix */}
          {monthlyCategoryMatrix.length > 1 && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Month-by-Month Category Spending Matrix</h2>
                  <p className="card-desc">Compare category allocations across every monthly cycle</p>
                </div>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      {monthlyCategoryMatrix.map((m) => (
                        <th key={m.monthKey} style={{ textAlign: 'right' }}>
                          {m.monthLabel}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Total Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => {
                      const totalCatSpend = monthlyCategoryMatrix.reduce(
                        (sum, m) => sum + (m.spendByCat[cat.id] || 0),
                        0
                      );

                      if (totalCatSpend === 0) return null;

                      return (
                        <tr
                          key={cat.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleDrilldownCategory(cat.id)}
                          title={`View transactions for ${cat.name}`}
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

                          {monthlyCategoryMatrix.map((m) => {
                            const amount = m.spendByCat[cat.id] || 0;
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
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BUDGETS & CAPS */}
      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {categories.map((cat) => {
            const catTransactions = activeTransactions.filter((tx) => tx.categoryId === cat.id && tx.amountCents > 0 && !tx.feeType);
            const spent = catTransactions.reduce((sum, tx) => sum + tx.amountCents, 0);
            const cap = cat.budgetMonthlyCents || 0;
            const hasCap = cap > 0;
            const percent = hasCap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
            const isOver = hasCap && spent > cap;

            return (
              <div key={cat.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: cat.color
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{cat.name}</span>
                  </div>
                  {isOver && (
                    <span className="badge badge-danger">
                      <AlertCircle size={12} /> Over Cap
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700 }}>
                    {formatCurrency(spent)}
                  </span>
                  {hasCap && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Cap: {formatCurrency(cap)}
                    </span>
                  )}
                </div>

                {hasCap ? (
                  <div>
                    <div style={{ height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          backgroundColor: isOver ? 'var(--danger)' : cat.color,
                          transition: 'width 300ms ease'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>{percent}% used</span>
                      <span>
                        {isOver ? `Over by ${formatCurrency(spent - cap)}` : `${formatCurrency(cap - spent)} remaining`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No monthly cap configured.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: MERCHANT CLASSIFICATION RULES */}
      {activeTab === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
          {/* Rules List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Configured Classification Rules</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Evaluated in order of priority</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {rules.map((rule) => {
                const cat = categories.find((c) => c.id === rule.categoryId);
                return (
                  <div
                    key={rule.id}
                    style={{
                      background: 'var(--bg-surface-raised)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            color: cat?.color || '#38bdf8',
                            fontSize: '0.7rem'
                          }}
                        >
                          {cat?.name || 'General'}
                        </span>
                        {rule.isRegex && <span className="badge badge-warning">Regex</span>}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>P{rule.priority}</span>
                      </div>
                      <code
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {rule.pattern}
                      </code>
                    </div>

                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.3rem 0.5rem' }}
                      onClick={() => removeRule(rule.id)}
                      title="Delete rule"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add New Rule Form */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Add Auto-Categorization Rule</h3>
            </div>

            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Target Category
                </label>
                <select
                  className="select-control"
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Pattern / Match String
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="e.g. TRADER JOE|WHOLE FOODS or SPOTIFY"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newRuleIsRegex}
                    onChange={(e) => setNewRuleIsRegex(e.target.checked)}
                  />
                  <span>Regular Expression (Regex)</span>
                </label>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Priority:</span>
                  <input
                    type="number"
                    className="input-control"
                    style={{ width: '60px', padding: '0.3rem 0.5rem' }}
                    value={newRulePriority}
                    onChange={(e) => setNewRulePriority(parseInt(e.target.value, 10) || 10)}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              {/* Live Match Preview */}
              {newRulePattern.trim() && (
                <div
                  style={{
                    background: 'var(--bg-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    fontSize: '0.8rem'
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--brand-primary)', marginBottom: '4px' }}>
                    Live Match Preview ({testMatches.length} sample transactions matched):
                  </div>
                  {testMatches.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>No current transactions match this pattern.</div>
                  ) : (
                    <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                      {testMatches.map((m) => (
                        <li key={m.id} style={{ color: 'var(--text-secondary)' }}>
                          {m.rawDescription} ({formatCurrency(m.amountCents)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                <Plus size={16} /> Save Rule & Apply
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
