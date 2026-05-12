import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, TrendingUp, TrendingDown, Newspaper,
  Activity, AlertTriangle, BarChart2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { ETFSentimentResponse } from "../types";
import { getETFSentiment } from "../services/geminiService";

const ETF_META: Record<string, string> = {
  TQQQ: "3× Nasdaq Bull",
  UPRO: "3× S&P500 Bull",
  SPXL: "3× S&P500 Bull",
  SOXL: "3× Semis Bull",
  LABU: "3× Biotech Bull",
  SQQQ: "3× Nasdaq Bear",
  SPXS: "3× S&P500 Bear",
  SOXS: "3× Semis Bear",
  TZA:  "3× SmallCap Bear",
  UVXY: "VIX 1.5×",
};

const SENTIMENT_CFG = {
  Bullish: { text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
  Bearish: { text: "text-rose-400",    border: "border-rose-500/30",    bg: "bg-rose-500/10",    dot: "bg-rose-400"    },
  Neutral: { text: "text-slate-400",   border: "border-slate-500/30",   bg: "bg-slate-500/10",   dot: "bg-slate-400"   },
  Mixed:   { text: "text-amber-400",   border: "border-amber-500/30",   bg: "bg-amber-500/10",   dot: "bg-amber-400"   },
};

function ETFRow({ symbol, price, change, changePercent }: { symbol: string; price: number; change: number; changePercent: number }) {
  const up = changePercent >= 0;
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] sm:text-xs font-black text-white">{symbol}</span>
        <span className={cn("text-[9px] sm:text-[10px] font-black", up ? "text-emerald-400" : "text-rose-400")}>
          {up ? "+" : ""}{(changePercent ?? 0).toFixed(2)}%
        </span>
      </div>
      <div className="text-[9px] text-slate-500 font-medium">{ETF_META[symbol] ?? ""}</div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold font-mono">${(price ?? 0).toFixed(2)}</span>
        <span className={cn("text-[8px] font-bold", up ? "text-emerald-600" : "text-rose-600")}>
          {up ? "+" : ""}{(change ?? 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function ETFAnalysisCard() {
  const [data, setData] = useState<ETFSentimentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const json = await getETFSentiment();
      setData(json);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load market data. Check API keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sentKey = (data?.sentiment?.sentiment ?? "Neutral") as keyof typeof SENTIMENT_CFG;
  const cfg = SENTIMENT_CFG[sentKey] ?? SENTIMENT_CFG.Neutral;

  return (
    <div className="flex-1 flex flex-col gap-4 sm:gap-5 overflow-y-auto custom-scrollbar px-1 pb-4">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-accent/10 rounded-2xl flex items-center justify-center">
            <BarChart2 size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">做空 / 做多</div>
            <div className="text-white font-black text-sm sm:text-base">ETF Pulse</div>
          </div>
          {data && (
            <div className={cn(
              "ml-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5",
              cfg.bg, cfg.border, cfg.text
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", cfg.dot)} />
              {data.sentiment.sentiment}
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-white transition-colors rounded-xl hover:bg-white/5"
          title="Refresh"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* ── Loading skeleton ──────────────────────────────────────────── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <RefreshCw size={24} className="animate-spin text-slate-500" />
          <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Fetching market data…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <AlertTriangle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* ── Fear / Greed gauge ──────────────────────────────────────── */}
          <div className="bento-card bg-white/[0.02] border-white/5 p-4 sm:p-5 shrink-0">
            <div className="flex justify-between text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">
              <span>Extreme Fear</span>
              <span className={cn("font-black", cfg.text)}>Score: {data.sentiment.score ?? 50}</span>
              <span>Extreme Greed</span>
            </div>
            <div className="h-3 bg-gradient-to-r from-rose-600 via-amber-400 to-emerald-500 rounded-full relative shadow-inner">
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 border-bg transition-all duration-700"
                style={{ left: `${Math.min(100, Math.max(0, data.sentiment.score ?? 50))}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-slate-700 font-bold mt-1.5">
              {[0, 25, 50, 75, 100].map(v => <span key={v}>{v}</span>)}
            </div>
          </div>

          {/* ── Market overview: SPY + QQQ ───────────────────────────────── */}
          {data.market && (
            <div className="grid grid-cols-2 gap-3 shrink-0">
              {["SPY", "QQQ"].map(sym => {
                const q = data.market[sym];
                if (!q) return null;
                const up = (q.changePercent ?? 0) >= 0;
                return (
                  <div key={sym} className="bento-card bg-white/[0.02] border-white/5 p-3 sm:p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{sym}</div>
                      <div className="text-white font-black text-sm sm:text-base font-mono">${(q.price ?? 0).toFixed(2)}</div>
                    </div>
                    <div className={cn("text-xs font-black flex items-center gap-1", up ? "text-emerald-400" : "text-rose-400")}>
                      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {up ? "+" : ""}{(q.changePercent ?? 0).toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bull / Bear columns ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
            {/* Bull 做多 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                <TrendingUp size={11} /> 做多 Bull
              </div>
              {(data.bull ?? []).map(etf => <ETFRow key={etf.symbol} {...etf} />)}
            </div>
            {/* Bear 做空 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-rose-400 mb-1">
                <TrendingDown size={11} /> 做空 Bear
              </div>
              {(data.bear ?? []).map(etf => <ETFRow key={etf.symbol} {...etf} />)}
            </div>
          </div>

          {/* ── AI Market Intelligence ───────────────────────────────────── */}
          {data.sentiment?.summary && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 sm:p-5 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={12} className="text-blue-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">AI Market Intelligence</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">{data.sentiment.summary}</p>
              {data.sentiment.keySignal && (
                <div className="mt-3 text-[10px] text-blue-300 font-bold border-t border-blue-500/10 pt-3">
                  ▸ {data.sentiment.keySignal}
                </div>
              )}
            </div>
          )}

          {/* ── Market News ──────────────────────────────────────────────── */}
          {(data.news ?? []).length > 0 && (
            <div className="space-y-3 shrink-0">
              <div className="flex items-center gap-2">
                <Newspaper size={12} className="text-slate-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Market News</span>
                <div className="flex-1 h-[1px] bg-white/5" />
              </div>
              {data.news.slice(0, 6).map((n, i) => (
                <a
                  key={i}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 sm:p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.05] transition-all group"
                >
                  <div className="text-[11px] sm:text-xs font-bold text-slate-300 group-hover:text-white transition-colors line-clamp-2 leading-snug">
                    {n.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {n.source && (
                      <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{n.source}</span>
                    )}
                    {n.date && <span className="text-[9px] text-slate-700">{n.date}</span>}
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* ── Last updated ──────────────────────────────────────────────── */}
          {lastUpdated && (
            <div className="text-center text-[9px] text-slate-700 font-bold shrink-0">
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
