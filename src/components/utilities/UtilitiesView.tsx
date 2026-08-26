import React, { useState, useMemo, useEffect } from 'react';
import {
  Zap,
  Droplets,
  Flame,
  Wifi,
  Smartphone,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  Search,
  Filter,
  ArrowUpDown,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Tag,
  Trash2,
  Layers,
  Sparkles,
  RefreshCw,
  GitCompare,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { detectCardName } from '../../engine/cardDetector';
import { NavTab } from '../layout/Sidebar';
import { Transaction } from '../../types/statement';

export type UtilityType =
  | 'WATER_SEWER'
  | 'ELECTRICITY'
  | 'NATURAL_GAS'
  | 'INTERNET_CABLE'
  | 'MOBILE_PHONE'
  | 'TRASH_RECYCLING'
  | 'OTHER_UTILITY';

export interface UtilityTypeMeta {
  id: UtilityType;
  label: string;
  shortLabel: string;
  color: string;
  iconName: string;
}

export const UTILITY_TYPES: Record<UtilityType, UtilityTypeMeta> = {
  WATER_SEWER: {
    id: 'WATER_SEWER',
    label: 'Water & Sewer',
    shortLabel: 'Water & Sewer',
    color: '#06b6d4', // Cyan
    iconName: 'Droplets'
  },
  ELECTRICITY: {
    id: 'ELECTRICITY',
    label: 'Electricity & Power',
    shortLabel: 'Electricity',
    color: '#eab308', // Amber / Gold
    iconName: 'Zap'
  },
  NATURAL_GAS: {
    id: 'NATURAL_GAS',
    label: 'Natural Gas & Heating',
    shortLabel: 'Natural Gas',
    color: '#ea580c', // Orange
    iconName: 'Flame'
  },
  INTERNET_CABLE: {
    id: 'INTERNET_CABLE',
    label: 'Internet & Cable / Broadband',
    shortLabel: 'Internet / Cable',
    color: '#8b5cf6', // Purple
    iconName: 'Wifi'
  },
  MOBILE_PHONE: {
    id: 'MOBILE_PHONE',
    label: 'Mobile Phone & Telecom',
    shortLabel: 'Mobile Phone',
    color: '#3b82f6', // Blue
    iconName: 'Smartphone'
  },
  TRASH_RECYCLING: {
    id: 'TRASH_RECYCLING',
    label: 'Trash & Waste',
    shortLabel: 'Trash & Waste',
    color: '#10b981', // Emerald
    iconName: 'Trash2'
  },
  OTHER_UTILITY: {
    id: 'OTHER_UTILITY',
    label: 'Other Municipal Utility',
    shortLabel: 'Other Utility',
    color: '#94a3b8', // Slate Gray
    iconName: 'Layers'
  }
};

export function inferDefaultUtilityType(merchantName: string, desc: string = ''): UtilityType {
  const text = `${merchantName} ${desc}`.toLowerCase();
  if (
    text.includes('water') ||
    text.includes('sewer') ||
    text.includes('summit cnty') ||
    text.includes('county utility') ||
    text.includes('aquarion') ||
    text.includes('american water')
  ) {
    return 'WATER_SEWER';
  }
  if (
    text.includes('electric') ||
    text.includes('firstenergy') ||
    text.includes('first energy') ||
    text.includes('ohio edison') ||
    text.includes('power') ||
    text.includes('pge') ||
    text.includes('coned') ||
    text.includes('edison')
  ) {
    return 'ELECTRICITY';
  }
  if (
    text.includes('gas') ||
    text.includes('dominion') ||
    text.includes('columbia gas') ||
    text.includes('nicor') ||
    text.includes('heating') ||
    text.includes('propane')
  ) {
    return 'NATURAL_GAS';
  }
  if (
    text.includes('internet') ||
    text.includes('spectrum') ||
    text.includes('comcast') ||
    text.includes('xfinity') ||
    text.includes('charter') ||
    text.includes('broadband') ||
    text.includes('fiber') ||
    text.includes('optimum') ||
    text.includes('cox')
  ) {
    return 'INTERNET_CABLE';
  }
  if (
    text.includes('verizon') ||
    text.includes('t-mobile') ||
    text.includes('tmobile') ||
    text.includes('at&t') ||
    text.includes('att wireless') ||
    text.includes('sprint') ||
    text.includes('cellular') ||
    text.includes('mobile') ||
    text.includes('mint mobile') ||
    text.includes('cricket') ||
    text.includes('phone')
  ) {
    return 'MOBILE_PHONE';
  }
  if (
    text.includes('waste') ||
    text.includes('trash') ||
    text.includes('republic') ||
    text.includes('wm') ||
    text.includes('sanitation')
  ) {
    return 'TRASH_RECYCLING';
  }
  return 'OTHER_UTILITY';
}

interface UtilitiesViewProps {
  onNavigate?: (tab: NavTab) => void;
}

export const UtilitiesView: React.FC<UtilitiesViewProps> = ({ onNavigate }) => {
  const { allTransactions, statements, accounts } = useStatements();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Load custom user labels from localStorage
  const [typeOverrides, setTypeOverrides] = useState<Record<string, UtilityType>>(() => {
    try {
      const saved = localStorage.getItem('utility_type_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleSetProviderType = (providerName: string, type: UtilityType) => {
    const updated = { ...typeOverrides, [providerName]: type };
    setTypeOverrides(updated);
    try {
      localStorage.setItem('utility_type_overrides', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist utility type override:', e);
    }
  };

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

  // Extract all utility & telecom transactions
  const allUtilityTxs = useMemo(() => {
    const isUtilityDesc = (desc: string) => {
      const u = desc.toUpperCase();
      return (
        u.includes('UTILITY') ||
        u.includes('UTILITIES') ||
        u.includes('SUMMIT CNTY') ||
        u.includes('FIRSTENERGY') ||
        u.includes('FIRST ENERGY') ||
        u.includes('DOMINION') ||
        u.includes('SPECTRUM') ||
        u.includes('COMCAST') ||
        u.includes('XFINITY') ||
        u.includes('AT&T') ||
        u.includes('VERIZON') ||
        u.includes('T-MOBILE') ||
        u.includes('ELECTRIC') ||
        u.includes('WATER') ||
        u.includes('GAS BILL') ||
        u.includes('SEWER') ||
        u.includes('POWER')
      );
    };

    return allTransactions.filter((tx) => {
      if (tx.amountCents <= 0 || tx.feeType || tx.type === 'PAYMENT') return false;
      return tx.categoryId === 'cat_utilities' || isUtilityDesc(tx.rawDescription);
    });
  }, [allTransactions]);

  // Dynamically extract available years that HAVE actual data
  const availableUtilityYears = useMemo(() => {
    const years = new Set<string>();
    for (const tx of allUtilityTxs) {
      if (tx.date && tx.date.length >= 4) {
        years.add(tx.date.slice(0, 4));
      }
    }
    return Array.from(years).sort().reverse(); // e.g. ['2026', '2025']
  }, [allUtilityTxs]);

  // Selected Year Scope State (default to latest available calendar year e.g. 2026)
  const [selectedYearScope, setSelectedYearScope] = useState<string>(() => {
    return '2026';
  });

  // Ensure selectedYearScope defaults cleanly to available year if not present
  useEffect(() => {
    if (availableUtilityYears.length > 0) {
      if (
        selectedYearScope !== 'ALL' &&
        selectedYearScope !== 'YOY' &&
        !availableUtilityYears.includes(selectedYearScope)
      ) {
        setSelectedYearScope(availableUtilityYears[0]);
      }
    }
  }, [availableUtilityYears, selectedYearScope]);

  // Filter transactions by selected year scope
  const utilityTxs = useMemo(() => {
    if (selectedYearScope === 'ALL' || selectedYearScope === 'YOY') {
      return allUtilityTxs;
    }
    return allUtilityTxs.filter((tx) => tx.date && tx.date.startsWith(selectedYearScope));
  }, [allUtilityTxs, selectedYearScope]);

  // Providers aggregation with effective UtilityType
  const providers = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        type: UtilityType;
        totalCents: number;
        count: number;
        txs: Transaction[];
        lastDate: string;
        firstDate: string;
        paymentMethods: Set<string>;
      }
    > = {};

    for (const tx of utilityTxs) {
      const name = tx.normalizedMerchant || 'Utility Provider';
      if (!map[name]) {
        const effectiveType = typeOverrides[name] || inferDefaultUtilityType(name, tx.rawDescription);
        map[name] = {
          name,
          type: effectiveType,
          totalCents: 0,
          count: 0,
          txs: [],
          lastDate: tx.date,
          firstDate: tx.date,
          paymentMethods: new Set()
        };
      }
      map[name].totalCents += tx.amountCents;
      map[name].count++;
      map[name].txs.push(tx);
      if (tx.date > map[name].lastDate) map[name].lastDate = tx.date;
      if (tx.date < map[name].firstDate) map[name].firstDate = tx.date;
      const card = getCardInfo(tx);
      map[name].paymentMethods.add(card.cardName);
    }

    // Sort transactions inside each provider descending by date
    for (const p of Object.values(map)) {
      p.txs.sort((a, b) => b.date.localeCompare(a.date));
      if (typeOverrides[p.name]) {
        p.type = typeOverrides[p.name];
      }
    }

    return Object.values(map).sort((a, b) => b.totalCents - a.totalCents);
  }, [utilityTxs, statementCardMap, accounts, typeOverrides]);

  // Provider Type Lookup Map
  const providerTypeMap = useMemo(() => {
    const map: Record<string, UtilityType> = {};
    for (const p of providers) {
      map[p.name] = p.type;
    }
    return map;
  }, [providers]);

  // Monthly breakdown with spending by UtilityType
  const monthlyBreakdown = useMemo(() => {
    const buckets: Record<
      string,
      {
        monthKey: string;
        label: string;
        totalCents: number;
        count: number;
        spendByType: Record<UtilityType, number>;
      }
    > = {};

    for (const tx of utilityTxs) {
      if (!tx.date) continue;
      const monthKey = tx.date.slice(0, 7);
      const merchantName = tx.normalizedMerchant || 'Utility Provider';
      const type =
        providerTypeMap[merchantName] ||
        typeOverrides[merchantName] ||
        inferDefaultUtilityType(merchantName, tx.rawDescription);

      if (!buckets[monthKey]) {
        const [y, m] = monthKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, 1);
        buckets[monthKey] = {
          monthKey,
          label:
            selectedYearScope === 'ALL'
              ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : dateObj.toLocaleDateString('en-US', { month: 'short' }),
          totalCents: 0,
          count: 0,
          spendByType: {
            WATER_SEWER: 0,
            ELECTRICITY: 0,
            NATURAL_GAS: 0,
            INTERNET_CABLE: 0,
            MOBILE_PHONE: 0,
            TRASH_RECYCLING: 0,
            OTHER_UTILITY: 0
          }
        };
      }
      buckets[monthKey].totalCents += tx.amountCents;
      buckets[monthKey].count++;
      buckets[monthKey].spendByType[type] = (buckets[monthKey].spendByType[type] || 0) + tx.amountCents;
    }

    return Object.values(buckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [utilityTxs, providerTypeMap, typeOverrides, selectedYearScope]);

  // Spend aggregated by UtilityType across current scope
  const spendByUtilityType = useMemo(() => {
    const totals: Record<UtilityType, { totalCents: number; count: number; providers: Set<string> }> = {
      WATER_SEWER: { totalCents: 0, count: 0, providers: new Set() },
      ELECTRICITY: { totalCents: 0, count: 0, providers: new Set() },
      NATURAL_GAS: { totalCents: 0, count: 0, providers: new Set() },
      INTERNET_CABLE: { totalCents: 0, count: 0, providers: new Set() },
      MOBILE_PHONE: { totalCents: 0, count: 0, providers: new Set() },
      TRASH_RECYCLING: { totalCents: 0, count: 0, providers: new Set() },
      OTHER_UTILITY: { totalCents: 0, count: 0, providers: new Set() }
    };

    for (const p of providers) {
      totals[p.type].totalCents += p.totalCents;
      totals[p.type].count += p.count;
      totals[p.type].providers.add(p.name);
    }

    return totals;
  }, [providers]);

  // Year-over-Year (YoY) Multi-Year Data Calculation
  const yoyData = useMemo(() => {
    if (availableUtilityYears.length < 2) return null;

    // Aggregates per year
    const yearTotals: Record<
      string,
      {
        year: string;
        totalCents: number;
        count: number;
        spendByType: Record<UtilityType, number>;
        monthlyTotals: Record<number, number>; // 1..12
      }
    > = {};

    for (const y of availableUtilityYears) {
      yearTotals[y] = {
        year: y,
        totalCents: 0,
        count: 0,
        spendByType: {
          WATER_SEWER: 0,
          ELECTRICITY: 0,
          NATURAL_GAS: 0,
          INTERNET_CABLE: 0,
          MOBILE_PHONE: 0,
          TRASH_RECYCLING: 0,
          OTHER_UTILITY: 0
        },
        monthlyTotals: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 }
      };
    }

    for (const tx of allUtilityTxs) {
      if (!tx.date || tx.date.length < 7) continue;
      const y = tx.date.slice(0, 4);
      const m = parseInt(tx.date.slice(5, 7), 10);
      if (!yearTotals[y]) continue;

      const merchantName = tx.normalizedMerchant || 'Utility Provider';
      const type =
        typeOverrides[merchantName] || inferDefaultUtilityType(merchantName, tx.rawDescription);

      yearTotals[y].totalCents += tx.amountCents;
      yearTotals[y].count++;
      yearTotals[y].spendByType[type] += tx.amountCents;
      if (m >= 1 && m <= 12) {
        yearTotals[y].monthlyTotals[m] += tx.amountCents;
      }
    }

    const sortedYears = [...availableUtilityYears].sort(); // Chronological e.g. 2025, 2026
    const latestYear = sortedYears[sortedYears.length - 1];
    const previousYear = sortedYears[sortedYears.length - 2];

    const latestTotal = yearTotals[latestYear]?.totalCents || 0;
    const prevTotal = yearTotals[previousYear]?.totalCents || 0;
    const deltaCents = latestTotal - prevTotal;
    const deltaPercent = prevTotal > 0 ? ((latestTotal - prevTotal) / prevTotal) * 100 : 0;

    return {
      years: sortedYears,
      yearTotals,
      latestYear,
      previousYear,
      latestTotal,
      prevTotal,
      deltaCents,
      deltaPercent
    };
  }, [allUtilityTxs, availableUtilityYears, typeOverrides]);

  // Summary Metrics
  const totalUtilitySpendCents = useMemo(() => {
    return utilityTxs.reduce((sum, tx) => sum + tx.amountCents, 0);
  }, [utilityTxs]);

  const activeMonthsCount = monthlyBreakdown.length || 1;
  const avgMonthlySpendCents = Math.round(totalUtilitySpendCents / activeMonthsCount);

  const highestMonth = useMemo(() => {
    if (monthlyBreakdown.length === 0) return null;
    return [...monthlyBreakdown].sort((a, b) => b.totalCents - a.totalCents)[0];
  }, [monthlyBreakdown]);

  // Filtered providers for the table
  const filteredProviders = useMemo(() => {
    let list = providers;
    if (selectedTypeFilter !== 'ALL') {
      list = list.filter((p) => p.type === selectedTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.txs.some((t) => t.rawDescription.toLowerCase().includes(q)) ||
          UTILITY_TYPES[p.type].label.toLowerCase().includes(q)
      );
    }
    if (selectedProvider) {
      list = list.filter((p) => p.name === selectedProvider);
    }
    return list;
  }, [providers, searchQuery, selectedProvider, selectedTypeFilter]);

  // Total summary for currently filtered providers in the table
  const filteredProvidersSummary = useMemo(() => {
    let totalCents = 0;
    let totalBills = 0;
    for (const p of filteredProviders) {
      totalCents += p.totalCents;
      totalBills += p.count;
    }
    const avgCostPerBill = totalBills > 0 ? Math.round(totalCents / totalBills) : 0;
    return {
      totalCents,
      totalBills,
      avgCostPerBill,
      count: filteredProviders.length
    };
  }, [filteredProviders]);

  const renderTypeIcon = (type: UtilityType, size = 16) => {
    switch (type) {
      case 'WATER_SEWER':
        return <Droplets size={size} color={UTILITY_TYPES.WATER_SEWER.color} />;
      case 'ELECTRICITY':
        return <Zap size={size} color={UTILITY_TYPES.ELECTRICITY.color} />;
      case 'NATURAL_GAS':
        return <Flame size={size} color={UTILITY_TYPES.NATURAL_GAS.color} />;
      case 'INTERNET_CABLE':
        return <Wifi size={size} color={UTILITY_TYPES.INTERNET_CABLE.color} />;
      case 'MOBILE_PHONE':
        return <Smartphone size={size} color={UTILITY_TYPES.MOBILE_PHONE.color} />;
      case 'TRASH_RECYCLING':
        return <Trash2 size={size} color={UTILITY_TYPES.TRASH_RECYCLING.color} />;
      default:
        return <Layers size={size} color={UTILITY_TYPES.OTHER_UTILITY.color} />;
    }
  };

  const toggleExpand = (providerName: string) => {
    setExpandedProvider((prev) => (prev === providerName ? null : providerName));
  };

  // Year colors for YoY comparisons
  const yearColors: Record<string, string> = {
    '2025': '#06b6d4', // Cyan
    '2026': '#0284c7', // Royal Blue
    '2027': '#8b5cf6', // Purple
    '2028': '#10b981'  // Emerald
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="page-wrapper">
      {/* Page Header with Year Scope Switcher */}
      <div
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={24} color="#06b6d4" /> Utilities & Telecom Tracker
          </h1>
          <p className="page-desc">
            {selectedYearScope === 'YOY'
              ? 'Multi-year comparative audit across Water, Electric, Gas, Internet, and Mobile Phone bills.'
              : `Tracking ${selectedYearScope === 'ALL' ? 'all' : selectedYearScope} Water, Electric, Gas, Internet, and Mobile Phone bills.`}
          </p>
        </div>

        {/* Dynamic Year Scope Selector - Shows ONLY years that have actual data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {availableUtilityYears.map((yr) => (
            <button
              key={yr}
              className={`btn btn-sm ${selectedYearScope === yr ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedYearScope(yr)}
              style={{ fontWeight: 600, fontSize: '0.8rem' }}
            >
              📅 {yr}
            </button>
          ))}

          {availableUtilityYears.length > 1 && (
            <>
              <button
                className={`btn btn-sm ${selectedYearScope === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedYearScope('ALL')}
                style={{ fontWeight: 600, fontSize: '0.8rem' }}
              >
                All Years Combined
              </button>

              <button
                className={`btn btn-sm ${selectedYearScope === 'YOY' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedYearScope('YOY')}
                style={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: selectedYearScope === 'YOY' ? '#0284c7' : undefined
                }}
              >
                <GitCompare size={14} /> Year-over-Year Comparison
              </button>
            </>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: YEAR-OVER-YEAR (YoY) COMPARISON VIEW */}
      {/* ======================================================== */}
      {selectedYearScope === 'YOY' && yoyData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '2rem' }}>
          {/* YoY Top Metrics Highlights */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">{yoyData.latestYear} Total Utilities Outflow</span>
                <DollarSign size={18} color="#0284c7" />
              </div>
              <div className="metric-value">{formatCurrency(yoyData.latestTotal)}</div>
              <div className="metric-subtitle">
                <span>Total spend in {yoyData.latestYear}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">{yoyData.previousYear} Total Utilities Outflow</span>
                <DollarSign size={18} color="#06b6d4" />
              </div>
              <div className="metric-value">{formatCurrency(yoyData.prevTotal)}</div>
              <div className="metric-subtitle">
                <span>Baseline spend in {yoyData.previousYear}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Year-over-Year Change</span>
                {yoyData.deltaCents > 0 ? (
                  <TrendingUp size={18} color="var(--warning)" />
                ) : (
                  <TrendingDown size={18} color="var(--success)" />
                )}
              </div>
              <div
                className="metric-value"
                style={{
                  color: yoyData.deltaCents > 0 ? 'var(--warning)' : 'var(--success)'
                }}
              >
                {yoyData.deltaCents >= 0 ? '+' : ''}
                {formatCurrency(yoyData.deltaCents)}
              </div>
              <div className="metric-subtitle">
                <span style={{ color: yoyData.deltaCents > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {yoyData.deltaPercent >= 0 ? '+' : ''}
                  {yoyData.deltaPercent.toFixed(1)}% vs {yoyData.previousYear}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Detected Annual Datasets</span>
                <Building size={18} color="#8b5cf6" />
              </div>
              <div className="metric-value">{yoyData.years.length} Years</div>
              <div className="metric-subtitle">
                <span>{yoyData.years.join(' vs ')}</span>
              </div>
            </div>
          </div>

          {/* Month-over-Month 12-Month Overlay Chart */}
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 className="card-title">12-Month Seasonal Comparison Overlay</h2>
                <p className="card-desc">Side-by-side monthly comparison to track seasonal shifts across years</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem' }}>
                {yoyData.years.map((yr) => (
                  <div key={yr} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: yearColors[yr] || '#0284c7'
                      }}
                    />
                    <strong>{yr}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', padding: '1.5rem 0.5rem 0.5rem', overflowX: 'auto' }}>
              {monthNames.map((mName, mIdx) => {
                const monthNum = mIdx + 1;
                const maxInMonth = Math.max(
                  ...yoyData.years.map((y) => yoyData.yearTotals[y]?.monthlyTotals[monthNum] || 0),
                  100
                );

                return (
                  <div
                    key={mName}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: '1 1 65px',
                      minWidth: '65px'
                    }}
                  >
                    {/* Side by side bars for each year */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '110px' }}>
                      {yoyData.years.map((yr) => {
                        const amt = yoyData.yearTotals[yr]?.monthlyTotals[monthNum] || 0;
                        const h = amt > 0 ? Math.max(8, Math.round((amt / 60000) * 90)) : 0;
                        const color = yearColors[yr] || '#0284c7';

                        return (
                          <div
                            key={yr}
                            style={{
                              width: '14px',
                              height: `${h}px`,
                              backgroundColor: color,
                              borderRadius: '2px 2px 0 0',
                              transition: 'height 0.2s ease'
                            }}
                            title={`${yr} ${mName}: ${formatCurrency(amt)}`}
                          />
                        );
                      })}
                    </div>

                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '8px' }}>
                      {mName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* YoY Spending Breakdown by Utility Classification */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Utility Type Year-over-Year Variance</h2>
                <p className="card-desc">Annual cost shifts for each utility classification</p>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Utility Classification</th>
                    {yoyData.years.map((yr) => (
                      <th key={yr} style={{ textAlign: 'right' }}>
                        {yr} Spend
                      </th>
                    ))}
                    <th style={{ textAlign: 'right' }}>YoY Change ($)</th>
                    <th style={{ textAlign: 'right' }}>YoY Change (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(UTILITY_TYPES) as UtilityType[]).map((typeKey) => {
                    const meta = UTILITY_TYPES[typeKey];
                    const latestAmt = yoyData.yearTotals[yoyData.latestYear]?.spendByType[typeKey] || 0;
                    const prevAmt = yoyData.yearTotals[yoyData.previousYear]?.spendByType[typeKey] || 0;

                    if (latestAmt === 0 && prevAmt === 0) return null;

                    const delta = latestAmt - prevAmt;
                    const pct = prevAmt > 0 ? (delta / prevAmt) * 100 : latestAmt > 0 ? 100 : 0;

                    return (
                      <tr key={typeKey}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                            {renderTypeIcon(typeKey, 16)}
                            <span>{meta.label}</span>
                          </div>
                        </td>

                        {yoyData.years.map((yr) => {
                          const amt = yoyData.yearTotals[yr]?.spendByType[typeKey] || 0;
                          return (
                            <td key={yr} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {formatCurrency(amt)}
                            </td>
                          );
                        })}

                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: delta > 0 ? 'var(--warning)' : delta < 0 ? 'var(--success)' : 'var(--text-muted)'
                          }}
                        >
                          {delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta)}
                        </td>

                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: delta > 0 ? 'var(--warning)' : delta < 0 ? 'var(--success)' : 'var(--text-muted)'
                          }}
                        >
                          {pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: SINGLE YEAR / ALL YEARS STANDARD VIEW */}
      {/* ======================================================== */}
      {selectedYearScope !== 'YOY' && (
        <>
          {/* Top Metrics Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">
                  {selectedYearScope === 'ALL' ? 'Total Utilities Outflow' : `${selectedYearScope} Utilities Outflow`}
                </span>
                <DollarSign size={18} color="#06b6d4" />
              </div>
              <div className="metric-value">{formatCurrency(totalUtilitySpendCents)}</div>
              <div className="metric-subtitle">
                <span>Across {utilityTxs.length} billing statements</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Average Monthly Utility Bill</span>
                <Calendar size={18} color="#06b6d4" />
              </div>
              <div className="metric-value">{formatCurrency(avgMonthlySpendCents)}</div>
              <div className="metric-subtitle">
                <span>Normalized over {activeMonthsCount} active months</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Active Utility Providers</span>
                <Building size={18} color="#06b6d4" />
              </div>
              <div className="metric-value">{providers.length}</div>
              <div className="metric-subtitle">
                <span>Distinct municipal & telecom accounts</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Peak Utility Month</span>
                <TrendingUp size={18} color="var(--warning)" />
              </div>
              <div className="metric-value" style={{ fontSize: '1.25rem' }}>
                {highestMonth ? `${highestMonth.label} (${formatCurrency(highestMonth.totalCents)})` : 'N/A'}
              </div>
              <div className="metric-subtitle">
                <span>Seasonal high outflow</span>
              </div>
            </div>
          </div>

          {/* Utility Types Breakdown Badges / Filter Bar */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
              Filter by Utility Type:
            </span>
            <button
              className={`btn btn-sm ${selectedTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem' }}
              onClick={() => setSelectedTypeFilter('ALL')}
            >
              All Utility Types ({formatCurrency(totalUtilitySpendCents)})
            </button>

            {(Object.keys(UTILITY_TYPES) as UtilityType[]).map((typeKey) => {
              const meta = UTILITY_TYPES[typeKey];
              const data = spendByUtilityType[typeKey];
              if (data.totalCents === 0 && selectedTypeFilter !== typeKey) return null;
              const isSelected = selectedTypeFilter === typeKey;

              return (
                <button
                  key={typeKey}
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.25rem 0.75rem',
                    border: isSelected ? `1px solid ${meta.color}` : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? meta.color : undefined,
                    color: isSelected ? '#fff' : undefined,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  onClick={() => setSelectedTypeFilter(isSelected ? 'ALL' : typeKey)}
                >
                  {renderTypeIcon(typeKey, 13)}
                  <span>{meta.shortLabel}</span>
                  <strong style={{ opacity: 0.9 }}>{formatCurrency(data.totalCents)}</strong>
                </button>
              );
            })}
          </div>

          {/* Monthly Outflow Trajectory - MULTI-TYPE STACKED BARS */}
          {monthlyBreakdown.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 className="card-title">
                    {selectedTypeFilter === 'ALL'
                      ? `Monthly Utility Spending Trajectory (${selectedYearScope === 'ALL' ? 'All Years' : selectedYearScope})`
                      : `${UTILITY_TYPES[selectedTypeFilter as UtilityType]?.label || 'Utility'} Spending Trajectory`}
                  </h2>
                  <p className="card-desc">
                    {selectedTypeFilter === 'ALL'
                      ? 'Color-coded by utility classification. Click any monthly bar to inspect bills for that month.'
                      : `Isolated monthly trend for ${UTILITY_TYPES[selectedTypeFilter as UtilityType]?.label}. Click "All Utility Types" to see full stack.`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedMonth && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedMonth(null)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Clear Month Filter ({selectedMonth})
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Stacked Chart Container */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem', padding: '1.25rem 0.5rem 0.5rem', overflowX: 'auto', minHeight: '180px' }}>
                {monthlyBreakdown.map((m) => {
                  const displayedSpend =
                    selectedTypeFilter === 'ALL'
                      ? m.totalCents
                      : m.spendByType[selectedTypeFilter as UtilityType] || 0;

                  const maxMonthSpend = Math.max(
                    ...monthlyBreakdown.map((b) =>
                      selectedTypeFilter === 'ALL'
                        ? b.totalCents
                        : b.spendByType[selectedTypeFilter as UtilityType] || 0
                    ),
                    100
                  );

                  const totalBarHeight = Math.max(16, Math.round((displayedSpend / maxMonthSpend) * 120));
                  const isSelected = selectedMonth === m.monthKey;

                  return (
                    <div
                      key={m.monthKey}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: '1 1 54px',
                        minWidth: '54px',
                        cursor: 'pointer',
                        transform: isSelected ? 'scale(1.06)' : 'none',
                        transition: 'transform 0.2s ease'
                      }}
                      onClick={() => setSelectedMonth(isSelected ? null : m.monthKey)}
                      title={`${m.label}: ${formatCurrency(displayedSpend)} total`}
                    >
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? '#06b6d4' : 'var(--text-secondary)',
                          marginBottom: '4px'
                        }}
                      >
                        {formatCurrency(displayedSpend)}
                      </span>

                      {/* Multi-segment Stacked Bar */}
                      <div
                        style={{
                          width: '28px',
                          height: `${totalBarHeight}px`,
                          display: 'flex',
                          flexDirection: 'column-reverse',
                          borderRadius: '4px 4px 0 0',
                          overflow: 'hidden',
                          boxShadow: isSelected ? '0 0 12px rgba(6, 182, 212, 0.6)' : 'none',
                          outline: isSelected ? '2px solid rgba(255, 255, 255, 0.8)' : 'none',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        {selectedTypeFilter === 'ALL' ? (
                          (Object.keys(UTILITY_TYPES) as UtilityType[]).map((typeKey) => {
                            const typeAmt = m.spendByType[typeKey] || 0;
                            if (typeAmt <= 0 || m.totalCents <= 0) return null;
                            const segmentHeightPercent = (typeAmt / m.totalCents) * 100;
                            const color = UTILITY_TYPES[typeKey].color;

                            return (
                              <div
                                key={typeKey}
                                style={{
                                  width: '100%',
                                  height: `${segmentHeightPercent}%`,
                                  backgroundColor: color,
                                  minHeight: '2px'
                                }}
                                title={`${UTILITY_TYPES[typeKey].shortLabel}: ${formatCurrency(typeAmt)}`}
                              />
                            );
                          })
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: UTILITY_TYPES[selectedTypeFilter as UtilityType]?.color || '#06b6d4'
                            }}
                          />
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? '#06b6d4' : 'var(--text-muted)',
                          marginTop: '6px'
                        }}
                      >
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Color Legend Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: '1.25rem',
                  marginTop: '1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)'
                }}
              >
                {(Object.keys(UTILITY_TYPES) as UtilityType[]).map((typeKey) => {
                  const meta = UTILITY_TYPES[typeKey];
                  const data = spendByUtilityType[typeKey];
                  if (data.totalCents === 0) return null;

                  return (
                    <div
                      key={typeKey}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                      onClick={() => setSelectedTypeFilter(selectedTypeFilter === typeKey ? 'ALL' : typeKey)}
                    >
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: meta.color }} />
                      <span style={{ fontWeight: selectedTypeFilter === typeKey ? 700 : 500, color: selectedTypeFilter === typeKey ? meta.color : undefined }}>
                        {meta.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Providers & Bills Ledger */}
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 className="card-title">Utility Providers & Classification Ledger</h2>
                <p className="card-desc">
                  Change any provider's label below to reclassify it between Water, Internet, Phone, Electric, Gas, etc. Click any row to view its complete billing history.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search utility bills..."
                    className="input-control"
                    style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '34px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {(selectedProvider || selectedMonth || selectedTypeFilter !== 'ALL') && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedProvider(null);
                      setSelectedMonth(null);
                      setSelectedTypeFilter('ALL');
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Utility Service Provider</th>
                    <th>Utility Classification / Type</th>
                    <th>Payment Cards / Methods</th>
                    <th>Last Billed Date</th>
                    <th>Average Bill</th>
                    <th style={{ textAlign: 'right' }}>Total Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No utility providers found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredProviders.map((p) => {
                      const isExpanded = expandedProvider === p.name;
                      const avgPerBill = Math.round(p.totalCents / p.count);
                      const providerTxs = selectedMonth
                        ? p.txs.filter((t) => t.date && t.date.startsWith(selectedMonth))
                        : p.txs;
                      const typeMeta = UTILITY_TYPES[p.type];

                      return (
                        <React.Fragment key={p.name}>
                          {/* Provider Master Row */}
                          <tr
                            onClick={() => toggleExpand(p.name)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isExpanded ? `${typeMeta.color}15` : undefined,
                              transition: 'background-color 0.15s ease'
                            }}
                            className="interactive-row"
                            title="Click to inspect all billing cycles for this provider"
                          >
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                              {isExpanded ? <ChevronUp size={16} color={typeMeta.color} /> : <ChevronDown size={16} />}
                            </td>

                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '6px',
                                    background: `${typeMeta.color}22`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  {renderTypeIcon(p.type, 16)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                    {p.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {p.count} bill{p.count === 1 ? '' : 's'} recorded • Click to inspect
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Interactive Type Selector Dropdown */}
                            <td onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <select
                                  value={p.type}
                                  onChange={(e) => handleSetProviderType(p.name, e.target.value as UtilityType)}
                                  className="input-control"
                                  style={{
                                    fontSize: '0.75rem',
                                    padding: '0.25rem 0.55rem',
                                    height: '30px',
                                    borderRadius: 'var(--radius-sm)',
                                    borderColor: `${typeMeta.color}66`,
                                    backgroundColor: `${typeMeta.color}15`,
                                    color: typeMeta.color,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                  title="Reclassify this utility provider"
                                >
                                  {(Object.keys(UTILITY_TYPES) as UtilityType[]).map((t) => (
                                    <option key={t} value={t} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                      {UTILITY_TYPES[t].label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>

                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {Array.from(p.paymentMethods).map((method) => (
                                  <span
                                    key={method}
                                    className="badge"
                                    style={{
                                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                      color: 'var(--text-secondary)',
                                      fontSize: '0.72rem',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <CreditCard size={11} /> {method}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.lastDate}</td>

                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                              {formatCurrency(avgPerBill)}/bill
                            </td>

                            <td className="money-cell" style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: typeMeta.color }}>
                              {formatCurrency(p.totalCents)}
                            </td>
                          </tr>

                          {/* Expanded Provider Drawer */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} style={{ padding: '0', backgroundColor: 'var(--bg-surface-raised)', borderBottom: '2px solid var(--border-subtle)' }}>
                                <div style={{ padding: '1.25rem 1.75rem', animation: 'fadeIn 0.2s ease-in-out' }}>
                                  {/* Top Details Header */}
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
                                        <span>{p.name} Billing History</span>
                                        <span className="badge" style={{ backgroundColor: `${typeMeta.color}25`, color: typeMeta.color, fontSize: '0.72rem' }}>
                                          {typeMeta.label}
                                        </span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                                          {p.count} Billing Cycles
                                        </span>
                                      </h3>
                                      <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Total spend: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(p.totalCents)}</strong> • Average:{' '}
                                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(avgPerBill)}</strong> per cycle
                                      </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.8rem' }}>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>First Bill: </span>
                                        <strong>{p.firstDate}</strong>
                                      </div>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Latest Bill: </span>
                                        <strong>{p.lastDate}</strong>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Mini Visual Trajectory Bars */}
                                  <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      Billing Occurrences Timeline
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', overflowX: 'auto', padding: '0.5rem 0' }}>
                                      {[...providerTxs].reverse().map((t, idx) => {
                                        const maxAmt = Math.max(...providerTxs.map((x) => x.amountCents), 100);
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
                                                backgroundColor: typeMeta.color,
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
                                          <th style={{ padding: '0.5rem 0.85rem', textAlign: 'right' }}>Amount Billed</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {providerTxs.map((tx) => {
                                          const card = getCardInfo(tx);

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
                                                  color: typeMeta.color
                                                }}
                                              >
                                                {formatCurrency(tx.amountCents)}
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

                {/* Total Filtered Sum Footer */}
                {filteredProviders.length > 0 && (
                  <tfoot>
                    <tr
                      style={{
                        background: 'var(--bg-surface-raised)',
                        borderTop: '2px solid var(--border-subtle)',
                        fontWeight: 700
                      }}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Σ</td>
                      <td colSpan={2} style={{ padding: '0.9rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 700 }}>
                            {selectedTypeFilter !== 'ALL' && UTILITY_TYPES[selectedTypeFilter as UtilityType]
                              ? `${UTILITY_TYPES[selectedTypeFilter as UtilityType].label} Total Sum`
                              : searchQuery.trim()
                              ? `Filtered Total Sum`
                              : `Total Utility Outflow`}
                          </span>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: selectedTypeFilter !== 'ALL' && UTILITY_TYPES[selectedTypeFilter as UtilityType] ? `${UTILITY_TYPES[selectedTypeFilter as UtilityType].color}25` : 'rgba(255, 255, 255, 0.08)',
                              color: selectedTypeFilter !== 'ALL' && UTILITY_TYPES[selectedTypeFilter as UtilityType] ? UTILITY_TYPES[selectedTypeFilter as UtilityType].color : 'var(--text-secondary)',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                          >
                            {filteredProvidersSummary.count} {filteredProvidersSummary.count === 1 ? 'Provider' : 'Providers'} • {filteredProvidersSummary.totalBills} Bills
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {selectedYearScope === 'ALL' ? 'All Recorded Cycles' : `${selectedYearScope} Calendar Year`}
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {filteredProviders.length > 0 ? 'Summary Total' : ''}
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.86rem' }}>
                        {formatCurrency(filteredProvidersSummary.avgCostPerBill)}/bill avg
                      </td>
                      <td
                        className="money-cell"
                        style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          fontSize: '1.15rem',
                          color: selectedTypeFilter !== 'ALL' && UTILITY_TYPES[selectedTypeFilter as UtilityType] ? UTILITY_TYPES[selectedTypeFilter as UtilityType].color : 'var(--brand-primary)',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.9rem 1rem'
                        }}
                      >
                        {formatCurrency(filteredProvidersSummary.totalCents)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Bottom Total Summary Banner */}
            {filteredProviders.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  padding: '0.85rem 1.25rem',
                  background: 'var(--bg-surface-raised)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Showing <strong>{filteredProvidersSummary.count}</strong> of {providers.length} utility providers (
                    <strong>{filteredProvidersSummary.totalBills}</strong> bill transactions)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Filtered Average: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(filteredProvidersSummary.avgCostPerBill)}/bill</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Total Filtered Sum:
                    </span>
                    <span
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        color: selectedTypeFilter !== 'ALL' && UTILITY_TYPES[selectedTypeFilter as UtilityType] ? UTILITY_TYPES[selectedTypeFilter as UtilityType].color : 'var(--brand-primary)'
                      }}
                    >
                      {formatCurrency(filteredProvidersSummary.totalCents)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
