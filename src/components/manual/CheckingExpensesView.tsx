import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Plus,
  Trash2,
  Calendar,
  Home,
  Zap,
  Phone,
  Shield,
  Repeat,
  DollarSign,
  Receipt,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { Transaction } from '../../types/statement';
import { AddExpenseModal } from './AddExpenseModal';
import { NavTab } from '../layout/Sidebar';

interface CheckingExpensesViewProps {
  onNavigate?: (tab: NavTab) => void;
}

export const CheckingExpensesView: React.FC<CheckingExpensesViewProps> = ({ onNavigate }) => {
  const { allTransactions, categories, availableMonths, deleteManualExpense } = useStatements();

  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('ALL');

  // Filter only manual checking transactions
  const checkingTransactions = useMemo(() => {
    return allTransactions.filter((tx) => tx.isManual || tx.accountType === 'CHECKING' || tx.accountId === 'acc_checking');
  }, [allTransactions]);

  const filteredExpenses = useMemo(() => {
    if (selectedMonthFilter === 'ALL') return checkingTransactions;
    return checkingTransactions.filter((tx) => tx.date.startsWith(selectedMonthFilter));
  }, [checkingTransactions, selectedMonthFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalCents = filteredExpenses.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);

    // Group by unique bill name for monthly estimation
    const uniqueBills: Record<string, number> = {};
    for (const tx of checkingTransactions) {
      const amt = Math.abs(tx.amountCents);
      if (!uniqueBills[tx.normalizedMerchant] || amt > uniqueBills[tx.normalizedMerchant]) {
        uniqueBills[tx.normalizedMerchant] = amt;
      }
    }

    const estimatedMonthlyFixedCents = Object.values(uniqueBills).reduce((sum, amt) => sum + amt, 0);

    return {
      totalCents,
      totalCount: filteredExpenses.length,
      estimatedMonthlyFixedCents,
      uniqueBillCount: Object.keys(uniqueBills).length
    };
  }, [filteredExpenses, checkingTransactions]);

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}" expense?`)) {
      await deleteManualExpense(id);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Landmark size={24} color="var(--brand-primary)" />
            <h1 className="page-title" style={{ margin: 0 }}>Checking Account & Fixed Bills</h1>
          </div>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
            Track mortgage, phone bills, gas & electric utilities, and bank payments alongside credit cards.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Month Filter */}
          <select
            className="select-control"
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map((m) => (
              <option key={m.monthKey} value={m.monthKey}>
                {m.monthLabel}
              </option>
            ))}
          </select>

          <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={16} />
            <span>Add Bill / Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="metrics-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Estimated Monthly Fixed Bills</span>
            <DollarSign size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{formatCurrency(summary.estimatedMonthlyFixedCents)}</div>
          <div className="metric-subtitle">
            <span>{summary.uniqueBillCount} unique recurring bills</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Checking Outflow in Scope</span>
            <Receipt size={18} color="var(--success)" />
          </div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>
            {formatCurrency(summary.totalCents)}
          </div>
          <div className="metric-subtitle">
            <span>{summary.totalCount} recorded payment entries</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Credit Card Isolation</span>
            <Shield size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value" style={{ fontSize: '1.25rem' }}>100% Protected</div>
          <div className="metric-subtitle">
            <span>Zero impact on card statement math</span>
          </div>
        </div>
      </div>

      {/* Expenses Table Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recorded Checking & Fixed Expenses</h2>
            <p className="card-desc">Direct debits and bank account payments</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} /> Add Another Bill
          </button>
        </div>

        {filteredExpenses.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <Landmark size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>No Checking Expenses Recorded</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
              Add your monthly mortgage payment, phone bill, gas utility, or auto insurance to view your true total monthly spending.
            </p>
            <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
              <Plus size={16} /> Add Your First Bill
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill / Expense Name</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((tx) => {
                  const cat = categories.find((c) => c.id === tx.categoryId) || {
                    name: 'General',
                    color: '#94a3b8'
                  };

                  return (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{tx.date}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600 }}>{tx.normalizedMerchant || tx.rawDescription}</span>
                          {tx.isRecurringBill && (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: 'var(--brand-primary)',
                                fontSize: '0.68rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Repeat size={10} /> Monthly Bill
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: cat.color
                            }}
                          />
                          <span style={{ fontSize: '0.85rem' }}>{cat.name}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(6, 182, 212, 0.15)',
                            color: '#06b6d4',
                            fontSize: '0.72rem'
                          }}
                        >
                          Checking Account
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: 'var(--text-primary)'
                        }}
                      >
                        {formatCurrency(Math.abs(tx.amountCents))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '0.3rem 0.5rem' }}
                          onClick={() => handleDelete(tx.id, tx.normalizedMerchant || tx.rawDescription)}
                          title="Delete expense"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddExpenseModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  );
};
