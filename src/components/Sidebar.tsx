import { Activity, PieChart as PieChartIcon, List, Compass, Search, RefreshCw } from "lucide-react";
import { User } from "firebase/auth";
import { cn } from "../lib/utils";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onLoadRecommendations: () => void;
  onSearchFocus: () => void;
  onRefresh: () => void;
  user: User | null;
  onUserClick: () => void;
  onLogout: () => void;
}

export function Sidebar({ activeTab, onTabChange, onLoadRecommendations, onSearchFocus, onRefresh, user, onUserClick, onLogout }: SidebarProps) {
  const navItems = [
    { tab: 'portfolio' as ActiveTab, icon: PieChartIcon, title: 'Portfolio' },
    { tab: 'watchlist' as ActiveTab, icon: List, title: 'Watchlist' },
  ];

  return (
    <nav className="hidden md:flex flex-col items-center py-6 space-y-8 w-20 bg-surface border border-line rounded-[2.5rem]">
      <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-accent/20">
        <Activity size={24} />
      </div>

      <div className="flex flex-col gap-8 text-slate-500">
        {navItems.map(({ tab, icon: Icon, title }) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            title={title}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              activeTab === tab ? "bg-white/10 text-white shadow-xl shadow-white/5" : "hover:text-white"
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
          className="p-3 text-slate-500 hover:text-white transition-colors"
          onClick={onSearchFocus}
          title="Search"
        >
          <Search size={24} />
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-6 items-center">
        <button
          onClick={onRefresh}
          className="p-3 text-slate-500 hover:text-white hover:rotate-180 transition-all duration-500"
          title="Refresh"
        >
          <RefreshCw size={24} />
        </button>
        <div
          onClick={user ? onLogout : onUserClick}
          title={user ? user.email || 'Logged in' : 'Login'}
          className={cn(
            "w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 font-bold overflow-hidden cursor-pointer hover:border-white/30 transition-colors",
            user ? "border-emerald-500/50" : ""
          )}
        >
          <img
            src={user?.photoURL ?? `https://api.dicebear.com/7.x/initials/svg?seed=${user?.email ?? 'Guest'}`}
            alt="User"
          />
        </div>
      </div>
    </nav>
  );
}
