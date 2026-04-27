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
  sentiment: 'High' | 'Mild' | 'Low' | 'bullish' | 'bearish' | 'neutral';
  priceTarget: number;
  buyInPrice: number;
  sellingPrice: number;
  confidence: number;
  summary: string;
  risks: string[];
  opportunities: string[];
  technicals?: {
    rsi: number;
    macd: string;
    signal: string;
  };
}

export interface Recommendation {
  symbol: string;
  name: string;
  market: 'US' | 'HK' | 'ETF';
  reason: string;
  indicator: 'High' | 'Mild' | 'Low' | 'bullish' | 'bearish' | 'neutral';
  technicals?: {
    rsi: string | number;
    macd: string;
  };
}
