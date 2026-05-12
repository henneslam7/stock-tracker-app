import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Activity, PieChart as PieChartIcon, List, Compass, Search, RefreshCw, Menu, X, Wand2, BarChart2 } from "lucide-react";
import { cn } from "../lib/utils";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onLoadRecommendations: () => void;
  onSearchFocus: () => void;
  onRefresh: () => void;
  onOpenBuilder: () => void;
}

export function Sidebar({ activeTab, onTabChange, onLoadRecommendations, onSearchFocus, onRefresh, onOpenBuilder }: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { tab: 'portfolio' as ActiveTab, icon: PieChartIcon, title: 'Portfolio' },
    { tab: 'watchlist' as ActiveTab, icon: List, title: 'Watchlist' },
    { tab: 'market' as ActiveTab, icon: BarChart2, title: 'Market' },
  ];

  const closeMenu = () => setMenuOpen(false);

  const handleDiscover = () => { onLoadRecommendations(); closeMenu(); };
  const handleBuilder  = () => { onOpenBuilder(); closeMenu(); };
  const handleSearch   = () => { onSearchFocus(); closeMenu(); };
  const handleRefresh  = () => { onRefresh(); closeMenu(); };
  const handleTab      = (tab: ActiveTab) => { onTabChange(tab); closeMenu(); };

  return (
    <>
      {/* Desktop left sidebar */}
      <nav className="hidden md:flex flex-col items-center py-6 space-y-8 w-20 bg-surface border border-line rounded-[2.5rem]">
        <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-accent/20">
          <Activity size={24} />
        </div>

        <div className="flex flex-col gap-6 text-slate-500">
          {navItems.map(({ tab, icon: Icon, title }) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              title={title}
              className={cn(
                "p-3 rounded-2xl transition-all duration-300",
                activeTab === tab
                  ? tab === "market"
                    ? "bg-accent/20 text-accent shadow-xl shadow-accent/10"
                    : "bg-white/10 text-white shadow-xl shadow-white/5"
                  : "hover:text-white"
              )}
            >
              <Icon size={24} />
            </button>
          ))}

          <button
            onClick={onLoadRecommendations}
            title="Discover AI Picks"
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === "discover" ? "bg-white/10 text-white shadow-xl shadow-white/5" : "hover:text-white"
            )}
          >
            <Compass size={24} />
          </button>

          <button
            onClick={onOpenBuilder}
            title="AI Portfolio Builder"
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === "builder" ? "bg-violet-500/20 text-violet-300 shadow-xl shadow-violet-500/10" : "hover:text-white"
            )}
          >
            <Wand2 size={24} />
          </button>

          <button
            className="p-3 text-slate-500 hover:text-white transition-colors"
            onClick={onSearchFocus}
            title="Search"
          >
            <Search size={24} />
          </button>
        </div>

        <div className="mt-auto">
          <button
            onClick={onRefresh}
            className="p-3 text-slate-500 hover:text-white hover:rotate-180 transition-all duration-500"
            title="Refresh"
          >
            <RefreshCw size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav — 5 primary items + More */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface/95 backdrop-blur-xl border-t border-line flex items-center justify-around px-1 pb-safe">
        {navItems.map(({ tab, icon: Icon, title }) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 px-2 sm:px-3 rounded-xl transition-all min-w-0",
              activeTab === tab
                ? tab === "market" ? "text-accent" : "text-white"
                : "text-slate-600"
            )}
          >
            <Icon size={20} />
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">{title}</span>
          </button>
        ))}
        <button
          onClick={onLoadRecommendations}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2.5 px-2 sm:px-3 rounded-xl transition-all min-w-0",
            activeTab === "discover" ? "text-accent" : "text-slate-600"
          )}
        >
          <Compass size={20} />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Discover</span>
        </button>
        <button
          onClick={onOpenBuilder}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2.5 px-2 sm:px-3 rounded-xl transition-all min-w-0",
            activeTab === "builder" ? "text-violet-400" : "text-slate-600"
          )}
        >
          <Wand2 size={20} />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Builder</span>
        </button>
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2.5 px-2 sm:px-3 text-slate-600 hover:text-white transition-colors min-w-0"
        >
          <Menu size={20} />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">More</span>
        </button>
      </nav>

      {/* Mobile hamburger slide-up menu */}
      {createPortal(
        <AnimatePresence>
          {menuOpen && (
            <>
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeMenu}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
              />
              <motion.div
                key="sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[70] md:hidden bg-surface border-t border-line rounded-t-[2rem] p-6 pb-10"
              >
                {/* Handle bar */}
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent rounded-xl flex items-center justify-center">
                      <Activity size={16} className="text-white" />
                    </div>
                    <span className="text-white font-black tracking-tight">Market Intel</span>
                  </div>
                  <button onClick={closeMenu} className="p-2 text-slate-500 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  {[
                    { icon: PieChartIcon, label: 'Portfolio',      action: () => handleTab('portfolio'),  active: activeTab === 'portfolio' },
                    { icon: List,         label: 'Watchlist',      action: () => handleTab('watchlist'),  active: activeTab === 'watchlist' },
                    { icon: BarChart2,    label: 'ETF Market',     action: () => handleTab('market'),     active: activeTab === 'market' },
                    { icon: Compass,      label: 'AI Discover',    action: handleDiscover,                active: activeTab === 'discover' },
                    { icon: Wand2,        label: 'AI Builder',     action: handleBuilder,                 active: activeTab === 'builder' },
                    { icon: Search,       label: 'Search',         action: handleSearch,                  active: false },
                    { icon: RefreshCw,    label: 'Refresh Data',   action: handleRefresh,                 active: false },
                  ].map(({ icon: Icon, label, action, active }) => (
                    <button
                      key={label}
                      onClick={action}
                      className={cn(
                        "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all text-left",
                        active
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon size={20} />
                      <span className="font-black text-sm tracking-wide">{label}</span>
                      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
