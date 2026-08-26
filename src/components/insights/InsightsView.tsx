import React, { useState } from 'react';
import { LineChart, AlertTriangle, PieChart, Calculator } from 'lucide-react';
import { PayoffSimulator } from './PayoffSimulator';
import { FeeAnalysis } from './FeeAnalysis';
import { MerchantConcentration } from './MerchantConcentration';

export const InsightsView: React.FC = () => {
  const [activeInsightTab, setActiveInsightTab] = useState<'payoff' | 'fees' | 'concentration'>('payoff');

  return (
    <div className="page-wrapper">
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="card-title">Financial Intelligence & Insights</h2>
            <p className="card-desc">Debt payoff modeling, fee audit, and merchant concentration</p>
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            <button
              className={`btn btn-sm ${activeInsightTab === 'payoff' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveInsightTab('payoff')}
            >
              <Calculator size={14} /> Debt Payoff Simulator
            </button>
            <button
              className={`btn btn-sm ${activeInsightTab === 'fees' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveInsightTab('fees')}
            >
              <AlertTriangle size={14} /> Fee & Loss Audit
            </button>
            <button
              className={`btn btn-sm ${activeInsightTab === 'concentration' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setActiveInsightTab('concentration')}
            >
              <PieChart size={14} /> Concentration (Pareto)
            </button>
          </div>
        </div>
      </div>

      {activeInsightTab === 'payoff' && <PayoffSimulator />}
      {activeInsightTab === 'fees' && <FeeAnalysis />}
      {activeInsightTab === 'concentration' && <MerchantConcentration />}
    </div>
  );
};
