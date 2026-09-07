import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection (compatible with Vite & Vercel)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Checks whether valid Supabase credentials have been configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseUrl !== 'https://your-project.supabase.co' &&
      supabaseAnonKey !== 'your-anon-key' &&
      supabaseUrl.startsWith('https://')
  );
}

// Fallback dummy client if credentials are missing to prevent runtime crashes during initial setup
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(
  supabaseUrl && supabaseUrl.startsWith('https://') ? supabaseUrl : fallbackUrl,
  supabaseAnonKey || fallbackKey,
  {
    auth: {
      persistSession: false, // Ensure no local storage persistence is used for sessions
      autoRefreshToken: false,
    },
  }
);
