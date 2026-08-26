import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, TrendingDown, Target, Info } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';

export const FeeAnalysis: React.FC = () => {
  const { allTransactions, goals, activeStatement, latestStatement } = useStatements();

  // Active month key (YYYY-MM) from active statement periodEnd or today
  const currentStatement = activeStatement || latestStatement;
  const activeMonthKey = useMemo(() => {
    if (currentStatement?.periodEnd) {
      return currentStatement.periodEnd.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }, [currentStatement]);

  // SPEC 11: Scope avoidable fee calculations strictly to the active month key (YYYY-MM)
  const monthTransactions = useMemo(() => {
    return allTransactions.filter(tx => tx.date.startsWith(activeMonthKey));
  }, [allTransactions, activeMonthKey]);

  const feeSummary = useMemo(() => {
    const feeTxs = monthTransactions.filter(tx => tx.feeType !== null && tx.feeType !== undefined);

    let avoidableCents = 0;
    let unavoidableCents = 0;
    let interestCents = 0;

    for (const tx of feeTxs) {
      const amt = Math.abs(tx.amountCents);
      if (tx.feeType?.startsWith('INTEREST')) {
        interestCents += amt;
      } else if (tx.isAvoidable) {
        avoidableCents += amt;
      } else {
        unavoidableCents += amt;
      }
    }

    return {
      feeTxs,
      avoidableCents,
      unavoidableCents,
      interestCents,
      totalLossCents: avoidableCents + interestCents + unavoidableCents
    };
  }, [monthTransactions]);

  // Fee goals
  const feeGoals = useMemo(() => {
    return goals.filter(g => g.type === 'FEE_REDUCTION' && g.active);
  }, [goals]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card" style={{ borderColor: feeSummary.avoidableCents > 0 ? 'var(--danger-border)' : 'var(--border-subtle)' }}>
          <div className="metric-label-row">
            <span className="metric-label">Month Avoidable Fees</span>
            <AlertTriangle size={18} color={feeSummary.avoidableCents > 0 ? 'var(--danger)' : 'var(--success)'} />
          </div>
          <div className="metric-value" style={{ color: feeSummary.avoidableCents > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {formatCurrency(feeSummary.avoidableCents)}
          </div>
          <div className="metric-subtitle">
            <span>Scoped to cycle month {activeMonthKey}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Monthly Interest Incurred</span>
            <TrendingDown size={18} color="var(--warning)" />
          </div>
          <div className="metric-value" style={{ color: 'var(--warning)' }}>
            {formatCurrency(feeSummary.interestCents)}
          </div>
          <div className="metric-subtitle">
            <span>Revolving purchase and cash advance finance charges</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Total Bank Charges</span>
            <ShieldCheck size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{formatCurrency(feeSummary.totalLossCents)}</div>
          <div className="metric-subtitle">
            <span>Combined fees and interest for {activeMonthKey}</span>
          </div>
        </div>
      </div>

      {/* Goal Evaluation Card */}
      {feeGoals.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Target size={20} color="var(--brand-primary)" />
              <h3 className="card-title">Fee Reduction Goals Evaluation</h3>
            </div>
            <span className="badge badge-neutral">Active Month: {activeMonthKey}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {feeGoals.map(g => {
              const isMet = feeSummary.avoidableCents <= g.targetCents;
              return (
                <div
                  key={g.id}
                  style={{
                    background: 'var(--bg-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{g.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Target: {formatCurrency(g.targetCents)} • Current Month Avoidable: {formatCurrency(feeSummary.avoidableCents)}
                    </div>
                  </div>

                  {isMet ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} /> Goal Achieved
                    </span>
                  ) : (
                    <span className="badge badge-danger">
                      <AlertTriangle size={12} /> Target Exceeded by {formatCurrency(feeSummary.avoidableCents - g.targetCents)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Itemized Fee Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Itemized Fee & Interest Ledger</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing all {feeSummary.feeTxs.length} charges recorded in {activeMonthKey}
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Fee Description</th>
                <th>Fee Classification</th>
                <th>Avoidability</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {feeSummary.feeTxs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No fees or interest charged during {activeMonthKey}!
                  </td>
                </tr>
              ) : (
                feeSummary.feeTxs.map(tx => (
                  <tr key={tx.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>{tx.date}</td>
                    <td style={{ fontWeight: 600 }}>{tx.rawDescription}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {tx.feeType?.replace('FEE_', '').replace('INTEREST_', '')}
                      </span>
                    </td>
                    <td>
                      {tx.isAvoidable ? (
                        <span className="badge badge-danger">Avoidable</span>
                      ) : (
                        <span className="badge badge-neutral">Standard Fee</span>
                      )}
                    </td>
                    <td className="money-cell money-fee">
                      +{formatCurrency(Math.abs(tx.amountCents))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
