import { AIAnalysis, Recommendation, Stock, ETFSentimentResponse } from "../types";

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
  if (!res.ok) {
    const status = res.status;
    throw new Error(status === 503 ? 'AI service temporarily unavailable' : `Analysis failed: ${status}`);
  }
  return res.json();
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const res = await fetch('/api/recommendations');
  if (!res.ok) return [];
  return res.json();
}

export async function getETFSentiment(): Promise<ETFSentimentResponse> {
  const res = await fetch('/api/etf-sentiment');
  if (!res.ok) throw new Error(`ETF sentiment failed: ${res.status}`);
  return res.json();
}
