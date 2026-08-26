import React, { useMemo } from 'react';
import { PieChart, Store, ArrowUpRight } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';

export const MerchantConcentration: React.FC = () => {
  const { activeTransactions, allTransactions } = useStatements();

  const concentrationData = useMemo(() => {
    const purchaseTxs = activeTransactions.filter(tx => tx.amountCents > 0 && !tx.feeType);
    const totalSpend = purchaseTxs.reduce((sum, tx) => sum + tx.amountCents, 0);

    const merchantMap: Record<string, { totalCents: number; count: number }> = {};
    for (const tx of purchaseTxs) {
      const m = tx.normalizedMerchant;
      if (!merchantMap[m]) {
        merchantMap[m] = { totalCents: 0, count: 0 };
      }
      merchantMap[m].totalCents += tx.amountCents;
      merchantMap[m].count += 1;
    }

    const sortedMerchants = Object.entries(merchantMap)
      .map(([name, data]) => ({
        name,
        totalCents: data.totalCents,
        count: data.count,
        percent: totalSpend > 0 ? (data.totalCents / totalSpend) * 100 : 0
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    // Pareto 80/20 computation
    const top20PercentCount = Math.max(1, Math.ceil(sortedMerchants.length * 0.2));
    const top20Spend = sortedMerchants
      .slice(0, top20PercentCount)
      .reduce((sum, m) => sum + m.totalCents, 0);
    const top20SpendPercent = totalSpend > 0 ? (top20Spend / totalSpend) * 100 : 0;

    return {
      totalSpend,
      merchants: sortedMerchants,
      top20PercentCount,
      top20SpendPercent
    };
  }, [activeTransactions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Pareto Metric Highlight */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="badge badge-neutral" style={{ marginBottom: '0.4rem' }}>
              Pareto Distribution Index
            </span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              Top {concentrationData.top20PercentCount} Merchants account for{' '}
              <span style={{ color: 'var(--brand-primary)' }}>{concentrationData.top20SpendPercent.toFixed(1)}%</span> of
              total purchases
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              High concentration allows you to optimize category rewards and negotiate recurring pricing easily.
            </p>
          </div>
        </div>
      </div>

      {/* Top Merchants Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Top Merchant Spend Ledger</h3>
            <p className="card-desc">Ranked by total purchase volume in this statement cycle</p>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Merchant</th>
                <th>Transactions</th>
                <th>Share of Total</th>
                <th style={{ textAlign: 'right' }}>Total Volume</th>
              </tr>
            </thead>
            <tbody>
              {concentrationData.merchants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No purchase transactions recorded in this cycle.
                  </td>
                </tr>
              ) : (
                concentrationData.merchants.map((m, idx) => (
                  <tr key={m.name}>
                    <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{m.count} txs</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--bg-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${m.percent}%`,
                              backgroundColor: idx === 0 ? 'var(--brand-primary)' : idx === 1 ? '#0ea5e9' : '#64748b'
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'right' }}>
                          {m.percent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="money-cell">{formatCurrency(m.totalCents)}</td>
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
