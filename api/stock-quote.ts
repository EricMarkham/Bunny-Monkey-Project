// Vercel Serverless Function Handler (/api/stock-quote)
import type { IncomingMessage, ServerResponse } from 'http';
import { fetchStockQuote } from '../src/utils/stockQuoteFetcher.js';

export default async function handler(req: any, res: any) {
  // Support both Next.js/Vercel request structures
  const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
  const symbol = (req.query?.symbol as string) || url.searchParams.get('symbol');

  if (!symbol || !symbol.trim()) {
    if (res.status) {
      return res.status(400).json({
        error: "Missing required query parameter 'symbol'. Example: /api/stock-quote?symbol=VDY.TO",
      });
    }
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        error: "Missing required query parameter 'symbol'. Example: /api/stock-quote?symbol=VDY.TO",
      })
    );
  }

  try {
    const quote = await fetchStockQuote(symbol);
    if (res.status) {
      return res.status(200).json(quote);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(quote));
  } catch (err: any) {
    if (res.status) {
      return res.status(404).json({
        error: err.message || `Failed to fetch quote for symbol '${symbol}'`,
        symbol: symbol.trim().toUpperCase(),
      });
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        error: err.message || `Failed to fetch quote for symbol '${symbol}'`,
        symbol: symbol.trim().toUpperCase(),
      })
    );
  }
}
