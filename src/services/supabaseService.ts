import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  HouseholdState,
  DividendHolding,
  StatementTransaction,
  HouseholdExpense,
  ExpenseCategory,
  ExpenseSplitMethod,
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
 * UUID Validation and Generation Helpers
 * Ensures IDs strictly conform to PostgreSQL's UUID type to prevent
 * "invalid input syntax for type uuid" errors.
 */
export function isValidUUID(str?: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ensures an ID is a valid PostgreSQL UUID. If already a valid UUID, returns it.
 * If legacy string (e.g. 'exp-1', 'exp-1788861345604'), deterministically converts to a valid RFC4122 v4 UUID format
 * so PostgreSQL never throws "invalid input syntax for type uuid".
 */
export function ensureValidUUID(id?: string): string {
  if (id && isValidUUID(id)) {
    return id.trim();
  }
  if (!id || typeof id !== 'string' || !id.trim()) {
    return generateUUID();
  }
  // Deterministic conversion from string to valid RFC4122 v4 UUID format
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x811c9dc5, h4 = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3812015801);
    h4 = Math.imul(h4 ^ ch, 2718281829);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0').slice(-8);
  const p2 = ((h2 >>> 0) & 0xffff).toString(16).padStart(4, '0').slice(-4);
  const p3 = '4' + (((h2 >>> 16) & 0x0fff).toString(16).padStart(3, '0').slice(-3));
  const p4 = ((8 + ((h3 >>> 0) & 0x3)).toString(16)) + (((h3 >>> 4) & 0x0fff).toString(16).padStart(3, '0').slice(-3));
  const p5 = ((h4 >>> 0).toString(16).padStart(8, '0') + ((h1 ^ h2 ^ h3) >>> 0).toString(16).padStart(4, '0')).slice(-12);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
}

/**
 * Exact schema for Supabase 'expenses' table to ensure zero schema mismatch errors.
 * Required columns: id, item, category, type, split_logic, monthly_cost, bunny_share, monkey_share
 */
export interface SupabaseExpenseRow {
  id: string;
  item: string;
  category: string;
  type: string;
  split_logic: string;
  monthly_cost: number;
  bunny_share: number;
  monkey_share: number;
}

export function setKnownExpenseColumns(_columns: string[]) {
  // Retained for backward-compatible interface signature
}

/**
 * Maps database expense row to HouseholdExpense
 */
export function mapRowToExpense(row: any): HouseholdExpense {
  const title = String(row.item || row.name || row.title || '').trim();
  const category = (row.category || 'Housing') as ExpenseCategory;

  let isFixed = true;
  if (row.is_fixed !== undefined && row.is_fixed !== null) {
    isFixed = Boolean(row.is_fixed);
  } else if (typeof row.type === 'string') {
    isFixed = !row.type.toLowerCase().includes('var');
  } else if (row.isFixed !== undefined) {
    isFixed = Boolean(row.isFixed);
  }

  const monthlyAmount = Number(
    row.monthly_cost ?? row.amount ?? row.monthly_amount ?? row.monthlyAmount ?? 0
  ) || 0;

  const rawSplit = String(
    row.split_logic ?? row.split ?? row.split_method ?? row.splitMethod ?? 'proportional'
  ).toLowerCase();

  let splitMethod: ExpenseSplitMethod = 'proportional';
  if (rawSplit.includes('equal') || rawSplit.includes('50')) {
    splitMethod = 'equal';
  } else if (rawSplit.includes('custom')) {
    splitMethod = 'custom';
  } else if (rawSplit.includes('fixed') && rawSplit.includes('dollar')) {
    splitMethod = 'fixed_dollar';
  } else {
    splitMethod = 'proportional';
  }

  let customBunnyPercent: number | undefined = undefined;
  let customMonkeyPercent: number | undefined = undefined;
  if (splitMethod === 'custom') {
    const bShare = Number(row.bunny_share);
    const mShare = Number(row.monkey_share);
    if (!isNaN(bShare) && !isNaN(mShare) && bShare + mShare > 0) {
      customBunnyPercent = Math.round((bShare / (bShare + mShare)) * 100);
      customMonkeyPercent = 100 - customBunnyPercent;
    } else if (row.customBunnyPercent !== undefined) {
      customBunnyPercent = Number(row.customBunnyPercent);
      customMonkeyPercent = 100 - customBunnyPercent;
    }
  }

  return {
    id: String(row.id),
    title: title || 'Expense',
    category,
    isFixed,
    monthlyAmount,
    splitMethod,
    customBunnyPercent,
    customMonkeyPercent,
    fixedPayer: row.fixed_payer ?? row.fixedPayer,
    fixedAmount:
      row.fixed_amount !== undefined
        ? Number(row.fixed_amount)
        : row.fixedAmount !== undefined
        ? Number(row.fixedAmount)
        : undefined,
    notes: row.notes || undefined,
  };
}

/**
 * Maps HouseholdExpense to a Supabase row payload matching table columns exactly:
 * id, item, category, type, split_logic, monthly_cost, bunny_share, monkey_share.
 * Excludes any non-table fields (custom_bunny_percent, notes, etc.) to prevent schema mismatch errors.
 */
