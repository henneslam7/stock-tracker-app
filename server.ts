import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import dotenv from 'dotenv';
import fs from 'fs';

console.log("Starting server process...");
dotenv.config();

const yahooFinance = new YahooFinance({
  queue: { concurrency: 4 }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  console.log("Initializing Express...");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);
      const result = await yahooFinance.search(query, { quotesCount: 6, newsCount: 0 });
      // @ts-ignore
      res.json(result.quotes.filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX'));
    } catch (e: any) {
      console.error('Search error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/quote', async (req, res) => {
    try {
      const symbolsStr = (req.query.symbols as string) || '';
      const symbols = symbolsStr.split(',').filter(Boolean);
      if (symbols.length === 0) return res.json([]);
      
      const result = await yahooFinance.quote(symbols);
      res.json(Array.isArray(result) ? result : [result]);
    } catch (e: any) {
      console.error('Quote error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/info', async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const quote = await yahooFinance.quote(symbol);
      
      const now = new Date();
      const period1 = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      let chart = [];
      try {
          chart = await yahooFinance.historical(symbol, { period1, period2: now, interval: '1d' });
      } catch (err) {
          console.error("Chart fetch error for", symbol, err);
      }
      
      let news = [];
      try {
          const searchData = await yahooFinance.search(symbol, { newsCount: 5, quotesCount: 0 });
          // @ts-ignore
          news = searchData.news || [];
      } catch (err) {
          console.error("News fetch error for", symbol, err);
      }

      let quoteSummary = null;
      try {
          quoteSummary = await yahooFinance.quoteSummary(symbol, { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] });
      } catch(err) {
          console.error("Quote summary fetch error for", symbol, err);
      }
      
      res.json({ quote, chart, news, quoteSummary });
    } catch (e: any) {
      console.error('Info error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Determine path based on running from dist folder or src
    const isDist = __dirname.endsWith('dist');
    const distPath = isDist ? __dirname : path.join(__dirname, 'dist');
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("FATAL: Server failed to start:", err);
  process.exit(1);
});
