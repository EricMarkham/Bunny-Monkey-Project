import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Plus,
  Trash2,
  Calendar,
  Zap,
  DollarSign,
  PieChart,
  Percent,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Search,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  Edit2,
} from 'lucide-react';
import {
  AccountType,
  DividendHolding,
  HoldingOwner,
  HouseholdState,
  PayoutFrequency,
} from '../types';
import {
  calculateDividendMetrics,
  formatCurrency,
  formatCurrencyExact,
  formatPercent,
  simulateDRIPCompound,
  USD_TO_CAD_RATE,
} from '../utils/finance';
import { DRIPGrowthAreaChart, MonthlyDividendBarChart } from './charts/CustomCharts';
import { supabase } from '../lib/supabase';
import {
  mapHoldingToRow,
  mapRowToHolding,
  updateDripSettingsInSupabase,
} from '../services/supabaseService';

interface DividendTrackerModuleProps {
  state: HouseholdState;
  onUpdateState: (updater: (prev: HouseholdState) => HouseholdState) => void;
}

const ACCOUNT_COLORS: Record<AccountType, string> = {
  TFSA: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  RRSP: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  'Non-Registered': 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  RESP: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
};

export function DividendTrackerModule({ state, onUpdateState }: DividendTrackerModuleProps) {
  const [showAddHoldingModal, setShowAddHoldingModal] = useState(false);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('all');

  // Supabase real-time sync state
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [isSubmittingHolding, setIsSubmittingHolding] = useState(false);
  const [addHoldingError, setAddHoldingError] = useState<string | null>(null);

  // Initial component mount: fetch all existing holdings directly via supabase.from('holdings').select('*')
  useEffect(() => {
    let isMounted = true;

    async function loadHoldingsFromSupabase() {
      setIsLoadingHoldings(true);
      setHoldingsError(null);
      try {
        const { data, error } = await supabase.from('holdings').select('*');
        if (error) {
          console.error('[Supabase] Error fetching holdings on mount:', error);
          if (isMounted) {
            setHoldingsError(error.message);
          }
          return;
        }

        if (data && isMounted) {
          const mappedHoldings = data.map(mapRowToHolding);
          // Directly populate the state with existing holdings from Supabase, avoiding mock data
          onUpdateState((prev) => ({
            ...prev,
            holdings: mappedHoldings,
          }));
        }
      } catch (err: any) {
        console.error('[Supabase] Exception loading holdings on mount:', err);
        if (isMounted) {
          setHoldingsError(err?.message || 'Failed to load holdings from Supabase');
        }
      } finally {
        if (isMounted) {
          setIsLoadingHoldings(false);
        }
      }
    }

    loadHoldingsFromSupabase();

    return () => {
      isMounted = false;
    };
  }, []);

  // Manual refresh from Supabase
  const handleRefreshHoldings = async () => {
    setIsLoadingHoldings(true);
    setHoldingsError(null);
    try {
      const { data, error } = await supabase.from('holdings').select('*');
      if (error) {
        console.error('[Supabase] Error refreshing holdings:', error);
        setHoldingsError(error.message);
        return;
      }
      if (data) {
        const mappedHoldings = data.map(mapRowToHolding);
        onUpdateState((prev) => ({
          ...prev,
          holdings: mappedHoldings,
        }));
      }
    } catch (err: any) {
      console.error('[Supabase] Exception refreshing holdings:', err);
      setHoldingsError(err?.message || 'Failed to refresh holdings');
    } finally {
      setIsLoadingHoldings(false);
    }
  };

  // DRIP Simulator settings state
  const [horizonYears, setHorizonYears] = useState(state.dripSettings.investmentHorizonYears);
  const [monthlyContribution, setMonthlyContribution] = useState(state.dripSettings.monthlyContribution);
  const [dgrRate, setDgrRate] = useState(state.dripSettings.expectedDgr);
  const [capRate, setCapRate] = useState(state.dripSettings.capitalGrowthRate);
  const [reinvest, setReinvest] = useState(state.dripSettings.reinvestDividends);

  // Edit Holding modal state
  const [editingHolding, setEditingHolding] = useState<DividendHolding | null>(null);
  const [isUpdatingHolding, setIsUpdatingHolding] = useState(false);

  // Helper to persist DRIP changes to Supabase
  const handleUpdateDripSetting = (key: keyof HouseholdState['dripSettings'], value: any) => {
    const updated = {
      ...state.dripSettings,
      [key]: value,
    };
    onUpdateState((prev) => ({
      ...prev,
      dripSettings: updated,
    }));
    updateDripSettingsInSupabase(updated);
  };

  // New Holding form state
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newAccount, setNewAccount] = useState<AccountType>('TFSA');
  const [newOwner, setNewOwner] = useState<HoldingOwner>('bunny');
  const [newCurrency, setNewCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [newShares, setNewShares] = useState('');
  const [newAvgCost, setNewAvgCost] = useState('');
  const [newCurrentPrice, setNewCurrentPrice] = useState('');
  const [newAnnualDiv, setNewAnnualDiv] = useState('');
  const [newFreq, setNewFreq] = useState<PayoutFrequency>('Quarterly');
  const [newSector, setNewSector] = useState('Broad Market');
  const [newDripEnabled, setNewDripEnabled] = useState(true);
  const [newExDate, setNewExDate] = useState('');
  const [newPayDate, setNewPayDate] = useState('');
  const [newPayoutMonths, setNewPayoutMonths] = useState<number[]>([3, 6, 9, 12]);

  // Quote lookup state
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteFetchError, setQuoteFetchError] = useState<string | null>(null);
  const [quoteFetchSuccess, setQuoteFetchSuccess] = useState<string | null>(null);
  const [fetchedYield, setFetchedYield] = useState<number | null>(null);

  // Popular ticker presets for fast 1-click lookup
  const QUICK_TICKERS = [
    { symbol: 'VDY.TO', label: 'VDY (TSX High Div)', flag: '🇨🇦' },
    { symbol: 'SCHD', label: 'SCHD (US Div Equity)', flag: '🇺🇸' },
    { symbol: 'ENB.TO', label: 'Enbridge (TSX)', flag: '🇨🇦' },
    { symbol: 'AAPL', label: 'Apple (US Tech)', flag: '🇺🇸' },
    { symbol: 'XEI.TO', label: 'XEI (iShares TSX)', flag: '🇨🇦' },
  ];

  const handleFetchQuote = async (symbolOverride?: string) => {
    const targetSymbol = (symbolOverride || newSymbol).trim().toUpperCase();
    if (!targetSymbol) {
      setQuoteFetchError('Please enter a stock or ETF ticker symbol (e.g., VDY.TO, SCHD, ENB.TO).');
      return;
    }

    setIsFetchingQuote(true);
    setQuoteFetchError(null);
    setQuoteFetchSuccess(null);
    setNewSymbol(targetSymbol);

    try {
      const res = await fetch(`/api/stock-quote?symbol=${encodeURIComponent(targetSymbol)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Unable to locate market data for '${targetSymbol}'`);
      }

      setNewName(data.name || targetSymbol);
      setNewCurrency(data.currency || 'CAD');
      setNewCurrentPrice(data.currentPrice ? data.currentPrice.toString() : '');
      if (!newAvgCost) {
        setNewAvgCost(data.currentPrice ? data.currentPrice.toString() : '');
      }
      setNewAnnualDiv(data.divPerShare ? data.divPerShare.toString() : '0');
      setNewFreq(data.frequency || 'Quarterly');
      if (data.nextExDate) {
        setNewExDate(data.nextExDate);
        try {
          const exD = new Date(data.nextExDate);
          exD.setDate(exD.getDate() + 15);
          setNewPayDate(exD.toISOString().split('T')[0]);
        } catch {
          setNewPayDate(data.nextExDate);
        }
      }
      if (Array.isArray(data.payoutMonths) && data.payoutMonths.length > 0) {
        setNewPayoutMonths(data.payoutMonths);
      }
      setFetchedYield(data.yieldPercent !== undefined ? data.yieldPercent : null);

      // Auto-suggest sector based on name/symbol
      const lowerName = (data.name || '').toLowerCase();
      if (lowerName.includes('dividend') || lowerName.includes('high yield')) {
        setNewSector('High Dividend Yield ETF');
      } else if (
        lowerName.includes('bank') ||
        targetSymbol.startsWith('RY') ||
        targetSymbol.startsWith('TD') ||
        targetSymbol.startsWith('BNS')
      ) {
        setNewSector('Canadian Financials');
      } else if (
        lowerName.includes('pipeline') ||
        lowerName.includes('energy') ||
        targetSymbol.startsWith('ENB') ||
        targetSymbol.startsWith('TRP')
      ) {
        setNewSector('Energy & Infrastructure');
      } else if (lowerName.includes('apple') || targetSymbol === 'AAPL' || targetSymbol === 'MSFT') {
        setNewSector('Technology');
      } else {
        setNewSector('Broad Market Equity');
      }

      setQuoteFetchSuccess(
        `✓ Found ${data.name}: $${data.currentPrice} ${data.currency} • Annual Div: $${data.divPerShare}/sh (${data.yieldPercent}% Yield) • ${data.frequency}`
      );
    } catch (err: any) {
      setQuoteFetchError(
        err.message ||
          `Could not find ticker '${targetSymbol}'. For Canadian stocks, append '.TO' (e.g. VDY.TO, ENB.TO). For US stocks, use standard tickers (e.g. SCHD, AAPL).`
      );
    } finally {
      setIsFetchingQuote(false);
    }
  };

  // Filtered holdings
  const filteredHoldings = state.holdings.filter((h) => {
    if (selectedAccountFilter !== 'all' && h.accountType !== selectedAccountFilter) return false;
    if (selectedOwnerFilter !== 'all' && h.owner !== selectedOwnerFilter) return false;
    return true;
  });

  // Calculate Metrics
  const metrics = calculateDividendMetrics(filteredHoldings);
  const allHoldingsMetrics = calculateDividendMetrics(state.holdings);

  // Run DRIP compound simulation
  const simulation = simulateDRIPCompound({
    startingPortfolioValue: allHoldingsMetrics.totalMarketValueCAD,
    startingPadi: allHoldingsMetrics.totalPadiCAD,
    annualDividendGrowthRate: dgrRate,
    capitalAppreciationRate: capRate,
    monthlyContribution: monthlyContribution,
    years: horizonYears,
    reinvestDividends: reinvest,
  });

  // Handle Add Holding - immediately executes await supabase.from('holdings').insert([...])
  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const shares = parseFloat(newShares);
    const avgCost = parseFloat(newAvgCost);
    const price = parseFloat(newCurrentPrice);
    const divPerShare = parseFloat(newAnnualDiv) || 0;

    if (!newSymbol.trim() || isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) return;

    // Default payout months if not set
    let payoutMonths = newPayoutMonths;
    if (!payoutMonths || payoutMonths.length === 0) {
      if (newFreq === 'Monthly') payoutMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      else if (newFreq === 'Semi-Annual') payoutMonths = [6, 12];
      else if (newFreq === 'Annual') payoutMonths = [12];
      else payoutMonths = [3, 6, 9, 12];
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const newHolding: DividendHolding = {
      id: `h-${Date.now()}`,
      symbol: newSymbol.trim().toUpperCase(),
      name: newName.trim() || newSymbol.trim().toUpperCase(),
      accountType: newAccount,
      owner: newOwner,
      currency: newCurrency,
      shares,
      avgCostPerShare: avgCost || price,
      currentPrice: price,
      annualDividendPerShare: divPerShare,
      payoutFrequency: newFreq,
      payoutMonths,
      nextExDividendDate: newExDate || todayStr,
      nextPayDate: newPayDate || todayStr,
      sector: newSector,
      dripEnabled: newDripEnabled,
    };

    setIsSubmittingHolding(true);
    setAddHoldingError(null);

    try {
      const dbRow = mapHoldingToRow(newHolding);

      // Immediately execute insert to Supabase holdings table
      const { data, error } = await supabase.from('holdings').insert([dbRow]).select();

      if (error) {
        console.error('[Supabase] Failed to insert holding into Supabase:', error);
        setAddHoldingError(`Supabase Error (${error.code || 'INSERT'}): ${error.message}`);
        setIsSubmittingHolding(false);
        return;
      }

      // If insert succeeds, update state immediately with the inserted holding
      const insertedHolding = data && data.length > 0 ? mapRowToHolding(data[0]) : newHolding;
      onUpdateState((prev) => ({
        ...prev,
        holdings: [insertedHolding, ...prev.holdings.filter((h) => h.id !== insertedHolding.id)],
      }));

      // Reset form and close modal
      setNewSymbol('');
      setNewName('');
      setNewShares('');
      setNewAvgCost('');
      setNewCurrentPrice('');
      setNewAnnualDiv('');
      setNewExDate('');
      setNewPayDate('');
      setQuoteFetchSuccess(null);
      setQuoteFetchError(null);
      setFetchedYield(null);
      setShowAddHoldingModal(false);
    } catch (err: any) {
      console.error('[Supabase] Exception inserting holding:', err);
      setAddHoldingError(err?.message || 'An unexpected error occurred while saving the holding.');
    } finally {
      setIsSubmittingHolding(false);
    }
  };

  const handleDeleteHolding = async (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      holdings: prev.holdings.filter((h) => h.id !== id),
    }));

    try {
      const { error } = await supabase.from('holdings').delete().eq('id', id);
      if (error) {
        console.warn('[Supabase] Error deleting holding from Supabase:', error.message);
      }
    } catch (err) {
      console.error('[Supabase] Exception deleting holding:', err);
    }
  };

  const handleToggleDRIP = async (id: string) => {
    const target = state.holdings.find((h) => h.id === id);
    if (!target) return;
    const nextDrip = !target.dripEnabled;

    onUpdateState((prev) => ({
      ...prev,
      holdings: prev.holdings.map((h) => (h.id === id ? { ...h, dripEnabled: nextDrip } : h)),
    }));

    try {
      const { error } = await supabase
        .from('holdings')
        .update({ drip_enabled: nextDrip, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.warn('[Supabase] Error updating DRIP in Supabase:', error.message);
      }
    } catch (err) {
      console.error('[Supabase] Exception updating DRIP:', err);
    }
  };

  // Direct Supabase Update for Holding
  const handleSaveEditedHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHolding || isUpdatingHolding) return;
    setIsUpdatingHolding(true);

    try {
      const dbRow = mapHoldingToRow(editingHolding);
      const { error } = await supabase
        .from('holdings')
        .update(dbRow)
        .eq('id', editingHolding.id);

      if (error) {
        console.warn('[Supabase] Error updating holding:', error.message);
      }

      onUpdateState((prev) => ({
        ...prev,
        holdings: prev.holdings.map((h) => (h.id === editingHolding.id ? editingHolding : h)),
      }));

      setEditingHolding(null);
    } catch (err) {
      console.error('[Supabase] Exception updating holding:', err);
    } finally {
      setIsUpdatingHolding(false);
    }
  };

  // Sort upcoming payouts by month
  const upcomingSchedules = [...state.holdings]
    .sort((a, b) => a.nextExDividendDate.localeCompare(b.nextExDividendDate))
    .slice(0, 5);

  return (
    <div className="space-y-8 pb-16">
      {/* Portfolio Dividend KPI Master Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 2xl:gap-6">
        {/* Total Market Value */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 2xl:p-6 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs 2xl:text-sm text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] 2xl:text-xs">Portfolio Market Value</span>
            <span className="text-[11px] 2xl:text-xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              +{formatPercent(metrics.totalGainPercent, 1)} Gain
            </span>
          </div>
          <div className="text-2xl 2xl:text-3xl font-black font-mono text-white mt-1">
            {formatCurrency(metrics.totalMarketValueCAD)}
          </div>
          <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex justify-between">
            <span>Cost Basis: {formatCurrency(metrics.totalCostBasisCAD)}</span>
            <span className="font-semibold text-emerald-400">
              +{formatCurrency(metrics.totalGainCAD)}
            </span>
          </div>
        </div>

        {/* Projected Annual Dividend Income (PADI) */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 2xl:p-6 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs 2xl:text-sm text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] 2xl:text-xs">Projected Annual Income</span>
            <span className="text-violet-300 font-bold bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 rounded-full text-[10px] 2xl:text-xs">
              PADI (CAD)
            </span>
          </div>
          <div className="text-2xl 2xl:text-3xl font-black font-mono text-violet-400 mt-1">
            {formatCurrency(metrics.totalPadiCAD)}
            <span className="text-xs 2xl:text-sm font-normal text-slate-400">/yr</span>
          </div>
          <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex justify-between">
            <span>Monthly Run-Rate:</span>
            <span className="font-bold text-white font-mono">
              ~{formatCurrency(metrics.averageMonthlyPayoutCAD)}/mo
            </span>
          </div>
        </div>

        {/* Portfolio Yield vs Yield on Cost (YOC) */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 2xl:p-6 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs 2xl:text-sm text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] 2xl:text-xs">Yield on Cost (YOC)</span>
            <span className="text-sky-300 font-bold bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px] 2xl:text-xs">
              Compound Yield
            </span>
          </div>
          <div className="text-2xl 2xl:text-3xl font-black font-mono text-sky-400 mt-1">
            {formatPercent(metrics.yieldOnCostPercent, 2)}
          </div>
          <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex justify-between">
            <span>Current Market Yield:</span>
            <span className="font-semibold font-mono text-slate-200">
              {formatPercent(metrics.portfolioYieldPercent, 2)}
            </span>
          </div>
        </div>

        {/* DRIP Reinvestment Snowball */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 2xl:p-6 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs 2xl:text-sm text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] 2xl:text-xs">DRIP Snowball Status</span>
            <span className="text-emerald-300 font-bold bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] 2xl:text-xs">
              Active
            </span>
          </div>
          <div className="text-2xl 2xl:text-3xl font-black font-mono text-emerald-400 mt-1">
            {formatCurrency(metrics.totalPadiCAD)}
          </div>
          <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex justify-between">
            <span>Annual Free Reinvestment:</span>
            <span className="font-bold text-emerald-400">100% Compounding</span>
          </div>
        </div>
      </div>

      {/* 12-Month Dividend Payout Calendar & Ex-Dividend Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 2xl:gap-8">
        {/* Interactive 12-Month Bar Visualizer */}
        <div className="lg:col-span-8 bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base 2xl:text-xl font-bold text-white">
                12-Month Dividend Payout Calendar
              </h3>
              <p className="text-xs 2xl:text-sm text-slate-400">
                Monthly projected cash flow distributions from Canadian &amp; US equity holdings
              </p>
            </div>
            <div className="text-xs 2xl:text-sm text-right font-mono font-bold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 2xl:px-3.5 2xl:py-1.5 rounded-xl">
              Current Month: Sep 2026
            </div>
          </div>

          <div className="my-auto py-2">
            <MonthlyDividendBarChart payouts={metrics.monthlyPayoutsCAD} currentMonthIndex={8} />
          </div>

          <div className="grid grid-cols-3 gap-2 2xl:gap-4 pt-4 border-t border-white/10 text-center text-xs 2xl:text-sm">
            <div className="p-2.5 2xl:p-3.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] 2xl:text-xs text-slate-400">Lowest Month</span>
              <div className="font-mono font-bold text-slate-200 text-xs 2xl:text-base">
                {formatCurrency(Math.min(...metrics.monthlyPayoutsCAD.filter((x) => x > 0)))}
              </div>
            </div>
            <div className="p-2.5 2xl:p-3.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] 2xl:text-xs text-slate-400">Average Month</span>
              <div className="font-mono font-bold text-slate-200 text-xs 2xl:text-base">
                {formatCurrency(metrics.averageMonthlyPayoutCAD)}
              </div>
            </div>
            <div className="p-2.5 2xl:p-3.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] 2xl:text-xs text-slate-400">Peak Month</span>
              <div className="font-mono font-bold text-emerald-400 text-xs 2xl:text-base">
                {formatCurrency(Math.max(...metrics.monthlyPayoutsCAD))}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Ex-Dividend Schedule & Account Allocation */}
        <div className="lg:col-span-4 bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Calendar className="w-4 h-4 2xl:w-5 2xl:h-5 text-violet-400" />
              <h3 className="text-sm 2xl:text-base font-bold text-white">
                Upcoming Ex-Dividend Dates
              </h3>
            </div>
            <p className="text-[11px] 2xl:text-xs text-slate-400 mb-3">
              Must own shares before ex-date to capture upcoming dividend payment.
            </p>

            <div className="space-y-2.5 2xl:space-y-3">
              {upcomingSchedules.map((item) => {
                const isUsd = item.currency === 'USD';
                const rate = isUsd ? USD_TO_CAD_RATE : 1;
                const estPayout = (item.shares * (item.annualDividendPerShare / (item.payoutMonths.length || 4))) * rate;

                return (
                  <div
                    key={item.id}
                    className="p-2.5 2xl:p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between text-xs 2xl:text-sm"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-white">
                        <span>{item.symbol}</span>
                        <span className="text-[10px] 2xl:text-xs text-slate-400 font-normal truncate max-w-[90px] 2xl:max-w-[140px]">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-[10px] 2xl:text-xs text-slate-400 mt-0.5">
                        Ex-Date: <strong className="text-slate-300 font-mono">{item.nextExDividendDate}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        +{formatCurrency(estPayout)}
                      </div>
                      <div className="text-[10px] 2xl:text-xs text-slate-400">
                        Pay: {item.nextPayDate}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Account & Family Member Breakdown Summary */}
          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] space-y-2">
            <div>
              <div className="font-bold text-slate-300 mb-1">
                Registered vs Taxable Split:
              </div>
              {Object.entries(metrics.accountBreakdown || {}).map(([acc, data]) => (
                <div key={acc} className="flex justify-between text-slate-400">
                  <span>{acc}:</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {formatCurrency(data.valueCAD)} ({formatCurrency(data.padiCAD)}/yr)
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="font-bold text-slate-300 mb-1">
                Family Member Portfolio Split:
              </div>
              <div className="space-y-1">
                {metrics.ownerBreakdown?.bunny && metrics.ownerBreakdown.bunny.valueCAD > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span className="text-rose-300 font-medium">🐰 Bunny:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {formatCurrency(metrics.ownerBreakdown.bunny.valueCAD)} ({formatCurrency(metrics.ownerBreakdown.bunny.padiCAD)}/yr)
                    </span>
                  </div>
                )}
                {metrics.ownerBreakdown?.monkey && metrics.ownerBreakdown.monkey.valueCAD > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span className="text-teal-300 font-medium">🐵 Monkey:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {formatCurrency(metrics.ownerBreakdown.monkey.valueCAD)} ({formatCurrency(metrics.ownerBreakdown.monkey.padiCAD)}/yr)
                    </span>
                  </div>
                )}
                {metrics.ownerBreakdown?.piggy && metrics.ownerBreakdown.piggy.valueCAD > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span className="text-amber-300 font-medium">🐷 Piggy:</span>
                    <span className="font-mono font-semibold text-amber-200">
                      {formatCurrency(metrics.ownerBreakdown.piggy.valueCAD)} ({formatCurrency(metrics.ownerBreakdown.piggy.padiCAD)}/yr)
                    </span>
                  </div>
                )}
                {metrics.ownerBreakdown?.joint && metrics.ownerBreakdown.joint.valueCAD > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span className="text-indigo-300 font-medium">🤝 Joint:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {formatCurrency(metrics.ownerBreakdown.joint.valueCAD)} ({formatCurrency(metrics.ownerBreakdown.joint.padiCAD)}/yr)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dividend Reinvestment Plan (DRIP) Compound Accumulation Simulator */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2.5 2xl:p-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Zap className="w-5 h-5 2xl:w-6 2xl:h-6" />
              </span>
              <div>
                <h3 className="text-base 2xl:text-xl font-bold text-white">
                  DRIP Compound Accumulation Simulator
                </h3>
                <p className="text-xs 2xl:text-sm text-slate-400">
                  Model long-term dividend snowball growth with automatic reinvestment &amp; monthly contributions
                </p>
              </div>
            </div>
          </div>

          {/* Simulator Outcomes Callout */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs 2xl:text-sm">
            <div className="p-3 2xl:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] 2xl:text-xs text-emerald-300 uppercase font-semibold">
                Projected Portfolio (Yr {horizonYears})
              </span>
              <div className="text-base 2xl:text-xl font-black font-mono text-emerald-300">
                {formatCurrency(simulation.finalYear.portfolioValueWithDRIP)}
              </div>
            </div>

            <div className="p-3 2xl:p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <span className="text-[10px] 2xl:text-xs text-violet-300 uppercase font-semibold">
                Passive Dividend Cash Flow
              </span>
              <div className="text-base 2xl:text-xl font-black font-mono text-violet-300">
                {formatCurrency(simulation.finalYear.annualDividendIncomeWithDRIP)}/yr
              </div>
            </div>

            <div className="p-3 2xl:p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <span className="text-[10px] 2xl:text-xs text-sky-300 uppercase font-semibold">
                DRIP Compounding Advantage
              </span>
              <div className="text-base 2xl:text-xl font-black font-mono text-sky-300">
                +{formatCurrency(simulation.dripAdvantageValue)}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Controls Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 2xl:gap-6 p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 mb-6 text-xs 2xl:text-sm backdrop-blur-sm">
          {/* Horizon */}
          <div>
            <div className="flex justify-between font-medium mb-1 text-slate-300">
              <span>Time Horizon:</span>
              <span className="font-bold text-white font-mono">
                {horizonYears} Years
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={horizonYears}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setHorizonYears(val);
                handleUpdateDripSetting('investmentHorizonYears', val);
              }}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Monthly Contribution */}
          <div>
            <div className="flex justify-between font-medium mb-1 text-slate-300">
              <span>Monthly Addition:</span>
              <span className="font-bold text-white font-mono">
                {formatCurrency(monthlyContribution)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={monthlyContribution}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setMonthlyContribution(val);
                handleUpdateDripSetting('monthlyContribution', val);
              }}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Dividend Growth Rate (DGR) */}
          <div>
            <div className="flex justify-between font-medium mb-1 text-slate-300">
              <span>Dividend Growth (DGR):</span>
              <span className="font-bold text-white font-mono">
                {dgrRate}%/yr
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={dgrRate}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDgrRate(val);
                handleUpdateDripSetting('expectedDgr', val);
              }}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Capital Appreciation */}
          <div>
            <div className="flex justify-between font-medium mb-1 text-slate-300">
              <span>Stock Price Growth:</span>
              <span className="font-bold text-white font-mono">
                {capRate}%/yr
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={capRate}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setCapRate(val);
                handleUpdateDripSetting('capitalGrowthRate', val);
              }}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* DRIP Toggle */}
          <div className="flex flex-col justify-center">
            <span className="font-medium text-slate-300 mb-1.5">
              Reinvest Dividends (DRIP)
            </span>
            <button
              onClick={() => {
                const next = !reinvest;
                setReinvest(next);
                handleUpdateDripSetting('reinvestDividends', next);
              }}
              className={`py-1.5 2xl:py-2 px-3 rounded-xl font-bold text-xs 2xl:text-sm transition-all flex items-center justify-center space-x-1.5 border ${
                reinvest
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/50 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-slate-800 text-slate-300 border-white/10'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reinvest ? 'animate-spin' : ''}`} />
              <span>{reinvest ? 'DRIP Active (Reinvest)' : 'Cash Payout (No DRIP)'}</span>
            </button>
          </div>
        </div>

        {/* Growth Area Chart */}
        <div className="pt-2">
          <DRIPGrowthAreaChart timeline={simulation.timeline} />
        </div>
      </div>

      {/* Holdings Management Ledger */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base 2xl:text-xl font-bold text-white">
              Equity &amp; Dividend Holdings
            </h3>
            <p className="text-xs 2xl:text-sm text-slate-400">
              Cross-border positions tracked across TFSA, RRSP, Non-Registered, and RESP accounts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Supabase Sync Button */}
            <button
              onClick={handleRefreshHoldings}
              disabled={isLoadingHoldings}
              title="Refresh holdings directly from Supabase database"
              className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 px-3 py-1.5 2xl:px-3.5 2xl:py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHoldings ? 'animate-spin text-violet-400' : ''}`} />
              <span>{isLoadingHoldings ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Account Filter */}
            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="text-xs 2xl:text-sm font-semibold px-2.5 py-1.5 2xl:px-3 2xl:py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-200 focus:outline-hidden"
            >
              <option value="all">All Accounts</option>
              <option value="TFSA">TFSA</option>
              <option value="RRSP">RRSP</option>
              <option value="Non-Registered">Non-Registered</option>
              <option value="RESP">RESP</option>
            </select>

            {/* Owner Filter */}
            <select
              value={selectedOwnerFilter}
              onChange={(e) => setSelectedOwnerFilter(e.target.value)}
              className="text-xs 2xl:text-sm font-semibold px-2.5 py-1.5 2xl:px-3 2xl:py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-200 focus:outline-hidden"
            >
              <option value="all">All Owners</option>
              <option value="bunny">🐰 Bunny</option>
              <option value="monkey">🐵 Monkey</option>
              <option value="piggy">🐷 Piggy</option>
              <option value="joint">🤝 Joint</option>
            </select>

            <button
              onClick={() => {
                setAddHoldingError(null);
                setShowAddHoldingModal(true);
              }}
              className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-violet-600 hover:bg-violet-500 border border-violet-400/50 text-white px-3.5 py-1.5 2xl:px-4 2xl:py-2 rounded-xl transition-all shadow-lg shadow-violet-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Ticker / Holding</span>
            </button>
          </div>
        </div>

        {/* Holdings Error Alert if Supabase query failed */}
        {holdingsError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span><strong>Supabase Sync Error:</strong> {holdingsError}</span>
            </div>
            <button
              onClick={handleRefreshHoldings}
              className="underline hover:text-white font-medium ml-3"
            >
              Retry
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs 2xl:text-sm">
            <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px] 2xl:text-xs">
              <tr>
                <th className="py-3 px-4 2xl:py-4 2xl:px-5">Symbol &amp; Name</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4">Account</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4">Owner</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right">Shares</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right">Current Price</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right">Market Value (CAD)</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right">Div/Share</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right text-violet-400">
                  Annual Income
                </th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-right">Yield (YOC)</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-center">DRIP</th>
                <th className="py-3 px-3 2xl:py-4 2xl:px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredHoldings.map((h) => {
                const fx = h.currency === 'USD' ? USD_TO_CAD_RATE : 1.0;
                const marketValCAD = h.shares * h.currentPrice * fx;
                const costBasisCAD = h.shares * h.avgCostPerShare * fx;
                const annualIncomeCAD = h.shares * h.annualDividendPerShare * fx;
                const currentYield =
                  h.currentPrice > 0 ? (h.annualDividendPerShare / h.currentPrice) * 100 : 0;
                const yoc =
                  h.avgCostPerShare > 0 ? (h.annualDividendPerShare / h.avgCostPerShare) * 100 : 0;

                return (
                  <tr
                    key={h.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4 2xl:py-4 2xl:px-5">
                      <div className="flex items-center space-x-1.5 font-bold text-white">
                        <span>{h.symbol}</span>
                        <span className="text-[10px] 2xl:text-xs font-mono text-slate-400 bg-white/10 px-1.5 py-0.5 rounded-md border border-white/10">
                          {h.currency}
                        </span>
                      </div>
                      <div className="text-[11px] 2xl:text-xs text-slate-400 truncate max-w-xs">{h.name}</div>
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] 2xl:text-xs font-bold ${
                          ACCOUNT_COLORS[h.accountType]
                        }`}
                      >
                        {h.accountType}
                      </span>
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 font-semibold text-slate-300 whitespace-nowrap">
                      {h.owner === 'bunny' && (
                        <span className="inline-flex items-center gap-1 text-rose-300">🐰 Bunny</span>
                      )}
                      {h.owner === 'monkey' && (
                        <span className="inline-flex items-center gap-1 text-teal-300">🐵 Monkey</span>
                      )}
                      {h.owner === 'piggy' && (
                        <span className="inline-flex items-center gap-1 text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          🐷 Piggy
                        </span>
                      )}
                      {h.owner === 'joint' && (
                        <span className="inline-flex items-center gap-1 text-indigo-300">🤝 Joint</span>
                      )}
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono font-medium text-slate-200">{h.shares}</td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono text-slate-400">
                      {h.currency === 'USD' ? '$' : 'CA$'}
                      {h.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono font-bold text-white">
                      {formatCurrency(marketValCAD)}
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono text-slate-400">
                      {h.currency === 'USD' ? '$' : 'CA$'}
                      {h.annualDividendPerShare.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono font-bold text-violet-400">
                      {formatCurrency(annualIncomeCAD)}
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono">
                      <div className="font-semibold text-slate-200">
                        {formatPercent(currentYield, 2)}
                      </div>
                      <div className="text-[10px] 2xl:text-xs text-sky-400">
                        YOC {formatPercent(yoc, 2)}
                      </div>
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-center">
                      <button
                        onClick={() => handleToggleDRIP(h.id)}
                        className={`text-[10px] 2xl:text-xs px-2.5 py-0.5 rounded-full font-bold transition-all border ${
                          h.dripEnabled
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 border-white/10'
                        }`}
                      >
                        {h.dripEnabled ? 'DRIP ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingHolding(h)}
                          className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-lg transition-all"
                          title="Edit holding"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteHolding(h.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                          title="Delete holding"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-white/5 font-bold border-t border-white/10">
              <tr>
                <td colSpan={5} className="py-3 px-4 2xl:py-4 2xl:px-5 text-slate-300">
                  Total Active Dividend Portfolio
                </td>
                <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono text-white">
                  {formatCurrency(metrics.totalMarketValueCAD)}
                </td>
                <td></td>
                <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono text-violet-400">
                  {formatCurrency(metrics.totalPadiCAD)}
                </td>
                <td className="py-3 px-3 2xl:py-4 2xl:px-4 text-right font-mono text-sky-400">
                  Avg YOC {formatPercent(metrics.yieldOnCostPercent, 2)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* --- ADD HOLDING MODAL WITH REAL-TIME TICKER & DIVIDEND AUTO-LOOKUP --- */}
      {showAddHoldingModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-xl 2xl:max-w-2xl w-full p-6 2xl:p-8 border border-white/15 shadow-2xl shadow-black/60 text-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <h3 className="text-base 2xl:text-xl font-bold text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    <Plus className="w-4 h-4 2xl:w-5 2xl:h-5" />
                  </span>
                  Add Ticker / Holding
                </h3>
                <p className="text-xs 2xl:text-sm text-slate-400 mt-0.5">
                  Fetch live market prices and dividend distributions across US and Canadian TSX equities
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddHoldingModal(false);
                  setQuoteFetchError(null);
                  setQuoteFetchSuccess(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <span className="text-[11px] 2xl:text-xs text-slate-400 font-medium block mb-1.5">
                Quick Preset Tickers:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TICKERS.map((t) => (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => handleFetchQuote(t.symbol)}
                    className="text-[11px] 2xl:text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-600/30 hover:border-violet-500/50 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center gap-1"
                  >
                    <span>{t.flag}</span>
                    <span className="font-bold">{t.symbol}</span>
                    <span className="text-slate-400 text-[10px]">({t.label.split(' ')[0]})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Lookup Bar */}
            <div className="p-3.5 2xl:p-4 rounded-xl bg-white/5 border border-white/10 mb-4 space-y-2">
              <label className="block text-xs 2xl:text-sm font-semibold text-slate-200">
                Ticker Symbol &amp; Automated Market Lookup
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Enter ticker (e.g. VDY.TO, SCHD, ENB.TO, AAPL)"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFetchQuote();
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-sm 2xl:text-base uppercase font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-violet-400"
                  />
                </div>
                <button
                  type="button"
                  disabled={isFetchingQuote || !newSymbol.trim()}
                  onClick={() => handleFetchQuote()}
                  className="px-3.5 py-2 2xl:py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs 2xl:text-sm border border-violet-400/50 shadow-md shadow-violet-600/20 transition-all flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isFetchingQuote ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-violet-200" />
                      <span>Auto-Lookup</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status & Error Feedback */}
              {isFetchingQuote && (
                <div className="text-xs 2xl:text-sm text-violet-300 flex items-center gap-2 pt-1 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting to financial markets provider &amp; extracting dividend calendar...</span>
                </div>
              )}

              {quoteFetchSuccess && !isFetchingQuote && (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs 2xl:text-sm flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{quoteFetchSuccess}</span>
                  </div>
                </div>
              )}

              {quoteFetchError && !isFetchingQuote && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs 2xl:text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span>{quoteFetchError}</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAddHolding} className="space-y-4 text-xs 2xl:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Company / Fund Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Vanguard FTSE Canadian High Dividend"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white placeholder-slate-500 focus:outline-hidden focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Sector / Theme
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Canadian Financials or Clean Energy"
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white placeholder-slate-500 focus:outline-hidden focus:border-violet-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Account Type
                  </label>
                  <select
                    value={newAccount}
                    onChange={(e) => setNewAccount(e.target.value as AccountType)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden font-medium"
                  >
                    <option value="TFSA">TFSA</option>
                    <option value="RRSP">RRSP</option>
                    <option value="Non-Registered">Non-Registered</option>
                    <option value="RESP">RESP</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Owner (Account Holder)
                  </label>
                  <select
                    value={newOwner}
                    onChange={(e) => {
                      const val = e.target.value as HoldingOwner;
                      setNewOwner(val);
                      if (val === 'piggy') setNewAccount('RESP');
                    }}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden font-medium"
                  >
                    <option value="bunny">🐰 Bunny</option>
                    <option value="monkey">🐵 Monkey</option>
                    <option value="piggy">🐷 Piggy</option>
                    <option value="joint">🤝 Joint</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value as 'CAD' | 'USD')}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden font-medium"
                  >
                    <option value="CAD">CAD ($)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Shares Owned *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="100"
                    value={newShares}
                    onChange={(e) => setNewShares(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 font-mono text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Current Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="45.00"
                    value={newCurrentPrice}
                    onChange={(e) => setNewCurrentPrice(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 font-mono text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Avg Cost / Share
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="42.50"
                    value={newAvgCost}
                    onChange={(e) => setNewAvgCost(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 font-mono text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Annual Div / Share
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="2.15"
                    value={newAnnualDiv}
                    onChange={(e) => setNewAnnualDiv(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 font-mono text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Frequency
                  </label>
                  <select
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value as PayoutFrequency)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Semi-Annual">Semi-Annual</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    DRIP Enrollment
                  </label>
                  <select
                    value={newDripEnabled ? 'yes' : 'no'}
                    onChange={(e) => setNewDripEnabled(e.target.value === 'yes')}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden"
                  >
                    <option value="yes">Reinvest (DRIP)</option>
                    <option value="no">Cash Payout</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Next Ex-Dividend Date
                  </label>
                  <input
                    type="date"
                    value={newExDate}
                    onChange={(e) => setNewExDate(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white placeholder-slate-500 focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Estimated Pay Date
                  </label>
                  <input
                    type="date"
                    value={newPayDate}
                    onChange={(e) => setNewPayDate(e.target.value)}
                    className="w-full px-3 py-2 2xl:py-2.5 rounded-xl border border-white/15 bg-slate-950/80 text-white placeholder-slate-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Calculated Summary Preview Pill */}
              {parseFloat(newShares) > 0 && parseFloat(newCurrentPrice) > 0 && (
                <div className="p-3 rounded-xl bg-violet-950/40 border border-violet-500/20 text-xs 2xl:text-sm flex flex-wrap items-center justify-between gap-2">
                  <div className="text-slate-300">
                    Position Value:{' '}
                    <strong className="text-white font-mono">
                      {newCurrency === 'USD' ? '$' : 'CA$'}
                      {(parseFloat(newShares) * parseFloat(newCurrentPrice)).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                  <div className="text-slate-300">
                    Est. Annual Income:{' '}
                    <strong className="text-emerald-400 font-mono">
                      {newCurrency === 'USD' ? '$' : 'CA$'}
                      {(
                        parseFloat(newShares) * (parseFloat(newAnnualDiv) || 0)
                      ).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      /yr
                    </strong>
                  </div>
                  {parseFloat(newCurrentPrice) > 0 && (
                    <div className="text-slate-300">
                      Calculated Yield:{' '}
                      <strong className="text-sky-400 font-mono">
                        {(( (parseFloat(newAnnualDiv) || 0) / parseFloat(newCurrentPrice) ) * 100).toFixed(2)}%
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Add Holding Error Alert */}
              {addHoldingError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold">Persistence Failed</div>
                    <div>{addHoldingError}</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  disabled={isSubmittingHolding}
                  onClick={() => setShowAddHoldingModal(false)}
                  className="px-4 py-2 2xl:py-2.5 rounded-xl text-slate-400 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHolding}
                  className="px-5 py-2 2xl:py-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed font-semibold border border-violet-400/50 shadow-lg shadow-violet-600/20 transition-all flex items-center gap-1.5"
                >
                  {isSubmittingHolding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Position</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT HOLDING MODAL (Direct Supabase Update) --- */}
      {editingHolding && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-xl 2xl:max-w-2xl w-full p-6 2xl:p-8 border border-white/15 shadow-2xl shadow-black/60 text-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <h3 className="text-base 2xl:text-xl font-bold text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    <Edit2 className="w-4 h-4 2xl:w-5 2xl:h-5" />
                  </span>
                  Edit Position: {editingHolding.symbol}
                </h3>
                <p className="text-xs 2xl:text-sm text-slate-400 mt-0.5">
                  Update shares, cost basis, price, or dividend distribution directly in Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingHolding(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedHolding} className="space-y-4 text-xs 2xl:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company / ETF Name</label>
                  <input
                    type="text"
                    required
                    value={editingHolding.name}
                    onChange={(e) => setEditingHolding({ ...editingHolding, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Account</label>
                  <select
                    value={editingHolding.account}
                    onChange={(e) => setEditingHolding({ ...editingHolding, account: e.target.value as AccountType })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden"
                  >
                    <option value="TFSA">TFSA (Tax-Free)</option>
                    <option value="RRSP">RRSP (Tax-Deferred)</option>
                    <option value="Non-Registered">Non-Registered (Taxable)</option>
                    <option value="RESP">RESP (Education)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Shares Count</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingHolding.shares}
                    onChange={(e) => setEditingHolding({ ...editingHolding, shares: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white font-mono focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Avg Cost Basis</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingHolding.averageCostBasis}
                    onChange={(e) => setEditingHolding({ ...editingHolding, averageCostBasis: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white font-mono focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Current Price</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingHolding.currentPrice}
                    onChange={(e) => setEditingHolding({ ...editingHolding, currentPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Annual Dividend / Share</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingHolding.annualDividendPerShare}
                    onChange={(e) => setEditingHolding({ ...editingHolding, annualDividendPerShare: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white font-mono focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payout Frequency</label>
                  <select
                    value={editingHolding.payoutFrequency}
                    onChange={(e) => setEditingHolding({ ...editingHolding, payoutFrequency: e.target.value as PayoutFrequency })}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-white focus:outline-hidden"
                  >
                    <option value="Monthly">Monthly (12x/yr)</option>
                    <option value="Quarterly">Quarterly (4x/yr)</option>
                    <option value="Semi-Annual">Semi-Annual (2x/yr)</option>
                    <option value="Annual">Annual (1x/yr)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingHolding(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingHolding}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 font-semibold border border-indigo-400/50 shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                >
                  {isUpdatingHolding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating Supabase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Changes</span>
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
