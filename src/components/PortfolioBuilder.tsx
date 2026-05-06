import { useState } from "react";
import { Wand2, X, Plus, Lock, TrendingUp, Shield, Zap, AlertTriangle, DollarSign, Loader2 } from "lucide-react";
import { auth } from "../lib/firebase";
import { AuthUser } from "../hooks/useAuth";
import { PortfolioPlan } from "../types";
import { cn } from "../lib/utils";

interface PortfolioBuilderProps {
  user: AuthUser | null;
  watchlist: string[];
  onLoginRequired: () => void;
  onSubscribeRequired: () => void;
}

const RISK_CONFIG = {
  Conservative: { color: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', icon: Shield },
  Moderate:     { color: 'text-blue-400',    border: 'border-blue-400/30',    bg: 'bg-blue-400/10',    icon: TrendingUp },
  Aggressive:   { color: 'text-rose-400',    border: 'border-rose-400/30',    bg: 'bg-rose-400/10',    icon: Zap },
};

export function PortfolioBuilder({ user, watchlist, onLoginRequired, onSubscribeRequired }: PortfolioBuilderProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'HKD'>('HKD');
  const [preferred, setPreferred] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PortfolioPlan | null>(null);

  const canUse = !!(user && (user.isSubscribed || user.isAdmin));

  const addTag = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (s && !preferred.includes(s)) setPreferred(prev => [...prev, s]);
    setTagInput('');
  };

  const removeTag = (sym: string) => setPreferred(prev => prev.filter(s => s !== sym));

  const toggleWatchlistStock = (sym: string) => {
    if (preferred.includes(sym)) removeTag(sym);
    else addTag(sym);
  };

  const handleGenerate = async () => {
    if (!user) { onLoginRequired(); return; }
    if (!canUse) { onSubscribeRequired(); return; }
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!num || num <= 0) { setError('Enter a valid amount.'); return; }
    setError('');
    setLoading(true);
    setPlan(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/ai/portfolio-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: num, currency, preferredStocks: preferred }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.allocations?.length) throw new Error('No allocations returned.');
      setPlan(data);
    } catch (e: any) {
      setError(e.message || 'Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  };

  const investAmount = (pct: number) => {
    const num = parseFloat(amount.replace(/,/g, '')) || 0;
    return ((pct / 100) * num).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Form card */}
      <div className="bento-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 size={16} className="text-violet-400" />
          <h3 className="font-black text-white uppercase tracking-widest text-xs">AI Portfolio Builder</h3>
          <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-violet-400 border border-violet-400/30 bg-violet-400/10 rounded px-1.5 py-0.5">PRO</span>
        </div>

        {/* Amount + currency */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="number"
              min="1"
              placeholder="Investment amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-white text-sm font-bold placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden text-xs font-black">
            {(['HKD', 'USD'] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-3 py-2.5 transition-all",
                  currency === c ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred stocks */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preferred Stocks (optional)</p>

          {/* Watchlist quick-add */}
          {watchlist.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {watchlist.map(sym => (
                <button
                  key={sym}
                  onClick={() => toggleWatchlistStock(sym)}
                  className={cn(
                    "text-[10px] font-black uppercase px-2 py-1 rounded-lg border transition-all",
                    preferred.includes(sym)
                      ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  )}
                >
                  {preferred.includes(sym) ? '✓ ' : ''}{sym}
                </button>
              ))}
            </div>
          )}

          {/* Manual tag input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add symbol (e.g. TSLA)"
              value={tagInput}
              onChange={e => setTagInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={() => addTag(tagInput)}
              disabled={!tagInput.trim()}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Selected tags not in watchlist */}
          {preferred.filter(s => !watchlist.includes(s)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {preferred.filter(s => !watchlist.includes(s)).map(sym => (
                <span key={sym} className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-violet-600/20 border border-violet-500/50 text-violet-300">
                  {sym}
                  <button onClick={() => removeTag(sym)} className="hover:text-white"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-xs text-rose-400 font-bold">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className={cn(
            "w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
            canUse
              ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:scale-100"
              : "bg-white/5 border border-white/10 text-slate-400"
          )}
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Generating…</>
          ) : !user ? (
            <><Lock size={14} /> Sign in to Generate</>
          ) : !canUse ? (
            <><Lock size={14} /> Subscribe to Unlock</>
          ) : (
            <><Wand2 size={14} /> Generate Portfolio</>
          )}
        </button>
      </div>

      {/* Results */}
      {plan && (
        <div className="bento-card p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-300 font-medium leading-relaxed flex-1">{plan.summary}</p>
            {(() => {
              const cfg = RISK_CONFIG[plan.riskProfile] || RISK_CONFIG.Moderate;
              const Icon = cfg.icon;
              return (
                <span className={cn("shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border", cfg.color, cfg.border, cfg.bg)}>
                  <Icon size={10} /> {plan.riskProfile}
                </span>
              );
            })()}
          </div>

          {/* Allocations */}
          <div className="space-y-2">
            {plan.allocations.map((a, i) => {
              const amt = investAmount(a.percentage);
              return (
                <div key={i} className="bg-white/3 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-[10px] font-black text-white shrink-0">
                      {a.symbol.replace('.HK', '').slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">{a.symbol}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-700 rounded px-1">{a.market}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{a.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-white text-sm">{a.percentage}%</div>
                      <div className="text-[10px] text-slate-400 font-bold">{currency} {amt}</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${a.percentage}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{a.reason}</p>
                </div>
              );
            })}

            {/* Cash reserve */}
            {plan.cashReservePercent > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-white/3 rounded-xl">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Cash Reserve</span>
                <div className="text-right">
                  <span className="font-black text-slate-300 text-sm">{plan.cashReservePercent}%</span>
                  <span className="text-[10px] text-slate-500 font-bold ml-2">{currency} {investAmount(plan.cashReservePercent)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
