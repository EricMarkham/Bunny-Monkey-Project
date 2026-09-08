import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Plus,
  Trash2,
  Edit2,
  TrendingUp,
  ShieldCheck,
  PiggyBank,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sliders,
  DollarSign,
  AlertCircle,
  HelpCircle,
  Calendar,
  Sparkles,
  BarChart3,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  ExpenseCategory,
  ExpenseSplitMethod,
  GamifiedMilestone,
  HouseholdExpense,
  HouseholdState,
  Partner,
  SinkingFund,
} from '../types';
import {
  calculateBudgetSummary,
  calculateExpenseAllocation,
  calculateIncomeSplit,
  formatCurrency,
  formatPercent,
} from '../utils/finance';
import { CategoryDonutChart } from './charts/CustomCharts';
import {
  insertOrUpdateExpenseInSupabase,
  deleteExpenseFromSupabase,
  insertOrUpdateSinkingFundInSupabase,
  deleteSinkingFundFromSupabase,
  updateSinkingFundBalanceInSupabase,
  updatePartnerIncomesInSupabase,
  mapRowToExpense,
  mapRowToSinkingFund,
  mapExpenseToRow,
  mapSinkingFundToRow,
  setKnownExpenseColumns,
  SupabaseExpenseRow,
  generateUUID,
  ensureValidUUID,
} from '../services/supabaseService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface BudgetModuleProps {
  state: HouseholdState;
  onUpdateState: (updater: (prev: HouseholdState) => HouseholdState) => void;
  onNavigateToActuals?: () => void;
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Housing: '#f43f5e',
  Childcare: '#ec4899',
  Insurance: '#8b5cf6',
  Utilities: '#06b6d4',
  Transport: '#3b82f6',
  Debt: '#f97316',
  Groceries: '#10b981',
  Subscriptions: '#6366f1',
  Dining: '#e11d48',
  Discretionary: '#eab308',
};

