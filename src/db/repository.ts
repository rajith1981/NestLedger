/**
 * SPEC 6 & 7 — Database Repository
 * 
 * Typed CRUD, category rule categorization engine, SHA-256 duplicate checking, and atomic import.
 */

import { Account, Category, CategoryRule, Goal, Statement, Transaction } from '../types/statement';
import { openDatabase } from './index';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_RULES, DEFAULT_GOALS } from './seedData';
import { isPaymentOrCreditDesc } from '../engine/pdfParser';
import { isStatementDuplicate } from '../engine/reconciliation';
import { detectCardName } from '../engine/cardDetector';

/**
 * SHA-256 file hashing via Web Crypto API with fallback for non-secure contexts (LAN http)
 */
export async function computeSourceHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to fallback hash
    }
  }

  // Non-secure LAN fallback hash (FNV-1a 64-bit hex hash over ArrayBuffer)
  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 ^ (bytes[i] << 1), 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fallback_${part1}${part2}_${bytes.length}`;
}

/**
 * Categorize a raw description based on rules list (ordered by priority descending)
 */
export function matchCategory(rawDesc: string, rules: CategoryRule[], amountCents?: number): string {
  if (amountCents !== undefined && amountCents < 0) {
    return 'cat_payments';
  }
  if (isPaymentOrCreditDesc(rawDesc)) {
    return 'cat_payments';
  }

  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const upper = rawDesc.toUpperCase();

  for (const rule of sortedRules) {
    if (!rule.pattern) continue;

    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(upper)) {
          return rule.categoryId;
        }
      } catch (e) {
        // Invalid regex fallback
      }
    } else {
      if (upper.includes(rule.pattern.toUpperCase())) {
        return rule.categoryId;
      }
    }
  }

  return 'cat_general';
}

export async function getAllStatements(): Promise<Statement[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('statements', 'readonly');
    const store = tx.objectStore('statements');
    const req = store.getAll();
    req.onsuccess = () => {
      const results: Statement[] = req.result || [];
      // Sort by periodEnd descending
      results.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getStatementByHash(sourceHash: string): Promise<Statement | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('statements', 'readonly');
    const store = tx.objectStore('statements');
    const index = store.index('sourceHash');
    const req = index.get(sourceHash);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Pure transaction normalizer applied at write time
 */
export function normalizeTransaction(t: Transaction): Transaction {
  const isStatementTx = Boolean(t.statementId && t.statementId !== 'manual_checking' && !t.isManual);
  if (isStatementTx) {
    const isPayment = isPaymentOrCreditDesc(t.rawDescription) || t.type === 'PAYMENT' || t.amountCents < 0;
    return {
      ...t,
      accountType: 'CREDIT',
      isManual: false,
      amountCents: isPayment ? -Math.abs(t.amountCents) : Math.abs(t.amountCents),
      type: isPayment ? 'PAYMENT' : (t.type === 'PAYMENT' ? 'DEBIT' : t.type),
      categoryId: isPayment ? 'cat_payments' : t.categoryId
    };
  } else {
    // Checking or manual expenses are positive debits
    const isCheckingPayment = t.categoryId === 'cat_payments';
    return {
      ...t,
      accountType: 'CHECKING',
      isManual: true,
      amountCents: Math.abs(t.amountCents),
      type: 'DEBIT',
      categoryId: isCheckingPayment ? 'cat_housing' : t.categoryId
    };
  }
}

export async function getTransactionsByStatement(statementId: string): Promise<Transaction[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readonly');
    const store = tx.objectStore('transactions');
    const index = store.index('statementId');
    const req = index.getAll(statementId);
    req.onsuccess = () => {
      const results: Transaction[] = req.result || [];
      results.sort((a, b) => b.date.localeCompare(a.date));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readonly');
    const store = tx.objectStore('transactions');
    const req = store.getAll();
    req.onsuccess = () => {
      const results: Transaction[] = req.result || [];
      results.sort((a, b) => b.date.localeCompare(a.date));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllAccounts(): Promise<Account[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readonly');
    const store = tx.objectStore('accounts');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readonly');
    const store = tx.objectStore('accounts');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCategories(): Promise<Category[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readonly');
    const store = tx.objectStore('categories');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllRules(): Promise<CategoryRule[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('category_rules', 'readonly');
    const store = tx.objectStore('category_rules');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllGoals(): Promise<Goal[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('goals', 'readonly');
    const store = tx.objectStore('goals');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * SPEC 7 — Atomic statement import with conflict detection and foreign key validation
 */
export async function importStatementAndTransactions(
  statementData: Omit<Statement, 'id'>,
  transactionsData: Array<Omit<Transaction, 'id' | 'statementId'>>
): Promise<{ statement: Statement; insertedCount: number }> {
  const db = await openDatabase();

  // 1. Check if sourceHash already exists
  const existing = await getStatementByHash(statementData.sourceHash);
  if (existing) {
    throw new Error('This statement has already been imported — nothing was changed.');
  }

  // 2. Check semantic / content duplicate using isStatementDuplicate
  const allStatements = await getAllStatements();
  const semanticDup = allStatements.find(s => isStatementDuplicate(s, statementData, transactionsData));

  if (semanticDup) {
    const existingName = semanticDup.cardName || semanticDup.fileName;
    throw new Error(`Duplicate statement detected: This billing cycle (${statementData.periodEnd}) has already been imported as "${existingName}".`);
  }

  // 3. Fetch rules to apply categorization
  const rules = await getAllRules();

  // Detect card identity
  const cardDetected = detectCardName(statementData, transactionsData as any);
  const cardSlug = cardDetected.cardName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cardAccountId = `acc_${cardSlug}`;

  // Generate unique IDs
  const statementId = `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullStatement: Statement = {
    ...statementData,
    id: statementId,
    accountId: cardAccountId,
    cardName: statementData.cardName && statementData.cardName !== statementData.fileName ? statementData.cardName : cardDetected.cardName
  };

  const fullTransactions: Transaction[] = transactionsData.map((t, idx) => {
    let catId = t.categoryId;
    if (t.amountCents < 0 || t.type === 'PAYMENT' || isPaymentOrCreditDesc(t.rawDescription)) {
      catId = 'cat_payments';
    } else if (catId === 'cat_general' || !catId || catId === 'cat_uncategorized') {
      catId = matchCategory(t.rawDescription, rules, t.amountCents);
    }
    return {
      ...t,
      id: `tx_${statementId}_${idx + 1}`,
      statementId,
      accountId: cardAccountId,
      accountType: 'CREDIT',
      isManual: false,
      categoryId: catId
    };
  });

  // Atomic transaction
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['statements', 'transactions', 'accounts'], 'readwrite');
    const stmtStore = tx.objectStore('statements');
    const txStore = tx.objectStore('transactions');
    const accStore = tx.objectStore('accounts');

    // Ensure account exists or create a default one
    const accCheckReq = accStore.get(cardAccountId);
    accCheckReq.onsuccess = () => {
      if (!accCheckReq.result) {
        const newAcc: Account = {
          id: cardAccountId,
          name: cardDetected.cardName,
          issuer: cardDetected.issuer,
          last4: fullStatement.accountLast4 || '',
          aprPurchase: 24.99,
          color: cardDetected.color,
          createdAt: new Date().toISOString()
        };
        accStore.put(newAcc);
      }
    };

    stmtStore.put(fullStatement);

    for (const txItem of fullTransactions) {
      txStore.put(normalizeTransaction(txItem));
    }

    tx.oncomplete = () => {
      resolve({
        statement: fullStatement,
        insertedCount: fullTransactions.length
      });
    };

    tx.onerror = () => reject(tx.error);
  });
}

