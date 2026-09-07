import { HouseholdState } from '../types';
import { initialHouseholdState } from '../data/initialData';

export const LOCAL_STORAGE_KEY = 'bunny_monkey_finance_v1';
export const SNAPSHOTS_KEY = 'bunny_monkey_finance_snapshots_v1';

const DB_NAME = 'BunnyMonkeyFinanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'household_state_store';

/**
 * Open or initialize the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Request Persistent Storage from the browser (protects from low-disk eviction)
 */
export async function requestPersistentStorage(): Promise<{
  isPersisted: boolean;
  quota?: number;
  usage?: number;
}> {
  try {
    let isPersisted = false;
    if (navigator.storage && navigator.storage.persist) {
      isPersisted = await navigator.storage.persist();
    } else if (navigator.storage && navigator.storage.persisted) {
      isPersisted = await navigator.storage.persisted();
    }

    let quota: number | undefined;
    let usage: number | undefined;
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      quota = estimate.quota;
      usage = estimate.usage;
    }

    return { isPersisted, quota, usage };
  } catch (err) {
    console.warn('Storage estimate/persist check failed', err);
    return { isPersisted: false };
  }
}

/**
 * Merge saved data with initial data to ensure all required fields exist
 */
export function sanitizeAndMigrateState(parsed: any): HouseholdState {
  if (!parsed || typeof parsed !== 'object') {
    return initialHouseholdState;
  }

  return {
    ...initialHouseholdState,
    ...parsed,
    partners: {
      bunny: { ...initialHouseholdState.partners.bunny, ...(parsed.partners?.bunny || {}) },
      monkey: { ...initialHouseholdState.partners.monkey, ...(parsed.partners?.monkey || {}) },
    },
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : initialHouseholdState.expenses,
    sinkingFunds: Array.isArray(parsed.sinkingFunds)
      ? parsed.sinkingFunds
      : initialHouseholdState.sinkingFunds,
    milestones: Array.isArray(parsed.milestones)
      ? parsed.milestones
      : initialHouseholdState.milestones,
    trips: Array.isArray(parsed.trips) ? parsed.trips : initialHouseholdState.trips,
    activeTripId: parsed.activeTripId || initialHouseholdState.activeTripId,
    tripExpenses: Array.isArray(parsed.tripExpenses)
      ? parsed.tripExpenses
      : initialHouseholdState.tripExpenses,
    tripSettlements: Array.isArray(parsed.tripSettlements)
      ? parsed.tripSettlements
      : initialHouseholdState.tripSettlements,
    statementTransactions:
      Array.isArray(parsed.statementTransactions) && parsed.statementTransactions.length > 0
        ? parsed.statementTransactions
        : initialHouseholdState.statementTransactions,
    holdings: Array.isArray(parsed.holdings) ? parsed.holdings : initialHouseholdState.holdings,
    dripSettings: {
      ...initialHouseholdState.dripSettings,
      ...(parsed.dripSettings || {}),
    },
  };
}

/**
 * Save HouseholdState synchronously to LocalStorage and asynchronously to IndexedDB
 */
export async function saveHouseholdState(state: HouseholdState): Promise<void> {
  // 1. Primary Sync: LocalStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_last_saved`, new Date().toISOString());
  } catch (e) {
    console.warn('LocalStorage save failed, relying on IndexedDB', e);
  }

  // 2. Secondary Sync: IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id: 'current_household_state',
      timestamp: new Date().toISOString(),
      state,
    });
  } catch (err) {
    console.warn('IndexedDB save failed', err);
  }
}

/**
 * Load HouseholdState: checks LocalStorage first, falls back to IndexedDB if LocalStorage is empty
 */
export async function loadHouseholdState(): Promise<HouseholdState> {
  // 1. Try LocalStorage
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return sanitizeAndMigrateState(parsed);
    }
  } catch (e) {
    console.warn('Error reading from LocalStorage, checking IndexedDB', e);
  }

  // 2. Fallback to IndexedDB (e.g. after browser cache clear or large data)
  try {
    const db = await openDB();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('current_household_state');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (result && result.state) {
      // Re-hydrate LocalStorage for faster subsequent synchronous loads
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result.state));
      } catch (ignore) {}
      return sanitizeAndMigrateState(result.state);
    }
  } catch (e) {
    console.warn('IndexedDB load failed, falling back to initial state', e);
  }

  return initialHouseholdState;
}

/**
 * Export state to JSON file download for permanent hard drive storage
 */
export function exportStateToFile(state: HouseholdState): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `household_finance_backup_${timestamp}.json`;
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import state from a JSON file
 */
export function importStateFromFile(file: File): Promise<HouseholdState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const state = sanitizeAndMigrateState(parsed);
          resolve(state);
        } else {
          reject(new Error('Invalid household backup file format.'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export interface StateSnapshot {
  id: string;
  name: string;
  timestamp: string;
  state: HouseholdState;
}

/**
 * Save a named snapshot to persistent storage
 */
export function saveSnapshot(name: string, state: HouseholdState): StateSnapshot[] {
  try {
    const existingStr = localStorage.getItem(SNAPSHOTS_KEY);
    const snapshots: StateSnapshot[] = existingStr ? JSON.parse(existingStr) : [];
    const newSnapshot: StateSnapshot = {
      id: `snap-${Date.now()}`,
      name: name.trim() || `Snapshot ${new Date().toLocaleDateString()}`,
      timestamp: new Date().toISOString(),
      state,
    };
    const updated = [newSnapshot, ...snapshots].slice(0, 10); // Keep last 10 snapshots
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save snapshot', e);
    return [];
  }
}

/**
 * Get all saved snapshots
 */
export function getSnapshots(): StateSnapshot[] {
  try {
    const existingStr = localStorage.getItem(SNAPSHOTS_KEY);
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Delete a snapshot by ID
 */
export function deleteSnapshot(id: string): StateSnapshot[] {
  try {
    const snapshots = getSnapshots().filter((s) => s.id !== id);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
    return snapshots;
  } catch (e) {
    return [];
  }
}
