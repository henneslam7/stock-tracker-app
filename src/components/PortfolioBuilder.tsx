import { useState } from "react";
import { Wand2, Lock, DollarSign, Loader2, TrendingUp, Shield, Layers, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { auth } from "../lib/firebase";
import { AuthUser } from "../hooks/useAuth";
import { BuilderPlan, BuilderStock, PortfolioPlanSet } from "../types";
import { cn } from "../lib/utils";

interface PortfolioBuilderProps {
  user: AuthUser | null;
  onLoginRequired: () => void;
  onSubscribeRequired: () => void;
}

type MarketOption = 'US' | 'HK' | 'ETF' | 'Mixed';

const PROFILE_CONFIG = {
  Aggressive: { color: 'text-rose-400',    border: 'border-rose-400/30',    bg: 'bg-rose-400/10',    active: 'bg-rose-500/20 border-rose-500/50 text-rose-300',    icon: TrendingUp, bar: 'bg-rose-500' },
  Safety:     { color: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', active: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300', icon: Shield,     bar: 'bg-emerald-500' },
  Mix:        { color: 'text-blue-400',    border: 'border-blue-400/30',    bg: 'bg-blue-400/10',    active: 'bg-blue-500/20 border-blue-500/50 text-blue-300',    icon: Layers,     bar: 'bg-blue-500' },
};

const MARKET_OPTIONS: { value: MarketOption; label: string; sub: string }[] = [
  { value: 'US',    label: 'US',    sub: 'NYSE / NASDAQ' },
  { value: 'HK',    label: 'HK',    sub: 'HKEX' },
  { value: 'ETF',   label: 'ETF',   sub: 'US-listed ETFs' },
  { value: 'Mixed', label: 'Mixed', sub: 'US + HK' },
];

function StockRow({ stock, currency, budget }: { stock: BuilderStock; currency: string; budget: number }) {
  const allocated  = (stock.percentage / 100) * budget;
  const shares     = stock.buyPrice > 0 ? Math.floor(allocated / stock.buyPrice) : 0;
  const actualCost = shares * stock.buyPrice;
  const gainColor  = stock.expectedGainPercent >= 0 ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-white/[0.03] rounded-2xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-[9px] font-black text-white shrink-0">
          {stock.symbol.replace('.HK', '').slice(0, 4)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-white text-sm">{stock.symbol}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-700 rounded px-1">{stock.market}</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">{stock.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-white text-sm">{stock.percentage}%</div>
          <div className="text-[10px] text-slate-400">{currency} {allocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Shares to buy */}
      <div className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Shares to buy</span>
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-xs">{shares} shares</span>
          <span className="text-[9px] text-slate-500 font-bold">≈ {currency} {actualCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-violet-500/50 rounded-full" style={{ width: `${stock.percentage}%` }} />
      </div>

      {/* Buy / Sell / Gain row */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-1.5">
          <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Buy</div>
          <div className="text-[11px] font-black text-emerald-400">${stock.buyPrice.toFixed(2)}</div>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-1.5">
          <div className="text-[8px] font-black uppercase tracking-widest text-blue-600 mb-0.5">Target</div>
          <div className="text-[11px] font-black text-blue-400">${stock.sellPrice.toFixed(2)}</div>
        </div>
        <div className={cn("border rounded-xl p-1.5", stock.expectedGainPercent >= 0 ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15")}>
          <div className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-0.5">Est. Gain</div>
          <div className={cn("text-[11px] font-black flex items-center justify-center gap-0.5", gainColor)}>
            {stock.expectedGainPercent >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
            {Math.abs(stock.expectedGainPercent).toFixed(1)}%
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">{stock.reason}</p>
    </div>
  );
}

function PlanCard({ plan, currency, budget }: { plan: BuilderPlan; currency: string; budget: number }) {
  const cfg = PROFILE_CONFIG[plan.profile];
  const Icon = cfg.icon;
  return (
    <div className={cn("bento-card p-4 space-y-3 border", cfg.border)}>
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded-xl", cfg.bg)}>
          <Icon size={14} className={cfg.color} />
        </div>
        <span className={cn("font-black text-sm uppercase tracking-widest", cfg.color)}>{plan.profile}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{plan.summary}</p>
      <div className="space-y-2">
        {plan.allocations.map((stock, i) => (
          <StockRow key={i} stock={stock} currency={currency} budget={budget} />
        ))}
      </div>
    </div>
  );
}

export function PortfolioBuilder({ user, onLoginRequired, onSubscribeRequired }: PortfolioBuilderProps) {
  const [amount, setAmount]   = useState('');
  const [currency, setCurrency] = useState<'USD' | 'HKD'>('HKD');
  const [market, setMarket]   = useState<MarketOption>('HK');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<PortfolioPlanSet | null>(null);

  const canUse = !!(user && (user.isSubscribed || user.isAdmin));

  const handleGenerate = async () => {
    if (!user) { onLoginRequired(); return; }
    if (!canUse) { onSubscribeRequired(); return; }
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!num || num <= 0) { setError('Enter a valid amount.'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/ai/portfolio-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: num, currency, market }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PortfolioPlanSet = await res.json();
      if (!data.plans?.length) throw new Error('No plans returned.');
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Failed to generate plans.');
    } finally {
      setLoading(false);
    }
  };

  const budget = parseFloat(amount.replace(/,/g, '')) || 0;

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Form */}
      <div className="bento-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-violet-400" />
          <h3 className="font-black text-white uppercase tracking-widest text-xs">AI Portfolio Builder</h3>
          <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-violet-400 border border-violet-400/30 bg-violet-400/10 rounded px-1.5 py-0.5">PRO</span>
        </div>

        {/* Amount + currency */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="number" min="1" placeholder="Investment amount"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-white text-sm font-bold placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden text-xs font-black">
            {(['HKD', 'USD'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={cn("px-3 py-2.5 transition-all", currency === c ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white")}
              >{c}</button>
            ))}
          </div>
        </div>

        {/* Market preference */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preferred Market</p>
          <div className="grid grid-cols-3 gap-2">
            {MARKET_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setMarket(opt.value)}
                className={cn(
                  "flex flex-col items-center py-2.5 rounded-xl border text-center transition-all",
                  market === opt.value
                    ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                )}
              >
                <span className="font-black text-sm">{opt.label}</span>
                <span className="text-[9px] font-bold opacity-60 mt-0.5">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-xs text-rose-400 font-bold">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleGenerate} disabled={loading}
          className={cn(
            "w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
            canUse
              ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:scale-100"
              : "bg-white/5 border border-white/10 text-slate-400"
          )}
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Generating 3 Plans…</>
          : !user    ? <><Lock size={14} /> Sign in to Generate</>
          : !canUse  ? <><Lock size={14} /> Subscribe to Unlock</>
          :             <><Wand2 size={14} /> Generate 3 Portfolio Plans</>}
        </button>
      </div>

      {/* Results — 3 plans side by side on desktop, stacked on mobile */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {result.plans.map((plan, i) => (
            <PlanCard key={i} plan={plan} currency={currency} budget={budget} />
          ))}
        </div>
      )}
    </div>
  );
}
