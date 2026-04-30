import { RefObject } from "react";
import { Search, Plus, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Stock } from "../types";

interface HeaderProps {
  marketStatus: { us: string; hk: string };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: any[];
  prices: Record<string, Stock>;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
}

export function Header({
  marketStatus, searchQuery, onSearchChange,
  searchResults, prices, watchlist, onToggleWatchlist, searchInputRef
}: HeaderProps) {
  return (
    <div className="flex-none flex items-center justify-between px-2">
      <div>
        <h1 className="text-3xl font-black tracking-tighter text-white">Market Intel</h1>
        <p className="text-slate-500 text-sm font-medium">
          Portfolio Tracking • <span className="text-emerald-400 font-bold">Analysis Active</span>
        </p>
      </div>

      <div className="hidden lg:flex gap-4 items-center">
        {/* Market status */}
        <div className="flex items-center gap-4 bg-surface border border-line px-5 py-3 rounded-[1.5rem]">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">Markets</span>
          <div className="flex items-center gap-4">
            {[{ label: 'US', status: marketStatus.us }, { label: 'HK', status: marketStatus.hk }].map(({ label, status }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  status === 'Open' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                )} />
                <span className="text-[10px] text-white font-bold">{label} {status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Engine status */}
        <div className="flex items-center gap-4 bg-surface border border-line px-5 py-3 rounded-[1.5rem]">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">AI Engine</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-lg shadow-blue-500/80 animate-pulse" />
            <span className="text-sm font-bold text-blue-400">Gemini Active</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search symbol..."
            className="bg-surface border border-line rounded-[1.5rem] py-3 pl-12 pr-6 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-accent outline-none w-64 transition-all"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-surface border border-white/10 rounded-2xl shadow-2xl z-[60] max-h-60 overflow-y-auto backdrop-blur-xl">
              {searchResults.map(s => {
                const { symbol } = s;
                return (
                  <button
                    key={symbol}
                    onClick={() => onToggleWatchlist(symbol)}
                    className="w-full text-left px-5 py-4 hover:bg-white/5 flex items-center justify-between border-b last:border-0 border-white/5 transition-colors"
                  >
                    <div className="flex items-center justify-between w-full mr-4">
                      <div>
                        <div className="font-bold text-sm text-white">{symbol}</div>
                        <div className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">{s.shortName || s.longName}</div>
                        <div className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">{s.exchDisp || "STOCK"} • {s.quoteType || "EQUITY"}</div>
                      </div>
                      {prices[symbol] && (
                        <div className="text-right">
                          <div className="text-xs font-bold text-white">${prices[symbol].price.toFixed(2)}</div>
                          <div className={cn("text-[9px] font-bold", prices[symbol].change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {prices[symbol].change >= 0 ? "+" : ""}{prices[symbol].changePercent.toFixed(2)}%
                          </div>
                        </div>
                      )}
                    </div>
                    {watchlist.includes(symbol) ? <X size={16} className="text-slate-500" /> : <Plus size={16} className="text-accent" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
