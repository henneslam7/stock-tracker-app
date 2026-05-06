export type Sentiment = 'High' | 'Mild' | 'Low';
export type ChartTimeframe = '1m' | '3m' | '6m' | '1y';
export type ActiveTab = 'portfolio' | 'watchlist' | 'discover' | 'builder';

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

export interface PortfolioAllocation {
  symbol: string;
  name: string;
  market: 'US' | 'HK' | 'ETF';
  percentage: number;
  reason: string;
}

export interface PortfolioPlan {
  summary: string;
  riskProfile: 'Conservative' | 'Moderate' | 'Aggressive';
  allocations: PortfolioAllocation[];
  cashReservePercent: number;
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
