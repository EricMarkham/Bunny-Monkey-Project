import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  Save,
  RotateCcw,
  CheckCircle2,
  HardDrive,
  Clock,
  Trash2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { HouseholdState } from '../types';
import {
  exportStateToFile,
  importStateFromFile,
  requestPersistentStorage,
  saveSnapshot,
  getSnapshots,
  deleteSnapshot,
  StateSnapshot,
} from '../utils/storage';

interface StoragePersistenceModalProps {
  state: HouseholdState;
  onRestoreState: (state: HouseholdState) => void;
  onClose: () => void;
}

export function StoragePersistenceModal({
  state,
  onRestoreState,
  onClose,
}: StoragePersistenceModalProps) {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [storageUsage, setStorageUsage] = useState<string>('');
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check browser persistent storage
    requestPersistentStorage().then((res) => {
      setIsPersisted(res.isPersisted);
      if (res.usage !== undefined) {
        const kb = (res.usage / 1024).toFixed(1);
        setStorageUsage(`${kb} KB`);
      }
    });

    setSnapshots(getSnapshots());
  }, []);

  const handleSaveSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;
    const updated = saveSnapshot(snapshotName, state);
    setSnapshots(updated);
    setSnapshotName('');
    setStatusMsg('Point-in-time snapshot saved successfully!');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleRestoreSnapshot = (snap: StateSnapshot) => {
    if (
      window.confirm(
        `Are you sure you want to restore the snapshot "${snap.name}" from ${new Date(
          snap.timestamp
        ).toLocaleDateString()}?`
      )
    ) {
      onRestoreState(snap.state);
      setStatusMsg(`Restored to snapshot "${snap.name}"`);
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleDeleteSnapshot = (id: string) => {
    const updated = deleteSnapshot(id);
    setSnapshots(updated);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importStateFromFile(file);
      onRestoreState(imported);
      setStatusMsg('File backup restored successfully!');
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      alert('Failed to import backup file. Please ensure it is a valid household JSON export.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Data Persistence &amp; Backup Vault
              </h2>
              <p className="text-xs text-slate-400">
                Persistent local storage across browser refreshes, reboots, and offline backups
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Status banner */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-white">Browser Persistence Engine:</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE &amp; AUTO-SAVING
              </span>
            </div>
            {storageUsage && (
              <span className="font-mono text-slate-400 text-[11px]">
                Vault size: {storageUsage}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All modifications to your <strong>Joint Budget</strong>, <strong>Actuals</strong>,{' '}
            <strong>Statement Ledger</strong>, <strong>Trip Expenses</strong>, and{' '}
            <strong>Piggy/Bunny/Monkey Dividend Portfolios</strong> are synchronously synced to
            LocalStorage and persistent IndexedDB. Your inputs survive page refreshes, tab closures,
            and computer reboots.
          </p>
        </div>

        {statusMsg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* File Backup & Restore Actions */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-teal-400" />
            Hard Drive Backups (JSON File)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => exportStateToFile(state)}
              className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group flex items-start space-x-3"
            >
              <Download className="w-5 h-5 text-teal-400 mt-0.5 group-hover:translate-y-0.5 transition-transform" />
              <div>
                <div className="font-bold text-sm text-white">Download Offline Backup</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Save full database as a portable .json file onto your computer drive
                </div>
              </div>
            </button>

            <label className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group flex items-start space-x-3 cursor-pointer">
              <Upload className="w-5 h-5 text-indigo-400 mt-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <div>
                <div className="font-bold text-sm text-white">Restore from File</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Load a previously exported .json file into the app
                </div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </label>
          </div>
        </div>

        {/* Point-in-Time Snapshots */}
        <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-400" />
              Named In-Browser Snapshots
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {snapshots.length} saved
            </span>
          </div>

          <form onSubmit={handleSaveSnapshot} className="flex gap-2 text-xs">
            <input
              type="text"
              placeholder="e.g. Before Tokyo Trip, Q3 Dividend Rebalance..."
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!snapshotName.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Snapshot</span>
            </button>
          </form>

          {snapshots.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{snap.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(snap.timestamp).toLocaleString()} • {snap.state.holdings?.length || 0} holdings • {snap.state.expenses?.length || 0} expenses
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleRestoreSnapshot(snap)}
                      className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-bold rounded-lg border border-teal-500/30 transition-all flex items-center gap-1 text-[11px]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSnapshot(snap.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete snapshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              No point-in-time snapshots created yet. Name and save one above anytime before making major changes.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-xl transition-all"
          >
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
}
