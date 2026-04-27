import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Search, 
  PieChart as PieChartIcon, 
  List, 
  Activity, 
  BrainCircuit, 
  X,
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ChevronRight,
  Trash2,
  Compass
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from "recharts";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { Stock, PortfolioItem, PricePoint, AIAnalysis, Recommendation, Transaction } from "./types";
import { StockService } from "./services/stockService";
import { analyzeStock, getRecommendations } from "./services/geminiService";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { INITIAL_WATCHLIST } from "./constants";
import { getMarketStatus } from "./lib/marketUtils";
import { calculateRSI } from "./lib/indicators";
import { auth, loginWithGoogle, logout, loadPortfolioFromDb, syncPortfolioToDb, deletePortfolioItemDb, checkSubscriptionDb, toggleSubscriptionDb } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{isOpen: boolean, feature: string}>({isOpen: false, feature: ""});

  const [portfolio, setPortfolio] = useLocalStorage<PortfolioItem[]>("stock_tracker_portfolio", []);
  const [watchlist, setWatchlist] = useLocalStorage<string[]>("stock_tracker_watchlist", INITIAL_WATCHLIST);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
         const dbPortfolio = await loadPortfolioFromDb(currentUser.uid);
         if (dbPortfolio.length > 0) {
            setPortfolio(dbPortfolio);
         }
         const subStatus = await checkSubscriptionDb(currentUser.uid);
         setIsSubscribed(subStatus);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeAmount, setTradeAmount] = useState<number>(0);
  const [manualPrice, setManualPrice] = useState<number>(0);
  const [historicalData, setHistoricalData] = useState<PricePoint[]>([]);
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSearch, setFilteredSearch] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"portfolio" | "watchlist" | "discover">("portfolio");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [marketStatus, setMarketStatus] = useState({ us: 'Closed', hk: 'Closed' });

  const [prices, setPrices] = useState<Record<string, Stock>>({});

  useEffect(() => {
    const updateMarket = () => setMarketStatus(getMarketStatus());
    updateMarket();
    const inv = setInterval(updateMarket, 60000);
    return () => clearInterval(inv);
  }, []);

  // Fetch prices periodically
  useEffect(() => {
    const fetchPrices = async () => {
      const allSymbols = Array.from(new Set([...portfolio.map(p => p.symbol), ...watchlist]));
      if (allSymbols.length > 0) {
         try {
           const newPrices = await StockService.getStocksData(allSymbols);
           setPrices(newPrices);
         } catch (err) {}
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // 30s
    return () => clearInterval(interval);
  }, [portfolio, watchlist]);

  // Load historical data when stock selected
  useEffect(() => {
    if (selectedStock) {
      setManualPrice(selectedStock.price);
      StockService.getStockInfo(selectedStock.symbol)
        .then(info => {
          if(info?.chart && info.chart.length > 0) {
            setHistoricalData(info.chart.map((c: any) => ({
              date: new Date(c.date).toISOString().split('T')[0],
              price: c.close
            })));
          } else {
            setHistoricalData([]);
          }
          setStockNews(info.news || []);
        })
        .catch(err => {
          console.error("Failed to load stock info:", err);
          setHistoricalData([]);
          setStockNews([]);
        });
      setAiAnalysis(null);
    }
  }, [selectedStock]);

  const handleAnalyze = async () => {
    if (!selectedStock) return;
    
    if (!user) {
      setAuthModal({ isOpen: true, feature: "AI Analysis" });
      return;
    }
    
    if (!isSubscribed) {
      const wantSub = confirm("AI Analysis requires a subscription. Would you like to subscribe now?");
      if (wantSub) {
        try {
          await toggleSubscriptionDb(user.uid, true);
          setIsSubscribed(true);
          alert("Subscription active! You can now analyze stocks.");
        } catch(e: any) {
          alert(`Subscription Error: ${e.message}`);
        }
      }
      return; // Exit here regardless, user must click Analyze again
    }

    setIsAnalyzing(true);
    try {
      const info = await StockService.getStockInfo(selectedStock.symbol);
      const chartPrices = info.chart?.map((c: any) => c.close) || [];
      const rsiValue = calculateRSI(chartPrices);

      const result = await analyzeStock(
        {
          ...selectedStock,
          peRatio: selectedStock.peRatio,
          high52w: selectedStock.high52w,
          low52w: selectedStock.low52w,
          dividendYield: selectedStock.dividendYield,
          beta: selectedStock.beta,
          rsi: rsiValue // Passing RSI to AI
        } as any, 
        info.chart, 
        info.news, 
        info.quoteSummary,
        manualPrice
      );
      setAiAnalysis({
        ...result,
        technicals: {
          rsi: parseFloat(rsiValue.toFixed(2)),
          macd: "Trend Analyzing...",
          signal: result.sentiment
        }
      });
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadRecommendations = async () => {
    if (!user) {
      setAuthModal({ isOpen: true, feature: "AI Recommendations" });
      return;
    }
    if (!isSubscribed) {
      const wantSub = confirm("AI Recommendations require a subscription. Would you like to subscribe now?");
      if (wantSub) {
        try {
          await toggleSubscriptionDb(user.uid, true);
          setIsSubscribed(true);
          alert("Subscription active!");
        } catch(e: any) {
          alert(`Subscription Error: ${e.message}`);
          return;
        }
      } else {
        return;
      }
    }

    setActiveTab("discover");
    if(recommendations.length === 0) {
       const recs = await getRecommendations();
       setRecommendations(recs);
    }
  };

  const addToPortfolioManual = async (symbol: string, shares: number, buyPrice: number) => {
    if (!selectedStock || shares <= 0) return;
    
    if (!user) {
      setAuthModal({ isOpen: true, feature: "Portfolio Sync" });
      return;
    }

    const cost = buyPrice * shares;
    const existing = portfolio.find(p => p.symbol === symbol);
    
    let updatedPortfolio = [];
    if (existing) {
      const newShares = existing.shares + shares;
      const newTotalCost = existing.totalCost + cost;
      updatedPortfolio = portfolio.map(p => 
        p.symbol === symbol 
          ? { ...p, shares: newShares, totalCost: newTotalCost, averagePrice: newTotalCost / newShares }
          : p
      );
    } else {
      updatedPortfolio = [...portfolio, { 
        symbol, 
        shares, 
        averagePrice: buyPrice, 
        totalCost: cost 
      }];
    }
    
    const previousPortfolio = [...portfolio];
    try {
      setPortfolio(updatedPortfolio);
      await syncPortfolioToDb(user.uid, updatedPortfolio);
      setTradeAmount(0);
    } catch (e: any) {
      setPortfolio(previousPortfolio);
      throw e;
    }
  };

  const removeFromPortfolio = async (symbol: string) => {
    if (!user) return;
    const previousPortfolio = [...portfolio];
    try {
      const updated = portfolio.filter(p => p.symbol !== symbol);
      setPortfolio(updated);
      await deletePortfolioItemDb(user.uid, symbol);
    } catch (e: any) {
      setPortfolio(previousPortfolio);
      throw e;
    }
  };

  const portfolioValue = useMemo(() => {
    return portfolio.reduce((acc, item) => {
      const currentPrice = prices[item.symbol]?.price || 0;
      // Only count if price is actually loaded to avoid showing "loss" while loading
      if (currentPrice === 0 && !prices[item.symbol]) return acc;
      return acc + currentPrice * item.shares;
    }, 0);
  }, [portfolio, prices]);

  const portfolioGain = useMemo(() => {
    const costBasis = portfolio.reduce((acc, item) => {
      // Only count cost basis for items that have a price loaded 
      // so the gain/loss is meaningful
      if (!prices[item.symbol]) return acc;
      return acc + (item.averagePrice * item.shares);
    }, 0);
    
    if (portfolio.length === 0) return 0;
    return portfolioValue - costBasis;
  }, [portfolio, portfolioValue, prices]);

  const addToPortfolio = async (symbol: string) => {
    if (!user) {
      setAuthModal({ isOpen: true, feature: "Portfolio Sync" });
      return;
    }
    const existing = portfolio.find(p => p.symbol === symbol);
    if (existing) return;
    
    const newItems = [...portfolio, { 
      symbol, 
      shares: 1, 
      averagePrice: prices[symbol]?.price || 0, 
      totalCost: prices[symbol]?.price || 0 
    }];
    
    const prevItems = [...portfolio];
    try {
      setPortfolio(newItems);
      await syncPortfolioToDb(user.uid, newItems);
    } catch (e: any) {
      setPortfolio(prevItems);
      throw e;
    }
  };


  const toggleWatchlist = (symbol: string) => {
    if (watchlist.includes(symbol)) {
      setWatchlist(watchlist.filter(s => s !== symbol));
    } else {
      setWatchlist([...watchlist, symbol]);
    }
  };

  useEffect(() => {
    const doSearch = async () => {
      if(!searchQuery) { setFilteredSearch([]); return; }
      const results = await StockService.searchSymbols(searchQuery);
      
      // Optionally fetch prices for results to show them in the dropdown
      if (results.length > 0) {
        const resultSymbols = results.map((r: any) => r.symbol);
        const priceData = await StockService.getStocksData(resultSymbols);
        setPrices(prev => ({ ...prev, ...priceData }));
      }
      
      setFilteredSearch(results);
    };
    const to = setTimeout(doSearch, 400);
    return () => clearTimeout(to);
  }, [searchQuery]);

  return (
    <div className="flex h-screen bg-bg text-ink font-sans overflow-hidden p-6 gap-6">
      {/* Sidebar Rail */}
      <nav className="hidden md:flex flex-col items-center py-6 space-y-8 w-20 bg-surface border border-line rounded-[2.5rem]">
        <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-accent/20 cursor-pointer hover:scale-105 transition-transform">
          <Activity size={24} />
        </div>
        
        <div className="flex flex-col gap-8 text-slate-500">
          <button 
            onClick={() => setActiveTab("portfolio")}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === "portfolio" ? "bg-white/10 text-white shadow-xl shadow-white/5" : "hover:text-white"
            )}
            title="Portfolio"
          >
            <PieChartIcon size={24} />
          </button>
          
          <button 
            onClick={() => setActiveTab("watchlist")}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === "watchlist" ? "bg-white/10 text-white shadow-xl shadow-white/5" : "hover:text-white"
            )}
            title="Watchlist"
          >
            <List size={24} />
          </button>

          <button 
            onClick={loadRecommendations}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === "discover" ? "bg-white/10 text-white shadow-xl shadow-white/5" : "hover:text-white"
            )}
            title="Discover AI Picks"
          >
            <Compass size={24} />
          </button>

          <button 
            className="p-3 text-slate-500 hover:text-white transition-colors"
            onClick={() => searchInputRef.current?.focus()}
            title="Search"
          >
            <Search size={24} />
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-6 items-center">
          <button 
            onClick={() => window.location.reload()}
            className="p-3 text-slate-500 hover:text-white hover:rotate-180 transition-all duration-500"
          >
            <RefreshCw size={24} />
          </button>
          <div 
            onClick={async () => {
              if (user) {
                if (confirm("Logout?")) {
                  await logout();
                  setPortfolio([]); // clear state on logout
                }
              } else {
                setAuthModal({ isOpen: true, feature: "User Profile" });
              }
            }}
            className={cn("w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 font-bold overflow-hidden cursor-pointer hover:border-white/30 transition-colors", user ? "border-emerald-500/50" : "")}
            title={user ? user.email || 'Logged in' : 'Login / Signup'}
          >
            {user && user.photoURL ? (
              <img src={user.photoURL} alt="User" />
            ) : (
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${user ? user.email : 'Guest'}`} alt="User" />
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-2 min-w-0">
        
        {/* Header / Search */}
        <div className="flex-none flex items-center justify-between px-2">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">Market Intel</h1>
            <p className="text-slate-500 text-sm font-medium">
              Portfolio Tracking • <span className="text-emerald-400 font-bold">Analysis Active</span>
            </p>
          </div>

          <div className="hidden lg:flex gap-4 items-center">
            <div className="flex items-center gap-4 bg-surface border border-line px-5 py-3 rounded-[1.5rem]">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">Markets</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", marketStatus.us === 'Open' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600")}></div>
                  <span className="text-[10px] text-white font-bold">US {marketStatus.us}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", marketStatus.hk === 'Open' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600")}></div>
                  <span className="text-[10px] text-white font-bold">HK {marketStatus.hk}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-surface border border-line px-5 py-3 rounded-[1.5rem] cursor-pointer hover:border-white/20 transition-colors"
                 onClick={async () => {
                   if (!user) { setAuthModal({ isOpen: true, feature: "Subscription Settings" }); return; }
                   try {
                     if (!isSubscribed) {
                       const wantSub = confirm("Would you like to subscribe to AI features?");
                       if (wantSub) { await toggleSubscriptionDb(user.uid, true); setIsSubscribed(true); }
                     } else {
                       const wantUnsub = confirm("You are subscribed. Would you like to unsubscribe?");
                       if (wantUnsub) { await toggleSubscriptionDb(user.uid, false); setIsSubscribed(false); }
                     }
                   } catch(e: any) {
                     alert(`Subscription error: ${e.message}`);
                   }
                 }}
                 title="Manage Subscription"
            >
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">AI Engine</span>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full shadow-lg", isSubscribed ? "bg-blue-500 shadow-blue-500/80 animate-pulse" : "bg-slate-600")}></div>
                <span className={cn("text-sm font-bold", isSubscribed ? "text-blue-400" : "text-slate-500")}>
                  {isSubscribed ? "Gemini-3 Active" : "Unsubscribed"}
                </span>
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
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {filteredSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-surface border border-white/10 rounded-2xl shadow-2xl z-[60] max-h-60 overflow-y-auto backdrop-blur-xl">
                  {filteredSearch.map(s => {
                    const symbol = s.symbol;
                    return (
                    <button
                      key={symbol}
                      onClick={() => { toggleWatchlist(symbol); setSearchQuery(""); }}
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
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Bento Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 grid-rows-[repeat(5,minmax(130px,1fr))] gap-6">

          {/* Global Balance Bento Box */}
          <div className="col-span-12 md:col-span-4 row-span-2 bento-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Portfolio Performance</span>
                <TrendingUp className="text-emerald-400" size={20} />
              </div>
              <div className="text-5xl font-light tracking-tight text-white data-value">
                ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={cn(
                "text-sm mt-4 font-black flex items-center gap-2",
                portfolioGain >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {portfolioGain >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                {portfolioGain >= 0 ? "+" : ""}${Math.abs(portfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({(portfolioValue && (portfolioValue - portfolioGain) !== 0 ? (portfolioGain / (portfolioValue - portfolioGain)) * 100 : 0).toFixed(2)}%)
              </div>
            </div>
            <div className="flex gap-2 mt-auto pt-6 text-[10px] items-center text-slate-500 font-bold uppercase tracking-widest">
               <div className="w-2 h-2 rounded-full bg-accent animate-pulse mr-2"></div> Live Monitoring Active
            </div>
          </div>

        {/* Assets Main View Bento Box */}
        <div className="col-span-12 md:col-span-8 row-span-5 bento-card p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 mb-2">
            <h3 className="font-black text-white uppercase tracking-widest text-xs">{activeTab === "portfolio" ? "Holdings" : activeTab === "watchlist" ? "Watchlist" : "AI Recommendations"}</h3>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 px-2 custom-scrollbar">
            {activeTab === "discover" ? (
                recommendations.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-500 italic opacity-50">
                    <RefreshCw className="animate-spin mb-4" size={40} />
                    Gemini is generating global market recommendations...
                  </div>
                ) : (
                  recommendations.map(rec => (
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
                       {rec.technicals && <div className="mt-2 flex gap-3 text-[9px] font-mono whitespace-nowrap">
                          <span className="bg-white/5 py-1 px-2 rounded-lg text-slate-400 border border-white/5">RSI: <span className="text-white">{rec.technicals.rsi}</span></span>
                          <span className="bg-white/5 py-1 px-2 rounded-lg text-slate-400 border border-white/5">MACD: <span className="text-white">{rec.technicals.macd}</span></span>
                       </div>}
                    </div>
                    <div className="flex gap-4 items-center">
                       <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border", 
                         rec.indicator === 'High' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' :
                         rec.indicator === 'Low' ? 'text-rose-400 border-rose-400/20 bg-rose-400/10' :
                         'text-slate-400 border-slate-400/20 bg-slate-400/10'
                       )}>{rec.indicator}</span>
                       <button onClick={() => toggleWatchlist(rec.symbol)} className="text-accent hover:text-white p-2">
                         {watchlist.includes(rec.symbol) ? <X size={18}/> : <Plus size={18}/>}
                       </button>
                    </div>
                   </div>
                  ))
                )
            ) : (
            <AnimatePresence mode="popLayout">
              {(activeTab === "portfolio" ? portfolio : watchlist.map(s => ({ symbol: s }))).map((item) => {
                const data = prices[item.symbol];
                
                // Show loading state instead of null if price data isn't here yet
                if (!data) {
                  return (
                    <div key={item.symbol} className="p-5 bg-white/[0.01] border border-white/[0.03] rounded-[1.5rem] flex items-center justify-between opacity-50">
                       <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-xl border border-white/5 flex items-center justify-center font-black text-[10px] text-slate-500 animate-pulse">
                          ...
                        </div>
                        <div>
                          <div className="font-bold text-slate-500 text-sm tracking-tight">{item.symbol}</div>
                          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Loading Market Data...</div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const gain = 'shares' in item ? (data.price - item.averagePrice) * item.shares : null;
                
                return (
                  <motion.div 
                    key={item.symbol}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedStock(data)}
                    className="p-5 bg-white/[0.03] border border-white/[0.05] rounded-[1.5rem] flex items-center justify-between table-row-hover group"
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
                      {item.shares && (
                        <div className="text-right hidden sm:block">
                           <div className="text-xs font-black text-white">{item.shares} <span className="text-[10px] text-slate-500 uppercase">Shares</span></div>
                           <div className="text-[10px] text-slate-500 font-bold uppercase leading-none mt-1">Avg: ${item.averagePrice.toFixed(2)}</div>
                        </div>
                      )}
                      {gain !== null && (
                        <div className="text-right hidden sm:block">
                          <div className={cn(
                            "text-sm font-black data-value",
                            gain >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {gain >= 0 ? "+" : ""}${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase leading-none mt-1">Total Return</div>
                        </div>
                      )}
                      
                      <div className="text-right w-24">
                        <div className="text-sm font-black text-white data-value">${data.price.toFixed(2)}</div>
                        <div className={cn(
                          "text-[10px] font-black uppercase tracking-tighter",
                          data.change >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {data.change >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
                        </div>
                      </div>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                         {activeTab === "portfolio" ? (
                           <button 
                             onClick={async (e) => { 
                               e.stopPropagation(); 
                               try {
                                 await removeFromPortfolio(item.symbol); 
                               } catch (err: any) {
                                 alert(`Delete Error: ${err.message}`);
                               }
                             }}
                             className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl"
                           >
                             <Trash2 size={16} />
                           </button>
                         ) : (
                           <button 
                             onClick={async (e) => { 
                               e.stopPropagation(); 
                               try {
                                 await addToPortfolio(item.symbol); 
                               } catch (err: any) {
                                 alert(`Add Error: ${err.message}`);
                               }
                             }}
                             className="p-2 text-accent hover:bg-accent/10 rounded-xl"
                           >
                             <Plus size={16} />
                           </button>
                         )}
                         <div className="p-2 text-slate-500">
                           <ChevronRight size={16} />
                         </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            )}

            {((activeTab === "portfolio" && portfolio.length === 0) || (activeTab === "watchlist" && watchlist.length === 0)) && (
              <div className="py-20 flex flex-col items-center justify-center text-slate-500 italic opacity-50">
                <Search size={40} className="mb-4" />
                No assets in your {activeTab} yet.
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Stock Insight Bento Box */}
        <div className="col-span-12 md:col-span-4 row-span-3 bento-card p-6 flex flex-col overflow-hidden relative group">
          {!selectedStock ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-white/10 group-hover:border-accent transition-colors duration-500">
                <BrainCircuit size={32} className="text-slate-500 group-hover:text-accent" />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2 italic">Select a Stock</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Click on any asset from your portfolio or watchlist to generate a per-stock AI deep-dive analysis.
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
               <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent rounded-xl text-white shadow-lg shadow-accent/20">
                    <BrainCircuit size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-white uppercase tracking-widest text-[10px] leading-tight">{selectedStock.symbol} Intelligence</h3>
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">{selectedStock.name}</div>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                  !aiAnalysis ? "text-slate-500 border-white/10" :
                  (aiAnalysis.sentiment === 'High' || aiAnalysis.sentiment === 'bullish') ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" : 
                  (aiAnalysis.sentiment === 'Low' || aiAnalysis.sentiment === 'bearish') ? "text-rose-400 border-rose-400/20 bg-rose-400/10" : "text-slate-400 border-slate-400/20 bg-slate-400/10"
                )}>
                  {aiAnalysis?.sentiment || "Pending"}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                {!aiAnalysis ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <button 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="bg-accent hover:opacity-90 text-white text-[10px] font-black px-6 py-3 rounded-xl uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                    >
                      {isAnalyzing ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                      {isAnalyzing ? "Analyzing..." : "Analyze Now"}
                    </button>
                    <p className="text-[10px] text-slate-600 font-bold mt-4 italic uppercase tracking-widest">Powered by Gemini-3 Flash</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 leading-none">Target Price</div>
                      <div className="text-2xl font-black text-accent">${aiAnalysis.priceTarget.toFixed(2)}</div>
                      <div className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">
                        Potential: {(((aiAnalysis.priceTarget - selectedStock.price) / selectedStock.price) * 100).toFixed(1)}% {aiAnalysis.priceTarget > selectedStock.price ? "Gain" : "Dip"}
                      </div>
                    </div>

                    <div className="space-y-2">
                       <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Analysis Summary</h4>
                       <p className="text-xs text-slate-400 font-medium leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5 italic">
                         "{aiAnalysis.summary}"
                       </p>
                    </div>

                    <div className="space-y-2">
                       <h4 className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Insights & Technicals
                       </h4>
                       <div className="grid gap-2">
                          {aiAnalysis.technicals && (
                            <div className="flex gap-2 mb-1">
                               <div className="flex-1 bg-white/[0.04] p-3 rounded-xl border border-white/5 text-center">
                                 <div className="text-[8px] text-slate-500 uppercase font-black mb-1">RSI (14)</div>
                                 <div className={cn("text-xs font-black", aiAnalysis.technicals.rsi > 70 ? "text-rose-400" : aiAnalysis.technicals.rsi < 30 ? "text-emerald-400" : "text-white")}>
                                   {aiAnalysis.technicals.rsi}
                                 </div>
                               </div>
                               <div className="flex-1 bg-white/[0.04] p-3 rounded-xl border border-white/5 text-center">
                                 <div className="text-[8px] text-slate-500 uppercase font-black mb-1">Bias</div>
                                 <div className="text-xs font-black text-blue-400 italic">Neutral</div>
                               </div>
                            </div>
                          )}
                          {aiAnalysis.opportunities.slice(0, 1).map((opp, i) => (
                             <div key={i} className="text-[10px] text-slate-400 font-bold p-3 bg-white/[0.02] border border-white/5 rounded-xl flex gap-2">
                                <ChevronRight size={12} className="text-emerald-400 shrink-0" /> {opp}
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
                )}
              </div>
              
              {aiAnalysis && (
                <button 
                  onClick={() => setSelectedStock(selectedStock)} // This opens the drawer since selectedStock is already set
                  className="mt-4 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  View Full Intelligence Report
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedStock && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-end"
            onClick={() => setSelectedStock(null)}
          >
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
              className="w-full max-w-2xl bg-surface h-full shadow-2xl flex flex-col overflow-hidden border-l border-white/5"
              onClick={e => e.stopPropagation()}
            >
              <header className="p-8 border-b border-white/5 flex items-center justify-between bg-surface sticky top-0 z-10">
                <div>
                  <h3 className="text-3xl font-black text-white flex items-baseline gap-3">
                    {selectedStock.symbol} 
                    <span className="text-sm font-medium text-slate-500">{selectedStock.name}</span>
                  </h3>
                  <div className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">{selectedStock.sector}</div>
                </div>
                <button 
                  onClick={() => setSelectedStock(null)}
                  className="p-3 hover:bg-white/5 rounded-2xl transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10"
                >
                  <X size={24} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                {/* Visual Chart */}
                <section className="h-72 bento-card p-6 overflow-hidden border-none bg-black/40 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Historical Trend</span>
                    <span className="data-value text-[10px] font-black text-accent uppercase tracking-widest leading-none">Live Tracking</span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" hide />
                        <YAxis 
                          domain={['auto', 'auto']} 
                          orientation="right" 
                          tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} 
                          axisLine={false} 
                          tickLine={false}
                          tickFormatter={(val) => `$${val}`}
                        />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: '#121418', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)', padding: '12px' }}
                          labelStyle={{ fontWeight: 800, marginBottom: '4px', fontSize: '10px', color: '#64748b' }}
                          itemStyle={{ fontWeight: 900, fontSize: '14px', color: '#fff' }}
                          formatter={(val: number) => [`$${val.toFixed(2)}`, 'Value']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="price" 
                          stroke="#2563eb" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorPrice)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Market Cap</span>
                    <span className="font-mono text-sm font-black text-white">{selectedStock.marketCap}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">PE Ratio</span>
                    <span className="font-mono text-sm font-black text-white">{selectedStock.peRatio}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">52W High</span>
                    <span className="font-mono text-sm font-black text-emerald-400">${selectedStock.high52w}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">52W Low</span>
                    <span className="font-mono text-sm font-black text-rose-400">${selectedStock.low52w}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Div Yield</span>
                    <span className="font-mono text-sm font-black text-blue-400">{selectedStock.dividendYield}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Beta</span>
                    <span className="font-mono text-sm font-black text-white">{selectedStock.beta}</span>
                  </div>
                  <div className="bento-card bg-white/[0.02] p-4 flex flex-col border-white/5 col-span-2">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Volume</span>
                    <span className="font-mono text-sm font-black text-white">{selectedStock.volume}</span>
                  </div>
                </div>

                {/* News Section */}
                {stockNews.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Latest Intel</h4>
                      <div className="h-[1px] flex-1 bg-white/5 ml-4"></div>
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

                {/* AI Analysis Section */}
                <section className={cn(
                  "p-8 rounded-[2.5rem] relative overflow-hidden transition-all duration-500 border border-white/5",
                   !aiAnalysis ? "bg-black/40 text-white shadow-2xl" : "bg-[#1a1c22] border-blue-500/20 shadow-2xl shadow-blue-500/5"
                )}>
                  <AnimatePresence mode="wait">
                    {!aiAnalysis ? (
                      <motion.div 
                        key="cta"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center text-center py-6"
                      >
                        <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 relative">
                          <div className="absolute inset-0 rounded-3xl bg-blue-500/10 animate-ping"></div>
                          <BrainCircuit size={40} className="text-blue-400 relative z-10" />
                        </div>
                        <h4 className="text-2xl font-black mb-4 tracking-tight">AI Quantitative Intel</h4>
                        <p className="text-slate-500 text-sm mb-8 max-w-sm font-medium leading-relaxed">
                          Analyze technical indicators and fundamental sentiment using Gemini's multi-modal intelligence.
                        </p>
                        <button 
                          onClick={handleAnalyze}
                          disabled={isAnalyzing}
                          className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-2xl font-black transition-all disabled:opacity-50 flex items-center gap-3 text-white shadow-lg shadow-blue-500/30 scale-100 hover:scale-105 active:scale-95"
                        >
                          {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <ArrowUpRight size={20} />}
                          {isAnalyzing ? "Processing Data..." : "Run AI Analysis"}
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="report"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-8"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/20">
                              <BrainCircuit size={20} />
                            </div>
                            <h4 className="font-black text-xl text-white tracking-tight">AI Intelligence Report</h4>
                          </div>
                          <div className={cn(
                            "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-sm border",
                            aiAnalysis.sentiment === 'High' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : 
                            aiAnalysis.sentiment === 'Low' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-slate-500/10 border-slate-500/20 text-slate-400"
                          )}>
                            <span className={cn("w-2 h-2 rounded-full", aiAnalysis.sentiment === 'High' ? "bg-emerald-500 animate-pulse" : "bg-rose-500")}></span>
                            {aiAnalysis.sentiment}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex flex-col justify-center">
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">12M Target</div>
                            <div className="text-4xl font-black data-value text-blue-400 tracking-tighter">${aiAnalysis.priceTarget.toFixed(2)}</div>
                            <div className="text-[10px] text-slate-500 font-bold mt-2 flex items-center gap-1 uppercase tracking-tighter">
                              <ArrowUpRight size={12} className={cn(aiAnalysis.priceTarget > selectedStock.price ? "text-emerald-400" : "text-rose-400")} />
                              {(((aiAnalysis.priceTarget - selectedStock.price) / selectedStock.price) * 100).toFixed(1)}% {aiAnalysis.priceTarget > selectedStock.price ? "Appreciation" : "Correction"} expected
                            </div>
                          </div>
                          <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Trading Action</div>
                            <div className="flex justify-between items-end mt-2">
                               <div>
                                  <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">Buy In Target</div>
                                  <div className="font-mono font-black text-xl text-white data-value">${aiAnalysis.buyInPrice.toFixed(2)}</div>
                               </div>
                               <div className="text-right">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">Take Profit</div>
                                  <div className="font-mono font-black text-xl text-white data-value">${aiAnalysis.sellingPrice.toFixed(2)}</div>
                               </div>
                            </div>
                            <div className="w-full bg-white/5 h-1.5 rounded-full mt-4 overflow-hidden flex items-center shadow-inner">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${aiAnalysis.confidence * 100}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="bg-blue-600 h-full rounded-full"
                              />
                            </div>
                            <div className="text-[9px] text-slate-500 font-black tracking-widest uppercase mt-2 text-center text-opacity-50">Model Conviction {(aiAnalysis.confidence * 100).toFixed(0)}%</div>
                          </div>
                        </div>

                        <div className="relative">
                          <p className="text-slate-400 text-sm leading-relaxed font-medium bg-black/20 p-6 rounded-3xl italic border-l-4 border-blue-600">
                            "{aiAnalysis.summary}"
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Growth Catalysts
                            </h5>
                            <ul className="space-y-3">
                              {aiAnalysis.opportunities.map((opp, i) => (
                                <li key={i} className="text-xs text-slate-400 font-bold leading-snug flex items-start gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/5 shadow-sm">
                                  <ChevronRight size={14} className="text-emerald-400 mt-0.5 shrink-0" /> {opp}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> Strategic Risks
                            </h5>
                            <ul className="space-y-3">
                              {aiAnalysis.risks.map((risk, i) => (
                                <li key={i} className="text-xs text-slate-400 font-bold leading-snug flex items-start gap-3 bg-white/[0.02] p-4 rounded-2xl border border-white/5 shadow-sm">
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

              <footer className="p-8 border-t border-white/5 space-y-6 bg-surface sticky bottom-0 z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.4)]">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                       <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Entry Price</label>
                       <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                          <input 
                            type="number" 
                            value={manualPrice || ""} 
                            onChange={(e) => setManualPrice(parseFloat(e.target.value) || 0)}
                            className="bg-transparent w-full text-sm font-black text-white outline-none"
                          />
                       </div>
                   </div>
                   <div className="space-y-2">
                       <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Shares Owned</label>
                       <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
                          <input 
                            type="number" 
                            value={tradeAmount || ""} 
                            onChange={(e) => setTradeAmount(parseInt(e.target.value) || 0)}
                            placeholder="Qty"
                            className="bg-transparent w-full text-sm font-black text-white outline-none"
                          />
                       </div>
                   </div>
                </div>
                
                <button 
                  onClick={async () => {
                     try {
                        await addToPortfolioManual(selectedStock.symbol, tradeAmount, manualPrice);
                        alert("Added to portfolio successfully!");
                     } catch (e: any) {
                        alert(`Error: ${e.message}`);
                     }
                  }}
                  className="w-full bg-white text-black py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-xl shadow-white/5 active:scale-95 text-xs uppercase tracking-widest"
                >
                  Confirm Portfolio Entry
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {authModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setAuthModal({ isOpen: false, feature: "" })}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface border border-white/10 p-8 rounded-[2rem] max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 mb-6">
                <Wallet size={32} />
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">Unlock {authModal.feature}</h3>
              <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
                Sign in or create a free account to securely sync your data and access premium features.
              </p>
              
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                    setAuthModal({ isOpen: false, feature: "" });
                  } catch (e: any) {
                    console.error("Login Error", e);
                  }
                }}
                className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-xs rounded-xl hover:scale-105 transition-all shadow-xl shadow-white/10 active:scale-95 flex items-center justify-center gap-3"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
              <button 
                onClick={() => setAuthModal({ isOpen: false, feature: "" })}
                className="mt-4 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors p-2"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
