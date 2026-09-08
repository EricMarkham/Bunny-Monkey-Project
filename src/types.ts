export type PartnerId = 'bunny' | 'monkey';

export interface Partner {
  id: PartnerId;
  name: string;
  avatar: string;
  grossMonthlyIncome: number;
  netMonthlyIncome: number;
  color: string;
  accentColor: string;
}

export type ExpenseSplitMethod = 'proportional' | 'equal' | 'custom' | 'fixed_dollar';

export type ExpenseCategory =
  | 'Housing'
  | 'Childcare'
  | 'Insurance'
  | 'Utilities'
  | 'Transport'
  | 'Debt'
  | 'Groceries'
  | 'Subscriptions'
  | 'Dining'
  | 'Discretionary';

export interface HouseholdExpense {
  id: string;
  title: string;
  category: ExpenseCategory;
  isFixed: boolean; // true = fixed, false = variable
  monthlyAmount: number;
  splitMethod: ExpenseSplitMethod;
  customBunnyPercent?: number; // e.g. 60
  customMonkeyPercent?: number; // e.g. 40
  fixedPayer?: 'bunny' | 'monkey'; // which partner pays a fixed dollar amount
  fixedAmount?: number; // the fixed dollar amount paid (remainder to other partner)
  notes?: string;
}

export interface SinkingFund {
  id: string;
  name: string;
  category: 'Education' | 'Emergency' | 'Home' | 'Automotive' | 'Health' | 'Vacation';
  currentBalance: number;
  targetBalance: number;
  monthlyContribution: number;
  targetDate?: string;
  notes?: string;
}

export interface GamifiedMilestone {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  unlocked: boolean;
  unlockedDate?: string;
  rewardBadge: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
}

export type StatementCategory =
  | 'Groceries'
  | 'Dining'
  | 'Housing'
  | 'Household'
  | 'Childcare'
  | 'Kid/Family'
  | 'Utilities'
  | 'Subscriptions'
  | 'Utilities/Subs'
  | 'Transport'
  | 'Travel'
  | 'Insurance'
  | 'Debt'
  | 'Personal (Bunny)'
  | 'Personal (Monkey)'
  | 'Discretionary'
  | 'Uncategorized';

export type EcoCategory =
  | 'Flight'
  | 'Fuel/Gas'
  | 'Transit'
  | 'Groceries'
  | 'Fast Fashion'
  | 'Utilities'
  | 'Neutral';

export interface StatementTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  statementPeriod?: string; // e.g. "2026-08" (allows billing cycles spanning prior month days like 24-Jul to belong to August Statement)
  merchant: string;
  rawCategory?: string;
  assignedCategory: StatementCategory;
  amount: number;
  partner: 'bunny' | 'monkey' | 'joint';
  carbonEstimateKg?: number;
  ecoCategory?: EcoCategory;
  ecoTip?: string;
  isRecurring?: boolean;
}

export interface CategoryBudgetVsActual {
  category: ExpenseCategory | 'Travel' | 'Personal (Bunny)' | 'Personal (Monkey)' | 'Other';
  label: string;
  monthlyBudget: number;
  periodActual: number;
  periodVariance: number; // positive = under budget, negative = over budget
  periodPercent: number;
  ytdBudget: number;
  ytdActual: number;
  ytdVariance: number;
  ytdPercent: number;
  periodTransactions: StatementTransaction[];
  ytdTransactions: StatementTransaction[];
}

export type AccountType = 'TFSA' | 'RRSP' | 'Non-Registered' | 'RESP';
export type PayoutFrequency = 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
export type HoldingOwner = 'bunny' | 'monkey' | 'piggy' | 'joint';

export interface DividendHolding {
  id: string;
  symbol: string;
  name: string;
  accountType: AccountType;
  owner: HoldingOwner;
  currency: 'CAD' | 'USD';
  shares: number;
  avgCostPerShare: number;
  currentPrice: number;
  annualDividendPerShare: number;
  payoutFrequency: PayoutFrequency;
  payoutMonths: number[]; // 1 to 12
  nextExDividendDate: string;
  nextPayDate: string;
  sector: string;
  dripEnabled: boolean;
}

export type TabType = 'budget' | 'actuals' | 'statement' | 'dividends';

export interface HouseholdState {
  partners: {
    bunny: Partner;
    monkey: Partner;
  };
  expenses: HouseholdExpense[];
  sinkingFunds: SinkingFund[];
  milestones: GamifiedMilestone[];
  statementTransactions: StatementTransaction[];
  holdings: DividendHolding[];
  dripSettings: {
    investmentHorizonYears: number;
    monthlyContribution: number;
    expectedDgr: number; // Dividend growth rate %
    capitalGrowthRate: number; // Stock price appreciation %
    reinvestDividends: boolean;
  };
}