export async function updateTransactionCategory(txId: string, categoryId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const req = store.get(txId);
    req.onsuccess = () => {
      const item: Transaction = req.result;
      if (item) {
        item.categoryId = categoryId;
        item.isUserCategorized = true;
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function recategorizeAllTransactions(rules?: CategoryRule[]): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['category_rules', 'transactions'], 'readwrite');
    const rulesStore = tx.objectStore('category_rules');
    const txStore = tx.objectStore('transactions');
    let updatedCount = 0;

    const rulesReq = rulesStore.getAll();
    rulesReq.onsuccess = () => {
      const activeRules: CategoryRule[] = rules || rulesReq.result || [];
      const txReq = txStore.getAll();
      txReq.onsuccess = () => {
        const allTx: Transaction[] = txReq.result || [];
        for (const t of allTx) {
          if (t.isManual || t.accountType === 'CHECKING' || t.accountId === 'acc_checking') {
            continue;
          }
          if (isPaymentOrCreditDesc(t.rawDescription) || t.amountCents < 0 || t.type === 'PAYMENT') {
            if (t.categoryId !== 'cat_payments') {
              t.categoryId = 'cat_payments';
              t.type = 'PAYMENT';
              txStore.put(t);
              updatedCount++;
            }
            continue;
          }
          if (t.categoryId === 'cat_uncategorized') {
            t.categoryId = 'cat_general';
            txStore.put(t);
          }
          // Auto-categorize if uncategorized or not user categorized
          if (!t.isUserCategorized || t.categoryId === 'cat_general') {
            const matched = matchCategory(t.rawDescription, activeRules, t.amountCents);
            if (matched && matched !== t.categoryId) {
              t.categoryId = matched;
              txStore.put(t);
              updatedCount++;
            }
          }
        }
      };
    };

    tx.oncomplete = () => resolve(updatedCount);
    tx.onerror = () => reject(tx.error);
  });
}

