import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Account, Category, CategoryRule, Goal, Statement, Transaction } from '../types/statement';
import {
  computeSourceHash,
  getAllAccounts,
  getAllCategories,
  getAllGoals,
  getAllRules,
  getAllStatements,
  getAllTransactions,
  getTransactionsByStatement,
  importStatementAndTransactions,
  updateTransactionCategory,
  wipeAllLocalData,
  saveCategory,
  saveRule,
  deleteRule,
  saveGoal,
  deleteGoal,
  saveAccount,
  saveManualTransaction,
  deleteManualTransaction,
  deleteStatement as removeStatementFromDb,
  renameStatement as renameStatementInDb,
  updateStatement,
  recategorizeAllTransactions,
  applyCategoryToMatchingTransactions,
  restoreBackupData
} from '../db/repository';
import { openDatabase } from '../db';
import { parseCsvStatement } from '../engine/csvParser';
import { extractTextFromPdf, parseTextStatement, isPaymentOrCreditDesc } from '../engine/pdfParser';
import { parseOfxStatement } from '../engine/ofxParser';
import { extractMerchantSignature } from '../engine/merchantNormalizer';
import { isStatementDuplicate } from '../engine/reconciliation';
import { detectCardName } from '../engine/cardDetector';

export interface BatchFileResult {
  fileName: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
  message: string;
  transactionsCount?: number;
}

export interface BatchImportSummary {
  totalFiles: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  totalTransactionsInserted: number;
  fileResults: BatchFileResult[];
}

export interface MonthOption {
  monthKey: string; // "2026-07"
  monthLabel: string; // "July 2026"
  year: number;
  totalSpendCents: number;
  txCount: number;
}

interface StatementContextType {
  statements: Statement[];
  selectedStatementId: string; // statement.id or 'ALL'
  setSelectedStatementId: (id: string) => void;
  selectedCategoryFilter: string;
  setSelectedCategoryFilter: (catId: string) => void;
  selectedTypeFilter: string;
  setSelectedTypeFilter: (type: string) => void;
  availableYears: number[];
  availableMonths: MonthOption[];
  latestStatement: Statement | undefined;
  activeStatement: Statement | undefined;
  activeTransactions: Transaction[];
  allTransactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  rules: CategoryRule[];
  goals: Goal[];
  isDemoData: boolean;
  isLoading: boolean;
  error: string | null;
  setError: (err: string | null) => void;
  userAdjustedPayoffPayment: boolean;
  setUserAdjustedPayoffPayment: (val: boolean) => void;
  customPayoffPaymentCents: number;
  setCustomPayoffPaymentCents: (val: number) => void;
  refreshData: () => Promise<void>;
  handleFileUpload: (file: File) => Promise<{ success: boolean; message: string }>;
  handleBatchFileUpload: (
    files: File[],
    onProgress?: (processed: number, total: number, currentFileName: string) => void
  ) => Promise<BatchImportSummary>;
  changeTransactionCategory: (txId: string, categoryId: string) => Promise<void>;
  changeTransactionCategoryAndCreateRule: (
    txId: string,
    merchantPattern: string,
    categoryId: string
  ) => Promise<void>;
  wipeData: () => Promise<void>;
  deleteStatement: (statementId: string) => Promise<void>;
  renameStatement: (statementId: string, newName: string) => Promise<void>;
  addCategory: (cat: Category) => Promise<void>;
  addRule: (rule: CategoryRule) => Promise<void>;
  removeRule: (id: string) => Promise<void>;
  addGoal: (goal: Goal) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  updateAccountDetails: (acc: Account) => Promise<void>;
  addManualExpense: (expense: {
    description: string;
    amountCents: number;
    categoryId: string;
    date: string;
    isRecurring?: boolean;
    recurrenceMonths?: string[];
  }) => Promise<void>;
  deleteManualExpense: (id: string) => Promise<void>;
  importBackupData: (backupObj: any) => Promise<void>;
}

const StatementContext = createContext<StatementContextType | undefined>(undefined);

