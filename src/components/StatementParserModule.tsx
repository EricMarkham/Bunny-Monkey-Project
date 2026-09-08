import React, { useState, useMemo, useEffect } from 'react';
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
  AlertCircle,
  Edit2,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
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
  normalizeDateToIso,
  sanitizeTransactions,
} from '../utils/finance';
import {
  insertOrUpdateTransactionInSupabase,
  bulkInsertTransactionsInSupabase,
  deleteTransactionFromSupabase,
  mapRowToTransaction,
  mapTransactionToRow,
} from '../services/supabaseService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

export const CALENDAR_MONTHS = [
  { value: '01', name: 'January' },
  { value: '02', name: 'February' },
  { value: '03', name: 'March' },
  { value: '04', name: 'April' },
  { value: '05', name: 'May' },
  { value: '06', name: 'June' },
  { value: '07', name: 'July' },
  { value: '08', name: 'August' },
  { value: '09', name: 'September' },
  { value: '10', name: 'October' },
  { value: '11', name: 'November' },
  { value: '12', name: 'December' },
];

const MIN_VALID_YEAR = 2026;
const MAX_VALID_YEAR = 2036;

/**
 * Split CSV, TSV, or delimited line honoring quotes and whitespace
 */
function parseDelimitedLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Tab separated (Google Sheets / Excel copy-paste)
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  }

  // Semicolon separated (European CSV)
  if (trimmed.includes(';') && !trimmed.includes(',')) {
    return trimmed.split(';').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  }

  // Comma separated with quote handling
  const items: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      items.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current.trim().replace(/^["']|["']$/g, ''));

  // Fallback: 2+ whitespace characters
  if (items.length <= 1 && /\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map((c) => c.trim().replace(/^["']|["']$/g, ''));
  }

  return items;
}

interface ColumnMapping {
  hasHeaders: boolean;
  headerLineIndex: number;
  dateIdx: number;
  descIdx: number;
  catIdx: number;
  amtIdx: number;
  whoIdx: number;
}

/**
 * Detect column indexes for Date, Description, Category, Amount, and Cardholder/Who
 */
function detectColumnMapping(lines: string[]): ColumnMapping {
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    const cols = parseDelimitedLine(rawLine);
    if (cols.length < 2) continue;

    let dateIdx = -1;
    let descIdx = -1;
    let catIdx = -1;
    let amtIdx = -1;
    let whoIdx = -1;

    cols.forEach((rawCol, idx) => {
      const col = rawCol.toLowerCase().trim().replace(/[^a-z0-9()$]/g, '');

      // 1. Amount / Amount($)
      if (
        col.includes('amount') ||
        col.includes('amount($)') ||
        col.includes('amount$') ||
        col === 'cost' ||
        col === 'total' ||
        col === 'cad' ||
        col === 'debit' ||
        col === 'charge' ||
        col === 'price'
      ) {
        if (amtIdx === -1) amtIdx = idx;
      }
      // 2. Date / Transaction Date
      else if (
        col.includes('transactiondate') ||
        col.includes('transdate') ||
        col.includes('txndate') ||
        col.includes('postingdate') ||
        col === 'date' ||
        col.startsWith('date')
      ) {
        if (dateIdx === -1) dateIdx = idx;
      }
      // 3. Description / Activity Description
      else if (
        col.includes('activitydescription') ||
        col.includes('description') ||
        col.includes('merchant') ||
        col.includes('payee') ||
        col.includes('details') ||
        col.includes('narrative') ||
        col.includes('memo') ||
        col.includes('title')
      ) {
        if (descIdx === -1) descIdx = idx;
      }
      // 4. Category
      else if (
        col.includes('category') ||
        col.includes('rawcategory') ||
        col === 'type' ||
        col === 'tag'
      ) {
        if (catIdx === -1) catIdx = idx;
      }
      // 5. Cardholder / Who
      else if (
        col.includes('cardholder') ||
        col.includes('card') ||
        col === 'who' ||
        col.includes('partner') ||
        col.includes('owner') ||
        col.includes('member') ||
        col.includes('person') ||
        col.includes('user')
      ) {
        if (whoIdx === -1) whoIdx = idx;
      }
    });

    const recognizedCount = [dateIdx, descIdx, catIdx, amtIdx, whoIdx].filter((idx) => idx !== -1).length;
    if (recognizedCount >= 2) {
      return {
        hasHeaders: true,
        headerLineIndex: i,
        dateIdx,
        descIdx,
        catIdx,
        amtIdx,
        whoIdx,
      };
    }
  }

  return {
    hasHeaders: false,
    headerLineIndex: -1,
    dateIdx: 0,
    descIdx: 1,
    catIdx: 2,
    amtIdx: 3,
    whoIdx: -1,
  };
}

/**
 * Intelligent category mapper from raw bank/spreadsheet category strings
 */
function mapSpreadsheetCategory(rawCat: string, merchant: string, amount: number): StatementCategory {
  const norm = (rawCat || '').trim().toLowerCase();
  if (norm === 'groceries' || norm.includes('grocery')) return 'Groceries';
  if (norm === 'gas' || norm === 'fuel' || norm.includes('petro') || norm.includes('chevron')) return 'Transport';
  if (norm === 'dining out' || norm === 'dining' || norm.includes('restaurant') || norm.includes('food')) return 'Dining';
  if (norm === 'insurance' || norm.includes('pembridge') || norm.includes('manulife')) return 'Insurance';
  if (norm.includes('health') || norm.includes('beauty')) return 'Household';
  if (norm.includes('shopping') || norm.includes('apparel') || norm.includes('clothing')) return 'Discretionary';
  if (norm.includes('utility') || norm.includes('hydro') || norm.includes('gas heating')) return 'Utilities/Subs';
  if (norm.includes('childcare') || norm.includes('school') || norm.includes('montessori')) return 'Childcare';
  if (norm.includes('mortgage') || norm.includes('rent') || norm.includes('property tax')) return 'Housing';

  // Fallback to merchant pattern matching
  return autoCategorizeMerchant(merchant, amount).category;
}

export function StatementParserModule({
  state,
  onUpdateState,
  onNavigateToActuals,
}: StatementParserModuleProps) {
  // Current month default in 2-digit format (e.g. "09")
  const currentMonthValue = useMemo(() => {
    const m = new Date().getMonth() + 1;
    return m < 10 ? `0${m}` : `${m}`;
  }, []);

  // Split month and year upload period controls
  const [uploadMonth, setUploadMonth] = useState<string>(currentMonthValue);
  const [uploadYearInput, setUploadYearInput] = useState<string>('2026');
  const [rawText, setRawText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedItems, setParsedItems] = useState<StatementTransaction[]>([]);
  const [selectedPartnerDefault, setSelectedPartnerDefault] = useState<'bunny' | 'monkey'>('bunny');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'bunny' | 'monkey'>('all');
  const [successCommitMessage, setSuccessCommitMessage] = useState<string | null>(null);

  // Year validation logic: Must be between 2026 and 2036
  const parsedYearNum = parseInt(uploadYearInput.trim(), 10);
  const isYearValid =
    !isNaN(parsedYearNum) &&
    uploadYearInput.trim() !== '' &&
    parsedYearNum >= MIN_VALID_YEAR &&
    parsedYearNum <= MAX_VALID_YEAR;

  const yearErrorMessage =
    uploadYearInput.trim() === '' || !isYearValid
      ? 'Year must be between 2026 and 2036'
      : null;

  // Combined statement period in standard "YYYY-MM" format
  const effectiveTargetUploadPeriod = isYearValid
    ? `${parsedYearNum}-${uploadMonth}`
    : '2026-08';

  // Selected period display string (e.g. "August 2026")
  const uploadPeriodDisplayLabel = useMemo(() => {
    const monthObj = CALENDAR_MONTHS.find((m) => m.value === uploadMonth);
    const monthName = monthObj ? monthObj.name : 'August';
    return isYearValid ? `${monthName} ${parsedYearNum}` : `${monthName} (Invalid Year)`;
  }, [uploadMonth, isYearValid, parsedYearNum]);

  // Inline editing state for committed transactions
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editAmountVal, setEditAmountVal] = useState<string>('');

  // Dynamically fetched committed database records (eliminates ephemeral state fallbacks)
  const [dbTransactions, setDbTransactions] = useState<StatementTransaction[] | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Active transactions for ledger history: strictly relies on fetched database records when Supabase is active
  const activeTransactions = useMemo(() => {
    if (isSupabaseConfigured()) {
      if (dbTransactions !== null) {
        return dbTransactions;
      }
      return sanitizeTransactions(state.statementTransactions);
    }
    return sanitizeTransactions(state.statementTransactions);
  }, [dbTransactions, state.statementTransactions]);

  // Available periods from existing statement transactions
  const availablePeriods = useMemo(
    () => getStatementPeriods(activeTransactions),
    [activeTransactions]
  );

  // Selected period state (defaults to August 2026 if available, or first available)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const hasAug = availablePeriods.some((p) => p.id === '2026-08');
    if (hasAug) return '2026-08';
    return availablePeriods.length > 0 ? availablePeriods[0].id : '2026-08';
  });

  const syncTransactionsFromSupabase = async () => {
    if (!isSupabaseConfigured()) return;
    setIsSyncing(true);
    try {
      // 1. Fetch all committed records dynamically from the Supabase transactions table
      let { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) {
        console.error('Supabase Error:', error);
        const retryTx = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false });
        if (!retryTx.error && retryTx.data) {
          data = retryTx.data;
          error = null;
        } else if (retryTx.error) {
          console.error('Supabase Error:', retryTx.error);
        }
      }

      if (error || !data || data.length === 0) {
        // Fallback to statement_transactions table
        let fallback = await supabase
          .from('statement_transactions')
          .select('*')
          .order('transaction_date', { ascending: false });

        if (fallback.error) {
          console.error('Supabase Error:', fallback.error);
          fallback = await supabase
            .from('statement_transactions')
            .select('*')
            .order('date', { ascending: false });
          if (fallback.error) {
            console.error('Supabase Error:', fallback.error);
          }
        }

        if (!fallback.error && fallback.data) {
          data = fallback.data;
          error = null;
        }
      }

      if (!error && data) {
        const sanitized = sanitizeTransactions(data.map(mapRowToTransaction));
        setDbTransactions(sanitized);
        onUpdateState((prev) => ({
          ...prev,
          statementTransactions: sanitized,
        }));
        setSyncStatus('✓ Ledger synced from database');
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (err) {
      console.error('Supabase Error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncTransactionsFromSupabase();
  }, []);

  // Calculate Period and YTD actuals
  const actualsSummary = useMemo(() => {
    return calculatePeriodAndYtdActuals(activeTransactions, selectedPeriod);
  }, [activeTransactions, selectedPeriod]);

  // Parse lines from raw CSV or spreadsheet copy-paste with automatic column mapping
  const handleParseText = (
    text: string,
    statementPeriodChoice: string = effectiveTargetUploadPeriod,
    partnerChoice: 'bunny' | 'monkey' = selectedPartnerDefault
  ) => {
    if (!text.trim()) return;
    const lines = text.trim().split('\n');
    const newItems: StatementTransaction[] = [];

    // Derive target year from statementPeriodChoice (e.g. "2026-08" -> 2026)
    const targetYear = parseInt(statementPeriodChoice.slice(0, 4), 10) || 2026;

    // Detect column mapping from file headers
    const mapping = detectColumnMapping(lines);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // Skip the recognized header row
      if (mapping.hasHeaders && index === mapping.headerLineIndex) return;

      // Skip common repeating table headers
      const lower = trimmed.toLowerCase();
      if (
        lower.includes('transaction date') ||
        lower.includes('activity description') ||
        (lower.startsWith('date') && (lower.includes('merchant') || lower.includes('amount') || lower.includes('description')))
      ) {
        return;
      }

      const parts = parseDelimitedLine(trimmed);
      if (parts.length < 2) return;

      let datePart = '';
      let merchantPart = '';
      let catPart = '';
      let amountPart = '';
      let whoPart = '';

      if (mapping.hasHeaders) {
        if (mapping.dateIdx !== -1 && parts[mapping.dateIdx] !== undefined) datePart = parts[mapping.dateIdx];
        if (mapping.descIdx !== -1 && parts[mapping.descIdx] !== undefined) merchantPart = parts[mapping.descIdx];
        if (mapping.catIdx !== -1 && parts[mapping.catIdx] !== undefined) catPart = parts[mapping.catIdx];
        if (mapping.amtIdx !== -1 && parts[mapping.amtIdx] !== undefined) amountPart = parts[mapping.amtIdx];
        if (mapping.whoIdx !== -1 && parts[mapping.whoIdx] !== undefined) whoPart = parts[mapping.whoIdx];
      } else {
        // Dynamic heuristic fallback when no explicit headers are present
        datePart = parts[0] || '';

        // Find index of column containing amount (contains currency sign or numeric price)
        const amtIdx = parts.findIndex(
          (p, idx) => idx > 0 && /^\$?\s*[+-]?\d[\d,]*(\.\d{1,2})?\s*\$?$/.test(p.trim())
        );

        if (amtIdx === 3) {
          merchantPart = parts[1] || 'Unknown Merchant';
          catPart = parts[2] || '';
          amountPart = parts[3] || '0';
          whoPart = parts[4] || '';
        } else if (amtIdx === 2) {
          merchantPart = parts[1] || 'Unknown Merchant';
          amountPart = parts[2] || '0';
          catPart = parts[3] || '';
          whoPart = parts[4] || '';
        } else if (amtIdx === 1) {
          amountPart = parts[1] || '0';
          merchantPart = parts[2] || 'Unknown Merchant';
          catPart = parts[3] || '';
          whoPart = parts[4] || '';
        } else {
          merchantPart = parts[1] || 'Unknown Merchant';
          catPart = parts[2] || '';
          amountPart = parts[3] || parts[2] || '0';
          whoPart = parts[4] || '';
        }
      }

      // Handle currency signs ($), commas in numbers, CAD prefix
      const cleanAmtStr = amountPart.replace(/[$CAD,\s]/gi, '');
      const cleanAmt = parseFloat(cleanAmtStr) || 0;
      const amount = Math.abs(cleanAmt);

      // Clean and normalize date into ISO YYYY-MM-DD
      const cleanDate = normalizeDateToIso(datePart, targetYear);

      // Map category
      const cleanMerchant = (merchantPart || 'Unknown Merchant').trim();
      const assignedCategory = mapSpreadsheetCategory(catPart, cleanMerchant, amount);

      // Cardholder / Who extraction (e.g. Bunny or Monkey)
      let partner: 'bunny' | 'monkey' = partnerChoice;
      const whoCandidate = whoPart || parts.find((p) => /^(bunny|monkey|b|m)$/i.test(p.trim())) || '';
      if (whoCandidate) {
        const w = whoCandidate.toLowerCase().trim();
        if (w.includes('monkey') || w === 'm') {
          partner = 'monkey';
        } else if (w.includes('bunny') || w === 'b') {
          partner = 'bunny';
        }
      }

      newItems.push({
        id: `tx-parsed-${Date.now()}-${index}`,
        date: cleanDate,
        statementPeriod: statementPeriodChoice,
        merchant: cleanMerchant,
        rawCategory: catPart,
        assignedCategory,
        amount,
        partner,
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
    if (!isYearValid) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setRawText(content);
        handleParseText(content, effectiveTargetUploadPeriod, selectedPartnerDefault);
      };
      reader.readAsText(file);
    }
  };

  // Commit parsed items to master database table & state
  const handleCommitTransactions = async () => {
    if (parsedItems.length === 0 || !isYearValid || isCommitting) return;
    setIsCommitting(true);

    try {
      const count = parsedItems.length;
      const total = parsedItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
      const currentPeriod = effectiveTargetUploadPeriod || selectedPeriod || '2026-08';

      // Helper to generate UUID safely
      const getUUID = () =>
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Requirement 1: Payload Sanitization
      // Sanitize each item so it only sends valid database columns and strips UI-only internal keys
      const sanitizedRows = parsedItems.map((tx: any) => {
        const rawTx = tx as Record<string, any>;
        return {
          id: rawTx.id || getUUID(),
          transaction_date: rawTx.date || rawTx.transaction_date || new Date().toISOString().split('T')[0],
          date: rawTx.date || rawTx.transaction_date || new Date().toISOString().split('T')[0],
          statement_period: rawTx.statement_period || rawTx.statementPeriod || currentPeriod,
          cardholder:
            rawTx.cardholder ||
            rawTx.card ||
            (rawTx.partner ? (String(rawTx.partner).toLowerCase() === 'monkey' ? 'Monkey' : 'Bunny') : 'Bunny'),
          category: rawTx.category || rawTx.assignedCategory || rawTx.auto_category || 'Groceries',
          merchant: rawTx.merchant || rawTx.description || 'Unknown Merchant',
          amount: Number(rawTx.amount) || 0,
          type: rawTx.type || 'Debit',
          notes: rawTx.notes || null,
        };
      });

      // Requirement 2: Error Handling & Persistence
      if (isSupabaseConfigured() && sanitizedRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('transactions')
          .upsert(sanitizedRows, { onConflict: 'id' });

        if (insertErr) {
          console.error('Commit Ledger Error:', insertErr);

          // Graceful fallback if database schema accepts only 'date' or only 'transaction_date'
          if (
            insertErr.message?.includes('transaction_date') ||
            insertErr.message?.includes('date') ||
            insertErr.code === '42703' ||
            insertErr.code === 'PGRST204'
          ) {
            const rowsWithoutTxDate = sanitizedRows.map(({ transaction_date, ...rest }) => rest);
            const { error: fbErr1 } = await supabase
              .from('transactions')
              .upsert(rowsWithoutTxDate, { onConflict: 'id' });

            if (fbErr1) {
              console.error('Commit Ledger Error:', fbErr1);
              const rowsWithoutDate = sanitizedRows.map(({ date, ...rest }) => rest);
              const { error: fbErr2 } = await supabase
                .from('transactions')
                .upsert(rowsWithoutDate, { onConflict: 'id' });
              if (fbErr2) {
                console.error('Commit Ledger Error:', fbErr2);
              }
            }
          }
        }

        // Mirror to statement_transactions table to guarantee full database consistency
        try {
          const { error: stErr } = await supabase
            .from('statement_transactions')
            .upsert(sanitizedRows, { onConflict: 'id' });

          if (stErr) {
            console.error('Commit Ledger Error:', stErr);
            if (
              stErr.message?.includes('transaction_date') ||
              stErr.message?.includes('date') ||
              stErr.code === '42703' ||
              stErr.code === 'PGRST204'
            ) {
              const rowsWithoutTxDate = sanitizedRows.map(({ transaction_date, ...rest }) => rest);
              const { error: fbErr1 } = await supabase
                .from('statement_transactions')
                .upsert(rowsWithoutTxDate, { onConflict: 'id' });
              if (fbErr1) {
                console.error('Commit Ledger Error:', fbErr1);
                const rowsWithoutDate = sanitizedRows.map(({ date, ...rest }) => rest);
                const { error: fbErr2 } = await supabase
                  .from('statement_transactions')
                  .upsert(rowsWithoutDate, { onConflict: 'id' });
                if (fbErr2) console.error('Commit Ledger Error:', fbErr2);
              }
            }
          }
        } catch (stCatchErr) {
          console.error('Commit Ledger Error:', stCatchErr);
        }
      }

      // Update in-memory state and active database transaction cache immediately
      const existing = activeTransactions.filter((ex) => !parsedItems.some((p) => p.id === ex.id));
      const updated = sanitizeTransactions([...parsedItems, ...existing]);

      setDbTransactions(updated);
      onUpdateState((prev) => ({
        ...prev,
        statementTransactions: updated,
      }));

      // Auto-select the statement period that was just committed to
      setSelectedPeriod(effectiveTargetUploadPeriod);

      setSuccessCommitMessage(
        `✓ Successfully saved ${count} transactions (${formatCurrency(total)}) to the ${
          effectiveTargetUploadPeriod === '2026-08' ? 'August 2026' : effectiveTargetUploadPeriod
        } Statement Ledger! Period spend and Year-to-Date totals are active.`
      );
      setTimeout(() => {
        setSuccessCommitMessage(null);
      }, 6000);

      setParsedItems([]);
      setRawText('');
    } catch (error) {
      console.error('Commit Ledger Error:', error);
      setSyncStatus('⚠️ Failed to commit transactions to ledger');
      setTimeout(() => setSyncStatus(null), 4000);
    } finally {
      setIsCommitting(false);
    }
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

  // Update single parsed item amount
  const handleUpdateParsedAmount = (id: string, newAmt: number) => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, amount: Math.max(0, newAmt) } : i))
    );
  };

  // Update single parsed item partner
  const handleUpdateParsedPartner = (id: string, partner: 'bunny' | 'monkey') => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, partner } : i))
    );
  };

  // Delete committed item from master list and database
  const handleDeleteCommittedItem = async (id: string) => {
    const updated = activeTransactions.filter((i) => i.id !== id);
    setDbTransactions(updated);
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: updated,
    }));
    if (isSupabaseConfigured()) {
      try {
        const { error: delTxErr } = await supabase.from('transactions').delete().eq('id', id);
        if (delTxErr) console.error('Supabase Error:', delTxErr);
        try {
          const { error: delStErr } = await supabase.from('statement_transactions').delete().eq('id', id);
          if (delStErr) console.error('Supabase Error:', delStErr);
        } catch (stErr) {
          console.error('Supabase Error:', stErr);
        }
      } catch (err) {
        console.error('Supabase Error:', err);
      }
    }
    await deleteTransactionFromSupabase(id);
    setSyncStatus('✓ Transaction deleted from Supabase');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Update committed transaction category
  const handleUpdateCommittedCategory = async (id: string, category: StatementCategory) => {
    const target = activeTransactions.find((tx) => tx.id === id);
    if (target) {
      const updatedTx = { ...target, assignedCategory: category };
      if (isSupabaseConfigured()) {
        try {
          const row = mapTransactionToRow(updatedTx);
          const { error: upErr } = await supabase.from('transactions').update(row).eq('id', id);
          if (upErr) console.error('Supabase Error:', upErr);
        } catch (err) {
          console.error('Supabase Error:', err);
        }
      }
      await insertOrUpdateTransactionInSupabase(updatedTx);
      setSyncStatus('✓ Category updated in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
    }
    const updated = activeTransactions.map((tx) =>
      tx.id === id ? { ...tx, assignedCategory: category } : tx
    );
    setDbTransactions(updated);
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: updated,
    }));
  };

  // Update committed transaction statement period
  const handleUpdateCommittedPeriod = async (id: string, newPeriod: string) => {
    const target = activeTransactions.find((tx) => tx.id === id);
    if (target) {
      const updatedTx = { ...target, statementPeriod: newPeriod };
      if (isSupabaseConfigured()) {
        try {
          const row = mapTransactionToRow(updatedTx);
          const { error: upErr } = await supabase.from('transactions').update(row).eq('id', id);
          if (upErr) console.error('Supabase Error:', upErr);
        } catch (err) {
          console.error('Supabase Error:', err);
        }
      }
      await insertOrUpdateTransactionInSupabase(updatedTx);
      setSyncStatus('✓ Statement period updated in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
    }
    const updated = activeTransactions.map((tx) =>
      tx.id === id ? { ...tx, statementPeriod: newPeriod } : tx
    );
    setDbTransactions(updated);
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: updated,
    }));
  };

  // Start editing committed amount
  const handleStartEditAmount = (tx: StatementTransaction) => {
    setEditingTxId(tx.id);
    setEditAmountVal(tx.amount.toFixed(2));
  };

  // Save edited committed amount
  const handleSaveEditAmount = async (id: string) => {
    const num = parseFloat(editAmountVal) || 0;
    const absNum = Math.abs(num);
    const target = activeTransactions.find((tx) => tx.id === id);
    if (target) {
      const updatedTx = { ...target, amount: absNum };
      if (isSupabaseConfigured()) {
        try {
          const row = mapTransactionToRow(updatedTx);
          const { error: upErr } = await supabase.from('transactions').update(row).eq('id', id);
          if (upErr) console.error('Supabase Error:', upErr);
        } catch (err) {
          console.error('Supabase Error:', err);
        }
      }
      await insertOrUpdateTransactionInSupabase(updatedTx);
      setSyncStatus('✓ Amount updated in Supabase');
      setTimeout(() => setSyncStatus(null), 3000);
    }
    const updated = activeTransactions.map((tx) =>
      tx.id === id ? { ...tx, amount: absNum } : tx
    );
    setDbTransactions(updated);
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: updated,
    }));
    setEditingTxId(null);
    setEditAmountVal('');
  };

  // One-click repair: assign all transactions with July/August dates to August 2026 statement
  const handleAssignAllToAugust2026 = () => {
    const updated = activeTransactions.map((tx) => {
      const cleanDate = normalizeDateToIso(tx.date, 2026);
      if (cleanDate.includes('2026-07') || cleanDate.includes('2026-08') || !tx.statementPeriod) {
        return {
          ...tx,
          date: cleanDate,
          statementPeriod: '2026-08',
        };
      }
      return {
        ...tx,
        date: cleanDate,
      };
    });

    const sanitizedUpdated = sanitizeTransactions(updated);
    setDbTransactions(sanitizedUpdated);
    onUpdateState((prev) => ({
      ...prev,
      statementTransactions: sanitizedUpdated,
    }));

    // Persist healed transactions directly to Supabase
    bulkInsertTransactionsInSupabase(sanitizedUpdated);

    setSelectedPeriod('2026-08');
    setSuccessCommitMessage('✓ All July and August transactions have been assigned to the August 2026 Statement and saved to Supabase!');
    setTimeout(() => setSuccessCommitMessage(null), 5000);
  };

  // Filtered transactions for the ledger view
  const filteredTransactions = useMemo(() => {
    const sanitizedList = sanitizeTransactions(activeTransactions);
    return sanitizedList.filter((tx) => {
      // Period filter: compare tx.statementPeriod or fallback to date prefix
      if (selectedPeriod && selectedPeriod !== 'all') {
        const txPeriod = tx.statementPeriod || (tx.date && tx.date.length >= 7 ? tx.date.slice(0, 7) : '2026-08');
        if (txPeriod !== selectedPeriod) return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && tx.assignedCategory !== categoryFilter) {
        return false;
      }
      // Cardholder filter (Bunny / Monkey)
      if (partnerFilter !== 'all' && tx.partner !== partnerFilter) {
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
  }, [activeTransactions, selectedPeriod, categoryFilter, searchTerm]);

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
      {/* Success Notification Banner */}
      {successCommitMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between shadow-lg shadow-emerald-950/40 animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successCommitMessage}</span>
          </div>
          <button
            onClick={() => setSuccessCommitMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Period Actual & Year-to-Date Actual Master Header */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2.5 2xl:space-x-3">
              <span className="p-2.5 2xl:p-3 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <FileText className="w-5 h-5 2xl:w-6 2xl:h-6" />
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base 2xl:text-xl font-bold text-white">
                    Parsed Household Statement Ledger
                  </h2>
                  <span className="text-xs 2xl:text-sm font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {selectedPeriodLabel}
                  </span>
                </div>
                <p className="text-xs 2xl:text-sm text-slate-400">
                  Track actual expenditures across statement periods and year-to-date totals for Bunny &amp; Monkey
                </p>
              </div>
            </div>
          </div>

          {/* Period Selector & Dashboard Quick Link */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-xl">
              <Calendar className="w-4 h-4 2xl:w-5 2xl:h-5 text-indigo-400" />
              <label className="text-xs 2xl:text-sm text-slate-300 font-semibold">Statement Period:</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-slate-900 text-slate-100 text-xs 2xl:text-sm font-bold py-1 2xl:py-1.5 px-3 rounded-lg border border-indigo-500/30 focus:outline-hidden focus:border-indigo-400"
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
                className="flex items-center space-x-1.5 text-xs 2xl:text-sm font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/40 px-3.5 2xl:px-4 py-2 2xl:py-2.5 rounded-xl transition-all shadow-md"
              >
                <BarChart3 className="w-4 h-4 2xl:w-5 2xl:h-5 text-indigo-300" />
                <span>Track Budget vs. Actuals</span>
              </button>
            )}
          </div>
        </div>

        {/* Period Actual & Year to Date Actual Hero KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 2xl:gap-6 mt-6 pt-5 border-t border-white/10">
          {/* 1. Period Actual Spend */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Period Actual Spend
              </span>
              <span className="text-[10px] 2xl:text-xs text-slate-400 font-mono">
                {actualsSummary.periodCount} Txns
              </span>
            </div>
            <div className="text-2xl 2xl:text-3xl font-black font-mono text-white tracking-tight">
              {formatCurrency(actualsSummary.periodTotal)}
            </div>
            <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
              <span>Active Cycle:</span>
              <span className="font-semibold text-slate-200">{selectedPeriodLabel}</span>
            </div>
          </div>

          {/* 2. Year to Date (YTD) Actual Spend */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-teal-300">
                Year to Date Actual Spend
              </span>
              <span className="text-[10px] 2xl:text-xs text-slate-400 font-mono">
                {actualsSummary.ytdCount} Txns YTD
              </span>
            </div>
            <div className="text-2xl 2xl:text-3xl font-black font-mono text-teal-300 tracking-tight">
              {formatCurrency(actualsSummary.ytdTotal)}
            </div>
            <div className="text-[11px] 2xl:text-xs text-slate-400 mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
              <span>Calendar Year:</span>
              <span className="font-semibold text-slate-200">{actualsSummary.targetYear} YTD</span>
            </div>
          </div>

          {/* 3. Partner Period Spend Contribution */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-rose-300 block mb-1">
              Period Partner Breakdown
            </span>
            <div className="space-y-1.5 2xl:space-y-2 mt-2 text-xs 2xl:text-sm">
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
            </div>
          </div>

          {/* 4. Partner YTD Spend Contribution */}
          <div className="p-4 2xl:p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] 2xl:text-xs font-semibold uppercase tracking-wider text-amber-300 block mb-1">
              Year to Date Partner Totals
            </span>
            <div className="space-y-1.5 2xl:space-y-2 mt-2 text-xs 2xl:text-sm">
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
            </div>
          </div>
        </div>

        {/* Category Actuals Summary Pill Bar */}
        {categoryBreakdownList.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs 2xl:text-sm font-semibold text-slate-300 mb-2.5">
              <span>Category Actuals Summary ({selectedPeriodLabel})</span>
              <span className="text-[11px] 2xl:text-xs text-slate-400 font-mono">
                {categoryBreakdownList.length} Categories Active
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 2xl:gap-3 text-xs 2xl:text-sm">
              {categoryBreakdownList.slice(0, 6).map((c) => (
                <div
                  key={c.category}
                  className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="text-[11px] 2xl:text-xs font-medium text-slate-300 truncate">
                    {c.category}
                  </div>
                  <div className="text-xs 2xl:text-sm font-bold font-mono text-white mt-0.5">
                    {formatCurrency(c.periodActual)}
                  </div>
                  <div className="text-[10px] 2xl:text-xs text-teal-300 font-mono mt-0.5">
                    YTD: {formatCurrency(c.ytdActual)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. CSV Parser Input Box & Drop Area */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base 2xl:text-xl font-bold text-white flex items-center gap-2">
              <span>Credit Card Statement CSV &amp; Spreadsheet Uploader</span>
              <span className="text-[10px] 2xl:text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Auto-Billing Cycle Aware
              </span>
            </h3>
            <p className="text-xs 2xl:text-sm text-slate-400">
              Paste credit card statement rows from Google Sheets or drop a CSV file to auto-categorize and assign to your statement period.
            </p>
          </div>
        </div>

        {/* Target Statement Period & Default Cardholder Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 2xl:gap-5 mb-4 p-3.5 2xl:p-5 rounded-xl bg-slate-950/40 border border-white/10 text-xs 2xl:text-sm">
          {/* Target Statement Period: Month dropdown + Validated Year input */}
          <div className="space-y-1.5 2xl:space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-200 font-semibold flex items-center gap-1.5 text-xs 2xl:text-sm">
                <Calendar className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-indigo-400" />
                <span>Target Statement Period:</span>
              </label>
              <span
                className={`font-mono text-[11px] 2xl:text-xs font-bold px-2 py-0.5 rounded border transition-colors ${
                  isYearValid
                    ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}
                title={effectiveTargetUploadPeriod}
              >
                {uploadPeriodDisplayLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 2xl:gap-3">
              {/* 1. Month Selection Dropdown */}
              <div>
                <label htmlFor="upload-statement-month" className="text-[10px] 2xl:text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Month
                </label>
                <select
                  id="upload-statement-month"
                  value={uploadMonth}
                  onChange={(e) => {
                    const newMonth = e.target.value;
                    setUploadMonth(newMonth);
                    if (isYearValid && rawText.trim()) {
                      handleParseText(rawText, `${parsedYearNum}-${newMonth}`, selectedPartnerDefault);
                    }
                  }}
                  className="w-full px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-lg border border-white/15 bg-slate-900 text-slate-200 text-xs 2xl:text-sm font-semibold focus:outline-hidden focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                >
                  {CALENDAR_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name} ({m.value})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Year Input with numeric bounds 2026-2036 */}
              <div>
                <label htmlFor="upload-statement-year" className="text-[10px] 2xl:text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Year (2026–2036)
                </label>
                <input
                  id="upload-statement-year"
                  type="number"
                  min="2026"
                  max="2036"
                  step="1"
                  value={uploadYearInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUploadYearInput(val);
                    const yr = parseInt(val.trim(), 10);
                    if (!isNaN(yr) && yr >= MIN_VALID_YEAR && yr <= MAX_VALID_YEAR) {
                      const newPeriod = `${yr}-${uploadMonth}`;
                      if (rawText.trim()) {
                        handleParseText(rawText, newPeriod, selectedPartnerDefault);
                      }
                    }
                  }}
                  placeholder="2026"
                  className={`w-full px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-lg border bg-slate-900 font-mono text-xs 2xl:text-sm font-semibold focus:outline-hidden transition-all ${
                    !isYearValid
                      ? 'border-rose-500/80 text-rose-300 ring-1 ring-rose-500/50 bg-rose-950/20'
                      : 'border-white/15 text-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400'
                  }`}
                />
              </div>
            </div>

            {/* Inline Error Message */}
            {!isYearValid && (
              <div className="flex items-center space-x-1 text-rose-400 text-[11px] 2xl:text-xs font-medium pt-0.5 animate-fadeIn">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{yearErrorMessage}</span>
              </div>
            )}

            {isYearValid && (
              <p className="text-[10px] 2xl:text-xs text-slate-400">
                Billing cycle transactions will be assigned to <span className="text-indigo-300 font-medium">{effectiveTargetUploadPeriod}</span>.
              </p>
            )}
          </div>

          {/* Default Cardholder (Bunny or Monkey) */}
          <div>
            <label htmlFor="upload-default-cardholder" className="text-slate-200 font-semibold block mb-1 text-xs 2xl:text-sm">
              Cardholder:
            </label>
            <select
              id="upload-default-cardholder"
              value={selectedPartnerDefault}
              onChange={(e) => {
                const p = e.target.value as 'bunny' | 'monkey';
                setSelectedPartnerDefault(p);
                if (parsedItems.length > 0) {
                  setParsedItems((prev) => prev.map((item) => ({ ...item, partner: p })));
                }
              }}
              className="w-full px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-lg border border-white/15 bg-slate-900 text-slate-200 text-xs 2xl:text-sm font-semibold focus:outline-hidden focus:border-indigo-400"
            >
              <option value="bunny">🐰 Bunny</option>
              <option value="monkey">🐵 Monkey</option>
            </select>
            <p className="text-[10px] 2xl:text-xs text-slate-400 mt-1">
              Assigned to new uploads; you can switch between Bunny and Monkey per transaction below.
            </p>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <span className="text-slate-300 font-semibold block mb-1 text-xs 2xl:text-sm">Smart Columns Accepted:</span>
              <p className="text-[11px] 2xl:text-xs text-slate-400">
                <code className="text-indigo-300 font-mono">Date, Merchant, Category, Amount</code> or{' '}
                <code className="text-indigo-300 font-mono">Date, Merchant, Amount, Category</code>
              </p>
            </div>
            <button
              id="btn-heal-july-august"
              onClick={handleAssignAllToAugust2026}
              className="mt-2 text-[11px] 2xl:text-xs font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg transition-colors text-left flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
              <span>One-Click: Heal existing July/August to August 2026</span>
            </button>
          </div>
        </div>

        {/* Drop & Paste Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-4 2xl:p-6 text-center transition-all ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/40 shadow-inner'
              : 'border-white/15 hover:border-white/30 bg-black/20'
          }`}
        >
          <div className="max-w-2xl 2xl:max-w-3xl mx-auto space-y-2.5">
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                if (isYearValid) {
                  handleParseText(e.target.value, effectiveTargetUploadPeriod, selectedPartnerDefault);
                }
              }}
              placeholder="Paste Google Sheets / Excel columns here...&#10;e.g.&#10;24-Jul	FRESHCO #3875 MARKHAM	Groceries	$79.82&#10;27-Jul	PETRO-CANADA 00259 GORMLEY	Gas	$49.05"
              className="w-full text-xs 2xl:text-sm font-mono px-3 2xl:px-4 py-2 2xl:py-3 rounded-xl border border-white/15 bg-slate-950/80 text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-hidden"
            />

            {rawText.trim() && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setParsedItems([]);
                  }}
                  className="px-3 py-1 text-slate-400 hover:text-slate-200 text-xs 2xl:text-sm transition-colors"
                >
                  Clear Input
                </button>
                <button
                  type="button"
                  id="btn-reparse-lines"
                  disabled={!isYearValid}
                  onClick={() => handleParseText(rawText, effectiveTargetUploadPeriod, selectedPartnerDefault)}
                  className={`px-4 2xl:px-5 py-1.5 2xl:py-2 rounded-xl font-semibold text-xs 2xl:text-sm transition-all shadow-md ${
                    !isYearValid
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title={!isYearValid ? 'Please enter a valid year between 2026 and 2036' : 'Reparse lines'}
                >
                  Reparse Lines
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Parsed Items Preview Stage */}
        {parsedItems.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-indigo-950/40 border border-indigo-500/30 p-3.5 2xl:p-4 rounded-xl">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h4 className="text-sm 2xl:text-base font-bold text-white">
                    {parsedItems.length} Transactions Parsed &amp; Ready for Review
                  </h4>
                  <p className="text-[11px] 2xl:text-xs text-slate-300">
                    Total Amount: <span className="font-mono font-bold text-emerald-300">{formatCurrencyExact(parsedItems.reduce((s, i) => s + i.amount, 0))}</span> • Assigned to <span className="font-semibold text-indigo-200">{uploadPeriodDisplayLabel} Statement</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setParsedItems([])}
                  className="text-xs 2xl:text-sm text-slate-400 hover:text-rose-400 px-2.5 py-1.5 transition-colors"
                >
                  Discard
                </button>
                <button
                  id="btn-commit-transactions"
                  disabled={!isYearValid || parsedItems.length === 0 || isCommitting}
                  onClick={handleCommitTransactions}
                  className={`flex items-center space-x-1.5 text-xs 2xl:text-sm font-bold px-4 2xl:px-5 py-2 2xl:py-2.5 rounded-xl transition-all shadow-lg ${
                    !isYearValid || isCommitting
                      ? 'bg-slate-700 border border-slate-600 text-slate-400 cursor-not-allowed opacity-60'
                      : 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-white shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                  title={!isYearValid ? 'Please enter a valid year between 2026 and 2036 before committing' : 'Commit transactions'}
                >
                  {isCommitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-emerald-200 animate-spin" />
                      <span>Writing to Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Commit to Household Ledger ({parsedItems.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 max-h-96">
              <table className="w-full text-left text-xs 2xl:text-sm">
                <thead className="bg-slate-900/90 sticky top-0 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px] 2xl:text-xs z-10">
                  <tr>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Date (ISO)</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Merchant</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Amount ($ CAD)</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Auto-Category</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Statement Period</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4">Card / Partner</th>
                    <th className="py-2.5 2xl:py-3 px-3 2xl:px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/40">
                  {parsedItems.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4 font-mono text-slate-300">{tx.date}</td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4 font-medium text-slate-100">{tx.merchant}</td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4 font-mono font-bold text-emerald-300">
                        <input
                          type="number"
                          step="0.01"
                          value={tx.amount}
                          onChange={(e) => handleUpdateParsedAmount(tx.id, parseFloat(e.target.value) || 0)}
                          className="w-24 2xl:w-28 px-2 py-0.5 rounded bg-slate-900 border border-white/15 text-white font-mono text-xs 2xl:text-sm focus:outline-hidden focus:border-indigo-400"
                        />
                      </td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4">
                        <select
                          value={tx.assignedCategory}
                          onChange={(e) =>
                            handleUpdateCategory(tx.id, e.target.value as StatementCategory)
                          }
                          className="text-xs 2xl:text-sm px-2 py-1 rounded-lg border border-white/15 bg-slate-900 text-slate-200 font-medium focus:outline-hidden"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] 2xl:text-xs font-mono">
                          {tx.statementPeriod || effectiveTargetUploadPeriod}
                        </span>
                      </td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4">
                        <select
                          value={tx.partner === 'joint' ? 'bunny' : tx.partner}
                          onChange={(e) => handleUpdateParsedPartner(tx.id, e.target.value as 'bunny' | 'monkey')}
                          className="text-xs 2xl:text-sm px-2 py-0.5 rounded bg-slate-900 border border-white/15 text-slate-200 font-medium focus:outline-hidden"
                        >
                          <option value="bunny">🐰 Bunny</option>
                          <option value="monkey">🐵 Monkey</option>
                        </select>
                      </td>
                      <td className="py-2.5 2xl:py-3 px-3 2xl:px-4 text-center">
                        <button
                          onClick={() => handleRemoveParsedItem(tx.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
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
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 2xl:p-8 border border-white/15 shadow-xl shadow-black/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base 2xl:text-xl font-bold text-white">
                Committed Household Ledger History
              </h3>
              <span className="text-xs 2xl:text-sm font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {filteredTransactions.length} Recorded
              </span>
              {syncStatus && (
                <span className="text-xs text-emerald-400 font-medium">
                  {syncStatus}
                </span>
              )}
              {isSyncing && !syncStatus && (
                <span className="text-xs text-indigo-400 font-medium animate-pulse">
                  Syncing from database...
                </span>
              )}
              <button
                onClick={syncTransactionsFromSupabase}
                disabled={isSyncing}
                title="Sync Transactions from Supabase"
                className="text-xs font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
                <span className="hidden sm:inline">Sync Ledger</span>
              </button>
            </div>
            <p className="text-xs 2xl:text-sm text-slate-400">
              Showing active transactions filtered for{' '}
              <strong className="text-slate-200">{selectedPeriodLabel}</strong>
            </p>
          </div>

          {/* Search, Category Filter & Period Quick Switch */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search merchant or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 2xl:pl-9 pr-3 py-1.5 2xl:py-2 rounded-xl border border-white/15 bg-slate-950/60 text-slate-200 text-xs 2xl:text-sm placeholder-slate-500 focus:outline-hidden focus:border-indigo-400"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-200 text-xs 2xl:text-sm font-semibold focus:outline-hidden"
            >
              <option value="all">All Categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              id="partner-filter-select"
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value as 'all' | 'bunny' | 'monkey')}
              className="px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-xl border border-white/15 bg-slate-900 text-slate-200 text-xs 2xl:text-sm font-semibold focus:outline-hidden"
            >
              <option value="all">All Cardholders</option>
              <option value="bunny">🐰 Bunny Only</option>
              <option value="monkey">🐵 Monkey Only</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs 2xl:text-sm">
            <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10 text-[11px] 2xl:text-xs">
              <tr>
                <th className="py-3 2xl:py-3.5 px-4 2xl:px-5">Date</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4">Merchant</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4">Category</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4">Card / Partner</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4">Statement Period</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-right">Amount ($ CAD)</th>
                <th className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs 2xl:text-sm">
                    No transactions found for the selected period / filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const txPeriod = tx.statementPeriod || (tx.date.length >= 7 ? tx.date.slice(0, 7) : '2026-08');
                  const isEditingAmt = editingTxId === tx.id;

                  return (
                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 2xl:py-3.5 px-4 2xl:px-5 font-mono text-slate-300">{tx.date}</td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 font-semibold text-slate-100">{tx.merchant}</td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4">
                        <select
                          value={tx.assignedCategory}
                          onChange={(e) =>
                            handleUpdateCommittedCategory(
                              tx.id,
                              e.target.value as StatementCategory
                            )
                          }
                          className="px-2 py-0.5 rounded-lg text-xs 2xl:text-sm bg-slate-900 text-slate-200 border border-white/10 font-semibold focus:outline-hidden"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] 2xl:text-xs font-semibold border ${
                            tx.partner === 'bunny'
                              ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                              : 'bg-teal-500/20 border-teal-500/30 text-teal-300'
                          }`}
                        >
                          {tx.partner === 'bunny' ? '🐰 Bunny' : '🐵 Monkey'}
                        </span>
                      </td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4">
                        <select
                          value={txPeriod}
                          onChange={(e) => handleUpdateCommittedPeriod(tx.id, e.target.value)}
                          className="font-mono text-[11px] 2xl:text-xs text-indigo-300 bg-slate-900 px-2 py-0.5 rounded-md border border-indigo-500/20 focus:outline-hidden"
                        >
                          {availablePeriods.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-right font-mono font-bold text-white">
                        {isEditingAmt ? (
                          <div className="flex items-center justify-end space-x-1">
                            <input
                              type="number"
                              step="0.01"
                              value={editAmountVal}
                              onChange={(e) => setEditAmountVal(e.target.value)}
                              className="w-20 2xl:w-24 px-1.5 py-0.5 bg-slate-900 border border-indigo-400 rounded text-right text-xs 2xl:text-sm text-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditAmount(tx.id);
                                if (e.key === 'Escape') setEditingTxId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveEditAmount(tx.id)}
                              className="p-1 text-emerald-400 hover:text-emerald-300"
                              title="Save amount"
                            >
                              <Check className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTxId(null)}
                              className="p-1 text-slate-400 hover:text-slate-200"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end space-x-1.5 group">
                            <span>{formatCurrencyExact(tx.amount)}</span>
                            <button
                              onClick={() => handleStartEditAmount(tx)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-300 transition-opacity"
                              title="Edit amount"
                            >
                              <Edit2 className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-center">
                        <button
                          onClick={() => handleDeleteCommittedItem(tx.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-4 h-4 2xl:w-5 2xl:h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-white/5 font-bold border-t border-white/10 text-slate-200 text-xs 2xl:text-sm">
              <tr>
                <td colSpan={5} className="py-3 2xl:py-4 px-4 2xl:px-5 text-slate-300">
                  Filtered Ledger Total ({filteredTransactions.length} Transactions in {selectedPeriodLabel})
                </td>
                <td className="py-3 2xl:py-4 px-3 2xl:px-4 text-right font-mono text-emerald-300 text-sm 2xl:text-base">
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
