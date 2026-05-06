import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  X, BrainCircuit, RefreshCw, TrendingUp, TrendingDown, ChevronLeft,
  ArrowUpRight, ChevronRight, DollarSign, Newspaper, Lock
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { cn } from "../lib/utils";
import { Stock, PortfolioItem, AIAnalysis, PricePoint, ChartTimeframe } from "../types";
import { StockService } from "../services/stockService";

const TIMEFRAMES: { label: string; value: ChartTimeframe }[] = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
];

function Hint({ text }: { text: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <div className="inline-flex items-center ml-1">
      <span
        ref={ref}
        onMouseEnter={() => ref.current && setRect(ref.current.getBoundingClientRect())}
        onMouseLeave={() => setRect(null)}
        className="text-[8px] text-slate-700 hover:text-slate-400 cursor-help font-black border border-slate-700/60 rounded-full w-3.5 h-3.5 flex items-center justify-center transition-colors"
      >?</span>
      {rect && createPortal(
        <div
          style={{
            position: 'fixed',
            top: rect.top - 8,
            left: Math.min(rect.left, window.innerWidth - 232),
            transform: 'translateY(-100%)',
            zIndex: 9999,
          }}
          className="px-3 py-2 bg-[#0d0f13] border border-white/10 rounded-xl text-[10px] text-slate-300 w-56 shadow-2xl leading-relaxed pointer-events-none"
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  );
}

const STAT_HINTS: Record<string, string> = {
  'Market Cap': 'Total market value of all outstanding shares. Mega-cap >$200B, Large-cap >$10B, Mid-cap >$2B.',
  'PE Ratio':   'Price-to-Earnings ratio. How much you pay per $1 of earnings. Market average ≈ 20. Higher = growth priced in.',
  '52W High':   'Highest price traded in the past 52 weeks. Approaching this level = resistance zone.',
  '52W Low':    'Lowest price traded in the past 52 weeks. Approaching this level = support zone.',
  'Div Yield':  'Annual dividend per share ÷ share price. Higher yield = more passive income, but may signal slow growth.',
  'Beta':       'Volatility vs. S&P 500. Beta > 1 = swings harder than market. Beta < 1 = more stable. Beta < 0 = inverse.',
  'Volume':     'Shares traded today. High volume confirms conviction behind price moves. Low volume = weak signal.',
};

interface StockDrawerProps {
  stock: Stock;
  portfolioItem: PortfolioItem | undefined;
  aiAnalysis: AIAnalysis | null;
  isAnalyzing: boolean;
  canAnalyze?: boolean;
  onClose: () => void;
  onAnalyze: () => void;
  onAddToPortfolio: (symbol: string, shares: number, buyPrice: number) => void;
  onSell: (symbol: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onSubscribeRequired?: () => void;
  inline?: boolean;
}

export function StockDrawer({
  stock, portfolioItem, aiAnalysis, isAnalyzing,
  canAnalyze = false,
  onClose, onAnalyze, onAddToPortfolio, onSell, showToast,
  onSubscribeRequired,
  inline = false,
}: StockDrawerProps) {
  const [historicalData, setHistoricalData] = useState<PricePoint[]>([]);
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1m');
  const [tradeAmount, setTradeAmount] = useState(0);
  const [manualPrice, setManualPrice] = useState(stock.price);
  const [chartLoading, setChartLoading] = useState(false);

  const gain    = portfolioItem ? (stock.price - portfolioItem.averagePrice) * portfolioItem.shares : 0;
  const gainPct = portfolioItem && portfolioItem.averagePrice > 0
    ? ((stock.price - portfolioItem.averagePrice) / portfolioItem.averagePrice) * 100
    : 0;

  useEffect(() => { setManualPrice(stock.price); }, [stock.symbol]);

  useEffect(() => {
    setChartLoading(true);
    StockService.getStockInfo(stock.symbol, chartTimeframe)
      .then(info => {
        setHistoricalData(info?.chart?.length > 0
          ? info.chart.map((c: any) => ({ date: new Date(c.date).toISOString().split('T')[0], price: c.close }))
          : []);
        setStockNews(info.news || []);
      })
      .catch(() => { setHistoricalData([]); setStockNews([]); })
      .finally(() => setChartLoading(false));
  }, [stock.symbol, chartTimeframe]);

  const sentimentColor = !aiAnalysis ? "text-slate-400 border-slate-400/20 bg-slate-400/10" :
    aiAnalysis.sentiment === 'High' ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" :
    aiAnalysis.sentiment === 'Low'  ? "text-rose-400 border-rose-400/20 bg-rose-400/10" :
    "text-slate-400 border-slate-400/20 bg-slate-400/10";

  const STATS = [
    { label: 'Market Cap', value: stock.marketCap,      color: '' },
    { label: 'PE Ratio',   value: stock.peRatio,        color: '' },
    { label: '52W High',   value: `$${stock.high52w}`,  color: 'text-emerald-400' },
    { label: '52W Low',    value: `$${stock.low52w}`,   color: 'text-rose-400' },
    { label: 'Div Yield',  value: stock.dividendYield,  color: 'text-blue-400' },
    { label: 'Beta',       value: stock.beta,           color: '' },
    { label: 'Volume',     value: stock.volume,         color: '', span: 2 },
  ];

  // ── Reusable sections ──────────────────────────────────────────────────────

  const ChartSection = (
    <section className="bento-card p-6 overflow-hidden border-none bg-black/40 flex flex-col" style={{ height: '18rem' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Historical Trend</span>
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setChartTimeframe(tf.value)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                chartTimeframe === tf.value ? "bg-accent text-white" : "text-slate-500 hover:text-white hover:bg-white/5"
              )}
            >{tf.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {chartLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-slate-500" />
          </div>
        )}
        {!chartLoading && historicalData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs font-bold uppercase tracking-widest">
            No chart data available
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historicalData}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" hide />
            <YAxis domain={['auto','auto']} orientation="right"
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
              axisLine={false} tickLine={false} tickFormatter={v => `$${v}`}
            />
            <RechartsTooltip
              contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: '#121418', padding: '12px' }}
              labelStyle={{ fontWeight: 800, marginBottom: '4px', fontSize: '10px', color: '#64748b' }}
              itemStyle={{ fontWeight: 900, fontSize: '14px', color: '#fff' }}
              formatter={(val: number) => [`$${val.toFixed(2)}`, 'Price']}
            />
            <Area type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={3}
              fillOpacity={1} fill="url(#colorPrice)" animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );

  const StatsSection = (
    <div className="grid grid-cols-2 gap-3">
      {STATS.map(({ label, value, color, span }) => (
        <div key={label} className={cn("bento-card bg-white/[0.02] p-4 flex flex-col border-white/5", span === 2 ? "col-span-2" : "")}>
          <div className="flex items-center mb-2">
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">{label}</span>
            <Hint text={STAT_HINTS[label] ?? ''} />
          </div>
          <span className={cn("font-mono text-sm font-black", color || "text-white")}>{value}</span>
        </div>
      ))}
    </div>
  );

  const NewsSection = stockNews.length > 0 ? (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <Newspaper size={14} className="text-slate-500" />
        <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Latest Intel</h4>
        <div className="h-[1px] flex-1 bg-white/5" />
      </div>
      <div className="grid gap-3">
        {stockNews.map((news, i) => (
          <a key={i} href={news.url} target="_blank" rel="noopener noreferrer"
            className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all group"
          >
            <div className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors line-clamp-2">{news.title}</div>
            {news.summary && <div className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{news.summary}</div>}
            {news.date && <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-widest">{news.date}</div>}
          </a>
        ))}
      </div>
    </section>
  ) : null;

  // Delta rows shown under each price level
  function PriceDelta({ price, fromColor, avgColor }: { price: number; fromColor: string; avgColor?: string }) {
    const fromNow = ((price - stock.price) / stock.price) * 100;
    const fromAvg = portfolioItem && portfolioItem.averagePrice > 0
      ? ((price - portfolioItem.averagePrice) / portfolioItem.averagePrice) * 100
      : null;
    return (
      <div className="flex flex-col items-end gap-0.5 mt-0.5">
        <span className={cn("text-[9px] font-bold", fromColor)}>
          {fromNow >= 0 ? "+" : ""}{fromNow.toFixed(1)}% from now
        </span>
        {fromAvg !== null && (
          <span className={cn("text-[9px] font-bold", avgColor ?? fromColor)}>
            {fromAvg >= 0 ? "+" : ""}{fromAvg.toFixed(1)}% from avg
          </span>
        )}
      </div>
    );
  }

  const AISection = (
    <section className={cn(
      "p-8 rounded-[2.5rem] relative overflow-hidden transition-all duration-500 border border-white/5",
      !aiAnalysis ? "bg-black/40" : "bg-[#1a1c22] border-blue-500/20 shadow-2xl shadow-blue-500/5"
    )}>
      <AnimatePresence mode="wait">
        {!aiAnalysis ? (
          <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center text-center py-6"
          >
            <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 relative">
              <div className="absolute inset-0 rounded-3xl bg-blue-500/10 animate-ping" />
              <BrainCircuit size={40} className="text-blue-400 relative z-10" />
            </div>
            <h4 className="text-2xl font-black mb-4 tracking-tight text-white">AI Quantitative Intel</h4>
            <p className="text-slate-500 text-sm mb-8 max-w-sm font-medium leading-relaxed">
              Comprehensive analysis of technicals, fundamentals, and latest news using Gemini AI.
            </p>
            {canAnalyze ? (
              <button onClick={onAnalyze} disabled={isAnalyzing}
                className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-2xl font-black transition-all disabled:opacity-50 flex items-center gap-3 text-white shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95"
              >
                {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <ArrowUpRight size={20} />}
                {isAnalyzing ? "Processing Data..." : "Run AI Analysis"}
              </button>
            ) : (
              <button onClick={onSubscribeRequired}
                className="bg-white/5 border border-white/10 hover:border-blue-500/40 hover:bg-blue-500/10 px-10 py-4 rounded-2xl font-black transition-all flex items-center gap-3 text-slate-400 hover:text-white"
              >
                <Lock size={20} />
                Subscribe to Unlock
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="report" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/20"><BrainCircuit size={20} /></div>
                <h4 className="font-black text-xl text-white tracking-tight">AI Intelligence Report</h4>
              </div>
              <div className={cn("px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-sm border", sentimentColor)}>
                <span className={cn("w-2 h-2 rounded-full", aiAnalysis.sentiment === 'High' ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                {aiAnalysis.sentiment}
                <Hint text="Overall AI sentiment. High = bullish outlook, Mild = neutral/mixed, Low = bearish." />
              </div>
            </div>

            {/* Price target + trading levels */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex flex-col justify-center">
                <div className="flex items-center mb-2">
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">12M Target</div>
                  <Hint text="AI-projected fair value 12 months out, based on fundamentals, technicals, and current momentum." />
                </div>
                <div className="text-4xl font-black data-value text-blue-400 tracking-tighter">${aiAnalysis.priceTarget.toFixed(2)}</div>
                <PriceDelta
                  price={aiAnalysis.priceTarget}
                  fromColor={aiAnalysis.priceTarget >= stock.price ? "text-emerald-400" : "text-rose-400"}
                  avgColor={portfolioItem
                    ? (aiAnalysis.priceTarget >= portfolioItem.averagePrice ? "text-emerald-400" : "text-rose-400")
                    : undefined}
                />
              </div>

              <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                <div className="flex items-center mb-3">
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">Trading Levels</div>
                  <Hint text="AI-derived price levels for managing your position. Use as reference, not guarantees." />
                </div>

                {portfolioItem && (
                  <div className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 mb-3 flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Your Avg Cost</span>
                    <span className="font-mono font-black text-sm text-white">${portfolioItem.averagePrice.toFixed(2)}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Take Profit */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Take Profit</span>
                      <Hint text={portfolioItem
                        ? `Target to sell for gain. Calculated from your avg cost $${portfolioItem.averagePrice.toFixed(2)}, aligned to chart resistance.`
                        : "Target price to lock in gains. Based on entry price and chart resistance."} />
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-lg text-white data-value">${aiAnalysis.sellingPrice.toFixed(2)}</div>
                      <PriceDelta price={aiAnalysis.sellingPrice} fromColor="text-slate-500" avgColor="text-emerald-500" />
                    </div>
                  </div>

                  {/* Buy In */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Buy In</span>
                      <Hint text="Optimal entry based on current market price and chart support levels." />
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-lg text-white data-value">${aiAnalysis.buyInPrice.toFixed(2)}</div>
                      <PriceDelta price={aiAnalysis.buyInPrice} fromColor="text-slate-500" avgColor="text-blue-400" />
                    </div>
                  </div>

                  {/* Cut Loss */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Cut Loss</span>
                      <Hint text={portfolioItem
                        ? `Stop-loss below current price. Exit here to limit downside.`
                        : "Stop-loss price. Exit to cap downside. Typically 5–15% below current price."} />
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-lg text-white data-value">${aiAnalysis.cutLossPrice.toFixed(2)}</div>
                      <PriceDelta
                        price={aiAnalysis.cutLossPrice}
                        fromColor="text-slate-500"
                        avgColor={portfolioItem
                          ? (aiAnalysis.cutLossPrice < portfolioItem.averagePrice ? "text-rose-500" : "text-slate-500")
                          : undefined}
                      />
                    </div>
                  </div>
                </div>

                <div className="w-full bg-white/5 h-1.5 rounded-full mt-4 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${aiAnalysis.confidence * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }} className="bg-blue-600 h-full rounded-full"
                  />
                </div>
                <div className="flex items-center justify-center mt-2">
                  <div className="text-[9px] text-slate-500 font-black tracking-widest uppercase">
                    Model Conviction {(aiAnalysis.confidence * 100).toFixed(0)}%
                  </div>
                  <Hint text="AI confidence score based on signal alignment. Above 70% = strong conviction." />
                </div>
              </div>
            </div>

            {/* Summary */}
            <p className="text-slate-400 text-sm leading-relaxed font-medium bg-black/20 p-6 rounded-3xl italic border-l-4 border-blue-600">
              "{aiAnalysis.summary}"
            </p>

            {/* News insight */}
            {aiAnalysis.newsInsight && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper size={14} className="text-amber-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">News Impact Analysis</span>
                  <Hint text="AI interpretation of how recent news headlines affect near-term price action and investor sentiment." />
                </div>
                <p className="text-slate-300 text-xs leading-relaxed font-medium">{aiAnalysis.newsInsight}</p>
              </div>
            )}

            {/* RSI + MACD */}
            {aiAnalysis.technicals && (
              <div className="flex gap-4">
                <div className="flex-1 bg-white/[0.04] p-4 rounded-2xl border border-white/5 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="text-[9px] text-slate-500 uppercase font-black">RSI (14)</div>
                    <Hint text="Relative Strength Index. Above 70 = overbought. Below 30 = oversold. 30–70 = neutral." />
                  </div>
                  <div className={cn("text-lg font-black",
                    aiAnalysis.technicals.rsi > 70 ? "text-rose-400" :
                    aiAnalysis.technicals.rsi < 30 ? "text-emerald-400" : "text-white"
                  )}>{aiAnalysis.technicals.rsi}</div>
                  <div className="text-[8px] text-slate-600 mt-1 uppercase font-black">
                    {aiAnalysis.technicals.rsi > 70 ? "Overbought" : aiAnalysis.technicals.rsi < 30 ? "Oversold" : "Neutral"}
                  </div>
                </div>
                <div className="flex-1 bg-white/[0.04] p-4 rounded-2xl border border-white/5 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="text-[9px] text-slate-500 uppercase font-black">MACD</div>
                    <Hint text="Positive = bullish momentum. Negative = bearish. Watch for signal line crossovers." />
                  </div>
                  <div className={cn("text-lg font-black font-mono",
                    aiAnalysis.technicals.macd.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                  )}>{aiAnalysis.technicals.macd}</div>
                  <div className="flex items-center justify-center mt-1">
                    <div className="text-[8px] text-slate-600 uppercase font-black">Signal: {aiAnalysis.technicals.signal}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Opportunities + Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Growth Catalysts
                </h5>
                <ul className="space-y-3">
                  {aiAnalysis.opportunities.map((opp, i) => (
                    <li key={i} className="text-xs text-slate-400 font-bold leading-snug flex items-start gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                      <ChevronRight size={14} className="text-emerald-400 mt-0.5 shrink-0" /> {opp}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Strategic Risks
                </h5>
                <ul className="space-y-3">
                  {aiAnalysis.risks.map((risk, i) => (
                    <li key={i} className="text-xs text-slate-400 font-bold leading-snug flex items-start gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                      <ChevronRight size={14} className="text-rose-400 mt-0.5 shrink-0" /> {risk}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );

  const PositionCard = portfolioItem ? (
    <div className="bento-card bg-white/[0.02] border-white/5 p-6 space-y-3 shrink-0">
      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Your Position</div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 font-bold uppercase tracking-widest">Shares</span>
        <span className="text-white font-black">{portfolioItem.shares}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 font-bold uppercase tracking-widest">Avg Cost</span>
        <span className="text-white font-black">${portfolioItem.averagePrice.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 font-bold uppercase tracking-widest">Total Cost</span>
        <span className="text-white font-black">${portfolioItem.totalCost.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 font-bold uppercase tracking-widest">Market Value</span>
        <span className="text-white font-black">${(stock.price * portfolioItem.shares).toFixed(2)}</span>
      </div>
      <div className="border-t border-white/5 pt-3 flex justify-between items-center">
        <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Unrealized P&L</span>
        <div className={cn("flex items-center gap-1 font-black text-sm", gain >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {gain >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {gain >= 0 ? "+" : ""}${Math.abs(gain).toFixed(2)}
          <span className="text-[10px]">({gainPct.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  ) : null;

  const TradePanel = (
    <div className="bento-card bg-white/[0.02] border-white/5 p-6 space-y-4 shrink-0">
      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Execute Trade</div>
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Entry Price</label>
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10">
            <input type="number" value={manualPrice || ""} onChange={e => setManualPrice(parseFloat(e.target.value) || 0)}
              className="bg-transparent w-full text-sm font-black text-white outline-none"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Shares</label>
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10">
            <input type="number" value={tradeAmount || ""} onChange={e => setTradeAmount(parseInt(e.target.value) || 0)}
              placeholder="Qty" className="bg-transparent w-full text-sm font-black text-white outline-none"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={async () => {
            try { await onAddToPortfolio(stock.symbol, tradeAmount, manualPrice); setTradeAmount(0); }
            catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
          }}
          className="flex-1 bg-white text-black py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-xl shadow-white/5 active:scale-95 text-xs uppercase tracking-widest"
        >
          Confirm Buy
        </button>
        {portfolioItem && (
          <button onClick={() => onSell(stock.symbol)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
          >
            <DollarSign size={16} /> Sell
          </button>
        )}
      </div>
    </div>
  );

  // ── Inline full-width render ───────────────────────────────────────────────

  if (inline) {
    return (
      <div className="flex-1 flex flex-col gap-4 md:gap-6 min-h-0 overflow-hidden">
        {/* Nav bar */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10 hover:border-white/20 px-3 py-2 rounded-xl"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <div className="h-4 w-[1px] bg-white/10" />
          <div className="flex items-baseline gap-2 md:gap-3 min-w-0 overflow-hidden">
            <span className="text-white font-black text-lg md:text-xl shrink-0">{stock.symbol}</span>
            <span className="text-slate-500 text-sm font-medium truncate">{stock.name}</span>
            <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest shrink-0 hidden lg:block">{stock.sector}</span>
          </div>
          <div className="ml-auto text-right shrink-0">
            <div className="text-lg md:text-xl font-black text-white">${stock.price.toFixed(2)}</div>
            <div className={cn("text-xs font-black flex items-center justify-end gap-1", stock.change >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {stock.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {stock.change >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Body: single col on mobile, 3-col on desktop */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1.1fr_0.75fr] gap-4 md:gap-6 overflow-y-auto md:overflow-hidden custom-scrollbar">
          {/* Left / top: Chart + Stats + News */}
          <div className="space-y-4 md:space-y-6 md:overflow-y-auto md:custom-scrollbar md:pr-1">
            {ChartSection}
            {StatsSection}
            {NewsSection}
          </div>
          {/* Center: AI Analysis */}
          <div className="md:overflow-y-auto md:custom-scrollbar md:pr-1">
            {AISection}
          </div>
          {/* Right / bottom: Position + Trade */}
          <div className="space-y-4 md:overflow-y-auto md:custom-scrollbar md:pr-1">
            {PositionCard}
            {TradePanel}
          </div>
        </div>
      </div>
    );
  }

  // ── Overlay slide-over render ─────────────────────────────────────────────

  const isFullScreen = !!portfolioItem;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
          className={cn(
            "w-full bg-surface h-full shadow-2xl flex flex-col overflow-hidden border-l border-white/5",
            !isFullScreen && "max-w-2xl"
          )}
          onClick={e => e.stopPropagation()}
        >
          <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-surface sticky top-0 z-10 shrink-0">
            <div>
              <h3 className="text-3xl font-black text-white flex items-baseline gap-3">
                {stock.symbol}
                <span className="text-sm font-medium text-slate-500">{stock.name}</span>
              </h3>
              <div className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">{stock.sector}</div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl font-black text-white">${stock.price.toFixed(2)}</div>
                <div className={cn("text-xs font-black flex items-center justify-end gap-1", stock.change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {stock.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {stock.change >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                </div>
              </div>
              <button onClick={onClose}
                className="p-3 hover:bg-white/5 rounded-2xl transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10"
              >
                <X size={24} />
              </button>
            </div>
          </header>

          {isFullScreen ? (
            <div className="flex-1 overflow-hidden grid grid-cols-[1.1fr_1fr] min-h-0">
              <div className="overflow-y-auto p-8 space-y-8 border-r border-white/5 custom-scrollbar">
                {ChartSection}
                {StatsSection}
                {NewsSection}
              </div>
              <div className="overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {PositionCard}
                {AISection}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              {ChartSection}
              {StatsSection}
              {NewsSection}
              {AISection}
            </div>
          )}

          <footer className="px-8 py-6 border-t border-white/5 space-y-4 bg-surface sticky bottom-0 z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.4)] shrink-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Entry Price</label>
                <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                  <input type="number" value={manualPrice || ""} onChange={e => setManualPrice(parseFloat(e.target.value) || 0)}
                    className="bg-transparent w-full text-sm font-black text-white outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Shares</label>
                <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                  <input type="number" value={tradeAmount || ""} onChange={e => setTradeAmount(parseInt(e.target.value) || 0)}
                    placeholder="Qty" className="bg-transparent w-full text-sm font-black text-white outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try { await onAddToPortfolio(stock.symbol, tradeAmount, manualPrice); setTradeAmount(0); }
                  catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
                }}
                className="flex-1 bg-white text-black py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-xl shadow-white/5 active:scale-95 text-xs uppercase tracking-widest"
              >
                Confirm Buy
              </button>
              {portfolioItem && (
                <button onClick={() => onSell(stock.symbol)}
                  className="flex items-center gap-2 px-6 py-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                >
                  <DollarSign size={16} /> Sell
                </button>
              )}
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