export async function applyCategoryToMatchingTransactions(
  pattern: string,
  categoryId: string
): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const allReq = store.getAll();
    const upperPattern = pattern.trim().toUpperCase();
    let count = 0;

    allReq.onsuccess = () => {
      const list: Transaction[] = allReq.result || [];
      for (const t of list) {
        if (t.isManual || t.accountType === 'CHECKING' || t.accountId === 'acc_checking') {
          continue;
        }
        if (isPaymentOrCreditDesc(t.rawDescription) || t.amountCents < 0 || t.type === 'PAYMENT') {
          continue;
        }

        const rawUpper = (t.rawDescription || '').toUpperCase();
        const normUpper = (t.normalizedMerchant || '').toUpperCase();

        const isMatch =
          rawUpper.includes(upperPattern) ||
          normUpper.includes(upperPattern) ||
          (upperPattern.length >= 4 && upperPattern.includes(normUpper));

        if (isMatch) {
          t.categoryId = categoryId;
          t.isUserCategorized = true;
          store.put(t);
          count++;
        }
      }
    };

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCategory(category: Category): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    store.put(category);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveRule(rule: CategoryRule): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['category_rules', 'transactions'], 'readwrite');
    const ruleStore = tx.objectStore('category_rules');
    ruleStore.put(rule);

    // Apply rule to existing transactions in cat_general
    const txStore = tx.objectStore('transactions');
    const req = txStore.getAll();
    req.onsuccess = () => {
      const allTx: Transaction[] = req.result || [];
      for (const t of allTx) {
        if (t.categoryId === 'cat_general') {
          const upper = t.rawDescription.toUpperCase();
          let matches = false;
          if (rule.isRegex) {
            try {
              matches = new RegExp(rule.pattern, 'i').test(upper);
            } catch (e) {}
          } else {
            matches = upper.includes(rule.pattern.toUpperCase());
          }
          if (matches) {
            t.categoryId = rule.categoryId;
            txStore.put(t);
          }
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRule(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('category_rules', 'readwrite');
    const store = tx.objectStore('category_rules');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveGoal(goal: Goal): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('goals', 'readwrite');
    const store = tx.objectStore('goals');
    store.put(goal);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('goals', 'readwrite');
    const store = tx.objectStore('goals');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteStatement(statementId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['statements', 'transactions'], 'readwrite');
    const stmtStore = tx.objectStore('statements');
    const txStore = tx.objectStore('transactions');

    // Delete statement record
    stmtStore.delete(statementId);

    // Delete all associated transactions using the statementId index
    const index = txStore.index('statementId');
    const keyRange = IDBKeyRange.only(statementId);
    const cursorReq = index.openCursor(keyRange);

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateStatement(stmt: Statement): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('statements', 'readwrite');
    const store = tx.objectStore('statements');
    store.put(stmt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameStatement(statementId: string, newName: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('statements', 'readwrite');
    const store = tx.objectStore('statements');
    const req = store.get(statementId);

    req.onsuccess = () => {
      const stmt: Statement = req.result;
      if (stmt) {
        stmt.fileName = newName;
        stmt.cardName = newName;
        store.put(stmt);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAccount(account: Account): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    store.put(account);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveManualTransaction(txData: Transaction): Promise<void> {
  const normalized = normalizeTransaction(txData);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
    const txStore = tx.objectStore('transactions');
    const accStore = tx.objectStore('accounts');

    // Ensure checking account exists
    const accReq = accStore.get('acc_checking');
    accReq.onsuccess = () => {
      if (!accReq.result) {
        accStore.put({
          id: 'acc_checking',
          name: 'Checking & Bank Bills',
          issuer: 'Checking Account',
          color: '#06b6d4',
          createdAt: new Date().toISOString()
        });
      }
    };

    txStore.put(normalized);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteManualTransaction(txId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    store.delete(txId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * SPEC 6 — Database Wipe: Clears all data and immediately re-seeds default categories & rules.
 */
export async function wipeAllLocalData(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['statements', 'transactions', 'accounts', 'categories', 'category_rules', 'goals'], 'readwrite');

    // Clear all stores
    tx.objectStore('statements').clear();
    tx.objectStore('transactions').clear();
    tx.objectStore('accounts').clear();
    tx.objectStore('categories').clear();
    tx.objectStore('category_rules').clear();
    tx.objectStore('goals').clear();

    // Immediately re-seed default categories
    const catStore = tx.objectStore('categories');
    for (const cat of DEFAULT_CATEGORIES) {
      catStore.put(cat);
    }

    // Immediately re-seed default rules
    const rulesStore = tx.objectStore('category_rules');
    for (const rule of DEFAULT_CATEGORY_RULES) {
      rulesStore.put(rule);
    }

    // Seed default goals
    const goalsStore = tx.objectStore('goals');
    for (const goal of DEFAULT_GOALS) {
      goalsStore.put(goal);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Restore complete JSON backup into IndexedDB with strict schema validation
 */
export async function restoreBackupData(data: {
  statements?: Statement[];
  transactions?: Transaction[];
  accounts?: Account[];
  categories?: Category[];
  rules?: CategoryRule[];
  goals?: Goal[];
}): Promise<void> {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backup file format: Root must be a valid JSON object.');
  }

  // 1. Validate statements shape
  if (data.statements) {
    if (!Array.isArray(data.statements)) {
      throw new Error('Invalid backup: "statements" must be an array.');
    }
    for (const s of data.statements) {
      if (!s.id || !s.periodEnd || typeof s.newBalance !== 'number') {
        throw new Error(`Invalid statement record in backup: Statement "${s.id || 'unknown'}" is missing required fields.`);
      }
    }
  }

  // 2. Validate transactions shape
  if (data.transactions) {
    if (!Array.isArray(data.transactions)) {
      throw new Error('Invalid backup: "transactions" must be an array.');
    }
    for (const t of data.transactions) {
      if (!t.id || !t.date || typeof t.amountCents !== 'number' || typeof t.rawDescription !== 'string') {
        throw new Error(`Invalid transaction record in backup: Transaction "${t.id || 'unknown'}" is missing required fields.`);
      }
    }
  }

  // 3. Validate accounts shape
  if (data.accounts) {
    if (!Array.isArray(data.accounts)) {
      throw new Error('Invalid backup: "accounts" must be an array.');
    }
    for (const a of data.accounts) {
      if (!a.id || !a.name) {
        throw new Error(`Invalid account record in backup: Account "${a.id || 'unknown'}" is missing required fields.`);
      }
    }
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['statements', 'transactions', 'accounts', 'categories', 'category_rules', 'goals'],
      'readwrite'
    );

    if (data.statements && Array.isArray(data.statements)) {
      const stmtStore = tx.objectStore('statements');
      for (const s of data.statements) {
        stmtStore.put(s);
      }
    }

    if (data.transactions && Array.isArray(data.transactions)) {
      const txStore = tx.objectStore('transactions');
      for (const t of data.transactions) {
        txStore.put(normalizeTransaction(t));
      }
    }

    if (data.accounts && Array.isArray(data.accounts)) {
      const accStore = tx.objectStore('accounts');
      for (const a of data.accounts) {
        accStore.put(a);
      }
    }

    if (data.categories && Array.isArray(data.categories)) {
      const catStore = tx.objectStore('categories');
      for (const c of data.categories) {
        catStore.put(c);
      }
    }

    if (data.rules && Array.isArray(data.rules)) {
      const rStore = tx.objectStore('category_rules');
      for (const r of data.rules) {
        rStore.put(r);
      }
    }

    if (data.goals && Array.isArray(data.goals)) {
      const gStore = tx.objectStore('goals');
      for (const g of data.goals) {
        gStore.put(g);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
