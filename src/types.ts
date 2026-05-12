export type Sentiment = 'High' | 'Mild' | 'Low';
export type ChartTimeframe = '1m' | '3m' | '6m' | '1y';
export type ActiveTab = 'portfolio' | 'watchlist' | 'discover' | 'builder' | 'market';

export interface ETFEntry {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose?: number;
}

export interface ETFSentimentData {
  sentiment: 'Bullish' | 'Bearish' | 'Neutral' | 'Mixed';
  score: number;
  summary: string;
  keySignal: string;
}

export interface ETFSentimentResponse {
  bull: ETFEntry[];
  bear: ETFEntry[];
  market: Record<string, ETFEntry>;
  sentiment: ETFSentimentData;
  news: Array<{ title: string; url: string; date: string; source: string }>;
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  volume: string;
  sector: string;
  peRatio?: string;
  high52w?: string;
  low52w?: string;
  dividendYield?: string;
  beta?: string;
}

export interface PortfolioItem {
  symbol: string;
  shares: number;
  averagePrice: number;
  totalCost: number;
}

export interface Transaction {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  timestamp: number;
  totalValue: number;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface AIAnalysis {
  sentiment: Sentiment;
  priceTarget: number;
  buyInPrice: number;
  sellingPrice: number;
  cutLossPrice: number;
  confidence: number;
  summary: string;
  newsInsight?: string;
  risks: string[];
  opportunities: string[];
  technicals?: {
    rsi: number;
    macd: string;
    signal: string;
  };
}

export interface BuilderStock {
  symbol: string;
  name: string;
  market: 'US' | 'HK' | 'ETF';
  percentage: number;
  reason: string;
  buyPrice: number;
  sellPrice: number;
  expectedGainPercent: number;
}

export interface BuilderPlan {
  profile: 'Aggressive' | 'Safety' | 'Mix';
  summary: string;
  allocations: BuilderStock[];
}

export interface PortfolioPlanSet {
  plans: BuilderPlan[];
}

export interface Recommendation {
  symbol: string;
  name: string;
  market: 'US' | 'HK' | 'ETF';
  reason: string;
  indicator: Sentiment;
  tier: 'standard' | 'contrarian';
  technicals?: {
    rsi: string | number;
    macd: string;
  };
}
