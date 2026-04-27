import { Wallet } from "lucide-react";
import { Modal } from "./ui/Modal";

interface AuthModalProps {
  isOpen: boolean;
  feature: string;
  onClose: () => void;
  onLogin: () => Promise<void>;
}

export function AuthModal({ isOpen, feature, onClose, onLogin }: AuthModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm">
      <div className="p-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 mb-6">
          <Wallet size={32} />
        </div>
        <h3 className="text-2xl font-black text-white tracking-tight mb-2">Unlock {feature}</h3>
        <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
          Sign in to securely sync your data and access premium features.
        </p>

        <button
          onClick={async () => {
            try {
              await onLogin();
              onClose();
            } catch (e: any) {
              console.error("Login Error", e);
            }
          }}
          className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-xs rounded-xl hover:scale-105 transition-all shadow-xl shadow-white/10 active:scale-95 flex items-center justify-center gap-3"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <button
          onClick={onClose}
          className="mt-4 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors p-2"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
