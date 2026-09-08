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
export function mapRowToTransaction(row: any): StatementTransaction {
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
export function mapTransactionToRow(tx: StatementTransaction): Record<string, any> {
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
export function mapRowToExpense(row: any): HouseholdExpense {
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

export function mapExpenseToRow(exp: HouseholdExpense): Record<string, any> {
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
export function mapRowToSinkingFund(row: any): SinkingFund {
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

export function mapSinkingFundToRow(sf: SinkingFund): Record<string, any> {
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
 * Maps database trip row to Trip
 */
export function mapRowToTrip(row: any): Trip {
  return {
    id: String(row.id),
    name: row.name || '',
    destination: row.destination || '',
    startDate: row.start_date || row.startDate || '',
    endDate: row.end_date || row.endDate || '',
    budget: Number(row.budget) || 0,
  };
}

export function mapTripToRow(trip: Trip): Record<string, any> {
  return {
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    start_date: trip.startDate,
    end_date: trip.endDate,
    budget: trip.budget,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps database trip expense row to TripExpense
 */
export function mapRowToTripExpense(row: any): TripExpense {
  return {
    id: String(row.id),
    tripId: row.trip_id || row.tripId || '',
    date: row.date || '',
    category: row.category || 'Misc',
    description: row.description || '',
    totalCost: Number(row.total_cost ?? row.totalCost) || 0,
    paidBy: row.paid_by || row.paidBy || 'bunny',
    splitRatio: row.split_ratio || row.splitRatio || '50/50',
    customBunnyPercent: row.custom_bunny_percent ?? row.customBunnyPercent,
    customMonkeyPercent: row.custom_monkey_percent ?? row.customMonkeyPercent,
    fundedBySinkingFund: Boolean(row.funded_by_sinking_fund ?? row.fundedBySinkingFund ?? false),
    sinkingFundId: row.sinking_fund_id || row.sinkingFundId || undefined,
    reimbursedAmount: row.reimbursed_amount !== undefined ? Number(row.reimbursed_amount) : undefined,
    notes: row.notes || undefined,
  };
}

export function mapTripExpenseToRow(te: TripExpense): Record<string, any> {
  return {
    id: te.id,
    trip_id: te.tripId,
    date: te.date,
    category: te.category,
    description: te.description,
    total_cost: te.totalCost,
    paid_by: te.paidBy,
    split_ratio: te.splitRatio || '50/50',
    custom_bunny_percent: te.customBunnyPercent ?? null,
    custom_monkey_percent: te.customMonkeyPercent ?? null,
    funded_by_sinking_fund: Boolean(te.fundedBySinkingFund),
    sinking_fund_id: te.sinkingFundId ?? null,
    reimbursed_amount: te.reimbursedAmount ?? null,
    notes: te.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps database trip settlement row to TripSettlement
 */
export function mapRowToTripSettlement(row: any): TripSettlement {
  return {
    id: String(row.id),
    tripId: row.trip_id || row.tripId || '',
    date: row.date || '',
    payer: row.payer || 'bunny',
    receiver: row.receiver || 'monkey',
    amount: Number(row.amount) || 0,
    note: row.note || undefined,
  };
}

export function mapTripSettlementToRow(ts: TripSettlement): Record<string, any> {
  return {
    id: ts.id,
    trip_id: ts.tripId,
    date: ts.date,
    payer: ts.payer,
    receiver: ts.receiver,
    amount: ts.amount,
    note: ts.note ?? null,
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

    // Check if settings table has partner income configuration
    let hasSettingsData = false;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('id', 'partners')
        .maybeSingle();

      if (settingsData?.value) {
        hasSettingsData = true;
        baseState = {
          ...baseState,
          partners: {
            bunny: {
              ...baseState.partners.bunny,
              netMonthlyIncome: Number(settingsData.value.bunny?.netMonthlyIncome ?? baseState.partners.bunny.netMonthlyIncome),
              grossMonthlyIncome: Number(settingsData.value.bunny?.grossMonthlyIncome ?? baseState.partners.bunny.grossMonthlyIncome),
            },
            monkey: {
              ...baseState.partners.monkey,
              netMonthlyIncome: Number(settingsData.value.monkey?.netMonthlyIncome ?? baseState.partners.monkey.netMonthlyIncome),
              grossMonthlyIncome: Number(settingsData.value.monkey?.grossMonthlyIncome ?? baseState.partners.monkey.grossMonthlyIncome),
            },
          },
        };
      }
    } catch {
      // settings table may be optional
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
      // Fetch from 'transactions' table first, with fallback to 'statement_transactions'
      (async () => {
        try {
          const res = await supabase.from('transactions').select('*');
          if (!res.error && res.data && res.data.length > 0) {
            return res;
          }
          const fallback = await supabase.from('statement_transactions').select('*');
          if (!fallback.error && fallback.data) {
            return fallback;
          }
          return res;
        } catch {
          return supabase.from('statement_transactions').select('*');
        }
      })(),
      supabase.from('expenses').select('*'),
      supabase.from('sinking_funds').select('*'),
      supabase.from('trips').select('*'),
      supabase.from('trip_expenses').select('*'),
      supabase.from('trip_settlements').select('*'),
    ]);

    // Check if brand new empty database with zero data across all tables
    const isFreshDatabase =
      !unifiedData?.state &&
      !hasSettingsData &&
      (!expensesRes.data || expensesRes.data.length === 0) &&
      (!tripsRes.data || tripsRes.data.length === 0) &&
      (!holdingsRes.data || holdingsRes.data.length === 0) &&
      (!transactionsRes.data || transactionsRes.data.length === 0);

    if (isFreshDatabase) {
      persistEntireStateToSupabase(initialHouseholdState).catch(console.error);
      return { state: initialHouseholdState, isLiveSupabase: true };
    }

    const resolvedState: HouseholdState = {
      ...baseState,
      holdings:
        !holdingsRes.error && holdingsRes.data
          ? holdingsRes.data.map(mapRowToHolding)
          : baseState.holdings,
      statementTransactions:
        !transactionsRes.error && transactionsRes.data
          ? sanitizeTransactions(transactionsRes.data.map(mapRowToTransaction))
          : baseState.statementTransactions,
      expenses:
        !expensesRes.error && expensesRes.data
          ? expensesRes.data.map(mapRowToExpense)
          : baseState.expenses,
      sinkingFunds:
        !sinkingFundsRes.error && sinkingFundsRes.data
          ? sinkingFundsRes.data.map(mapRowToSinkingFund)
          : baseState.sinkingFunds,
      trips:
        !tripsRes.error && tripsRes.data
          ? tripsRes.data.map(mapRowToTrip)
          : baseState.trips,
      tripExpenses:
        !tripExpensesRes.error && tripExpensesRes.data
          ? tripExpensesRes.data.map(mapRowToTripExpense)
          : baseState.tripExpenses,
      tripSettlements:
        !tripSettlementsRes.error && tripSettlementsRes.data
          ? tripSettlementsRes.data.map(mapRowToTripSettlement)
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

    // 3. Sync expenses table
    if (state.expenses && state.expenses.length > 0) {
      await supabase.from('expenses').upsert(state.expenses.map(mapExpenseToRow), {
        onConflict: 'id',
      });
    }

    // 4. Sync sinking funds table
    if (state.sinkingFunds && state.sinkingFunds.length > 0) {
      await supabase.from('sinking_funds').upsert(state.sinkingFunds.map(mapSinkingFundToRow), {
        onConflict: 'id',
      });
    }

    // 5. Sync statement transactions table
    if (state.statementTransactions && state.statementTransactions.length > 0) {
      const rows = state.statementTransactions.map(mapTransactionToRow);
      await Promise.allSettled([
        supabase.from('transactions').upsert(rows, { onConflict: 'id' }),
        supabase.from('statement_transactions').upsert(rows, { onConflict: 'id' }),
      ]);
    }

    // 6. Sync trips table
    if (state.trips && state.trips.length > 0) {
      await supabase.from('trips').upsert(state.trips.map(mapTripToRow), {
        onConflict: 'id',
      });
    }

    // 7. Sync trip expenses table
    if (state.tripExpenses && state.tripExpenses.length > 0) {
      await supabase.from('trip_expenses').upsert(state.tripExpenses.map(mapTripExpenseToRow), {
        onConflict: 'id',
      });
    }

    // 8. Sync trip settlements table
    if (state.tripSettlements && state.tripSettlements.length > 0) {
      await supabase.from('trip_settlements').upsert(
        state.tripSettlements.map(mapTripSettlementToRow),
        { onConflict: 'id' }
      );
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
      console.warn('[Supabase] Could not upsert into holdings table:', error.message);
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
    await Promise.allSettled([
      supabase.from('transactions').upsert(row, { onConflict: 'id' }),
      supabase.from('statement_transactions').upsert(row, { onConflict: 'id' }),
    ]);
  } catch (err) {
    console.error('[Supabase] insertOrUpdateTransaction error:', err);
  }
}

/**
 * Real-time CRUD: Bulk add/update statement transactions in Supabase
 */
export async function bulkInsertTransactionsInSupabase(txs: StatementTransaction[]): Promise<void> {
  if (!isSupabaseConfigured() || txs.length === 0) return;
  try {
    const rows = txs.map(mapTransactionToRow);
    await Promise.allSettled([
      supabase.from('transactions').upsert(rows, { onConflict: 'id' }),
      supabase.from('statement_transactions').upsert(rows, { onConflict: 'id' }),
    ]);
  } catch (err) {
    console.error('[Supabase] bulkInsertTransactions error:', err);
  }
}

/**
 * Real-time CRUD: Delete a transaction directly in Supabase
 */
export async function deleteTransactionFromSupabase(txId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await Promise.allSettled([
      supabase.from('transactions').delete().eq('id', txId),
      supabase.from('statement_transactions').delete().eq('id', txId),
    ]);
  } catch (err) {
    console.error('[Supabase] deleteTransaction error:', err);
  }
}

/**
 * Fetch all committed transactions dynamically from Supabase database table
 */
export async function fetchCommittedTransactionsFromSupabase(): Promise<StatementTransaction[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    // 1. Primary: query 'transactions' table
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (!txError && txData && txData.length > 0) {
      return sanitizeTransactions(txData.map(mapRowToTransaction));
    }

    // 2. Fallback: query 'statement_transactions' table
    const { data: stData, error: stError } = await supabase
      .from('statement_transactions')
      .select('*')
      .order('date', { ascending: false });

    if (!stError && stData && stData.length > 0) {
      return sanitizeTransactions(stData.map(mapRowToTransaction));
    }

    if (!txError && txData) {
      return sanitizeTransactions(txData.map(mapRowToTransaction));
    }

    return [];
  } catch (err) {
    console.warn('[Supabase] fetchCommittedTransactionsFromSupabase error:', err);
    return [];
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
 * Real-time CRUD: Add or update a sinking fund directly in Supabase
 */
export async function insertOrUpdateSinkingFundInSupabase(fund: SinkingFund): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapSinkingFundToRow(fund);
    const { error } = await supabase.from('sinking_funds').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into sinking_funds table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateSinkingFund error:', err);
  }
}

/**
 * Real-time CRUD: Delete a sinking fund directly in Supabase
 */
export async function deleteSinkingFundFromSupabase(fundId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('sinking_funds').delete().eq('id', fundId);
    if (error) {
      console.warn('[Supabase] Could not delete from sinking_funds table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteSinkingFund error:', err);
  }
}

/**
 * Real-time CRUD: Update sinking fund balance directly in Supabase
 */
export async function updateSinkingFundBalanceInSupabase(
  fundId: string,
  newBalance: number
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase
      .from('sinking_funds')
      .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', fundId);
    if (error) {
      console.warn('[Supabase] Could not update balance in sinking_funds table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] updateSinkingFundBalance error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a trip directly in Supabase
 */
export async function insertOrUpdateTripInSupabase(trip: Trip): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapTripToRow(trip);
    const { error } = await supabase.from('trips').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into trips table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateTrip error:', err);
  }
}

/**
 * Real-time CRUD: Delete a trip directly in Supabase
 */
export async function deleteTripFromSupabase(tripId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (error) {
      console.warn('[Supabase] Could not delete from trips table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteTrip error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a trip expense directly in Supabase
 */
export async function insertOrUpdateTripExpenseInSupabase(expense: TripExpense): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapTripExpenseToRow(expense);
    const { error } = await supabase.from('trip_expenses').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into trip_expenses table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateTripExpense error:', err);
  }
}

/**
 * Real-time CRUD: Delete a trip expense directly in Supabase
 */
export async function deleteTripExpenseFromSupabase(expenseId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('trip_expenses').delete().eq('id', expenseId);
    if (error) {
      console.warn('[Supabase] Could not delete from trip_expenses table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] deleteTripExpense error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a trip settlement directly in Supabase
 */
export async function insertOrUpdateTripSettlementInSupabase(
  settlement: TripSettlement
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapTripSettlementToRow(settlement);
    const { error } = await supabase.from('trip_settlements').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase] Could not upsert into trip_settlements table:', error.message);
    }
  } catch (err) {
    console.error('[Supabase] insertOrUpdateTripSettlement error:', err);
  }
}

/**
 * Real-time CRUD: Update partner incomes & split ratio in Supabase
 */
export async function updatePartnerIncomesInSupabase(partners: {
  bunny: Partner;
  monkey: Partner;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const timestamp = new Date().toISOString();

    // 1. Direct update query into settings table
    try {
      const { data: updateData, error: updateErr } = await supabase
        .from('settings')
        .update({
          value: partners,
          updated_at: timestamp,
        })
        .eq('id', 'partners')
        .select();

      // If no existing row was updated or an error occurred, perform upsert fallback
      if (updateErr || !updateData || updateData.length === 0) {
        await supabase.from('settings').upsert(
          {
            id: 'partners',
            value: partners,
            updated_at: timestamp,
          },
          { onConflict: 'id' }
        );
      }
    } catch (settingsErr) {
      console.warn('[Supabase] Could not update settings table:', settingsErr);
    }

    // 2. Direct update query into household_state table
    try {
      const { data } = await supabase
        .from('household_state')
        .select('state')
        .eq('id', 'current_household_state')
        .maybeSingle();

      const currentState = data?.state || {};
      const updatedState = { ...currentState, partners };

      const { data: hsUpdateData, error: hsUpdateErr } = await supabase
        .from('household_state')
        .update({
          state: updatedState,
          updated_at: timestamp,
        })
        .eq('id', 'current_household_state')
        .select();

      if (hsUpdateErr || !hsUpdateData || hsUpdateData.length === 0) {
        await supabase.from('household_state').upsert(
          {
            id: 'current_household_state',
            state: updatedState,
            updated_at: timestamp,
          },
          { onConflict: 'id' }
        );
      }
    } catch (hsErr) {
      console.warn('[Supabase] Could not update household_state table:', hsErr);
    }
  } catch (err) {
    console.error('[Supabase] updatePartnerIncomes error:', err);
  }
}

/**
 * Real-time CRUD: Update DRIP simulator settings in Supabase
 */
export async function updateDripSettingsInSupabase(
  dripSettings: HouseholdState['dripSettings']
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { data } = await supabase
      .from('household_state')
      .select('state')
      .eq('id', 'current_household_state')
      .maybeSingle();

    const currentState = data?.state || {};
    const updatedState = { ...currentState, dripSettings };

    await supabase.from('household_state').upsert(
      {
        id: 'current_household_state',
        state: updatedState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.error('[Supabase] updateDripSettings error:', err);
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
