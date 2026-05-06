import { useState, useEffect, useMemo, useRef } from "react";

import { Stock, PortfolioItem, AIAnalysis, Recommendation, ActiveTab } from "./types";
import { StockService } from "./services/stockService";
import { analyzeStock, getRecommendations } from "./services/geminiService";
import { calculateRSI, calculateMACD } from "./lib/indicators";
import { getMarketStatus } from "./lib/marketUtils";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useAuth } from "./hooks/useAuth";
import { INITIAL_WATCHLIST } from "./constants";
import {
  loginWithGoogle,
  syncPortfolioToDb, loadPortfolioFromDb, deletePortfolioItemDb,
  syncWatchlistToDb, loadWatchlistFromDb, deleteWatchlistItemDb,
} from "./lib/firebase";

import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { PortfolioSummaryCard } from "./components/PortfolioSummaryCard";
import { AssetList } from "./components/AssetList";
import { StockIntelCard } from "./components/StockIntelCard";
import { StockDrawer } from "./components/StockDrawer";
import { SellModal } from "./components/SellModal";
import { AdminPortal } from "./components/AdminPortal";
import { SubscribeModal } from "./components/SubscribeModal";
import { UserMenu } from "./components/UserMenu";
import { AuthModal } from "./components/AuthModal";
import { Toast } from "./components/ui/Toast";
import { ConfirmModal } from "./components/ui/Modal";

