import React, { useState, useEffect } from 'react';
import { initialHouseholdState } from './data/initialData';
import { HouseholdState, Partner } from './types';
import { Navbar } from './components/Navbar';
import { BudgetModule } from './components/BudgetModule';
import { BudgetVsActualsDashboard } from './components/BudgetVsActualsDashboard';
import { TripSettlementModule } from './components/TripSettlementModule';
import { StatementParserModule } from './components/StatementParserModule';
import { DividendTrackerModule } from './components/DividendTrackerModule';
import { StoragePersistenceModal } from './components/StoragePersistenceModal';
import { HouseholdEntryGate, HOUSEHOLD_AUTH_KEY } from './components/HouseholdEntryGate';
import {
  saveHouseholdState,
  loadHouseholdState,
  sanitizeAndMigrateState,
  LOCAL_STORAGE_KEY,
} from './utils/storage';

export default function App() {
  // Household Entry Gate Access State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HOUSEHOLD_AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [state, setState] = useState<HouseholdState>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return sanitizeAndMigrateState(parsed);
      }
    } catch (e) {
      console.error('Error loading saved household state from localStorage', e);
    }
    return initialHouseholdState;
  });

  const [activeTab, setActiveTab] = useState<'budget' | 'actuals' | 'trips' | 'statement' | 'dividends'>('budget');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);

  // Hydrate from IndexedDB on initial mount if local storage was empty
  useEffect(() => {
    const hasLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!hasLocal) {
      loadHouseholdState().then((persistedState) => {
        if (persistedState) {
          setState(persistedState);
        }
      });
    }
  }, []);

  // Multi-tier auto-save to LocalStorage + IndexedDB on every state modification
  useEffect(() => {
    saveHouseholdState(state);
  }, [state]);

  // Export JSON backup
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bunny_monkey_finance_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import JSON backup
  const handleImportJSON = (importedData: HouseholdState) => {
    setState(sanitizeAndMigrateState(importedData));
  };

  // Reset to default demo data
  const handleResetDemo = () => {
    setState(initialHouseholdState);
    setShowResetConfirm(false);
  };

  // Update Partner Info
  const handleUpdatePartner = (partnerKey: 'bunny' | 'monkey', updated: Partial<Partner>) => {
    setState((prev) => ({
      ...prev,
      partners: {
        ...prev.partners,
        [partnerKey]: {
          ...prev.partners[partnerKey],
          ...updated,
        },
      },
    }));
  };

  // Lock / Sign out of Household session
  const handleLock = () => {
    try {
      localStorage.removeItem(HOUSEHOLD_AUTH_KEY);
    } catch (e) {
      console.error('Error clearing auth from localStorage', e);
    }
    setIsAuthenticated(false);
  };

  // Full-Screen Entry Gate: completely block and do not render any dashboard, navigation, or financial views if unauthenticated
  if (!isAuthenticated) {
    return (
      <HouseholdEntryGate
        onAuthenticated={() => setIsAuthenticated(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Frosted Glass Ambient Gradient Glow Orbs */}
      <div className="fixed inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500 blur-[120px]" />
        <div className="absolute top-[35%] right-[15%] w-[40%] h-[40%] rounded-full bg-rose-600/30 blur-[140px]" />
        <div className="absolute bottom-[20%] left-[10%] w-[35%] h-[35%] rounded-full bg-sky-600/20 blur-[140px]" />
      </div>

      {/* Top Navbar with Bunny & Monkey Branding & Master KPIs */}
      <Navbar
        state={state}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onResetDemo={() => setShowResetConfirm(true)}
        onUpdatePartner={handleUpdatePartner}
        onOpenStorageModal={() => setShowStorageModal(true)}
        onLock={handleLock}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-[2000px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 pt-6 sm:pt-8 2xl:pt-10">
        {activeTab === 'budget' && (
          <BudgetModule
            state={state}
            onUpdateState={setState}
            onNavigateToActuals={() => setActiveTab('actuals')}
          />
        )}

        {activeTab === 'actuals' && (
          <BudgetVsActualsDashboard
            state={state}
            onNavigateToStatements={() => setActiveTab('statement')}
            onNavigateToBudget={() => setActiveTab('budget')}
          />
        )}

        {activeTab === 'statement' && (
          <StatementParserModule
            state={state}
            onUpdateState={setState}
            onNavigateToActuals={() => setActiveTab('actuals')}
          />
        )}

        {activeTab === 'trips' && (
          <TripSettlementModule state={state} onUpdateState={setState} />
        )}

        {activeTab === 'dividends' && (
          <DividendTrackerModule state={state} onUpdateState={setState} />
        )}
      </main>

      {/* Frosted Glass Footer */}
      <footer className="relative z-10 border-t border-white/10 py-5 2xl:py-6 text-center text-xs 2xl:text-sm text-slate-400 bg-white/5 backdrop-blur-md mt-auto">
        <div className="max-w-[2000px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-200 2xl:text-base">🐰 Bunny &amp; 🐵 Monkey Co-Op</span>
            <span className="text-white/20">•</span>
            <button
              onClick={() => setShowStorageModal(true)}
              className="flex items-center gap-1.5 text-[10px] 2xl:text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
              title="Click to view data persistence vault & backups"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              IndexedDB &amp; Local Storage Active (Reboot-Safe)
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] 2xl:text-xs text-slate-400">
            <button
              onClick={() => setShowStorageModal(true)}
              className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              Storage Vault &amp; Snapshots
            </button>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
              Dual-Earner OS
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
              TFSA / RRSP / RESP
            </span>
          </div>
        </div>
      </footer>

      {/* Storage Persistence & Backup Modal */}
      {showStorageModal && (
        <StoragePersistenceModal
          state={state}
          onRestoreState={(newState) => {
            setState(newState);
            setShowStorageModal(false);
          }}
          onClose={() => setShowStorageModal(false)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl max-w-sm w-full p-6 border border-white/20 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-2">
              Reset Demo Data?
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              This will restore the pre-populated dual-earner financial scenario for Bunny &amp; Monkey.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 border border-rose-400/50 text-white shadow-lg shadow-rose-600/20 transition-all"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
