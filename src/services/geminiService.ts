import { AIAnalysis, Recommendation, Stock } from "../types";
import { auth } from "../lib/firebase";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function analyzeStock(
  stock: Stock,
  historicalData: any[],
  news: any[],
  quoteSummary: any,
  userEntryPrice: number
): Promise<AIAnalysis> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify({ stock, historicalData, news, quoteSummary, userEntryPrice }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  return res.json();
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const res = await fetch('/api/recommendations', {
    headers: await authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}
