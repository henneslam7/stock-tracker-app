import { useState } from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { Modal } from "./ui/Modal";
import { cn } from "../lib/utils";
import { PortfolioItem, AIAnalysis } from "../types";

interface SellModalProps {
  symbol: string;
  portfolioItem: PortfolioItem;
  currentPrice: number;
  aiAnalysis: AIAnalysis | null;
  onClose: () => void;
  onSell: (shares: number, sellPrice: number) => void;
}

export function SellModal({ symbol, portfolioItem, currentPrice, aiAnalysis, onClose, onSell }: SellModalProps) {
  const [sharesToSell, setSharesToSell] = useState(portfolioItem.shares);
  const [sellPrice, setSellPrice]       = useState(currentPrice);

  const profitTarget = aiAnalysis?.sellingPrice ?? portfolioItem.averagePrice * 1.10;
  const cutLoss     = aiAnalysis?.cutLossPrice  ?? portfolioItem.averagePrice * 0.92;

  const proceeds  = sharesToSell * sellPrice;
  const costBasis = sharesToSell * portfolioItem.averagePrice;
  const pnl       = proceeds - costBasis;
  const pnlPct    = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

  const unrealizedTotal = (sellPrice - portfolioItem.averagePrice) * portfolioItem.shares;
  const unrealizedPct   = portfolioItem.averagePrice > 0
    ? ((sellPrice - portfolioItem.averagePrice) / portfolioItem.averagePrice) * 100
    : 0;

  const priceAboveCutLoss = sellPrice > cutLoss;
  const priceAboveProfit  = sellPrice >= profitTarget;

  const handleSell = () => {
    if (sharesToSell <= 0 || sharesToSell > portfolioItem.shares) return;
    onSell(sharesToSell, sellPrice);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Sell ${symbol}`} className="max-w-md">
      <div className="p-6 space-y-5">
        {/* Position summary */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Holding</span>
            <span className="text-white font-black">{portfolioItem.shares} shares</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Avg Cost</span>
            <span className="text-white font-black">${portfolioItem.averagePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Current Price</span>
            <span className="text-white font-black">${currentPrice.toFixed(2)}</span>
          </div>
          <div className="border-t border-white/5 pt-3 flex justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Unrealized P&L</span>
            <div className={cn("flex items-center gap-1 font-black text-sm", unrealizedTotal >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {unrealizedTotal >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {unrealizedTotal >= 0 ? "+" : ""}${Math.abs(unrealizedTotal).toFixed(2)}
              <span className="text-[10px]">({unrealizedPct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* AI guidance levels */}
        <div>
          <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">
            {aiAnalysis ? "AI Guidance" : "Default Guidance (run AI Analysis for precision)"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={cn(
              "p-3 rounded-xl border text-center",
              priceAboveProfit
                ? "bg-emerald-500/15 border-emerald-500/30"
                : "bg-white/[0.03] border-white/10"
            )}>
              <div className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1">Take Profit</div>
              <div className="text-base font-black text-white">${profitTarget.toFixed(2)}</div>
              <div className={cn("text-[9px] mt-0.5 font-bold", priceAboveProfit ? "text-emerald-400" : "text-slate-500")}>
                {priceAboveProfit ? "✓ Price reached" : `+${(((profitTarget - currentPrice) / currentPrice) * 100).toFixed(1)}% away`}
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-xl border text-center",
              !priceAboveCutLoss
                ? "bg-rose-500/15 border-rose-500/30"
                : "bg-white/[0.03] border-white/10"
            )}>
              <div className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1">Cut Loss</div>
              <div className="text-base font-black text-white">${cutLoss.toFixed(2)}</div>
              <div className={cn("text-[9px] mt-0.5 font-bold", !priceAboveCutLoss ? "text-rose-400" : "text-slate-500")}>
                {!priceAboveCutLoss ? "⚠ Stop-loss hit" : `-${(((currentPrice - cutLoss) / currentPrice) * 100).toFixed(1)}% buffer`}
              </div>
            </div>
          </div>

          {/* Warning if below cut loss */}
          {!priceAboveCutLoss && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              <AlertTriangle size={12} className="shrink-0" />
              Price below stop-loss. Consider cutting losses now.
            </div>
          )}
          {priceAboveProfit && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <TrendingUp size={12} className="shrink-0" />
              Profit target reached! Consider taking gains.
            </div>
          )}
        </div>

        {/* Sell price + shares inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Sell Price</label>
            <div className="flex items-center gap-2 bg-black/40 p-3 rounded-2xl border border-white/10">
              <span className="text-slate-500 text-xs font-bold">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={sellPrice}
                onChange={e => setSellPrice(parseFloat(e.target.value) || 0)}
                className="bg-transparent w-full text-sm font-black text-white outline-none"
              />
            </div>
            <button
              onClick={() => setSellPrice(currentPrice)}
              className="text-[9px] text-accent font-black uppercase tracking-widest hover:opacity-80"
            >
              Use market price
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Shares</label>
              <button
                onClick={() => setSharesToSell(portfolioItem.shares)}
                className="text-[9px] text-accent font-black uppercase tracking-widest hover:opacity-80"
              >
                All
              </button>
            </div>
            <div className="flex items-center gap-3 bg-black/40 p-3 rounded-2xl border border-white/10">
              <input
                type="number"
                min={1}
                max={portfolioItem.shares}
                value={sharesToSell}
                onChange={e => setSharesToSell(Math.min(portfolioItem.shares, Math.max(1, parseInt(e.target.value) || 0)))}
                className="bg-transparent w-full text-sm font-black text-white outline-none"
              />
              <span className="text-slate-500 text-xs font-bold">/ {portfolioItem.shares}</span>
            </div>
          </div>
        </div>

        {/* P&L preview */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Proceeds</span>
            <span className="text-white font-black">${proceeds.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Realized P&L</span>
            <motion.div
              key={pnl}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={cn("flex items-center gap-1 font-black text-sm", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}
            >
              {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
              <span className="text-[10px]">({pnlPct.toFixed(1)}%)</span>
            </motion.div>
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSell}
          disabled={false || sharesToSell <= 0}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
            pnl >= 0
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20",
            (false || sharesToSell <= 0) ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95"
          )}
        >
          <DollarSign size={16} />
          {false ? "Processing..." : `Confirm Sell ${sharesToSell} Share${sharesToSell !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Modal>
  );
}
