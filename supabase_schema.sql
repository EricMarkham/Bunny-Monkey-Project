-- ==============================================================================
-- Bunny & Monkey Dual-Earner Household Co-Op - Supabase Database Schema
-- Run this in your Supabase SQL Editor to provision all tables and security policies.
-- ==============================================================================

-- 1. Household Unified State Table
CREATE TABLE IF NOT EXISTS public.household_state (
    id TEXT PRIMARY KEY DEFAULT 'current_household_state',
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Equity & Dividend Holdings Table
CREATE TABLE IF NOT EXISTS public.holdings (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    owner TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CAD',
    shares NUMERIC NOT NULL DEFAULT 0,
    avg_cost_per_share NUMERIC NOT NULL DEFAULT 0,
    current_price NUMERIC NOT NULL DEFAULT 0,
    annual_dividend_per_share NUMERIC NOT NULL DEFAULT 0,
    payout_frequency TEXT DEFAULT 'Quarterly',
    payout_months JSONB DEFAULT '[3,6,9,12]'::jsonb,
    next_ex_dividend_date TEXT,
    next_pay_date TEXT,
    sector TEXT DEFAULT 'Financial Services',
    drip_enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Statement Transactions Table (Supported as both statement_transactions and transactions)
CREATE TABLE IF NOT EXISTS public.statement_transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    statement_period TEXT,
    merchant TEXT NOT NULL,
    raw_category TEXT,
    assigned_category TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    partner TEXT NOT NULL DEFAULT 'joint',
    carbon_estimate_kg NUMERIC DEFAULT 0,
    eco_category TEXT DEFAULT 'Neutral',
    eco_tip TEXT,
    is_recurring BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    statement_period TEXT,
    merchant TEXT NOT NULL,
    raw_category TEXT,
    assigned_category TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    partner TEXT NOT NULL DEFAULT 'joint',
    carbon_estimate_kg NUMERIC DEFAULT 0,
    eco_category TEXT DEFAULT 'Neutral',
    eco_tip TEXT,
    is_recurring BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Monthly Household Expenses Budget Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    is_fixed BOOLEAN DEFAULT true,
    monthly_amount NUMERIC NOT NULL DEFAULT 0,
    split_method TEXT NOT NULL DEFAULT 'proportional',
    custom_bunny_percent NUMERIC,
    custom_monkey_percent NUMERIC,
    fixed_payer TEXT,
    fixed_amount NUMERIC,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Sinking Funds Table
CREATE TABLE IF NOT EXISTS public.sinking_funds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    current_balance NUMERIC NOT NULL DEFAULT 0,
    target_balance NUMERIC NOT NULL DEFAULT 0,
    monthly_contribution NUMERIC NOT NULL DEFAULT 0,
    target_date TEXT,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Travel & Trips Tables
CREATE TABLE IF NOT EXISTS public.trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    budget NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.trip_expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    total_cost NUMERIC NOT NULL DEFAULT 0,
    paid_by TEXT NOT NULL,
    split_ratio TEXT DEFAULT '50/50',
    custom_bunny_percent NUMERIC,
    custom_monkey_percent NUMERIC,
    funded_by_sinking_fund BOOLEAN DEFAULT false,
    sinking_fund_id TEXT,
    reimbursed_amount NUMERIC,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.trip_settlements (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    payer TEXT NOT NULL,
    receiver TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    note TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Point-in-Time Snapshots Table
CREATE TABLE IF NOT EXISTS public.household_snapshots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    state JSONB NOT NULL
);

-- 8. Application Settings Table (for Partner Incomes & Household Configurations)
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.household_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sinking_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow read/write access via anon key for the household application
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Household State') THEN
        CREATE POLICY "Public Access Household State" ON public.household_state FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Holdings') THEN
        CREATE POLICY "Public Access Holdings" ON public.holdings FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Statement Transactions') THEN
        CREATE POLICY "Public Access Statement Transactions" ON public.statement_transactions FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Transactions Table') THEN
        CREATE POLICY "Public Access Transactions Table" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Expenses') THEN
        CREATE POLICY "Public Access Expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Sinking Funds') THEN
        CREATE POLICY "Public Access Sinking Funds" ON public.sinking_funds FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Trips') THEN
        CREATE POLICY "Public Access Trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Trip Expenses') THEN
        CREATE POLICY "Public Access Trip Expenses" ON public.trip_expenses FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Trip Settlements') THEN
        CREATE POLICY "Public Access Trip Settlements" ON public.trip_settlements FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Snapshots') THEN
        CREATE POLICY "Public Access Snapshots" ON public.household_snapshots FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Settings') THEN
        CREATE POLICY "Public Access Settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
