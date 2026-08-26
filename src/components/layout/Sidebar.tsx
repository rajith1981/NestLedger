import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  FolderTree,
  Zap,
  GraduationCap,
  Tv,
  Repeat,
  LineChart,
  Settings,
  ShieldCheck,
  TrendingUp,
  Landmark,
  Lock
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'transactions'
  | 'trends'
  | 'categories'
  | 'utilities'
  | 'education'
  | 'subscriptions'
  | 'checking'
  | 'insights'
  | 'settings'
  | 'tests';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'transactions', label: 'Transactions', icon: <Receipt size={18} /> },
    { id: 'trends', label: 'Monthly Tracker', icon: <TrendingUp size={18} /> },
    { id: 'categories', label: 'Category Breakdown', icon: <FolderTree size={18} /> },
    { id: 'utilities', label: 'Utilities & Telecom', icon: <Zap size={18} /> },
    { id: 'education', label: 'Education & Tuition', icon: <GraduationCap size={18} /> },
    { id: 'subscriptions', label: 'Digital Subscriptions', icon: <Tv size={18} /> },
    { id: 'checking', label: 'Checking & Bills', icon: <Landmark size={18} /> },
    { id: 'insights', label: 'Insights & Simulator', icon: <LineChart size={18} /> },
    { id: 'tests', label: 'Spec Test Suite', icon: <ShieldCheck size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> }
  ];

  return (
    <aside className="sidebar">
      <div className="brand-logo">
        <div className="brand-icon">
          <Receipt size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="brand-name">Statements</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>100% Offline Analyzer</span>
        </div>
        <span className="brand-badge">Local</span>
      </div>

      <nav className="nav-list">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item-btn ${currentTab === item.id ? 'active' : ''}`}
            onClick={() => onSelectTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
        <div
          style={{
            background: 'var(--bg-surface-raised)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)'
          }}
        >
          <Lock size={15} color="var(--success)" />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Air-Gapped Privacy</div>
            <div>IndexedDB Client-Only</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
