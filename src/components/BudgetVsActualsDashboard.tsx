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
    return availablePeriods.length > 0 ? availablePeriods[0].id : '2026-08';
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
      // Keep uncategorized at end, otherwise sort by period actual descending
      if (a.category === 'Uncategorized') return 1;
      if (b.category === 'Uncategorized') return -1;
      return b.periodActual - a.periodActual;
    });
  }, [comparison]);

  // Chart data preparation
  const chartData = useMemo(() => {
    return sortedCategories.map((c) => ({
      name: c.category,
      Budget: Math.round(c.monthlyBudget),
      Actual: Math.round(c.periodActual),
      color: c.color,
    }));
  }, [sortedCategories]);

  // Categories exceeding budget
  const overBudgetCategories = useMemo(() => {
    return sortedCategories.filter((c) => c.periodVariance < 0);
  }, [sortedCategories]);

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
                    {periodLabel}
                  </span>
                </div>
                <p className="text-xs 2xl:text-sm text-slate-400">
                  Cross-referencing credit card statement actuals against monthly allowances and year-to-date targets
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Period Selector & Switchers */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl">
              <Calendar className="w-4 h-4 2xl:w-5 2xl:h-5 text-slate-400" />
              <label className="text-xs 2xl:text-sm text-slate-400">Statement Period:</label>
              <select
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
                onClick={() => setViewScope('period')}
                className={`px-3 2xl:px-4 py-1 2xl:py-1.5 text-xs 2xl:text-sm font-semibold rounded-lg transition-all ${
                  viewScope === 'period'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Period View
              </button>
              <button
                onClick={() => setViewScope('ytd')}
                className={`px-3 2xl:px-4 py-1 2xl:py-1.5 text-xs 2xl:text-sm font-semibold rounded-lg transition-all ${
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
          {/* Card 1: Period Actual vs Budget */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Period Budget vs. Actual
              </span>
              <span
                className={`text-[10px] 2xl:text-xs font-bold px-2 py-0.5 rounded-md ${
                  comparison.overall.periodVariance >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {comparison.overall.periodVariance >= 0
                  ? `+${formatCurrency(comparison.overall.periodVariance)} Under`
                  : `-${formatCurrency(Math.abs(comparison.overall.periodVariance))} Over`}
              </span>
            </div>

            <div className="text-2xl 2xl:text-3xl font-black font-mono text-white tracking-tight">
              {formatCurrency(comparison.overall.periodActual)}
              <span className="text-sm 2xl:text-base font-normal text-slate-400 ml-1.5">
                / {formatCurrency(comparison.overall.monthlyBudget)}
              </span>
            </div>

            {/* Utilization bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] 2xl:text-xs text-slate-400 mb-1 font-mono">
                <span>{comparison.overall.periodPercent.toFixed(1)}% Used</span>
                <span>
                  {comparison.overall.periodVariance >= 0 ? 'Surplus Remaining' : 'Deficit Exceeded'}
                </span>
              </div>
              <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, comparison.overall.periodPercent)}%` }}
                  className={`h-full transition-all duration-300 ${
                    comparison.overall.periodPercent > 100
                      ? 'bg-rose-500'
                      : comparison.overall.periodPercent > 85
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Year to Date Actual vs Budget */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-teal-300">
                Year to Date ({comparison.elapsedMonths} Mo. Target)
              </span>
              <span
                className={`text-[10px] 2xl:text-xs font-bold px-2 py-0.5 rounded-md ${
                  comparison.overall.ytdVariance >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {comparison.overall.ytdVariance >= 0
                  ? `+${formatCurrency(comparison.overall.ytdVariance)} Under`
                  : `-${formatCurrency(Math.abs(comparison.overall.ytdVariance))} Over`}
              </span>
            </div>

            <div className="text-2xl 2xl:text-3xl font-black font-mono text-teal-300 tracking-tight">
              {formatCurrency(comparison.overall.ytdActual)}
              <span className="text-sm 2xl:text-base font-normal text-slate-400 ml-1.5">
                / {formatCurrency(comparison.overall.ytdBudget)}
              </span>
            </div>

            {/* YTD Utilization bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] 2xl:text-xs text-slate-400 mb-1 font-mono">
                <span>{comparison.overall.ytdPercent.toFixed(1)}% YTD Used</span>
                <span>Annualized Target</span>
              </div>
              <div className="h-2 2xl:h-2.5 w-full rounded-full bg-slate-900/80 border border-white/10 overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, comparison.overall.ytdPercent)}%` }}
                  className={`h-full transition-all duration-300 ${
                    comparison.overall.ytdPercent > 100
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
              Partner Period Actuals
            </span>
            <div className="space-y-1.5 2xl:space-y-2 mt-2 text-xs 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐰 Bunny:</span>
                <span className="font-mono font-semibold text-rose-300">
                  {formatCurrency(comparison.overall.periodByPartner.bunny)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐵 Monkey:</span>
                <span className="font-mono font-semibold text-teal-300">
                  {formatCurrency(comparison.overall.periodByPartner.monkey)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">💳 Joint Cards:</span>
                <span className="font-mono font-semibold text-indigo-300">
                  {formatCurrency(comparison.overall.periodByPartner.joint)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Health & Alert Summary */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-amber-300 block mb-1">
              Budget Health &amp; Alerts
            </span>
            <div className="mt-2 text-xs 2xl:text-sm space-y-1.5 2xl:space-y-2">
              {overBudgetCategories.length === 0 ? (
                <div className="flex items-center space-x-2 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 2xl:w-5 2xl:h-5 text-emerald-400" />
                  <span className="font-medium">All categories within budget!</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-rose-300">
                  <AlertCircle className="w-4 h-4 2xl:w-5 2xl:h-5 text-rose-400 shrink-0" />
                  <span className="font-medium">
                    {overBudgetCategories.length} categories over monthly budget
                  </span>
                </div>
              )}
              <p className="text-[11px] 2xl:text-xs text-slate-400">
                {comparison.overall.periodTxCount} statement transactions parsed across{' '}
                {sortedCategories.length} tracked categories.
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
              Category Comparison: Monthly Budget vs. Period Actual
            </h3>
            <p className="text-xs 2xl:text-sm text-slate-400">
              Visualizing set allowance vs actual credit card spending for {periodLabel}
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
              <Bar dataKey="Budget" fill="#6366f1" radius={[4, 4, 0, 0]} name="Monthly Budget" />
              <Bar dataKey="Actual" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Period Actual" />
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
              Click any category row to inspect the individual credit card transactions for {periodLabel}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onNavigateToBudget}
              className="text-xs 2xl:text-sm text-indigo-300 hover:text-white px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center space-x-1"
            >
              <span>Adjust Budget Limits</span>
              <ArrowRight className="w-3 h-3 2xl:w-4 2xl:h-4" />
            </button>
            <button
              onClick={onNavigateToStatements}
              className="text-xs 2xl:text-sm text-teal-300 hover:text-white px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center space-x-1"
            >
              <span>Upload Statements</span>
              <ArrowRight className="w-3 h-3 2xl:w-4 2xl:h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {sortedCategories.map((cat) => {
            const isExpanded = expandedCategory === cat.category;
            const isOverBudget = cat.periodVariance < 0;
            const pct = cat.periodPercent;

            return (
              <div
                key={cat.category}
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
                            Over by {formatCurrency(Math.abs(cat.periodVariance))}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] 2xl:text-xs text-slate-400">
                        {cat.label} • {cat.periodTransactions.length} txns in period
                      </p>
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  <div className="flex-1 max-w-md 2xl:max-w-xl">
                    <div className="flex justify-between text-xs 2xl:text-sm mb-1 font-mono">
                      <span className="text-slate-300">
                        Actual: <strong>{formatCurrency(cat.periodActual)}</strong>
                      </span>
                      <span className="text-slate-400">
                        Budget: <strong>{formatCurrency(cat.monthlyBudget)}</strong>
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
                      <span>{pct.toFixed(1)}% Used</span>
                      <span className={cat.periodVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {cat.periodVariance >= 0
                          ? `+${formatCurrency(cat.periodVariance)} Under`
                          : `-${formatCurrency(Math.abs(cat.periodVariance))} Over`}
                      </span>
                    </div>
                  </div>

                  {/* YTD Metrics */}
                  <div className="hidden lg:block text-right min-w-[140px]">
                    <div className="text-[11px] text-slate-400 font-medium">Year-to-Date (YTD)</div>
                    <div className="font-mono font-bold text-teal-300 text-xs">
                      {formatCurrency(cat.ytdActual)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      YTD Budget: {formatCurrency(cat.ytdBudget)}
                    </div>
                  </div>

                  {/* Expand Chevron */}
                  <div className="flex items-center space-x-2 text-slate-400">
                    <span className="text-xs text-indigo-300 hover:underline">
                      {isExpanded ? 'Hide Txns' : `Inspect (${cat.periodTransactions.length})`}
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
                        Statement Transactions for {cat.category} in {periodLabel}
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        Sum: {formatCurrencyExact(cat.periodActual)}
                      </span>
                    </div>

                    {cat.periodTransactions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">
                        No transactions recorded for {cat.category} in this period.
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
                            {cat.periodTransactions.map((tx) => (
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
