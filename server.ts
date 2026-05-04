import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

console.log("Starting server process...");
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Finnhub ──────────────────────────────────────────────────────────────────

const FINNHUB = 'https://finnhub.io/api/v1';

function fhKey() {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error('FINNHUB_API_KEY not set');
  return k;
}

async function fhFetch(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${FINNHUB}${path}${sep}token=${fhKey()}`);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json();
}

// 1-hour in-memory cache for slow-changing data (profile, metrics)
const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 60 * 60 * 1000;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  cache[key] = { data, ts: Date.now() };
  return data;
}

const getProfile = (symbol: string) =>
  cached(`profile:${symbol}`, () => fhFetch(`/stock/profile2?symbol=${symbol}`));

const getMetrics = (symbol: string) =>
  cached(`metrics:${symbol}`, () =>
    fhFetch(`/stock/metric?symbol=${symbol}&metric=all`).then((r: any) => r.metric || {})
  );

// ── Yahoo Finance (HK stocks) ─────────────────────────────────────────────────

const isHK = (sym: string) => sym.toUpperCase().endsWith('.HK');

async function yhFetch(symbol: string, range: string, interval: string): Promise<any> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}: ${symbol}`);
  return res.json();
}

const HK_PERIOD_MAP: Record<string, { range: string; interval: string }> = {
  '1m': { range: '1mo', interval: '1d' },
  '3m': { range: '3mo', interval: '1d' },
  '6m': { range: '6mo', interval: '1d' },
  '1y': { range: '1y',  interval: '1wk' },
};

function normalizeYahooQuote(symbol: string, meta: any) {
  const price     = meta.regularMarketPrice || 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
  const change    = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : (meta.regularMarketChangePercent || 0);
  return {
    symbol,
    longName: meta.shortName || meta.longName || symbol,
    shortName: meta.shortName || symbol,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePct,
    marketCap: meta.marketCap || null,
    regularMarketVolume: meta.regularMarketVolume || null,
    quoteType: 'EQUITY',
    trailingPE: null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
    trailingAnnualDividendYield: null,
    beta: null,
  };
}

// ── Period config ─────────────────────────────────────────────────────────────

const PERIOD_CONFIG: Record<string, { months: number; resolution: string }> = {
  '1m': { months: 1,  resolution: 'D' },
  '3m': { months: 3,  resolution: 'D' },
  '6m': { months: 6,  resolution: 'D' },
  '1y': { months: 12, resolution: 'W' },
};

// ── Gemini ────────────────────────────────────────────────────────────────────

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey: key });
}

