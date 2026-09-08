import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  HouseholdState,
  DividendHolding,
  StatementTransaction,
  HouseholdExpense,
  SinkingFund,
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
  const resolvedPartner = row.cardholder
    ? String(row.cardholder).toLowerCase() === 'monkey'
      ? 'monkey'
      : 'bunny'
    : row.partner || 'joint';

  return {
    id: String(row.id),
    date: row.transaction_date || row.date || '',
    statementPeriod: row.statement_period || row.statementPeriod || undefined,
    merchant: row.merchant || '',
    rawCategory: row.raw_category || row.rawCategory || undefined,
    assignedCategory: row.category || row.assigned_category || row.assignedCategory || 'Discretionary',
    amount: Number(row.amount) || 0,
    partner: resolvedPartner,
    carbonEstimateKg: Number(row.carbon_estimate_kg ?? row.carbonEstimateKg) || 0,
    ecoCategory: row.eco_category || row.ecoCategory || 'Neutral',
    ecoTip: row.eco_tip || row.ecoTip || undefined,
    isRecurring: Boolean(row.is_recurring ?? row.isRecurring ?? false),
  };
}

/**
 * Maps StatementTransaction to Supabase DB row format.
 * Defaults to valid database columns only, stripping any internal or unsupported fields.
 */
