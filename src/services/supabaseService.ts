import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  HouseholdState,
  DividendHolding,
  StatementTransaction,
  HouseholdExpense,
  SinkingFund,
  Trip,
  TripExpense,
  TripSettlement,
  Partner,
} from '../types';
import { initialHouseholdState } from '../data/initialData';
import { sanitizeTransactions } from '../utils/finance';

export interface StateSnapshot {
  id: string;
  name: string;
  timestamp: string;
  state: HouseholdState;
}

/**
 * Maps database holding row to TypeScript DividendHolding
 */
export function mapRowToHolding(row: any): DividendHolding {
  return {
    id: String(row.id),
    symbol: row.symbol || '',
    name: row.name || '',
    accountType: row.account_type || row.accountType || 'TFSA',
    owner: row.owner || 'joint',
    currency: row.currency === 'USD' ? 'USD' : 'CAD',
    shares: Number(row.shares) || 0,
    avgCostPerShare: Number(row.avg_cost_per_share ?? row.avgCostPerShare) || 0,
    currentPrice: Number(row.current_price ?? row.currentPrice) || 0,
    annualDividendPerShare: Number(row.annual_dividend_per_share ?? row.annualDividendPerShare) || 0,
    payoutFrequency: row.payout_frequency || row.payoutFrequency || 'Quarterly',
    payoutMonths: Array.isArray(row.payout_months || row.payoutMonths)
      ? row.payout_months || row.payoutMonths
      : [3, 6, 9, 12],
    nextExDividendDate: row.next_ex_dividend_date || row.nextExDividendDate || '',
    nextPayDate: row.next_pay_date || row.nextPayDate || '',
    sector: row.sector || 'Financial Services',
    dripEnabled: Boolean(row.drip_enabled ?? row.dripEnabled ?? true),
  };
}

/**
 * Maps DividendHolding to Supabase DB row format
 */
