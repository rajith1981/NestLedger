import React, { useState } from 'react';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { DemoBanner } from './components/layout/DemoBanner';
import { FileUploadModal } from './components/import/FileUploadModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { TransactionListView } from './components/transactions/TransactionListView';
import { MonthlyTrackerView } from './components/trends/MonthlyTrackerView';
import { CategoryView } from './components/categories/CategoryView';
import { CheckingExpensesView } from './components/manual/CheckingExpensesView';
import { AddExpenseModal } from './components/manual/AddExpenseModal';
import { UtilitiesView } from './components/utilities/UtilitiesView';
import { EducationView } from './components/education/EducationView';
import { SubscriptionView } from './components/subscriptions/SubscriptionView';
import { InsightsView } from './components/insights/InsightsView';
import { SettingsView } from './components/settings/SettingsView';
import { TestSuiteView } from './components/tests/TestSuiteView';
import { useStatements } from './context/StatementContext';

export const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState<boolean>(false);
  const { isDemoData } = useStatements();

  return (
    <div className="app-container">
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <div className="main-content">
        {/* SPEC 12: Sample Data Banner if all loaded statements originate from seeded mock data */}
        {isDemoData && <DemoBanner onOpenUpload={() => setIsUploadOpen(true)} />}

        <Topbar
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAddExpense={() => setIsAddExpenseOpen(true)}
        />

        <main style={{ flex: 1 }}>
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

export default App;
