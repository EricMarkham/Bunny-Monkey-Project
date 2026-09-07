import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Plane,
  Plus,
  Trash2,
  CheckCircle2,
  DollarSign,
  Calendar,
  Layers,
  MapPin,
  Clock,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  Filter,
  Check,
  Sparkles,
  Compass,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  HouseholdState,
  Trip,
  TripCategory,
  TripExpense,
  TripPayer,
  SinkingFund,
} from '../types';
import { calculateTripTracking, formatCurrency, formatCurrencyExact } from '../utils/finance';
import { CategoryDonutChart } from './charts/CustomCharts';
import {
  insertOrUpdateTripInSupabase,
  deleteTripFromSupabase,
  insertOrUpdateTripExpenseInSupabase,
  deleteTripExpenseFromSupabase,
  updateSinkingFundBalanceInSupabase,
  mapRowToTrip,
  mapRowToTripExpense,
} from '../services/supabaseService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface TripSettlementModuleProps {
  state: HouseholdState;
  onUpdateState: (updater: (prev: HouseholdState) => HouseholdState) => void;
}

const TRIP_CAT_COLORS: Record<TripCategory, string> = {
  Flights: '#0284c7', // Sky
  Hotel: '#7c3aed', // Violet
  Dining: '#f59e0b', // Amber
  Transit: '#10b981', // Emerald
  Activities: '#ec4899', // Pink
  Shopping: '#f97316', // Orange
  Misc: '#64748b', // Slate
};

