import YahooFinance from 'yahoo-finance2';

export interface StockQuoteResult {
  symbol: string;
  name: string;
  currency: 'CAD' | 'USD';
  currentPrice: number;
  divPerShare: number;
  yieldPercent: number;
  frequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
  nextExDate: string;
  payoutMonths: number[];
}

let yfInstance: any = null;

function getYf(): any {
  if (!yfInstance) {
    // Suppress developer survey and deprecated notices
    yfInstance = new (YahooFinance as any)({
      suppressNotices: ['yahooSurvey', 'ripHistorical'],
    });
  }
  return yfInstance;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 7000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function fetchStockQuote(rawSymbol: string): Promise<StockQuoteResult> {
  const normSymbol = (rawSymbol || '').trim().toUpperCase();
  if (!normSymbol) {
    throw new Error('Ticker symbol is required');
  }

  const yf = getYf();

  // One year ago ISO date string for dividends history
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const period1Str = oneYearAgo.toISOString().split('T')[0];

  let chartData: any = null;
  try {
    chartData = await withTimeout(
      yf.chart(normSymbol, { period1: period1Str, events: 'div' }),
      6000
    );
  } catch (err: any) {
    throw new Error(
      `Ticker '${normSymbol}' was not found. If this is a Canadian stock or ETF, append '.TO' (e.g., VDY.TO, ENB.TO). For US stocks, use standard symbols (e.g., SCHD, AAPL).`
    );
  }

  const meta = chartData?.meta || {};
  let quoteData: any = null;
  try {
    quoteData = await yf.quote(meta.symbol || normSymbol);
  } catch {
    // Ignore quote fallback error if chart data succeeded
  }

  const name =
    meta.longName ||
    meta.shortName ||
    quoteData?.longName ||
    quoteData?.shortName ||
    meta.symbol ||
    normSymbol;

  const rawCurrency = (meta.currency || quoteData?.currency || 'CAD').toUpperCase();
  const currency: 'CAD' | 'USD' = rawCurrency.includes('USD') ? 'USD' : 'CAD';

  const currentPrice = Number(meta.regularMarketPrice || quoteData?.regularMarketPrice || 0);

  const rawDividends = chartData?.events?.dividends || [];
  const sortedDivs = [...rawDividends].sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let divPerShare = 0;
  let frequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual' = 'Quarterly';
  let nextExDate = '';
  let payoutMonths: number[] = [3, 6, 9, 12];

  if (sortedDivs.length > 0) {
    const monthsSet = new Set<number>();
    sortedDivs.forEach((d: any) => {
      const m = new Date(d.date).getUTCMonth() + 1;
      monthsSet.add(m);
    });
    payoutMonths = Array.from(monthsSet).sort((a, b) => a - b);

    const count = sortedDivs.length;
    if (count >= 8) {
      frequency = 'Monthly';
    } else if (count >= 3) {
      frequency = 'Quarterly';
    } else if (count === 2) {
      frequency = 'Semi-Annual';
    } else if (count === 1) {
      frequency = 'Annual';
    }

    const lastDiv = sortedDivs[sortedDivs.length - 1];
    if (frequency === 'Monthly') {
      const recent = sortedDivs.slice(-12);
      divPerShare = recent.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
    } else if (frequency === 'Quarterly') {
      const recent = sortedDivs.slice(-4);
      divPerShare = recent.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
    } else if (frequency === 'Semi-Annual') {
      const recent = sortedDivs.slice(-2);
      divPerShare = recent.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
    } else {
      divPerShare = Number(lastDiv.amount) || 0;
    }

    if (quoteData?.exDividendDate) {
      nextExDate = new Date(quoteData.exDividendDate).toISOString().split('T')[0];
    } else {
      const lastDate = new Date(lastDiv.date);
      const proj = new Date(lastDate);
      if (frequency === 'Monthly') proj.setMonth(proj.getMonth() + 1);
      else if (frequency === 'Quarterly') proj.setMonth(proj.getMonth() + 3);
      else if (frequency === 'Semi-Annual') proj.setMonth(proj.getMonth() + 6);
      else proj.setFullYear(proj.getFullYear() + 1);
      nextExDate = proj.toISOString().split('T')[0];
    }
  } else if (quoteData?.trailingAnnualDividendRate || quoteData?.dividendRate) {
    divPerShare = Number(quoteData.trailingAnnualDividendRate || quoteData.dividendRate || 0);
    if (quoteData?.exDividendDate) {
      nextExDate = new Date(quoteData.exDividendDate).toISOString().split('T')[0];
    }
  }

  const yieldPercent = currentPrice > 0 ? (divPerShare / currentPrice) * 100 : 0;

  return {
    symbol: meta.symbol || normSymbol,
    name,
    currency,
    currentPrice: Math.round(currentPrice * 100) / 100,
    divPerShare: Math.round(divPerShare * 1000) / 1000,
    yieldPercent: Math.round(yieldPercent * 100) / 100,
    frequency,
    nextExDate: nextExDate || new Date().toISOString().split('T')[0],
    payoutMonths: payoutMonths.length > 0 ? payoutMonths : [3, 6, 9, 12],
  };
}
