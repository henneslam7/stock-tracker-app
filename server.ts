import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

console.log("Starting server process...");
dotenv.config();

const yahooFinance = new YahooFinance({ queue: { concurrency: 4 } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PERIOD_CONFIG: Record<string, { months: number; interval: '1d' | '1wk' }> = {
  '1m': { months: 1,  interval: '1d' },
  '3m': { months: 3,  interval: '1d' },
  '6m': { months: 6,  interval: '1d' },
  '1y': { months: 12, interval: '1wk' },
};

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey: key });
}

async function startServer() {
  console.log("Initializing Express...");
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '2mb' }));

  // ── Stock APIs ───────────────────────────────────────────────────────────

  app.get('/api/search', async (req: any, res: any) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);
      const result = await yahooFinance.search(query, { quotesCount: 6, newsCount: 0 }, { validateResult: false });
      // @ts-ignore
      res.json(result.quotes.filter((q: any) => ['EQUITY','ETF','INDEX'].includes(q.quoteType)));
    } catch (e: any) {
      console.error('Search error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/quote', async (req: any, res: any) => {
    try {
      const symbols = ((req.query.symbols as string) || '').split(',').filter(Boolean);
      if (symbols.length === 0) return res.json([]);
      const result = await yahooFinance.quote(symbols, {}, { validateResult: false });
      res.json(Array.isArray(result) ? result : [result]);
    } catch (e: any) {
      console.error('Quote error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/info', async (req: any, res: any) => {
    try {
      const symbol = req.query.symbol as string;
      const period = (req.query.period as string) || '1m';
      const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1m'];

      const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
      const now = new Date();
      const period1 = new Date(now.getFullYear(), now.getMonth() - config.months, now.getDate());

      let chart: any[] = [];
      try { chart = await yahooFinance.historical(symbol, { period1, period2: now, interval: config.interval }, { validateResult: false }); }
      catch (err) { console.error("Chart fetch error for", symbol, err); }

      let news: any[] = [];
      try {
        const searchData = await yahooFinance.search(symbol, { newsCount: 5, quotesCount: 0 }, { validateResult: false });
        // @ts-ignore
        news = searchData.news || [];
      } catch (err) { console.error("News fetch error:", err); }

      let quoteSummary = null;
      try { quoteSummary = await yahooFinance.quoteSummary(symbol, { modules: ['financialData','defaultKeyStatistics','summaryDetail'] }, { validateResult: false }); }
      catch (err) { console.error("QuoteSummary fetch error:", err); }

      res.json({ quote, chart, news, quoteSummary });
    } catch (e: any) {
      console.error('Info error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Gemini AI APIs ────────────────────────────────────────────────────────

  app.post('/api/analyze', async (req: any, res: any) => {
    try {
      const { stock, historicalData, news, quoteSummary, userEntryPrice } = req.body;
      const ai = getGeminiClient();

      const prompt = `
You are a quantitative stock analyst AI. Output strictly as JSON with no markdown wrappers.
Write 'summary', 'opportunities', 'risks' in Cantonese (Traditional Chinese).

Stock: ${stock.symbol} (${stock.name})
Current Price: $${stock.price}
User Entry Price: $${userEntryPrice}
Key Stats: PE=${stock.peRatio}, 52W=${stock.low52w}-${stock.high52w}, Yield=${stock.dividendYield}, Beta=${stock.beta}
Financials: ${JSON.stringify(quoteSummary)}
Chart (last 15 candles): ${JSON.stringify(historicalData ? historicalData.slice(-15) : [])}
Headlines: ${JSON.stringify(news ? news.map((n: any) => n.title) : [])}

Guidelines:
1. buyInPrice: based on CURRENT PRICE ($${stock.price}) and technical support levels.
2. sellingPrice: profit target from user entry ($${userEntryPrice}) aligned to resistance.
3. cutLossPrice: stop-loss BELOW current price, typically 5-15% down from current.

Output JSON (no markdown):
{
  "sentiment": "High"|"Mild"|"Low",
  "priceTarget": number,
  "buyInPrice": number,
  "sellingPrice": number,
  "cutLossPrice": number,
  "confidence": number (0-1),
  "summary": string (2 sentences, Cantonese),
  "opportunities": string[] (Cantonese),
  "risks": string[] (Cantonese)
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        ...parsed,
        cutLossPrice: parsed.cutLossPrice ?? stock.price * 0.92,
      });
    } catch (e: any) {
      console.error('Analyze error:', e.message);
      res.status(500).json({
        sentiment: 'Mild',
        priceTarget: req.body.stock?.price * 1.05 || 0,
        buyInPrice:  req.body.stock?.price * 0.95 || 0,
        sellingPrice: req.body.stock?.price * 1.10 || 0,
        cutLossPrice: req.body.stock?.price * 0.92 || 0,
        confidence: 0.5,
        summary: 'Analysis unavailable.',
        risks: ['Market volatility'],
        opportunities: ['Long term growth'],
      });
    }
  });

  app.get('/api/recommendations', async (_req: any, res: any) => {
    try {
      const ai = getGeminiClient();

      const prompt = `
Provide exactly 5 recommendations for each of 3 categories (15 total):
1. US Market Equities
2. HK Market Equities (symbol ends in .HK, e.g., 0700.HK)
3. Global ETFs (e.g., SPY, QQQ)

Output pure JSON array, no markdown. 'reason' must be in Cantonese.
[{
  "symbol": string,
  "name": string,
  "market": "US"|"HK"|"ETF",
  "reason": string (Cantonese),
  "indicator": "High"|"Mild"|"Low",
  "technicals": { "rsi": string, "macd": string }
}]`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      res.json(JSON.parse(response.text || '[]'));
    } catch (e: any) {
      console.error('Recommendations error:', e.message);
      res.json([]);
    }
  });

  // ── Static / SPA ──────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const isDist = __dirname.endsWith('dist');
    const distPath = isDist ? __dirname : path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: any, res: any) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("FATAL: Server failed to start:", err);
  process.exit(1);
});
