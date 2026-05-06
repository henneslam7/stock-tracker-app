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
  onSelectRecommendation: (symbol: string, name: string) => void;
  onRemoveFromPortfolio: (symbol: string) => void;
  onAddToPortfolio: (symbol: string) => void;
  onToggleWatchlist: (symbol: string) => void;
  onSell: (symbol: string) => void;
}

const MARKET_LABELS: Record<string, string> = {
  US: 'US Equities',
  HK: 'HK Stocks',
  ETF: 'ETFs',
};

function RecCard({
  rec, isContrarian, watchlist, onSelect, onToggleWatchlist,
}: {
  rec: Recommendation;
  isContrarian: boolean;
  watchlist: string[];
  onSelect: (symbol: string, name: string) => void;
  onToggleWatchlist: (symbol: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(rec.symbol, rec.name)}
      className={cn(
        "p-4 rounded-[1.5rem] flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer group transition-all",
        isContrarian
          ? "bg-amber-500/[0.04] border border-amber-500/20 hover:bg-amber-500/[0.08]"
          : "bg-white/[0.03] border border-white/[0.05] table-row-hover"
      )}
    >
      {/* Symbol + name */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={cn(
          "w-10 h-10 rounded-xl border flex items-center justify-center font-black text-[10px] shrink-0",
          isContrarian
            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
            : "bg-black border-white/10 text-white"
        )}>
          {rec.symbol.substring(0, 4)}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white text-sm tracking-tight flex items-center gap-2 flex-wrap">
            <span className="shrink-0">{rec.symbol}</span>
            {isContrarian && (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 border border-amber-500/40 rounded px-1.5 py-0.5 shrink-0">
                Contrarian
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[140px]">{rec.name}</div>
        </div>
      </div>

      {/* Reason + technicals */}
      <div className="flex-1 min-w-0 sm:px-3">
        <div className={cn("text-xs italic line-clamp-2 break-words", isContrarian ? "text-amber-200/60" : "text-slate-400")}>
          "{rec.reason}"
        </div>
        {rec.technicals && (
          <div className="mt-1.5 flex gap-2 text-[9px] font-mono flex-wrap">
            <span className="bg-white/5 py-0.5 px-2 rounded-lg text-slate-400 border border-white/5 whitespace-nowrap">RSI: <span className="text-white">{rec.technicals.rsi}</span></span>
            <span className="bg-white/5 py-0.5 px-2 rounded-lg text-slate-400 border border-white/5 whitespace-nowrap">MACD: <span className="text-white">{rec.technicals.macd}</span></span>
          </div>
        )}
      </div>

      {/* Indicator + watchlist */}
      <div className="flex gap-3 items-center shrink-0 self-end sm:self-auto">
        <span className={cn(
          "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border whitespace-nowrap",
          rec.indicator === 'High' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' :
          rec.indicator === 'Low'  ? 'text-rose-400 border-rose-400/20 bg-rose-400/10' :
          'text-slate-400 border-slate-400/20 bg-slate-400/10'
        )}>{rec.indicator}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggleWatchlist(rec.symbol); }}
          className="text-accent hover:text-white p-2 shrink-0"
        >
          {watchlist.includes(rec.symbol) ? <X size={18} /> : <Plus size={18} />}
        </button>
      </div>
    </div>
  );
}

export function AssetList({
  activeTab, portfolio, watchlist, prices, recommendations,
  onSelectStock, onSelectRecommendation, onRemoveFromPortfolio, onAddToPortfolio, onToggleWatchlist, onSell
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

    const grouped = (['US', 'HK', 'ETF'] as const).map(market => ({
      market,
      label: MARKET_LABELS[market],
      standard:    recommendations.filter(r => r.market === market && r.tier !== 'contrarian'),
      contrarian:  recommendations.filter(r => r.market === market && r.tier === 'contrarian'),
    })).filter(g => g.standard.length > 0 || g.contrarian.length > 0);

    return (
      <div className="flex-1 overflow-y-auto px-2 custom-scrollbar space-y-8">
        {grouped.map(({ market, label, standard, contrarian }) => (
          <div key={market}>
            {/* Market header */}
            <div className="flex items-center gap-3 mb-4 px-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
              <div className="h-[1px] flex-1 bg-white/5" />
              <span className="text-[9px] font-black text-slate-600">{standard.length + contrarian.length}</span>
            </div>

            {/* Standard picks */}
            {standard.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Standard Picks</span>
                </div>
                <div className="space-y-2">
                  {standard.map(rec => (
                    <div key={rec.symbol}>
                      <RecCard rec={rec} isContrarian={false}
                        watchlist={watchlist} onSelect={onSelectRecommendation} onToggleWatchlist={onToggleWatchlist}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contrarian picks */}
            {contrarian.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-600">Contrarian Picks</span>
                  <span className="text-[7px] text-amber-700 font-bold italic">— against consensus</span>
                </div>
                <div className="space-y-2">
                  {contrarian.map(rec => (
                    <div key={rec.symbol}>
                      <RecCard rec={rec} isContrarian={true}
                        watchlist={watchlist} onSelect={onSelectRecommendation} onToggleWatchlist={onToggleWatchlist}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              className="p-4 md:p-5 bg-white/[0.03] border border-white/[0.05] rounded-[1.5rem] flex items-center justify-between table-row-hover group cursor-pointer"
            >
              <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-black rounded-xl border border-white/10 flex items-center justify-center font-black text-[10px] text-white shrink-0">
                  {item.symbol.substring(0, 3)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm tracking-tight truncate">{data.name}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{item.symbol}
                    <span className="hidden sm:inline"> • {data.sector}</span>
                  </div>
                  {/* Mobile-only: gain shown inline under name */}
                  {gain !== null && (
                    <div className={cn("text-[10px] font-black sm:hidden", gain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {gain >= 0 ? "+" : ""}${Math.abs(gain).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 md:gap-8 shrink-0">
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
                <div className="text-right w-20 md:w-24">
                  <div className="text-sm font-black text-white data-value">${data.price.toFixed(2)}</div>
                  <div className={cn("text-[10px] font-black uppercase tracking-tighter", data.change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {data.change >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
                  </div>
                </div>

                {/* Actions: always visible on mobile, hover-reveal on desktop */}
                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:translate-x-2 md:group-hover:translate-x-0 transition-all">
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
                        className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl hidden sm:block"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); onAddToPortfolio(item.symbol); }}
                        className="p-2 text-accent hover:bg-accent/10 rounded-xl"
                        title="Add to portfolio"
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onToggleWatchlist(item.symbol); }}
                        className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl"
                        title="Remove from watchlist"
                      >
                        <X size={16} />
                      </button>
                    </>
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
