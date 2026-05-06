import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, BrainCircuit, TrendingUp, Shield, Zap, CheckCircle } from "lucide-react";
import { auth } from "../lib/firebase";
import { cn } from "../lib/utils";

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginRequired: () => void;
  isLoggedIn: boolean;
}

const BENEFITS = [
  { icon: BrainCircuit, text: "Unlimited AI stock analysis with Gemini" },
  { icon: TrendingUp,   text: "AI price targets, take-profit & cut-loss levels" },
  { icon: Zap,          text: "Technical indicators: RSI, MACD, confidence score" },
  { icon: Shield,       text: "News impact analysis on price action" },
];

export function SubscribeModal({ isOpen, onClose, onLoginRequired, isLoggedIn }: SubscribeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubscribe = async () => {
    if (!isLoggedIn) { onLoginRequired(); return; }
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) {
      setError(e.message || 'Failed to start checkout. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-[#121418] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="relative p-8 pb-6 text-center bg-gradient-to-b from-blue-500/10 to-transparent">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors">
                  <X size={18} />
                </button>
                <div className="w-16 h-16 bg-blue-500/15 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                  <BrainCircuit size={32} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Unlock AI Analysis</h2>
                <p className="text-slate-400 text-sm mt-2 font-medium">Full quantitative intelligence for every stock</p>
              </div>

              {/* Benefits */}
              <div className="px-8 pb-6 space-y-3">
                {BENEFITS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                    <span className="text-sm text-slate-300 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              {/* Price + CTA */}
              <div className="px-8 pb-8 space-y-3">
                <div className="text-center mb-4">
                  <span className="text-4xl font-black text-white">$9</span>
                  <span className="text-slate-500 font-bold">/month</span>
                  <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">Cancel anytime</div>
                </div>

                {error && (
                  <p className="text-xs text-rose-400 text-center font-bold">{error}</p>
                )}

                <button
                  onClick={handleSubscribe}
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-500/30 text-sm uppercase tracking-widest"
                >
                  {loading ? 'Redirecting to checkout…' : isLoggedIn ? 'Subscribe Now' : 'Sign in to Subscribe'}
                </button>
                <button onClick={onClose} className="w-full py-2 text-xs text-slate-500 font-bold hover:text-white transition-colors uppercase tracking-widest">
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
