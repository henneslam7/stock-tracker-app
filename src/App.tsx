import { useState, useEffect, useMemo, useRef } from "react";
import { onAuthStateChanged, User } from "firebase/auth";

import { Stock, PortfolioItem, AIAnalysis, Recommendation, ActiveTab } from "./types";
import { StockService } from "./services/stockService";
import { analyzeStock, getRecommendations } from "./services/geminiService";
import { calculateRSI, calculateMACD } from "./lib/indicators";
import { getMarketStatus } from "./lib/marketUtils";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { INITIAL_WATCHLIST } from "./constants";
import {
  auth, loginWithGoogle, logout,
  loadPortfolioFromDb, syncPortfolioToDb, deletePortfolioItemDb,
  checkSubscriptionDb, toggleSubscriptionDb,
} from "./lib/firebase";

import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { PortfolioSummaryCard } from "./components/PortfolioSummaryCard";
import { AssetList } from "./components/AssetList";
import { StockIntelCard } from "./components/StockIntelCard";
import { StockDrawer } from "./components/StockDrawer";
import { AuthModal } from "./components/AuthModal";
import { SellModal } from "./components/SellModal";
import { Toast } from "./components/ui/Toast";
import { ConfirmModal } from "./components/ui/Modal";

export default function App() {
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; feature: string }>({ isOpen: false, feature: "" });

  // Data
  const [portfolio, setPortfolio] = useLocalStorage<PortfolioItem[]>("stock_tracker_portfolio", []);
  const [watchlist, setWatchlist] = useLocalStorage<string[]>("stock_tracker_watchlist", INITIAL_WATCHLIST);
  const [prices, setPrices] = useState<Record<string, Stock>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketStatus, setMarketStatus] = useState({ us: "Closed", hk: "Closed" });

  // UI
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("portfolio");
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSearch, setFilteredSearch] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // AI
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Modals & toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [sellSymbol, setSellSymbol] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      if (currentUser) {
        const dbPortfolio = await loadPortfolioFromDb(currentUser.uid);
        if (dbPortfolio.length > 0) setPortfolio(dbPortfolio);
        const subStatus = await checkSubscriptionDb(currentUser.uid);
        setIsSubscribed(subStatus);
      }
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Market clock
  useEffect(() => {
    const tick = () => setMarketStatus(getMarketStatus());
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  // Price polling
  useEffect(() => {
    const fetch = async () => {
      const symbols = Array.from(new Set([...portfolio.map(p => p.symbol), ...watchlist]));
      if (symbols.length === 0) return;
      try {
        const data = await StockService.getStocksData(symbols);
        setPrices(data);
      } catch { /* swallow */ }
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [portfolio, watchlist]);

  // Reset analysis when stock changes
  useEffect(() => { setAiAnalysis(null); }, [selectedStock?.symbol]);

  // Search debounce
  useEffect(() => {
    const run = async () => {
      if (!searchQuery) { setFilteredSearch([]); return; }
      const results = await StockService.searchSymbols(searchQuery);
      if (results.length > 0) {
        const priceData = await StockService.getStocksData(results.map((r: any) => r.symbol));
        setPrices(prev => ({ ...prev, ...priceData }));
      }
      setFilteredSearch(results);
    };
    const t = setTimeout(run, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!selectedStock) return;
    if (!user) { setAuthModal({ isOpen: true, feature: "AI Analysis" }); return; }
    if (!isSubscribed) {
      setConfirmModal({
        message: "AI Analysis requires a subscription. Subscribe now?",
        onConfirm: async () => {
          try {
            await toggleSubscriptionDb(user.uid, true);
            setIsSubscribed(true);
            showToast("Subscription active!");
          } catch (e: any) { showToast(`Error: ${e.message}`, "error"); }
        },
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const info = await StockService.getStockInfo(selectedStock.symbol);
      const chartPrices: number[] = info.chart?.map((c: any) => c.close) || [];
      const rsi  = calculateRSI(chartPrices);
      const macd = calculateMACD(chartPrices);
      const entryPrice = portfolio.find(p => p.symbol === selectedStock.symbol)?.averagePrice ?? selectedStock.price;

      const result = await analyzeStock(
        { ...selectedStock, rsi } as any,
        info.chart, info.news, info.quoteSummary,
        entryPrice
      );

      setAiAnalysis({
        ...result,
        technicals: {
          rsi: parseFloat(rsi.toFixed(2)),
          macd:   `${macd.macd   >= 0 ? "+" : ""}${macd.macd.toFixed(3)}`,
          signal: `${macd.signal >= 0 ? "+" : ""}${macd.signal.toFixed(3)}`,
        },
      });
    } catch {
      showToast("Analysis failed. Try again.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadRecommendations = async () => {
    if (!user) { setAuthModal({ isOpen: true, feature: "AI Recommendations" }); return; }
    if (!isSubscribed) {
      setConfirmModal({
        message: "AI Recommendations require a subscription. Subscribe now?",
        onConfirm: async () => {
          try {
            await toggleSubscriptionDb(user.uid, true);
            setIsSubscribed(true);
            showToast("Subscription active!");
          } catch (e: any) { showToast(`Error: ${e.message}`, "error"); }
        },
      });
      return;
    }
    setActiveTab("discover");
    if (recommendations.length === 0) {
      const recs = await getRecommendations();
      setRecommendations(recs);
    }
  };

  const addToPortfolioManual = async (symbol: string, shares: number, buyPrice: number) => {
    if (shares <= 0) return;
    if (!user) { setAuthModal({ isOpen: true, feature: "Portfolio Sync" }); return; }

    const cost = buyPrice * shares;
    const existing = portfolio.find(p => p.symbol === symbol);
    const updated: PortfolioItem[] = existing
      ? portfolio.map(p => {
          if (p.symbol !== symbol) return p;
          const newShares    = p.shares + shares;
          const newTotalCost = p.totalCost + cost;
          return { ...p, shares: newShares, totalCost: newTotalCost, averagePrice: newTotalCost / newShares };
        })
      : [...portfolio, { symbol, shares, averagePrice: buyPrice, totalCost: cost }];

    const prev = [...portfolio];
    try {
      setPortfolio(updated);
      await syncPortfolioToDb(user.uid, updated);
      showToast(`Added ${shares} ${symbol} @ $${buyPrice.toFixed(2)}`);
    } catch (e: any) {
      setPortfolio(prev);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  const sellPortfolioItem = async (symbol: string, sharesToSell: number) => {
    if (!user) return;
    const item = portfolio.find(p => p.symbol === symbol);
    if (!item) return;

    const currentPrice = prices[symbol]?.price ?? item.averagePrice;
    const prev = [...portfolio];

    try {
      let updated: PortfolioItem[];
      if (sharesToSell >= item.shares) {
        updated = portfolio.filter(p => p.symbol !== symbol);
        await deletePortfolioItemDb(user.uid, symbol);
      } else {
        const newShares = item.shares - sharesToSell;
        updated = portfolio.map(p =>
          p.symbol === symbol
            ? { ...p, shares: newShares, totalCost: p.averagePrice * newShares }
            : p
        );
        await syncPortfolioToDb(user.uid, updated);
      }
      setPortfolio(updated);

      const pnl = (currentPrice - item.averagePrice) * sharesToSell;
      showToast(
        `Sold ${sharesToSell} ${symbol} • P&L: ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`,
        pnl >= 0 ? "success" : "error"
      );
    } catch (e: any) {
      setPortfolio(prev);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  const removeFromPortfolio = async (symbol: string) => {
    if (!user) return;
    const prev = [...portfolio];
    try {
      setPortfolio(prev.filter(p => p.symbol !== symbol));
      await deletePortfolioItemDb(user.uid, symbol);
    } catch (e: any) {
      setPortfolio(prev);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  const addToPortfolio = async (symbol: string) => {
    if (!user) { setAuthModal({ isOpen: true, feature: "Portfolio Sync" }); return; }
    if (portfolio.find(p => p.symbol === symbol)) return;
    const prev = [...portfolio];
    const price = prices[symbol]?.price ?? 0;
    const updated = [...portfolio, { symbol, shares: 1, averagePrice: price, totalCost: price }];
    try {
      setPortfolio(updated);
      await syncPortfolioToDb(user.uid, updated);
    } catch (e: any) {
      setPortfolio(prev);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  const toggleWatchlist = (symbol: string) => {
    setWatchlist(watchlist.includes(symbol)
      ? watchlist.filter(s => s !== symbol)
      : [...watchlist, symbol]
    );
  };

  const handleLogout = () => {
    setConfirmModal({
      message: "Logout?",
      onConfirm: async () => {
        await logout();
        setPortfolio([]);
        showToast("Logged out");
      },
    });
  };

  const handleSubscriptionToggle = async () => {
    if (!user) { setAuthModal({ isOpen: true, feature: "Subscription Settings" }); return; }
    setConfirmModal({
      message: isSubscribed
        ? "You are subscribed. Unsubscribe from AI features?"
        : "Subscribe to AI features?",
      onConfirm: async () => {
        try {
          await toggleSubscriptionDb(user.uid, !isSubscribed);
          setIsSubscribed(s => !s);
          showToast(isSubscribed ? "Unsubscribed" : "Subscription active!");
        } catch (e: any) { showToast(`Error: ${e.message}`, "error"); }
      },
    });
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const portfolioValue = useMemo(() =>
    portfolio.reduce((acc, item) => {
      const price = prices[item.symbol]?.price;
      return price != null ? acc + price * item.shares : acc;
    }, 0),
  [portfolio, prices]);

  const portfolioGain = useMemo(() => {
    const costBasis = portfolio.reduce((acc, item) =>
      prices[item.symbol] != null ? acc + item.averagePrice * item.shares : acc
    , 0);
    return portfolioValue - costBasis;
  }, [portfolio, portfolioValue, prices]);

  const sellItem = sellSymbol ? portfolio.find(p => p.symbol === sellSymbol) : undefined;

  if (isAuthLoading) return null;

  return (
    <div className="flex h-screen bg-bg text-ink font-sans overflow-hidden p-6 gap-6">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLoadRecommendations={loadRecommendations}
        onSearchFocus={() => searchInputRef.current?.focus()}
        onRefresh={() => window.location.reload()}
        user={user}
        onUserClick={() => setAuthModal({ isOpen: true, feature: "User Profile" })}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-2 min-w-0">
        <Header
          marketStatus={marketStatus}
          isSubscribed={isSubscribed}
          user={user}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchResults={filteredSearch}
          prices={prices}
          watchlist={watchlist}
          onToggleWatchlist={symbol => { toggleWatchlist(symbol); setSearchQuery(""); }}
          onSubscriptionClick={handleSubscriptionToggle}
          searchInputRef={searchInputRef}
        />

        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 grid-rows-[repeat(5,minmax(130px,1fr))] gap-6">
          <PortfolioSummaryCard portfolioValue={portfolioValue} portfolioGain={portfolioGain} />

          <div className="col-span-12 md:col-span-8 row-span-5 bento-card p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 mb-2">
              <h3 className="font-black text-white uppercase tracking-widest text-xs">
                {activeTab === "portfolio" ? "Holdings" : activeTab === "watchlist" ? "Watchlist" : "AI Recommendations"}
              </h3>
            </div>
            <AssetList
              activeTab={activeTab}
              portfolio={portfolio}
              watchlist={watchlist}
              prices={prices}
              recommendations={recommendations}
              onSelectStock={setSelectedStock}
              onRemoveFromPortfolio={removeFromPortfolio}
              onAddToPortfolio={addToPortfolio}
              onToggleWatchlist={toggleWatchlist}
              onSell={setSellSymbol}
            />
          </div>

          <StockIntelCard
            selectedStock={selectedStock}
            aiAnalysis={aiAnalysis}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyze}
          />
        </div>
      </div>

      {selectedStock && (
        <StockDrawer
          stock={selectedStock}
          portfolioItem={portfolio.find(p => p.symbol === selectedStock.symbol)}
          user={user}
          aiAnalysis={aiAnalysis}
          isAnalyzing={isAnalyzing}
          onClose={() => setSelectedStock(null)}
          onAnalyze={handleAnalyze}
          onAddToPortfolio={addToPortfolioManual}
          onSell={setSellSymbol}
          showToast={showToast}
        />
      )}

      {sellSymbol && sellItem && (
        <SellModal
          symbol={sellSymbol}
          portfolioItem={sellItem}
          currentPrice={prices[sellSymbol]?.price ?? sellItem.averagePrice}
          aiAnalysis={selectedStock?.symbol === sellSymbol ? aiAnalysis : null}
          onClose={() => setSellSymbol(null)}
          onSell={async shares => {
            await sellPortfolioItem(sellSymbol, shares);
            setSellSymbol(null);
          }}
        />
      )}

      <AuthModal
        isOpen={authModal.isOpen}
        feature={authModal.feature}
        onClose={() => setAuthModal({ isOpen: false, feature: "" })}
        onLogin={loginWithGoogle}
      />

      <ConfirmModal
        isOpen={!!confirmModal}
        message={confirmModal?.message ?? ""}
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onClose={() => setConfirmModal(null)}
      />

      <Toast message={toast?.message ?? null} type={toast?.type} />
    </div>
  );
}