export function mapTransactionToRow(
  tx: StatementTransaction,
  useDateColumn = false
): Record<string, any> {
  const resolvedDate = tx.date || (tx as any).transaction_date || '';
  const currentPeriod = tx.statementPeriod || (tx as any).statement_period || '2026-08';
  const cardholder =
    (tx as any).cardholder ||
    (tx as any).card ||
    (tx.partner ? (String(tx.partner).toLowerCase() === 'monkey' ? 'Monkey' : 'Bunny') : 'Bunny');
  const category = (tx as any).category || tx.assignedCategory || (tx as any).auto_category || 'Groceries';
  const merchant = tx.merchant || (tx as any).description || '';
  const amount = Number(tx.amount) || 0;
  const type = (tx as any).type || 'Debit';
  const notes = (tx as any).notes || null;

  const row: Record<string, any> = {
    id: tx.id,
    statement_period: currentPeriod,
    cardholder,
    category,
    merchant,
    amount,
    type,
    notes,
  };

  if (useDateColumn) {
    row.date = resolvedDate;
  } else {
    row.transaction_date = resolvedDate;
    row.date = resolvedDate;
  }
  return row;
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

export function mapExpenseToRow(exp: any): Record<string, any> {
  const monthlyAmount = Number(
    exp.monthly_amount ?? exp.monthlyAmount ?? exp.amount ?? 0
  );
  return {
    id: String(exp.id),
    title: String(exp.title || exp.name || '').trim(),
    category: exp.category || 'Housing',
    is_fixed: Boolean(exp.is_fixed ?? exp.isFixed ?? true),
    monthly_amount: monthlyAmount,
    split_method: exp.split_method || exp.splitMethod || 'proportional',
    custom_bunny_percent: exp.custom_bunny_percent ?? exp.customBunnyPercent ?? null,
    custom_monkey_percent: exp.custom_monkey_percent ?? exp.customMonkeyPercent ?? null,
    fixed_payer: exp.fixed_payer ?? exp.fixedPayer ?? null,
    fixed_amount: exp.fixed_amount ?? exp.fixedAmount ?? null,
    notes: exp.notes ?? null,
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
    currentBalance: Number(row.current_balance ?? row.currentBalance ?? row.current) || 0,
    targetBalance: Number(row.target_amount ?? row.targetAmount ?? row.target_balance ?? row.targetBalance ?? row.target) || 0,
    monthlyContribution: Number(row.monthly_contribution ?? row.monthlyContribution ?? row.monthly) || 0,
    targetDate: row.target_date || row.targetDate || undefined,
    notes: row.notes || undefined,
  };
}

export function mapSinkingFundToRow(sf: any): Record<string, any> {
  const targetAmount = Number(
    sf.target_amount ?? sf.targetAmount ?? sf.targetBalance ?? sf.target ?? sf.target_balance ?? 0
  );
  const currentBalance = Number(
    sf.current_balance ?? sf.currentBalance ?? sf.current ?? 0
  );
  const monthlyContribution = Number(
    sf.monthly_contribution ?? sf.monthlyContribution ?? sf.monthly ?? 0
  );

  return {
    id: String(sf.id),
    name: String(sf.name || '').trim(),
    target_amount: targetAmount,
    current_balance: currentBalance,
    monthly_contribution: monthlyContribution,
    target_date: sf.target_date || sf.targetDate || null,
    category: sf.category || 'Emergency',
    notes: sf.notes || null,
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
    ] = await Promise.all([
      supabase.from('holdings').select('*'),
      // Fetch from 'transactions' table first, with fallback to 'statement_transactions'
      (async () => {
        try {
          let res = await supabase
            .from('transactions')
            .select('*')
            .order('transaction_date', { ascending: false });

          if (res.error) {
            console.error('Supabase Error:', res.error);
            res = await supabase
              .from('transactions')
              .select('*')
              .order('date', { ascending: false });
            if (res.error) {
              console.error('Supabase Error:', res.error);
              res = await supabase.from('transactions').select('*');
            }
          }

          if (!res.error && res.data && res.data.length > 0) {
            return res;
          }

          let fallback = await supabase
            .from('statement_transactions')
            .select('*')
            .order('transaction_date', { ascending: false });

          if (fallback.error) {
            console.error('Supabase Error:', fallback.error);
            fallback = await supabase
              .from('statement_transactions')
              .select('*')
              .order('date', { ascending: false });
            if (fallback.error) {
              console.error('Supabase Error:', fallback.error);
              fallback = await supabase.from('statement_transactions').select('*');
            }
          }

          if (!fallback.error && fallback.data) {
            return fallback;
          }
          return res;
        } catch (err) {
          console.error('Supabase Error:', err);
          return supabase.from('statement_transactions').select('*');
        }
      })(),
      supabase.from('expenses').select('*'),
      supabase.from('sinking_funds').select('*'),
    ]);

    // Check if brand new empty database with zero data across all tables
    const isFreshDatabase =
      !unifiedData?.state &&
      !hasSettingsData &&
      (!expensesRes.data || expensesRes.data.length === 0) &&
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
      const expRows = state.expenses.map(mapExpenseToRow);
      const { error: expErr } = await supabase.from('expenses').upsert(expRows, {
        onConflict: 'id',
      });
      if (expErr) {
        console.error('[Supabase State Sync Error]: Failed to upsert expenses table:', expErr.message || expErr, { rows: expRows, error: expErr });
        if (expErr.message?.includes('monthly_amount') || expErr.code === '42703') {
          const fallbackExpRows = expRows.map((r) => {
            const copy: Record<string, any> = { ...r, amount: r.monthly_amount };
            delete copy.monthly_amount;
            return copy;
          });
          await supabase.from('expenses').upsert(fallbackExpRows, { onConflict: 'id' });
        }
      }
    }

    // 4. Sync sinking funds table
    if (state.sinkingFunds && state.sinkingFunds.length > 0) {
      const sfRows = state.sinkingFunds.map(mapSinkingFundToRow);
      const { error: sfErr } = await supabase.from('sinking_funds').upsert(sfRows, {
        onConflict: 'id',
      });
      if (sfErr) {
        console.error('[Supabase State Sync Error]: Failed to upsert sinking_funds table:', sfErr.message || sfErr, { rows: sfRows, error: sfErr });
        if (sfErr.message?.includes('target_amount') || sfErr.code === '42703') {
          const fallbackSfRows = sfRows.map((r) => {
            const copy: Record<string, any> = { ...r, target_balance: r.target_amount };
            delete copy.target_amount;
            return copy;
          });
          await supabase.from('sinking_funds').upsert(fallbackSfRows, { onConflict: 'id' });
        }
      }
    }

    // 5. Sync statement transactions table
    if (state.statementTransactions && state.statementTransactions.length > 0) {
      const rows = state.statementTransactions.map((tx) => mapTransactionToRow(tx, false));
      const { error: txErr } = await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
      if (txErr) {
        console.error('Supabase Error:', txErr);
        if (txErr.message?.includes('transaction_date') || txErr.code === '42703') {
          const fallbackRows = state.statementTransactions.map((tx) => mapTransactionToRow(tx, true));
          const { error: fbErr } = await supabase.from('transactions').upsert(fallbackRows, { onConflict: 'id' });
          if (fbErr) console.error('Supabase Error:', fbErr);
        }
      }

      const { error: stErr } = await supabase.from('statement_transactions').upsert(rows, { onConflict: 'id' });
      if (stErr) {
        console.error('Supabase Error:', stErr);
        if (stErr.message?.includes('transaction_date') || stErr.code === '42703') {
          const fallbackRows = state.statementTransactions.map((tx) => mapTransactionToRow(tx, true));
          const { error: fbErr } = await supabase.from('statement_transactions').upsert(fallbackRows, { onConflict: 'id' });
          if (fbErr) console.error('Supabase Error:', fbErr);
        }
      }
    }

    return true;
  } catch (err) {
    console.error('Supabase Error:', err);
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
      console.error('Supabase Error:', error);
    }
  } catch (err) {
    console.error('Supabase Error:', err);
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
      console.error('Supabase Error:', error);
    }
  } catch (err) {
    console.error('Supabase Error:', err);
  }
}

