import { BrainCircuit, TrendingUp, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Stock, AIAnalysis } from "../types";

interface StockIntelCardProps {
  selectedStock: Stock | null;
  aiAnalysis: AIAnalysis | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

export function StockIntelCard({ selectedStock, aiAnalysis, isAnalyzing, onAnalyze }: StockIntelCardProps) {
  return (
    <div className="col-span-12 md:col-span-4 row-span-3 bento-card p-6 flex flex-col overflow-hidden relative group">
      {!selectedStock ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-white/10 group-hover:border-accent transition-colors duration-500">
            <BrainCircuit size={32} className="text-slate-500 group-hover:text-accent" />
          </div>
          <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2 italic">Select a Stock</h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Click any asset to generate an AI deep-dive analysis.
          </p>
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent rounded-xl text-white shadow-lg shadow-accent/20">
                <BrainCircuit size={18} />
              </div>
              <div>
                <h3 className="font-black text-white uppercase tracking-widest text-[10px] leading-tight">{selectedStock.symbol} Intelligence</h3>
                <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mt-0.5 truncate max-w-[120px]">{selectedStock.name}</div>
              </div>
            </div>
            <div className={cn(
              "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
              !aiAnalysis ? "text-slate-500 border-white/10" :
              aiAnalysis.sentiment === 'High' ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" :
              aiAnalysis.sentiment === 'Low'  ? "text-rose-400 border-rose-400/20 bg-rose-400/10" :
              "text-slate-400 border-slate-400/20 bg-slate-400/10"
            )}>
              {aiAnalysis?.sentiment ?? "Pending"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {!aiAnalysis ? (
              <div className="flex flex-col items-center justify-center py-10">
                <button
                  onClick={onAnalyze}
                  disabled={isAnalyzing}
                  className="bg-accent hover:opacity-90 text-white text-[10px] font-black px-6 py-3 rounded-xl uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                >
                  {isAnalyzing ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                  {isAnalyzing ? "Analyzing..." : "Analyze Now"}
                </button>
                <p className="text-[10px] text-slate-600 font-bold mt-4 italic uppercase tracking-widest">Powered by Gemini Flash</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 leading-none">Target Price</div>
                  <div className="text-2xl font-black text-accent">${aiAnalysis.priceTarget.toFixed(2)}</div>
                  <div className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">
                    {(((aiAnalysis.priceTarget - selectedStock.price) / selectedStock.price) * 100).toFixed(1)}% {aiAnalysis.priceTarget > selectedStock.price ? "upside" : "downside"}
                  </div>
                </div>

                {/* Sell guidance */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                    <div className="text-[8px] text-emerald-500 font-black uppercase tracking-widest mb-1">Take Profit</div>
                    <div className="text-sm font-black text-white">${aiAnalysis.sellingPrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-xl">
                    <div className="text-[8px] text-rose-500 font-black uppercase tracking-widest mb-1">Cut Loss</div>
                    <div className="text-sm font-black text-white">${aiAnalysis.cutLossPrice.toFixed(2)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Summary</h4>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5 italic">
                    "{aiAnalysis.summary}"
                  </p>
                </div>

                {aiAnalysis.technicals && (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-white/[0.04] p-3 rounded-xl border border-white/5 text-center">
                      <div className="text-[8px] text-slate-500 uppercase font-black mb-1">RSI (14)</div>
                      <div className={cn("text-xs font-black",
                        aiAnalysis.technicals.rsi > 70 ? "text-rose-400" :
                        aiAnalysis.technicals.rsi < 30 ? "text-emerald-400" : "text-white"
                      )}>{aiAnalysis.technicals.rsi}</div>
                    </div>
                    <div className="flex-1 bg-white/[0.04] p-3 rounded-xl border border-white/5 text-center">
                      <div className="text-[8px] text-slate-500 uppercase font-black mb-1">MACD</div>
                      <div className={cn("text-xs font-black font-mono",
                        aiAnalysis.technicals.macd.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                      )}>{aiAnalysis.technicals.macd}</div>
                    </div>
                  </div>
                )}

                {aiAnalysis.opportunities.slice(0, 1).map((opp, i) => (
                  <div key={i} className="text-[10px] text-slate-400 font-bold p-3 bg-white/[0.02] border border-white/5 rounded-xl flex gap-2">
                    <ChevronRight size={12} className="text-emerald-400 shrink-0 mt-0.5" /> {opp}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