export function BudgetModule({
  state,
  onUpdateState,
  onNavigateToActuals,
}: BudgetModuleProps) {
  const [filterFixed, setFilterFixed] = useState<'all' | 'fixed' | 'variable'>('all');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddSinkingModal, setShowAddSinkingModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [selectedFundForAdjust, setSelectedFundForAdjust] = useState<SinkingFund | null>(null);
  const [fundAdjustAmount, setFundAdjustAmount] = useState<string>('');
  const [fundAdjustType, setFundAdjustType] = useState<'deposit' | 'withdraw'>('deposit');

  // New expense form state
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpCategory, setNewExpCategory] = useState<ExpenseCategory>('Housing');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpIsFixed, setNewExpIsFixed] = useState(true);
  const [newExpSplitMethod, setNewExpSplitMethod] = useState<ExpenseSplitMethod>('proportional');
  const [newExpCustomBunny, setNewExpCustomBunny] = useState('50');
  const [newExpFixedPayer, setNewExpFixedPayer] = useState<'bunny' | 'monkey'>('bunny');
  const [newExpFixedAmount, setNewExpFixedAmount] = useState('');
  const [newExpNotes, setNewExpNotes] = useState('');

  // New sinking fund form state
  const [newSfName, setNewSfName] = useState('');
  const [newSfCategory, setNewSfCategory] = useState<SinkingFund['category']>('Emergency');
  const [newSfTarget, setNewSfTarget] = useState('');
  const [newSfCurrent, setNewSfCurrent] = useState('');
  const [newSfMonthly, setNewSfMonthly] = useState('');
  const [newSfDate, setNewSfDate] = useState('');

  // Edit expense state
  const [editingExpense, setEditingExpense] = useState<HouseholdExpense | null>(null);
  const [editExpTitle, setEditExpTitle] = useState('');
  const [editExpCategory, setEditExpCategory] = useState<ExpenseCategory>('Housing');
  const [editExpAmount, setEditExpAmount] = useState('');
  const [editExpIsFixed, setEditExpIsFixed] = useState(true);
  const [editExpSplitMethod, setEditExpSplitMethod] = useState<ExpenseSplitMethod>('proportional');
  const [editExpCustomBunny, setEditExpCustomBunny] = useState('50');
  const [editExpFixedPayer, setEditExpFixedPayer] = useState<'bunny' | 'monkey'>('bunny');
  const [editExpFixedAmount, setEditExpFixedAmount] = useState('');
  const [editExpNotes, setEditExpNotes] = useState('');

  // Edit sinking fund state
  const [editingFund, setEditingFund] = useState<SinkingFund | null>(null);
  const [editSfName, setEditSfName] = useState('');
  const [editSfCategory, setEditSfCategory] = useState<SinkingFund['category']>('Emergency');
  const [editSfTarget, setEditSfTarget] = useState('');
  const [editSfCurrent, setEditSfCurrent] = useState('');
  const [editSfMonthly, setEditSfMonthly] = useState('');
  const [editSfDate, setEditSfDate] = useState('');
  const [editSfNotes, setEditSfNotes] = useState('');

  // Income edit form state
  const [bunnyNetInput, setBunnyNetInput] = useState(state.partners.bunny.netMonthlyIncome.toString());
  const [bunnyGrossInput, setBunnyGrossInput] = useState(state.partners.bunny.grossMonthlyIncome.toString());
  const [monkeyNetInput, setMonkeyNetInput] = useState(state.partners.monkey.netMonthlyIncome.toString());
  const [monkeyGrossInput, setMonkeyGrossInput] = useState(state.partners.monkey.grossMonthlyIncome.toString());

  // Cloud sync state for BudgetModule
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [incomeSaveError, setIncomeSaveError] = useState<string | null>(null);

  const syncFromSupabase = async () => {
    if (!isSupabaseConfigured()) return;
    setIsSyncing(true);
    setDbError(null);
    try {
      const [expRes, sfRes, settingsRes, hsRes] = await Promise.all([
        supabase.from('expenses').select('*'),
        supabase.from('sinking_funds').select('*'),
        supabase.from('settings').select('value').eq('id', 'partners').maybeSingle(),
        supabase.from('household_state').select('state').eq('id', 'current_household_state').maybeSingle(),
      ]);
      if (expRes.error) {
        console.error('[Supabase Expenses Fetch Error]:', expRes.error.message || expRes.error);
        setDbError(`Failed to fetch expenses: ${expRes.error.message}`);
      } else if (expRes.data) {
        if (expRes.data.length > 0) {
          setKnownExpenseColumns(Object.keys(expRes.data[0]));
        }
        onUpdateState((prev) => ({
          ...prev,
          expenses: expRes.data.map(mapRowToExpense),
        }));
      }
      if (sfRes.error) {
        console.error('[Supabase Sinking Funds Fetch Error]:', sfRes.error.message || sfRes.error);
        setDbError(`Failed to fetch sinking funds: ${sfRes.error.message}`);
      } else if (sfRes.data) {
        const mappedFunds = sfRes.data.map(mapRowToSinkingFund);
        const totalSinking = mappedFunds.reduce((sum, f) => sum + f.currentBalance, 0);
        onUpdateState((prev) => ({
          ...prev,
          sinkingFunds: mappedFunds,
          milestones: prev.milestones.map((m) => ({
            ...m,
            unlocked: totalSinking >= m.targetAmount,
            currentAmount: totalSinking,
            unlockedDate:
              totalSinking >= m.targetAmount
                ? m.unlockedDate || new Date().toISOString().split('T')[0]
                : undefined,
          })),
        }));
      }
      const remotePartners =
        (!settingsRes.error && settingsRes.data?.value)
          ? settingsRes.data.value
          : (!hsRes.error && hsRes.data?.state?.partners)
          ? hsRes.data.state.partners
          : null;

      if (remotePartners) {
        const bNet = Number(remotePartners.bunny?.netMonthlyIncome ?? state.partners.bunny.netMonthlyIncome);
        const bGross = Number(remotePartners.bunny?.grossMonthlyIncome ?? state.partners.bunny.grossMonthlyIncome);
        const mNet = Number(remotePartners.monkey?.netMonthlyIncome ?? state.partners.monkey.netMonthlyIncome);
        const mGross = Number(remotePartners.monkey?.grossMonthlyIncome ?? state.partners.monkey.grossMonthlyIncome);

        onUpdateState((prev) => ({
          ...prev,
          partners: {
            bunny: {
              ...prev.partners.bunny,
              netMonthlyIncome: bNet,
              grossMonthlyIncome: bGross,
            },
            monkey: {
              ...prev.partners.monkey,
              netMonthlyIncome: mNet,
              grossMonthlyIncome: mGross,
            },
          },
        }));

        setBunnyNetInput(bNet.toString());
        setBunnyGrossInput(bGross.toString());
        setMonkeyNetInput(mNet.toString());
        setMonkeyGrossInput(mGross.toString());
      }
      setSyncStatus('✓ Synced with cloud');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncFromSupabase();
  }, []);

  const summary = calculateBudgetSummary(state.partners, state.expenses, state.sinkingFunds);

  // Filtered expenses
  const displayedExpenses = state.expenses.filter((exp) => {
    if (filterFixed === 'fixed') return exp.isFixed;
    if (filterFixed === 'variable') return !exp.isFixed;
    return true;
  });

  // Calculate donut chart items for expenses
  const categoryTotals: Record<string, number> = {};
  (state.expenses || []).forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.monthlyAmount;
  });
  const donutItems = Object.entries(categoryTotals || {}).map(([cat, val]) => ({
    label: cat,
    value: val,
    color: CATEGORY_COLORS[cat as ExpenseCategory] || '#94a3b8',
  }));

  // Handle Add Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newExpAmount);
    if (!newExpTitle.trim() || isNaN(amount) || amount <= 0) return;

    const expenseId = generateUUID();
    const newExpense: HouseholdExpense = {
      id: expenseId,
      title: newExpTitle.trim(),
      category: newExpCategory,
      isFixed: newExpIsFixed,
      monthlyAmount: amount,
      splitMethod: newExpSplitMethod,
      customBunnyPercent:
        newExpSplitMethod === 'custom' ? parseFloat(newExpCustomBunny) || 50 : undefined,
      customMonkeyPercent:
        newExpSplitMethod === 'custom' ? 100 - (parseFloat(newExpCustomBunny) || 50) : undefined,
      fixedPayer: newExpSplitMethod === 'fixed_dollar' ? newExpFixedPayer : undefined,
      fixedAmount:
        newExpSplitMethod === 'fixed_dollar' ? parseFloat(newExpFixedAmount) || 0 : undefined,
      notes: newExpNotes.trim() || undefined,
    };

    onUpdateState((prev) => ({
      ...prev,
      expenses: [...prev.expenses, newExpense],
    }));

    // Immediately persist expense directly to Supabase with exact schema mapping and error handling
    try {
      if (isSupabaseConfigured()) {
        const payload: SupabaseExpenseRow = mapExpenseToRow(newExpense, state.partners);
        const { error: upsertError } = await supabase
          .from('expenses')
          .upsert(payload, { onConflict: 'id' });

        if (upsertError) {
          console.error("Expense Save Error:", upsertError);
          // Fallback: If upsert constraint fails, attempt direct insert
          const { error: insertError } = await supabase
            .from('expenses')
            .insert(payload);
          if (insertError) {
            console.error("Expense Save Error:", insertError);
            throw insertError;
          }
        }
        setSyncStatus('✓ Recurring bill saved to Supabase');
        setTimeout(() => setSyncStatus(null), 3000);
        setDbError(null);
      }
    } catch (error: any) {
      console.error("Expense Save Error:", error);
      setDbError(`Failed to save expense to Supabase: ${error?.message || String(error)}`);
    }

    // Reset
    setNewExpTitle('');
    setNewExpAmount('');
    setNewExpNotes('');
    setNewExpFixedPayer('bunny');
    setNewExpFixedAmount('');
    setShowAddExpenseModal(false);
  };

  const handleDeleteExpense = async (id: string) => {
    const validId = ensureValidUUID(id);
    onUpdateState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((exp) => exp.id !== id && exp.id !== validId),
    }));
    // Immediately execute database delete query in Supabase
    try {
      if (isSupabaseConfigured()) {
        const { error: deleteError } = await supabase
          .from('expenses')
          .delete()
          .eq('id', validId);
        if (deleteError) {
          console.error("Expense Save Error:", deleteError);
          throw deleteError;
        }
        setSyncStatus('✓ Expense deleted from Supabase');
        setTimeout(() => setSyncStatus(null), 3000);
        setDbError(null);
      }
    } catch (error: any) {
      console.error("Expense Save Error:", error);
      setDbError(`Failed to delete expense from Supabase: ${error?.message || String(error)}`);
    }
  };

  const openEditExpense = (exp: HouseholdExpense) => {
    setEditingExpense(exp);
    setEditExpTitle(exp.title);
    setEditExpCategory(exp.category);
    setEditExpAmount(exp.monthlyAmount.toString());
    setEditExpIsFixed(exp.isFixed);
    setEditExpSplitMethod(exp.splitMethod);
    setEditExpCustomBunny((exp.customBunnyPercent ?? 50).toString());
    setEditExpFixedPayer(exp.fixedPayer || 'bunny');
    setEditExpFixedAmount(exp.fixedAmount !== undefined ? exp.fixedAmount.toString() : '');
    setEditExpNotes(exp.notes || '');
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const amount = parseFloat(editExpAmount);
    if (!editExpTitle.trim() || isNaN(amount) || amount <= 0) return;

    const validId = ensureValidUUID(editingExpense.id);
    const updatedExpense: HouseholdExpense = {
      ...editingExpense,
      id: validId,
      title: editExpTitle.trim(),
      category: editExpCategory,
      isFixed: editExpIsFixed,
      monthlyAmount: amount,
      splitMethod: editExpSplitMethod,
      customBunnyPercent:
        editExpSplitMethod === 'custom' ? parseFloat(editExpCustomBunny) || 50 : undefined,
      customMonkeyPercent:
        editExpSplitMethod === 'custom' ? 100 - (parseFloat(editExpCustomBunny) || 50) : undefined,
      fixedPayer: editExpSplitMethod === 'fixed_dollar' ? editExpFixedPayer : undefined,
      fixedAmount:
        editExpSplitMethod === 'fixed_dollar' ? parseFloat(editExpFixedAmount) || 0 : undefined,
      notes: editExpNotes.trim() || undefined,
    };

    onUpdateState((prev) => ({
      ...prev,
      expenses: prev.expenses.map((exp) =>
        exp.id === editingExpense.id || exp.id === validId ? updatedExpense : exp
      ),
    }));

    // Immediately persist updated expense directly to Supabase with exact schema mapping and error handling
    try {
      if (isSupabaseConfigured()) {
        const payload: SupabaseExpenseRow = mapExpenseToRow(updatedExpense, state.partners);
        const { error: upsertError } = await supabase
          .from('expenses')
          .upsert(payload, { onConflict: 'id' });

        if (upsertError) {
          console.error("Expense Save Error:", upsertError);
          // Fallback: If upsert constraint fails, attempt direct update
          const { error: updateError } = await supabase
            .from('expenses')
            .update(payload)
            .eq('id', payload.id);
          if (updateError) {
            console.error("Expense Save Error:", updateError);
            throw updateError;
          }
        }
        setSyncStatus('✓ Expense updated in Supabase');
        setTimeout(() => setSyncStatus(null), 3000);
        setDbError(null);
      }
    } catch (error: any) {
      console.error("Expense Save Error:", error);
      setDbError(`Failed to update expense in Supabase: ${error?.message || String(error)}`);
    }

    setEditingExpense(null);
  };

  const openEditFund = (fund: SinkingFund) => {
    setEditingFund(fund);
    setEditSfName(fund.name);
    setEditSfCategory(fund.category);
    setEditSfTarget(fund.targetBalance.toString());
    setEditSfCurrent(fund.currentBalance.toString());
    setEditSfMonthly(fund.monthlyContribution.toString());
    setEditSfDate(fund.targetDate || '');
    setEditSfNotes(fund.notes || '');
  };

  const handleUpdateSinkingFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFund) return;
    const target = parseFloat(editSfTarget);
    const current = parseFloat(editSfCurrent) || 0;
    const monthly = parseFloat(editSfMonthly) || 0;
    if (!editSfName.trim() || isNaN(target) || target <= 0) return;

    const updatedFund: SinkingFund = {
      ...editingFund,
      name: editSfName.trim(),
      category: editSfCategory,
      targetBalance: target,
      currentBalance: current,
      monthlyContribution: monthly,
      targetDate: editSfDate || undefined,
      notes: editSfNotes.trim() || undefined,
    };

    onUpdateState((prev) => {
      const updatedFunds = prev.sinkingFunds.map((f) =>
        f.id === editingFund.id ? updatedFund : f
      );
      const totalSinking = updatedFunds.reduce((sum, f) => sum + f.currentBalance, 0);
      const updatedMilestones = prev.milestones.map((m) => {
        const unlocked = m.unlocked || totalSinking >= m.targetAmount;
        return {
          ...m,
          unlocked,
          currentAmount: totalSinking,
          unlockedDate:
            unlocked && !m.unlocked ? new Date().toISOString().split('T')[0] : m.unlockedDate,
        };
      });

      return {
        ...prev,
        sinkingFunds: updatedFunds,
        milestones: updatedMilestones,
      };
    });

    // Execute immediate Supabase update
    try {
      if (isSupabaseConfigured()) {
        const row = mapSinkingFundToRow(updatedFund);
        const { error } = await supabase.from('sinking_funds').update(row).eq('id', updatedFund.id);
        if (error) {
          console.error('[Supabase Sinking Funds Direct Update Error]:', error.message || error, { payload: row, error });
          const { error: upsertErr } = await supabase.from('sinking_funds').upsert(row, { onConflict: 'id' });
          if (upsertErr) {
            console.error('[Supabase Sinking Funds Direct Upsert Error]:', upsertErr.message || upsertErr, { payload: row, error: upsertErr });
            throw upsertErr;
          }
        }
      }
      await insertOrUpdateSinkingFundInSupabase(updatedFund);
      setSyncStatus('✓ Sinking fund updated in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
      setDbError(null);
    } catch (err: any) {
      console.error('[Supabase Sinking Funds Update Exception]:', err?.message || err, { fund: updatedFund, err });
      setDbError(`Failed to update sinking fund in Supabase: ${err?.message || String(err)}`);
    }

    setEditingFund(null);
  };

  const handleDeleteSinkingFund = async (fundId: string) => {
    if (!confirm('Are you sure you want to delete this sinking fund?')) return;
    onUpdateState((prev) => ({
      ...prev,
      sinkingFunds: prev.sinkingFunds.filter((f) => f.id !== fundId),
    }));
    // Execute immediate Supabase delete
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('sinking_funds').delete().eq('id', fundId);
        if (error) {
          console.error('[Supabase Sinking Funds Direct Delete Error]:', error.message || error, { fundId, error });
          throw error;
        }
      }
      await deleteSinkingFundFromSupabase(fundId);
      setSyncStatus('✓ Sinking fund deleted from Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
      setDbError(null);
    } catch (err: any) {
      console.error('[Supabase Sinking Funds Delete Exception]:', err?.message || err, { fundId, err });
      setDbError(`Failed to delete sinking fund from Supabase: ${err?.message || String(err)}`);
    }
    setEditingFund(null);
  };

  // Handle Add Sinking Fund
  const handleAddSinkingFund = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(newSfTarget);
    const current = parseFloat(newSfCurrent) || 0;
    const monthly = parseFloat(newSfMonthly) || 0;
    if (!newSfName.trim() || isNaN(target) || target <= 0) return;

    const newFund: SinkingFund = {
      id: `sf-${Date.now()}`,
      name: newSfName.trim(),
      category: newSfCategory,
      targetBalance: target,
      currentBalance: current,
      monthlyContribution: monthly,
      targetDate: newSfDate || undefined,
    };

    onUpdateState((prev) => ({
      ...prev,
      sinkingFunds: [...prev.sinkingFunds, newFund],
    }));

    // Execute immediate Supabase insert
    try {
      if (isSupabaseConfigured()) {
        const row = mapSinkingFundToRow(newFund);
        const { error } = await supabase.from('sinking_funds').insert(row);
        if (error) {
          console.error('[Supabase Sinking Funds Direct Insert Error]:', error.message || error, { payload: row, error });
          const { error: upsertErr } = await supabase.from('sinking_funds').upsert(row, { onConflict: 'id' });
          if (upsertErr) {
            console.error('[Supabase Sinking Funds Direct Upsert Error]:', upsertErr.message || upsertErr, { payload: row, error: upsertErr });
            throw upsertErr;
          }
        }
      }
      await insertOrUpdateSinkingFundInSupabase(newFund);
      setSyncStatus('✓ Sinking fund created in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
      setDbError(null);
    } catch (err: any) {
      console.error('[Supabase Sinking Funds Insert Exception]:', err?.message || err, { fund: newFund, err });
      setDbError(`Failed to save sinking fund to Supabase: ${err?.message || String(err)}`);
    }

    setNewSfName('');
    setNewSfTarget('');
    setNewSfCurrent('');
    setNewSfMonthly('');
    setShowAddSinkingModal(false);
  };

  // Handle Sinking Fund Deposit/Withdraw
  const handleAdjustFundBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFundForAdjust) return;
    const amount = parseFloat(fundAdjustAmount);
    if (isNaN(amount) || amount <= 0) return;

    const delta = fundAdjustType === 'deposit' ? amount : -amount;
    const newBalance = Math.max(0, selectedFundForAdjust.currentBalance + delta);

    onUpdateState((prev) => {
      const updatedFunds = prev.sinkingFunds.map((fund) =>
        fund.id === selectedFundForAdjust.id ? { ...fund, currentBalance: newBalance } : fund
      );

      // Check milestones update
      const totalSinking = updatedFunds.reduce((sum, f) => sum + f.currentBalance, 0);
      const updatedMilestones = prev.milestones.map((m) => {
        if (!m.unlocked && totalSinking >= m.targetAmount) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          return {
            ...m,
            unlocked: true,
            currentAmount: totalSinking,
            unlockedDate: new Date().toISOString().split('T')[0],
          };
        }
        return {
          ...m,
          currentAmount: totalSinking,
        };
      });

      return {
        ...prev,
        sinkingFunds: updatedFunds,
        milestones: updatedMilestones,
      };
    });

    // Execute immediate Supabase balance update
    try {
      await updateSinkingFundBalanceInSupabase(selectedFundForAdjust.id, newBalance);
      setSyncStatus('✓ Sinking fund balance updated in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
      setDbError(null);
    } catch (err: any) {
      console.error('[Supabase Sinking Fund Balance Adjustment Exception]:', err?.message || err, { fundId: selectedFundForAdjust.id, newBalance, err });
      setDbError(`Failed to update sinking fund balance in Supabase: ${err?.message || String(err)}`);
    }

    setSelectedFundForAdjust(null);
    setFundAdjustAmount('');
  };

  // Handle Save Incomes with Direct Supabase Mutation
  const handleSaveIncomes = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingIncome(true);
    setIncomeSaveError(null);

    const bNet = parseFloat(bunnyNetInput) || 0;
    const bGross = parseFloat(bunnyGrossInput) || 0;
    const mNet = parseFloat(monkeyNetInput) || 0;
    const mGross = parseFloat(monkeyGrossInput) || 0;

    const updatedPartners = {
      bunny: {
        ...state.partners.bunny,
        netMonthlyIncome: bNet,
        grossMonthlyIncome: bGross,
      },
      monkey: {
        ...state.partners.monkey,
        netMonthlyIncome: mNet,
        grossMonthlyIncome: mGross,
      },
    };

    // Update state immediately so UI calculations and split ratios update with zero lag
    onUpdateState((prev) => ({
      ...prev,
      partners: updatedPartners,
    }));

    try {
      if (isSupabaseConfigured()) {
        const timestamp = new Date().toISOString();

        // 1. Direct update query into settings table
        const { data: updateData, error: updateErr } = await supabase
          .from('settings')
          .update({
            value: updatedPartners,
            updated_at: timestamp,
          })
          .eq('id', 'partners')
          .select();

        // Fallback to upsert if no existing row matched
        if (updateErr || !updateData || updateData.length === 0) {
          await supabase.from('settings').upsert(
            {
              id: 'partners',
              value: updatedPartners,
              updated_at: timestamp,
            },
            { onConflict: 'id' }
          );
        }

        // 2. Direct update query into household_state table
        const { data: hsData } = await supabase
          .from('household_state')
          .select('state')
          .eq('id', 'current_household_state')
          .maybeSingle();

        const currentState = hsData?.state || {};
        const updatedState = { ...currentState, partners: updatedPartners };

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
      }

      // Execute central service helper
      await updatePartnerIncomesInSupabase(updatedPartners);

      setSyncStatus('✓ Incomes persisted to Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
      setDbError(null);
      setShowIncomeModal(false);
    } catch (err: any) {
      console.error('[Supabase Partner Income Save Error]:', err?.message || err, { partners: updatedPartners, err });
      setIncomeSaveError(err.message || 'Failed to save to Supabase');
      setDbError(`Failed to persist partner incomes to Supabase: ${err?.message || String(err)}`);
    } finally {
      setIsSavingIncome(false);
    }
  };

  // Trigger celebration on a milestone
  const triggerMilestoneCheer = (milestone: GamifiedMilestone) => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'],
    });
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Database Error Alert Notification */}
      {dbError && (
        <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm shadow-lg shadow-rose-950/20">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Supabase Database Mismatch / Error</p>
              <p className="text-rose-300/90 text-xs">{dbError}</p>
            </div>
          </div>
          <button
            onClick={() => setDbError(null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition-colors shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Section: Income Splitter & Core Financial KPIs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 2xl:gap-8">
        {/* Income Split Engine Card */}
        <div className="w-full bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5 2xl:space-x-3">
                <span className="p-2.5 2xl:p-3 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <Sliders className="w-5 h-5 2xl:w-6 2xl:h-6" />
                </span>
                <div>
                  <h2 className="text-base 2xl:text-xl font-bold text-white">
                    Income &amp; Split Ratio
                  </h2>
                  <p className="text-xs 2xl:text-sm text-slate-400">
                    Proportional dual-earner contribution ratio
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {syncStatus && (
                  <span className="text-xs text-emerald-400 font-medium">
                    {syncStatus}
                  </span>
                )}
                <button
                  onClick={syncFromSupabase}
                  disabled={isSyncing}
                  title="Sync Budget & Sinking Funds from Supabase"
                  className="text-xs font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 px-2.5 py-1.5 rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-rose-400' : ''}`} />
                  <span className="hidden sm:inline">Sync</span>
                </button>

                <button
                  onClick={() => {
                    setBunnyNetInput(state.partners.bunny.netMonthlyIncome.toString());
                    setBunnyGrossInput(state.partners.bunny.grossMonthlyIncome.toString());
                    setMonkeyNetInput(state.partners.monkey.netMonthlyIncome.toString());
                    setMonkeyGrossInput(state.partners.monkey.grossMonthlyIncome.toString());
                    setShowIncomeModal(true);
                  }}
                  className="text-xs 2xl:text-sm font-semibold text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-xl border border-rose-500/30 transition-all shadow-xs"
                >
                  Edit Incomes
                </button>
              </div>
            </div>

            {/* Split Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs 2xl:text-sm font-semibold mb-2">
                <span className="text-rose-300 flex items-center gap-1">
                  🐰 Bunny: {formatPercent(summary.bunnyPercent, 1)}
                </span>
                <span className="text-teal-300 flex items-center gap-1">
                  🐵 Monkey: {formatPercent(summary.monkeyPercent, 1)}
                </span>
              </div>
              <div className="h-3 2xl:h-4 w-full rounded-full bg-slate-900/60 border border-white/10 overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${summary.bunnyPercent}%` }}
                  className="bg-gradient-to-r from-rose-500 to-rose-400 h-full transition-all duration-500"
                />
                <div
                  style={{ width: `${summary.monkeyPercent}%` }}
                  className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-500"
                />
              </div>
              <p className="text-[11px] 2xl:text-xs text-slate-400 mt-2 leading-relaxed">
                Shared bills and sinking funds default to an equitable{' '}
                <strong className="text-slate-200">
                  {formatPercent(summary.bunnyPercent, 1)} / {formatPercent(summary.monkeyPercent, 1)}
                </strong>{' '}
                split calibrated by take-home pay.
              </p>
            </div>

            {/* Detailed Partner Contribution Cards */}
            <div className="grid grid-cols-2 gap-3 2xl:gap-4 pt-2">
              <div className="p-3.5 2xl:p-5 rounded-xl bg-rose-950/30 border border-rose-500/30 backdrop-blur-sm">
                <div className="flex items-center justify-between text-xs 2xl:text-sm mb-1">
                  <span className="font-bold text-rose-200">🐰 Bunny</span>
                  <span className="text-[10px] 2xl:text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-md font-mono">
                    Net Take-Home
                  </span>
                </div>
                <div className="text-lg 2xl:text-2xl font-extrabold font-mono text-white">
                  {formatCurrency(state.partners.bunny.netMonthlyIncome)}
                </div>
                <div className="text-[11px] 2xl:text-xs text-slate-400 mt-1 border-t border-rose-500/20 pt-1.5 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Obligation:</span>
                    <span className="font-semibold text-slate-200">
                      {formatCurrency(summary.bunnyTotalObligation)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-300 font-semibold">
                    <span>Discretionary:</span>
                    <span>{formatCurrency(summary.bunnyDiscretionaryFreeCash)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 2xl:p-5 rounded-xl bg-teal-950/30 border border-teal-500/30 backdrop-blur-sm">
                <div className="flex items-center justify-between text-xs 2xl:text-sm mb-1">
                  <span className="font-bold text-teal-200">🐵 Monkey</span>
                  <span className="text-[10px] 2xl:text-xs bg-teal-500/20 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded-md font-mono">
                    Net Take-Home
                  </span>
                </div>
                <div className="text-lg 2xl:text-2xl font-extrabold font-mono text-white">
                  {formatCurrency(state.partners.monkey.netMonthlyIncome)}
                </div>
                <div className="text-[11px] 2xl:text-xs text-slate-400 mt-1 border-t border-teal-500/20 pt-1.5 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Obligation:</span>
                    <span className="font-semibold text-slate-200">
                      {formatCurrency(summary.monkeyTotalObligation)}
                    </span>
                  </div>
                  <div className="flex justify-between text-teal-300 font-semibold">
                    <span>Discretionary:</span>
                    <span>{formatCurrency(summary.monkeyDiscretionaryFreeCash)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs 2xl:text-sm text-slate-400">
            <span>Household Savings Rate:</span>
            <span className="font-bold text-emerald-400 text-sm 2xl:text-lg font-mono">
              {formatPercent(summary.savingsRatePercent, 1)}
            </span>
          </div>
        </div>

        {/* Expense Distribution Visualizer & Health Summary */}
        <div className="w-full bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base 2xl:text-xl font-bold text-white">
                Monthly Expense Allocation
              </h2>
              <p className="text-xs 2xl:text-sm text-slate-400">
                Categorical breakdown of household fixed &amp; variable overhead
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs 2xl:text-sm text-slate-400">Total Monthly Commitments</span>
              <div className="text-xl 2xl:text-3xl font-black font-mono text-white">
                {formatCurrency(summary.totalMonthlyCommitments)}
              </div>
            </div>
          </div>

          {/* Donut Chart */}
          <div className="my-auto py-2">
            <CategoryDonutChart items={donutItems} totalLabel="Expenses" />
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 2xl:gap-3 pt-4 border-t border-white/10 text-center">
            <div className="p-2.5 2xl:p-4 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="text-[11px] 2xl:text-xs text-slate-400">Fixed Overhead</div>
              <div className="text-sm 2xl:text-base font-bold text-slate-200 font-mono">
                {formatCurrency(summary.totalFixedExpenses)}
              </div>
            </div>
            <div className="p-2.5 2xl:p-4 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="text-[11px] 2xl:text-xs text-slate-400">Variable Discretionary</div>
              <div className="text-sm 2xl:text-base font-bold text-slate-200 font-mono">
                {formatCurrency(summary.totalVariableExpenses)}
              </div>
            </div>
            <div className="p-2.5 2xl:p-4 rounded-xl bg-indigo-900/30 border border-indigo-500/20 backdrop-blur-sm">
              <div className="text-[11px] 2xl:text-xs text-indigo-300">Sinking Funds Siphon</div>
              <div className="text-sm 2xl:text-base font-bold text-emerald-400 font-mono">
                {formatCurrency(summary.totalMonthlySinkingCommitment)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sinking Funds & Sinking Accounts Section */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center space-x-2.5 2xl:space-x-3">
              <span className="p-2.5 2xl:p-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <PiggyBank className="w-5 h-5 2xl:w-6 2xl:h-6" />
              </span>
              <div>
                <h2 className="text-base 2xl:text-xl font-bold text-white">
                  Dedicated Sinking Funds &amp; Family Reserves
                </h2>
                <p className="text-xs 2xl:text-sm text-slate-400">
                  Ring-fenced accounts for education, emergency runway, property upgrades, and getaways
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddSinkingModal(true)}
              className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white px-3.5 2xl:px-4 py-2 2xl:py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Sinking Fund</span>
            </button>
          </div>
        </div>

        {/* Sinking Fund Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4 2xl:gap-6">
          {state.sinkingFunds.map((fund) => {
            const progress =
              fund.targetBalance > 0
                ? Math.min(100, (fund.currentBalance / fund.targetBalance) * 100)
                : 100;
            const remaining = Math.max(0, fund.targetBalance - fund.currentBalance);
            const monthsToGoal =
              fund.monthlyContribution > 0 ? Math.ceil(remaining / fund.monthlyContribution) : 0;

            return (
              <div
                key={fund.id}
                className="p-4 2xl:p-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col justify-between hover:border-emerald-400/40 hover:bg-white/10 transition-all shadow-md shadow-black/10"
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs 2xl:text-sm font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                      {fund.category}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditFund(fund)}
                        className="px-2 py-0.5 text-xs 2xl:text-sm text-slate-300 hover:text-emerald-300 hover:bg-white/10 rounded-lg transition-colors flex items-center space-x-1 border border-white/10"
                        title="Edit fund goals & settings"
                      >
                        <Edit2 className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFundForAdjust(fund);
                          setFundAdjustType('deposit');
                        }}
                        className="text-xs 2xl:text-sm font-semibold text-slate-300 hover:text-emerald-300 transition-colors underline decoration-dotted"
                      >
                        Deposit / Withdraw
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm 2xl:text-base font-bold text-white truncate">
                    {fund.name}
                  </h3>
                  {fund.notes && (
                    <p className="text-[11px] 2xl:text-xs text-slate-400 line-clamp-2 mt-0.5">
                      {fund.notes}
                    </p>
                  )}

                  {/* Balance Display */}
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-[11px] 2xl:text-xs text-slate-400">Current Balance</span>
                      <div className="text-lg 2xl:text-2xl font-extrabold font-mono text-white">
                        {formatCurrency(fund.currentBalance)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] 2xl:text-xs text-slate-400">Target</span>
                      <div className="text-sm 2xl:text-base font-semibold font-mono text-slate-300">
                        {formatCurrency(fund.targetBalance)}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2.5">
                    <div className="flex justify-between text-[11px] 2xl:text-xs font-medium text-slate-400 mb-1">
                      <span>{progress.toFixed(1)}% funded</span>
                      <span>
                        {monthsToGoal > 0 ? `~${monthsToGoal} mos left` : 'Target Met 🎉'}
                      </span>
                    </div>
                    <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/60 border border-white/10 overflow-hidden">
                      <div
                        style={{ width: `${progress}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress >= 100
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                            : 'bg-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs 2xl:text-sm text-slate-400">
                  <span>Monthly Siphon:</span>
                  <span className="font-semibold font-mono text-emerald-400">
                    +{formatCurrency(fund.monthlyContribution)}/mo
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gamified Savings Milestones Section */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2.5 2xl:space-x-3">
            <span className="p-2.5 2xl:p-3 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-5 h-5 2xl:w-6 2xl:h-6" />
            </span>
            <div>
              <h2 className="text-base 2xl:text-xl font-bold text-white">
                Family Milestone Vault
              </h2>
              <p className="text-xs 2xl:text-sm text-slate-400">
                Unlock achievements together as household liquid net worth compounds
              </p>
            </div>
          </div>
          <div className="text-xs 2xl:text-sm text-slate-400">
            Total Sinking Reserves:{' '}
            <strong className="text-emerald-400 font-mono text-sm 2xl:text-base ml-1">
              {formatCurrency(summary.totalSinkingCurrentBalance)}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 2xl:gap-5 pt-2">
          {state.milestones.map((m) => {
            const isUnlocked = summary.totalSinkingCurrentBalance >= m.targetAmount || m.unlocked;
            const progress = Math.min(
              100,
              (summary.totalSinkingCurrentBalance / m.targetAmount) * 100
            );

            return (
              <div
                key={m.id}
                onClick={() => isUnlocked && triggerMilestoneCheer(m)}
                className={`p-4 2xl:p-5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer backdrop-blur-md ${
                  isUnlocked
                    ? 'bg-amber-950/30 border-amber-500/40 shadow-lg shadow-amber-950/20 hover:scale-[1.02]'
                    : 'bg-white/5 border-white/10 opacity-70 hover:opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl 2xl:text-2xl">{m.rewardBadge.split(' ')[0]}</span>
                    {isUnlocked ? (
                      <span className="flex items-center text-[10px] 2xl:text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 mr-1 text-amber-400" /> UNLOCKED
                      </span>
                    ) : (
                      <span className="flex items-center text-[10px] 2xl:text-xs font-semibold text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 mr-1" /> {progress.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs 2xl:text-sm font-bold text-white">{m.title}</h4>
                  <p className="text-[11px] 2xl:text-xs text-slate-400 mt-1 leading-snug line-clamp-2">
                    {m.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-white/10">
                  <div className="flex justify-between text-[10px] 2xl:text-xs font-mono text-slate-400 mb-1">
                    <span>Target:</span>
                    <span>{formatCurrency(m.targetAmount)}</span>
                  </div>
                  <div className="h-1.5 2xl:h-2 w-full rounded-full bg-slate-900/60 border border-white/10 overflow-hidden">
                    <div
                      style={{ width: `${progress}%` }}
                      className={`h-full rounded-full ${
                        isUnlocked ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'bg-slate-600'
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Household Fixed vs Variable Expenses Ledger */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base 2xl:text-xl font-bold text-white">
              Recurring Monthly Expenses Ledger
            </h2>
            <p className="text-xs 2xl:text-sm text-slate-400">
              Track fixed obligations (mortgage, childcare, insurance) and variable family commitments
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl text-xs 2xl:text-sm font-medium">
              <button
                onClick={() => setFilterFixed('all')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterFixed === 'all'
                    ? 'bg-white/15 text-white shadow-xs border border-white/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({state.expenses.length})
              </button>
              <button
                onClick={() => setFilterFixed('fixed')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterFixed === 'fixed'
                    ? 'bg-white/15 text-white shadow-xs border border-white/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Fixed Commitments
              </button>
              <button
                onClick={() => setFilterFixed('variable')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterFixed === 'variable'
                    ? 'bg-white/15 text-white shadow-xs border border-white/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Variable Expenses
              </button>
            </div>

            {onNavigateToActuals && (
              <button
                onClick={onNavigateToActuals}
                className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/40 px-3.5 2xl:px-4 py-2 rounded-xl transition-all shadow-md shrink-0"
              >
                <BarChart3 className="w-4 h-4 text-indigo-300" />
                <span>Budget vs. Actuals</span>
              </button>
            )}

            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-rose-600 hover:bg-rose-500 border border-rose-400/50 text-white px-3.5 2xl:px-4 py-2 rounded-xl transition-all shadow-lg shadow-rose-600/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Recurring Bill</span>
            </button>
          </div>
        </div>

        {/* Expenses Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs 2xl:text-sm">
            <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px] 2xl:text-xs">
              <tr>
                <th className="py-3 2xl:py-4 px-4 2xl:px-5">Item &amp; Notes</th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4">Category</th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4">Type</th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4">Split Logic</th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4 text-right">Monthly Cost</th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4 text-right text-rose-300">
                  Bunny Share
                </th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4 text-right text-teal-300">
                  Monkey Share
                </th>
                <th className="py-3 2xl:py-4 px-3 2xl:px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayedExpenses.map((exp) => {
                const alloc = calculateExpenseAllocation(
                  exp,
                  summary.bunnyRatio,
                  summary.monkeyRatio
                );
                return (
                  <tr
                    key={exp.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 2xl:py-4 px-4 2xl:px-5 font-medium text-slate-200">
                      <div className="text-xs 2xl:text-sm">{exp.title}</div>
                      {exp.notes && (
                        <div className="text-[11px] 2xl:text-xs text-slate-400 font-normal">{exp.notes}</div>
                      )}
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4">
                      <span
                        className="px-2.5 py-0.5 2xl:px-3 2xl:py-1 rounded-md text-[10px] 2xl:text-xs font-semibold text-white shadow-xs"
                        style={{
                          backgroundColor: CATEGORY_COLORS[exp.category] || '#64748b',
                        }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4">
                      <span
                        className={`px-2 py-0.5 2xl:px-2.5 2xl:py-1 rounded-full text-[10px] 2xl:text-xs font-medium border ${
                          exp.isFixed
                            ? 'bg-white/5 border-white/10 text-slate-300'
                            : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {exp.isFixed ? 'Fixed' : 'Variable'}
                      </span>
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4 font-medium text-slate-400">
                      {exp.splitMethod === 'proportional' && 'Proportional'}
                      {exp.splitMethod === 'equal' && '50 / 50'}
                      {exp.splitMethod === 'custom' && `Custom (${exp.customBunnyPercent || 50}% B)`}
                      {exp.splitMethod === 'fixed_dollar' && (
                        <span className="inline-flex items-center gap-1 text-[10px] 2xl:text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          {exp.fixedPayer === 'monkey'
                            ? `🐵 Fixed ${formatCurrency(exp.fixedAmount || 0)}`
                            : `🐰 Fixed ${formatCurrency(exp.fixedAmount || 0)}`}
                        </span>
                      )}
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono font-bold text-white text-xs 2xl:text-sm">
                      {formatCurrency(exp.monthlyAmount)}
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono font-semibold text-rose-300 text-xs 2xl:text-sm">
                      {formatCurrency(alloc.bunnyShare)}
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono font-semibold text-teal-300 text-xs 2xl:text-sm">
                      {formatCurrency(alloc.monkeyShare)}
                    </td>
                    <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-center">
                      <div className="flex items-center justify-center space-x-1 2xl:space-x-2">
                        <button
                          onClick={() => openEditExpense(exp)}
                          className="p-1.5 2xl:p-2 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-lg transition-all"
                          title="Modify bill / expense"
                        >
                          <Edit2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 2xl:p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                          title="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-white/5 font-bold border-t border-white/10 text-slate-200">
              <tr>
                <td colSpan={4} className="py-3 2xl:py-4 px-4 2xl:px-5 text-slate-300">
                  Total Recurring Overhead (Fixed + Variable)
                </td>
                <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono text-white text-xs 2xl:text-sm">
                  {formatCurrency(summary.totalFixedExpenses + summary.totalVariableExpenses)}
                </td>
                <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono text-rose-300 text-xs 2xl:text-sm">
                  {formatCurrency(summary.bunnyFixedOwed + summary.bunnyVariableOwed)}
                </td>
                <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono text-teal-300 text-xs 2xl:text-sm">
                  {formatCurrency(summary.monkeyFixedOwed + summary.monkeyVariableOwed)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-4">
              Add Recurring Household Expense
            </h3>

            <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Expense Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Life &amp; Disability Insurance"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 placeholder-slate-500 text-sm focus:border-rose-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Monthly Amount ($ CAD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="350"
                    value={newExpAmount}
                    onChange={(e) => setNewExpAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono placeholder-slate-500 focus:border-rose-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newExpCategory}
                    onChange={(e) => setNewExpCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-rose-400 focus:outline-hidden"
                  >
                    <option value="Housing">Housing</option>
                    <option value="Childcare">Childcare</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Transport">Transport</option>
                    <option value="Debt">Debt</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Dining">Dining</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="Discretionary">Discretionary</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Commitment Type
                  </label>
                  <select
                    value={newExpIsFixed ? 'fixed' : 'variable'}
                    onChange={(e) => setNewExpIsFixed(e.target.value === 'fixed')}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-rose-400 focus:outline-hidden"
                  >
                    <option value="fixed">Fixed (Obligatory)</option>
                    <option value="variable">Variable (Discretionary)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Split Ratio
                  </label>
                  <select
                    value={newExpSplitMethod}
                    onChange={(e) => setNewExpSplitMethod(e.target.value as ExpenseSplitMethod)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-rose-400 focus:outline-hidden"
                  >
                    <option value="proportional">Proportional to Income</option>
                    <option value="equal">Equal 50/50</option>
                    <option value="custom">Custom Split %</option>
                    <option value="fixed_dollar">Fixed $ Allocation (Remainder to Partner)</option>
                  </select>
                </div>
              </div>

              {newExpSplitMethod === 'custom' && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Bunny Share % (Remainder to Monkey)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newExpCustomBunny}
                    onChange={(e) => setNewExpCustomBunny(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono"
                  />
                </div>
              )}

              {newExpSplitMethod === 'fixed_dollar' && (
                <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Fixed Dollar ($) Allocation
                    </span>
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                      Remainder to other partner
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Partner with Fixed Share
                      </label>
                      <select
                        value={newExpFixedPayer}
                        onChange={(e) => setNewExpFixedPayer(e.target.value as 'bunny' | 'monkey')}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 bg-slate-900 text-slate-100 text-xs font-medium focus:border-rose-400 focus:outline-hidden"
                      >
                        <option value="bunny">🐰 Bunny pays fixed $</option>
                        <option value="monkey">🐵 Monkey pays fixed $</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Fixed Amount ($ CAD) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 font-mono text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required={newExpSplitMethod === 'fixed_dollar'}
                          placeholder="100"
                          value={newExpFixedAmount}
                          onChange={(e) => setNewExpFixedAmount(e.target.value)}
                          className="w-full pl-6 pr-2.5 py-1.5 rounded-lg border border-white/15 bg-slate-950/60 text-slate-100 text-xs font-mono focus:border-rose-400 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculated Split Live Preview */}
                  {(() => {
                    const totalCost = parseFloat(newExpAmount) || 0;
                    const fixedAmt = Math.max(0, parseFloat(newExpFixedAmount) || 0);
                    const cappedFixed = Math.min(totalCost, fixedAmt);
                    const remainder = Math.max(0, totalCost - cappedFixed);
                    const bShare = newExpFixedPayer === 'bunny' ? cappedFixed : remainder;
                    const mShare = newExpFixedPayer === 'monkey' ? cappedFixed : remainder;

                    return (
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Calculated Split:</span>
                        <div className="flex items-center space-x-2 font-mono">
                          <span className="text-rose-300 font-semibold">
                            🐰 Bunny: {formatCurrency(bShare)}
                            {newExpFixedPayer === 'bunny' && <span className="text-[10px] text-slate-400 ml-0.5 font-normal">(fixed)</span>}
                          </span>
                          <span className="text-slate-500">|</span>
                          <span className="text-teal-300 font-semibold">
                            🐵 Monkey: {formatCurrency(mShare)}
                            {newExpFixedPayer === 'monkey' && <span className="text-[10px] text-slate-400 ml-0.5 font-normal">(fixed)</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Policy # or auto-pay schedule"
                  value={newExpNotes}
                  onChange={(e) => setNewExpNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-400/50 text-white font-semibold shadow-lg shadow-rose-600/20 transition-all"
                >
                  Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Recurring Bill Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Edit2 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">
                  Modify Recurring Bill
                </h3>
              </div>
              <button
                onClick={() => setEditingExpense(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateExpense} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Bill / Expense Title *
                </label>
                <input
                  type="text"
                  required
                  value={editExpTitle}
                  onChange={(e) => setEditExpTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm focus:border-indigo-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Monthly Amount ($ CAD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editExpAmount}
                    onChange={(e) => setEditExpAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono focus:border-indigo-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={editExpCategory}
                    onChange={(e) => setEditExpCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-indigo-400 focus:outline-hidden"
                  >
                    <option value="Housing">Housing</option>
                    <option value="Childcare">Childcare</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Transport">Transport</option>
                    <option value="Debt">Debt</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Dining">Dining</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="Discretionary">Discretionary</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Commitment Type
                  </label>
                  <select
                    value={editExpIsFixed ? 'fixed' : 'variable'}
                    onChange={(e) => setEditExpIsFixed(e.target.value === 'fixed')}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-indigo-400 focus:outline-hidden"
                  >
                    <option value="fixed">Fixed (Obligatory)</option>
                    <option value="variable">Variable (Discretionary)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Split Ratio
                  </label>
                  <select
                    value={editExpSplitMethod}
                    onChange={(e) => setEditExpSplitMethod(e.target.value as ExpenseSplitMethod)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-indigo-400 focus:outline-hidden"
                  >
                    <option value="proportional">Proportional to Income</option>
                    <option value="equal">Equal 50/50</option>
                    <option value="custom">Custom Split %</option>
                    <option value="fixed_dollar">Fixed $ Allocation (Remainder to Partner)</option>
                  </select>
                </div>
              </div>

              {editExpSplitMethod === 'custom' && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Bunny Share % (Remainder to Monkey)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editExpCustomBunny}
                    onChange={(e) => setEditExpCustomBunny(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono"
                  />
                </div>
              )}

              {editExpSplitMethod === 'fixed_dollar' && (
                <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Fixed Dollar ($) Allocation
                    </span>
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                      Remainder to other partner
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Partner with Fixed Share
                      </label>
                      <select
                        value={editExpFixedPayer}
                        onChange={(e) => setEditExpFixedPayer(e.target.value as 'bunny' | 'monkey')}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 bg-slate-900 text-slate-100 text-xs font-medium focus:border-indigo-400 focus:outline-hidden"
                      >
                        <option value="bunny">🐰 Bunny pays fixed $</option>
                        <option value="monkey">🐵 Monkey pays fixed $</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Fixed Amount ($ CAD) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 font-mono text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required={editExpSplitMethod === 'fixed_dollar'}
                          placeholder="100"
                          value={editExpFixedAmount}
                          onChange={(e) => setEditExpFixedAmount(e.target.value)}
                          className="w-full pl-6 pr-2.5 py-1.5 rounded-lg border border-white/15 bg-slate-950/60 text-slate-100 text-xs font-mono focus:border-indigo-400 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculated Split Live Preview */}
                  {(() => {
                    const totalCost = parseFloat(editExpAmount) || 0;
                    const fixedAmt = Math.max(0, parseFloat(editExpFixedAmount) || 0);
                    const cappedFixed = Math.min(totalCost, fixedAmt);
                    const remainder = Math.max(0, totalCost - cappedFixed);
                    const bShare = editExpFixedPayer === 'bunny' ? cappedFixed : remainder;
                    const mShare = editExpFixedPayer === 'monkey' ? cappedFixed : remainder;

                    return (
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Calculated Split:</span>
                        <div className="flex items-center space-x-2 font-mono">
                          <span className="text-rose-300 font-semibold">
                            🐰 Bunny: {formatCurrency(bShare)}
                            {editExpFixedPayer === 'bunny' && <span className="text-[10px] text-slate-400 ml-0.5 font-normal">(fixed)</span>}
                          </span>
                          <span className="text-slate-500">|</span>
                          <span className="text-teal-300 font-semibold">
                            🐵 Monkey: {formatCurrency(mShare)}
                            {editExpFixedPayer === 'monkey' && <span className="text-[10px] text-slate-400 ml-0.5 font-normal">(fixed)</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Policy # or auto-pay schedule"
                  value={editExpNotes}
                  onChange={(e) => setEditExpNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteExpense(editingExpense.id);
                    setEditingExpense(null);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Bill</span>
                </button>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingExpense(null)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/50 text-white font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Sinking Fund Balance Adjustment Modal */}
      {selectedFundForAdjust && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-sm w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-1">
              Adjust Fund Balance
            </h3>
            <p className="text-xs text-slate-400 mb-4">{selectedFundForAdjust.name}</p>

            <form onSubmit={handleAdjustFundBalance} className="space-y-4 text-xs">
              <div className="flex rounded-xl bg-white/5 border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setFundAdjustType('deposit')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    fundAdjustType === 'deposit'
                      ? 'bg-emerald-600 text-white shadow-xs border border-emerald-400/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  + Deposit
                </button>
                <button
                  type="button"
                  onClick={() => setFundAdjustType('withdraw')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${
                    fundAdjustType === 'withdraw'
                      ? 'bg-rose-600 text-white shadow-xs border border-rose-400/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  - Withdraw
                </button>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Amount ($ CAD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="500"
                  value={fundAdjustAmount}
                  onChange={(e) => setFundAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono placeholder-slate-500 focus:border-emerald-400 focus:outline-hidden"
                />
              </div>

              <div className="text-[11px] text-slate-400 flex justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                <span>Current Balance:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {formatCurrency(selectedFundForAdjust.currentBalance)}
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFundForAdjust(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                >
                  Confirm {fundAdjustType === 'deposit' ? 'Deposit' : 'Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add Sinking Fund Modal */}
      {showAddSinkingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-4">
              Create Specialized Sinking Fund
            </h3>

            <form onSubmit={handleAddSinkingFund} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Fund Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Home Heat Pump &amp; Roof Replacement"
                  value={newSfName}
                  onChange={(e) => setNewSfName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 placeholder-slate-500 text-sm focus:border-emerald-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Target Goal ($ CAD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="25000"
                    value={newSfTarget}
                    onChange={(e) => setNewSfTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono placeholder-slate-500 focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Initial Balance ($ CAD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="5000"
                    value={newSfCurrent}
                    onChange={(e) => setNewSfCurrent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono placeholder-slate-500 focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newSfCategory}
                    onChange={(e) => setNewSfCategory(e.target.value as SinkingFund['category'])}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-emerald-400 focus:outline-hidden"
                  >
                    <option value="Emergency">Emergency</option>
                    <option value="Education">Education</option>
                    <option value="Home">Home</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Health">Health</option>
                    <option value="Vacation">Vacation</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Monthly Siphon ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="400"
                    value={newSfMonthly}
                    onChange={(e) => setNewSfMonthly(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono placeholder-slate-500 focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={newSfDate}
                  onChange={(e) => setNewSfDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-emerald-400 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSinkingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                >
                  Save Fund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sinking Fund Modal */}
      {editingFund && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Edit2 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">
                  Modify Sinking Fund
                </h3>
              </div>
              <button
                onClick={() => setEditingFund(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateSinkingFund} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Fund Name *
                </label>
                <input
                  type="text"
                  required
                  value={editSfName}
                  onChange={(e) => setEditSfName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm focus:border-emerald-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Target Goal ($ CAD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editSfTarget}
                    onChange={(e) => setEditSfTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Current Balance ($ CAD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editSfCurrent}
                    onChange={(e) => setEditSfCurrent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={editSfCategory}
                    onChange={(e) => setEditSfCategory(e.target.value as SinkingFund['category'])}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-emerald-400 focus:outline-hidden"
                  >
                    <option value="Emergency">Emergency</option>
                    <option value="Education">Education</option>
                    <option value="Home">Home</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Health">Health</option>
                    <option value="Vacation">Vacation</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Monthly Siphon ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSfMonthly}
                    onChange={(e) => setEditSfMonthly(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 text-sm font-mono focus:border-emerald-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={editSfDate}
                  onChange={(e) => setEditSfDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-100 text-sm focus:border-emerald-400 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Fund Purpose / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ring-fenced high interest savings"
                  value={editSfNotes}
                  onChange={(e) => setEditSfNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => handleDeleteSinkingFund(editingFund.id)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Fund</span>
                </button>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingFund(null)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Incomes Modal */}
      {showIncomeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-2">
              Update Partner Monthly Incomes
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter monthly gross and take-home net amounts to recalibrate the split ratio.
            </p>

            <form onSubmit={handleSaveIncomes} className="space-y-4 text-xs">
              {/* Bunny */}
              <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-2.5">
                <h4 className="font-bold text-rose-300">🐰 Bunny Income</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Monthly Net (Take-Home) *
                    </label>
                    <input
                      type="number"
                      required
                      value={bunnyNetInput}
                      onChange={(e) => setBunnyNetInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono text-sm focus:border-rose-400 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Monthly Gross
                    </label>
                    <input
                      type="number"
                      value={bunnyGrossInput}
                      onChange={(e) => setBunnyGrossInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono text-sm focus:border-rose-400 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Monkey */}
              <div className="p-3.5 rounded-xl bg-teal-950/30 border border-teal-500/30 space-y-2.5">
                <h4 className="font-bold text-teal-300">🐵 Monkey Income</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Monthly Net (Take-Home) *
                    </label>
                    <input
                      type="number"
                      required
                      value={monkeyNetInput}
                      onChange={(e) => setMonkeyNetInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono text-sm focus:border-teal-400 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Monthly Gross
                    </label>
                    <input
                      type="number"
                      value={monkeyGrossInput}
                      onChange={(e) => setMonkeyGrossInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-100 font-mono text-sm focus:border-teal-400 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview of recalibrated split */}
              {(() => {
                const previewBNet = parseFloat(bunnyNetInput) || 0;
                const previewMNet = parseFloat(monkeyNetInput) || 0;
                const previewTotal = previewBNet + previewMNet;
                const previewBunnyPct = previewTotal > 0 ? (previewBNet / previewTotal) * 100 : 50;
                const previewMonkeyPct = previewTotal > 0 ? (previewMNet / previewTotal) * 100 : 50;
                return (
                  <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium mb-1.5">
                      <span className="text-slate-400">Recalibrated Split Ratio:</span>
                      <span className="font-mono font-bold text-white">
                        🐰 {previewBunnyPct.toFixed(1)}% / 🐵 {previewMonkeyPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden bg-slate-800 flex">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${previewBunnyPct}%` }}
                      />
                      <div
                        className="h-full bg-teal-500 transition-all duration-300"
                        style={{ width: `${previewMonkeyPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>Joint Net: {formatCurrency(previewTotal)}/mo</span>
                      <span>Direct Supabase Persistence</span>
                    </div>
                  </div>
                );
              })()}

              {incomeSaveError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center space-x-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{incomeSaveError}</span>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingIncome}
                  onClick={() => setShowIncomeModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingIncome}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 border border-indigo-400/50 text-white font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                >
                  {isSavingIncome ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Recalibrate &amp; Save</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