export const StatementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Payoff state
  const [userAdjustedPayoffPayment, setUserAdjustedPayoffPayment] = useState<boolean>(false);
  const [customPayoffPaymentCents, setCustomPayoffPaymentCents] = useState<number>(0);

  const refreshData = async () => {
    try {
      setIsLoading(true);
      const [stmts, txs, accs, cats, rls, gls] = await Promise.all([
        getAllStatements(),
        getAllTransactions(),
        getAllAccounts(),
        getAllCategories(),
        getAllRules(),
        getAllGoals()
      ]);

      // Automatically detect and enrich card names for any statements with missing or raw filename cardName
      let hasUpdated = false;
      for (const stmt of stmts) {
        const isRawFileName =
          !stmt.cardName ||
          stmt.cardName.toLowerCase().endsWith('.pdf') ||
          stmt.cardName.toLowerCase().endsWith('.csv') ||
          /^\d{4}-\d{2}-\d{2}/.test(stmt.cardName) ||
          /^[a-zA-Z]+\s+\d{1,2}/.test(stmt.cardName);

        if (isRawFileName) {
          const stmtTxs = txs.filter((t) => t.statementId === stmt.id);
          const detected = detectCardName(stmt, stmtTxs);
          if (detected.cardName && detected.cardName !== stmt.cardName) {
            stmt.cardName = detected.cardName;
            if (!stmt.issuer || stmt.issuer === 'Credit Card') {
              stmt.issuer = detected.issuer;
            }
            await updateStatement(stmt);
            hasUpdated = true;
          }
        }
      }

      // Automatically recategorize uncategorized transactions with updated rules
      await recategorizeAllTransactions(rls);
      const freshTxs = await getAllTransactions();

      setStatements([...stmts]);
      setAllTransactions(freshTxs);
      setAccounts(accs);
      setCategories(cats);
      setRules(rls);
      setGoals(gls);

      // Default selected statement to latest ONLY if not set or invalid (preserve 'ALL' and 'MONTH:...')
      if (stmts.length > 0) {
        if (!selectedStatementId) {
          setSelectedStatementId(stmts[0].id);
        } else if (
          selectedStatementId !== 'ALL' &&
          !selectedStatementId.startsWith('MONTH:') &&
          !selectedStatementId.startsWith('YEAR:') &&
          !stmts.some((s) => s.id === selectedStatementId)
        ) {
          setSelectedStatementId(stmts[0].id);
        }
      } else {
        setSelectedStatementId('ALL');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load data from IndexedDB.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const availableMonths = useMemo<MonthOption[]>(() => {
    const monthMap: Record<string, { monthKey: string; monthLabel: string; count: number; spendCents: number }> = {};

    for (const tx of allTransactions) {
      if (!tx.date) continue;
      const monthKey = tx.date.slice(0, 7); // "YYYY-MM"
      if (!monthMap[monthKey]) {
        const [y, m] = monthKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, 1);
        const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthMap[monthKey] = {
          monthKey,
          monthLabel,
          count: 0,
          spendCents: 0
        };
      }
      monthMap[monthKey].count++;
      if (tx.amountCents > 0 && !tx.feeType && tx.type !== 'PAYMENT' && !isPaymentOrCreditDesc(tx.rawDescription)) {
        monthMap[monthKey].spendCents += tx.amountCents;
      }
    }

    for (const stmt of statements) {
      if (!stmt.periodEnd) continue;
      const monthKey = stmt.periodEnd.slice(0, 7);
      if (!monthMap[monthKey]) {
        const [y, m] = monthKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, 1);
        const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthMap[monthKey] = {
          monthKey,
          monthLabel,
          count: 0,
          spendCents: stmt.purchases || 0
        };
      }
    }

    return Object.values(monthMap)
      .filter((m) => m.count > 0 || m.spendCents > 0)
      .map((m) => {
        const year = parseInt(m.monthKey.slice(0, 4), 10);
        return {
          monthKey: m.monthKey,
          monthLabel: m.monthLabel,
          year: isNaN(year) ? new Date().getFullYear() : year,
          totalSpendCents: m.spendCents,
          txCount: m.count
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [allTransactions, statements]);

  // Derived available years (Strictly from recorded data, sorted descending)
  const availableYears = useMemo<number[]>(() => {
    const yearSet = new Set<number>();
    for (const m of availableMonths) {
      if (m.year) yearSet.add(m.year);
    }
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [availableMonths]);

  const latestStatement = useMemo(() => {
    if (statements.length === 0) return undefined;
    // Already sorted by periodEnd descending
    return statements[0];
  }, [statements]);

  const activeStatement = useMemo(() => {
    if (selectedStatementId === 'ALL') return undefined;

    if (selectedStatementId.startsWith('YEAR:')) {
      const yearKey = selectedStatementId.replace('YEAR:', '');
      const stmtsInYear = statements.filter((s) => s.periodEnd && s.periodEnd.startsWith(yearKey));
      const txsInYear = allTransactions.filter((t) => t.date && t.date.startsWith(yearKey));

      const purchases =
        stmtsInYear.length > 0
          ? stmtsInYear.reduce((sum, s) => sum + (s.purchases || 0), 0)
          : txsInYear
              .filter(
                (t) =>
                  t.amountCents > 0 &&
                  !t.feeType &&
                  t.type !== 'PAYMENT' &&
                  !isPaymentOrCreditDesc(t.rawDescription)
              )
              .reduce((sum, t) => sum + t.amountCents, 0);

      const payments =
        stmtsInYear.length > 0
          ? stmtsInYear.reduce((sum, s) => sum + (s.payments || 0), 0)
          : txsInYear
              .filter((t) => t.amountCents < 0 || t.type === 'PAYMENT' || isPaymentOrCreditDesc(t.rawDescription))
              .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

      const fees = stmtsInYear.reduce((sum, s) => sum + (s.fees || 0), 0);
      const interest = stmtsInYear.reduce((sum, s) => sum + (s.interest || 0), 0);
      const previousBalance = stmtsInYear.reduce((sum, s) => sum + (s.previousBalance || 0), 0);
      const newBalance = stmtsInYear.reduce((sum, s) => sum + (s.newBalance || 0), 0);

      const syntheticStmt: Statement = {
        id: selectedStatementId,
        accountId: 'acc_combined',
        fileName: `${yearKey} Full Year (All Cards Combined)`,
        fileType: 'PDF',
        cardName: `${yearKey} Full Year — All Cards Combined`,
        periodStart: `${yearKey}-01-01`,
        periodEnd: `${yearKey}-12-31`,
        previousBalance,
        payments,
        purchases,
        fees,
        interest,
        newBalance: newBalance !== 0 ? newBalance : purchases - payments,
        hasNewBalance: true,
        isReconciled: true,
        discrepancy: 0,
        parsedAt: new Date().toISOString(),
        sourceHash: `year_${yearKey}`
      };
      return syntheticStmt;
    }

    if (selectedStatementId.startsWith('MONTH:')) {
      const monthKey = selectedStatementId.replace('MONTH:', '');
      const [y, m] = monthKey.split('-').map(Number);
      const dateObj = new Date(y, m - 1, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const stmtsInMonth = statements.filter((s) => s.periodEnd && s.periodEnd.startsWith(monthKey));
      const txsInMonth = allTransactions.filter((t) => t.date && t.date.startsWith(monthKey));

      const purchases =
        stmtsInMonth.length > 0
          ? stmtsInMonth.reduce((sum, s) => sum + (s.purchases || 0), 0)
          : txsInMonth
              .filter(
                (t) =>
                  t.amountCents > 0 &&
                  !t.feeType &&
                  t.type !== 'PAYMENT' &&
                  !isPaymentOrCreditDesc(t.rawDescription)
              )
              .reduce((sum, t) => sum + t.amountCents, 0);

      const payments =
        stmtsInMonth.length > 0
          ? stmtsInMonth.reduce((sum, s) => sum + (s.payments || 0), 0)
          : txsInMonth
              .filter((t) => t.amountCents < 0 || t.type === 'PAYMENT' || isPaymentOrCreditDesc(t.rawDescription))
              .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

      const fees = stmtsInMonth.reduce((sum, s) => sum + (s.fees || 0), 0);
      const interest = stmtsInMonth.reduce((sum, s) => sum + (s.interest || 0), 0);
      const previousBalance = stmtsInMonth.reduce((sum, s) => sum + (s.previousBalance || 0), 0);
      const newBalance = stmtsInMonth.reduce((sum, s) => sum + (s.newBalance || 0), 0);

      const syntheticStmt: Statement = {
        id: selectedStatementId,
        accountId: 'acc_combined',
        fileName: `${monthLabel} (All Cards Combined)`,
        fileType: 'PDF',
        cardName: `${monthLabel} — All Cards Combined`,
        periodStart: `${monthKey}-01`,
        periodEnd: `${monthKey}-31`,
        previousBalance,
        payments,
        purchases,
        fees,
        interest,
        newBalance: newBalance !== 0 ? newBalance : purchases - payments,
        hasNewBalance: true,
        isReconciled: true,
        discrepancy: 0,
        parsedAt: new Date().toISOString(),
        sourceHash: `month_${monthKey}`
      };
      return syntheticStmt;
    }

    return statements.find((s) => s.id === selectedStatementId) || latestStatement;
  }, [selectedStatementId, statements, latestStatement, allTransactions]);

  const activeTransactions = useMemo(() => {
    if (selectedStatementId === 'ALL') {
      return allTransactions;
    }
    if (selectedStatementId.startsWith('YEAR:')) {
      const yearKey = selectedStatementId.replace('YEAR:', '');
      return allTransactions.filter((t) => t.date && t.date.startsWith(yearKey));
    }
    if (selectedStatementId.startsWith('MONTH:')) {
      const monthKey = selectedStatementId.replace('MONTH:', '');
      return allTransactions.filter((t) => t.date && t.date.startsWith(monthKey));
    }
    const targetId = activeStatement ? activeStatement.id : latestStatement?.id;
    if (!targetId) return allTransactions;
    return allTransactions.filter((t) => t.statementId === targetId);
  }, [selectedStatementId, activeStatement, latestStatement, allTransactions]);

  const isDemoData = useMemo(() => {
    if (statements.length === 0) return false;
    return statements.every(s => s.sourceHash.startsWith('demo_hash'));
  }, [statements]);

  // Sync initial payoff payment when active statement changes, unless user adjusted it
  useEffect(() => {
    if (!userAdjustedPayoffPayment && activeStatement) {
      const balance = Math.max(0, activeStatement.newBalance);
      const minPay = activeStatement.minPayment || Math.max(3500, Math.round(balance * 0.01));
      const suggested = Math.max(2 * minPay, Math.round(balance * 0.05));
      setCustomPayoffPaymentCents(suggested);
    }
  }, [activeStatement, userAdjustedPayoffPayment]);

  const processSingleFile = async (
    file: File,
    currentStatements: Statement[],
    defaultAccountId: string
  ): Promise<BatchFileResult> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourceHash = await computeSourceHash(arrayBuffer);

      // Check duplicate against both persisted statements and newly added in this batch
      const isDuplicate = currentStatements.some(s => s.sourceHash === sourceHash);
      if (isDuplicate) {
        return {
          fileName: file.name,
          status: 'DUPLICATE',
          message: 'This statement has already been imported — nothing was changed.'
        };
      }

      const fileName = file.name;
      const lowerName = fileName.toLowerCase();
      let parsedResult: {
        statement: Omit<Statement, 'id' | 'accountId'>;
        transactions: Array<Omit<Transaction, 'id' | 'statementId' | 'accountId'>>;
      };

      if (lowerName.endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        parsedResult = parseCsvStatement(text, fileName, sourceHash);
      } else if (lowerName.endsWith('.pdf')) {
        const text = await extractTextFromPdf(arrayBuffer);
        parsedResult = parseTextStatement(text, fileName, sourceHash);
      } else if (lowerName.endsWith('.ofx') || lowerName.endsWith('.qfx')) {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        parsedResult = parseOfxStatement(text, fileName, sourceHash);
      } else {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        parsedResult = parseTextStatement(text, fileName, sourceHash);
      }

      if (parsedResult.transactions.length === 0) {
        return {
          fileName: file.name,
          status: 'ERROR',
          message: 'Could not detect any transactions in this file. Please verify format.'
        };
      }

      // Semantic duplicate check: Check if same cycle and balances already exist under another name
      const semanticMatch = currentStatements.find(s =>
        isStatementDuplicate(s, parsedResult.statement, parsedResult.transactions)
      );

      if (semanticMatch) {
        const existingName = semanticMatch.cardName || semanticMatch.fileName;
        return {
          fileName: file.name,
          status: 'DUPLICATE',
          message: `Duplicate statement detected: This billing cycle (${parsedResult.statement.periodEnd}) has already been imported under "${existingName}".`
        };
      }

      const { statement } = await importStatementAndTransactions(
        {
          ...parsedResult.statement,
          accountId: defaultAccountId
        },
        parsedResult.transactions.map(t => ({
          ...t,
          accountId: defaultAccountId
        }))
      );

      // Track newly imported statement in the in-memory array for intra-batch duplicate checks
      currentStatements.push(statement);

      return {
        fileName: file.name,
        status: 'SUCCESS',
        message: `Successfully imported ${parsedResult.transactions.length} transactions.`,
        transactionsCount: parsedResult.transactions.length
      };
    } catch (err: any) {
      return {
        fileName: file.name,
        status: 'ERROR',
        message: err?.message || 'Error processing statement.'
      };
    }
  };

  const handleBatchFileUpload = async (
    files: File[],
    onProgress?: (processed: number, total: number, currentFileName: string) => void
  ): Promise<BatchImportSummary> => {
    const summary: BatchImportSummary = {
      totalFiles: files.length,
      successCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      totalTransactionsInserted: 0,
      fileResults: []
    };

    const currentStatementsCopy = [...statements];
    const defaultAccountId = accounts[0]?.id || 'acc_primary';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, files.length, file.name);
      }

      const res = await processSingleFile(file, currentStatementsCopy, defaultAccountId);
      summary.fileResults.push(res);

      if (res.status === 'SUCCESS') {
        summary.successCount++;
        summary.totalTransactionsInserted += res.transactionsCount || 0;
      } else if (res.status === 'DUPLICATE') {
        summary.duplicateCount++;
      } else {
        summary.errorCount++;
      }
    }

    await refreshData();
    return summary;
  };

  const handleFileUpload = async (file: File): Promise<{ success: boolean; message: string }> => {
    const batchRes = await handleBatchFileUpload([file]);
    const single = batchRes.fileResults[0];
    return {
      success: single.status === 'SUCCESS',
      message: single.message
    };
  };

  const changeTransactionCategory = async (txId: string, categoryId: string) => {
    // 1. Find the target transaction
    const targetTx = allTransactions.find((t) => t.id === txId);
    await updateTransactionCategory(txId, categoryId);

    // 2. Extract merchant signature and auto-learn user's preference
    if (targetTx) {
      const signature = extractMerchantSignature(targetTx.rawDescription, targetTx.normalizedMerchant);
      const pattern = signature && signature.length >= 3 ? signature : targetTx.normalizedMerchant;

      if (pattern && pattern.length >= 3) {
        const learnedRuleId = `rule_learned_${pattern.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const learnedRule: CategoryRule = {
          id: learnedRuleId,
          categoryId,
          pattern,
          isRegex: false,
          priority: 100 // High priority over preset rules
        };
        await saveRule(learnedRule);

        // 3. Re-classify ALL matching transactions across all statements and wait for completion!
        await applyCategoryToMatchingTransactions(pattern, categoryId);
        if (targetTx.normalizedMerchant && targetTx.normalizedMerchant !== pattern) {
          await applyCategoryToMatchingTransactions(targetTx.normalizedMerchant, categoryId);
        }
      }
    }

    await refreshData();
  };

  const changeTransactionCategoryAndCreateRule = async (
    txId: string,
    merchantPattern: string,
    categoryId: string
  ) => {
    await changeTransactionCategory(txId, categoryId);
  };

  const wipeData = async () => {
    await wipeAllLocalData();
    setUserAdjustedPayoffPayment(false);
    await refreshData();
  };

  const deleteStatement = async (stmtId: string) => {
    await removeStatementFromDb(stmtId);
    if (selectedStatementId === stmtId) {
      setSelectedStatementId('');
    }
    await refreshData();
  };

  const renameStatement = async (stmtId: string, newName: string) => {
    await renameStatementInDb(stmtId, newName);
    await refreshData();
  };

  const addCategory = async (cat: Category) => {
    await saveCategory(cat);
    await refreshData();
  };

  const addRule = async (rule: CategoryRule) => {
    await saveRule(rule);
    await refreshData();
  };

  const removeRule = async (id: string) => {
    await deleteRule(id);
    await refreshData();
  };

  const addGoal = async (goal: Goal) => {
    await saveGoal(goal);
    await refreshData();
  };

  const removeGoal = async (id: string) => {
    await deleteGoal(id);
    await refreshData();
  };

  const updateAccountDetails = async (acc: Account) => {
    await saveAccount(acc);
    await refreshData();
  };

  const addManualExpense = async (data: {
    description: string;
    amountCents: number;
    categoryId: string;
    date: string;
    isRecurring?: boolean;
    recurrenceMonths?: string[];
  }) => {
    const targetMonths =
      data.isRecurring && data.recurrenceMonths && data.recurrenceMonths.length > 0
        ? data.recurrenceMonths
        : data.isRecurring && availableMonths.length > 0
        ? availableMonths.map((m) => m.monthKey)
        : [data.date.slice(0, 7)];

    const day = data.date.slice(8, 10) || '01';

    for (const mKey of targetMonths) {
      const entryDate = `${mKey}-${day}`;
      const manualTx: Transaction = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        statementId: 'manual_checking',
        accountId: 'acc_checking',
        accountType: 'CHECKING',
        isManual: true,
        isRecurringBill: data.isRecurring || false,
        date: entryDate,
        rawDescription: data.description.trim(),
        normalizedMerchant: data.description.trim(),
        categoryId: data.categoryId,
        amountCents: Math.abs(data.amountCents),
        type: 'DEBIT'
      };
      await saveManualTransaction(manualTx);
    }

    await refreshData();
  };

  const deleteManualExpense = async (id: string) => {
    await deleteManualTransaction(id);
    await refreshData();
  };

  const importBackupData = async (backupObj: any) => {
    if (!backupObj || typeof backupObj !== 'object') {
      throw new Error('Invalid backup file format.');
    }
    await restoreBackupData(backupObj);
    await refreshData();
  };

  const contextValue = useMemo<StatementContextType>(() => ({
    statements,
    selectedStatementId,
    setSelectedStatementId,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedTypeFilter,
    setSelectedTypeFilter,
    availableYears,
    availableMonths,
    latestStatement,
    activeStatement,
    activeTransactions,
    allTransactions,
    accounts,
    categories,
    rules,
    goals,
    isDemoData,
    isLoading,
    error,
    setError,
    userAdjustedPayoffPayment,
    setUserAdjustedPayoffPayment,
    customPayoffPaymentCents,
    setCustomPayoffPaymentCents,
    refreshData,
    handleFileUpload,
    handleBatchFileUpload,
    changeTransactionCategory,
    changeTransactionCategoryAndCreateRule,
    wipeData,
    deleteStatement,
    renameStatement,
    addCategory,
    addRule,
    removeRule,
    addGoal,
    removeGoal,
    updateAccountDetails,
    addManualExpense,
    deleteManualExpense,
    importBackupData
  }), [
    statements,
    selectedStatementId,
    selectedCategoryFilter,
    selectedTypeFilter,
    availableYears,
    availableMonths,
    latestStatement,
    activeStatement,
    activeTransactions,
    allTransactions,
    accounts,
    categories,
    rules,
    goals,
    isDemoData,
    isLoading,
    error,
    userAdjustedPayoffPayment,
    customPayoffPaymentCents
  ]);

  return (
    <StatementContext.Provider value={contextValue}>
      {children}
    </StatementContext.Provider>
  );
};

export const useStatements = (): StatementContextType => {
  const context = useContext(StatementContext);
  if (!context) {
    throw new Error('useStatements must be used within a StatementProvider');
  }
  return context;
};