export function mapHoldingToRow(h: DividendHolding): Record<string, any> {
  return {
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    account_type: h.accountType,
    owner: h.owner,
    currency: h.currency,
    shares: h.shares,
    avg_cost_per_share: h.avgCostPerShare,
    current_price: h.currentPrice,
    annual_dividend_per_share: h.annualDividendPerShare,
    payout_frequency: h.payoutFrequency,
    payout_months: h.payoutMonths,
    next_ex_dividend_date: h.nextExDividendDate,
    next_pay_date: h.nextPayDate,
    sector: h.sector,
    drip_enabled: h.dripEnabled,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps database transaction row to StatementTransaction
 */
function mapRowToTransaction(row: any): StatementTransaction {
  return {
    id: String(row.id),
    date: row.date || '',
    statementPeriod: row.statement_period || row.statementPeriod || undefined,
    merchant: row.merchant || '',
    rawCategory: row.raw_category || row.rawCategory || undefined,
    assignedCategory: row.assigned_category || row.assignedCategory || 'Discretionary',
    amount: Number(row.amount) || 0,
    partner: row.partner || 'joint',
    carbonEstimateKg: Number(row.carbon_estimate_kg ?? row.carbonEstimateKg) || 0,
    ecoCategory: row.eco_category || row.ecoCategory || 'Neutral',
    ecoTip: row.eco_tip || row.ecoTip || undefined,
    isRecurring: Boolean(row.is_recurring ?? row.isRecurring ?? false),
  };
}

/**
 * Maps StatementTransaction to Supabase DB row format
 */
function mapTransactionToRow(tx: StatementTransaction): Record<string, any> {
  return {
    id: tx.id,
    date: tx.date,
    statement_period: tx.statementPeriod || null,
    merchant: tx.merchant,
    raw_category: tx.rawCategory || null,
    assigned_category: tx.assignedCategory,
    amount: tx.amount,
    partner: tx.partner,
    carbon_estimate_kg: tx.carbonEstimateKg || 0,
    eco_category: tx.ecoCategory || 'Neutral',
    eco_tip: tx.ecoTip || null,
    is_recurring: Boolean(tx.isRecurring),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps database expense row to HouseholdExpense
 */
function mapRowToExpense(row: any): HouseholdExpense {
  return {
    id: String(row.id),
    title: row.title || '',
    category: row.category || 'Housing',
    isFixed: Boolean(row.is_fixed ?? row.isFixed ?? true),
    monthlyAmount: Number(row.monthly_amount ?? row.monthlyAmount) || 0,
    splitMethod: row.split_method || row.splitMethod || 'proportional',
    customBunnyPercent: row.custom_bunny_percent ?? row.customBunnyPercent,
    customMonkeyPercent: row.custom_monkey_percent ?? row.customMonkeyPercent,
    fixedPayer: row.fixed_payer ?? row.fixedPayer,
    fixedAmount: row.fixed_amount ?? row.fixedAmount,
    notes: row.notes || undefined,
  };
}

function mapExpenseToRow(exp: HouseholdExpense): Record<string, any> {
  return {
    id: exp.id,
    title: exp.title,
    category: exp.category,
    is_fixed: exp.isFixed,
    monthly_amount: exp.monthlyAmount,
    split_method: exp.splitMethod,
    custom_bunny_percent: exp.customBunnyPercent ?? null,
    custom_monkey_percent: exp.customMonkeyPercent ?? null,
    fixed_payer: exp.fixedPayer ?? null,
    fixed_amount: exp.fixedAmount ?? null,
    notes: exp.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps database sinking fund row to SinkingFund
 */
function mapRowToSinkingFund(row: any): SinkingFund {
  return {
    id: String(row.id),
    name: row.name || '',
    category: row.category || 'Emergency',
    currentBalance: Number(row.current_balance ?? row.currentBalance) || 0,
    targetBalance: Number(row.target_balance ?? row.targetBalance) || 0,
    monthlyContribution: Number(row.monthly_contribution ?? row.monthlyContribution) || 0,
    targetDate: row.target_date || row.targetDate || undefined,
    notes: row.notes || undefined,
  };
}

function mapSinkingFundToRow(sf: SinkingFund): Record<string, any> {
  return {
    id: sf.id,
    name: sf.name,
    category: sf.category,
    current_balance: sf.currentBalance,
    target_balance: sf.targetBalance,
    monthly_contribution: sf.monthlyContribution,
    target_date: sf.targetDate ?? null,
    notes: sf.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetch complete dynamic state directly from Supabase tables
 */
export async function fetchHouseholdStateFromSupabase(): Promise<{
  state: HouseholdState;
  isLiveSupabase: boolean;
}> {
  if (!isSupabaseConfigured()) {
    console.info('[Supabase] Credentials not configured yet; using initial state in memory.');
    return { state: initialHouseholdState, isLiveSupabase: false };
  }

  try {
    // 1. Check if unified household_state table exists
    const { data: unifiedData, error: unifiedError } = await supabase
      .from('household_state')
      .select('state')
      .eq('id', 'current_household_state')
      .maybeSingle();

    let baseState: HouseholdState = initialHouseholdState;
    if (!unifiedError && unifiedData?.state) {
      baseState = { ...initialHouseholdState, ...unifiedData.state };
    }

    // 2. Fetch granular tables in parallel for real-time synchronization
    const [
      holdingsRes,
      transactionsRes,
      expensesRes,
      sinkingFundsRes,
      tripsRes,
      tripExpensesRes,
      tripSettlementsRes,
    ] = await Promise.all([
      supabase.from('holdings').select('*'),
      supabase.from('statement_transactions').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('sinking_funds').select('*'),
      supabase.from('trips').select('*'),
      supabase.from('trip_expenses').select('*'),
      supabase.from('trip_settlements').select('*'),
    ]);

    const resolvedState: HouseholdState = {
      ...baseState,
      holdings:
        !holdingsRes.error && holdingsRes.data
          ? holdingsRes.data.map(mapRowToHolding)
          : baseState.holdings,
      statementTransactions:
        !transactionsRes.error && transactionsRes.data && transactionsRes.data.length > 0
          ? sanitizeTransactions(transactionsRes.data.map(mapRowToTransaction))
          : baseState.statementTransactions,
      expenses:
        !expensesRes.error && expensesRes.data && expensesRes.data.length > 0
          ? expensesRes.data.map(mapRowToExpense)
          : baseState.expenses,
      sinkingFunds:
        !sinkingFundsRes.error && sinkingFundsRes.data && sinkingFundsRes.data.length > 0
          ? sinkingFundsRes.data.map(mapRowToSinkingFund)
          : baseState.sinkingFunds,
      trips:
        !tripsRes.error && tripsRes.data && tripsRes.data.length > 0
          ? (tripsRes.data as Trip[])
          : baseState.trips,
      tripExpenses:
        !tripExpensesRes.error && tripExpensesRes.data && tripExpensesRes.data.length > 0
          ? (tripExpensesRes.data as TripExpense[])
          : baseState.tripExpenses,
      tripSettlements:
        !tripSettlementsRes.error && tripSettlementsRes.data && tripSettlementsRes.data.length > 0
          ? (tripSettlementsRes.data as TripSettlement[])
          : baseState.tripSettlements,
    };

    return { state: resolvedState, isLiveSupabase: true };
  } catch (err) {
    console.warn('[Supabase] Failed to fetch state from Supabase, falling back to initial state', err);
    return { state: initialHouseholdState, isLiveSupabase: false };
  }
}

/**
 * Persist the entire state to the Supabase backend
 */
export async function persistEntireStateToSupabase(state: HouseholdState): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    // 1. Update unified state table
    await supabase.from('household_state').upsert(
      {
        id: 'current_household_state',
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // 2. Sync holdings table
    if (state.holdings && state.holdings.length > 0) {
      await supabase.from('holdings').upsert(state.holdings.map(mapHoldingToRow), {
        onConflict: 'id',
      });
    }

    return true;
  } catch (err) {
    console.error('[Supabase] Error persisting state to Supabase:', err);
    return false;
  }
}

/**
 * Real-time CRUD: Add or update a ticker holding directly in Supabase
 */
export async function insertOrUpdateHoldingInSupabase(holding: DividendHolding): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapHoldingToRow(holding);
    const { error } = await supabase.from('holdings').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into holdings table, attempting household_state:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateHolding error:', err);
  }
}

/**
 * Real-time CRUD: Delete a holding directly in Supabase
 */
export async function deleteHoldingFromSupabase(holdingId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('holdings').delete().eq('id', holdingId);
    if (error) {
      console.warn('[Supabase] Could not delete from holdings table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteHolding error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a statement transaction directly in Supabase
 */
export async function insertOrUpdateTransactionInSupabase(tx: StatementTransaction): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapTransactionToRow(tx);
    const { error } = await supabase.from('statement_transactions').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into statement_transactions:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateTransaction error:', err);
  }
}

/**
 * Real-time CRUD: Delete a transaction directly in Supabase
 */
export async function deleteTransactionFromSupabase(txId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('statement_transactions').delete().eq('id', txId);
    if (error) {
      console.warn('[Supabase] Could not delete from statement_transactions:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteTransaction error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a household expense directly in Supabase
 */
export async function insertOrUpdateExpenseInSupabase(expense: HouseholdExpense): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapExpenseToRow(expense);
    const { error } = await supabase.from('expenses').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into expenses table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateExpense error:', err);
  }
}

/**
 * Real-time CRUD: Delete an expense directly in Supabase
 */
export async function deleteExpenseFromSupabase(expenseId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) {
      console.warn('[Supabase] Could not delete from expenses table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteExpense error:', err);
  }
}

/**
 * Snapshot Management via Supabase (Replacing browser local storage snapshots)
 */
export async function fetchSnapshotsFromSupabase(): Promise<StateSnapshot[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from('household_snapshots')
      .select('*')
      .order('timestamp', { ascending: false });

    if (!error && data) {
      return data.map((d: any) => ({
        id: String(d.id),
        name: d.name || 'Untitled Snapshot',
        timestamp: d.timestamp || new Date().toISOString(),
        state: d.state as HouseholdState,
      }));
    }
  } catch (err) {
    console.warn('[Supabase] Error fetching snapshots:', err);
  }
  return [];
}

export async function saveSnapshotToSupabase(
  name: string,
  state: HouseholdState
): Promise<StateSnapshot[]> {
  const newSnapshot: StateSnapshot = {
    id: `snap-${Date.now()}`,
    name: name.trim() || `Snapshot ${new Date().toLocaleDateString()}`,
    timestamp: new Date().toISOString(),
    state,
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('household_snapshots').insert([newSnapshot]);
      return await fetchSnapshotsFromSupabase();
    } catch (err) {
      console.error('[Supabase] Error saving snapshot:', err);
    }
  }
  return [newSnapshot];
}

export async function deleteSnapshotFromSupabase(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase.from('household_snapshots').delete().eq('id', id);
  } catch (err) {
    console.error('[Supabase] Error deleting snapshot:', err);
  }
}
