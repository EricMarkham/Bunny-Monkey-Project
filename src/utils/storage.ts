import { HouseholdState } from '../types';
import { initialHouseholdState } from '../data/initialData';
import { sanitizeTransactions } from './finance';
import {
  fetchHouseholdStateFromSupabase,
  persistEntireStateToSupabase,
  fetchSnapshotsFromSupabase,
  saveSnapshotToSupabase,
  deleteSnapshotFromSupabase,
  ensureValidUUID,
} from '../services/supabaseService';
import type { StateSnapshot } from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';

export type { StateSnapshot };

// Cache in memory for instantaneous reads and offline rendering
let inMemoryStateCache: HouseholdState | null = null;
let inMemorySnapshotsCache: StateSnapshot[] = [];

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
    expenses: (Array.isArray(parsed.expenses) ? parsed.expenses : initialHouseholdState.expenses).map(
      (exp: any) => {
        const partner = (exp.fixedPartner || (exp.fixedPayer === 'monkey' ? 'Monkey' : 'Bunny'));
        const isMonkey = String(partner).toLowerCase() === 'monkey';
        const fixedPartner: 'Bunny' | 'Monkey' = isMonkey ? 'Monkey' : 'Bunny';
        const fixedAmount =
          exp.fixedAmount !== undefined && !isNaN(Number(exp.fixedAmount))
            ? Number(exp.fixedAmount)
            : isMonkey
            ? (exp.monkeyShare !== undefined ? Number(exp.monkeyShare) : undefined)
            : (exp.bunnyShare !== undefined ? Number(exp.bunnyShare) : undefined);

        return {
          ...exp,
          id: ensureValidUUID(exp?.id),
          fixedPartner,
          fixedPayer: isMonkey ? 'monkey' : 'bunny',
          fixedAmount,
        };
      }
    ),
    sinkingFunds: Array.isArray(parsed.sinkingFunds)
      ? parsed.sinkingFunds
      : initialHouseholdState.sinkingFunds,
    milestones: (() => {
      const totalSinkingReserves = Array.isArray(parsed.sinkingFunds)
        ? parsed.sinkingFunds.reduce((sum: number, f: any) => sum + (Number(f.currentBalance) || 0), 0)
        : initialHouseholdState.sinkingFunds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
      const baseMilestones = Array.isArray(parsed.milestones) && parsed.milestones.length > 0
        ? parsed.milestones
        : initialHouseholdState.milestones;
      return baseMilestones.map((m: any) => {
        const target = Number(m.targetAmount) || 0;
        const unlocked = totalSinkingReserves > 0 && totalSinkingReserves >= target;
        return {
          ...m,
          targetAmount: target,
          currentAmount: totalSinkingReserves,
          unlocked,
          unlockedDate: unlocked ? m.unlockedDate : undefined,
        };
      });
    })(),
    statementTransactions:
      Array.isArray(parsed.statementTransactions)
        ? sanitizeTransactions(parsed.statementTransactions)
        : sanitizeTransactions(initialHouseholdState.statementTransactions),
    holdings: Array.isArray(parsed.holdings) ? parsed.holdings : initialHouseholdState.holdings,
    dripSettings: {
      ...initialHouseholdState.dripSettings,
      ...(parsed.dripSettings || {}),
    },
  };
}

/**
 * Save HouseholdState directly to the Supabase backend
 * Note: localStorage reliance is completely removed.
 */
export async function saveHouseholdState(state: HouseholdState): Promise<void> {
  inMemoryStateCache = state;
  try {
    await persistEntireStateToSupabase(state);
  } catch (err) {
    console.error('[Supabase Save Error]', err);
  }
}

/**
 * Load HouseholdState dynamically from Supabase database tables
 * Note: localStorage reliance is completely removed.
 */
export async function loadHouseholdState(): Promise<HouseholdState> {
  if (inMemoryStateCache) {
    return inMemoryStateCache;
  }

  try {
    const { state } = await fetchHouseholdStateFromSupabase();
    const migrated = sanitizeAndMigrateState(state);
    inMemoryStateCache = migrated;
    return migrated;
  } catch (err) {
    console.warn('[Supabase Load Error, using initial data]', err);
    return initialHouseholdState;
  }
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
          inMemoryStateCache = state;
          // Persist to Supabase
          persistEntireStateToSupabase(state).catch(console.error);
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

/**
 * Save a named snapshot to Supabase cloud storage (no local storage)
 */
export async function saveSnapshot(name: string, state: HouseholdState): Promise<StateSnapshot[]> {
  try {
    const updated = await saveSnapshotToSupabase(name, state);
    inMemorySnapshotsCache = updated;
    return updated;
  } catch (e) {
    console.error('Failed to save snapshot to Supabase', e);
    return inMemorySnapshotsCache;
  }
}

/**
 * Get all saved snapshots from Supabase cloud storage (no local storage)
 */
export async function getSnapshots(): Promise<StateSnapshot[]> {
  try {
    if (inMemorySnapshotsCache.length > 0) {
      return inMemorySnapshotsCache;
    }
    const snapshots = await fetchSnapshotsFromSupabase();
    inMemorySnapshotsCache = snapshots;
    return snapshots;
  } catch (e) {
    console.error('Failed to fetch snapshots from Supabase', e);
    return [];
  }
}

/**
 * Delete a snapshot by ID from Supabase
 */
export async function deleteSnapshot(id: string): Promise<StateSnapshot[]> {
  try {
    await deleteSnapshotFromSupabase(id);
    inMemorySnapshotsCache = inMemorySnapshotsCache.filter((s) => s.id !== id);
    return inMemorySnapshotsCache;
  } catch (e) {
    console.error('Failed to delete snapshot from Supabase', e);
    return inMemorySnapshotsCache;
  }
}

export { isSupabaseConfigured };
