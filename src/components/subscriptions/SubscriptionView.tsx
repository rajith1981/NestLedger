import React, { useState, useMemo } from 'react';
import {
  Repeat,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Clock,
  DollarSign,
  Tv,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Search,
  Layers,
  ArrowUpRight,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { detectSubscriptions, CADENCE_LABELS, CADENCE_MULTIPLIERS } from '../../engine/subscriptionDetector';
import { detectCardName } from '../../engine/cardDetector';
import { Subscription, SubscriptionStatus, Transaction } from '../../types/statement';

export const SubscriptionView: React.FC = () => {
  const { allTransactions, statements, accounts } = useStatements();
  const [statusFilter, setStatusFilter] = useState<'ALL' | SubscriptionStatus>('ACTIVE');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Map statement ID to card detection
  const statementCardMap = useMemo(() => {
    const map: Record<string, { cardName: string; color: string; last4: string }> = {};
    for (const stmt of statements) {
      const stmtTxs = allTransactions.filter((t) => t.statementId === stmt.id);
      const detected = detectCardName(stmt, stmtTxs);
      map[stmt.id] = {
        cardName: detected.cardName,
        color: detected.color,
        last4: stmt.accountLast4 || ''
      };
    }
    return map;
  }, [statements, allTransactions]);

  const getCardInfo = (tx: { statementId?: string; accountId?: string; isManual?: boolean }) => {
    if (tx.isManual || tx.statementId === 'manual_checking') {
      return { cardName: 'Checking Account', color: '#10b981', last4: '' };
    }
    if (tx.statementId && statementCardMap[tx.statementId]) {
      return statementCardMap[tx.statementId];
    }
    if (tx.accountId) {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) {
        return { cardName: acc.name, color: acc.color || 'var(--brand-primary)', last4: acc.last4 || '' };
      }
    }
    return { cardName: 'Credit Card', color: 'var(--brand-primary)', last4: '' };
  };

  const allSubscriptions = useMemo(() => {
    return detectSubscriptions(allTransactions);
  }, [allTransactions]);

  const filteredSubscriptions = useMemo(() => {
    let list = allSubscriptions;
    if (statusFilter !== 'ALL') {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.normalizedMerchant.toLowerCase().includes(q));
    }
    return list;
  }, [allSubscriptions, statusFilter, searchQuery]);

  // Total recurring spend metrics
  const activeSubs = useMemo(() => allSubscriptions.filter((s) => s.status === 'ACTIVE'), [allSubscriptions]);

  const totalMonthlySpendCents = useMemo(() => {
    return activeSubs.reduce((sum, s) => {
      const mult = CADENCE_MULTIPLIERS[s.cadence];
      return sum + Math.round((s.amountCents * mult) / 12);
    }, 0);
  }, [activeSubs]);

  const totalAnnualSpendCents = useMemo(() => {
    return activeSubs.reduce((sum, s) => {
      const mult = CADENCE_MULTIPLIERS[s.cadence];
      return sum + s.amountCents * mult;
    }, 0);
  }, [activeSubs]);

  const totalAnnualHikesCents = useMemo(() => {
    return activeSubs.reduce((sum, s) => sum + (s.annualizedIncreaseCents || 0), 0);
  }, [activeSubs]);

  // Map of transactions for each subscription
  const subTxMap = useMemo(() => {
    const txById = new Map<string, Transaction>(allTransactions.map((t) => [t.id, t]));
    const map: Record<string, Transaction[]> = {};
    for (const sub of allSubscriptions) {
      const txs = sub.transactionIds
        .map((id) => txById.get(id))
        .filter((t): t is Transaction => Boolean(t))
        .sort((a, b) => b.date.localeCompare(a.date));
      map[sub.id] = txs;
    }
    return map;
  }, [allSubscriptions, allTransactions]);

  const toggleExpand = (subId: string) => {
    setExpandedSubId((prev) => (prev === subId ? null : subId));
  };

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tv size={24} color="var(--brand-primary)" /> Digital & Service Subscriptions
          </h1>
          <p className="page-desc">
            Audit true streaming, cloud storage, software SaaS, AI services, and memberships. Click any subscription to inspect its full billing history.
          </p>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Monthly Subscription Commitment</span>
            <DollarSign size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{formatCurrency(totalMonthlySpendCents)}</div>
          <div className="metric-subtitle">
            <span>Across {activeSubs.length} active digital & service subscriptions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Annualized Subscription Run-Rate</span>
            <Repeat size={18} color="var(--brand-primary)" />
          </div>
          <div className="metric-value">{formatCurrency(totalAnnualSpendCents)}</div>
          <div className="metric-subtitle">
            <span>Total projected annual subscription outflow</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Annualized Price Increases</span>
            <TrendingUp size={18} color={totalAnnualHikesCents > 0 ? 'var(--warning)' : 'var(--success)'} />
          </div>
          <div
            className="metric-value"
            style={{ color: totalAnnualHikesCents > 0 ? 'var(--warning)' : 'var(--text-primary)' }}
          >
            {formatCurrency(totalAnnualHikesCents)}
          </div>
          <div className="metric-subtitle">
            {totalAnnualHikesCents > 0 ? (
              <span style={{ color: 'var(--warning)' }}>Hikes detected across current subscriptions</span>
            ) : (
              <span style={{ color: 'var(--success)' }}>No unexpected price hikes detected</span>
            )}
          </div>
        </div>
      </div>

      {/* Subscriptions Ledger */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="card-title">Digital & Service Subscriptions Ledger</h2>
            <p className="card-desc">Click any row below to reveal all individual billing cycles, cards used, and price history</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search subscriptions..."
                className="input-control"
                style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '34px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
              {(['ACTIVE', 'ALL', 'LAPSED', 'SUSPECTED'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`btn btn-sm ${statusFilter === tab ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  onClick={() => setStatusFilter(tab)}
                >
                  {tab === 'ALL' ? 'All Series' : tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}></th>
                <th>Subscription / Service</th>
                <th>Cadence</th>
                <th>Status</th>
                <th>Last Seen Date</th>
                <th>Price Changes</th>
                <th style={{ textAlign: 'right' }}>Recurring Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No subscriptions found under this filter.
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((sub) => {
                  const cadenceLabel = CADENCE_LABELS[sub.cadence];
                  const hasHike = sub.priceIncreaseCents && sub.priceIncreaseCents > 0;
                  const isExpanded = expandedSubId === sub.id;
                  const txs = subTxMap[sub.id] || [];
                  const totalPaidCents = txs.reduce((sum, t) => sum + t.amountCents, 0);

                  // Extract payment methods used
                  const paymentCards = Array.from(
                    new Set(txs.map((t) => getCardInfo(t).cardName))
                  );

                  return (
                    <React.Fragment key={sub.id}>
                      {/* Subscription Master Row */}
                      <tr
                        onClick={() => toggleExpand(sub.id)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isExpanded ? 'rgba(56, 189, 248, 0.08)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                        className="interactive-row"
                        title="Click to view all billing occurrences & payment details"
                      >
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          {isExpanded ? <ChevronUp size={16} color="var(--brand-primary)" /> : <ChevronDown size={16} />}
                        </td>

                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{sub.normalizedMerchant}</span>
                            {hasHike && (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                  color: '#f59e0b',
                                  fontSize: '0.65rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                Price Hike
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {sub.transactionCount} billing occurrence{sub.transactionCount === 1 ? '' : 's'} recorded • Click to inspect
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            {sub.cadence}
                          </span>
                        </td>

                        <td>
                          {sub.status === 'ACTIVE' ? (
                            <span className="badge badge-success">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          ) : sub.status === 'LAPSED' ? (
                            <span className="badge badge-neutral">
                              <Clock size={12} /> Lapsed
                            </span>
                          ) : (
                            <span className="badge badge-warning">
                              <AlertTriangle size={12} /> Suspected
                            </span>
                          )}
                        </td>

                        <td style={{ color: 'var(--text-secondary)' }}>{sub.lastSeenDate}</td>

                        <td>
                          {hasHike ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: '0.8rem' }}>
                                +{formatCurrency(sub.priceIncreaseCents!)} hike
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                +{formatCurrency(sub.annualizedIncreaseCents!)}/yr impact
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stable rate</span>
                          )}
                        </td>

                        <td className="money-cell" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {formatCurrency(sub.amountCents)}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {cadenceLabel}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Billing History Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0', backgroundColor: 'var(--bg-surface-raised)', borderBottom: '2px solid var(--border-subtle)' }}>
                            <div style={{ padding: '1.25rem 1.75rem', animation: 'fadeIn 0.2s ease-in-out' }}>
                              {/* Top Details Header for this Subscription */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: '1rem',
                                  marginBottom: '1rem',
                                  paddingBottom: '0.85rem',
                                  borderBottom: '1px solid var(--border-subtle)'
                                }}
                              >
                                <div>
                                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{sub.normalizedMerchant} Billing History</span>
                                    <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                                      {txs.length} Cycles
                                    </span>
                                  </h3>
                                  <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Total cumulative paid: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPaidCents)}</strong> across{' '}
                                    {paymentCards.join(', ')}
                                  </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.8rem' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>First Billed: </span>
                                    <strong>{txs[txs.length - 1]?.date || 'N/A'}</strong>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Latest Billed: </span>
                                    <strong>{txs[0]?.date || 'N/A'}</strong>
                                  </div>
                                  {sub.previousAmountCents && (
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Previous Rate: </span>
                                      <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                                        {formatCurrency(sub.previousAmountCents)}
                                      </span>{' '}
                                      <strong style={{ color: 'var(--warning)' }}>→ {formatCurrency(sub.amountCents)}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Mini Visual Trajectory Bars */}
                              <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                  Billing Occurrences Timeline
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', overflowX: 'auto', padding: '0.5rem 0' }}>
                                  {[...txs].reverse().map((t, idx) => {
                                    const maxAmt = Math.max(...txs.map((x) => x.amountCents), 100);
                                    const h = Math.max(16, Math.round((t.amountCents / maxAmt) * 45));
                                    const card = getCardInfo(t);

                                    return (
                                      <div
                                        key={t.id || idx}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '42px' }}
                                        title={`${t.date}: ${formatCurrency(t.amountCents)} via ${card.cardName}`}
                                      >
                                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                                          {formatCurrency(t.amountCents)}
                                        </span>
                                        <div
                                          style={{
                                            width: '18px',
                                            height: `${h}px`,
                                            backgroundColor: card.color,
                                            borderRadius: '3px 3px 0 0'
                                          }}
                                        />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', whiteSpace: 'nowrap' }}>
                                          {t.date.slice(5)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Detailed Billing Table */}
                              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                <table className="data-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-surface)' }}>
                                      <th style={{ padding: '0.5rem 0.85rem' }}>Billing Date</th>
                                      <th style={{ padding: '0.5rem 0.85rem' }}>Statement Descriptor</th>
                                      <th style={{ padding: '0.5rem 0.85rem' }}>Payment Card / Method</th>
                                      <th style={{ padding: '0.5rem 0.85rem', textAlign: 'right' }}>Amount Charged</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {txs.map((tx, idx) => {
                                      const card = getCardInfo(tx);
                                      const prevTx = txs[idx + 1];
                                      const isHike = prevTx && tx.amountCents > prevTx.amountCents;

                                      return (
                                        <tr key={tx.id}>
                                          <td style={{ padding: '0.55rem 0.85rem', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {tx.date}
                                          </td>
                                          <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)' }}>
                                            {tx.rawDescription}
                                          </td>
                                          <td style={{ padding: '0.55rem 0.85rem' }}>
                                            <span
                                              className="badge"
                                              style={{
                                                backgroundColor: `${card.color}22`,
                                                color: card.color,
                                                border: `1px solid ${card.color}44`,
                                                fontSize: '0.72rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                              }}
                                            >
                                              <CreditCard size={11} /> {card.cardName} {card.last4 ? `(*${card.last4})` : ''}
                                            </span>
                                          </td>
                                          <td
                                            className="money-cell money-positive"
                                            style={{
                                              padding: '0.55rem 0.85rem',
                                              textAlign: 'right',
                                              fontWeight: 700,
                                              color: isHike ? 'var(--warning)' : 'var(--text-primary)'
                                            }}
                                          >
                                            {formatCurrency(tx.amountCents)}
                                            {isHike && (
                                              <span style={{ fontSize: '0.68rem', color: 'var(--warning)', marginLeft: '4px' }}>
                                                (+{formatCurrency(tx.amountCents - prevTx.amountCents)})
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
