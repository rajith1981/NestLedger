import React, { useMemo } from 'react';
import { DollarSign, ShieldAlert, Sparkles, TrendingDown, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { simulateDebtPayoff } from '../../engine/payoffSimulator';

export const PayoffSimulator: React.FC = () => {
  const {
    latestStatement,
    activeStatement,
    accounts,
    userAdjustedPayoffPayment,
    setUserAdjustedPayoffPayment,
    customPayoffPaymentCents,
    setCustomPayoffPaymentCents
  } = useStatements();

  const currentStatement = activeStatement || latestStatement;
  const currentAccount = accounts.find(a => a.id === currentStatement?.accountId) || accounts[0];

  // SPEC 5: Dynamic inputs
  const currentBalanceCents = Math.max(0, currentStatement?.newBalance || 0);
  const minPaymentCents =
    currentStatement?.minPayment || Math.max(3500, Math.round(currentBalanceCents * 0.01));
  const aprPercent = currentAccount?.aprPurchase || 24.99;

  // Dynamic slider range
  const sliderMin = minPaymentCents;
  const sliderMax = Math.max(minPaymentCents * 10, currentBalanceCents, minPaymentCents + 5000);

  // Suggested payment
  const suggestedPaymentCents = Math.max(2 * minPaymentCents, Math.round(currentBalanceCents * 0.05));

  // Current active payment value
  const activePayment =
    userAdjustedPayoffPayment && customPayoffPaymentCents > 0
      ? customPayoffPaymentCents
      : suggestedPaymentCents;

  const simulation = useMemo(() => {
    return simulateDebtPayoff(currentBalanceCents, aprPercent, activePayment, minPaymentCents);
  }, [currentBalanceCents, aprPercent, activePayment, minPaymentCents]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setUserAdjustedPayoffPayment(true);
    setCustomPayoffPaymentCents(val);
  };

  if (!simulation || currentBalanceCents === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 1rem auto' }} />
        <h3 className="card-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
          Zero Statement Balance
        </h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto' }}>
          You have no outstanding credit card balance for this statement cycle. No debt payoff simulation is needed!
        </p>
      </div>
    );
  }

  const { minScenario, customScenario, suggestedScenario, interestSavedCents, monthsSaved } = simulation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner with Dynamic Card Context */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(26, 46, 76, 0.85) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="badge badge-neutral" style={{ marginBottom: '0.5rem' }}>
              {currentAccount?.name || 'Active Account'} • {aprPercent}% Purchase APR
            </span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Outstanding Balance to Pay Off</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 800, color: 'var(--brand-primary)' }}>
              {formatCurrency(currentBalanceCents)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Statement Min Due</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
                {formatCurrency(minPaymentCents)}/mo
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Accelerated Suggested (5%)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>
                {formatCurrency(suggestedPaymentCents)}/mo
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Payment Slider */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Adjust Monthly Payoff Contribution</h3>
            <p className="card-desc">Slide to see how extra monthly payments compress your payoff timeline</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
              {formatCurrency(activePayment)}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/month</span>
          </div>
        </div>

        <div style={{ padding: '1rem 0' }}>
          <input
            type="range"
            className="slider-control"
            min={sliderMin}
            max={sliderMax}
            step={500}
            value={activePayment}
            onChange={handleSliderChange}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <span>Min: {formatCurrency(sliderMin)}</span>
            <span>Suggested: {formatCurrency(suggestedPaymentCents)}</span>
            <span>Max: {formatCurrency(sliderMax)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setUserAdjustedPayoffPayment(true);
              setCustomPayoffPaymentCents(minPaymentCents);
            }}
          >
            Reset to Minimum ({formatCurrency(minPaymentCents)})
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setUserAdjustedPayoffPayment(true);
              setCustomPayoffPaymentCents(suggestedPaymentCents);
            }}
          >
            Set to Suggested ({formatCurrency(suggestedPaymentCents)})
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setUserAdjustedPayoffPayment(true);
              setCustomPayoffPaymentCents(Math.min(sliderMax, minPaymentCents + 10000));
            }}
          >
            +$100 Over Min ({formatCurrency(minPaymentCents + 10000)})
          </button>
        </div>
      </div>

      {/* Comparison Grid: Minimum vs Custom */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Minimum Payment Path */}
        <div className="card" style={{ borderColor: 'rgba(244, 63, 94, 0.3)' }}>
          <div className="card-header">
            <h4 style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Minimum Payment Schedule</h4>
            <span className="badge badge-danger">Slowest Path</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Payoff Duration</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700 }}>
                {minScenario.isPayable ? `${minScenario.monthsToPayoff} months` : 'Indefinite (Debt Grows)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {minScenario.isPayable ? `Approx ${(minScenario.monthsToPayoff / 12).toFixed(1)} years` : 'Interest exceeds minimum due'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Interest Paid</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--danger)' }}>
                  {minScenario.isPayable ? formatCurrency(minScenario.totalInterestCents) : 'Infinite'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Outflow</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {minScenario.isPayable ? formatCurrency(minScenario.totalPaidCents) : 'Infinite'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Selected Path */}
        <div className="card" style={{ borderColor: 'rgba(56, 189, 248, 0.4)', background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.8) 0%, rgba(20, 35, 60, 0.6) 100%)' }}>
          <div className="card-header">
            <h4 style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Selected Monthly Plan</h4>
            <span className="badge badge-success">
              <Sparkles size={12} /> Accelerated
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Payoff Duration</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                {customScenario.isPayable ? `${customScenario.monthsToPayoff} months` : 'Indefinite'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                {monthsSaved > 0 ? `Saves ${monthsSaved} months (${(monthsSaved / 12).toFixed(1)} yrs) off your debt` : 'Matches minimum timeline'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Interest Paid</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {formatCurrency(customScenario.totalInterestCents)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Interest Saved</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--success)' }}>
                  {formatCurrency(interestSavedCents)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Amortization Milestone Schedule */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">Amortization Milestone Schedule</h4>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Under selected {formatCurrency(activePayment)}/month plan
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Principal Paid</th>
                <th>Interest Paid</th>
                <th>Cumulative Interest</th>
                <th style={{ textAlign: 'right' }}>Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              {customScenario.schedule.map(pt => (
                <tr key={pt.month}>
                  <td style={{ fontWeight: 600 }}>Month {pt.month}</td>
                  <td style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(pt.principalPaidCents)}
                  </td>
                  <td style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(pt.interestPaidCents)}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(pt.totalInterestToDateCents)}
                  </td>
                  <td className="money-cell" style={{ color: pt.balanceCents === 0 ? 'var(--success)' : 'var(--text-primary)' }}>
                    {formatCurrency(pt.balanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
