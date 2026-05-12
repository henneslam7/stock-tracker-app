import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { initializeApp as initAdminApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

console.log("Starting server process...");
dotenv.config();

// ── Firebase Admin ────────────────────────────────────────────────────────────

function ensureAdminApp() {
  if (getApps().length) return;
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!svcJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  let parsed: any;
  try {
    parsed = JSON.parse(svcJson);
  } catch {
    // Render may base64-encode the value — try decoding first
    try {
      parsed = JSON.parse(Buffer.from(svcJson, 'base64').toString('utf8'));
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  initAdminApp({ credential: cert(parsed) });
}

function getAdminFirestore() {
  ensureAdminApp();
  return getFirestore(); // always default DB — named DB caused silent write failures
}

async function verifyToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing auth token');
  ensureAdminApp();
  return getAuth().verifyIdToken(authHeader.split(' ')[1]);
}

function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

// ── Stripe ────────────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key);
}

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
        // Primary: Yahoo Finance v8 chart (works without crumb for OHLCV)
        const { range, interval } = HK_PERIOD_MAP[period] ?? HK_PERIOD_MAP['1m'];
        const yhData = await yhFetch(symbol, range, interval);
        const yhResult = yhData.chart?.result?.[0];
        const timestamps: number[] = yhResult?.timestamp || [];
        const yhQuotes = yhResult?.indicators?.quote?.[0] || {};
        chart = timestamps
          .map((ts: number, i: number) => ({
            date:   new Date(ts * 1000),
            close:  yhQuotes.close?.[i],
            open:   yhQuotes.open?.[i],
            high:   yhQuotes.high?.[i],
            low:    yhQuotes.low?.[i],
            volume: yhQuotes.volume?.[i],
          }))
          .filter((c: any) => c.close != null);
      } catch (err) {
        console.error('Chart error (Yahoo):', err);
        // Fallback: Finnhub candles
        try {
          const candles = await fhFetch(
            `/stock/candle?symbol=${symbol}&resolution=${config.resolution}&from=${fromTs}&to=${toTs}`
          );
          if ((candles as any).s === 'ok' && (candles as any).t) {
            chart = (candles as any).t.map((ts: number, i: number) => ({
              date:   new Date(ts * 1000),
              close:  (candles as any).c[i],
              open:   (candles as any).o?.[i],
              high:   (candles as any).h?.[i],
              low:    (candles as any).l?.[i],
              volume: (candles as any).v?.[i],
            }));
          }
        } catch (err2) { console.error('Chart fallback error:', err2); }
      }

      let news: any[] = [];
      try {
        const fromDate = new Date(fromTs * 1000).toISOString().split('T')[0];
        const toDate   = new Date().toISOString().split('T')[0];
        const rawNews  = await fhFetch(
          `/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}`
        );
        news = ((rawNews as any[]) || []).slice(0, 10).map((n: any) => ({
          title: n.headline,
          summary: (n.summary || '').slice(0, 250),
          url: n.url,
          date: n.datetime ? new Date(n.datetime * 1000).toISOString().split('T')[0] : '',
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

      const newsText = (news || []).slice(0, 8)
        .map((n: any) => `• ${n.title}${n.summary ? ': ' + n.summary : ''}`)
        .join('\n') || 'No recent news.';

      const nameLC = (stock.name || '').toLowerCase();
      const symUC  = (stock.symbol || '').toUpperCase();

      // Detect any ETF (broad — name keywords or known tickers)
      const isETF =
        /\betf\b|\betn\b|\bfund\b|\btrust\b|\bdaily\b|proshares|direxion|tradr|ishares|spdr|vanguard|invesco|2x|3x|leveraged/i.test(nameLC) ||
        /^(SPY|QQQ|IWM|GLD|TLT|VTI|XLF|XLE|XLK|ARKK|TQQQ|UPRO|SPXL|SOXL|LABU|SQQQ|SPXS|SOXS|TZA|SDOW|UVXY|SH|PSQ|DOG|RWM|QID|SDS|SRTY|SMDD|LABD|TECS|FNGD|DRIP|SCO|DUG|OILD|HIBS|BERZ|WEBS|SNDQ|NVDQ|TSLS|AMDS|MSTU|MSTZ|NVDS|CONL|BITX|FNGU|BULZ|GOGLL|MSFO|AMDQ|CRWDQ|YINN|YANG|JNUG|JDST|DUST|NUGT|GUSH)$/.test(symUC);

      // Detect inverse / leveraged bear ETFs specifically
      const isInverse = (
        /bear|short|inverse|ultra short|-1x|-2x|-3x/i.test(nameLC) ||
        /^(SNDQ|NVDQ|TSLS|AMDS|MSTZ|NVDS|SQQQ|SPXS|SOXS|TZA|SDOW|UVXY|SH|PSQ|DOG|RWM|QID|SDS|SRTY|SMDD|LABD|TECS|FNGD|DRIP|SCO|DUG|OILD|HIBS|BERZ|WEBS|AMDQ|CRWDQ|YANG|JDST|DUST)$/.test(symUC)
      );

      // Determine if chart data is sufficient for meaningful technicals
      const chartLength = (historicalData || []).length;
      const hasSufficientChart = chartLength >= 15;

      const instrumentType = isInverse
        ? 'INVERSE / LEVERAGED BEAR ETF'
        : isETF
          ? 'EXCHANGE TRADED FUND (ETF)'
          : 'STOCK';

      const etfWarning = isETF
        ? `\n⚠️ INSTRUMENT TYPE: ${instrumentType}
${isETF ? '— This is an ETF, NOT a company stock. NEVER use the word "公司" (company) in any output field. Refer to it as "該ETF" or "此產品".' : ''}
${isInverse ? `— This ETF moves OPPOSITE to its benchmark.
  · Price RISES when the underlying market/sector FALLS
  · Price FALLS when the underlying market/sector RISES
  · sentiment "High" = short thesis is strong (market expected to keep falling)
  · buyInPrice  = best level to enter/add this inverse position
  · sellingPrice = target to exit with profit (market fallen enough)
  · cutLossPrice = stop-loss if market reverses upward (ETF price drops)
  · opportunities = reasons the market may fall further (supporting the short)
  · risks = reasons the market may recover (against the short thesis)` : ''}
` : '';

      const chartWarning = !hasSufficientChart
        ? `\n⚠️ Chart data is limited (${chartLength} candles only). Do NOT rely heavily on technical analysis. Focus on news catalysts and momentum instead.\n`
        : '';

      const prompt = `You are a senior quantitative analyst. Output ONLY raw JSON — no markdown, no code fences.
All text fields MUST be written in Traditional Chinese (Cantonese).
${etfWarning}${chartWarning}
═══ INSTRUMENT DATA ═══
Symbol: ${stock.symbol} (${stock.name})
Type: ${instrumentType}
Current Price: $${stock.price}
User Entry Price: $${userEntryPrice}
52W Range: $${stock.low52w} – $${stock.high52w}
Beta: ${stock.beta}
${!isETF ? `PE Ratio: ${stock.peRatio} | Dividend Yield: ${stock.dividendYield}` : ''}
Fundamentals: ${JSON.stringify(quoteSummary)}

═══ TECHNICAL CHART (last 20 candles, chronological) ═══
${JSON.stringify((historicalData || []).slice(-20))}

═══ RECENT NEWS (analyse sentiment & near-term impact) ═══
${newsText}

═══ INSTRUCTIONS ═══
1. buyInPrice  — optimal entry near CURRENT price $${stock.price}${isInverse ? ' (add to inverse/short position when momentum continues)' : ''}
2. sellingPrice — profit target from user entry $${userEntryPrice}${isInverse ? ' (exit short position with gains)' : ', aligned to chart resistance'}
3. cutLossPrice — stop-loss${isInverse ? ' if underlying market recovers (ETF price drops from current level)' : ' 5–15% below current price $' + stock.price}
4. newsInsight  — 2–3 sentences (Cantonese) on how recent news affects near-term outlook
5. summary      — 2-sentence ${isInverse ? 'short thesis outlook' : 'market outlook'} (Cantonese). Do NOT mention "公司".
6. opportunities — 3+ ${isInverse ? 'reasons the market may fall further (supporting the short thesis)' : 'specific growth catalysts'} (Cantonese)
7. risks        — 3+ ${isInverse ? 'reasons the market may recover against this short position' : 'specific risk factors'} (Cantonese)

Output JSON (strict schema, no extra keys):
{
  "sentiment": "High"|"Mild"|"Low",
  "priceTarget": number,
  "buyInPrice": number,
  "sellingPrice": number,
  "cutLossPrice": number,
  "confidence": number,
  "summary": string,
  "newsInsight": string,
  "opportunities": string[],
  "risks": string[]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      let parsed: any = {};
      try { parsed = JSON.parse(response.text || '{}'); } catch { parsed = {}; }
      res.json({
        ...parsed,
        cutLossPrice: parsed.cutLossPrice ?? stock.price * 0.92,
      });
    } catch (e: any) {
      console.error('Analyze error:', e.message);
      const is503 = String(e.message).includes('503') || String(e.message).toLowerCase().includes('unavailable');
      res.status(is503 ? 503 : 500).json({ error: e.message });
    }
  });

  app.get('/api/recommendations', async (_req: any, res: any) => {
    try {
      const ai = getGeminiClient();

      // Fetch live market news from Finnhub for real-world context
      let newsHeadlines = '';
      try {
        const [generalNews, cryptoNews, mergerNews] = await Promise.allSettled([
          fhFetch('/news?category=general&minId=0'),
          fhFetch('/news?category=technology&minId=0'),
          fhFetch('/news?category=merger&minId=0'),
        ]);
        const allNews: any[] = [
          ...(generalNews.status === 'fulfilled' ? generalNews.value : []),
          ...(cryptoNews.status === 'fulfilled'  ? cryptoNews.value  : []),
          ...(mergerNews.status === 'fulfilled'  ? mergerNews.value  : []),
        ];
        const headlines = allNews
          .filter((n: any) => n?.headline)
          .slice(0, 40)
          .map((n: any) => `• ${n.headline}${n.related ? ` [${n.related}]` : ''}`)
          .join('\n');
        if (headlines) newsHeadlines = `\nCurrent market news (use these to inform your picks):\n${headlines}\n`;
      } catch { /* proceed without news if fetch fails */ }

      const today = new Date().toISOString().split('T')[0];

      const prompt = `You are a sharp quant analyst. Today is ${today}. Based on current market conditions and the latest news below, pick 30 stocks/ETFs with genuine near-term catalysts.
${newsHeadlines}
Provide exactly 10 recommendations for each of 3 markets (30 total):

Markets:
1. US equities
2. HK equities (symbol must end in .HK, e.g. 0700.HK, 9988.HK)
3. Global ETFs (e.g. SPY, QQQ, ARKK, SOXS)

For each market, split into two tiers:
- "standard" (5 picks): high-quality names with solid fundamentals and a clear news-driven or trend catalyst right now.
- "contrarian" (5 picks): against current consensus — beaten-down names, squeeze candidates, overlooked plays, or inverse/leveraged ideas with a specific contrarian thesis tied to current events.

Rules:
- Each "reason" must reference a specific current trend, news catalyst, or market condition (not generic statements)
- All "reason" fields in Cantonese (Traditional Chinese)
- Output ONLY a raw JSON array, zero markdown, zero code fences
- No duplicates across tiers or markets

Schema (30 objects total):
[{
  "symbol": string,
  "name": string,
  "market": "US"|"HK"|"ETF",
  "tier": "standard"|"contrarian",
  "reason": string (Cantonese, 1-2 sentences with specific catalyst),
  "indicator": "High"|"Mild"|"Low",
  "technicals": { "rsi": string, "macd": string }
}]`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      let recs: any[] = [];
      try { recs = JSON.parse(response.text || '[]'); } catch { recs = []; }
      res.json(recs);
    } catch (e: any) {
      console.error('Recommendations error:', e.message);
      res.json([]);
    }
  });

  // ── ETF Sentiment Analysis ───────────────────────────────────────────────────

  app.get('/api/etf-sentiment', async (_req: any, res: any) => {
    const BULL = ['TQQQ', 'UPRO', 'SPXL', 'SOXL', 'LABU'];
    const BEAR = ['SQQQ', 'SPXS', 'SOXS', 'TZA', 'UVXY'];
    const MARKET = ['SPY', 'QQQ'];
    const ALL = [...BULL, ...BEAR, ...MARKET];

    try {
      const quoteResults = await Promise.allSettled(
        ALL.map(sym =>
          fhFetch(`/quote?symbol=${sym}`).then((q: any) => ({
            symbol: sym,
            price: q.c || 0,
            change: q.d || 0,
            changePercent: q.dp || 0,
            prevClose: q.pc || 0,
          }))
        )
      );

      const quotes: Record<string, any> = {};
      quoteResults.forEach((r, i) => {
        if (r.status === 'fulfilled') quotes[ALL[i]] = r.value;
        else quotes[ALL[i]] = { symbol: ALL[i], price: 0, change: 0, changePercent: 0 };
      });

      let news: any[] = [];
      try {
        const rawNews = await fhFetch('/news?category=general&minId=0');
        news = ((rawNews as any[]) || []).slice(0, 10).map((n: any) => ({
          title: n.headline,
          url: n.url,
          date: n.datetime ? new Date(n.datetime * 1000).toISOString().split('T')[0] : '',
          source: n.source || '',
        }));
      } catch { /* swallow */ }

      const today = new Date().toISOString().split('T')[0];
      const bullLines = BULL.map(s => `${s}: ${quotes[s]?.changePercent?.toFixed(2) ?? 'N/A'}%`).join(', ');
      const bearLines = BEAR.map(s => `${s}: ${quotes[s]?.changePercent?.toFixed(2) ?? 'N/A'}%`).join(', ');
      const spyChg = quotes['SPY']?.changePercent?.toFixed(2) ?? 'N/A';
      const qqqChg = quotes['QQQ']?.changePercent?.toFixed(2) ?? 'N/A';
      const newsText = news.slice(0, 6).map((n: any) => `- ${n.title}`).join('\n');

      const prompt = `You are a sharp quantitative market analyst. Today is ${today}.

Current ETF performance:
Bull ETFs (做多): ${bullLines}
Bear ETFs (做空): ${bearLines}
S&P500 (SPY): ${spyChg}%, NASDAQ (QQQ): ${qqqChg}%

Latest market headlines:
${newsText}

Provide a concise market sentiment analysis (3-4 sentences total). Cover:
1. Overall market direction (bullish/bearish/neutral) and conviction level
2. Key signals from the leveraged ETF flow (are bulls or bears dominating?)
3. What the bear ETF activity implies about market fear vs confidence
4. Brief near-term outlook based on news

Respond ONLY in valid JSON (no markdown):
{"sentiment":"Bullish"|"Bearish"|"Neutral"|"Mixed","score":<integer 0-100>,"summary":"<3-4 sentence analysis>","keySignal":"<one key actionable signal>"}`;

      let sentimentData: any = { sentiment: 'Neutral', score: 50, summary: '', keySignal: '' };
      try {
        const ai = getGeminiClient();
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const raw = result.text ?? '{}';
        sentimentData = JSON.parse(raw);
      } catch (e) { console.error('ETF Gemini error:', e); }

      res.json({
        bull: BULL.map(s => quotes[s]),
        bear: BEAR.map(s => quotes[s]),
        market: { SPY: quotes['SPY'], QQQ: quotes['QQQ'] },
        sentiment: sentimentData,
        news,
      });
    } catch (e: any) {
      console.error('ETF sentiment error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── AI Portfolio Builder ──────────────────────────────────────────────────────

  app.post('/api/ai/portfolio-builder', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      const db = getAdminFirestore();
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.data() || {};
      if (!userData.isSubscribed && !userData.isAdmin) {
        return res.status(403).json({ error: 'Subscription required' });
      }
      const { amount, currency, market } = req.body as {
        amount: number;
        currency: 'USD' | 'HKD';
        market: 'US' | 'HK' | 'ETF' | 'Mixed';
      };
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const marketDesc =
        market === 'US'    ? 'US stocks (NYSE/NASDAQ only)' :
        market === 'HK'    ? 'HK stocks (HKEX only, use .HK suffix for symbols)' :
        market === 'ETF'   ? 'US-listed ETFs only (e.g. SPY, QQQ, VTI, ARKK, GLD, TLT — no individual stocks)' :
                             'mixed US stocks (NYSE/NASDAQ) and HK stocks (HKEX, .HK suffix)';
      const prompt = `You are an expert portfolio manager. Generate 3 investment portfolio plans for a client.

Budget: ${currency} ${amount.toLocaleString()}
Preferred market: ${marketDesc}

Requirements:
- Generate exactly 3 plans: Aggressive, Safety, Mix
- Each plan must have exactly 5 stock positions (no cash reserve — allocate 100% across 5 stocks)
- CRITICAL: For each position, the buyPrice MUST be less than (percentage/100 × budget). The user must be able to afford at least 1 share with the allocated amount. If a stock is too expensive for its allocation, pick a cheaper alternative in the same sector.
- All "reason" fields must be in Traditional Chinese (Cantonese style), 1-2 sentences
- buyPrice and sellPrice must be realistic numbers based on typical price ranges for the stock (approximate, not real-time)
- expectedGainPercent: realistic expected % gain for the profile (Aggressive 30-80%, Safety 8-20%, Mix 15-35%)
- Percentages in each plan must sum to exactly 100
- Output ONLY a raw JSON object, no markdown, no code fences

Schema:
{
  "plans": [
    {
      "profile": "Aggressive" | "Safety" | "Mix",
      "summary": string (Traditional Chinese, 2 sentences describing this plan's strategy),
      "allocations": [
        {
          "symbol": string,
          "name": string,
          "market": "US" | "HK" | "ETF",
          "percentage": number,
          "reason": string (Traditional Chinese),
          "buyPrice": number,
          "sellPrice": number,
          "expectedGainPercent": number
        }
      ]
    }
  ]
}`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      let result: any = { plans: [] };
      try { result = JSON.parse(response.text || '{}'); } catch { result = { plans: [] }; }
      res.json(result);
    } catch (e: any) {
      console.error('Portfolio builder error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  // ── Stripe ───────────────────────────────────────────────────────────────────

  app.post('/api/stripe/create-checkout-session', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      const stripe = getStripe();
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) return res.status(500).json({ error: 'STRIPE_PRICE_ID not configured' });
      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}?subscribed=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}?subscribed=0`,
        customer_email: decoded.email || undefined,
        metadata: { userId: decoded.uid },
        subscription_data: { metadata: { userId: decoded.uid } },
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error('Stripe session error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/stripe/verify-session', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(`verify-session: status=${session.status} payment_status=${session.payment_status} userId_meta=${session.metadata?.userId} uid=${decoded.uid}`);
      if (session.payment_status !== 'paid' || session.metadata?.userId !== decoded.uid) {
        return res.json({ subscribed: false, paymentStatus: session.payment_status });
      }
      try {
        const db = getAdminFirestore();
        await db.collection('users').doc(decoded.uid).set(
          {
            isSubscribed: true,
            subscriptionSource: 'stripe',
            stripeCustomerId: session.customer as string || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.log(`verify-session: Firestore write OK for uid=${decoded.uid}`);
      } catch (fsErr: any) {
        console.error(`verify-session: Firestore write FAILED for uid=${decoded.uid}:`, fsErr.message);
        // Return subscribed:true so client can do its own write as fallback
        return res.json({ subscribed: true, firestoreError: fsErr.message });
      }
      res.json({ subscribed: true });
    } catch (e: any) {
      console.error('Verify session error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/stripe/customer-portal', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      const stripe = getStripe();
      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      const db = getAdminFirestore();
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      let customerId = userDoc.data()?.stripeCustomerId as string | undefined;
      if (!customerId && decoded.email) {
        const customers = await stripe.customers.list({ email: decoded.email, limit: 1 });
        customerId = customers.data[0]?.id;
      }
      if (!customerId) return res.status(404).json({ error: 'No billing account found' });
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: appUrl,
      });
      res.json({ url: portal.url });
    } catch (e: any) {
      console.error('Customer portal error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req: any, res: any) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send('Webhook secret not configured');
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (e: any) {
      console.error('Stripe webhook signature error:', e.message);
      return res.status(400).send(`Webhook error: ${e.message}`);
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId) {
        try {
          const db = getAdminFirestore();
          await db.collection('users').doc(userId).set(
            {
              isSubscribed: true,
              subscriptionSource: 'stripe',
              stripeCustomerId: session.customer as string || null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e: any) { console.error('Firestore update error:', e.message); }
      }
    }
    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata as any)?.userId;
      // Revoke access when subscription ends or is cancelled (status: canceled/unpaid/past_due)
      const inactive = ['canceled', 'unpaid', 'past_due', 'paused'].includes(sub.status);
      if (userId && (event.type === 'customer.subscription.deleted' || inactive)) {
        try {
          const db = getAdminFirestore();
          await db.collection('users').doc(userId).set(
            { isSubscribed: false, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          console.log(`Subscription revoked for uid=${userId} status=${sub.status}`);
        } catch (e: any) { console.error('Firestore revoke error:', e.message); }
      }
    }
    res.json({ received: true });
  });

  // ── Admin API ─────────────────────────────────────────────────────────────────

  app.get('/api/admin/users', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      if (!isAdminEmail(decoded.email || '')) return res.status(403).json({ error: 'Forbidden' });
      const db = getAdminFirestore();
      const snap = await db.collection('users').get();
      const users = snap.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || '',
          displayName: data.displayName || '',
          isSubscribed: data.isSubscribed ?? false,
          isAdmin: data.isAdmin ?? false,
          subscriptionSource: data.subscriptionSource || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      });
      res.json(users);
    } catch (e: any) {
      console.error('Admin users error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/admin/users/:uid/subscription', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      if (!isAdminEmail(decoded.email || '')) return res.status(403).json({ error: 'Forbidden' });
      const { uid } = req.params;
      const { isSubscribed } = req.body;
      if (typeof isSubscribed !== 'boolean') return res.status(400).json({ error: 'isSubscribed must be boolean' });
      const db = getAdminFirestore();
      await db.collection('users').doc(uid).set(
        { isSubscribed, subscriptionSource: isSubscribed ? 'admin' : null, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      res.json({ ok: true });
    } catch (e: any) {
      console.error('Admin toggle error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/admin/test-firebase', async (req: any, res: any) => {
    try {
      const decoded = await verifyToken(req.headers.authorization);
      if (!isAdminEmail(decoded.email || '')) return res.status(403).json({ error: 'Forbidden' });
      const db = getAdminFirestore();
      const testRef = db.collection('_diagnostics').doc('ping');
      await testRef.set({ ts: FieldValue.serverTimestamp(), by: decoded.email }, { merge: true });
      res.json({ ok: true, uid: decoded.uid, email: decoded.email });
    } catch (e: any) {
      console.error('Firebase diagnostic error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
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
