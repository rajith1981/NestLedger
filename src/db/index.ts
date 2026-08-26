/**
 * SPEC 6 — Database Persistence & Idempotent Seeding
 * 
 * Client-side IndexedDB database engine for 100% offline persistence with connection memoization.
 */

import { Category, CategoryRule } from '../types/statement';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_RULES,
  DEFAULT_GOALS,
  DEMO_ACCOUNTS,
  DEMO_STATEMENTS,
  DEMO_TRANSACTIONS
} from './seedData';

const DB_NAME = 'StatementsDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or return memoized IndexedDB database connection instance
 */
export function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = reallyOpenDatabase().catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function resetDatabaseConnection(): void {
  dbPromise = null;
}

function reallyOpenDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Accounts store
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }

      // 2. Statements store
      if (!db.objectStoreNames.contains('statements')) {
        const statementStore = db.createObjectStore('statements', { keyPath: 'id' });
        statementStore.createIndex('periodEnd', 'periodEnd', { unique: false });
        statementStore.createIndex('sourceHash', 'sourceHash', { unique: true });
        statementStore.createIndex('accountId', 'accountId', { unique: false });
      }

      // 3. Transactions store
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('statementId', 'statementId', { unique: false });
        txStore.createIndex('accountId', 'accountId', { unique: false });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('categoryId', 'categoryId', { unique: false });
      }

      // 4. Categories store
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      // 5. Category Rules store
      if (!db.objectStoreNames.contains('category_rules')) {
        const rulesStore = db.createObjectStore('category_rules', { keyPath: 'id' });
        rulesStore.createIndex('categoryId', 'categoryId', { unique: false });
      }

      // 6. Goals store
      if (!db.objectStoreNames.contains('goals')) {
        const goalsStore = db.createObjectStore('goals', { keyPath: 'id' });
        goalsStore.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // Perform idempotent seed check on initial open
      try {
        await ensureSeedData(db);
        resolve(db);
      } catch (err) {
        resolve(db);
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB database: ${request.error?.message}`));
    };
  });
}

/**
 * Idempotent Initialization: Seed initial category taxonomy, accounts, and demo data if empty
 */
export async function ensureSeedData(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['categories', 'category_rules', 'accounts', 'statements', 'transactions', 'goals'], 'readwrite');
    const catStore = tx.objectStore('categories');
    const rulesStore = tx.objectStore('category_rules');

    const catReq = catStore.getAll();

    catReq.onsuccess = () => {
      const existingCats: Category[] = catReq.result || [];
      const existingCatIds = new Set(existingCats.map(c => c.id));

      if (existingCats.length === 0) {
        // Complete initial seed
        for (const cat of DEFAULT_CATEGORIES) {
          catStore.put(cat);
        }

        for (const rule of DEFAULT_CATEGORY_RULES) {
          rulesStore.put(rule);
        }

        const accStore = tx.objectStore('accounts');
        for (const acc of DEMO_ACCOUNTS) {
          accStore.put(acc);
        }

        const stmtStore = tx.objectStore('statements');
        for (const stmt of DEMO_STATEMENTS) {
          stmtStore.put(stmt);
        }

        const txStore = tx.objectStore('transactions');
        for (const txItem of DEMO_TRANSACTIONS) {
          txStore.put(txItem);
        }

        const goalsStore = tx.objectStore('goals');
        for (const goal of DEFAULT_GOALS) {
          goalsStore.put(goal);
        }
      } else {
        // Update/merge categories to latest names and colors
        if (existingCatIds.has('cat_uncategorized')) {
          catStore.delete('cat_uncategorized');
        }

        for (const cat of DEFAULT_CATEGORIES) {
          const existing = existingCats.find((c) => c.id === cat.id);
          if (!existing) {
            catStore.put(cat);
          } else if (!existing.isCustom) {
            // Update name and icon/color if changed in standard catalog
            catStore.put({ ...existing, name: cat.name, icon: cat.icon, color: cat.color });
          }
        }
        // Also ensure default rules are updated with latest patterns
        const rulesReq = rulesStore.getAll();
        rulesReq.onsuccess = () => {
          const existingRules: CategoryRule[] = rulesReq.result || [];
          const existingRuleIds = new Set(existingRules.map((r) => r.id));
          for (const rule of DEFAULT_CATEGORY_RULES) {
            if (!existingRuleIds.has(rule.id)) {
              rulesStore.put(rule);
            } else {
              // Update rule pattern for standard default rules
              const existingRule = existingRules.find((r) => r.id === rule.id);
              if (existingRule && (existingRule.pattern !== rule.pattern || existingRule.categoryId !== rule.categoryId)) {
                rulesStore.put({ ...existingRule, pattern: rule.pattern, categoryId: rule.categoryId, priority: rule.priority });
              }
            }
          }
        };
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
