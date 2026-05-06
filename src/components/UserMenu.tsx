import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { LogIn, LogOut, User, Shield, ChevronDown, Receipt } from "lucide-react";
import { auth, loginWithGoogle, logout } from "../lib/firebase";
import { AuthUser } from "../hooks/useAuth";
import { cn } from "../lib/utils";

interface UserMenuProps {
  user: AuthUser | null;
  loading: boolean;
  onAdminPortal: () => void;
}

export function UserMenu({ user, loading, onAdminPortal }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const handleLogin = async () => {
    setLoggingIn(true);
    try { await loginWithGoogle(); } catch {}
    finally { setLoggingIn(false); }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  const handleBilling = async () => {
    if (!auth.currentUser) return;
    setBillingLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      alert('Could not open billing portal. Please try again.');
    } finally {
      setBillingLoading(false);
    }
  };

  if (loading) return <div className="w-9 h-9 bg-white/5 rounded-xl animate-pulse" />;

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        disabled={loggingIn}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
      >
        <LogIn size={14} />
        <span className="hidden sm:inline">{loggingIn ? 'Signing in…' : 'Sign In'}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="w-6 h-6 rounded-lg shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-6 h-6 bg-accent rounded-lg flex items-center justify-center shrink-0">
            <User size={12} className="text-white" />
          </div>
        )}
        <span className="text-xs font-black text-white max-w-[80px] truncate hidden sm:block">
          {user.displayName}
        </span>
        {user.isSubscribed && (
          <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 border border-blue-400/30 bg-blue-400/10 rounded px-1 hidden sm:block">PRO</span>
        )}
        <ChevronDown size={12} className={cn("text-slate-500 transition-transform hidden sm:block", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="fixed z-[90] top-16 right-4 w-56 bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/5">
                <div className="font-black text-white text-sm truncate">{user.displayName}</div>
                <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  {user.isSubscribed ? (
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 border border-blue-400/30 bg-blue-400/10 rounded px-1.5 py-0.5">Pro Subscriber</span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">Free Plan</span>
                  )}
                  {user.isAdmin && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded px-1.5 py-0.5">Admin</span>
                  )}
                </div>
              </div>
              <div className="p-2 space-y-1">
                {user.isAdmin && (
                  <button
                    onClick={() => { setOpen(false); onAdminPortal(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-amber-400 hover:bg-amber-400/10 transition-all text-xs font-black uppercase tracking-widest"
                  >
                    <Shield size={14} /> Admin Portal
                  </button>
                )}
                {user.isSubscribed && (
                  <button
                    onClick={handleBilling}
                    disabled={billingLoading}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    <Receipt size={14} /> {billingLoading ? 'Opening…' : 'Billing & Invoices'}
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-400/10 transition-all text-xs font-black uppercase tracking-widest"
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  );
}
