import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Trash2,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
  BarChart3,
  Search,
} from 'lucide-react';
import {
  HouseholdState,
  StatementCategory,
  StatementTransaction,
} from '../types';
import {
  autoCategorizeMerchant,
  formatCurrency,
  formatCurrencyExact,
  getStatementPeriods,
  calculatePeriodAndYtdActuals,
} from '../utils/finance';

interface StatementParserModuleProps {
  state: HouseholdState;
  onUpdateState: (updater: (prev: HouseholdState) => HouseholdState) => void;
  onNavigateToActuals?: () => void;
}

const CATEGORY_OPTIONS: StatementCategory[] = [
  'Groceries',
  'Housing',
  'Childcare',
  'Dining',
  'Utilities/Subs',
  'Subscriptions',
  'Transport',
  'Household',
  'Kid/Family',
  'Travel',
  'Personal (Bunny)',
  'Personal (Monkey)',
  'Insurance',
  'Debt',
  'Discretionary',
  'Uncategorized',
];

const SAMPLE_CSV_DATA = `2026-09-01, Air Canada SFO to YVR, 480.00, Travel
2026-09-02, Whole Foods Market, 162.40, Groceries
2026-09-02, Chevron Gas Station, 68.50, Fuel
2026-09-03, City Hydro Electric Utility, 142.10, Utilities
2026-09-03, Blue Water Cafe Seafood, 185.00, Dining
2026-09-04, Zara Apparel, 98.00, Clothing
2026-09-04, Uber Rideshare, 24.50, Transit
2026-09-05, Montessori Tuition Aftercare, 850.00, Childcare
2026-09-05, Netflix & Spotify Bundle, 38.98, Subscriptions`;

