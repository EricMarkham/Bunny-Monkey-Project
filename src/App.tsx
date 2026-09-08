import React, { useState, useEffect } from 'react';
import { initialHouseholdState } from './data/initialData';
import { HouseholdState, Partner, TabType } from './types';
import { Navbar } from './components/Navbar';
import { BudgetModule } from './components/BudgetModule';
import { BudgetVsActualsDashboard } from './components/BudgetVsActualsDashboard';
import { StatementParserModule } from './components/StatementParserModule';
import { DividendTrackerModule } from './components/DividendTrackerModule';
import { HouseholdEntryGate } from './components/HouseholdEntryGate';
import {
  saveHouseholdState,
  sanitizeAndMigrateState,
  isSupabaseConfigured,
} from './utils/storage';
import {
  fetchHouseholdStateFromSupabase,
  updatePartnerIncomesInSupabase,
} from './services/supabaseService';

export default function App() {
  // Household Entry Gate Access State (Secure memory-only session)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Household Financial State: initialized from memory, dynamically hydrated from Supabase on mount
  const [state, setState] = useState<HouseholdState>(initialHouseholdState);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<TabType>('budget');

  // Set document title explicitly
  useEffect(() => {
    document.title = 'Bunny & Monkey Family Budget Tool';
  }, []);

  // Dynamically fetch fresh state from Supabase on load
  useEffect(() => {
    let isMounted = true;
    setIsLoadingFromSupabase(true);

    fetchHouseholdStateFromSupabase()
      .then(({ state: remoteState, isLiveSupabase }) => {
        if (isMounted) {
          setState(remoteState);
          setIsSupabaseConnected(isLiveSupabase || isSupabaseConfigured());
          setIsLoadingFromSupabase(false);
        }
      })
      .catch((err) => {
        console.warn('Initial Supabase hydration error', err);
        if (isMounted) {
          setIsLoadingFromSupabase(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync state directly to Supabase backend on state modifications
  useEffect(() => {
    if (!isLoadingFromSupabase) {
      saveHouseholdState(state);
    }
  }, [state, isLoadingFromSupabase]);

  // Export JSON backup
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bunny_monkey_budget_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import JSON backup
  const handleImportJSON = (importedData: HouseholdState) => {
    const sanitized = sanitizeAndMigrateState(importedData);
    setState(sanitized);
    saveHouseholdState(sanitized);
  };

  // Update Partner Info
  const handleUpdatePartner = (partnerKey: 'bunny' | 'monkey', updated: Partial<Partner>) => {
    setState((prev) => {
      const updatedPartners = {
        ...prev.partners,
        [partnerKey]: {
          ...prev.partners[partnerKey],
          ...updated,
        },
      };
      // Immediately execute Supabase update
      updatePartnerIncomesInSupabase(updatedPartners);
      return {
        ...prev,
        partners: updatedPartners,
      };
    });
  };

  // Lock / Sign out of Household session
  const handleLock = () => {
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
        onUpdatePartner={handleUpdatePartner}
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
            onUpdateState={setState}
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

        {activeTab === 'dividends' && (
          <DividendTrackerModule state={state} onUpdateState={setState} />
        )}
      </main>

      {/* Frosted Glass Footer */}
      <footer className="relative z-10 border-t border-white/10 py-5 2xl:py-6 text-center text-xs 2xl:text-sm text-slate-400 bg-white/5 backdrop-blur-md mt-auto">
        <div className="max-w-[2000px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-200 2xl:text-base">🐰 Bunny &amp; 🐵 Monkey Family Budget Tool</span>
            <span className="text-white/20">•</span>
            <div className="flex items-center gap-1.5 text-[10px] 2xl:text-xs uppercase tracking-wider text-emerald-400 font-semibold">
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-400'}`} />
              {isSupabaseConnected ? 'Cloud Sync Active' : 'Cloud Sync Ready'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] 2xl:text-xs text-slate-400">
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
              TFSA / RRSP / RESP
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
