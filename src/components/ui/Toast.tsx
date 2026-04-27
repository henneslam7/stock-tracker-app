import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface ToastProps {
  message: string | null;
  type?: 'success' | 'error';
}

export function Toast({ message, type = 'success' }: ToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          className={cn(
            "fixed top-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-bold whitespace-nowrap",
            type === 'success'
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          )}
        >
          {type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
