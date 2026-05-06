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
  initAdminApp({ credential: cert(JSON.parse(svcJson)) });
}

function getAdminFirestore() {
  ensureAdminApp();
  const dbId = process.env.FIREBASE_DATABASE_ID;
  return dbId ? getFirestore(dbId) : getFirestore();
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

      const prompt = `
You are a senior quantitative analyst. Output ONLY raw JSON — no markdown, no code fences.
All text fields MUST be written in Traditional Chinese (Cantonese).

═══ STOCK DATA ═══
Symbol: ${stock.symbol} (${stock.name})
Current Price: $${stock.price}
User Entry Price: $${userEntryPrice}
PE Ratio: ${stock.peRatio} | 52W Range: $${stock.low52w} – $${stock.high52w}
Dividend Yield: ${stock.dividendYield} | Beta: ${stock.beta}
Fundamentals: ${JSON.stringify(quoteSummary)}

═══ TECHNICAL CHART (last 20 candles, chronological) ═══
${JSON.stringify(historicalData ? historicalData.slice(-20) : [])}

═══ RECENT NEWS (analyse sentiment & near-term impact) ═══
${newsText}

═══ INSTRUCTIONS ═══
1. buyInPrice  — optimal entry based on chart support near CURRENT price $${stock.price}
2. sellingPrice — profit target from user entry $${userEntryPrice}, aligned to chart resistance
3. cutLossPrice — stop-loss 5–15% below current price $${stock.price}
4. newsInsight  — 2–3 sentences (Cantonese) on how the news affects near-term outlook
5. summary      — 2-sentence overall market outlook (Cantonese)
6. opportunities — at least 3 specific growth catalysts (Cantonese)
7. risks        — at least 3 specific risk factors (Cantonese)

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
      // Return 200 with fallback so the client renders something instead of toast error
      res.json({
        sentiment: 'Mild',
        priceTarget: req.body.stock?.price * 1.05 || 0,
        buyInPrice:  req.body.stock?.price * 0.95 || 0,
        sellingPrice: req.body.stock?.price * 1.10 || 0,
        cutLossPrice: req.body.stock?.price * 0.92 || 0,
        confidence: 0.5,
        summary: `分析暫時不可用 (${String(e.message).slice(0, 60)})`,
        risks: ['市場波動性較大'],
        opportunities: ['長線增長潛力'],
      });
    }
  });

  app.get('/api/recommendations', async (_req: any, res: any) => {
    try {
      const ai = getGeminiClient();

      const prompt = `
You are a contrarian quant analyst. Provide exactly 10 recommendations for each of 3 markets (30 total):

Markets:
1. US equities
2. HK equities (symbol must end in .HK, e.g. 0700.HK, 9988.HK)
3. Global ETFs (e.g. SPY, QQQ, ARKK, SOXS)

For each market, split into two tiers:
- "standard" (5 picks): conventional, high-quality, well-known names with solid fundamentals and clear catalysts. Safe mainstream consensus.
- "contrarian" (5 picks): deeply unconventional, against current market consensus. Pick from: beaten-down fallen angels, heavily shorted squeeze candidates, overlooked micro/small-caps, sector outliers, inverse/leveraged plays, or names with controversial thesis. Must genuinely surprise a seasoned trader. Do NOT pick obvious large-caps for this tier.

Rules:
- All 'reason' fields in Cantonese (Traditional Chinese)
- Output ONLY a raw JSON array, zero markdown, zero code fences
- Vary the picks — no duplicates across tiers or markets
- Contrarian picks should have diverse, creative rationale

Schema (30 objects total):
[{
  "symbol": string,
  "name": string,
  "market": "US"|"HK"|"ETF",
  "tier": "standard"|"contrarian",
  "reason": string (Cantonese, 1-2 sentences explaining the thesis),
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
        success_url: `${appUrl}?subscribed=1`,
        cancel_url:  `${appUrl}?subscribed=0`,
        customer_email: decoded.email || undefined,
        metadata: { userId: decoded.uid },
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error('Stripe session error:', e.message);
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
            { isSubscribed: true, subscriptionSource: 'stripe', updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        } catch (e: any) { console.error('Firestore update error:', e.message); }
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata as any)?.userId;
      if (userId) {
        try {
          const db = getAdminFirestore();
          await db.collection('users').doc(userId).set(
            { isSubscribed: false, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        } catch (e: any) { console.error('Firestore update error:', e.message); }
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