async function startServer() {
  console.log("Initializing Express...");
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // ── Stock APIs ───────────────────────────────────────────────────────────────

  app.get('/api/search', async (req: any, res: any) => {
    const query = req.query.q as string;
    if (!query) return res.json([]);
    try {
      const fhData = await fhFetch(`/search?q=${encodeURIComponent(query)}`);
      let results: any[] = (fhData.result || [])
        .filter((r: any) => ['Common Stock', 'ETP', 'ADR'].includes(r.type))
        .slice(0, 6)
        .map((r: any) => ({
          symbol: r.symbol,
          shortName: r.description,
          longName: r.description,
          exchDisp: r.primaryExchange || '',
          quoteType: r.type === 'ETP' ? 'ETF' : 'EQUITY',
        }));

      // Supplement with Yahoo Finance for HK stocks
      if (results.length < 3 || /\.hk$/i.test(query)) {
        try {
          const yhRes = await fetch(
            `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0&listsCount=0`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (yhRes.ok) {
            const yhData = await yhRes.json();
            const seen = new Set(results.map((r: any) => r.symbol));
            for (const q of (yhData.quotes || []) as any[]) {
              if (!q.symbol) continue;
              if (q.symbol.endsWith('.HK') || results.length < 3) {
                if (!seen.has(q.symbol)) {
                  results.push({
                    symbol: q.symbol,
                    shortName: q.shortname || q.longname || q.symbol,
                    longName: q.longname || q.shortname || q.symbol,
                    exchDisp: q.exchange || '',
                    quoteType: q.typeDisp || 'EQUITY',
                  });
                  seen.add(q.symbol);
                }
              }
            }
            results = results.slice(0, 8);
          }
        } catch { /* ignore fallback failure */ }
      }

      res.json(results);
    } catch (e: any) {
      console.error('Search error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/quote', async (req: any, res: any) => {
    const symbols = ((req.query.symbols as string) || '').split(',').filter(Boolean);
    if (!symbols.length) return res.json([]);
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          if (isHK(symbol)) {
            const data = await yhFetch(symbol, '5d', '1d');
            const meta = data.chart?.result?.[0]?.meta || {};
            return normalizeYahooQuote(symbol, meta);
          }
          const [quote, profile, metrics] = await Promise.all([
            fhFetch(`/quote?symbol=${symbol}`),
            getProfile(symbol).catch(() => ({})),
            getMetrics(symbol).catch(() => ({})),
          ]);
          // Return Yahoo Finance-compatible field names so stockService.ts needs no changes
          return {
            symbol,
            longName: (profile as any).name || symbol,
            shortName: (profile as any).name || symbol,
            regularMarketPrice: (quote as any).c || 0,
            regularMarketChange: (quote as any).d || 0,
            regularMarketChangePercent: (quote as any).dp || 0,
            marketCap: (profile as any).marketCapitalization
              ? (profile as any).marketCapitalization * 1e6
              : null,
            regularMarketVolume: null,
            quoteType: 'EQUITY',
            trailingPE: (metrics as any).peNormalizedAnnual || null,
            fiftyTwoWeekHigh: (metrics as any)['52WeekHigh'] || null,
            fiftyTwoWeekLow: (metrics as any)['52WeekLow'] || null,
            trailingAnnualDividendYield: (metrics as any).dividendYieldIndicatedAnnual
              ? (metrics as any).dividendYieldIndicatedAnnual / 100
              : null,
            beta: (metrics as any).beta || null,
          };
        })
      );
      res.json(results);
    } catch (e: any) {
      console.error('Quote error:', e.message);
      res.json([]);
    }
  });

  app.get('/api/info', async (req: any, res: any) => {
    const symbol = req.query.symbol as string;
    const period = (req.query.period as string) || '1m';

    // HK stocks: Yahoo Finance v8 chart API
    if (isHK(symbol)) {
      try {
        const { range, interval } = HK_PERIOD_MAP[period] ?? HK_PERIOD_MAP['1m'];
        const data = await yhFetch(symbol, range, interval);
        const result = data.chart?.result?.[0];
        const meta = result?.meta || {};
        const timestamps: number[] = result?.timestamp || [];
        const quotes = result?.indicators?.quote?.[0] || {};
        const chart = timestamps
          .map((ts: number, i: number) => ({
            date:   new Date(ts * 1000),
            close:  quotes.close?.[i],
            open:   quotes.open?.[i],
            high:   quotes.high?.[i],
            low:    quotes.low?.[i],
            volume: quotes.volume?.[i],
          }))
          .filter((c: any) => c.close != null);
        const quoteNorm = normalizeYahooQuote(symbol, meta);
        res.json({ quote: quoteNorm, chart, news: [], quoteSummary: null });
      } catch (e: any) {
        console.error('HK info error:', e.message);
        res.status(500).json({ error: e.message });
      }
      return;
    }

    const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1m'];
    const toTs   = Math.floor(Date.now() / 1000);
    const fromTs = toTs - config.months * 30 * 24 * 3600;

    try {
      const [quote, profile] = await Promise.all([
        fhFetch(`/quote?symbol=${symbol}`),
        getProfile(symbol).catch(() => ({})),
      ]);

      // Normalised quote object for AI prompt
      const quoteNorm = {
        symbol,
        regularMarketPrice: (quote as any).c || 0,
        regularMarketChange: (quote as any).d || 0,
        regularMarketChangePercent: (quote as any).dp || 0,
        longName: (profile as any).name || symbol,
      };

      let chart: any[] = [];
      try {
        const candles = await fhFetch(
          `/stock/candle?symbol=${symbol}&resolution=${config.resolution}&from=${fromTs}&to=${toTs}`
        );
        if ((candles as any).s === 'ok' && (candles as any).t) {
          chart = (candles as any).t.map((ts: number, i: number) => ({
            date: new Date(ts * 1000),
            close: (candles as any).c[i],
            open:  (candles as any).o?.[i],
            high:  (candles as any).h?.[i],
            low:   (candles as any).l?.[i],
            volume:(candles as any).v?.[i],
          }));
        }
      } catch (err) { console.error('Chart error:', err); }

      let news: any[] = [];
      try {
        const fromDate = new Date(fromTs * 1000).toISOString().split('T')[0];
        const toDate   = new Date().toISOString().split('T')[0];
        const rawNews  = await fhFetch(
          `/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}`
        );
        news = ((rawNews as any[]) || []).slice(0, 5).map((n: any) => ({
          title: n.headline,
          url: n.url,
        }));
      } catch (err) { console.error('News error:', err); }

      let quoteSummary: any = null;
      try {
        const metrics = await getMetrics(symbol);
        quoteSummary = {
          financialData: {},
          defaultKeyStatistics: {
            beta: (metrics as any).beta,
            trailingPE: (metrics as any).peNormalizedAnnual,
            forwardPE:  (metrics as any).peTTM,
          },
          summaryDetail: {
            dividendYield: (metrics as any).dividendYieldIndicatedAnnual,
            marketCap: (profile as any).marketCapitalization
              ? (profile as any).marketCapitalization * 1e6
              : null,
          },
        };
      } catch (err) { console.error('Metrics error:', err); }

      res.json({ quote: quoteNorm, chart, news, quoteSummary });
    } catch (e: any) {
      console.error('Info error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Gemini AI APIs ────────────────────────────────────────────────────────────

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

  // ── Static / SPA ─────────────────────────────────────────────────────────────

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
