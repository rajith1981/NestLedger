import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, ArrowUpDown, Tag, Calendar, Download, Sparkles, Check, X } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { isPaymentOrCreditDesc } from '../../engine/pdfParser';
import { Transaction } from '../../types/statement';

export const TransactionListView: React.FC = () => {
  const {
    allTransactions,
    activeTransactions,
    categories,
    selectedStatementId,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedTypeFilter,
    setSelectedTypeFilter,
    changeTransactionCategory,
    changeTransactionCategoryAndCreateRule
  } = useStatements();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scopeFilter, setScopeFilter] = useState<'CURRENT' | 'ALL'>('CURRENT');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'merchant'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Quick rule creation banner state
  const [rulePrompt, setRulePrompt] = useState<{
    txId: string;
    merchant: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  const baseTransactions = scopeFilter === 'CURRENT' ? activeTransactions : allTransactions;

  const includeChecking = useMemo(() => {
    try {
      return localStorage.getItem('dashboard_include_checking') === 'true';
    } catch {
      return false;
    }
  }, []);

  const filteredTransactions = useMemo(() => {
    return baseTransactions
      .filter(tx => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesDesc = tx.rawDescription.toLowerCase().includes(q);
          const matchesMerchant = tx.normalizedMerchant.toLowerCase().includes(q);
          if (!matchesDesc && !matchesMerchant) return false;
        }

        // Category filter
        if (selectedCategoryFilter !== 'ALL' && tx.categoryId !== selectedCategoryFilter) {
          return false;
        }

        // Type filter
        if (selectedTypeFilter === 'FEES' && !tx.feeType) return false;
        if (selectedTypeFilter === 'AVOIDABLE_FEES' && (!tx.feeType || !tx.isAvoidable)) return false;
        if (selectedTypeFilter === 'PAYMENTS') {
          const isChecking =
            tx.isManual ||
            tx.accountType === 'CHECKING' ||
            tx.statementId === 'manual_checking' ||
            tx.accountId === 'acc_checking';
          const isCardPayment = tx.amountCents < 0 || tx.type === 'PAYMENT' || isPaymentOrCreditDesc(tx.rawDescription);
          if (includeChecking) {
            if (!isCardPayment && !isChecking) return false;
          } else {
            if (!isCardPayment) return false;
          }
        }
        if (selectedTypeFilter === 'PURCHASES' && (tx.amountCents <= 0 || tx.feeType || tx.type === 'PAYMENT' || tx.isManual || tx.accountType === 'CHECKING')) return false;
        if (selectedTypeFilter === 'CHECKING' && !tx.isManual && tx.accountType !== 'CHECKING') return false;

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'date') {
          cmp = a.date.localeCompare(b.date);
        } else if (sortField === 'amount') {
          cmp = a.amountCents - b.amountCents;
        } else if (sortField === 'merchant') {
          cmp = a.normalizedMerchant.localeCompare(b.normalizedMerchant);
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [baseTransactions, searchQuery, selectedCategoryFilter, selectedTypeFilter, sortField, sortAsc]);

  const filterSummary = useMemo(() => {
    let debitCents = 0;
    let creditCents = 0;
    let feeCents = 0;

    for (const tx of filteredTransactions) {
      if (tx.amountCents < 0 || tx.type === 'PAYMENT') {
        creditCents += Math.abs(tx.amountCents);
      } else if (tx.feeType) {
        feeCents += Math.abs(tx.amountCents);
        debitCents += Math.abs(tx.amountCents);
      } else {
        debitCents += Math.abs(tx.amountCents);
      }
    }

    const netCents = debitCents - creditCents;
    const avgCents = filteredTransactions.length > 0 ? Math.round(debitCents / filteredTransactions.length) : 0;

    return {
      count: filteredTransactions.length,
      debitCents,
      creditCents,
      feeCents,
      netCents,
      avgCents,
      hasCredits: creditCents > 0
    };
  }, [filteredTransactions]);

  const handleSort = (field: 'date' | 'amount' | 'merchant') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const exportFilteredCsv = () => {
    const headers = ['Date', 'Post Date', 'Merchant', 'Raw Description', 'Category', 'Type', 'Amount USD', 'Fee Type', 'Is Avoidable'];
    const rows = filteredTransactions.map(tx => {
      const cat = categories.find(c => c.id === tx.categoryId)?.name || 'General';
      const amt = (tx.amountCents / 100).toFixed(2);
      return [
        tx.date,
        tx.postDate || '',
        `"${tx.normalizedMerchant.replace(/"/g, '""')}"`,
        `"${tx.rawDescription.replace(/"/g, '""')}"`,
        `"${cat}"`,
        tx.type,
        amt,
        tx.feeType || '',
        tx.isAvoidable ? 'YES' : 'NO'
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCategoryChange = async (tx: Transaction, newCatId: string) => {
    const targetCat = categories.find(c => c.id === newCatId);
    await changeTransactionCategory(tx.id, newCatId);

    // Show learned confirmation
    setRulePrompt({
      txId: tx.id,
      merchant: tx.normalizedMerchant,
      categoryId: newCatId,
      categoryName: targetCat?.name || 'Category'
    });
  };

  return (
    <div className="page-wrapper">
      {/* Rule Learned Notification */}
      {rulePrompt && (
        <div
          className="card"
          style={{
            marginBottom: '1rem',
            background: 'rgba(16, 185, 129, 0.08)',
            borderColor: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Check size={18} color="var(--success)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Learned preference: "{rulePrompt.merchant}" is now set to {rulePrompt.categoryName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                All existing and future transactions matching this merchant signature will automatically use {rulePrompt.categoryName}.
              </div>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setRulePrompt(null)}
            style={{ border: 'none' }}
          >
            <X size={14} /> Dismiss
          </button>
        </div>
      )}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="card-title">Transaction Ledger</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2px' }}>
              <p className="card-desc" style={{ margin: 0 }}>
                Showing {filteredTransactions.length} transactions{' '}
                {scopeFilter === 'CURRENT'
                  ? selectedStatementId.startsWith('YEAR:')
                    ? `(${selectedStatementId.replace('YEAR:', '')} Full Year Combined)`
                    : selectedStatementId.startsWith('MONTH:')
                    ? '(Active Calendar Month)'
                    : '(Active Statement)'
                  : '(All Statements)'}
              </p>
              <span
                className="badge"
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: 'var(--brand-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  padding: '2px 8px'
                }}
              >
                Sum: {formatCurrency(filterSummary.debitCents)}
              </span>
              {filterSummary.hasCredits && (
                <span
                  className="badge"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--success)',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    padding: '2px 8px'
                  }}
                >
                  Credits: -{formatCurrency(filterSummary.creditCents)}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
              <button
                className={`btn btn-sm ${scopeFilter === 'CURRENT' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setScopeFilter('CURRENT')}
              >
                Active Cycle
              </button>
              <button
                className={`btn btn-sm ${scopeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setScopeFilter('ALL')}
              >
                All Records ({allTransactions.length})
              </button>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={exportFilteredCsv}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            paddingTop: '0.5rem'
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              className="input-control"
              placeholder="Search merchant or text..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.2rem' }}
            />
          </div>

          {/* Category Dropdown */}
          <select
            className="select-control"
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Type Dropdown */}
          <select
            className="select-control"
            value={selectedTypeFilter}
            onChange={e => setSelectedTypeFilter(e.target.value)}
          >
            <option value="ALL">All Types</option>
            <option value="PURCHASES">Card Purchases Only</option>
            <option value="CHECKING">Checking & Fixed Bills</option>
            <option value="PAYMENTS">Payments & Credits</option>
            <option value="FEES">All Fees & Interest</option>
            <option value="AVOIDABLE_FEES">Avoidable Fees Only</option>
          </select>

          {selectedCategoryFilter !== 'ALL' && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              onClick={() => setSelectedCategoryFilter('ALL')}
              title="Show all categories"
            >
              <X size={13} /> Reset Filter ({categories.find(c => c.id === selectedCategoryFilter)?.name || 'Category'})
            </button>
          )}

          {selectedTypeFilter !== 'ALL' && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              onClick={() => setSelectedTypeFilter('ALL')}
              title="Show all transaction types"
            >
              <X size={13} /> Reset Type ({selectedTypeFilter === 'PAYMENTS' ? 'Payments & Credits' : selectedTypeFilter === 'PURCHASES' ? 'Purchases' : 'Fees'})
            </button>
          )}
        </div>

        {/* Filter Metrics & Sum Summary Strip */}
        <div
          style={{
            marginTop: '0.85rem',
            padding: '0.65rem 1rem',
            background: 'var(--bg-surface-raised)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Filtered Results: </span>
              <strong style={{ color: 'var(--text-primary)' }}>{filterSummary.count} transactions</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Total Purchases / Charges: </span>
              <strong style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {formatCurrency(filterSummary.debitCents)}
              </strong>
            </div>
            {filterSummary.hasCredits && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Payments / Credits: </span>
                <strong style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                  -{formatCurrency(filterSummary.creditCents)}
                </strong>
              </div>
            )}
            {filterSummary.hasCredits && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Net Amount: </span>
                <strong style={{ color: filterSummary.netCents >= 0 ? 'var(--text-primary)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(filterSummary.netCents)}
                </strong>
              </div>
            )}
            {filterSummary.count > 0 && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Average: </span>
                <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(filterSummary.avgCents)} / item
                </strong>
              </div>
            )}
          </div>

          {selectedCategoryFilter !== 'ALL' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: categories.find(c => c.id === selectedCategoryFilter)?.color || 'var(--brand-primary)'
                }}
              />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {categories.find(c => c.id === selectedCategoryFilter)?.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('date')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Date <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('merchant')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Merchant & Description <ArrowUpDown size={12} />
                  </div>
                </th>
                <th>Category</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('amount')}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                    Amount (USD) <ArrowUpDown size={12} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No transactions match your search filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  return (
                    <tr key={tx.id}>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{tx.date}</div>
                        {tx.postDate && tx.postDate !== tx.date && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Post: {tx.postDate}
                          </div>
                        )}
                      </td>

                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {tx.normalizedMerchant}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            maxWidth: '450px',
                            wordBreak: 'break-word'
                          }}
                        >
                          {tx.rawDescription}
                        </div>
                      </td>

                      <td style={{ verticalAlign: 'top' }}>
                        <select
                          className="select-control"
                          value={tx.categoryId || 'cat_general'}
                          onChange={(e) => handleCategoryChange(tx, e.target.value)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8rem',
                            maxWidth: '200px',
                            borderLeft: `4px solid ${cat?.color || '#94a3b8'}`
                          }}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          {!categories.some((c) => c.id === (tx.categoryId || 'cat_general')) && (
                            <option value={tx.categoryId || 'cat_general'}>
                              General & Uncategorized
                            </option>
                          )}
                        </select>
                      </td>

                      <td style={{ verticalAlign: 'top' }}>
                        {tx.feeType ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                            <span className="badge badge-danger">
                              {tx.feeType.replace('FEE_', '').replace('INTEREST_', '')}
                            </span>
                            {tx.isAvoidable && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--danger)', fontWeight: 600 }}>
                                Avoidable Fee
                              </span>
                            )}
                          </div>
                        ) : tx.amountCents < 0 ? (
                          <span className="badge badge-success">Payment / Credit</span>
                        ) : tx.isManual || tx.accountType === 'CHECKING' ? (
                          <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                            Checking Bill
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Card Purchase</span>
                        )}
                      </td>

                      <td
                        className={`money-cell ${
                          tx.amountCents < 0 ? 'money-credit' : tx.feeType ? 'money-fee' : 'money-positive'
                        }`}
                        style={{ verticalAlign: 'top', fontSize: '0.95rem' }}
                      >
                        {formatCurrency(tx.amountCents, { showSign: true })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTransactions.length > 0 && (
              <tfoot>
                <tr
                  style={{
                    borderTop: '2px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-raised)',
                    fontWeight: 700
                  }}
                >
                  <td colSpan={2} style={{ padding: '0.85rem 1rem' }}>
                    <span>Total Sum ({filterSummary.count} transactions)</span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedCategoryFilter !== 'ALL' ? categories.find(c => c.id === selectedCategoryFilter)?.name : 'All Categories'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {filterSummary.hasCredits ? 'Net Total' : 'Total Charges'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.05rem',
                      color: 'var(--brand-primary)',
                      padding: '0.85rem 1rem'
                    }}
                  >
                    {formatCurrency(filterSummary.hasCredits ? filterSummary.netCents : filterSummary.debitCents)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
