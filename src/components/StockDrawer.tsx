import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, BrainCircuit, RefreshCw, TrendingUp, ArrowUpRight, ChevronRight, DollarSign
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

interface StockDrawerProps {
  stock: Stock;
  portfolioItem: PortfolioItem | undefined;
  aiAnalysis: AIAnalysis | null;
  isAnalyzing: boolean;
  onClose: () => void;
  onAnalyze: () => void;
  onAddToPortfolio: (symbol: string, shares: number, buyPrice: number) => void;
  onSell: (symbol: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export function StockDrawer({
  stock, portfolioItem, aiAnalysis, isAnalyzing,
  onClose, onAnalyze, onAddToPortfolio, onSell, showToast
}: StockDrawerProps) {
  const [historicalData, setHistoricalData] = useState<PricePoint[]>([]);
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1m');
  const [tradeAmount, setTradeAmount] = useState(0);
  const [manualPrice, setManualPrice] = useState(stock.price);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    setManualPrice(stock.price);
  }, [stock.symbol]);

  useEffect(() => {
    setChartLoading(true);
    StockService.getStockInfo(stock.symbol, chartTimeframe)
      .then(info => {
        if (info?.chart?.length > 0) {
          setHistoricalData(info.chart.map((c: any) => ({
            date: new Date(c.date).toISOString().split('T')[0],
            price: c.close,
          })));
        } else {
          setHistoricalData([]);
        }
        setStockNews(info.news || []);
      })
      .catch(() => { setHistoricalData([]); setStockNews([]); })
      .finally(() => setChartLoading(false));
  }, [stock.symbol, chartTimeframe]);