export default function App() {
  // Auth
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [dbLoaded, setDbLoaded] = useState(false);

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
  const [showAdmin, setShowAdmin] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // AI
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Modals & toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [sellSymbol, setSellSymbol] = useState<string | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Stripe return URL handling ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') === '1') {
      const sessionId = params.get('session_id');
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Payment received! Activating your subscription…');

      const activate = async () => {
        const { auth, db } = await import('./lib/firebase');
        if (!auth.currentUser) { setTimeout(activate, 1500); return; }
        try {
          const token = await auth.currentUser.getIdToken();
          const url = sessionId
            ? `/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`
            : null;
          if (url) {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            console.log('[stripe] verify-session response:', data);
            if (data.subscribed) {
              if (data.firestoreError) {
                // Server confirmed payment but Firestore write failed — write from client as fallback
                const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
                await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                  isSubscribed: true,
                  updatedAt: serverTimestamp(),
                });
              }
              await refreshUser();
              showToast('Subscription activated! AI Analysis unlocked.');
              return;
            }
          }
        } catch (e) { console.error('[stripe] verify-session error:', e); /* fall through to polling */ }
        // Fallback: poll Firestore directly
        let attempts = 0;
        const poll = async () => {
          attempts++;
          const { getDocFromServer, doc } = await import('firebase/firestore');
          const { auth: a, db } = await import('./lib/firebase');
          if (!a.currentUser) return;
          const snap = await getDocFromServer(doc(db, 'users', a.currentUser.uid));
          if (snap.exists() && snap.data().isSubscribed) {
            showToast('Subscription activated! AI Analysis unlocked.');
            await refreshUser();
          } else if (attempts < 8) {
            setTimeout(poll, 3000);
          } else {
            showToast('Subscription saved — please refresh if AI is still locked.', 'error');
          }
        };
        setTimeout(poll, 2000);
      };

      setTimeout(activate, 1000);
    } else if (params.get('subscribed') === '0') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ── Load from Firestore on login ────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setDbLoaded(false); return; }
    Promise.all([
      loadPortfolioFromDb(user.uid).catch(() => [] as PortfolioItem[]),
      loadWatchlistFromDb(user.uid).catch(() => [] as string[]),
    ]).then(([dbPortfolio, dbWatchlist]) => {
      if (dbPortfolio.length > 0) setPortfolio(dbPortfolio);
      if (dbWatchlist.length > 0) setWatchlist(dbWatchlist);
      setDbLoaded(true);
    }).catch(() => setDbLoaded(true));
  }, [user?.uid]);

  // ── Sync portfolio to Firestore on changes ─────────────────────────────────
  useEffect(() => {
    if (!user || !dbLoaded) return;
    syncPortfolioToDb(user.uid, portfolio).catch(() => {});
  }, [portfolio, user?.uid, dbLoaded]);

  // ── Sync watchlist to Firestore on changes ─────────────────────────────────
  useEffect(() => {
    if (!user || !dbLoaded) return;
    syncWatchlistToDb(user.uid, watchlist).catch(() => {});
  }, [watchlist, user?.uid, dbLoaded]);

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
        if (Object.keys(data).length > 0) setPrices(data);
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
    // Gate: must be logged in + subscribed (or admin)
    if (!user) { setShowAuthModal(true); return; }
    if (!user.isSubscribed && !user.isAdmin) { setShowSubscribe(true); return; }

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
    if (!user) { setShowAuthModal(true); return; }
    if (!user.isSubscribed && !user.isAdmin) { setShowSubscribe(true); return; }
    setActiveTab("discover");
    if (recommendations.length === 0) {
      const recs = await getRecommendations();
      setRecommendations(recs);
    }
  };

  const addToPortfolioManual = (symbol: string, shares: number, buyPrice: number) => {
    if (shares <= 0) return;
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
    setPortfolio(updated);
    showToast(`Added ${shares} ${symbol} @ $${buyPrice.toFixed(2)}`);
  };

  const sellPortfolioItem = (symbol: string, sharesToSell: number) => {
    const item = portfolio.find(p => p.symbol === symbol);
    if (!item) return;
    const currentPrice = prices[symbol]?.price ?? item.averagePrice;
    let updated: PortfolioItem[];
    if (sharesToSell >= item.shares) {
      updated = portfolio.filter(p => p.symbol !== symbol);
      if (user) deletePortfolioItemDb(user.uid, symbol).catch(() => {});
    } else {
      const newShares = item.shares - sharesToSell;
      updated = portfolio.map(p =>
        p.symbol === symbol
          ? { ...p, shares: newShares, totalCost: p.averagePrice * newShares }
          : p
      );
    }
    setPortfolio(updated);
    const pnl = (currentPrice - item.averagePrice) * sharesToSell;
    showToast(
      `Sold ${sharesToSell} ${symbol} • P&L: ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`,
      pnl >= 0 ? "success" : "error"
    );
  };

  const removeFromPortfolio = (symbol: string) => {
    setPortfolio(portfolio.filter(p => p.symbol !== symbol));
    if (user) deletePortfolioItemDb(user.uid, symbol).catch(() => {});
  };

  const addToPortfolio = (symbol: string) => {
    if (portfolio.find(p => p.symbol === symbol)) return;
    const price = prices[symbol]?.price ?? 0;
    setPortfolio([...portfolio, { symbol, shares: 1, averagePrice: price, totalCost: price }]);
  };

  const toggleWatchlist = (symbol: string) => {
    if (watchlist.includes(symbol)) {
      setWatchlist(watchlist.filter(s => s !== symbol));
      if (user) deleteWatchlistItemDb(user.uid, symbol).catch(() => {});
    } else {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const handleSelectFromSearch = async (symbol: string, name: string) => {
    setSearchQuery("");
    setFilteredSearch([]);
    if (prices[symbol]) {
      setSelectedStock(prices[symbol]);
      return;
    }
    try {
      const data = await StockService.getStocksData([symbol]);
      if (data[symbol]) {
        setPrices(prev => ({ ...prev, ...data }));
        setSelectedStock(data[symbol]);
      }
    } catch {
      showToast(`Failed to load ${symbol}`, "error");
    }
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
  const canAnalyze = !!(user && (user.isSubscribed || user.isAdmin));

  return (
    <div className="flex h-screen bg-bg text-ink font-sans overflow-hidden p-3 md:p-6 gap-3 md:gap-6">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLoadRecommendations={loadRecommendations}
        onSearchFocus={() => searchInputRef.current?.focus()}
        onRefresh={() => window.location.reload()}
      />

      <div className="flex-1 flex flex-col gap-3 md:gap-6 overflow-y-auto md:overflow-hidden pr-0 md:pr-2 pb-20 md:pb-2 min-w-0">
        <Header
          marketStatus={marketStatus}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchResults={filteredSearch}
          prices={prices}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
          onSelectFromSearch={handleSelectFromSearch}
          searchInputRef={searchInputRef}
          userMenu={
            <UserMenu
              user={user}
              loading={authLoading}
              onAdminPortal={() => setShowAdmin(true)}
            />
          }
        />

        {showAdmin ? (
          <AdminPortal onBack={() => setShowAdmin(false)} />
        ) : selectedStock ? (
          <StockDrawer
            inline
            stock={selectedStock}
            portfolioItem={portfolio.find(p => p.symbol === selectedStock.symbol)}
            aiAnalysis={aiAnalysis}
            isAnalyzing={isAnalyzing}
            canAnalyze={canAnalyze}
            onClose={() => setSelectedStock(null)}
            onAnalyze={handleAnalyze}
            onAddToPortfolio={addToPortfolioManual}
            onSell={setSellSymbol}
            showToast={showToast}
            onSubscribeRequired={() => setShowSubscribe(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-[repeat(5,minmax(130px,1fr))] md:overflow-hidden md:flex-1 gap-4 md:gap-6">
            <PortfolioSummaryCard portfolioValue={portfolioValue} portfolioGain={portfolioGain} />

            <div className="md:col-span-8 md:row-span-5 bento-card p-4 overflow-hidden flex flex-col min-h-[400px] md:min-h-0">
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
                onSelectRecommendation={handleSelectFromSearch}
                onRemoveFromPortfolio={removeFromPortfolio}
                onAddToPortfolio={addToPortfolio}
                onToggleWatchlist={toggleWatchlist}
                onSell={setSellSymbol}
              />
            </div>

            <StockIntelCard portfolio={portfolio} prices={prices} />
          </div>
        )}
      </div>

      {sellSymbol && sellItem && (
        <SellModal
          symbol={sellSymbol}
          portfolioItem={sellItem}
          currentPrice={prices[sellSymbol]?.price ?? sellItem.averagePrice}
          aiAnalysis={selectedStock?.symbol === sellSymbol ? aiAnalysis : null}
          onClose={() => setSellSymbol(null)}
          onSell={shares => {
            sellPortfolioItem(sellSymbol, shares);
            setSellSymbol(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        message={confirmModal?.message ?? ""}
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onClose={() => setConfirmModal(null)}
      />

      <SubscribeModal
        isOpen={showSubscribe}
        isLoggedIn={!!user}
        onClose={() => setShowSubscribe(false)}
        onLoginRequired={() => { setShowSubscribe(false); setShowAuthModal(true); }}
      />

      <AuthModal
        isOpen={showAuthModal}
        feature="AI Analysis"
        onClose={() => setShowAuthModal(false)}
        onLogin={loginWithGoogle}
      />

      <Toast message={toast?.message ?? null} type={toast?.type} />
    </div>
  );
}
