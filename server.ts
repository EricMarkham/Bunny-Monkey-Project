import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { fetchStockQuote } from './src/utils/stockQuoteFetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Route: /api/stock-quote?symbol=XYZ
  app.get('/api/stock-quote', async (req, res) => {
    const symbol = req.query.symbol as string;

    if (!symbol || !symbol.trim()) {
      return res.status(400).json({
        error: "Missing required query parameter 'symbol'. Example: /api/stock-quote?symbol=VDY.TO or /api/stock-quote?symbol=SCHD",
      });
    }

    try {
      const quote = await fetchStockQuote(symbol);
      return res.json(quote);
    } catch (err: any) {
      console.error(`[StockQuote API] Error fetching symbol '${symbol}':`, err.message);
      return res.status(404).json({
        error: err.message || `Failed to fetch quote for symbol '${symbol}'`,
        symbol: symbol.trim().toUpperCase(),
      });
    }
  });

  // Vite middleware for dev or static server for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