  const sentimentColor = !aiAnalysis ? "text-slate-400 border-slate-400/20 bg-slate-400/10" :
    aiAnalysis.sentiment === 'High' ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" :
    aiAnalysis.sentiment === 'Low'  ? "text-rose-400 border-rose-400/20 bg-rose-400/10" :
    "text-slate-400 border-slate-400/20 bg-slate-400/10";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
          className="w-full max-w-2xl bg-surface h-full shadow-2xl flex flex-col overflow-hidden border-l border-white/5"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <header className="p-8 border-b border-white/5 flex items-center justify-between bg-surface sticky top-0 z-10">
            <div>
              <h3 className="text-3xl font-black text-white flex items-baseline gap-3">
                {stock.symbol}
                <span className="text-sm font-medium text-slate-500">{stock.name}</span>
              </h3>
              <div className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">{stock.sector}</div>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-white/5 rounded-2xl transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10"
            >
              <X size={24} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
            {/* Chart + timeframe */}
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
                        chartTimeframe === tf.value
                          ? "bg-accent text-white"
                          : "text-slate-500 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {tf.label}
                    </button>
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
                    <YAxis
                      domain={['auto', 'auto']}
                      orientation="right"
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={val => `$${val}`}
                    />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: '#121418', padding: '12px' }}
                      labelStyle={{ fontWeight: 800, marginBottom: '4px', fontSize: '10px', color: '#64748b' }}
                      itemStyle={{ fontWeight: 900, fontSize: '14px', color: '#fff' }}
                      formatter={(val: number) => [`$${val.toFixed(2)}`, 'Price']}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Market Cap', value: stock.marketCap, color: '' },
                { label: 'PE Ratio',   value: stock.peRatio,   color: '' },
                { label: '52W High',   value: `$${stock.high52w}`, color: 'text-emerald-400' },
                { label: '52W Low',    value: `$${stock.low52w}`,  color: 'text-rose-400' },
                { label: 'Div Yield',  value: stock.dividendYield, color: 'text-blue-400' },
                { label: 'Beta',       value: stock.beta,      color: '' },
                { label: 'Volume',     value: stock.volume,    color: '', span: 2 },
              ].map(({ label, value, color, span }) => (
                <div key={label} className={cn("bento-card bg-white/[0.02] p-4 flex flex-col border-white/5", span === 2 ? "col-span-2" : "")}>
                  <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">{label}</span>
                  <span className={cn("font-mono text-sm font-black", color || "text-white")}>{value}</span>
                </div>
              ))}
            </div>

            {/* News */}
            {stockNews.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Latest Intel</h4>
                  <div className="h-[1px] flex-1 bg-white/5 ml-4" />
                </div>
                <div className="grid gap-3">
                  {stockNews.map((news, i) => (
                    <a
                      key={i}
                      href={news.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all group"
                    >
                      <div className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors line-clamp-2">{news.title}</div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[9px] text-accent font-black uppercase tracking-widest">{news.publisher}</span>
                        <span className="text-[9px] text-slate-600 font-bold uppercase">{new Date(news.providerPublishTime * 1000).toLocaleDateString()}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* AI Analysis */}
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
                      Analyze technical indicators and fundamental sentiment using Gemini's multi-modal intelligence.
                    </p>
                    <button
                      onClick={onAnalyze}
                      disabled={isAnalyzing}
                      className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-2xl font-black transition-all disabled:opacity-50 flex items-center gap-3 text-white shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95"
                    >
                      {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <ArrowUpRight size={20} />}
                      {isAnalyzing ? "Processing Data..." : "Run AI Analysis"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="report" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/20">
                          <BrainCircuit size={20} />
                        </div>
                        <h4 className="font-black text-xl text-white tracking-tight">AI Intelligence Report</h4>
                      </div>
                      <div className={cn("px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-sm border", sentimentColor)}>
                        <span className={cn("w-2 h-2 rounded-full", aiAnalysis.sentiment === 'High' ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                        {aiAnalysis.sentiment}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex flex-col justify-center">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">12M Target</div>
                        <div className="text-4xl font-black data-value text-blue-400 tracking-tighter">${aiAnalysis.priceTarget.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500 font-bold mt-2 flex items-center gap-1 uppercase tracking-tighter">
                          <ArrowUpRight size={12} className={aiAnalysis.priceTarget > stock.price ? "text-emerald-400" : "text-rose-400"} />
                          {(((aiAnalysis.priceTarget - stock.price) / stock.price) * 100).toFixed(1)}%{" "}
                          {aiAnalysis.priceTarget > stock.price ? "Appreciation" : "Correction"} expected
                        </div>
                      </div>
                      <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 leading-none">Trading Levels</div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Take Profit</span>
                            <span className="font-mono font-black text-lg text-white data-value">${aiAnalysis.sellingPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Buy In</span>
                            <span className="font-mono font-black text-lg text-white data-value">${aiAnalysis.buyInPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Cut Loss</span>
                            <span className="font-mono font-black text-lg text-white data-value">${aiAnalysis.cutLossPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full mt-4 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${aiAnalysis.confidence * 100}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="bg-blue-600 h-full rounded-full"
                          />
                        </div>
                        <div className="text-[9px] text-slate-500 font-black tracking-widest uppercase mt-2 text-center">
                          Model Conviction {(aiAnalysis.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <p className="text-slate-400 text-sm leading-relaxed font-medium bg-black/20 p-6 rounded-3xl italic border-l-4 border-blue-600">
                        "{aiAnalysis.summary}"
                      </p>
                    </div>

                    {aiAnalysis.technicals && (
                      <div className="flex gap-4">
                        <div className="flex-1 bg-white/[0.04] p-4 rounded-2xl border border-white/5 text-center">
                          <div className="text-[9px] text-slate-500 uppercase font-black mb-2">RSI (14)</div>
                          <div className={cn("text-lg font-black",
                            aiAnalysis.technicals.rsi > 70 ? "text-rose-400" :
                            aiAnalysis.technicals.rsi < 30 ? "text-emerald-400" : "text-white"
                          )}>{aiAnalysis.technicals.rsi}</div>
                          <div className="text-[8px] text-slate-600 mt-1 uppercase font-black">
                            {aiAnalysis.technicals.rsi > 70 ? "Overbought" : aiAnalysis.technicals.rsi < 30 ? "Oversold" : "Neutral"}
                          </div>
                        </div>
                        <div className="flex-1 bg-white/[0.04] p-4 rounded-2xl border border-white/5 text-center">
                          <div className="text-[9px] text-slate-500 uppercase font-black mb-2">MACD</div>
                          <div className={cn("text-lg font-black font-mono",
                            aiAnalysis.technicals.macd.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                          )}>{aiAnalysis.technicals.macd}</div>
                          <div className="text-[8px] text-slate-600 mt-1 uppercase font-black">Signal: {aiAnalysis.technicals.signal}</div>
                        </div>
                      </div>
                    )}

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
          </div>

          {/* Footer — buy / sell */}
          <footer className="p-8 border-t border-white/5 space-y-4 bg-surface sticky bottom-0 z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.4)]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Entry Price</label>
                <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                  <input
                    type="number"
                    value={manualPrice || ""}
                    onChange={e => setManualPrice(parseFloat(e.target.value) || 0)}
                    className="bg-transparent w-full text-sm font-black text-white outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Shares</label>
                <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                  <input
                    type="number"
                    value={tradeAmount || ""}
                    onChange={e => setTradeAmount(parseInt(e.target.value) || 0)}
                    placeholder="Qty"
                    className="bg-transparent w-full text-sm font-black text-white outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await onAddToPortfolio(stock.symbol, tradeAmount, manualPrice);
                    setTradeAmount(0);
                  } catch (e: any) {
                    showToast(`Error: ${e.message}`, 'error');
                  }
                }}
                className="flex-1 bg-white text-black py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-xl shadow-white/5 active:scale-95 text-xs uppercase tracking-widest"
              >
                Confirm Buy
              </button>
              {portfolioItem && (
                <button
                  onClick={() => onSell(stock.symbol)}
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
