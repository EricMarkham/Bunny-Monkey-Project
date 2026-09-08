import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Receipt,
  ArrowRight,
  Filter,
  DollarSign,
  PieChart as PieChartIcon,
  ShoppingCart,
  Home,
  Utensils,
  Baby,
  Zap,
  Car,
  Tv,
  CreditCard,
  Shield,
  Plane,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';
import { HouseholdState, CategoryBudgetVsActual } from '../types';
import {
  calculateBudgetVsActuals,
  formatCurrency,
  formatCurrencyExact,
  getStatementPeriods,
  sanitizeTransactions,
} from '../utils/finance';
import {
  mapRowToExpense,
  mapRowToTransaction,
} from '../services/supabaseService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface BudgetVsActualsDashboardProps {
  state: HouseholdState;
  onNavigateToStatements: () => void;
  onNavigateToBudget: () => void;
  onUpdateState?: React.Dispatch<React.SetStateAction<HouseholdState>>;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Groceries: <ShoppingCart className="w-4 h-4 text-lime-300" />,
  Housing: <Home className="w-4 h-4 text-indigo-300" />,
  Dining: <Utensils className="w-4 h-4 text-amber-300" />,
  Childcare: <Baby className="w-4 h-4 text-rose-300" />,
  Utilities: <Zap className="w-4 h-4 text-sky-300" />,
  Transport: <Car className="w-4 h-4 text-emerald-300" />,
  Subscriptions: <Tv className="w-4 h-4 text-purple-300" />,
  Debt: <CreditCard className="w-4 h-4 text-red-300" />,
  Insurance: <Shield className="w-4 h-4 text-blue-300" />,
  Travel: <Plane className="w-4 h-4 text-teal-300" />,
  Discretionary: <Sparkles className="w-4 h-4 text-yellow-300" />,
  Uncategorized: <Receipt className="w-4 h-4 text-slate-400" />,
};

