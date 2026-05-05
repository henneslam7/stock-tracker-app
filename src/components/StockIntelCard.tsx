import { cn } from "../lib/utils";
import { Stock, PortfolioItem } from "../types";

const COLORS = [
  { bar: 'bg-blue-500',    dot: 'bg-blue-500'    },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { bar: 'bg-violet-500',  dot: 'bg-violet-500'  },
  { bar: 'bg-amber-500',   dot: 'bg-amber-500'   },
  { bar: 'bg-rose-500',    dot: 'bg-rose-500'    },
  { bar: 'bg-cyan-500',    dot: 'bg-cyan-500'    },
];

interface StockIntelCardProps {
  portfolio: PortfolioItem[];
  prices: Record<string, Stock>;
}

export function StockIntelCard({ portfolio, prices }: StockIntelCardProps) {
  const totalValue = portfolio.reduce((acc, item) => {
    const price = prices[item.symbol]?.price ?? 0;
    return acc + price * item.shares;
  }, 0);

  const items = portfolio
    .map((item, i) => {
      const price = prices[item.symbol]?.price ?? 0;
      const value = price * item.shares;
      const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
      return { ...item, price, value, pct, color: COLORS[i % COLORS.length] };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="col-span-12 md:col-span-4 row-span-3 bento-card p-6 flex flex-col overflow-hidden">
      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-4 shrink-0">Portfolio Allocation</div>

      {portfolio.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-slate-600 text-xs font-black uppercase tracking-widest">No Holdings</div>
          <div className="text-slate-700 text-[10px] mt-2">Add stocks to see your allocation</div>
        </div>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="h-2 rounded-full overflow-hidden flex gap-[2px] mb-4 shrink-0">
            {items.map(item => (
              <div
                key={item.symbol}
                className={cn("h-full transition-all", item.color.bar)}
                style={{ width: `${item.pct}%` }}
              />
            ))}
          </div>

          {/* Total */}
          <div className="mb-4 shrink-0">
            <div className="text-2xl font-black text-white">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Total Market Value</div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar min-h-0">
            {items.map(item => (
              <div key={item.symbol} className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", item.color.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-black text-white">{item.symbol}</span>
                    <span className="text-[10px] font-black text-white">{item.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", item.color.bar)} style={{ width: `${item.pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-slate-600 font-bold">{item.shares} sh · avg ${item.averagePrice.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 font-bold">
                      ${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
