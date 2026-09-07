import React, { useState, useRef, useEffect } from 'react';
import { Lock, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const HOUSEHOLD_AUTH_KEY = 'household_authenticated';
export const HOUSEHOLD_PASSCODE = '1105';

interface HouseholdEntryGateProps {
  onAuthenticated: () => void;
}

export function HouseholdEntryGate({ onAuthenticated }: HouseholdEntryGateProps) {
  const [passcode, setPasscode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPasscode = passcode.trim();

    if (cleanPasscode === HOUSEHOLD_PASSCODE) {
      setErrorMsg('');
      try {
        localStorage.setItem(HOUSEHOLD_AUTH_KEY, 'true');
      } catch (err) {
        console.error('Error writing auth to localStorage', err);
      }
      onAuthenticated();
    } else {
      setErrorMsg('Incorrect passcode. Please try again.');
      setIsShaking(true);
      setPasscode('');
      setTimeout(() => {
        setIsShaking(false);
        inputRef.current?.focus();
      }, 400);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Frosted Glass Ambient Gradient Glow Orbs */}
      <div className="fixed inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500 blur-[120px]" />
        <div className="absolute top-[35%] right-[15%] w-[40%] h-[40%] rounded-full bg-rose-600/30 blur-[140px]" />
        <div className="absolute bottom-[20%] left-[10%] w-[35%] h-[35%] rounded-full bg-sky-600/20 blur-[140px]" />
      </div>

      {/* Minimalist Centered Entry Gate Card */}
      <div
        className={`relative z-10 w-full max-w-sm bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-3xl p-7 sm:p-8 shadow-2xl shadow-black/60 transition-transform ${
          isShaking ? 'animate-shake border-rose-500/50' : ''
        }`}
      >
        {/* Avatars Header */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className="flex items-center -space-x-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-rose-400 to-indigo-500 border-2 border-white/20 flex items-center justify-center text-xl shadow-lg shadow-rose-500/20">
              🐰
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-400 border-2 border-white/20 flex items-center justify-center text-xl shadow-lg shadow-teal-500/20">
              🐵
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-semibold text-indigo-300 uppercase tracking-widest mb-1.5">
              <Lock className="w-3 h-3 text-indigo-400" />
              <span>Household Entry</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Household Passcode
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Restricted to Bunny &amp; Monkey Co-Op
            </p>
          </div>
        </div>

        {/* Passcode Entry Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="household-passcode-input"
              className="block text-xs font-medium text-slate-300 mb-1.5 text-left"
            >
              Enter Passcode
            </label>
            <div className="relative">
              <input
                id="household-passcode-input"
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                placeholder="••••"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className={`w-full px-4 py-3 pr-11 bg-slate-950/70 border rounded-2xl text-slate-100 placeholder-slate-500 text-center font-mono text-lg tracking-widest focus:outline-none transition-all shadow-inner ${
                  errorMsg
                    ? 'border-rose-500/70 focus:border-rose-400 focus:ring-1 focus:ring-rose-400'
                    : 'border-white/15 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 transition-colors"
                title={showPassword ? 'Hide passcode' : 'Show passcode'}
                aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="text-xs text-rose-400 font-medium py-1 px-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center animate-fade-in">
              {errorMsg}
            </div>
          )}

          {/* Submit Enter Button */}
          <button
            id="enter-passcode-button"
            type="submit"
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-400 hover:to-teal-400 text-white font-semibold rounded-2xl text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 group cursor-pointer active:scale-[0.98]"
          >
            <span>Enter</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        {/* Card Footer Note */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Dual-Earner Session</span>
          </div>
        </div>
      </div>
    </div>
  );
}