export function mapExpenseToRow(
  exp: any,
  partners?: { bunny: Partner; monkey: Partner }
): SupabaseExpenseRow {
  const id = ensureValidUUID(String(exp.id || ''));
  const title = String(exp.item || exp.name || exp.title || '').trim();
  const category = String(exp.category || 'Housing');
  const type =
    typeof exp.type === 'string' && exp.type.trim().length > 0
      ? (exp.type.toLowerCase().includes('var') ? 'Variable' : 'Fixed')
      : Boolean(exp.is_fixed ?? exp.isFixed ?? true)
      ? 'Fixed'
      : 'Variable';

  const rawSplit = String(
    exp.split_logic ?? exp.split ?? exp.splitMethod ?? exp.split_method ?? 'proportional'
  ).toLowerCase();

  let splitLogic = 'Proportional';
  if (rawSplit.includes('equal') || rawSplit.includes('50')) {
    splitLogic = 'Equal';
  } else if (rawSplit.includes('custom')) {
    splitLogic = 'Custom';
  } else if (rawSplit.includes('fixed') && rawSplit.includes('dollar')) {
    splitLogic = 'Fixed Dollar';
  } else {
    splitLogic = 'Proportional';
  }

  const monthlyCost = Math.round(
    (Number(exp.monthly_cost ?? exp.amount ?? exp.monthly_amount ?? exp.monthlyAmount ?? 0) || 0) * 100
  ) / 100;

  // Compute bunny_share and monkey_share based on partner income split
  const bunnyRatio = partners
    ? partners.bunny.netMonthlyIncome /
      ((partners.bunny.netMonthlyIncome + partners.monkey.netMonthlyIncome) || 1)
    : 7650 / 16100;
  const monkeyRatio = 1 - bunnyRatio;

  let bShare = 0;
  let mShare = 0;

  if (splitLogic === 'Proportional') {
    bShare = monthlyCost * bunnyRatio;
    mShare = monthlyCost * monkeyRatio;
  } else if (splitLogic === 'Equal') {
    bShare = monthlyCost * 0.5;
    mShare = monthlyCost * 0.5;
  } else if (splitLogic === 'Custom') {
    const bPercent = (Number(exp.customBunnyPercent ?? exp.custom_bunny_percent) || 50) / 100;
    bShare = monthlyCost * bPercent;
    mShare = monthlyCost * (1 - bPercent);
  } else if (splitLogic === 'Fixed Dollar') {
    const fixedAmt = Math.max(0, Number(exp.fixedAmount ?? exp.fixed_amount ?? 0));
    if (exp.fixedPayer === 'monkey') {
      mShare = Math.min(monthlyCost, fixedAmt);
      bShare = Math.max(0, monthlyCost - mShare);
    } else {
      bShare = Math.min(monthlyCost, fixedAmt);
      mShare = Math.max(0, monthlyCost - bShare);
    }
  } else {
    bShare = monthlyCost * bunnyRatio;
    mShare = monthlyCost * monkeyRatio;
  }

  const bunny_share = Math.round(bShare * 100) / 100;
  const monkey_share = Math.round(mShare * 100) / 100;

  // Strictly exact schema: id, item, category, type, split_logic, monthly_cost, bunny_share, monkey_share
  return {
    id,
    item: title || 'Expense',
    category,
    type,
    split_logic: splitLogic,
    monthly_cost: monthlyCost,
    bunny_share,
    monkey_share,
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
          ? (() => {
              if (expensesRes.data.length > 0) {
                setKnownExpenseColumns(Object.keys(expensesRes.data[0]));
              }
              return expensesRes.data.map(mapRowToExpense);
            })()
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
      try {
        const expRows = state.expenses.map((exp) => mapExpenseToRow(exp, state.partners));
        const { error: expErr } = await supabase.from('expenses').upsert(expRows, {
          onConflict: 'id',
        });
        if (expErr) {
          console.error("Expense Save Error:", expErr);
          for (const exp of state.expenses) {
            await insertOrUpdateExpenseInSupabase(exp, state.partners).catch((itemErr) => {
              console.error("Expense Save Error:", itemErr);
            });
          }
        }
      } catch (expSyncErr) {
        console.error("Expense Save Error:", expSyncErr);
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
 * Real-time CRUD: Add or update a household expense directly in Supabase.
 * Strictly sends exact, valid database columns:
 *   id, item, category, type, split_logic, monthly_cost, bunny_share, monkey_share
 * without mismatched or missing property keys.
 * If on_conflict is specified, the target column is strictly 'id'.
 * Wrapped in try/catch with explicit console.error("Expense Save Error:", error) logging.
 */
export async function insertOrUpdateExpenseInSupabase(
  expense: HouseholdExpense,
  partners?: { bunny: Partner; monkey: Partner }
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const payload: SupabaseExpenseRow = mapExpenseToRow(expense, partners);

    // Primary mutation: Upsert strictly targeting conflict column 'id'
    const { error: upsertError } = await supabase
      .from('expenses')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
      console.error("Expense Save Error:", upsertError);

      // Fallback: If upsert failed, attempt update by 'id'
      const { data: updateData, error: updateError } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', payload.id)
        .select();

      if (updateError || !updateData || updateData.length === 0) {
        if (updateError) {
          console.error("Expense Save Error:", updateError);
        }
        // Fallback: If update matched 0 rows or failed, attempt insert
        const { error: insertError } = await supabase
          .from('expenses')
          .insert(payload);

        if (insertError) {
          console.error("Expense Save Error:", insertError);
          throw insertError;
        }
      }
    }
  } catch (error: any) {
    console.error("Expense Save Error:", error);
    throw error;
  }
}

/**
 * Real-time CRUD: Delete an expense directly in Supabase
 */
export async function deleteExpenseFromSupabase(expenseId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const validId = ensureValidUUID(expenseId);
    const { error } = await supabase.from('expenses').delete().eq('id', validId);
    if (error) {
      console.error("Expense Save Error:", error);
      throw error;
    }
  } catch (error: any) {
    console.error("Expense Save Error:", error);
    throw error;
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
