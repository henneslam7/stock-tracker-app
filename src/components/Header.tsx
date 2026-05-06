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
  onSelectFromSearch: (symbol: string, name: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
}

export function Header({
  marketStatus, searchQuery, onSearchChange,
  searchResults, prices, watchlist, onToggleWatchlist, onSelectFromSearch, searchInputRef
}: HeaderProps) {
  return (
    <div className="flex-none space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white">Market Intel</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium flex items-center gap-2">
            Portfolio Tracking • <span className="text-emerald-400 font-bold">Analysis Active</span>
            <span className="text-[9px] font-black text-slate-600 border border-slate-700/60 rounded px-1.5 py-0.5 tracking-widest">
              v{__APP_VERSION__}
            </span>
          </p>
        </div>

        {/* Desktop-only: market status + AI engine + search */}
        <div className="hidden lg:flex gap-4 items-center">
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

          <div className="flex items-center gap-4 bg-surface border border-line px-5 py-3 rounded-[1.5rem]">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">AI Engine</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-lg shadow-blue-500/80 animate-pulse" />
              <span className="text-sm font-bold text-blue-400">Gemini Active</span>
            </div>
          </div>

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
                  const name = s.shortName || s.longName || symbol;
                  return (
                    <div
                      key={symbol}
                      onClick={() => onSelectFromSearch(symbol, name)}
                      className="w-full text-left px-5 py-4 hover:bg-white/5 flex items-center justify-between border-b last:border-0 border-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full mr-4">
                        <div>
                          <div className="font-bold text-sm text-white">{symbol}</div>
                          <div className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">{name}</div>
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
                      <button
                        onClick={e => { e.stopPropagation(); onToggleWatchlist(symbol); }}
                        className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        {watchlist.includes(symbol) ? <X size={16} className="text-slate-500" /> : <Plus size={16} className="text-accent" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tablet/mobile: compact market dots */}
        <div className="flex lg:hidden items-center gap-3">
          <div className="flex items-center gap-2">
            {[{ label: 'US', status: marketStatus.us }, { label: 'HK', status: marketStatus.hk }].map(({ label, status }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", status === 'Open' ? "bg-emerald-500" : "bg-slate-600")} />
                <span className="text-[10px] text-slate-400 font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile-only full-width search bar */}
      <div className="lg:hidden relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search symbol..."
          className="w-full bg-surface border border-line rounded-2xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-accent outline-none transition-all"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-white/10 rounded-2xl shadow-2xl z-[60] max-h-64 overflow-y-auto">
            {searchResults.map(s => {
              const { symbol } = s;
              const name = s.shortName || s.longName || symbol;
              return (
                <div
                  key={symbol}
                  onClick={() => onSelectFromSearch(symbol, name)}
                  className="px-4 py-3 hover:bg-white/5 flex items-center justify-between border-b last:border-0 border-white/5 cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{symbol}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{name}</div>
                  </div>
                  {prices[symbol] && (
                    <div className="text-right mr-3">
                      <div className="text-xs font-bold text-white">${prices[symbol].price.toFixed(2)}</div>
                      <div className={cn("text-[9px] font-bold", prices[symbol].change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {prices[symbol].change >= 0 ? "+" : ""}{prices[symbol].changePercent.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  <button onClick={e => { e.stopPropagation(); onToggleWatchlist(symbol); }} className="p-1">
                    {watchlist.includes(symbol) ? <X size={16} className="text-slate-500" /> : <Plus size={16} className="text-accent" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