/**
 * Real-time CRUD: Add or update a statement transaction directly in Supabase
 */
export async function insertOrUpdateTransactionInSupabase(tx: StatementTransaction): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = mapTransactionToRow(tx, false);
    const { error: txErr } = await supabase.from('transactions').upsert(row, { onConflict: 'id' });
    if (txErr) {
      console.error('Commit Ledger Error:', txErr);
      if (txErr.message?.includes('transaction_date') || txErr.message?.includes('date') || txErr.code === '42703' || txErr.code === 'PGRST204') {
        const fallbackRow = mapTransactionToRow(tx, true);
        const { error: fbErr } = await supabase.from('transactions').upsert(fallbackRow, { onConflict: 'id' });
        if (fbErr) console.error('Commit Ledger Error:', fbErr);
      }
    }

    const { error: stErr } = await supabase.from('statement_transactions').upsert(row, { onConflict: 'id' });
    if (stErr) {
      console.error('Commit Ledger Error:', stErr);
      if (stErr.message?.includes('transaction_date') || stErr.message?.includes('date') || stErr.code === '42703' || stErr.code === 'PGRST204') {
        const fallbackRow = mapTransactionToRow(tx, true);
        const { error: fbErr } = await supabase.from('statement_transactions').upsert(fallbackRow, { onConflict: 'id' });
        if (fbErr) console.error('Commit Ledger Error:', fbErr);
      }
    }
  } catch (err) {
    console.error('Commit Ledger Error:', err);
  }
}

/**
 * Real-time CRUD: Bulk add/update statement transactions in Supabase
 */
export async function bulkInsertTransactionsInSupabase(txs: StatementTransaction[]): Promise<void> {
  if (!isSupabaseConfigured() || txs.length === 0) return;
  try {
    const rows = txs.map((tx) => mapTransactionToRow(tx, false));
    const { error: txErr } = await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
    if (txErr) {
      console.error('Commit Ledger Error:', txErr);
      if (txErr.message?.includes('transaction_date') || txErr.message?.includes('date') || txErr.code === '42703' || txErr.code === 'PGRST204') {
        const fallbackRows = txs.map((tx) => mapTransactionToRow(tx, true));
        const { error: fbErr } = await supabase.from('transactions').upsert(fallbackRows, { onConflict: 'id' });
        if (fbErr) console.error('Commit Ledger Error:', fbErr);
      }
    }

    const { error: stErr } = await supabase.from('statement_transactions').upsert(rows, { onConflict: 'id' });
    if (stErr) {
      console.error('Commit Ledger Error:', stErr);
      if (stErr.message?.includes('transaction_date') || stErr.message?.includes('date') || stErr.code === '42703' || stErr.code === 'PGRST204') {
        const fallbackRows = txs.map((tx) => mapTransactionToRow(tx, true));
        const { error: fbErr } = await supabase.from('statement_transactions').upsert(fallbackRows, { onConflict: 'id' });
        if (fbErr) console.error('Commit Ledger Error:', fbErr);
      }
    }
  } catch (err) {
    console.error('Commit Ledger Error:', err);
  }
}

