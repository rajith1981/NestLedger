import React, { useState, useMemo, useEffect } from 'react';
import {
  GraduationCap,
  Award,
  BookOpen,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  Search,
  Filter,
  Users,
  Building,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Bot,
  Laptop,
  Waves,
  Palette,
  Layers,
  GitCompare,
  TrendingDown
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { detectCardName } from '../../engine/cardDetector';
import { NavTab } from '../layout/Sidebar';
import { Transaction } from '../../types/statement';

export type EducationType =
  | 'SWIMMING'
  | 'MARTIAL_ARTS'
  | 'ROBOTICS_STEM'
  | 'SCHOOL_BASED'
  | 'LEARNING_PLATFORMS'
  | 'TUTORING_ACADEMIC'
  | 'ARTS_MUSIC'
  | 'OTHER_EDUCATION';

export interface EducationTypeMeta {
  id: EducationType;
  label: string;
  shortLabel: string;
  color: string;
  iconName: string;
}

export const EDUCATION_TYPES: Record<EducationType, EducationTypeMeta> = {
  MARTIAL_ARTS: {
    id: 'MARTIAL_ARTS',
    label: 'Martial Arts & Combat Sports',
    shortLabel: 'Martial Arts',
    color: '#f59e0b', // Amber / Gold
    iconName: 'Award'
  },
  SWIMMING: {
    id: 'SWIMMING',
    label: 'Swimming & Aquatics',
    shortLabel: 'Swimming',
    color: '#06b6d4', // Cyan
    iconName: 'Waves'
  },
  ROBOTICS_STEM: {
    id: 'ROBOTICS_STEM',
    label: 'Robotics, STEM & Coding',
    shortLabel: 'Robotics / STEM',
    color: '#8b5cf6', // Purple
    iconName: 'Bot'
  },
  SCHOOL_BASED: {
    id: 'SCHOOL_BASED',
    label: 'School-Based & Tuition',
    shortLabel: 'School / Tuition',
    color: '#0284c7', // Royal Blue
    iconName: 'GraduationCap'
  },
  LEARNING_PLATFORMS: {
    id: 'LEARNING_PLATFORMS',
    label: 'Learning Platforms & Online Courses',
    shortLabel: 'Learning Platforms',
    color: '#10b981', // Emerald
    iconName: 'Laptop'
  },
  TUTORING_ACADEMIC: {
    id: 'TUTORING_ACADEMIC',
    label: 'Tutoring & Academic Enrichment',
    shortLabel: 'Tutoring & Test Prep',
    color: '#ec4899', // Pink / Rose
    iconName: 'BookOpen'
  },
  ARTS_MUSIC: {
    id: 'ARTS_MUSIC',
    label: 'Arts, Music & Extracurriculars',
    shortLabel: 'Arts & Music',
    color: '#f97316', // Orange
    iconName: 'Palette'
  },
  OTHER_EDUCATION: {
    id: 'OTHER_EDUCATION',
    label: 'Other Education / General Training',
    shortLabel: 'Other Training',
    color: '#94a3b8', // Slate Gray
    iconName: 'Layers'
  }
};

export function inferDefaultEducationType(merchantName: string, desc: string = ''): EducationType {
  const text = `${merchantName} ${desc}`.toLowerCase();

  if (
    text.includes('swim') ||
    text.includes('aquatic') ||
    text.includes('pool') ||
    text.includes('goldfish') ||
    text.includes('water safety')
  ) {
    return 'SWIMMING';
  }
  if (
    text.includes('karate') ||
    text.includes('martial') ||
    text.includes('taekwondo') ||
    text.includes('dojo') ||
    text.includes('judo') ||
    text.includes('jiu jitsu') ||
    text.includes('kung fu') ||
    text.includes('boxing') ||
    text.includes('mma')
  ) {
    return 'MARTIAL_ARTS';
  }
  if (
    text.includes('moonpreneur') ||
    text.includes('robot') ||
    text.includes('stem') ||
    text.includes('code') ||
    text.includes('coding') ||
    text.includes('ai academy') ||
    text.includes('lego') ||
    text.includes('tech camp')
  ) {
    return 'ROBOTICS_STEM';
  }
  if (
    text.includes('coursera') ||
    text.includes('udemy') ||
    text.includes('edx') ||
    text.includes('linkedin learning') ||
    text.includes('skillshare') ||
    text.includes('pluralsight') ||
    text.includes('masterclass') ||
    text.includes('duolingo') ||
    text.includes('khan academy')
  ) {
    return 'LEARNING_PLATFORMS';
  }
  if (
    text.includes('kumon') ||
    text.includes('mathnasium') ||
    text.includes('tutor') ||
    text.includes('huntington') ||
    text.includes('sylvan') ||
    text.includes('sat prep') ||
    text.includes('act prep')
  ) {
    return 'TUTORING_ACADEMIC';
  }
  if (
    text.includes('music') ||
    text.includes('piano') ||
    text.includes('guitar') ||
    text.includes('dance') ||
    text.includes('ballet') ||
    text.includes('art studio') ||
    text.includes('theater') ||
    text.includes('drama')
  ) {
    return 'ARTS_MUSIC';
  }
  if (
    text.includes('tuition') ||
    text.includes('college') ||
    text.includes('university') ||
    text.includes('school') ||
    text.includes('preschool') ||
    text.includes('daycare') ||
    text.includes('montessori') ||
    text.includes('academy')
  ) {
    return 'SCHOOL_BASED';
  }

  return 'OTHER_EDUCATION';
}

interface EducationViewProps {
  onNavigate?: (tab: NavTab) => void;
}

export const EducationView: React.FC<EducationViewProps> = ({ onNavigate }) => {
  const { allTransactions, statements, accounts } = useStatements();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  // Load custom user labels from localStorage
  const [typeOverrides, setTypeOverrides] = useState<Record<string, EducationType>>(() => {
    try {
      const saved = localStorage.getItem('education_type_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleSetProgramType = (programName: string, type: EducationType) => {
    const updated = { ...typeOverrides, [programName]: type };
    setTypeOverrides(updated);
    try {
      localStorage.setItem('education_type_overrides', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist education type override:', e);
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

  // Extract all education & training transactions
  const allEducationTxs = useMemo(() => {
    const isEducationDesc = (desc: string) => {
      const u = desc.toUpperCase();
      return (
        u.includes('KARATE') ||
        u.includes('MARTIAL ARTS') ||
        u.includes('TAEKWONDO') ||
        u.includes('DOJO') ||
        u.includes('SWIM') ||
        u.includes('AQUATIC') ||
        u.includes('MOONPRENEUR') ||
        u.includes('ROBOT') ||
        u.includes('STEM') ||
        u.includes('CODING') ||
        u.includes('TUITION') ||
        u.includes('COLLEGE') ||
        u.includes('UNIVERSITY') ||
        u.includes('SCHOOL') ||
        u.includes('ACADEMY') ||
        u.includes('INSTITUTE') ||
        u.includes('TUTOR') ||
        u.includes('KUMON') ||
        u.includes('MATHNASIUM') ||
        u.includes('LESSONS') ||
        u.includes('COURSERA') ||
        u.includes('UDEMY') ||
        u.includes('MUSIC') ||
        u.includes('PIANO') ||
        u.includes('DANCE') ||
        u.includes('BALLET') ||
        u.includes('TEXTBOOK')
      );
    };

    return allTransactions.filter((tx) => {
      if (tx.amountCents <= 0 || tx.feeType || tx.type === 'PAYMENT') return false;
      return tx.categoryId === 'cat_education' || isEducationDesc(tx.rawDescription);
    });
  }, [allTransactions]);

  // Dynamically extract available years that HAVE actual data
  const availableEducationYears = useMemo(() => {
    const years = new Set<string>();
    for (const tx of allEducationTxs) {
      if (tx.date && tx.date.length >= 4) {
        years.add(tx.date.slice(0, 4));
      }
    }
    return Array.from(years).sort().reverse(); // e.g. ['2026', '2025']
  }, [allEducationTxs]);

  // Selected Year Scope State (default to latest available calendar year e.g. 2026)
  const [selectedYearScope, setSelectedYearScope] = useState<string>(() => {
    return '2026';
  });

  // Ensure selectedYearScope defaults cleanly to available year if not present
  useEffect(() => {
    if (availableEducationYears.length > 0) {
      if (
        selectedYearScope !== 'ALL' &&
        selectedYearScope !== 'YOY' &&
        !availableEducationYears.includes(selectedYearScope)
      ) {
        setSelectedYearScope(availableEducationYears[0]);
      }
    }
  }, [availableEducationYears, selectedYearScope]);

  // Filter transactions by selected year scope
  const educationTxs = useMemo(() => {
    if (selectedYearScope === 'ALL' || selectedYearScope === 'YOY') {
      return allEducationTxs;
    }
    return allEducationTxs.filter((tx) => tx.date && tx.date.startsWith(selectedYearScope));
  }, [allEducationTxs, selectedYearScope]);

  // Group by Program / Institute with effective EducationType
  const programs = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        type: EducationType;
        totalCents: number;
        count: number;
        txs: Transaction[];
        lastDate: string;
        firstDate: string;
        paymentMethods: Set<string>;
      }
    > = {};

    for (const tx of educationTxs) {
      const name = tx.normalizedMerchant || 'Education Program';
      if (!map[name]) {
        const effectiveType = typeOverrides[name] || inferDefaultEducationType(name, tx.rawDescription);
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

    // Sort transactions inside each program descending by date
    for (const p of Object.values(map)) {
      p.txs.sort((a, b) => b.date.localeCompare(a.date));
      if (typeOverrides[p.name]) {
        p.type = typeOverrides[p.name];
      }
    }

    return Object.values(map).sort((a, b) => b.totalCents - a.totalCents);
  }, [educationTxs, statementCardMap, accounts, typeOverrides]);

  // Program Type Lookup Map
  const programTypeMap = useMemo(() => {
    const map: Record<string, EducationType> = {};
    for (const p of programs) {
      map[p.name] = p.type;
    }
    return map;
  }, [programs]);

  // Monthly breakdown with spending by EducationType
  const monthlyBreakdown = useMemo(() => {
    const buckets: Record<
      string,
      {
        monthKey: string;
        label: string;
        totalCents: number;
        count: number;
        spendByType: Record<EducationType, number>;
      }
    > = {};

    for (const tx of educationTxs) {
      if (!tx.date) continue;
      const monthKey = tx.date.slice(0, 7);
      const merchantName = tx.normalizedMerchant || 'Education Program';
      const type =
        programTypeMap[merchantName] ||
        typeOverrides[merchantName] ||
        inferDefaultEducationType(merchantName, tx.rawDescription);

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
            MARTIAL_ARTS: 0,
            SWIMMING: 0,
            ROBOTICS_STEM: 0,
            SCHOOL_BASED: 0,
            LEARNING_PLATFORMS: 0,
            TUTORING_ACADEMIC: 0,
            ARTS_MUSIC: 0,
            OTHER_EDUCATION: 0
          }
        };
      }
      buckets[monthKey].totalCents += tx.amountCents;
      buckets[monthKey].count++;
      buckets[monthKey].spendByType[type] = (buckets[monthKey].spendByType[type] || 0) + tx.amountCents;
    }

    return Object.values(buckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [educationTxs, programTypeMap, typeOverrides, selectedYearScope]);

  // Spend aggregated by EducationType across current scope
  const spendByEducationType = useMemo(() => {
    const totals: Record<EducationType, { totalCents: number; count: number; programs: Set<string> }> = {
      MARTIAL_ARTS: { totalCents: 0, count: 0, programs: new Set() },
      SWIMMING: { totalCents: 0, count: 0, programs: new Set() },
      ROBOTICS_STEM: { totalCents: 0, count: 0, programs: new Set() },
      SCHOOL_BASED: { totalCents: 0, count: 0, programs: new Set() },
      LEARNING_PLATFORMS: { totalCents: 0, count: 0, programs: new Set() },
      TUTORING_ACADEMIC: { totalCents: 0, count: 0, programs: new Set() },
      ARTS_MUSIC: { totalCents: 0, count: 0, programs: new Set() },
      OTHER_EDUCATION: { totalCents: 0, count: 0, programs: new Set() }
    };

    for (const p of programs) {
      totals[p.type].totalCents += p.totalCents;
      totals[p.type].count += p.count;
      totals[p.type].programs.add(p.name);
    }

    return totals;
  }, [programs]);

  // Year-over-Year (YoY) Multi-Year Data Calculation
  const yoyData = useMemo(() => {
    if (availableEducationYears.length < 2) return null;

    const yearTotals: Record<
      string,
      {
        year: string;
        totalCents: number;
        count: number;
        spendByType: Record<EducationType, number>;
        monthlyTotals: Record<number, number>; // 1..12
      }
    > = {};

    for (const y of availableEducationYears) {
      yearTotals[y] = {
        year: y,
        totalCents: 0,
        count: 0,
        spendByType: {
          MARTIAL_ARTS: 0,
          SWIMMING: 0,
          ROBOTICS_STEM: 0,
          SCHOOL_BASED: 0,
          LEARNING_PLATFORMS: 0,
          TUTORING_ACADEMIC: 0,
          ARTS_MUSIC: 0,
          OTHER_EDUCATION: 0
        },
        monthlyTotals: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 }
      };
    }

    for (const tx of allEducationTxs) {
      if (!tx.date || tx.date.length < 7) continue;
      const y = tx.date.slice(0, 4);
      const m = parseInt(tx.date.slice(5, 7), 10);
      if (!yearTotals[y]) continue;

      const merchantName = tx.normalizedMerchant || 'Education Program';
      const type =
        typeOverrides[merchantName] || inferDefaultEducationType(merchantName, tx.rawDescription);

      yearTotals[y].totalCents += tx.amountCents;
      yearTotals[y].count++;
      yearTotals[y].spendByType[type] += tx.amountCents;
      if (m >= 1 && m <= 12) {
        yearTotals[y].monthlyTotals[m] += tx.amountCents;
      }
    }

    const sortedYears = [...availableEducationYears].sort();
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
  }, [allEducationTxs, availableEducationYears, typeOverrides]);

  // Summary Metrics
  const totalEducationSpendCents = useMemo(() => {
    return educationTxs.reduce((sum, tx) => sum + tx.amountCents, 0);
  }, [educationTxs]);

  const activeMonthsCount = monthlyBreakdown.length || 1;
  const avgMonthlySpendCents = Math.round(totalEducationSpendCents / activeMonthsCount);

  // Filtered programs for table
  const filteredPrograms = useMemo(() => {
    let list = programs;
    if (selectedTypeFilter !== 'ALL') {
      list = list.filter((p) => p.type === selectedTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.txs.some((t) => t.rawDescription.toLowerCase().includes(q)) ||
          EDUCATION_TYPES[p.type].label.toLowerCase().includes(q)
      );
    }
    if (selectedProgram) {
      list = list.filter((p) => p.name === selectedProgram);
    }
    return list;
  }, [programs, searchQuery, selectedProgram, selectedTypeFilter]);

  // Total summary for currently filtered programs in the table
  const filteredProgramsSummary = useMemo(() => {
    let totalCents = 0;
    let totalSessions = 0;
    for (const p of filteredPrograms) {
      totalCents += p.totalCents;
      totalSessions += p.count;
    }
    const avgCostPerPmt = totalSessions > 0 ? Math.round(totalCents / totalSessions) : 0;
    return {
      totalCents,
      totalSessions,
      avgCostPerPmt,
      count: filteredPrograms.length
    };
  }, [filteredPrograms]);

  const renderTypeIcon = (type: EducationType, size = 16) => {
    switch (type) {
      case 'MARTIAL_ARTS':
        return <Award size={size} color={EDUCATION_TYPES.MARTIAL_ARTS.color} />;
      case 'SWIMMING':
        return <Waves size={size} color={EDUCATION_TYPES.SWIMMING.color} />;
      case 'ROBOTICS_STEM':
        return <Bot size={size} color={EDUCATION_TYPES.ROBOTICS_STEM.color} />;
      case 'SCHOOL_BASED':
        return <GraduationCap size={size} color={EDUCATION_TYPES.SCHOOL_BASED.color} />;
      case 'LEARNING_PLATFORMS':
        return <Laptop size={size} color={EDUCATION_TYPES.LEARNING_PLATFORMS.color} />;
      case 'TUTORING_ACADEMIC':
        return <BookOpen size={size} color={EDUCATION_TYPES.TUTORING_ACADEMIC.color} />;
      case 'ARTS_MUSIC':
        return <Palette size={size} color={EDUCATION_TYPES.ARTS_MUSIC.color} />;
      default:
        return <Layers size={size} color={EDUCATION_TYPES.OTHER_EDUCATION.color} />;
    }
  };

  const toggleExpand = (programName: string) => {
    setExpandedProgram((prev) => (prev === programName ? null : programName));
  };

  const yearColors: Record<string, string> = {
    '2025': '#06b6d4',
    '2026': '#0284c7',
    '2027': '#8b5cf6',
    '2028': '#10b981'
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="page-wrapper">
      {/* Page Header with Dynamic Year Switcher */}
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
            <GraduationCap size={24} color="#0284c7" /> Education & Tuition Tracker
          </h1>
          <p className="page-desc">
            {selectedYearScope === 'YOY'
              ? 'Multi-year comparative audit across Swimming, Martial Arts, Robotics, School Tuition, and Learning Platforms.'
              : `Tracking ${selectedYearScope === 'ALL' ? 'all' : selectedYearScope} Swimming, Martial Arts, Robotics, School Tuition, and Learning Platforms.`}
          </p>
        </div>

        {/* Dynamic Year Scope Selector - Shows ONLY years that have actual data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {availableEducationYears.map((yr) => (
            <button
              key={yr}
              className={`btn btn-sm ${selectedYearScope === yr ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedYearScope(yr)}
              style={{ fontWeight: 600, fontSize: '0.8rem' }}
            >
              📅 {yr}
            </button>
          ))}

          {availableEducationYears.length > 1 && (
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
                <span className="metric-label">{yoyData.latestYear} Total Education Investment</span>
                <DollarSign size={18} color="#0284c7" />
              </div>
              <div className="metric-value">{formatCurrency(yoyData.latestTotal)}</div>
              <div className="metric-subtitle">
                <span>Total learning investment in {yoyData.latestYear}</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">{yoyData.previousYear} Total Education Investment</span>
                <DollarSign size={18} color="#06b6d4" />
              </div>
              <div className="metric-value">{formatCurrency(yoyData.prevTotal)}</div>
              <div className="metric-subtitle">
                <span>Baseline investment in {yoyData.previousYear}</span>
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
                <p className="card-desc">Side-by-side monthly comparison to track learning investments across years</p>
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
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '110px' }}>
                      {yoyData.years.map((yr) => {
                        const amt = yoyData.yearTotals[yr]?.monthlyTotals[monthNum] || 0;
                        const h = amt > 0 ? Math.max(8, Math.round((amt / 50000) * 90)) : 0;
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

          {/* YoY Spending Breakdown by Education Discipline */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Education Discipline Year-over-Year Variance</h2>
                <p className="card-desc">Annual cost shifts for each education and coaching activity</p>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Education Discipline</th>
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
                  {(Object.keys(EDUCATION_TYPES) as EducationType[]).map((typeKey) => {
                    const meta = EDUCATION_TYPES[typeKey];
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
                  {selectedYearScope === 'ALL' ? 'Total Education Investment' : `${selectedYearScope} Education Investment`}
                </span>
                <DollarSign size={18} color="#0284c7" />
              </div>
              <div className="metric-value">{formatCurrency(totalEducationSpendCents)}</div>
              <div className="metric-subtitle">
                <span>Across {educationTxs.length} tuition & coaching sessions</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Average Monthly Investment</span>
                <Calendar size={18} color="#0284c7" />
              </div>
              <div className="metric-value">{formatCurrency(avgMonthlySpendCents)}</div>
              <div className="metric-subtitle">
                <span>Normalized across {activeMonthsCount} active months</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Enrolled Programs / Academies</span>
                <Building size={18} color="#0284c7" />
              </div>
              <div className="metric-value">{programs.length}</div>
              <div className="metric-subtitle">
                <span>Active institutions and learning centers</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label-row">
                <span className="metric-label">Latest Investment</span>
                <CheckCircle2 size={18} color="var(--success)" />
              </div>
              <div className="metric-value" style={{ fontSize: '1.25rem' }}>
                {educationTxs[0] ? formatCurrency(educationTxs[0].amountCents) : '$0.00'}
              </div>
              <div className="metric-subtitle">
                <span>{educationTxs[0] ? `${educationTxs[0].normalizedMerchant} on ${educationTxs[0].date}` : 'No records'}</span>
              </div>
            </div>
          </div>

          {/* Education Disciplines Filter Badges */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
              Filter by Activity:
            </span>
            <button
              className={`btn btn-sm ${selectedTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem' }}
              onClick={() => setSelectedTypeFilter('ALL')}
            >
              All Activities ({formatCurrency(totalEducationSpendCents)})
            </button>

            {(Object.keys(EDUCATION_TYPES) as EducationType[]).map((typeKey) => {
              const meta = EDUCATION_TYPES[typeKey];
              const data = spendByEducationType[typeKey];
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
                      ? `Monthly Education Outflow Trajectory (${selectedYearScope === 'ALL' ? 'All Years' : selectedYearScope})`
                      : `${EDUCATION_TYPES[selectedTypeFilter as EducationType]?.label || 'Education'} Spending Trajectory`}
                  </h2>
                  <p className="card-desc">
                    {selectedTypeFilter === 'ALL'
                      ? 'Color-coded by learning discipline. Click any monthly bar to highlight payments for that month.'
                      : `Isolated monthly trend for ${EDUCATION_TYPES[selectedTypeFilter as EducationType]?.label}. Click "All Activities" to see full stack.`}
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
                      : m.spendByType[selectedTypeFilter as EducationType] || 0;

                  const maxMonthSpend = Math.max(
                    ...monthlyBreakdown.map((b) =>
                      selectedTypeFilter === 'ALL'
                        ? b.totalCents
                        : b.spendByType[selectedTypeFilter as EducationType] || 0
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
                          color: isSelected ? '#0284c7' : 'var(--text-secondary)',
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
                          boxShadow: isSelected ? '0 0 12px rgba(2, 132, 199, 0.6)' : 'none',
                          outline: isSelected ? '2px solid rgba(255, 255, 255, 0.8)' : 'none',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        {selectedTypeFilter === 'ALL' ? (
                          (Object.keys(EDUCATION_TYPES) as EducationType[]).map((typeKey) => {
                            const typeAmt = m.spendByType[typeKey] || 0;
                            if (typeAmt <= 0 || m.totalCents <= 0) return null;
                            const segmentHeightPercent = (typeAmt / m.totalCents) * 100;
                            const color = EDUCATION_TYPES[typeKey].color;

                            return (
                              <div
                                key={typeKey}
                                style={{
                                  width: '100%',
                                  height: `${segmentHeightPercent}%`,
                                  backgroundColor: color,
                                  minHeight: '2px'
                                }}
                                title={`${EDUCATION_TYPES[typeKey].shortLabel}: ${formatCurrency(typeAmt)}`}
                              />
                            );
                          })
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: EDUCATION_TYPES[selectedTypeFilter as EducationType]?.color || '#0284c7'
                            }}
                          />
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? '#0284c7' : 'var(--text-muted)',
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
                {(Object.keys(EDUCATION_TYPES) as EducationType[]).map((typeKey) => {
                  const meta = EDUCATION_TYPES[typeKey];
                  const data = spendByEducationType[typeKey];
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

          {/* Interactive Programs & Tuition Ledger */}
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 className="card-title">Institutions, Academies & Tuition History</h2>
                <p className="card-desc">
                  Reclassify any program between Swim, Martial Arts, Robotics, School, Learning Platform, Tutoring, etc. Click any row to view its complete payment history.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search education payments..."
                    className="input-control"
                    style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '34px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {(selectedProgram || selectedMonth || selectedTypeFilter !== 'ALL') && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedProgram(null);
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
                    <th>Institution / Academy</th>
                    <th>Activity Classification</th>
                    <th>Payment Cards / Methods</th>
                    <th>Last Payment Date</th>
                    <th>Average Cost / Pmt</th>
                    <th style={{ textAlign: 'right' }}>Total Investment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrograms.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No education programs found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredPrograms.map((p) => {
                      const isExpanded = expandedProgram === p.name;
                      const avgPerPayment = Math.round(p.totalCents / p.count);
                      const programTxs = selectedMonth
                        ? p.txs.filter((t) => t.date && t.date.startsWith(selectedMonth))
                        : p.txs;
                      const typeMeta = EDUCATION_TYPES[p.type];

                      return (
                        <React.Fragment key={p.name}>
                          {/* Program Master Row */}
                          <tr
                            onClick={() => toggleExpand(p.name)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isExpanded ? `${typeMeta.color}15` : undefined,
                              transition: 'background-color 0.15s ease'
                            }}
                            className="interactive-row"
                            title="Click to inspect all payments for this program"
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
                                    {p.count} session{p.count === 1 ? '' : 's'} / payments • Click to inspect
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Interactive Type Selector Dropdown */}
                            <td onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <select
                                  value={p.type}
                                  onChange={(e) => handleSetProgramType(p.name, e.target.value as EducationType)}
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
                                  title="Reclassify this learning program"
                                >
                                  {(Object.keys(EDUCATION_TYPES) as EducationType[]).map((t) => (
                                    <option key={t} value={t} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                      {EDUCATION_TYPES[t].label}
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
                              {formatCurrency(avgPerPayment)}/pmt
                            </td>

                            <td className="money-cell" style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: typeMeta.color }}>
                              {formatCurrency(p.totalCents)}
                            </td>
                          </tr>

                          {/* Expanded Program Drawer */}
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
                                        <span>{p.name} Payment History</span>
                                        <span className="badge" style={{ backgroundColor: `${typeMeta.color}25`, color: typeMeta.color, fontSize: '0.72rem' }}>
                                          {typeMeta.label}
                                        </span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                                          {p.count} Sessions / Payments
                                        </span>
                                      </h3>
                                      <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Total investment: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(p.totalCents)}</strong> • Average:{' '}
                                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(avgPerPayment)}</strong> per session
                                      </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.8rem' }}>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>First Payment: </span>
                                        <strong>{p.firstDate}</strong>
                                      </div>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Latest Payment: </span>
                                        <strong>{p.lastDate}</strong>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Mini Visual Trajectory Bars */}
                                  <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      Payment Occurrences Timeline
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', overflowX: 'auto', padding: '0.5rem 0' }}>
                                      {[...programTxs].reverse().map((t, idx) => {
                                        const maxAmt = Math.max(...programTxs.map((x) => x.amountCents), 100);
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

                                  {/* Detailed Payments Table */}
                                  <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                    <table className="data-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr style={{ background: 'var(--bg-surface)' }}>
                                          <th style={{ padding: '0.5rem 0.85rem' }}>Payment Date</th>
                                          <th style={{ padding: '0.5rem 0.85rem' }}>Statement Descriptor</th>
                                          <th style={{ padding: '0.5rem 0.85rem' }}>Payment Card / Method</th>
                                          <th style={{ padding: '0.5rem 0.85rem', textAlign: 'right' }}>Amount Paid</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {programTxs.map((tx) => {
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
                {filteredPrograms.length > 0 && (
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
                            {selectedTypeFilter !== 'ALL' && EDUCATION_TYPES[selectedTypeFilter as EducationType]
                              ? `${EDUCATION_TYPES[selectedTypeFilter as EducationType].label} Total Sum`
                              : searchQuery.trim()
                              ? `Filtered Total Sum`
                              : `Total Education Outflow`}
                          </span>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: selectedTypeFilter !== 'ALL' && EDUCATION_TYPES[selectedTypeFilter as EducationType] ? `${EDUCATION_TYPES[selectedTypeFilter as EducationType].color}25` : 'rgba(255, 255, 255, 0.08)',
                              color: selectedTypeFilter !== 'ALL' && EDUCATION_TYPES[selectedTypeFilter as EducationType] ? EDUCATION_TYPES[selectedTypeFilter as EducationType].color : 'var(--text-secondary)',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                          >
                            {filteredProgramsSummary.count} {filteredProgramsSummary.count === 1 ? 'Program' : 'Programs'} • {filteredProgramsSummary.totalSessions} Sessions
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {selectedYearScope === 'ALL' ? 'All Recorded Cycles' : `${selectedYearScope} Calendar Year`}
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {filteredPrograms.length > 0 ? 'Summary Total' : ''}
                      </td>
                      <td style={{ padding: '0.9rem 0.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.86rem' }}>
                        {formatCurrency(filteredProgramsSummary.avgCostPerPmt)}/pmt avg
                      </td>
                      <td
                        className="money-cell"
                        style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          fontSize: '1.15rem',
                          color: selectedTypeFilter !== 'ALL' && EDUCATION_TYPES[selectedTypeFilter as EducationType] ? EDUCATION_TYPES[selectedTypeFilter as EducationType].color : 'var(--brand-primary)',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.9rem 1rem'
                        }}
                      >
                        {formatCurrency(filteredProgramsSummary.totalCents)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Bottom Total Summary Banner */}
            {filteredPrograms.length > 0 && (
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
                    Showing <strong>{filteredProgramsSummary.count}</strong> of {programs.length} programs (
                    <strong>{filteredProgramsSummary.totalSessions}</strong> payment transactions)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Filtered Average: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(filteredProgramsSummary.avgCostPerPmt)}/session</strong>
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
                        color: selectedTypeFilter !== 'ALL' && EDUCATION_TYPES[selectedTypeFilter as EducationType] ? EDUCATION_TYPES[selectedTypeFilter as EducationType].color : 'var(--brand-primary)'
                      }}
                    >
                      {formatCurrency(filteredProgramsSummary.totalCents)}
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
