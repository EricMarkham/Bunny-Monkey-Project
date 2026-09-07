import React, { useState } from 'react';
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

  // DRIP Simulator settings state
  const [horizonYears, setHorizonYears] = useState(state.dripSettings.investmentHorizonYears);
  const [monthlyContribution, setMonthlyContribution] = useState(state.dripSettings.monthlyContribution);
  const [dgrRate, setDgrRate] = useState(state.dripSettings.expectedDgr);
  const [capRate, setCapRate] = useState(state.dripSettings.capitalGrowthRate);
  const [reinvest, setReinvest] = useState(state.dripSettings.reinvestDividends);

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

  // Handle Add Holding
  const handleAddHolding = (e: React.FormEvent) => {
    e.preventDefault();
    const shares = parseFloat(newShares);
    const avgCost = parseFloat(newAvgCost);
    const price = parseFloat(newCurrentPrice);
    const divPerShare = parseFloat(newAnnualDiv) || 0;

    if (!newSymbol.trim() || isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) return;

    // Default payout months
    let payoutMonths = [3, 6, 9, 12];
    if (newFreq === 'Monthly') payoutMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    else if (newFreq === 'Semi-Annual') payoutMonths = [6, 12];
    else if (newFreq === 'Annual') payoutMonths = [12];

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
      nextExDividendDate: new Date().toISOString().split('T')[0],
      nextPayDate: new Date().toISOString().split('T')[0],
      sector: newSector,
      dripEnabled: newDripEnabled,
    };

    onUpdateState((prev) => ({
      ...prev,
      holdings: [newHolding, ...prev.holdings],
    }));

    setNewSymbol('');
    setNewName('');
    setNewShares('');
    setNewAvgCost('');
    setNewCurrentPrice('');
    setNewAnnualDiv('');
    setShowAddHoldingModal(false);
  };

  const handleDeleteHolding = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      holdings: prev.holdings.filter((h) => h.id !== id),
    }));
  };

  const handleToggleDRIP = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      holdings: prev.holdings.map((h) => (h.id === id ? { ...h, dripEnabled: !h.dripEnabled } : h)),
    }));
  };

  // Sort upcoming payouts by month
  const upcomingSchedules = [...state.holdings]
    .sort((a, b) => a.nextExDividendDate.localeCompare(b.nextExDividendDate))
    .slice(0, 5);

  return (
    <div className="space-y-8 pb-16">
      {/* Portfolio Dividend KPI Master Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Market Value */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Portfolio Market Value</span>
            <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              +{formatPercent(metrics.totalGainPercent, 1)} Gain
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {formatCurrency(metrics.totalMarketValueCAD)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>Cost Basis: {formatCurrency(metrics.totalCostBasisCAD)}</span>
            <span className="font-semibold text-emerald-400">
              +{formatCurrency(metrics.totalGainCAD)}
            </span>
          </div>
        </div>

        {/* Projected Annual Dividend Income (PADI) */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Projected Annual Income</span>
            <span className="text-violet-300 font-bold bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 rounded-full text-[10px]">
              PADI (CAD)
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-violet-400 mt-1">
            {formatCurrency(metrics.totalPadiCAD)}
            <span className="text-xs font-normal text-slate-400">/yr</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>Monthly Run-Rate:</span>
            <span className="font-bold text-white font-mono">
              ~{formatCurrency(metrics.averageMonthlyPayoutCAD)}/mo
            </span>
          </div>
        </div>

        {/* Portfolio Yield vs Yield on Cost (YOC) */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Yield on Cost (YOC)</span>
            <span className="text-sky-300 font-bold bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px]">
              Compound Yield
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-sky-400 mt-1">
            {formatPercent(metrics.yieldOnCostPercent, 2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>Current Market Yield:</span>
            <span className="font-semibold font-mono text-slate-200">
              {formatPercent(metrics.portfolioYieldPercent, 2)}
            </span>
          </div>
        </div>

        {/* DRIP Reinvestment Snowball */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">DRIP Snowball Status</span>
            <span className="text-emerald-300 font-bold bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px]">
              Active
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
            {formatCurrency(metrics.totalPadiCAD)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>Annual Free Reinvestment:</span>
            <span className="font-bold text-emerald-400">100% Compounding</span>
          </div>
        </div>
      </div>

      {/* 12-Month Dividend Payout Calendar & Ex-Dividend Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive 12-Month Bar Visualizer */}
        <div className="lg:col-span-8 bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">
                12-Month Dividend Payout Calendar
              </h3>
              <p className="text-xs text-slate-400">
                Monthly projected cash flow distributions from Canadian &amp; US equity holdings
              </p>
            </div>
            <div className="text-xs text-right font-mono font-bold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-xl">
              Current Month: Sep 2026
            </div>
          </div>

          <div className="my-auto py-2">
            <MonthlyDividendBarChart payouts={metrics.monthlyPayoutsCAD} currentMonthIndex={8} />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-slate-400">Lowest Month</span>
              <div className="font-mono font-bold text-slate-200">
                {formatCurrency(Math.min(...metrics.monthlyPayoutsCAD.filter((x) => x > 0)))}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-slate-400">Average Month</span>
              <div className="font-mono font-bold text-slate-200">
                {formatCurrency(metrics.averageMonthlyPayoutCAD)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-slate-400">Peak Month</span>
              <div className="font-mono font-bold text-emerald-400">
                {formatCurrency(Math.max(...metrics.monthlyPayoutsCAD))}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Ex-Dividend Schedule & Account Allocation */}
        <div className="lg:col-span-4 bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Calendar className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-white">
                Upcoming Ex-Dividend Dates
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Must own shares before ex-date to capture upcoming dividend payment.
            </p>

            <div className="space-y-2.5">
              {upcomingSchedules.map((item) => {
                const isUsd = item.currency === 'USD';
                const rate = isUsd ? USD_TO_CAD_RATE : 1;
                const estPayout = (item.shares * (item.annualDividendPerShare / (item.payoutMonths.length || 4))) * rate;

                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-white">
                        <span>{item.symbol}</span>
                        <span className="text-[10px] text-slate-400 font-normal truncate max-w-[90px]">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Ex-Date: <strong className="text-slate-300 font-mono">{item.nextExDividendDate}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        +{formatCurrency(estPayout)}
                      </div>
                      <div className="text-[10px] text-slate-400">
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
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Zap className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  DRIP Compound Accumulation Simulator
                </h3>
                <p className="text-xs text-slate-400">
                  Model long-term dividend snowball growth with automatic reinvestment &amp; monthly contributions
                </p>
              </div>
            </div>
          </div>

          {/* Simulator Outcomes Callout */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-300 uppercase font-semibold">
                Projected Portfolio (Yr {horizonYears})
              </span>
              <div className="text-base font-black font-mono text-emerald-300">
                {formatCurrency(simulation.finalYear.portfolioValueWithDRIP)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <span className="text-[10px] text-violet-300 uppercase font-semibold">
                Passive Dividend Cash Flow
              </span>
              <div className="text-base font-black font-mono text-violet-300">
                {formatCurrency(simulation.finalYear.annualDividendIncomeWithDRIP)}/yr
              </div>
            </div>

            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <span className="text-[10px] text-sky-300 uppercase font-semibold">
                DRIP Compounding Advantage
              </span>
              <div className="text-base font-black font-mono text-sky-300">
                +{formatCurrency(simulation.dripAdvantageValue)}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Controls Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-xl bg-white/5 border border-white/10 mb-6 text-xs backdrop-blur-sm">
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
              onChange={(e) => setHorizonYears(parseInt(e.target.value))}
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
              onChange={(e) => setMonthlyContribution(parseInt(e.target.value))}
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
              onChange={(e) => setDgrRate(parseFloat(e.target.value))}
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
              onChange={(e) => setCapRate(parseFloat(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* DRIP Toggle */}
          <div className="flex flex-col justify-center">
            <span className="font-medium text-slate-300 mb-1.5">
              Reinvest Dividends (DRIP)
            </span>
            <button
              onClick={() => setReinvest(!reinvest)}
              className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 border ${
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
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-white">
              Equity &amp; Dividend Holdings
            </h3>
            <p className="text-xs text-slate-400">
              Cross-border positions tracked across TFSA, RRSP, Non-Registered, and RESP accounts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Account Filter */}
            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/15 bg-slate-900 text-slate-200 focus:outline-hidden"
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
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/15 bg-slate-900 text-slate-200 focus:outline-hidden"
            >
              <option value="all">All Owners</option>
              <option value="bunny">🐰 Bunny</option>
              <option value="monkey">🐵 Monkey</option>
              <option value="piggy">🐷 Piggy</option>
              <option value="joint">🤝 Joint</option>
            </select>

            <button
              onClick={() => setShowAddHoldingModal(true)}
              className="flex items-center space-x-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 border border-violet-400/50 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-lg shadow-violet-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Ticker / Holding</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px]">
              <tr>
                <th className="py-3 px-4">Symbol &amp; Name</th>
                <th className="py-3 px-3">Account</th>
                <th className="py-3 px-3">Owner</th>
                <th className="py-3 px-3 text-right">Shares</th>
                <th className="py-3 px-3 text-right">Current Price</th>
                <th className="py-3 px-3 text-right">Market Value (CAD)</th>
                <th className="py-3 px-3 text-right">Div/Share</th>
                <th className="py-3 px-3 text-right text-violet-400">
                  Annual Income
                </th>
                <th className="py-3 px-3 text-right">Yield (YOC)</th>
                <th className="py-3 px-3 text-center">DRIP</th>
                <th className="py-3 px-3 text-center">Action</th>
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
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1.5 font-bold text-white">
                        <span>{h.symbol}</span>
                        <span className="text-[10px] font-mono text-slate-400 bg-white/10 px-1.5 py-0.5 rounded-md border border-white/10">
                          {h.currency}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{h.name}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          ACCOUNT_COLORS[h.accountType]
                        }`}
                      >
                        {h.accountType}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-300 whitespace-nowrap">
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
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">{h.shares}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">
                      {h.currency === 'USD' ? '$' : 'CA$'}
                      {h.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-white">
                      {formatCurrency(marketValCAD)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">
                      {h.currency === 'USD' ? '$' : 'CA$'}
                      {h.annualDividendPerShare.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-violet-400">
                      {formatCurrency(annualIncomeCAD)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      <div className="font-semibold text-slate-200">
                        {formatPercent(currentYield, 2)}
                      </div>
                      <div className="text-[10px] text-sky-400">
                        YOC {formatPercent(yoc, 2)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleToggleDRIP(h.id)}
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-all border ${
                          h.dripEnabled
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 border-white/10'
                        }`}
                      >
                        {h.dripEnabled ? 'DRIP ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleDeleteHolding(h.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                        title="Delete holding"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-white/5 font-bold border-t border-white/10">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-slate-300">
                  Total Active Dividend Portfolio
                </td>
                <td className="py-3 px-3 text-right font-mono text-white">
                  {formatCurrency(metrics.totalMarketValueCAD)}
                </td>
                <td></td>
                <td className="py-3 px-3 text-right font-mono text-violet-400">
                  {formatCurrency(metrics.totalPadiCAD)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-sky-400">
                  Avg YOC {formatPercent(metrics.yieldOnCostPercent, 2)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* --- ADD HOLDING MODAL --- */}
      {showAddHoldingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 border border-white/15 shadow-2xl shadow-black/50 text-slate-100">
            <h3 className="text-base font-bold text-white mb-4">
              Add Equity / Dividend Holding
            </h3>

            <form onSubmit={handleAddHolding} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Ticker Symbol *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VDY.TO or SCHD"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm uppercase font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Company / Fund Name
                  </label>
                  <input
                    type="text"
                    placeholder="Vanguard High Dividend Yield ETF"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-violet-400"
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
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white focus:outline-hidden"
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
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white focus:outline-hidden"
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
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white focus:outline-hidden"
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
                    placeholder="150"
                    value={newShares}
                    onChange={(e) => setNewShares(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm font-mono text-white placeholder-slate-500 focus:outline-hidden"
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
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm font-mono text-white placeholder-slate-500 focus:outline-hidden"
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
                    placeholder="47.20"
                    value={newCurrentPrice}
                    onChange={(e) => setNewCurrentPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm font-mono text-white placeholder-slate-500 focus:outline-hidden"
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
                    step="0.01"
                    placeholder="2.15"
                    value={newAnnualDiv}
                    onChange={(e) => setNewAnnualDiv(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm font-mono text-white placeholder-slate-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Frequency
                  </label>
                  <select
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value as PayoutFrequency)}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white focus:outline-hidden"
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
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white focus:outline-hidden"
                  >
                    <option value="yes">Reinvest (DRIP)</option>
                    <option value="no">Cash Payout</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Sector / Theme
                </label>
                <input
                  type="text"
                  placeholder="e.g. Canadian Banking or Clean Energy"
                  value={newSector}
                  onChange={(e) => setNewSector(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/15 bg-slate-950/80 text-sm text-white placeholder-slate-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHoldingModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 font-semibold border border-violet-400/50 shadow-lg shadow-violet-600/20 transition-all"
                >
                  Save Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