/**
 * Real-time CRUD: Delete a transaction directly in Supabase
 */
export async function deleteTransactionFromSupabase(txId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error: txErr } = await supabase.from('transactions').delete().eq('id', txId);
    if (txErr) console.error('Supabase Error:', txErr);
    const { error: stErr } = await supabase.from('statement_transactions').delete().eq('id', txId);
    if (stErr) console.error('Supabase Error:', stErr);
  } catch (err) {
    console.error('Supabase Error:', err);
  }
}

/**
 * Fetch all committed transactions dynamically from Supabase database table
 */
export async function fetchCommittedTransactionsFromSupabase(): Promise<StatementTransaction[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    // 1. Primary: query 'transactions' table ordering by 'transaction_date'
    let { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (txError) {
      console.error('Supabase Error:', txError);
      // Fallback: retry with 'date' if transaction_date column doesn't exist
      const retry = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (!retry.error && retry.data) {
        txData = retry.data;
        txError = null;
      } else if (retry.error) {
        console.error('Supabase Error:', retry.error);
        const unconstrained = await supabase.from('transactions').select('*');
        if (!unconstrained.error && unconstrained.data) {
          txData = unconstrained.data;
          txError = null;
        }
      }
    }

    if (!txError && txData && txData.length > 0) {
      return sanitizeTransactions(txData.map(mapRowToTransaction));
    }

    // 2. Fallback: query 'statement_transactions' table
    let { data: stData, error: stError } = await supabase
      .from('statement_transactions')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (stError) {
      console.error('Supabase Error:', stError);
      const retrySt = await supabase
        .from('statement_transactions')
        .select('*')
        .order('date', { ascending: false });
      if (!retrySt.error && retrySt.data) {
        stData = retrySt.data;
        stError = null;
      } else if (retrySt.error) {
        console.error('Supabase Error:', retrySt.error);
        const unconstrainedSt = await supabase.from('statement_transactions').select('*');
        if (!unconstrainedSt.error && unconstrainedSt.data) {
          stData = unconstrainedSt.data;
          stError = null;
        }
      }
    }

    if (!stError && stData && stData.length > 0) {
      return sanitizeTransactions(stData.map(mapRowToTransaction));
    }

    if (!txError && txData) {
      return sanitizeTransactions(txData.map(mapRowToTransaction));
    }

    return [];
  } catch (err) {
    console.error('Supabase Error:', err);
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
      console.error('[Supabase Expenses Upsert Error]:', error.message || error, { payload: row, error });
      // If error is column monthly_amount does not exist, retry with amount
      if (error.message?.includes('monthly_amount') || error.code === '42703') {
        const fallbackRow: Record<string, any> = { ...row, amount: row.monthly_amount };
        delete fallbackRow.monthly_amount;
        const { error: fallbackErr } = await supabase.from('expenses').upsert(fallbackRow, { onConflict: 'id' });
        if (fallbackErr) {
          console.error('[Supabase Expenses Fallback Error]:', fallbackErr.message || fallbackErr, { payload: fallbackRow, error: fallbackErr });
          throw fallbackErr;
        }
        return;
      }
      throw error;
    }
  } catch (err: any) {
    console.error('[Supabase Expenses Insert/Update Exception]:', err?.message || err, { expense, err });
    throw err;
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
      console.error('[Supabase Expenses Delete Error]:', error.message || error, { expenseId, error });
      throw error;
    }
  } catch (err: any) {
    console.error('[Supabase Expenses Delete Exception]:', err?.message || err, { expenseId, err });
    throw err;
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
      console.error('[Supabase Sinking Funds Upsert Error]:', error.message || error, { payload: row, error });
      // If error is column target_amount does not exist, fallback to target_balance
      if (error.message?.includes('target_amount') || error.code === '42703') {
        const fallbackRow: Record<string, any> = { ...row, target_balance: row.target_amount };
        delete fallbackRow.target_amount;
        const { error: fallbackErr } = await supabase.from('sinking_funds').upsert(fallbackRow, { onConflict: 'id' });
        if (fallbackErr) {
          console.error('[Supabase Sinking Funds Fallback Error]:', fallbackErr.message || fallbackErr, { payload: fallbackRow, error: fallbackErr });
          throw fallbackErr;
        }
        return;
      }
      throw error;
    }
  } catch (err: any) {
    console.error('[Supabase Sinking Funds Insert/Update Exception]:', err?.message || err, { fund, err });
    throw err;
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
      console.error('[Supabase Sinking Funds Delete Error]:', error.message || error, { fundId, error });
      throw error;
    }
  } catch (err: any) {
    console.error('[Supabase Sinking Funds Delete Exception]:', err?.message || err, { fundId, err });
    throw err;
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
      console.error('[Supabase Sinking Funds Balance Update Error]:', error.message || error, { fundId, newBalance, error });
      throw error;
    }
  } catch (err: any) {
    console.error('[Supabase Sinking Funds Balance Update Exception]:', err?.message || err, { fundId, newBalance, err });
    throw err;
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
        const { error: upsertErr } = await supabase.from('settings').upsert(
          {
            id: 'partners',
            value: partners,
            updated_at: timestamp,
          },
          { onConflict: 'id' }
        );
        if (upsertErr) {
          console.error('[Supabase Settings Error]: Could not upsert partner incomes into settings table:', upsertErr.message || upsertErr, { partners, error: upsertErr });
        }
      }
    } catch (settingsErr: any) {
      console.error('[Supabase Settings Exception]: Could not update settings table for incomes:', settingsErr?.message || settingsErr);
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
        const { error: hsUpsertErr } = await supabase.from('household_state').upsert(
          {
            id: 'current_household_state',
            state: updatedState,
            updated_at: timestamp,
          },
          { onConflict: 'id' }
        );
        if (hsUpsertErr) {
          console.error('[Supabase Household State Error]: Could not upsert partner incomes into household_state table:', hsUpsertErr.message || hsUpsertErr, { error: hsUpsertErr });
        }
      }
    } catch (hsErr: any) {
      console.error('[Supabase Household State Exception]: Could not update household_state table for incomes:', hsErr?.message || hsErr);
    }

    // 3. If an incomes table exists in the Supabase schema, sync aligned rows
    try {
      const incomeRows = [
        {
          id: 'bunny',
          partner: 'bunny',
          name: partners.bunny.name,
          gross_income: partners.bunny.grossMonthlyIncome,
          net_income: partners.bunny.netMonthlyIncome,
          gross_monthly_income: partners.bunny.grossMonthlyIncome,
          net_monthly_income: partners.bunny.netMonthlyIncome,
          updated_at: timestamp,
        },
        {
          id: 'monkey',
          partner: 'monkey',
          name: partners.monkey.name,
          gross_income: partners.monkey.grossMonthlyIncome,
          net_income: partners.monkey.netMonthlyIncome,
          gross_monthly_income: partners.monkey.grossMonthlyIncome,
          net_monthly_income: partners.monkey.netMonthlyIncome,
          updated_at: timestamp,
        },
      ];
      const { error: incErr } = await supabase.from('incomes').upsert(incomeRows, { onConflict: 'id' });
      if (incErr && incErr.code !== '42P01') {
        console.error('[Supabase Incomes Table Error]:', incErr.message || incErr, { error: incErr });
      }
    } catch {
      // incomes table is optional
    }
  } catch (err: any) {
    console.error('[Supabase Partner Incomes Exception]: updatePartnerIncomes error:', err?.message || err);
    throw err;
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
