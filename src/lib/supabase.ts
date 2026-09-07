import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection (compatible with Vite, Vercel & Node)
const getEnvVar = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return String(import.meta.env[key]).trim();
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return String(process.env[key]).trim();
    }
  } catch {}
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const isValidSupabaseUrl = (url: unknown): url is string => {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Checks whether valid Supabase credentials have been configured
 */
export function isSupabaseConfigured(): boolean {
  return (
    isValidSupabaseUrl(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseAnonKey !== 'your-anon-key' &&
    supabaseAnonKey !== 'placeholder-anon-key'
  );
}

// Fallback dummy client if credentials are missing or invalid to prevent crashes during Vercel builds or initial setup
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'placeholder-anon-key';

const clientUrl = isValidSupabaseUrl(supabaseUrl) ? supabaseUrl : fallbackUrl;
const clientKey = supabaseAnonKey && supabaseAnonKey.trim() !== '' ? supabaseAnonKey : fallbackKey;

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: false, // Ensure zero localStorage persistence is used for sessions
    autoRefreshToken: false,
  },
});

