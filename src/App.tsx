import React, { useState, Suspense, lazy } from 'react';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { DemoBanner } from './components/layout/DemoBanner';
import { FileUploadModal } from './components/import/FileUploadModal';
import { AddExpenseModal } from './components/manual/AddExpenseModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { useStatements } from './context/StatementContext';

// Lazy-load tab views for code-splitting and faster initial paint
const TransactionListView = lazy(() => import('./components/transactions/TransactionListView').then(m => ({ default: m.TransactionListView })));
const MonthlyTrackerView = lazy(() => import('./components/trends/MonthlyTrackerView').then(m => ({ default: m.MonthlyTrackerView })));
const CategoryView = lazy(() => import('./components/categories/CategoryView').then(m => ({ default: m.CategoryView })));
const CheckingExpensesView = lazy(() => import('./components/manual/CheckingExpensesView').then(m => ({ default: m.CheckingExpensesView })));
const UtilitiesView = lazy(() => import('./components/utilities/UtilitiesView').then(m => ({ default: m.UtilitiesView })));
const EducationView = lazy(() => import('./components/education/EducationView').then(m => ({ default: m.EducationView })));
const SubscriptionView = lazy(() => import('./components/subscriptions/SubscriptionView').then(m => ({ default: m.SubscriptionView })));
const InsightsView = lazy(() => import('./components/insights/InsightsView').then(m => ({ default: m.InsightsView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const TestSuiteView = lazy(() => import('./components/tests/TestSuiteView').then(m => ({ default: m.TestSuiteView })));

const TabLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    color: '#94a3b8',
    fontSize: '14px'
  }}>
    Loading view...
  </div>
);

export const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState<boolean>(false);
  const { isDemoData } = useStatements();

  return (
    <div className="app-container">
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <div className="main-content">
        {/* Sample Data Banner if all loaded statements originate from seeded mock data */}
        {isDemoData && <DemoBanner onOpenUpload={() => setIsUploadOpen(true)} />}

        <Topbar
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAddExpense={() => setIsAddExpenseOpen(true)}
        />

        <main style={{ flex: 1 }}>
          <Suspense fallback={<TabLoadingFallback />}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onNavigate={setCurrentTab}
                onOpenUpload={() => setIsUploadOpen(true)}
              />
            )}
            {currentTab === 'transactions' && <TransactionListView />}
            {currentTab === 'trends' && <MonthlyTrackerView onNavigate={setCurrentTab} />}
            {currentTab === 'categories' && <CategoryView onNavigate={setCurrentTab} />}
            {currentTab === 'utilities' && <UtilitiesView onNavigate={setCurrentTab} />}
            {currentTab === 'education' && <EducationView onNavigate={setCurrentTab} />}
            {currentTab === 'subscriptions' && <SubscriptionView />}
            {currentTab === 'checking' && <CheckingExpensesView onNavigate={setCurrentTab} />}
            {currentTab === 'insights' && <InsightsView />}
            {currentTab === 'settings' && <SettingsView />}
            {currentTab === 'tests' && <TestSuiteView />}
          </Suspense>
        </main>
      </div>

      <FileUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />

      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};
