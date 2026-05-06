import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Users, CreditCard, Shield, RefreshCw, ToggleLeft, ToggleRight, Search } from "lucide-react";
import { auth } from "../lib/firebase";
import { cn } from "../lib/utils";

interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  isSubscribed: boolean;
  isAdmin: boolean;
  createdAt?: string;
  subscriptionSource?: string;
}

interface AdminPortalProps {
  onBack: () => void;
}

export function AdminPortal({ onBack }: AdminPortalProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleSubscription = async (uid: string, current: boolean) => {
    setToggling(uid);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch(`/api/admin/users/${uid}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isSubscribed: !current }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isSubscribed: !current } : u));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalSubscribed = users.filter(u => u.isSubscribed).length;

  return (
    <div className="flex-1 flex flex-col gap-4 md:gap-6 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10 hover:border-white/20 px-3 py-2 rounded-xl"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <div className="h-4 w-[1px] bg-white/10" />
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-amber-500/15 rounded-xl flex items-center justify-center border border-amber-500/20 shrink-0">
            <Shield size={16} className="text-amber-400" />
          </div>
          <span className="text-white font-black text-lg truncate">Admin Portal</span>
        </div>
        <button
          onClick={fetchUsers}
          className="ml-auto p-2 text-slate-500 hover:text-white transition-colors border border-white/10 rounded-xl"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
        {[
          { label: 'Total Users',  value: users.length,     icon: Users,      color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Subscribed',   value: totalSubscribed,  icon: CreditCard, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Free Plan',    value: users.length - totalSubscribed, icon: Shield, color: 'text-slate-400', bg: 'bg-white/5 border-white/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn("bento-card p-4 border flex items-center gap-3", bg)}>
            <Icon size={20} className={color} />
            <div>
              <div className={cn("text-2xl font-black", color)}>{value}</div>
              <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Filter by email or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {/* User list */}
      {error && (
        <div className="text-rose-400 text-sm font-bold text-center py-4">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar min-h-0">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.02] rounded-2xl animate-pulse border border-white/5" />
          ))
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-600 font-black uppercase tracking-widest text-xs">No users found</div>
        ) : filtered.map(u => (
          <motion.div
            key={u.uid}
            layout
            className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-all"
          >
            <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center font-black text-sm text-slate-400 shrink-0">
              {(u.displayName || u.email)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">{u.displayName || u.email}</div>
              <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
              {u.createdAt && (
                <div className="text-[9px] text-slate-700 font-bold mt-0.5">
                  Joined {new Date(u.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {u.isAdmin && (
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded px-1.5 py-0.5 hidden sm:block">Admin</span>
              )}
              {u.subscriptionSource === 'stripe' && (
                <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 border border-blue-400/20 bg-blue-400/10 rounded px-1.5 py-0.5 hidden sm:block">Stripe</span>
              )}
              <button
                onClick={() => toggleSubscription(u.uid, u.isSubscribed)}
                disabled={toggling === u.uid}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50",
                  u.isSubscribed
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"
                )}
              >
                {toggling === u.uid ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : u.isSubscribed ? (
                  <><ToggleRight size={14} /> Pro</>
                ) : (
                  <><ToggleLeft size={14} /> Free</>
                )}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