export function TripSettlementModule({ state, onUpdateState }: TripSettlementModuleProps) {
  const activeTrip =
    state.trips.find((t) => t.id === state.activeTripId) || state.trips[0] || null;

  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [showSinkingFundReimburseModal, setShowSinkingFundReimburseModal] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'sinking_fund' | 'out_of_pocket'>('all');

  // New Expense form
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expCategory, setExpCategory] = useState<TripCategory>('Dining');
  const [expDesc, setExpDesc] = useState('');
  const [expCost, setExpCost] = useState('');
  const [expPaidBy, setExpPaidBy] = useState<TripPayer>('bunny');
  const [expFundedByFund, setExpFundedByFund] = useState(false);
  const [expNotes, setExpNotes] = useState('');

  // New Trip form
  const [tripName, setTripName] = useState('');
  const [tripDest, setTripDest] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [tripBudget, setTripBudget] = useState('');

  // Trip Deletion & Management State
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [showManageTripsModal, setShowManageTripsModal] = useState(false);

  // Sinking Fund reimbursement selection
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [selectedSinkingFundId, setSelectedSinkingFundId] = useState<string>(() => {
    const vac = state.sinkingFunds.find(
      (sf) =>
        sf.category === 'Vacation' ||
        sf.name.toLowerCase().includes('vacation') ||
        sf.name.toLowerCase().includes('trip')
    );
    return vac ? vac.id : state.sinkingFunds[0]?.id || '';
  });

  // Cloud sync state for TripSettlementModule
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const syncTripsFromSupabase = async () => {
    if (!isSupabaseConfigured()) return;
    setIsSyncing(true);
    try {
      const [tripsRes, expensesRes] = await Promise.all([
        supabase.from('trips').select('*'),
        supabase.from('trip_expenses').select('*'),
      ]);
      if (!tripsRes.error && tripsRes.data && tripsRes.data.length > 0) {
        onUpdateState((prev) => ({
          ...prev,
          trips: tripsRes.data.map(mapRowToTrip),
        }));
      }
      if (!expensesRes.error && expensesRes.data && expensesRes.data.length > 0) {
        onUpdateState((prev) => ({
          ...prev,
          tripExpenses: expensesRes.data.map(mapRowToTripExpense),
        }));
      }
      setSyncStatus('✓ Trips synced');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncTripsFromSupabase();
  }, []);

  // Delete Trip Handler
  const handleDeleteTrip = (tripId: string) => {
    onUpdateState((prev) => {
      const remainingTrips = prev.trips.filter((t) => t.id !== tripId);
      const updatedExpenses = prev.tripExpenses.filter((e) => e.tripId !== tripId);
      const nextActiveId =
        prev.activeTripId === tripId
          ? (remainingTrips[0]?.id || '')
          : prev.activeTripId;

      return {
        ...prev,
        trips: remainingTrips,
        tripExpenses: updatedExpenses,
        activeTripId: nextActiveId,
      };
    });
    // Immediately delete trip from Supabase
    deleteTripFromSupabase(tripId);
    setTripToDelete(null);
  };

  // Delete All Example Trips (trip-1 & trip-2)
  const handleDeleteAllSampleTrips = () => {
    onUpdateState((prev) => {
      const sampleIds = ['trip-1', 'trip-2'];
      const remainingTrips = prev.trips.filter((t) => !sampleIds.includes(t.id));
      const updatedExpenses = prev.tripExpenses.filter((e) => !sampleIds.includes(e.tripId));
      return {
        ...prev,
        trips: remainingTrips,
        tripExpenses: updatedExpenses,
        activeTripId: remainingTrips[0]?.id || '',
      };
    });
    setShowManageTripsModal(false);
  };

  // Restore Example Trips if desired
  const handleRestoreSampleTrips = () => {
    const sampleTrips: Trip[] = [
      {
        id: 'trip-1',
        name: 'Tokyo & Kyoto Cherry Blossom 2026',
        destination: 'Tokyo & Kyoto, Japan',
        startDate: '2026-03-24',
        endDate: '2026-04-07',
        budget: 8500,
      },
      {
        id: 'trip-2',
        name: 'Banff & Jasper Rocky Mountain Trek',
        destination: 'Alberta, Canada',
        startDate: '2026-07-10',
        endDate: '2026-07-18',
        budget: 3600,
      },
    ];

    onUpdateState((prev) => ({
      ...prev,
      trips: [...prev.trips, ...sampleTrips.filter((st) => !prev.trips.some((t) => t.id === st.id))],
      activeTripId: prev.activeTripId || 'trip-1',
    }));
  };

  // Create Trip Handler
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const budget = parseFloat(tripBudget);
    if (!tripName.trim() || isNaN(budget) || budget <= 0) return;

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      name: tripName.trim(),
      destination: tripDest.trim() || tripName.trim(),
      startDate: tripStart || new Date().toISOString().split('T')[0],
      endDate: tripEnd || new Date().toISOString().split('T')[0],
      budget,
    };

    onUpdateState((prev) => ({
      ...prev,
      trips: [...prev.trips, newTrip],
      activeTripId: newTrip.id,
    }));

    // Immediately execute database insert query in Supabase
    insertOrUpdateTripInSupabase(newTrip);

    setTripName('');
    setTripDest('');
    setTripStart('');
    setTripEnd('');
    setTripBudget('');
    setShowNewTripModal(false);
  };

  // Empty State if no trips exist
  if (!activeTrip || state.trips.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Trip Expenses & Vacation Tracking
              </h2>
              <p className="text-xs text-slate-400">
                Track family travel expenses and cover them directly from your pre-established Vacation Sinking Fund.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewTripModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl transition-all shadow-lg shadow-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Trip</span>
          </button>
        </div>

        {/* Empty State Card */}
        <div className="p-12 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mx-auto">
            <Plane className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No Trips Configured</h3>
            <p className="text-xs text-slate-400 mt-1">
              All example trips have been removed. Add your upcoming vacation or family getaway to begin tracking travel expenses.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setShowNewTripModal(true)}
              className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-teal-500/20 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Trip</span>
            </button>
            <button
              onClick={handleRestoreSampleTrips}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl text-xs transition-all border border-white/10"
            >
              Restore Example Trips
            </button>
          </div>
        </div>

        {/* Modal: New Trip when in empty state */}
        {showNewTripModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plane className="w-4 h-4 text-teal-400" />
                  Create New Trip
                </h3>
                <button
                  onClick={() => setShowNewTripModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTrip} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Trip Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Hawaii Summer Getaway 2027"
                    value={tripName}
                    onChange={(e) => setTripName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Destination</label>
                  <input
                    type="text"
                    placeholder="e.g. Maui, Hawaii"
                    value={tripDest}
                    onChange={(e) => setTripDest(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={tripStart}
                      onChange={(e) => setTripStart(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={tripEnd}
                      onChange={(e) => setTripEnd(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Total Trip Budget (CAD) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 6000"
                    value={tripBudget}
                    onChange={(e) => setTripBudget(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowNewTripModal(false)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-teal-500/20"
                  >
                    Create Trip
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const trackingInfo = calculateTripTracking(
    activeTrip.id,
    state.tripExpenses,
    state.sinkingFunds
  );

  const budgetUsedPct =
    activeTrip.budget > 0
      ? Math.min(100, (trackingInfo.totalTripSpend / activeTrip.budget) * 100)
      : 0;

  const vacationFund =
    state.sinkingFunds.find((sf) => sf.id === selectedSinkingFundId) ||
    trackingInfo.vacationFund ||
    state.sinkingFunds[0];

  // Donut chart items
  const donutItems = Object.entries(trackingInfo?.categoryBreakdown || {})
    .filter(([_, val]) => val > 0)
    .map(([cat, val]) => ({
      label: cat,
      value: val,
      color: TRIP_CAT_COLORS[cat as TripCategory] || '#94a3b8',
    }));

  const tripExpensesList = state.tripExpenses.filter((e) => e.tripId === activeTrip.id);

  const filteredExpenses = tripExpensesList.filter((e) => {
    if (expenseFilter === 'sinking_fund') return e.fundedBySinkingFund || e.paidBy === 'sinking_fund';
    if (expenseFilter === 'out_of_pocket') return !e.fundedBySinkingFund && e.paidBy !== 'sinking_fund';
    return true;
  });

  const outOfPocketExpenses = tripExpensesList.filter(
    (e) => !e.fundedBySinkingFund && e.paidBy !== 'sinking_fund'
  );

  // Add Expense
  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(expCost);
    if (!expDesc.trim() || isNaN(cost) || cost <= 0) return;

    const isFromFund = expPaidBy === 'sinking_fund' || expFundedByFund;

    const newExpense: TripExpense = {
      id: `te-${Date.now()}`,
      tripId: activeTrip.id,
      date: expDate,
      category: expCategory,
      description: expDesc.trim(),
      totalCost: cost,
      paidBy: expPaidBy,
      fundedBySinkingFund: isFromFund,
      sinkingFundId: isFromFund ? (vacationFund ? vacationFund.id : undefined) : undefined,
      notes: expNotes.trim() || undefined,
    };

    onUpdateState((prev) => {
      let updatedFunds = prev.sinkingFunds;
      // If directly paid from Sinking Fund, deduct from the fund balance
      if (expPaidBy === 'sinking_fund' && vacationFund) {
        updatedFunds = prev.sinkingFunds.map((sf) =>
          sf.id === vacationFund.id
            ? { ...sf, currentBalance: Math.max(0, sf.currentBalance - cost) }
            : sf
        );
      }
      return {
        ...prev,
        tripExpenses: [newExpense, ...prev.tripExpenses],
        sinkingFunds: updatedFunds,
      };
    });

    // Immediately persist trip expense to Supabase
    insertOrUpdateTripExpenseInSupabase(newExpense);
    if (expPaidBy === 'sinking_fund' && vacationFund) {
      updateSinkingFundBalanceInSupabase(
        vacationFund.id,
        Math.max(0, vacationFund.currentBalance - cost)
      );
    }

    setExpDesc('');
    setExpCost('');
    setExpNotes('');
    setExpFundedByFund(false);
    setShowAddExpenseModal(false);
  };

  // Toggle Sinking Fund coverage on an existing expense
  const handleToggleSinkingFundCoverage = (expenseId: string) => {
    const exp = state.tripExpenses.find((e) => e.id === expenseId);
    if (!exp) return;
    const willBeFunded = !exp.fundedBySinkingFund;

    const updatedExpense: TripExpense = {
      ...exp,
      fundedBySinkingFund: willBeFunded,
      sinkingFundId: willBeFunded ? (vacationFund ? vacationFund.id : undefined) : undefined,
    };

    onUpdateState((prev) => {
      const updatedExpenses = prev.tripExpenses.map((e) =>
        e.id === expenseId ? updatedExpense : e
      );

      // Optionally adjust sinking fund balance
      let updatedFunds = prev.sinkingFunds;
      if (vacationFund) {
        updatedFunds = prev.sinkingFunds.map((sf) => {
          if (sf.id === vacationFund.id) {
            const newBal = willBeFunded
              ? Math.max(0, sf.currentBalance - exp.totalCost)
              : sf.currentBalance + exp.totalCost;
            return { ...sf, currentBalance: newBal };
          }
          return sf;
        });
      }

      return {
        ...prev,
        tripExpenses: updatedExpenses,
        sinkingFunds: updatedFunds,
      };
    });

    // Immediately persist update to Supabase
    insertOrUpdateTripExpenseInSupabase(updatedExpense);
    if (vacationFund) {
      const newBal = willBeFunded
        ? Math.max(0, vacationFund.currentBalance - exp.totalCost)
        : vacationFund.currentBalance + exp.totalCost;
      updateSinkingFundBalanceInSupabase(vacationFund.id, newBal);
    }
  };

  const handleDeleteExpense = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      tripExpenses: prev.tripExpenses.filter((e) => e.id !== id),
    }));
    // Immediately delete expense from Supabase
    deleteTripExpenseFromSupabase(id);
  };

  // Process Reimbursement from Sinking Fund for selected expenses
  const handleExecuteReimbursement = () => {
    if (selectedExpenseIds.length === 0 || !vacationFund) return;

    const selectedExpenses = tripExpensesList.filter((e) =>
      selectedExpenseIds.includes(e.id)
    );
    const totalToReimburse = selectedExpenses.reduce((sum, e) => sum + e.totalCost, 0);

    onUpdateState((prev) => {
      // 1. Mark selected expenses as fundedBySinkingFund
      const updatedExpenses = prev.tripExpenses.map((e) => {
        if (selectedExpenseIds.includes(e.id)) {
          return {
            ...e,
            fundedBySinkingFund: true,
            sinkingFundId: vacationFund.id,
          };
        }
        return e;
      });

      // 2. Deduct reimbursed total from the Vacation Sinking Fund
      const updatedFunds = prev.sinkingFunds.map((sf) => {
        if (sf.id === vacationFund.id) {
          return {
            ...sf,
            currentBalance: Math.max(0, sf.currentBalance - totalToReimburse),
          };
        }
        return sf;
      });

      return {
        ...prev,
        tripExpenses: updatedExpenses,
        sinkingFunds: updatedFunds,
      };
    });

    // Immediately persist reimbursed expenses and updated fund balance to Supabase
    selectedExpenses.forEach((e) => {
      insertOrUpdateTripExpenseInSupabase({
        ...e,
        fundedBySinkingFund: true,
        sinkingFundId: vacationFund.id,
      });
    });
    updateSinkingFundBalanceInSupabase(
      vacationFund.id,
      Math.max(0, vacationFund.currentBalance - totalToReimburse)
    );

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    setShowSinkingFundReimburseModal(false);
    setSelectedExpenseIds([]);
  };

  return (
    <div className="space-y-6 2xl:space-y-8">
      {/* Top Banner & Trip Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 border border-white/10 p-5 2xl:p-6 rounded-2xl backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 2xl:space-x-3">
            <span className="p-2 2xl:p-2.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Plane className="w-5 h-5 2xl:w-6 2xl:h-6" />
            </span>
            <div>
              <h2 className="text-xl 2xl:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Trip &amp; Vacation Tracker
                <span className="text-[10px] 2xl:text-xs font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40">
                  Sinking Fund Powered
                </span>
              </h2>
              <p className="text-xs 2xl:text-sm text-slate-400">
                Track family travel expenses and cover them directly from your pre-established Vacation Sinking Fund.
              </p>
            </div>
          </div>
        </div>

        {/* Trip Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-black/30 border border-white/10 rounded-xl px-3 2xl:px-4 py-1.5 2xl:py-2">
            <MapPin className="w-4 h-4 2xl:w-5 2xl:h-5 text-teal-400 mr-2 shrink-0" />
            <select
              value={activeTrip.id}
              onChange={(e) =>
                onUpdateState((prev) => ({ ...prev, activeTripId: e.target.value }))
              }
              className="bg-transparent text-sm 2xl:text-base font-semibold text-white focus:outline-none cursor-pointer max-w-[180px] sm:max-w-[240px] 2xl:max-w-[300px] truncate"
            >
              {state.trips.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Delete active trip button */}
          <button
            type="button"
            onClick={() => setTripToDelete(activeTrip)}
            className="p-2 2xl:p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl border border-white/10 transition-colors flex items-center gap-1.5 text-xs 2xl:text-sm"
            title="Delete this trip"
          >
            <Trash2 className="w-4 h-4 2xl:w-5 2xl:h-5" />
            <span className="hidden md:inline">Delete Trip</span>
          </button>

          {/* Manage All Trips Button */}
          <button
            type="button"
            onClick={() => setShowManageTripsModal(true)}
            className="flex items-center space-x-1.5 px-3 2xl:px-4 py-2 2xl:py-2.5 text-xs 2xl:text-sm font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition-all shadow-sm"
            title="Manage all trips"
          >
            <Layers className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            <span>Manage Trips</span>
          </button>

          {/* Sync from Supabase Button */}
          <button
            type="button"
            onClick={syncTripsFromSupabase}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 2xl:px-4 py-2 2xl:py-2.5 text-xs 2xl:text-sm font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition-all shadow-sm"
            title="Sync trips and expenses from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 ${isSyncing ? 'animate-spin text-teal-400' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {syncStatus && (
            <span className="text-xs text-teal-300 font-medium">
              {syncStatus}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowNewTripModal(true)}
            className="flex items-center space-x-1.5 px-3.5 2xl:px-4 py-2 2xl:py-2.5 text-xs 2xl:text-sm font-semibold bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-xl border border-teal-500/30 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            <span>New Trip</span>
          </button>
        </div>
      </div>

      {/* Philosophy Notice: No Settlement Needed */}
      <div className="p-3.5 2xl:p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs 2xl:text-sm text-emerald-200">
        <div className="flex items-center space-x-2.5">
          <ShieldCheck className="w-4 h-4 2xl:w-5 2xl:h-5 text-emerald-400 shrink-0" />
          <span>
            <strong>Zero Debt Friction:</strong> Bunny and Monkey do not owe each other money for vacations. All trip expenses are tracked for family clarity and funded/reimbursed from your <strong>{vacationFund?.name || 'Vacation Sinking Fund'}</strong>.
          </span>
        </div>
        {vacationFund && (
          <span className="hidden sm:inline-block text-[11px] 2xl:text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30">
            Available Fund: {formatCurrency(vacationFund.currentBalance)}
          </span>
        )}
      </div>

      {/* Master Trip KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 2xl:gap-6">
        {/* Total Spend & Budget */}
        <div className="p-5 2xl:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] 2xl:text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Trip Spend
            </span>
            <span className="text-xs 2xl:text-sm font-mono font-bold text-teal-400">
              Budget: {formatCurrency(activeTrip.budget)}
            </span>
          </div>
          <div className="text-2xl 2xl:text-3xl font-bold font-mono text-white mb-2">
            {formatCurrency(trackingInfo.totalTripSpend)}
          </div>
          {/* Progress bar */}
          <div className="w-full bg-white/10 rounded-full h-2 2xl:h-2.5 overflow-hidden mb-1.5">
            <div
              className={`h-full transition-all ${
                budgetUsedPct > 90 ? 'bg-rose-500' : 'bg-teal-400'
              }`}
              style={{ width: `${budgetUsedPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] 2xl:text-xs text-slate-400 font-mono">
            <span>{budgetUsedPct.toFixed(0)}% budget utilized</span>
            <span>
              Remaining: {formatCurrency(Math.max(0, activeTrip.budget - trackingInfo.totalTripSpend))}
            </span>
          </div>
        </div>

        {/* Covered by Sinking Fund */}
        <div className="p-5 2xl:p-6 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 backdrop-blur-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] 2xl:text-xs font-semibold text-indigo-300 uppercase tracking-wider">
              Covered by Sinking Fund
            </span>
            <Wallet className="w-4 h-4 2xl:w-5 2xl:h-5 text-indigo-400" />
          </div>
          <div className="text-2xl 2xl:text-3xl font-bold font-mono text-indigo-200 mb-1">
            {formatCurrency(trackingInfo.totalCoveredBySinkingFund)}
          </div>
          <p className="text-[11px] 2xl:text-xs text-indigo-300/80">
            {trackingInfo.totalTripSpend > 0
              ? `${((trackingInfo.totalCoveredBySinkingFund / trackingInfo.totalTripSpend) * 100).toFixed(0)}% of expenses covered from fund`
              : 'Directly paid or reimbursed from fund'}
          </p>
        </div>

        {/* Vacation Sinking Fund Balance */}
        <div className="p-5 2xl:p-6 rounded-2xl bg-teal-950/40 border border-teal-500/30 backdrop-blur-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] 2xl:text-xs font-semibold text-teal-300 uppercase tracking-wider">
              Vacation Sinking Fund
            </span>
            <Sparkles className="w-4 h-4 2xl:w-5 2xl:h-5 text-teal-400" />
          </div>
          <div className="text-2xl 2xl:text-3xl font-bold font-mono text-teal-200 mb-1">
            {formatCurrency(vacationFund?.currentBalance || 0)}
          </div>
          <p className="text-[11px] 2xl:text-xs text-teal-300/80 font-mono">
            Target: {formatCurrency(vacationFund?.targetBalance || 0)} • +{formatCurrency(vacationFund?.monthlyContribution || 0)}/mo
          </p>
        </div>

        {/* Out-of-Pocket Total to Reimburse */}
        <div className="p-5 2xl:p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] 2xl:text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Pending Reimbursement
            </span>
            <Clock className="w-4 h-4 2xl:w-5 2xl:h-5 text-amber-400" />
          </div>
          <div className="text-2xl 2xl:text-3xl font-bold font-mono text-amber-300 mb-1">
            {formatCurrency(trackingInfo.outOfPocketTotal)}
          </div>
          <p className="text-[11px] 2xl:text-xs text-slate-400">
            Carded out-of-pocket, ready to draw from Sinking Fund
          </p>
        </div>
      </div>

      {/* Sinking Fund Payout / Reimbursement Action Bar */}
      <div className="p-5 2xl:p-6 rounded-2xl bg-gradient-to-r from-teal-900/30 to-indigo-900/30 border border-teal-500/30 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm 2xl:text-base font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 2xl:w-5 2xl:h-5 text-teal-400" />
            Sinking Fund Reimbursement Engine
          </h3>
          <p className="text-xs 2xl:text-sm text-slate-300">
            {outOfPocketExpenses.length > 0 ? (
              <span>
                You have <strong>{outOfPocketExpenses.length} out-of-pocket expense(s)</strong> totaling{' '}
                <strong className="text-amber-300">{formatCurrency(trackingInfo.outOfPocketTotal)}</strong> that can be reimbursed from the <strong>{vacationFund?.name}</strong>.
              </span>
            ) : (
              <span>All logged trip expenses have been fully covered or paid from your Sinking Fund!</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {outOfPocketExpenses.length > 0 && (
            <button
              onClick={() => {
                setSelectedExpenseIds(outOfPocketExpenses.map((e) => e.id));
                setShowSinkingFundReimburseModal(true);
              }}
              className="flex items-center space-x-2 px-4 2xl:px-5 py-2.5 2xl:py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-xs 2xl:text-sm rounded-xl shadow-lg shadow-teal-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4 2xl:w-5 2xl:h-5" />
              <span>Reimburse from Sinking Fund</span>
            </button>
          )}

          <button
            onClick={() => {
              setExpPaidBy('sinking_fund');
              setExpFundedByFund(true);
              setShowAddExpenseModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 2xl:px-4 py-2.5 2xl:py-3 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs 2xl:text-sm rounded-xl border border-white/10 transition-all"
          >
            <Plus className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            <span>Pay Direct from Fund</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout: Expenses Table & Analytics */}
      <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-6 2xl:gap-8">
        {/* Expenses List Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 border border-white/10 p-4 2xl:p-5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center space-x-2">
              <span className="text-sm 2xl:text-base font-bold text-white">Trip Expenses</span>
              <span className="text-xs 2xl:text-sm font-mono font-semibold bg-white/10 text-slate-300 px-2.5 py-0.5 rounded-full">
                {filteredExpenses.length} of {tripExpensesList.length}
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center space-x-1 bg-black/30 p-1 rounded-xl border border-white/10 text-xs 2xl:text-sm">
              <button
                onClick={() => setExpenseFilter('all')}
                className={`px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg font-medium transition-all ${
                  expenseFilter === 'all'
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setExpenseFilter('sinking_fund')}
                className={`px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg font-medium transition-all ${
                  expenseFilter === 'sinking_fund'
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Funded ({trackingInfo.totalTripSpend > 0 ? formatCurrency(trackingInfo.totalCoveredBySinkingFund) : '$0'})
              </button>
              <button
                onClick={() => setExpenseFilter('out_of_pocket')}
                className={`px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg font-medium transition-all ${
                  expenseFilter === 'out_of_pocket'
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Out-of-Pocket ({formatCurrency(trackingInfo.outOfPocketTotal)})
              </button>
            </div>

            <button
              onClick={() => {
                setExpPaidBy('bunny');
                setExpFundedByFund(false);
                setShowAddExpenseModal(true);
              }}
              className="flex items-center space-x-1 px-3 2xl:px-4 py-1.5 2xl:py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-semibold text-xs 2xl:text-sm rounded-xl border border-teal-500/30 transition-all"
            >
              <Plus className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
              <span>Add Expense</span>
            </button>
          </div>

          {/* Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs 2xl:text-sm text-slate-300">
                <thead className="bg-black/30 text-[10px] 2xl:text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-white/10">
                  <tr>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Date</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Description</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Category</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Paid By</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Sinking Fund Status</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5 text-right">Amount</th>
                    <th className="py-3 2xl:py-3.5 px-4 2xl:px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 2xl:py-12 text-slate-400">
                        No expenses match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => {
                      const isFunded = exp.fundedBySinkingFund || exp.paidBy === 'sinking_fund';

                      return (
                        <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 font-mono text-slate-400 whitespace-nowrap">
                            {exp.date}
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5">
                            <div className="font-semibold text-white">{exp.description}</div>
                            {exp.notes && (
                              <div className="text-[10px] 2xl:text-xs text-slate-400 truncate max-w-xs">
                                {exp.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 whitespace-nowrap">
                            <span
                              className="px-2 2xl:px-2.5 py-0.5 rounded-full text-[10px] 2xl:text-xs font-semibold uppercase tracking-wider"
                              style={{
                                backgroundColor: `${TRIP_CAT_COLORS[exp.category]}20`,
                                color: TRIP_CAT_COLORS[exp.category],
                                border: `1px solid ${TRIP_CAT_COLORS[exp.category]}40`,
                              }}
                            >
                              {exp.category}
                            </span>
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 whitespace-nowrap">
                            {exp.paidBy === 'bunny' && (
                              <span className="flex items-center gap-1.5 text-rose-300 font-medium">
                                <span>🐰</span> Bunny
                              </span>
                            )}
                            {exp.paidBy === 'monkey' && (
                              <span className="flex items-center gap-1.5 text-teal-300 font-medium">
                                <span>🐵</span> Monkey
                              </span>
                            )}
                            {exp.paidBy === 'joint' && (
                              <span className="flex items-center gap-1.5 text-indigo-300 font-medium">
                                <span>🤝</span> Joint
                              </span>
                            )}
                            {exp.paidBy === 'sinking_fund' && (
                              <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                                <span>🏦</span> Sinking Fund
                              </span>
                            )}
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleSinkingFundCoverage(exp.id)}
                              title="Click to toggle Sinking Fund funding"
                              className={`flex items-center space-x-1.5 px-2.5 2xl:px-3 py-1 rounded-full text-[10px] 2xl:text-xs font-semibold transition-all ${
                                isFunded
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                              }`}
                            >
                              {isFunded ? (
                                <>
                                  <Check className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 text-emerald-400" />
                                  <span>Covered by Fund</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 text-amber-400" />
                                  <span>Out-of-Pocket</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 font-mono font-bold text-white text-right whitespace-nowrap">
                            {formatCurrencyExact(exp.totalCost)}
                          </td>
                          <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Delete expense"
                            >
                              <Trash2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Charts & Breakdown */}
        <div className="space-y-6">
          {/* Category Breakdown Donut */}
          <div className="p-5 2xl:p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md space-y-4">
            <h3 className="text-sm 2xl:text-base font-bold text-white flex items-center justify-between">
              <span>Category Breakdown</span>
              <span className="text-xs 2xl:text-sm text-slate-400 font-mono">
                {donutItems.length} Categories
              </span>
            </h3>

            {donutItems.length > 0 ? (
              <CategoryDonutChart
                items={donutItems}
                totalLabel="Total Spent"
                currency="CAD"
              />
            ) : (
              <div className="py-8 text-center text-xs 2xl:text-sm text-slate-400">
                No categorized spend logged yet.
              </div>
            )}
          </div>

          {/* Funding Source Breakdown */}
          <div className="p-5 2xl:p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md space-y-3">
            <h3 className="text-sm 2xl:text-base font-bold text-white">Funding &amp; Card Allocation</h3>
            <div className="space-y-2 text-xs 2xl:text-sm">
              <div className="flex justify-between items-center p-2.5 2xl:p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <span>🏦</span> Sinking Fund Covered
                </span>
                <span className="font-mono font-bold text-emerald-200">
                  {formatCurrency(trackingInfo.totalCoveredBySinkingFund)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 2xl:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="flex items-center gap-1.5 text-rose-300 font-semibold">
                  <span>🐰</span> Carded by Bunny
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {formatCurrency(trackingInfo.paidByBunny)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 2xl:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="flex items-center gap-1.5 text-teal-300 font-semibold">
                  <span>🐵</span> Carded by Monkey
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {formatCurrency(trackingInfo.paidByMonkey)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 2xl:p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                  <span>🤝</span> Joint Card / Account
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {formatCurrency(trackingInfo.paidByJoint)}
                </span>
              </div>
            </div>
            <p className="text-[11px] 2xl:text-xs text-slate-400 italic">
              * Remember: Carded amounts are logged for tracking and can be drawn anytime from the Vacation Sinking Fund.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Add Expense */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plane className="w-4 h-4 text-teal-400" />
                Log Trip Expense
              </h3>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Category</label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as TripCategory)}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="Flights">Flights</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Dining">Dining</option>
                    <option value="Transit">Transit</option>
                    <option value="Activities">Activities</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Misc">Misc</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Shinkansen tickets, Ryokan onsen dinner"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Total Cost (CAD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expCost}
                    onChange={(e) => setExpCost(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Paid By (Card/Account)</label>
                  <select
                    value={expPaidBy}
                    onChange={(e) => {
                      const val = e.target.value as TripPayer;
                      setExpPaidBy(val);
                      if (val === 'sinking_fund') setExpFundedByFund(true);
                    }}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="bunny">🐰 Bunny</option>
                    <option value="monkey">🐵 Monkey</option>
                    <option value="joint">🤝 Joint Card</option>
                    <option value="sinking_fund">🏦 Direct from Sinking Fund</option>
                  </select>
                </div>
              </div>

              {/* Sinking Fund Checkbox */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Cover from Sinking Fund?</div>
                  <div className="text-[11px] text-slate-400">
                    Links to {vacationFund?.name || 'Vacation Sinking Fund'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={expFundedByFund || expPaidBy === 'sinking_fund'}
                  onChange={(e) => setExpFundedByFund(e.target.checked)}
                  disabled={expPaidBy === 'sinking_fund'}
                  className="w-4 h-4 rounded text-teal-500 focus:ring-0 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Reserved seats with luggage space"
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-teal-500/20"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Sinking Fund Reimbursement */}
      {showSinkingFundReimburseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Reimburse from Sinking Fund
              </h3>
              <button
                onClick={() => setShowSinkingFundReimburseModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Select the out-of-pocket expenses to cover and pay from your Vacation Sinking Fund:
              </p>

              <div>
                <label className="block text-slate-400 mb-1">Target Sinking Fund</label>
                <select
                  value={selectedSinkingFundId}
                  onChange={(e) => setSelectedSinkingFundId(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:border-teal-500 focus:outline-none"
                >
                  {state.sinkingFunds.map((sf) => (
                    <option key={sf.id} value={sf.id}>
                      {sf.name} ({formatCurrency(sf.currentBalance)} available)
                    </option>
                  ))}
                </select>
              </div>

              {/* Expense Selection List */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-white/10 rounded-xl p-2 bg-black/20">
                {outOfPocketExpenses.map((exp) => {
                  const isChecked = selectedExpenseIds.includes(exp.id);
                  return (
                    <div
                      key={exp.id}
                      onClick={() => {
                        setSelectedExpenseIds((prev) =>
                          isChecked ? prev.filter((id) => id !== exp.id) : [...prev, exp.id]
                        );
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-teal-500/15 border-teal-500/40 text-white'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container click
                          className="w-4 h-4 rounded text-teal-500 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <div className="font-semibold text-white">{exp.description}</div>
                          <div className="text-[10px] text-slate-400">
                            {exp.date} • Paid by {exp.paidBy}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-white">
                        {formatCurrencyExact(exp.totalCost)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Total Summary to Reimburse */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex justify-between items-center">
                <span className="text-emerald-300 font-semibold">Total to Reimburse:</span>
                <span className="text-lg font-bold font-mono text-emerald-200">
                  {formatCurrencyExact(
                    outOfPocketExpenses
                      .filter((e) => selectedExpenseIds.includes(e.id))
                      .reduce((sum, e) => sum + e.totalCost, 0)
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowSinkingFundReimburseModal(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedExpenseIds.length === 0}
                onClick={handleExecuteReimbursement}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20"
              >
                Confirm Reimbursement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: New Trip */}
      {showNewTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plane className="w-4 h-4 text-teal-400" />
                Create New Trip
              </h3>
              <button
                onClick={() => setShowNewTripModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTrip} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Trip Name</label>
                <input
                  type="text"
                  placeholder="e.g. Hawaii Summer Getaway 2027"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Destination</label>
                <input
                  type="text"
                  placeholder="e.g. Maui, Hawaii"
                  value={tripDest}
                  onChange={(e) => setTripDest(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={tripStart}
                    onChange={(e) => setTripStart(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={tripEnd}
                    onChange={(e) => setTripEnd(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Total Trip Budget (CAD)</label>
                <input
                  type="number"
                  placeholder="e.g. 6000"
                  value={tripBudget}
                  onChange={(e) => setTripBudget(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNewTripModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-teal-500/20"
                >
                  Create Trip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Trip Confirmation */}
      {tripToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Trip</h3>
                <p className="text-xs text-rose-300/80">Permanent removal</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-semibold">"{tripToDelete.name}"</strong>?
              All <strong className="text-rose-300 font-semibold">{state.tripExpenses.filter(e => e.tripId === tripToDelete.id).length} recorded expense(s)</strong> logged under this trip will be permanently removed.
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTrip(tripToDelete.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Trip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Manage Trips */}
      {showManageTripsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Manage Trips ({state.trips.length})</h3>
                  <p className="text-[11px] text-slate-400">Review, switch between, or delete family trips</p>
                </div>
              </div>
              <button
                onClick={() => setShowManageTripsModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Trips List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1">
              {state.trips.map((t) => {
                const expCount = state.tripExpenses.filter((e) => e.tripId === t.id).length;
                const tripSpend = state.tripExpenses
                  .filter((e) => e.tripId === t.id)
                  .reduce((sum, e) => sum + e.totalCost, 0);
                const isSelected = t.id === activeTrip.id;

                return (
                  <div
                    key={t.id}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? 'bg-teal-500/10 border-teal-500/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{t.name}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-teal-500/20 text-teal-300 font-bold px-2 py-0.5 rounded-full border border-teal-500/30">
                            Active Trip
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {t.destination}
                        </span>
                        <span>•</span>
                        <span className="font-mono">Budget: {formatCurrency(t.budget)}</span>
                        <span>•</span>
                        <span>{expCount} expenses ({formatCurrency(tripSpend)} spent)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!isSelected && (
                        <button
                          onClick={() => {
                            onUpdateState((prev) => ({ ...prev, activeTripId: t.id }));
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          Select
                        </button>
                      )}
                      <button
                        onClick={() => setTripToDelete(t)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                        title={`Delete "${t.name}"`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {state.trips.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No trips configured yet.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-white/10">
              {state.trips.some((t) => t.id === 'trip-1' || t.id === 'trip-2') ? (
                <button
                  type="button"
                  onClick={handleDeleteAllSampleTrips}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Example Trips</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRestoreSampleTrips}
                  className="text-xs text-teal-400 hover:text-teal-300 hover:underline font-medium"
                >
                  Restore Example Trips
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowManageTripsModal(false);
                    setShowNewTripModal(true);
                  }}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1 shadow-md shadow-teal-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Trip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageTripsModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
