import {
  DividendHolding,
  HoldingOwner,
  HouseholdExpense,
  HouseholdState,
  Partner,
  SinkingFund,
  StatementTransaction,
} from '../types';

export const USD_TO_CAD_RATE = 1.36;

export function formatCurrency(amount: number, currency: string = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyExact(amount: number, currency: string = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Calculates income split ratios
 */
export function calculateIncomeSplit(bunnyNet: number, monkeyNet: number) {
  const totalNet = bunnyNet + monkeyNet;
  if (totalNet <= 0) {
    return {
      totalNet: 0,
      bunnyRatio: 0.5,
      monkeyRatio: 0.5,
      bunnyPercent: 50,
      monkeyPercent: 50,
    };
  }
  const bunnyRatio = bunnyNet / totalNet;
  const monkeyRatio = monkeyNet / totalNet;
  return {
    totalNet,
    bunnyRatio,
    monkeyRatio,
    bunnyPercent: bunnyRatio * 100,
    monkeyPercent: monkeyRatio * 100,
  };
}

/**
 * Calculates allocation of an expense between Bunny and Monkey
 */
export function calculateExpenseAllocation(
  expense: HouseholdExpense,
  bunnyRatio: number,
  monkeyRatio: number
) {
  let bunnyShare = 0;
  let monkeyShare = 0;

  if (expense.splitMethod === 'proportional') {
    bunnyShare = expense.monthlyAmount * bunnyRatio;
    monkeyShare = expense.monthlyAmount * monkeyRatio;
  } else if (expense.splitMethod === 'equal') {
    bunnyShare = expense.monthlyAmount * 0.5;
    monkeyShare = expense.monthlyAmount * 0.5;
  } else if (expense.splitMethod === 'custom') {
    const bPercent = (expense.customBunnyPercent ?? 50) / 100;
    bunnyShare = expense.monthlyAmount * bPercent;
    monkeyShare = expense.monthlyAmount * (1 - bPercent);
  } else if (expense.splitMethod === 'fixed_dollar') {
    const fixedAmt = Math.max(0, expense.fixedAmount ?? 0);
    if (expense.fixedPayer === 'monkey') {
      monkeyShare = Math.min(expense.monthlyAmount, fixedAmt);
      bunnyShare = Math.max(0, expense.monthlyAmount - monkeyShare);
    } else {
      // Default: Bunny pays fixed amount, remainder to Monkey
      bunnyShare = Math.min(expense.monthlyAmount, fixedAmt);
      monkeyShare = Math.max(0, expense.monthlyAmount - bunnyShare);
    }
  }

  return {
    bunnyShare,
    monkeyShare,
    total: expense.monthlyAmount,
  };
}

/**
 * Complete household budget summary
 */
export function calculateBudgetSummary(
  partners: { bunny: Partner; monkey: Partner },
  expenses: HouseholdExpense[],
  sinkingFunds: HouseholdState['sinkingFunds']
) {
  const { bunnyRatio, monkeyRatio, bunnyPercent, monkeyPercent, totalNet } = calculateIncomeSplit(
    partners.bunny.netMonthlyIncome,
    partners.monkey.netMonthlyIncome
  );

  let totalFixedExpenses = 0;
  let totalVariableExpenses = 0;
  let bunnyFixedOwed = 0;
  let monkeyFixedOwed = 0;
  let bunnyVariableOwed = 0;
  let monkeyVariableOwed = 0;

  expenses.forEach((exp) => {
    const { bunnyShare, monkeyShare } = calculateExpenseAllocation(exp, bunnyRatio, monkeyRatio);
    if (exp.isFixed) {
      totalFixedExpenses += exp.monthlyAmount;
      bunnyFixedOwed += bunnyShare;
      monkeyFixedOwed += monkeyShare;
    } else {
      totalVariableExpenses += exp.monthlyAmount;
      bunnyVariableOwed += bunnyShare;
      monkeyVariableOwed += monkeyShare;
    }
  });

  const totalMonthlySinkingCommitment = sinkingFunds.reduce(
    (sum, sf) => sum + sf.monthlyContribution,
    0
  );
  const totalSinkingCurrentBalance = sinkingFunds.reduce(
    (sum, sf) => sum + sf.currentBalance,
    0
  );
  const totalSinkingTargetBalance = sinkingFunds.reduce(
    (sum, sf) => sum + sf.targetBalance,
    0
  );

  // Sinking funds are typically split proportionally to income
  const bunnySinkingOwed = totalMonthlySinkingCommitment * bunnyRatio;
  const monkeySinkingOwed = totalMonthlySinkingCommitment * monkeyRatio;

  const totalMonthlyCommitments =
    totalFixedExpenses + totalVariableExpenses + totalMonthlySinkingCommitment;
  const bunnyTotalObligation = bunnyFixedOwed + bunnyVariableOwed + bunnySinkingOwed;
  const monkeyTotalObligation = monkeyFixedOwed + monkeyVariableOwed + monkeySinkingOwed;

  const bunnyDiscretionaryFreeCash = partners.bunny.netMonthlyIncome - bunnyTotalObligation;
  const monkeyDiscretionaryFreeCash = partners.monkey.netMonthlyIncome - monkeyTotalObligation;
  const totalHouseholdFreeCash = totalNet - totalMonthlyCommitments;

  return {
    totalNet,
    bunnyRatio,
    monkeyRatio,
    bunnyPercent,
    monkeyPercent,
    totalFixedExpenses,
    totalVariableExpenses,
    bunnyFixedOwed,
    monkeyFixedOwed,
    bunnyVariableOwed,
    monkeyVariableOwed,
    totalMonthlySinkingCommitment,
    totalSinkingCurrentBalance,
    totalSinkingTargetBalance,
    bunnySinkingOwed,
    monkeySinkingOwed,
    totalMonthlyCommitments,
    bunnyTotalObligation,
    monkeyTotalObligation,
    bunnyDiscretionaryFreeCash,
    monkeyDiscretionaryFreeCash,
    totalHouseholdFreeCash,
    savingsRatePercent:
      totalNet > 0 ? ((totalMonthlySinkingCommitment + Math.max(0, totalHouseholdFreeCash)) / totalNet) * 100 : 0,
  };
}

/**
 * Statement parser helper
 */
export function autoCategorizeMerchant(merchant: string, amount: number) {
  const m = merchant.toLowerCase();

  if (
    m.includes('flight') ||
    m.includes('air') ||
    m.includes('hotel') ||
    m.includes('airbnb') ||
    m.includes('booking') ||
    m.includes('expedia') ||
    m.includes('shinkansen') ||
    m.includes('uber') ||
    m.includes('lyft')
  ) {
    const isFlight = m.includes('flight') || m.includes('air');
    const isTransit = m.includes('uber') || m.includes('lyft') || m.includes('train');
    return {
      category: 'Travel' as const,
      ecoCategory: isFlight ? ('Flight' as const) : isTransit ? ('Transit' as const) : ('Neutral' as const),
      carbonEstimateKg: isFlight ? amount * 0.36 : isTransit ? amount * 0.12 : 5,
      ecoTip: isFlight
        ? 'Aviation is high emission (~200g CO2/km). Offsetting or train alternatives reduce footprint.'
        : isTransit
        ? 'Shared rides or electrified public transit curb direct urban smog.'
        : undefined,
    };
  }

  if (
    m.includes('whole foods') ||
    m.includes('grocery') ||
    m.includes('market') ||
    m.includes('safeway') ||
    m.includes('superstore') ||
    m.includes('trader joe') ||
    m.includes('produce') ||
    m.includes('costco') ||
    m.includes('loblaws')
  ) {
    return {
      category: 'Groceries' as const,
      ecoCategory: 'Groceries' as const,
      carbonEstimateKg: amount * 0.08,
      ecoTip: 'Plant-forward & seasonal local shopping cuts food supply chain emissions by up to 25%.',
    };
  }

  if (
    m.includes('chevron') ||
    m.includes('shell') ||
    m.includes('gas') ||
    m.includes('petro') ||
    m.includes('exxon') ||
    m.includes('mobil')
  ) {
    return {
      category: 'Household' as const,
      ecoCategory: 'Fuel/Gas' as const,
      carbonEstimateKg: amount * 0.72,
      ecoTip: 'Direct fossil fuel combustion. Trip-chaining or hybrid/EV usage directly cuts tailpipe emissions.',
    };
  }

  if (
    m.includes('hydro') ||
    m.includes('electric') ||
    m.includes('water') ||
    m.includes('energy') ||
    m.includes('enbridge') ||
    m.includes('fortis')
  ) {
    return {
      category: 'Utilities/Subs' as const,
      ecoCategory: 'Utilities' as const,
      carbonEstimateKg: amount * 0.28,
      ecoTip: 'Smart thermostats and off-peak appliance schedules maximize clean grid usage.',
    };
  }

  if (
    m.includes('daycare') ||
    m.includes('montessori') ||
    m.includes('child') ||
    m.includes('school') ||
    m.includes('swim') ||
    m.includes('lego') ||
    m.includes('pediatric')
  ) {
    return {
      category: 'Kid/Family' as const,
      ecoCategory: 'Neutral' as const,
      carbonEstimateKg: 2,
      ecoTip: 'Educational and care investments have very low physical carbon intensity.',
    };
  }

  if (
    m.includes('zara') ||
    m.includes('h&m') ||
    m.includes('uniqlo') ||
    m.includes('shein') ||
    m.includes('apparel') ||
    m.includes('clothing')
  ) {
    return {
      category: 'Personal (Bunny)' as const,
      ecoCategory: 'Fast Fashion' as const,
      carbonEstimateKg: amount * 0.31,
      ecoTip: 'High synthetic water and microplastic footprint. Sustainable natural textiles last 4x longer.',
    };
  }

  if (
    m.includes('restaurant') ||
    m.includes('cafe') ||
    m.includes('coffee') ||
    m.includes('starbucks') ||
    m.includes('omakase') ||
    m.includes('bistro') ||
    m.includes('dining') ||
    m.includes('pizza') ||
    m.includes('doordash') ||
    m.includes('ubereats')
  ) {
    return {
      category: 'Dining' as const,
      ecoCategory: 'Neutral' as const,
      carbonEstimateKg: amount * 0.07,
      ecoTip: 'Choosing local scratch-kitchens reduces packaging waste and food travel miles.',
    };
  }

  if (
    m.includes('netflix') ||
    m.includes('spotify') ||
    m.includes('apple') ||
    m.includes('cloud') ||
    m.includes('internet')
  ) {
    return {
      category: 'Utilities/Subs' as const,
      ecoCategory: 'Neutral' as const,
      carbonEstimateKg: 1.5,
      ecoTip: 'Renewable-powered data centers are minimizing digital cloud footprint.',
    };
  }

  return {
    category: 'Household' as const,
    ecoCategory: 'Neutral' as const,
    carbonEstimateKg: amount * 0.05,
    ecoTip: undefined,
  };
}

/**
 * Dividend Portfolio Metrics
 */
export function calculateDividendMetrics(holdings: DividendHolding[]) {
  let totalMarketValueCAD = 0;
  let totalCostBasisCAD = 0;
  let totalPadiCAD = 0; // Projected Annual Dividend Income in CAD

  const monthlyPayoutsCAD: number[] = new Array(12).fill(0); // 0 = Jan, 11 = Dec
  const accountBreakdown: Record<string, { valueCAD: number; padiCAD: number }> = {};
  const sectorBreakdown: Record<string, number> = {};
  const ownerBreakdown: Record<HoldingOwner, { valueCAD: number; padiCAD: number; count: number }> = {
    bunny: { valueCAD: 0, padiCAD: 0, count: 0 },
    monkey: { valueCAD: 0, padiCAD: 0, count: 0 },
    piggy: { valueCAD: 0, padiCAD: 0, count: 0 },
    joint: { valueCAD: 0, padiCAD: 0, count: 0 },
  };

  holdings.forEach((h) => {
    const fx = h.currency === 'USD' ? USD_TO_CAD_RATE : 1.0;
    const marketValueCAD = h.shares * h.currentPrice * fx;
    const costBasisCAD = h.shares * h.avgCostPerShare * fx;
    const holdingPadiCAD = h.shares * h.annualDividendPerShare * fx;

    totalMarketValueCAD += marketValueCAD;
    totalCostBasisCAD += costBasisCAD;
    totalPadiCAD += holdingPadiCAD;

    // Account breakdown
    if (!accountBreakdown[h.accountType]) {
      accountBreakdown[h.accountType] = { valueCAD: 0, padiCAD: 0 };
    }
    accountBreakdown[h.accountType].valueCAD += marketValueCAD;
    accountBreakdown[h.accountType].padiCAD += holdingPadiCAD;

    // Owner breakdown
    const owner = (h.owner as HoldingOwner) || 'bunny';
    if (!ownerBreakdown[owner]) {
      ownerBreakdown[owner] = { valueCAD: 0, padiCAD: 0, count: 0 };
    }
    ownerBreakdown[owner].valueCAD += marketValueCAD;
    ownerBreakdown[owner].padiCAD += holdingPadiCAD;
    ownerBreakdown[owner].count += 1;

    // Sector breakdown
    sectorBreakdown[h.sector] = (sectorBreakdown[h.sector] || 0) + marketValueCAD;

    // Monthly calendar distribution
    const count = h.payoutMonths.length || 1;
    const payoutPerMonthCAD = holdingPadiCAD / count;
    h.payoutMonths.forEach((m) => {
      const idx = m - 1;
      if (idx >= 0 && idx < 12) {
        monthlyPayoutsCAD[idx] += payoutPerMonthCAD;
      }
    });
  });

  const totalGainCAD = totalMarketValueCAD - totalCostBasisCAD;
  const totalGainPercent = totalCostBasisCAD > 0 ? (totalGainCAD / totalCostBasisCAD) * 100 : 0;
  const portfolioYieldPercent =
    totalMarketValueCAD > 0 ? (totalPadiCAD / totalMarketValueCAD) * 100 : 0;
  const yieldOnCostPercent =
    totalCostBasisCAD > 0 ? (totalPadiCAD / totalCostBasisCAD) * 100 : 0;
  const averageMonthlyPayoutCAD = totalPadiCAD / 12;

  return {
    totalMarketValueCAD,
    totalCostBasisCAD,
    totalGainCAD,
    totalGainPercent,
    totalPadiCAD,
    portfolioYieldPercent,
    yieldOnCostPercent,
    averageMonthlyPayoutCAD,
    monthlyPayoutsCAD,
    accountBreakdown,
    sectorBreakdown,
    ownerBreakdown,
    holdingsCount: holdings.length,
  };
}

/**
 * DRIP Compound Accumulation Simulator
 */
export function simulateDRIPCompound({
  startingPortfolioValue,
  startingPadi,
  annualDividendGrowthRate, // e.g. 6.5
  capitalAppreciationRate, // e.g. 5.0
  monthlyContribution, // e.g. 1000
  years, // e.g. 15
  reinvestDividends, // true or false
}: {
  startingPortfolioValue: number;
  startingPadi: number;
  annualDividendGrowthRate: number;
  capitalAppreciationRate: number;
  monthlyContribution: number;
  years: number;
  reinvestDividends: boolean;
}) {
  const timeline: Array<{
    year: number;
    portfolioValueWithDRIP: number;
    portfolioValueNoDRIP: number;
    annualDividendIncomeWithDRIP: number;
    annualDividendIncomeNoDRIP: number;
    totalContributed: number;
    cumulativeDividendsReceived: number;
  }> = [];

  const initialYield =
    startingPortfolioValue > 0 ? startingPadi / startingPortfolioValue : 0.038;

  let currentValWithDRIP = startingPortfolioValue;
  let currentValNoDRIP = startingPortfolioValue;
  let currentPadiWithDRIP = startingPadi;
  let currentPadiNoDRIP = startingPadi;
  let totalContributed = startingPortfolioValue;
  let cumulativeDividendsReceived = 0;

  const dgrFactor = 1 + annualDividendGrowthRate / 100;
  const capFactor = 1 + capitalAppreciationRate / 100;

  timeline.push({
    year: 0,
    portfolioValueWithDRIP: Math.round(currentValWithDRIP),
    portfolioValueNoDRIP: Math.round(currentValNoDRIP),
    annualDividendIncomeWithDRIP: Math.round(currentPadiWithDRIP),
    annualDividendIncomeNoDRIP: Math.round(currentPadiNoDRIP),
    totalContributed: Math.round(totalContributed),
    cumulativeDividendsReceived: 0,
  });

  for (let yr = 1; yr <= years; yr++) {
    const annualContribution = monthlyContribution * 12;
    totalContributed += annualContribution;

    // --- WITH DRIP ---
    // 1. Dividends earned this year
    const divThisYearWithDRIP = currentPadiWithDRIP;
    cumulativeDividendsReceived += divThisYearWithDRIP;

    // 2. Growth from price appreciation
    currentValWithDRIP = currentValWithDRIP * capFactor;

    // 3. Reinvest dividends + new capital
    if (reinvestDividends) {
      currentValWithDRIP += divThisYearWithDRIP + annualContribution;
      // Dividend income grows from DGR + new shares purchased via DRIP & contributions
      const newCapitalAdded = divThisYearWithDRIP + annualContribution;
      const additionalDividendsFromNewShares = newCapitalAdded * initialYield;
      currentPadiWithDRIP = currentPadiWithDRIP * dgrFactor + additionalDividendsFromNewShares;
    } else {
      currentValWithDRIP += annualContribution;
      const additionalDividendsFromNewShares = annualContribution * initialYield;
      currentPadiWithDRIP = currentPadiWithDRIP * dgrFactor + additionalDividendsFromNewShares;
    }

    // --- WITHOUT DRIP (Dividends spent as cash flow) ---
    currentValNoDRIP = currentValNoDRIP * capFactor + annualContribution;
    const additionalDivsNoDRIP = annualContribution * initialYield;
    currentPadiNoDRIP = currentPadiNoDRIP * dgrFactor + additionalDivsNoDRIP;

    timeline.push({
      year: yr,
      portfolioValueWithDRIP: Math.round(currentValWithDRIP),
      portfolioValueNoDRIP: Math.round(currentValNoDRIP),
      annualDividendIncomeWithDRIP: Math.round(currentPadiWithDRIP),
      annualDividendIncomeNoDRIP: Math.round(currentPadiNoDRIP),
      totalContributed: Math.round(totalContributed),
      cumulativeDividendsReceived: Math.round(cumulativeDividendsReceived),
    });
  }

  const finalYear = timeline[timeline.length - 1];
  const dripAdvantageValue =
    finalYear.portfolioValueWithDRIP - finalYear.portfolioValueNoDRIP;
  const dripAdvantageIncome =
    finalYear.annualDividendIncomeWithDRIP - finalYear.annualDividendIncomeNoDRIP;

  return {
    timeline,
    finalYear,
    dripAdvantageValue,
    dripAdvantageIncome,
  };
}

export interface StatementPeriod {
  id: string; // e.g. "2026-08"
  label: string; // e.g. "August 2026"
  year: number;
  month: number;
  count: number;
  totalAmount: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Month abbreviations lookup
 */
const MONTH_ABBR_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Normalizes varied human or bank date strings into valid ISO YYYY-MM-DD
 * e.g., "24-Jul" -> "2026-07-24", "01-Aug" -> "2026-08-01", "2026-08-16" -> "2026-08-16"
 */
export function normalizeDateToIso(rawDate: string, defaultYear: number = 2026): string {
  if (!rawDate) return `${defaultYear}-08-01`;
  const trimmed = rawDate.trim();

  // Already standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD-MMM (e.g. "24-Jul", "01-Aug", "7-Aug")
  const ddMmmMatch = trimmed.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})(?:[-/\s](\d{2,4}))?$/);
  if (ddMmmMatch) {
    const day = parseInt(ddMmmMatch[1], 10);
    const monthKey = ddMmmMatch[2].toLowerCase();
    const month = MONTH_ABBR_MAP[monthKey] || 8;
    let year = defaultYear;
    if (ddMmmMatch[3]) {
      const yr = parseInt(ddMmmMatch[3], 10);
      year = yr < 100 ? 2000 + yr : yr;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // MMM-DD (e.g. "Jul-24", "Aug 01")
  const mmmDdMatch = trimmed.match(/^([A-Za-z]{3,9})[-/\s](\d{1,2})(?:[-/\s,]?\s*(\d{2,4}))?$/);
  if (mmmDdMatch) {
    const monthKey = mmmDdMatch[1].toLowerCase();
    const month = MONTH_ABBR_MAP[monthKey] || 8;
    const day = parseInt(mmmDdMatch[2], 10);
    let year = defaultYear;
    if (mmmDdMatch[3]) {
      const yr = parseInt(mmmDdMatch[3], 10);
      year = yr < 100 ? 2000 + yr : yr;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // MM/DD/YYYY or DD/MM/YYYY or YYYY/MM/DD
  if (trimmed.includes('/') || trimmed.includes('-')) {
    const parts = trimmed.split(/[-/]/).map((p) => parseInt(p, 10));
    if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
      // If first is 4 digits -> YYYY-MM-DD
      if (parts[0] > 1900) {
        return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
      }
      // If last is 4 digits
      let year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
      // Assume MM/DD/YYYY if first <= 12 and second > 12, or DD/MM/YYYY
      let m = parts[0];
      let d = parts[1];
      if (m > 12 && d <= 12) {
        // DD/MM/YYYY
        const tmp = m;
        m = d;
        d = tmp;
      }
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return `${defaultYear}-08-01`;
}

/**
 * Sanitizes and repairs historical transactions (migrates legacy "31-Jul" dates and assigns proper statement periods)
 */
export function sanitizeTransactions(transactions: StatementTransaction[] = []): StatementTransaction[] {
  if (!Array.isArray(transactions)) return [];

  // Lookup map for fixing $0 amounts from known screenshot merchants if any are 0
  const knownAmounts: Record<string, number> = {
    'FRESHCO #3875 MARKHAM': 79.82,
    'WINCO FOOD MART MARKHAM': 213.62,
    'PETRO-CANADA 00259 GORMLEY': 49.05,
    'AJISEN RAMEN UNIONVILLE': 59.45,
    'Hand and Stone Canada Markham': 112.94,
    'THE BODY SHOP CANADA 1968 HALTON HILLS': 29.60,
    'FAMOUS WOK HALTON HILLS': 18.07,
    'T&T SUPERMARKET #022 UNIONVILLE': 158.91,
    'TEN RENS TEA(UNIONVILLE) MARKHAM': 76.12,
    'WINNERS 418 STOUFFVILLE': 24.85,
    'PETRO-CANADA 33370 MARKHAM': 32.94,
    'WAL-MART SUPERCENTER#1029 STOUFFVILLE': 87.16,
    'BOSTON PIZZA # 533 STOUFFVILLE': 69.92,
    'CHURCHS CHICKEN #11241 MARKHAM': 26.53,
    'YOGEN FRUZ MARKVILLE M MARKHAM': 6.38,
    'LS Kinton Ramen Markha Markham': 54.54,
    'SAINT GERMAIN BAKERY MARKHAM': 43.11,
    'MCDONALD S #8766 MARKHAM': 2.83,
    'WAL-MART SUPERCENTER#3053 MARKHAM': 18.58,
    'PETRO-CANADA 34871 MARKHAM': 51.56,
    'T&T SUPERMARKET #021 MARKHAM': 222.01,
    'PETRO-CANADA 65053 MARKHAM': 36.41,
    'PEMBRIDGE INS CO. 877-736-2743': 245.55,
    'DAIRY QUEEN #12145 MARKHAM': 16.92,
  };

  return transactions.map((tx) => {
    let cleanDate = normalizeDateToIso(tx.date, 2026);
    let period = tx.statementPeriod;

    // If no statementPeriod assigned:
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      // In credit card billing cycles, late July (20th onwards) through August is part of August Statement (2026-08)
      if (cleanDate.startsWith('2026-08') || cleanDate.startsWith('2026-07-2') || cleanDate.startsWith('2026-07-3')) {
        period = '2026-08';
      } else {
        period = cleanDate.slice(0, 7);
      }
    }

    let amount = Number(tx.amount) || 0;
    if (amount === 0) {
      for (const [merchantKey, amt] of Object.entries(knownAmounts)) {
        if (tx.merchant && tx.merchant.toLowerCase().includes(merchantKey.toLowerCase().slice(0, 12))) {
          amount = amt;
          break;
        }
      }
    }

    return {
      ...tx,
      date: cleanDate,
      statementPeriod: period,
      amount,
    };
  });
}

/**
 * Extracts and sorts all statement periods (months) present in transactions
 */
export function getStatementPeriods(transactions: StatementTransaction[] = []): StatementPeriod[] {
  const sanitized = sanitizeTransactions(transactions);
  const periodMap = new Map<string, { count: number; totalAmount: number }>();

  sanitized.forEach((tx) => {
    if (!tx) return;
    const periodKey = tx.statementPeriod || (tx.date && tx.date.length >= 7 ? tx.date.slice(0, 7) : '2026-08');
    if (!/^\d{4}-\d{2}$/.test(periodKey)) return;

    const existing = periodMap.get(periodKey) || { count: 0, totalAmount: 0 };
    existing.count += 1;
    existing.totalAmount += tx.amount || 0;
    periodMap.set(periodKey, existing);
  });

  // Ensure 2026-08, 2026-07, and 2026-09 are available as default options if not present
  if (!periodMap.has('2026-09')) periodMap.set('2026-09', { count: 0, totalAmount: 0 });
  if (!periodMap.has('2026-08')) periodMap.set('2026-08', { count: 0, totalAmount: 0 });
  if (!periodMap.has('2026-07')) periodMap.set('2026-07', { count: 0, totalAmount: 0 });

  const periods: StatementPeriod[] = Array.from(periodMap.entries())
    .filter(([key]) => /^\d{4}-\d{2}$/.test(key))
    .map(([key, data]) => {
      const [yStr, mStr] = key.split('-');
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;
      return {
        id: key,
        label: `${monthName} ${year}`,
        year,
        month,
        count: data.count,
        totalAmount: data.totalAmount,
      };
    });

  // Sort descending (latest month first: Sept 2026, Aug 2026, Jul 2026, etc.)
  return periods.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

/**
 * Calculates Period Actual and Year-To-Date (YTD) Actual metrics
 */
export function calculatePeriodAndYtdActuals(
  transactions: StatementTransaction[] = [],
  periodId: string = '2026-09'
) {
  const sanitized = sanitizeTransactions(transactions);

  let targetYear = 2026;
  let targetMonth = 9;
  const isAll = !periodId || periodId === 'all';

  if (!isAll && periodId && /^\d{4}-\d{2}$/.test(periodId)) {
    const [yStr, mStr] = periodId.split('-');
    const parsedY = parseInt(yStr, 10);
    const parsedM = parseInt(mStr, 10);
    if (!isNaN(parsedY)) targetYear = parsedY;
    if (!isNaN(parsedM)) targetMonth = parsedM;
  } else if (isAll) {
    targetMonth = 12;
  }

  const periodTransactions: StatementTransaction[] = [];
  const ytdTransactions: StatementTransaction[] = [];

  let periodTotal = 0;
  let ytdTotal = 0;

  const periodByPartner = { bunny: 0, monkey: 0, joint: 0 };
  const ytdByPartner = { bunny: 0, monkey: 0, joint: 0 };
  const periodByCategory: Record<string, number> = {};
  const ytdByCategory: Record<string, number> = {};

  sanitized.forEach((tx) => {
    if (!tx) return;
    const amount = Number(tx.amount) || 0;
    const cat = tx.assignedCategory || 'Uncategorized';

    // Check statement period match
    const txPeriod = tx.statementPeriod || (tx.date && tx.date.length >= 7 ? tx.date.slice(0, 7) : '2026-09');
    let txY = NaN;
    let txM = NaN;
    if (txPeriod && /^\d{4}-\d{2}/.test(txPeriod)) {
      const parts = txPeriod.split('-');
      txY = parseInt(parts[0], 10);
      txM = parseInt(parts[1], 10);
    } else if (tx.date && /^\d{4}-\d{2}/.test(tx.date)) {
      const parts = tx.date.split('-');
      txY = parseInt(parts[0], 10);
      txM = parseInt(parts[1], 10);
    }

    // Is this transaction in the selected statement period?
    const inPeriod = isAll ? true : (txPeriod === periodId);
    if (inPeriod) {
      periodTransactions.push(tx);
      periodTotal += amount;
      if (tx.partner === 'bunny') periodByPartner.bunny += amount;
      else if (tx.partner === 'monkey') periodByPartner.monkey += amount;
      else periodByPartner.joint += amount;

      periodByCategory[cat] = (periodByCategory[cat] || 0) + amount;
    }

    // Is this transaction Year-To-Date (same calendar year, up to and including target statement month)?
    const inYtd = isAll ? true : (!isNaN(txY) && !isNaN(txM) ? (txY === targetYear && txM <= targetMonth) : true);
    if (inYtd) {
      ytdTransactions.push(tx);
      ytdTotal += amount;
      if (tx.partner === 'bunny') ytdByPartner.bunny += amount;
      else if (tx.partner === 'monkey') ytdByPartner.monkey += amount;
      else ytdByPartner.joint += amount;

      ytdByCategory[cat] = (ytdByCategory[cat] || 0) + amount;
    }
  });

  return {
    periodId,
    periodTotal,
    periodCount: periodTransactions.length,
    periodByPartner,
    periodByCategory,
    periodTransactions,
    ytdTotal,
    ytdCount: ytdTransactions.length,
    ytdByPartner,
    ytdByCategory,
    ytdTransactions,
    targetYear,
    targetMonth,
    elapsedMonths: Math.max(1, Math.min(12, targetMonth || 1)),
  };
}

/**
 * Checks if a transaction belongs to a given budget category
 */
function matchesBudgetCategory(
  tx: StatementTransaction,
  budgetCategory: string
): boolean {
  const cat = tx.assignedCategory;
  const m = tx.merchant.toLowerCase();

  switch (budgetCategory) {
    case 'Groceries':
      return (
        cat === 'Groceries' ||
        m.includes('foods') ||
        m.includes('market') ||
        m.includes('grocery') ||
        m.includes('safeway') ||
        m.includes('trader joe') ||
        m.includes('costco') ||
        m.includes('produce') ||
        m.includes('superstore')
      );

    case 'Dining':
      return (
        cat === 'Dining' ||
        m.includes('cafe') ||
        m.includes('restaurant') ||
        m.includes('starbucks') ||
        m.includes('dining') ||
        m.includes('omakase') ||
        m.includes('ramen') ||
        m.includes('bistro')
      );

    case 'Housing':
      return (
        cat === 'Housing' ||
        cat === 'Household' ||
        m.includes('mortgage') ||
        m.includes('property tax') ||
        m.includes('strata') ||
        m.includes('rent')
      );

    case 'Childcare':
      return (
        cat === 'Childcare' ||
        cat === 'Kid/Family' ||
        m.includes('montessori') ||
        m.includes('daycare') ||
        m.includes('swim') ||
        m.includes('tutor') ||
        m.includes('piano')
      );

    case 'Utilities':
      return (
        cat === 'Utilities' ||
        cat === 'Utilities/Subs' ||
        m.includes('hydro') ||
        m.includes('electric') ||
        m.includes('water') ||
        m.includes('gas') ||
        m.includes('enbridge')
      );

    case 'Subscriptions':
      return (
        cat === 'Subscriptions' ||
        m.includes('netflix') ||
        m.includes('spotify') ||
        m.includes('apple') ||
        m.includes('internet') ||
        m.includes('fibre') ||
        m.includes('mobile') ||
        m.includes('cloud')
      );

    case 'Transport':
      return (
        cat === 'Transport' ||
        m.includes('chevron') ||
        m.includes('shell') ||
        m.includes('gas station') ||
        m.includes('auto insurance') ||
        m.includes('ev charging') ||
        m.includes('transit')
      );

    case 'Insurance':
      return (
        cat === 'Insurance' ||
        m.includes('insurance') ||
        m.includes('sun life') ||
        m.includes('manulife')
      );

    case 'Debt':
      return (
        cat === 'Debt' ||
        m.includes('loan') ||
        m.includes('financing') ||
        m.includes('vehicle financing')
      );

    case 'Travel':
      return (
        cat === 'Travel' ||
        m.includes('air canada') ||
        m.includes('flight') ||
        m.includes('hotel') ||
        m.includes('airbnb') ||
        m.includes('shinkansen') ||
        m.includes('uber') ||
        m.includes('lyft')
      );

    case 'Personal':
    case 'Discretionary':
      return (
        cat === 'Personal (Bunny)' ||
        cat === 'Personal (Monkey)' ||
        cat === 'Discretionary' ||
        m.includes('zara') ||
        m.includes('clothing') ||
        m.includes('ceramics') ||
        m.includes('shopping')
      );

    default:
      return cat === budgetCategory;
  }
}

/**
 * Calculates category-by-category Actuals vs. Budget for Period and YTD
 */
export function calculateBudgetVsActuals(
  expenses: HouseholdExpense[],
  transactions: StatementTransaction[],
  periodId: string
) {
  const periodData = calculatePeriodAndYtdActuals(transactions, periodId);
  const elapsedMonths = Math.max(1, periodData.elapsedMonths);

  // Group expenses by standard category
  const standardCategories: {
    key: string;
    label: string;
    defaultBudget: number;
    color: string;
  }[] = [
    { key: 'Groceries', label: 'Groceries & Household Staples', defaultBudget: 1300, color: '#10b981' },
    { key: 'Dining', label: 'Dining Out, Date Nights & Coffee', defaultBudget: 650, color: '#f43f5e' },
    { key: 'Housing', label: 'Housing, Mortgage & Property Tax', defaultBudget: 3930, color: '#ec4899' },
    { key: 'Childcare', label: 'Childcare, Montessori & Lessons', defaultBudget: 2030, color: '#8b5cf6' },
    { key: 'Utilities', label: 'Utilities (Hydro, Gas, Water)', defaultBudget: 285, color: '#06b6d4' },
    { key: 'Subscriptions', label: 'Telecom, Gigabit & Streaming', defaultBudget: 290, color: '#6366f1' },
    { key: 'Transport', label: 'Auto Insurance, EV Loan & Fuel', defaultBudget: 760, color: '#3b82f6' },
    { key: 'Debt', label: 'Debt & Vehicle Financing', defaultBudget: 450, color: '#f97316' },
    { key: 'Insurance', label: 'Life & Critical Illness Insurance', defaultBudget: 340, color: '#a855f7' },
    { key: 'Travel', label: 'Travel & Vacation Spending', defaultBudget: 500, color: '#14b8a6' },
    { key: 'Discretionary', label: 'Personal Discretionary (Bunny & Monkey)', defaultBudget: 400, color: '#eab308' },
  ];

  // Calculate monthly budget per category from state expenses
  const categoryBudgets: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryBudgets[e.category] = (categoryBudgets[e.category] || 0) + e.monthlyAmount;
  });

  const assignedPeriodTxIds = new Set<string>();
  const assignedYtdTxIds = new Set<string>();

  const categoryComparisons = standardCategories.map((catConfig) => {
    const monthlyBudget = categoryBudgets[catConfig.key] || catConfig.defaultBudget;
    const ytdBudget = monthlyBudget * elapsedMonths;

    const periodMatchingTxs = periodData.periodTransactions.filter((tx) => {
      if (assignedPeriodTxIds.has(tx.id)) return false;
      const match = matchesBudgetCategory(tx, catConfig.key);
      if (match) assignedPeriodTxIds.add(tx.id);
      return match;
    });

    const ytdMatchingTxs = periodData.ytdTransactions.filter((tx) => {
      if (assignedYtdTxIds.has(tx.id)) return false;
      const match = matchesBudgetCategory(tx, catConfig.key);
      if (match) assignedYtdTxIds.add(tx.id);
      return match;
    });

    const periodActual = periodMatchingTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const ytdActual = ytdMatchingTxs.reduce((sum, tx) => sum + tx.amount, 0);

    const periodVariance = monthlyBudget - periodActual; // positive = under budget, negative = over
    const periodPercent = monthlyBudget > 0 ? (periodActual / monthlyBudget) * 100 : 0;

    const ytdVariance = ytdBudget - ytdActual;
    const ytdPercent = ytdBudget > 0 ? (ytdActual / ytdBudget) * 100 : 0;

    return {
      category: catConfig.key,
      label: catConfig.label,
      color: catConfig.color,
      monthlyBudget,
      periodActual,
      periodVariance,
      periodPercent,
      ytdBudget,
      ytdActual,
      ytdVariance,
      ytdPercent,
      periodTransactions: periodMatchingTxs,
      ytdTransactions: ytdMatchingTxs,
    };
  });

  // Check any remaining unassigned transactions
  const unassignedPeriodTxs = periodData.periodTransactions.filter((tx) => !assignedPeriodTxIds.has(tx.id));
  const unassignedYtdTxs = periodData.ytdTransactions.filter((tx) => !assignedYtdTxIds.has(tx.id));

  if (unassignedPeriodTxs.length > 0 || unassignedYtdTxs.length > 0) {
    const unassignedPeriodActual = unassignedPeriodTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const unassignedYtdActual = unassignedYtdTxs.reduce((sum, tx) => sum + tx.amount, 0);
    categoryComparisons.push({
      category: 'Uncategorized',
      label: 'Other / Miscellaneous Actuals',
      color: '#94a3b8',
      monthlyBudget: 0,
      periodActual: unassignedPeriodActual,
      periodVariance: -unassignedPeriodActual,
      periodPercent: 100,
      ytdBudget: 0,
      ytdActual: unassignedYtdActual,
      ytdVariance: -unassignedYtdActual,
      ytdPercent: 100,
      periodTransactions: unassignedPeriodTxs,
      ytdTransactions: unassignedYtdTxs,
    });
  }

  // Master Overall Totals
  const totalMonthlyBudget = categoryComparisons.reduce((s, c) => s + c.monthlyBudget, 0);
  const totalPeriodActual = periodData.periodTotal;
  const totalPeriodVariance = totalMonthlyBudget - totalPeriodActual;
  const totalPeriodPercent =
    totalMonthlyBudget > 0 ? (totalPeriodActual / totalMonthlyBudget) * 100 : 0;

  const totalYtdBudget = totalMonthlyBudget * elapsedMonths;
  const totalYtdActual = periodData.ytdTotal;
  const totalYtdVariance = totalYtdBudget - totalYtdActual;
  const totalYtdPercent = totalYtdBudget > 0 ? (totalYtdActual / totalYtdBudget) * 100 : 0;

  return {
    periodId,
    targetYear: periodData.targetYear,
    targetMonth: periodData.targetMonth,
    elapsedMonths,
    categories: categoryComparisons,
    overall: {
      monthlyBudget: totalMonthlyBudget,
      periodActual: totalPeriodActual,
      periodVariance: totalPeriodVariance,
      periodPercent: totalPeriodPercent,
      ytdBudget: totalYtdBudget,
      ytdActual: totalYtdActual,
      ytdVariance: totalYtdVariance,
      ytdPercent: totalYtdPercent,
      periodByPartner: periodData.periodByPartner,
      ytdByPartner: periodData.ytdByPartner,
      periodTxCount: periodData.periodCount,
      ytdTxCount: periodData.ytdCount,
    },
  };
}
