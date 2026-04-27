import { AIAnalysis, Recommendation, Stock } from "../types";

export async function analyzeStock(
  stock: Stock,
  historicalData: any[],
  news: any[],
  quoteSummary: any,
  userEntryPrice: number
): Promise<AIAnalysis> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock, historicalData, news, quoteSummary, userEntryPrice }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  return res.json();
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const res = await fetch('/api/recommendations');
  if (!res.ok) return [];
  return res.json();
}