export function BudgetVsActualsDashboard({
  state,
  onNavigateToStatements,
  onNavigateToBudget,
  onUpdateState,
}: BudgetVsActualsDashboardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncFromSupabase = async () => {
    if (!isSupabaseConfigured() || !onUpdateState) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const expRes = await supabase.from('expenses').select('*');
      if (expRes.error) {
        console.error('Supabase Error:', expRes.error);
      }

      let txRes = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (txRes.error) {
        console.error('Supabase Error:', txRes.error);
        txRes = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false });
        if (txRes.error) {
          console.error('Supabase Error:', txRes.error);
          txRes = await supabase.from('transactions').select('*');
        }
      }

      let stTxRes = await supabase
        .from('statement_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (stTxRes.error) {
        console.error('Supabase Error:', stTxRes.error);
        stTxRes = await supabase
          .from('statement_transactions')
          .select('*')
          .order('date', { ascending: false });
        if (stTxRes.error) {
          console.error('Supabase Error:', stTxRes.error);
          stTxRes = await supabase.from('statement_transactions').select('*');
        }
      }

      const freshExpenses = !expRes.error && expRes.data ? expRes.data.map(mapRowToExpense) : null;
      const txData =
        !txRes.error && txRes.data && txRes.data.length > 0
          ? txRes.data
          : !stTxRes.error && stTxRes.data
          ? stTxRes.data
          : null;
      const freshTransactions = txData ? sanitizeTransactions(txData.map(mapRowToTransaction)) : null;

      if (freshExpenses || freshTransactions) {
        onUpdateState((prev) => ({
          ...prev,
          ...(freshExpenses ? { expenses: freshExpenses } : {}),
          ...(freshTransactions ? { statementTransactions: freshTransactions } : {}),
        }));
        setSyncStatus('✓ Synced from Supabase');
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (err: any) {
      console.error('[Supabase BudgetVsActuals Exception]:', err);
      setSyncError(err?.message || 'Failed to sync latest records from Supabase');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncFromSupabase();
  }, []);

  const availablePeriods = useMemo(
    () => getStatementPeriods(state.statementTransactions),
    [state.statementTransactions]
  );

  // Selected period state (defaults to most recent period or fallback)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return availablePeriods.length > 0 ? availablePeriods[0].id : '2026-09';
  });

  // Expanded category transaction inspect panel
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Groceries');
  const [viewScope, setViewScope] = useState<'period' | 'ytd'>('period');

  // Compute budget vs actuals for the selected period
  const comparison = useMemo(() => {
    return calculateBudgetVsActuals(state.expenses, state.statementTransactions, selectedPeriod);
  }, [state.expenses, state.statementTransactions, selectedPeriod]);

  // Selected period display label
  const periodLabel = useMemo(() => {
    const found = availablePeriods.find((p) => p.id === selectedPeriod);
    return found ? found.label : selectedPeriod;
  }, [selectedPeriod, availablePeriods]);

  // Categories sorted by monthly budget or period spend
  const sortedCategories = useMemo(() => {
    return [...(comparison?.categories || [])].sort((a, b) => {
      // Keep uncategorized at end, otherwise sort by actual spend descending
      if (a.category === 'Uncategorized') return 1;
      if (b.category === 'Uncategorized') return -1;
      const valA = viewScope === 'ytd' ? a.ytdActual : a.periodActual;
      const valB = viewScope === 'ytd' ? b.ytdActual : b.periodActual;
      return valB - valA;
    });
  }, [comparison, viewScope]);

  // Chart data preparation
  const chartData = useMemo(() => {
    return sortedCategories.map((c) => ({
      name: c.category,
      Budget: Math.round(viewScope === 'ytd' ? c.ytdBudget : c.monthlyBudget),
      Actual: Math.round(viewScope === 'ytd' ? c.ytdActual : c.periodActual),
      color: c.color,
    }));
  }, [sortedCategories, viewScope]);

  // Categories exceeding budget
  const overBudgetCategories = useMemo(() => {
    return sortedCategories.filter((c) =>
      viewScope === 'ytd' ? c.ytdVariance < 0 : c.periodVariance < 0
    );
  }, [sortedCategories, viewScope]);

  // Annual target calculations (12-month annualized baseline)
  const annualTargetBudget = comparison.overall.monthlyBudget * 12;
  const annualTargetActual = comparison.overall.ytdActual;
  const annualTargetPercent =
    annualTargetBudget > 0 ? (annualTargetActual / annualTargetBudget) * 100 : 0;
  const annualTargetRemaining = annualTargetBudget - annualTargetActual;
  const yearElapsedPercent = (comparison.elapsedMonths / 12) * 100;

  return (
    <div className="space-y-8 pb-16">
      {/* Supabase Error Alert Notification */}
      {syncError && (
        <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm shadow-lg shadow-rose-950/20">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-rose-200">Supabase Database Error</p>
              <p className="text-rose-300/90 text-xs">{syncError}</p>
            </div>
          </div>
          <button
            onClick={() => setSyncError(null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition-colors shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Header & Period Selector */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2.5 2xl:space-x-3">
              <span className="p-2.5 2xl:p-3 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <BarChart3 className="w-5 h-5 2xl:w-6 2xl:h-6" />
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base 2xl:text-xl font-bold text-white">
                    Budget vs. Actuals Dashboard
                  </h2>
                  <span className="text-xs 2xl:text-sm font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {viewScope === 'ytd' ? `YTD (Jan–${periodLabel})` : periodLabel}
                  </span>
                </div>
                <p className="text-xs 2xl:text-sm text-slate-400">
                  {viewScope === 'ytd'
                    ? `Aggregating credit card actuals from January through ${periodLabel} (${comparison.elapsedMonths} months) cross-referenced against YTD targets`
                    : 'Cross-referencing credit card statement actuals against monthly allowances and year-to-date targets'}
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Period Selector & Switchers */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl">
              <Calendar className="w-4 h-4 2xl:w-5 2xl:h-5 text-slate-400" />
              <label className="text-xs 2xl:text-sm text-slate-400">
                {viewScope === 'ytd' ? 'YTD Through Period:' : 'Statement Period:'}
              </label>
              <select
                id="statement-period-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-slate-900 text-slate-200 text-xs 2xl:text-sm font-semibold py-1 2xl:py-1.5 px-2.5 2xl:px-3 rounded-lg border border-white/15 focus:outline-hidden focus:border-indigo-400"
              >
                {availablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1 bg-white/5 border border-white/10 p-1 rounded-xl">
              <button
                id="scope-period-btn"
                onClick={() => setViewScope('period')}
                className={`px-3 2xl:px-4 py-1 2xl:py-1.5 text-xs 2xl:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  viewScope === 'period'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Period View
              </button>
              <button
                id="scope-ytd-btn"
                onClick={() => setViewScope('ytd')}
                className={`px-3 2xl:px-4 py-1 2xl:py-1.5 text-xs 2xl:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  viewScope === 'ytd'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Year to Date (YTD)
              </button>
            </div>

            {/* Dynamic Supabase Sync Button */}
            <button
              id="sync-supabase-btn"
              onClick={syncFromSupabase}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 px-3 2xl:px-4 py-1.5 2xl:py-2 text-xs 2xl:text-sm font-semibold rounded-xl bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              title="Fetch latest expenses and statement transactions dynamically from Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-indigo-300 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : syncStatus || 'Sync Supabase'}</span>
            </button>
          </div>
        </div>

        {/* 2. Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 2xl:gap-6 mt-6 pt-5 border-t border-white/10">
          {/* Card 1: Period vs YTD Actual vs Budget */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-indigo-300">
                {viewScope === 'ytd'
                  ? `YTD Budget vs. Actual (${comparison.elapsedMonths} Mo.)`
                  : 'Period Budget vs. Actual'}
              </span>
              <span
                className={`text-[10px] 2xl:text-xs font-bold px-2 py-0.5 rounded-md ${
                  (viewScope === 'ytd' ? comparison.overall.ytdVariance : comparison.overall.periodVariance) >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {viewScope === 'ytd'
                  ? comparison.overall.ytdVariance >= 0
                    ? `+${formatCurrency(comparison.overall.ytdVariance)} Under`
                    : `-${formatCurrency(Math.abs(comparison.overall.ytdVariance))} Over`
                  : comparison.overall.periodVariance >= 0
                  ? `+${formatCurrency(comparison.overall.periodVariance)} Under`
                  : `-${formatCurrency(Math.abs(comparison.overall.periodVariance))} Over`}
              </span>
            </div>

            <div className="text-2xl 2xl:text-3xl font-black font-mono text-white tracking-tight">
              {formatCurrency(viewScope === 'ytd' ? comparison.overall.ytdActual : comparison.overall.periodActual)}
              <span className="text-sm 2xl:text-base font-normal text-slate-400 ml-1.5">
                / {formatCurrency(viewScope === 'ytd' ? comparison.overall.ytdBudget : comparison.overall.monthlyBudget)}
              </span>
            </div>

            {/* Utilization bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] 2xl:text-xs text-slate-400 mb-1 font-mono">
                <span>
                  {viewScope === 'ytd'
                    ? `${comparison.overall.ytdPercent.toFixed(1)}% YTD Used`
                    : `${comparison.overall.periodPercent.toFixed(1)}% Used`}
                </span>
                <span>
                  {viewScope === 'ytd'
                    ? comparison.overall.ytdVariance >= 0
                      ? 'YTD Surplus Remaining'
                      : 'YTD Deficit Exceeded'
                    : comparison.overall.periodVariance >= 0
                    ? 'Surplus Remaining'
                    : 'Deficit Exceeded'}
                </span>
              </div>
              <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                <div
                  style={{
                    width: `${Math.min(
                      100,
                      viewScope === 'ytd' ? comparison.overall.ytdPercent : comparison.overall.periodPercent
                    )}%`,
                  }}
                  className={`h-full transition-all duration-300 ${
                    (viewScope === 'ytd' ? comparison.overall.ytdPercent : comparison.overall.periodPercent) > 100
                      ? 'bg-rose-500'
                      : (viewScope === 'ytd' ? comparison.overall.ytdPercent : comparison.overall.periodPercent) > 85
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Year to Date or Annual Target Metrics */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-teal-300">
                {viewScope === 'ytd'
                  ? 'YTD vs. Annual Target (12 Mo.)'
                  : `Year to Date (${comparison.elapsedMonths} Mo. Target)`}
              </span>
              <span
                className={`text-[10px] 2xl:text-xs font-bold px-2 py-0.5 rounded-md ${
                  (viewScope === 'ytd' ? annualTargetRemaining : comparison.overall.ytdVariance) >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {viewScope === 'ytd'
                  ? annualTargetRemaining >= 0
                    ? `+${formatCurrency(annualTargetRemaining)} Room Left`
                    : `-${formatCurrency(Math.abs(annualTargetRemaining))} Over Cap`
                  : comparison.overall.ytdVariance >= 0
                  ? `+${formatCurrency(comparison.overall.ytdVariance)} Under`
                  : `-${formatCurrency(Math.abs(comparison.overall.ytdVariance))} Over`}
              </span>
            </div>

            <div className="text-2xl 2xl:text-3xl font-black font-mono text-teal-300 tracking-tight">
              {formatCurrency(comparison.overall.ytdActual)}
              <span className="text-sm 2xl:text-base font-normal text-slate-400 ml-1.5">
                / {formatCurrency(viewScope === 'ytd' ? annualTargetBudget : comparison.overall.ytdBudget)}
              </span>
            </div>

            {/* Utilization bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] 2xl:text-xs text-slate-400 mb-1 font-mono">
                <span>
                  {viewScope === 'ytd'
                    ? `${annualTargetPercent.toFixed(1)}% of Annual Target`
                    : `${comparison.overall.ytdPercent.toFixed(1)}% YTD Used`}
                </span>
                <span>
                  {viewScope === 'ytd'
                    ? `Target Pace: ${yearElapsedPercent.toFixed(0)}% (${comparison.elapsedMonths}/12 Mo)`
                    : 'Annualized Target'}
                </span>
              </div>
              <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                <div
                  style={{
                    width: `${Math.min(
                      100,
                      viewScope === 'ytd' ? annualTargetPercent : comparison.overall.ytdPercent
                    )}%`,
                  }}
                  className={`h-full transition-all duration-300 ${
                    viewScope === 'ytd'
                      ? annualTargetPercent > yearElapsedPercent + 5
                        ? 'bg-rose-500'
                        : annualTargetPercent > yearElapsedPercent
                        ? 'bg-amber-400'
                        : 'bg-teal-400'
                      : comparison.overall.ytdPercent > 100
                      ? 'bg-rose-500'
                      : comparison.overall.ytdPercent > 85
                      ? 'bg-amber-400'
                      : 'bg-teal-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Partner Statement Contribution */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-rose-300 block mb-1">
              {viewScope === 'ytd'
                ? `Partner YTD Actuals (Jan–${periodLabel.split(' ')[0]})`
                : 'Partner Period Actuals'}
            </span>
            <div className="space-y-1.5 2xl:space-y-2 mt-2 text-xs 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐰 Bunny:</span>
                <span className="font-mono font-semibold text-rose-300">
                  {formatCurrency(
                    viewScope === 'ytd'
                      ? comparison.overall.ytdByPartner.bunny
                      : comparison.overall.periodByPartner.bunny
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐵 Monkey:</span>
                <span className="font-mono font-semibold text-teal-300">
                  {formatCurrency(
                    viewScope === 'ytd'
                      ? comparison.overall.ytdByPartner.monkey
                      : comparison.overall.periodByPartner.monkey
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">💳 Joint Cards:</span>
                <span className="font-mono font-semibold text-indigo-300">
                  {formatCurrency(
                    viewScope === 'ytd'
                      ? comparison.overall.ytdByPartner.joint
                      : comparison.overall.periodByPartner.joint
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Health & Alert Summary */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-amber-300 block mb-1">
              {viewScope === 'ytd' ? 'YTD Health & Alerts' : 'Budget Health & Alerts'}
            </span>
            <div className="mt-2 text-xs 2xl:text-sm space-y-1.5 2xl:space-y-2">
              {overBudgetCategories.length === 0 ? (
                <div className="flex items-center space-x-2 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 2xl:w-5 2xl:h-5 text-emerald-400" />
                  <span className="font-medium">
                    {viewScope === 'ytd' ? 'All categories within YTD budget!' : 'All categories within budget!'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-rose-300">
                  <AlertCircle className="w-4 h-4 2xl:w-5 2xl:h-5 text-rose-400 shrink-0" />
                  <span className="font-medium">
                    {overBudgetCategories.length} categories over{' '}
                    {viewScope === 'ytd' ? `${comparison.elapsedMonths}-mo YTD budget` : 'monthly budget'}
                  </span>
                </div>
              )}
              <p className="text-[11px] 2xl:text-xs text-slate-400">
                {viewScope === 'ytd'
                  ? `${comparison.overall.ytdTxCount} statement transactions parsed Year-to-Date (Jan–${periodLabel}) across ${sortedCategories.length} tracked categories.`
                  : `${comparison.overall.periodTxCount} statement transactions parsed in ${periodLabel} across ${sortedCategories.length} tracked categories.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Visual Comparison Chart */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base 2xl:text-xl font-bold text-white">
              {viewScope === 'ytd'
                ? 'Category Comparison: YTD Budget vs. YTD Actual'
                : 'Category Comparison: Monthly Budget vs. Period Actual'}
            </h3>
            <p className="text-xs 2xl:text-sm text-slate-400">
              {viewScope === 'ytd'
                ? `Visualizing cumulative ${comparison.elapsedMonths}-month YTD budget targets vs actual spending (Jan–${periodLabel})`
                : `Visualizing set allowance vs actual credit card spending for ${periodLabel}`}
            </p>
          </div>
          <span className="text-xs 2xl:text-sm font-mono text-slate-400">CAD ($)</span>
        </div>

        <div className="h-64 sm:h-72 2xl:h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                fontSize={12}
                angle={-25}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  fontSize: '13px',
                }}
                formatter={(value: any) => [`$${value.toLocaleString()}`, '']}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '13px' }} />
              <Bar
                dataKey="Budget"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                name={viewScope === 'ytd' ? `YTD Budget (${comparison.elapsedMonths} Mo.)` : 'Monthly Budget'}
              />
              <Bar
                dataKey="Actual"
                fill="#14b8a6"
                radius={[4, 4, 0, 0]}
                name={viewScope === 'ytd' ? 'YTD Actual' : 'Period Actual'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Detailed Category Breakdown Matrix with Drill-Down */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base 2xl:text-xl font-bold text-white">
              Category Breakdown &amp; Transaction Inspection
            </h3>
            <p className="text-xs 2xl:text-sm text-slate-400">
              {viewScope === 'ytd'
                ? `Click any category row to inspect all Year-to-Date credit card transactions (Jan–${periodLabel})`
                : `Click any category row to inspect the individual credit card transactions for ${periodLabel}`}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="adjust-budget-btn"
              onClick={onNavigateToBudget}
              className="text-xs 2xl:text-sm text-indigo-300 hover:text-white px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <span>Adjust Budget Limits</span>
              <ArrowRight className="w-3 h-3 2xl:w-4 2xl:h-4" />
            </button>
            <button
              id="upload-statements-btn"
              onClick={onNavigateToStatements}
              className="text-xs 2xl:text-sm text-teal-300 hover:text-white px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <span>Upload Statements</span>
              <ArrowRight className="w-3 h-3 2xl:w-4 2xl:h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {sortedCategories.map((cat) => {
            const isExpanded = expandedCategory === cat.category;
            const currentActual = viewScope === 'ytd' ? cat.ytdActual : cat.periodActual;
            const currentBudget = viewScope === 'ytd' ? cat.ytdBudget : cat.monthlyBudget;
            const currentVariance = viewScope === 'ytd' ? cat.ytdVariance : cat.periodVariance;
            const isOverBudget = currentVariance < 0;
            const pct = viewScope === 'ytd' ? cat.ytdPercent : cat.periodPercent;
            const currentTransactions = viewScope === 'ytd' ? cat.ytdTransactions : cat.periodTransactions;
            const categoryAnnualBudget = cat.monthlyBudget * 12;
            const categoryAnnualPercent =
              categoryAnnualBudget > 0 ? (cat.ytdActual / categoryAnnualBudget) * 100 : 0;

            return (
              <div
                key={cat.category}
                id={`cat-card-${cat.category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all hover:border-white/20"
              >
                {/* Main Row / Header */}
                <div
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                  className="p-4 2xl:p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center space-x-3 2xl:space-x-4 min-w-[200px]">
                    <span className="p-2 2xl:p-2.5 rounded-xl bg-white/5 border border-white/10">
                      {CATEGORY_ICONS[cat.category] || <Receipt className="w-4 h-4 2xl:w-5 2xl:h-5 text-slate-400" />}
                    </span>
                    <div>
                      <h4 className="text-sm 2xl:text-base font-bold text-white flex items-center space-x-2">
                        <span>{cat.category}</span>
                        {isOverBudget && (
                          <span className="text-[10px] 2xl:text-xs font-bold px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Over by {formatCurrency(Math.abs(currentVariance))}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] 2xl:text-xs text-slate-400">
                        {cat.label} • {currentTransactions.length} txns {viewScope === 'ytd' ? `YTD (Jan–${periodLabel})` : 'in period'}
                      </p>
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  <div className="flex-1 max-w-md 2xl:max-w-xl">
                    <div className="flex justify-between text-xs 2xl:text-sm mb-1 font-mono">
                      <span className="text-slate-300">
                        Actual: <strong>{formatCurrency(currentActual)}</strong>
                      </span>
                      <span className="text-slate-400">
                        Budget: <strong>{formatCurrency(currentBudget)}</strong>
                        {viewScope === 'ytd' && (
                          <span className="text-[10px] text-slate-500 ml-1">({comparison.elapsedMonths} Mo.)</span>
                        )}
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, pct)}%` }}
                        className={`h-full transition-all duration-300 ${
                          pct > 100
                            ? 'bg-rose-500'
                            : pct > 85
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>{pct.toFixed(1)}% {viewScope === 'ytd' ? 'YTD ' : ''}Used</span>
                      <span className={currentVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {currentVariance >= 0
                          ? `+${formatCurrency(currentVariance)} Under`
                          : `-${formatCurrency(Math.abs(currentVariance))} Over`}
                      </span>
                    </div>
                  </div>

                  {/* Secondary Metric Column: YTD in Period View, or Full Year Annual Target in YTD View */}
                  <div className="hidden lg:block text-right min-w-[140px]">
                    {viewScope === 'ytd' ? (
                      <>
                        <div className="text-[11px] text-slate-400 font-medium">Annual Target (12 Mo.)</div>
                        <div className="font-mono font-bold text-teal-300 text-xs">
                          {formatCurrency(categoryAnnualBudget)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {categoryAnnualPercent.toFixed(1)}% of Year Target
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] text-slate-400 font-medium">Year-to-Date (YTD)</div>
                        <div className="font-mono font-bold text-teal-300 text-xs">
                          {formatCurrency(cat.ytdActual)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          YTD Budget: {formatCurrency(cat.ytdBudget)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Expand Chevron */}
                  <div className="flex items-center space-x-2 text-slate-400">
                    <span className="text-xs text-indigo-300 hover:underline">
                      {isExpanded ? 'Hide Txns' : `Inspect (${currentTransactions.length})`}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-300" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                </div>

                {/* Expanded Transactions List for this category */}
                {isExpanded && (
                  <div className="bg-black/30 border-t border-white/10 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">
                        Statement Transactions for {cat.category} {viewScope === 'ytd' ? `(YTD Jan–${periodLabel})` : `in ${periodLabel}`}
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        Sum: {formatCurrencyExact(currentActual)}
                      </span>
                    </div>

                    {currentTransactions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">
                        No transactions recorded for {cat.category} {viewScope === 'ytd' ? `Year-to-Date (Jan–${periodLabel})` : 'in this period'}.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[10px]">
                            <tr>
                              <th className="py-2 px-3">Date</th>
                              <th className="py-2 px-3">Merchant / Payee</th>
                              <th className="py-2 px-3">Card / Partner</th>
                              <th className="py-2 px-3 text-right">Amount ($ CAD)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                            {[...currentTransactions]
                              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                              .map((tx) => (
                                <tr key={tx.id} className="hover:bg-white/5">
                                  <td className="py-2 px-3 text-slate-400">{tx.date}</td>
                                  <td className="py-2 px-3 font-sans font-medium text-slate-200">
                                    {tx.merchant}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className="text-[10px] text-slate-300 font-sans">
                                      {tx.partner === 'bunny'
                                        ? '🐰 Bunny'
                                        : tx.partner === 'monkey'
                                        ? '🐵 Monkey'
                                        : '💳 Joint'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-white">
                                    {formatCurrencyExact(tx.amount)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
