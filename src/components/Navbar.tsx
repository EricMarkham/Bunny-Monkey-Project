import React, { useRef } from 'react';
import {
  Download,
  Upload,
  Wallet,
  Receipt,
  TrendingUp,
  BarChart3,
  Lock,
} from 'lucide-react';
import { HouseholdState, Partner, TabType } from '../types';
import { formatCurrency } from '../utils/finance';

interface NavbarProps {
  state: HouseholdState;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onExportJSON: () => void;
  onImportJSON: (importedData: HouseholdState) => void;
  onUpdatePartner: (partnerKey: 'bunny' | 'monkey', updated: Partial<Partner>) => void;
  onLock?: () => void;
}

export function Navbar({
  state,
  activeTab,
  setActiveTab,
  onExportJSON,
  onImportJSON,
  onLock,
}: NavbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalCombinedNet =
    state.partners.bunny.netMonthlyIncome + state.partners.monkey.netMonthlyIncome;
  const bunnyPct =
    totalCombinedNet > 0
      ? ((state.partners.bunny.netMonthlyIncome / totalCombinedNet) * 100).toFixed(1)
      : '50.0';
  const monkeyPct =
    totalCombinedNet > 0
      ? ((state.partners.monkey.netMonthlyIncome / totalCombinedNet) * 100).toFixed(1)
      : '50.0';

  const totalSinkingBalance = state.sinkingFunds.reduce(
    (acc, fund) => acc + fund.currentBalance,
    0
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.partners && parsed.expenses) {
          onImportJSON(parsed as HouseholdState);
        } else {
          alert('Invalid JSON file format for Household Finance backup.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <header className="relative z-40 border-b border-white/15 bg-white/10 backdrop-blur-md sticky top-0 shadow-xl shadow-black/20">
      {/* Top Banner with Partners & Master KPIs */}
      <div className="max-w-[2000px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-3.5 2xl:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand & Partner Avatars */}
        <div className="flex items-center space-x-3 2xl:space-x-4">
          <div className="flex items-center -space-x-2">
            <div className="w-10 h-10 2xl:w-12 2xl:h-12 rounded-full bg-gradient-to-tr from-rose-400 to-indigo-500 border-2 border-white/20 flex items-center justify-center text-lg 2xl:text-xl shadow-lg shadow-rose-500/20">
              🐰
            </div>
            <div className="w-10 h-10 2xl:w-12 2xl:h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-400 border-2 border-white/20 flex items-center justify-center text-lg 2xl:text-xl shadow-lg shadow-teal-500/20">
              🐵
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base 2xl:text-xl font-bold text-white leading-tight tracking-tight">
                Bunny &amp; Monkey Family Budget Tool
              </h1>
            </div>
            <p className="text-[11px] 2xl:text-xs uppercase tracking-wider text-slate-400">
              Joint Budgeting • Budget vs. Actuals • Statement Ledger • Dividend DRIP
            </p>
          </div>
        </div>

        {/* Global Summary Chips */}
        <div className="flex flex-wrap items-center gap-2 2xl:gap-3 text-xs 2xl:text-sm">
          {/* Bunny Share */}
          <div className="flex items-center space-x-2 px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10">
            <span className="text-base 2xl:text-lg">🐰</span>
            <div>
              <div className="text-[10px] 2xl:text-xs uppercase tracking-wider text-rose-300 font-semibold">
                Bunny ({bunnyPct}%)
              </div>
              <div className="text-xs 2xl:text-sm text-slate-200 font-mono font-bold">
                {formatCurrency(state.partners.bunny.netMonthlyIncome)}/mo
              </div>
            </div>
          </div>

          {/* Monkey Share */}
          <div className="flex items-center space-x-2 px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10">
            <span className="text-base 2xl:text-lg">🐵</span>
            <div>
              <div className="text-[10px] 2xl:text-xs uppercase tracking-wider text-teal-300 font-semibold">
                Monkey ({monkeyPct}%)
              </div>
              <div className="text-xs 2xl:text-sm text-slate-200 font-mono font-bold">
                {formatCurrency(state.partners.monkey.netMonthlyIncome)}/mo
              </div>
            </div>
          </div>

          {/* Combined Net Worth / Income */}
          <div className="hidden sm:flex flex-col px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10">
            <span className="text-[10px] 2xl:text-xs text-slate-400 font-semibold uppercase tracking-widest">
              Joint Net Total
            </span>
            <span className="text-xs 2xl:text-sm font-bold font-mono text-emerald-400">
              {formatCurrency(totalCombinedNet)}/mo
            </span>
          </div>

          {/* Sinking Cash Reserve */}
          <div className="hidden lg:flex flex-col px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-xl bg-indigo-900/40 backdrop-blur-md border border-indigo-500/30">
            <span className="text-[10px] 2xl:text-xs text-indigo-300 font-semibold uppercase tracking-widest">
              Sinking Reserves
            </span>
            <span className="text-xs 2xl:text-sm font-bold font-mono text-indigo-200">
              {formatCurrency(totalSinkingBalance)}
            </span>
          </div>

          {/* Actions: Export, Import, Lock */}
          <div className="flex items-center space-x-1.5 border-l border-white/10 pl-2">
            <button
              onClick={onExportJSON}
              title="Export household data backup (JSON)"
              className="p-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import household JSON data"
              className="p-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />

            {onLock && (
              <button
                onClick={onLock}
                title="Lock session & require household passcode"
                className="flex items-center space-x-1.5 p-2 px-2.5 text-slate-300 hover:text-amber-300 bg-white/5 hover:bg-amber-500/15 border border-white/10 rounded-xl transition-all cursor-pointer"
                aria-label="Lock app"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">Lock</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="max-w-[2000px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 flex space-x-1 sm:space-x-2 2xl:space-x-3 overflow-x-auto no-scrollbar border-t border-white/10 pt-1">
        <button
          onClick={() => setActiveTab('budget')}
          className={`flex items-center space-x-2 2xl:space-x-2.5 py-2.5 2xl:py-3.5 px-3.5 2xl:px-5 text-xs sm:text-sm 2xl:text-base font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 cursor-pointer ${
            activeTab === 'budget'
              ? 'border-rose-400 text-rose-300 bg-white/10 shadow-inner'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Wallet className="w-4 h-4 2xl:w-5 2xl:h-5" />
          <span>Joint Budget &amp; Sinking Funds</span>
        </button>

        <button
          onClick={() => setActiveTab('actuals')}
          className={`flex items-center space-x-2 2xl:space-x-2.5 py-2.5 2xl:py-3.5 px-3.5 2xl:px-5 text-xs sm:text-sm 2xl:text-base font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 cursor-pointer ${
            activeTab === 'actuals'
              ? 'border-amber-400 text-amber-300 bg-white/10 shadow-inner'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-4 h-4 2xl:w-5 2xl:h-5" />
          <span>Budget vs. Actuals Tracker</span>
        </button>

        <button
          onClick={() => setActiveTab('statement')}
          className={`flex items-center space-x-2 2xl:space-x-2.5 py-2.5 2xl:py-3.5 px-3.5 2xl:px-5 text-xs sm:text-sm 2xl:text-base font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 cursor-pointer ${
            activeTab === 'statement'
              ? 'border-indigo-400 text-indigo-300 bg-white/10 shadow-inner'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Receipt className="w-4 h-4 2xl:w-5 2xl:h-5" />
          <span>Statement Parser &amp; Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('dividends')}
          className={`flex items-center space-x-2 2xl:space-x-2.5 py-2.5 2xl:py-3.5 px-3.5 2xl:px-5 text-xs sm:text-sm 2xl:text-base font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 cursor-pointer ${
            activeTab === 'dividends'
              ? 'border-violet-400 text-violet-300 bg-white/10 shadow-inner'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <TrendingUp className="w-4 h-4 2xl:w-5 2xl:h-5" />
          <span>Equity Dividends &amp; DRIP Compound</span>
          <span className="text-[10px] 2xl:text-xs bg-violet-500/20 text-violet-300 border border-violet-500/40 font-mono px-1.5 py-0.2 rounded-full">
            {state.holdings.length}
          </span>
        </button>
      </div>
    </header>
  );
}
