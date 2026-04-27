import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "../lib/utils";

interface PortfolioSummaryCardProps {
  portfolioValue: number;
  portfolioGain: number;
}

export function PortfolioSummaryCard({ portfolioValue, portfolioGain }: PortfolioSummaryCardProps) {
  const gainPct = portfolioValue && (portfolioValue - portfolioGain) !== 0
    ? (portfolioGain / (portfolioValue - portfolioGain)) * 100
    : 0;

  return (
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
          {portfolioGain >= 0 ? "+" : ""}${Math.abs(portfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {" "}({gainPct.toFixed(2)}%)
        </div>
      </div>
      <div className="flex gap-2 mt-auto pt-6 text-[10px] items-center text-slate-500 font-bold uppercase tracking-widest">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse mr-2" />
        Live Monitoring Active
      </div>
    </div>
  );
}