export function StatementParserModule({
  state,
  onUpdateState,
  onNavigateToActuals,
}: StatementParserModuleProps) {
  const [rawText, setRawText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedItems, setParsedItems] = useState<StatementTransaction[]>([]);
  const [selectedPartnerDefault, setSelectedPartnerDefault] = useState<'bunny' | 'monkey' | 'joint'>('joint');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Available periods from existing statement transactions
  const availablePeriods = useMemo(
    () => getStatementPeriods(state.statementTransactions),
    [state.statementTransactions]
  );

  // Selected period state (defaults to most recent period, or empty if none)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return availablePeriods.length > 0 ? availablePeriods[0].id : '';
  });

  // Calculate Period and YTD actuals
  const actualsSummary = useMemo(() => {
    return calculatePeriodAndYtdActuals(state.statementTransactions, selectedPeriod);
  }, [state.statementTransactions, selectedPeriod]);

  // Parse lines from raw CSV/text
  const handleParseText = (text: string) => {
    if (!text.trim()) return;
    const lines = text.trim().split('\n');
    const newItems: StatementTransaction[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('date')) return;

      // Handle comma, tab, or semicolon delimited
      let parts = trimmed.includes('\t')
        ? trimmed.split('\t')
        : trimmed.includes(';')
        ? trimmed.split(';')
        : trimmed.split(',');

      parts = parts.map((p) => p.trim().replace(/^["']|["']$/g, ''));

      // Expected order roughly: Date, Merchant, Amount, Category (or variations)
      let date = parts[0] || new Date().toISOString().split('T')[0];
      let merchant = parts[1] || 'Unknown Merchant';
      let amountStr = parts[2] || '0';
      let rawCat = parts[3] || '';

      // If parts[1] looked like amount and parts[2] like merchant:
      if (!isNaN(parseFloat(parts[1])) && isNaN(parseFloat(parts[2]))) {
        amountStr = parts[1];
        merchant = parts[2];
      }

      // Clean amount: strip $, commas
      const cleanAmt = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
      const amount = Math.abs(cleanAmt);

      const auto = autoCategorizeMerchant(merchant, amount);

      newItems.push({
        id: `tx-parsed-${Date.now()}-${index}`,
        date,
        merchant,
        rawCategory: rawCat,
        assignedCategory: auto.category,
        amount,
        partner: selectedPartnerDefault,
        carbonEstimateKg: 0,
        ecoCategory: 'Neutral',
      });
    });

    setParsedItems(newItems);
  };

  // Drag and drop handler
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setRawText(content);
        handleParseText(content);
      };
      reader.readAsText(file);
    }
  };

  // Add parsed items to master state
  const handleCommitTransactions = () => {
    if (parsedItems.length === 0) return;
    onUpdateState((prev) => {
      const updated = [...parsedItems, ...prev.statementTransactions];
      return {
        ...prev,
        statementTransactions: updated,
      };
    });

    // Auto-select the period of the latest uploaded transaction if available
    const firstDate = parsedItems[0]?.date;
    if (firstDate && firstDate.length >= 7) {
      setSelectedPeriod(firstDate.slice(0, 7));
    }

    setParsedItems([]);
    setRawText('');
  };

  // Remove single item from parsed preview
  const handleRemoveParsedItem = (id: string) => {
    setParsedItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Update single parsed item category
  const handleUpdateCategory = (id: string, category: StatementCategory) => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, assignedCategory: category } : i))
    );
  };

  // Remove committed item from master list
  const handleDeleteCommittedItem = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: prev.statementTransactions.filter((i) => i.id !== id),
    }));
  };

  // Update committed transaction category
  const handleUpdateCommittedCategory = (id: string, category: StatementCategory) => {
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: prev.statementTransactions.map((tx) =>
        tx.id === id ? { ...tx, assignedCategory: category } : tx
      ),
    }));
  };

  // Filtered transactions for the ledger view
  const filteredTransactions = useMemo(() => {
    return state.statementTransactions.filter((tx) => {
      // Period filter
      if (selectedPeriod && selectedPeriod !== 'all') {
        if (!tx.date.startsWith(selectedPeriod)) return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && tx.assignedCategory !== categoryFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesMerchant = tx.merchant.toLowerCase().includes(q);
        const matchesCategory = tx.assignedCategory.toLowerCase().includes(q);
        const matchesDate = tx.date.includes(q);
        if (!matchesMerchant && !matchesCategory && !matchesDate) return false;
      }
      return true;
    });
  }, [state.statementTransactions, selectedPeriod, categoryFilter, searchTerm]);

  // Selected period display label
  const selectedPeriodLabel = useMemo(() => {
    if (!selectedPeriod || selectedPeriod === 'all') return 'All Historical Periods';
    const found = availablePeriods.find((p) => p.id === selectedPeriod);
    return found ? found.label : selectedPeriod;
  }, [selectedPeriod, availablePeriods]);

  // Category breakdown list sorted by period spend descending
  const categoryBreakdownList = useMemo(() => {
    const periodCats = actualsSummary?.periodByCategory || {};
    const ytdCats = actualsSummary?.ytdByCategory || {};
    const allCatKeys = new Set([
      ...Object.keys(periodCats),
      ...Object.keys(ytdCats),
    ]);
    return Array.from(allCatKeys)
      .map((cat) => ({
        category: cat,
        periodActual: periodCats[cat] || 0,
        ytdActual: ytdCats[cat] || 0,
      }))
      .sort((a, b) => b.periodActual - a.periodActual);
  }, [actualsSummary]);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Period Actual & Year-to-Date Actual Master Header */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-white">
                    Parsed Household Statement Ledger
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {selectedPeriodLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Track actual expenditures across statement periods and year-to-date totals for Bunny &amp; Monkey
                </p>
              </div>
            </div>
          </div>

          {/* Period Selector & Dashboard Quick Link */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-slate-400" />
              <label className="text-xs text-slate-400">Statement Period:</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-slate-900 text-slate-200 text-xs font-semibold py-1 px-2.5 rounded-lg border border-white/15 focus:outline-hidden focus:border-indigo-400"
              >
                {availablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="all">All Available Periods</option>
              </select>
            </div>

            {onNavigateToActuals && (
              <button
                onClick={onNavigateToActuals}
                className="flex items-center space-x-1.5 text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/40 px-3.5 py-2 rounded-xl transition-all shadow-md"
              >
                <BarChart3 className="w-4 h-4 text-indigo-300" />
                <span>Track Budget vs. Actuals</span>
              </button>
            )}
          </div>
        </div>

        {/* Period Actual & Year to Date Actual Hero KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/10">
          {/* 1. Period Actual Spend */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                Period Actual Spend
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {actualsSummary.periodCount} Txns
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-white tracking-tight">
              {formatCurrency(actualsSummary.periodTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
              <span>Selected Month:</span>
              <span className="font-semibold text-slate-200">{selectedPeriodLabel}</span>
            </div>
          </div>

          {/* 2. Year to Date (YTD) Actual Spend */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">
                Year to Date Actual Spend
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {actualsSummary.ytdCount} Txns YTD
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-teal-300 tracking-tight">
              {formatCurrency(actualsSummary.ytdTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
              <span>Calendar Year:</span>
              <span className="font-semibold text-slate-200">{actualsSummary.targetYear} YTD</span>
            </div>
          </div>

          {/* 3. Partner Period Spend Contribution */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300 block mb-1">
              Period Partner Breakdown
            </span>
            <div className="space-y-1 mt-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐰 Bunny:</span>
                <span className="font-mono font-semibold text-rose-300">
                  {formatCurrency(actualsSummary.periodByPartner.bunny)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐵 Monkey:</span>
                <span className="font-mono font-semibold text-teal-300">
                  {formatCurrency(actualsSummary.periodByPartner.monkey)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">💳 Joint:</span>
                <span className="font-mono font-semibold text-indigo-300">
                  {formatCurrency(actualsSummary.periodByPartner.joint)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Partner YTD Spend Contribution */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 block mb-1">
              Year to Date Partner Totals
            </span>
            <div className="space-y-1 mt-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐰 Bunny YTD:</span>
                <span className="font-mono font-semibold text-rose-300">
                  {formatCurrency(actualsSummary.ytdByPartner.bunny)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">🐵 Monkey YTD:</span>
                <span className="font-mono font-semibold text-teal-300">
                  {formatCurrency(actualsSummary.ytdByPartner.monkey)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">💳 Joint YTD:</span>
                <span className="font-mono font-semibold text-indigo-300">
                  {formatCurrency(actualsSummary.ytdByPartner.joint)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Actuals Summary Pill Bar */}
        {categoryBreakdownList.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2.5">
              <span>Category Actuals Summary ({selectedPeriodLabel})</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {categoryBreakdownList.length} Categories Active
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
              {categoryBreakdownList.slice(0, 6).map((c) => (
                <div
                  key={c.category}
                  className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400/30 transition-all"
                >
                  <span className="text-[11px] text-slate-400 font-medium truncate block">
                    {c.category}
                  </span>
                  <div className="font-mono font-bold text-white text-sm mt-0.5">
                    {formatCurrency(c.periodActual)}
                  </div>
                  <div className="text-[10px] text-teal-300 font-mono mt-0.5">
                    YTD: {formatCurrency(c.ytdActual)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. CSV Parser Input Box & Drop Area */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Credit Card Statement CSV Uploader
            </h3>
            <p className="text-xs text-slate-400">
              Paste credit card statement rows or drop a CSV file to auto-categorize and update period &amp; YTD actuals
            </p>
          </div>

          <button
            onClick={() => {
              setRawText(SAMPLE_CSV_DATA);
              handleParseText(SAMPLE_CSV_DATA);
            }}
            className="flex items-center space-x-1.5 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition-all self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Sample CSV</span>
          </button>
        </div>

        {/* Drop & Paste Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/40 shadow-inner'
              : 'border-white/15 hover:border-white/30 bg-black/20'
          }`}
        >
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-white/10 flex items-center justify-center text-slate-300">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Drag &amp; drop statement CSV here, or paste raw text below
              </p>
              <p className="text-[11px] text-slate-400">
                Standard format: <code className="text-indigo-300 font-mono">Date, Merchant, Amount, Category</code>
              </p>
            </div>

            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                handleParseText(e.target.value);
              }}
              placeholder="e.g.&#10;2026-08-15, Whole Foods Market, 142.50, Groceries&#10;2026-08-16, Hydro Quebec, 120.00, Utilities"
              className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-white/15 bg-slate-950/70 text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Default Cardholder:</span>
                <select
                  value={selectedPartnerDefault}
                  onChange={(e) => setSelectedPartnerDefault(e.target.value as 'bunny' | 'monkey' | 'joint')}
                  className="px-2 py-1 rounded-lg border border-white/15 bg-slate-900 text-slate-200 text-xs font-semibold focus:outline-hidden"
                >
                  <option value="joint">💳 Joint Household Card</option>
                  <option value="bunny">🐰 Bunny Individual Card</option>
                  <option value="monkey">🐵 Monkey Individual Card</option>
                </select>
              </div>

              {rawText.trim() && (
                <button
                  type="button"
                  onClick={() => handleParseText(rawText)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs transition-all shadow-md"
                >
                  Reparse Lines
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Parsed Items Preview Stage */}
        {parsedItems.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h4 className="text-sm font-bold text-white">
                  Parsed Transactions Ready for Review ({parsedItems.length})
                </h4>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setParsedItems([])}
                  className="text-xs text-slate-400 hover:text-rose-400 px-2.5 py-1 transition-colors"
                >
                  Discard All
                </button>
                <button
                  onClick={handleCommitTransactions}
                  className="flex items-center space-x-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white px-3.5 py-1.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Commit to Household Ledger</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Merchant</th>
                    <th className="py-2.5 px-3">Amount ($ CAD)</th>
                    <th className="py-2.5 px-3">Auto-Category</th>
                    <th className="py-2.5 px-3">Card / Partner</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {parsedItems.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{tx.date}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">{tx.merchant}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">
                        {formatCurrencyExact(tx.amount)}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={tx.assignedCategory}
                          onChange={(e) =>
                            handleUpdateCategory(tx.id, e.target.value as StatementCategory)
                          }
                          className="text-xs px-2.5 py-1 rounded-xl border border-white/15 bg-slate-900 text-slate-200 font-medium focus:outline-hidden"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] text-slate-300 font-medium">
                          {tx.partner === 'bunny' ? '🐰 Bunny' : tx.partner === 'monkey' ? '🐵 Monkey' : '💳 Joint'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleRemoveParsedItem(tx.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Committed Master Statement Transactions Table */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Parsed Household Statement Ledger
            </h3>
            <p className="text-xs text-slate-400">
              Showing {filteredTransactions.length} transactions for {selectedPeriodLabel}
            </p>
          </div>

          {/* Search and Category Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search merchant or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-white/15 bg-slate-950/60 text-slate-200 text-xs placeholder-slate-500 focus:outline-hidden focus:border-indigo-400"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-white/15 bg-slate-900 text-slate-200 text-xs font-semibold focus:outline-hidden"
            >
              <option value="all">All Categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-3">Merchant</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Card / Partner</th>
                <th className="py-3 px-3">Period</th>
                <th className="py-3 px-3 text-right">Amount ($ CAD)</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No transactions found for the selected period / filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const txPeriod = tx.date.slice(0, 7);
                  return (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400">{tx.date}</td>
                      <td className="py-3 px-3 font-semibold text-slate-100">{tx.merchant}</td>
                      <td className="py-3 px-3">
                        <select
                          value={tx.assignedCategory}
                          onChange={(e) =>
                            handleUpdateCommittedCategory(
                              tx.id,
                              e.target.value as StatementCategory
                            )
                          }
                          className="px-2 py-0.5 rounded-lg text-xs bg-slate-900 text-slate-200 border border-white/10 font-semibold focus:outline-hidden"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            tx.partner === 'bunny'
                              ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                              : tx.partner === 'monkey'
                              ? 'bg-teal-500/20 border-teal-500/30 text-teal-300'
                              : 'bg-white/10 border-white/15 text-slate-300'
                          }`}
                        >
                          {tx.partner === 'bunny'
                            ? '🐰 Bunny'
                            : tx.partner === 'monkey'
                            ? '🐵 Monkey'
                            : '💳 Joint'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                          {txPeriod}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-white">
                        {formatCurrencyExact(tx.amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDeleteCommittedItem(tx.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-white/5 font-bold border-t border-white/10 text-slate-200 text-xs">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-slate-300">
                  Filtered Ledger Total ({filteredTransactions.length} Transactions)
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-300 text-sm">
                  {formatCurrencyExact(
                    filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0)
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
