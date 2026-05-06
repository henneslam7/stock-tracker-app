import { TrendingUp, TrendingDown, History } from "lucide-react";
import { cn } from "../lib/utils";

interface PortfolioSummaryCardProps {
  portfolioValue: number;
  portfolioGain: number;
  lifetimeGain: number;
}

export function PortfolioSummaryCard({ portfolioValue, portfolioGain, lifetimeGain }: PortfolioSummaryCardProps) {
  const gainPct = portfolioValue && (portfolioValue - portfolioGain) !== 0
    ? (portfolioGain / (portfolioValue - portfolioGain)) * 100
    : 0;

  const totalGain = portfolioGain + lifetimeGain;

  return (
    <div className="md:col-span-4 md:row-span-2 bento-card p-5 md:p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Portfolio Performance</span>
          <TrendingUp className="text-emerald-400" size={20} />
        </div>
        <div className="text-3xl md:text-5xl font-light tracking-tight text-white data-value">
          ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        {/* Unrealized P&L */}
        <div className={cn(
          "text-sm mt-4 font-black flex items-center gap-2",
          portfolioGain >= 0 ? "text-emerald-400" : "text-rose-400"
        )}>
          {portfolioGain >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          {portfolioGain >= 0 ? "+" : ""}${Math.abs(portfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {" "}({gainPct.toFixed(2)}%)
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 mt-4 pt-4 space-y-2">
          {/* Realized P&L */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-black uppercase tracking-widest">
              <History size={11} /> Realized P&L
            </div>
            <span className={cn("text-xs font-black", lifetimeGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {lifetimeGain >= 0 ? "+" : ""}${Math.abs(lifetimeGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {/* Lifetime total */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Lifetime Total</span>
            <span className={cn("text-xs font-black", totalGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {totalGain >= 0 ? "+" : ""}${Math.abs(totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-auto pt-4 text-[10px] items-center text-slate-500 font-bold uppercase tracking-widest">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse mr-2" />
        Live Monitoring Active
      </div>
    </div>
  );
}
