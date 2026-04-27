import { motion, AnimatePresence } from "motion/react";
import { Plus, X, ChevronRight, Trash2, Search, RefreshCw, DollarSign } from "lucide-react";
import { cn } from "../lib/utils";
import { Stock, PortfolioItem, Recommendation, ActiveTab } from "../types";

interface AssetListProps {
  activeTab: ActiveTab;
  portfolio: PortfolioItem[];
  watchlist: string[];
  prices: Record<string, Stock>;
  recommendations: Recommendation[];
  onSelectStock: (stock: Stock) => void;
  onRemoveFromPortfolio: (symbol: string) => Promise<void>;
  onAddToPortfolio: (symbol: string) => Promise<void>;
  onToggleWatchlist: (symbol: string) => void;
  onSell: (symbol: string) => void;
}

export function AssetList({
  activeTab, portfolio, watchlist, prices, recommendations,
  onSelectStock, onRemoveFromPortfolio, onAddToPortfolio, onToggleWatchlist, onSell
}: AssetListProps) {
  if (activeTab === "discover") {
    if (recommendations.length === 0) {
      return (
        <div className="flex-1 py-20 flex flex-col items-center justify-center text-slate-500 italic opacity-50">
          <RefreshCw className="animate-spin mb-4" size={40} />
          Gemini generating recommendations...
        </div>
      );
    }
    return (
      <div className="flex-1 overflow-y-auto space-y-3 px-2 custom-scrollbar">
        {recommendations.map(rec => (
          <div key={rec.symbol} className="p-5 bg-white/[0.03] border border-white/[0.05] rounded-[1.5rem] flex items-center justify-between table-row-hover">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-black rounded-xl border border-white/10 flex items-center justify-center font-black text-[10px] text-white">
                {rec.market}
              </div>
              <div>
                <div className="font-bold text-white text-sm tracking-tight">{rec.symbol}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{rec.name}</div>
              </div>
            </div>
            <div className="flex-1 px-8">
              <div className="text-xs text-slate-400 italic line-clamp-2">"{rec.reason}"</div>
              {rec.technicals && (
                <div className="mt-2 flex gap-3 text-[9px] font-mono">
                  <span className="bg-white/5 py-1 px-2 rounded-lg text-slate-400 border border-white/5">RSI: <span className="text-white">{rec.technicals.rsi}</span></span>
                  <span className="bg-white/5 py-1 px-2 rounded-lg text-slate-400 border border-white/5">MACD: <span className="text-white">{rec.technicals.macd}</span></span>
                </div>
              )}
            </div>
            <div className="flex gap-4 items-center">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border",
                rec.indicator === 'High' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' :
                rec.indicator === 'Low'  ? 'text-rose-400 border-rose-400/20 bg-rose-400/10' :
                'text-slate-400 border-slate-400/20 bg-slate-400/10'
              )}>{rec.indicator}</span>
              <button onClick={() => onToggleWatchlist(rec.symbol)} className="text-accent hover:text-white p-2">
                {watchlist.includes(rec.symbol) ? <X size={18} /> : <Plus size={18} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = activeTab === "portfolio"
    ? portfolio
    : watchlist.map(s => ({ symbol: s } as PortfolioItem));

  const isEmpty = items.length === 0;

  return (
    <div className="flex-1 overflow-y-auto space-y-3 px-2 custom-scrollbar">
      <AnimatePresence mode="popLayout">
        {items.map(item => {
          const data = prices[item.symbol];

          if (!data) {
            return (
              <div key={item.symbol} className="p-5 bg-white/[0.01] border border-white/[0.03] rounded-[1.5rem] flex items-center gap-4 opacity-50">
                <div className="w-12 h-12 bg-slate-900 rounded-xl border border-white/5 flex items-center justify-center font-black text-[10px] text-slate-500 animate-pulse">...</div>
                <div>
                  <div className="font-bold text-slate-500 text-sm">{item.symbol}</div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Loading...</div>
                </div>
              </div>
            );
          }

          const portfolioItem = activeTab === "portfolio" ? (item as PortfolioItem) : undefined;
          const gain = portfolioItem ? (data.price - portfolioItem.averagePrice) * portfolioItem.shares : null;

          return (
            <motion.div
              key={item.symbol}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => onSelectStock(data)}
              className="p-5 bg-white/[0.03] border border-white/[0.05] rounded-[1.5rem] flex items-center justify-between table-row-hover group cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black rounded-xl border border-white/10 flex items-center justify-center font-black text-[10px] text-white">
                  {item.symbol.substring(0, 3)}
                </div>
                <div>
                  <div className="font-bold text-white text-sm tracking-tight">{data.name}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{item.symbol} • {data.sector}</div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                {portfolioItem && (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-black text-white">{portfolioItem.shares} <span className="text-[10px] text-slate-500 uppercase">Shares</span></div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase leading-none mt-1">Avg: ${portfolioItem.averagePrice.toFixed(2)}</div>
                  </div>
                )}
                {gain !== null && (
                  <div className="text-right hidden sm:block">
                    <div className={cn("text-sm font-black data-value", gain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {gain >= 0 ? "+" : ""}${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase leading-none mt-1">Total Return</div>
                  </div>
                )}
                <div className="text-right w-24">
                  <div className="text-sm font-black text-white data-value">${data.price.toFixed(2)}</div>
                  <div className={cn("text-[10px] font-black uppercase tracking-tighter", data.change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {data.change >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                  {activeTab === "portfolio" ? (
                    <>
                      <button
                        onClick={async e => { e.stopPropagation(); onSell(item.symbol); }}
                        className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-xl"
                        title="Sell"
                      >
                        <DollarSign size={16} />
                      </button>
                      <button
                        onClick={async e => { e.stopPropagation(); await onRemoveFromPortfolio(item.symbol); }}
                        className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={async e => { e.stopPropagation(); await onAddToPortfolio(item.symbol); }}
                      className="p-2 text-accent hover:bg-accent/10 rounded-xl"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                  <div className="p-2 text-slate-500"><ChevronRight size={16} /></div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isEmpty && (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500 italic opacity-50">
          <Search size={40} className="mb-4" />
          No assets in your {activeTab} yet.
        </div>
      )}
    </div>
  );
}
