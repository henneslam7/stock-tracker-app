import { Stock, PricePoint } from "../types";

export class StockService {
  static async searchSymbols(query: string) {
    if (!query) return [];
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return await res.json();
  }

  static async getStocksData(symbols: string[]): Promise<Record<string, Stock>> {
    if (!symbols || !symbols.length) return {};
    const url = `/api/quote?symbols=${symbols.map(s => encodeURIComponent(s)).join(',')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch quotes: ${res.status} ${errorText}`);
      }
      const quotes = await res.json();
      
      const data: Record<string, Stock> = {};
      for (const q of quotes) {
         // Yahoo Finance can return prices in several fields depending on market state and symbol
         const currentPrice = q.regularMarketPrice || q.postMarketPrice || q.preMarketPrice || q.bid || q.ask || 0;
         const change = q.regularMarketChange || 0;
         const changePercent = q.regularMarketChangePercent || 0;

         data[q.symbol] = {
            symbol: q.symbol,
            name: q.longName || q.shortName || q.symbol,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            marketCap: q.marketCap ? (q.marketCap / 1e9).toFixed(2) + 'B' : 'N/A',
            volume: q.regularMarketVolume ? (q.regularMarketVolume / 1e6).toFixed(2) + 'M' : 'N/A',
            sector: q.quoteType || 'EQUITY',
            peRatio: q.trailingPE ? q.trailingPE.toFixed(2) : 'N/A',
            high52w: q.fiftyTwoWeekHigh ? q.fiftyTwoWeekHigh.toFixed(2) : 'N/A',
            low52w: q.fiftyTwoWeekLow ? q.fiftyTwoWeekLow.toFixed(2) : 'N/A',
            dividendYield: q.trailingAnnualDividendYield ? (q.trailingAnnualDividendYield * 100).toFixed(2) + '%' : 'N/A',
            beta: q.beta ? q.beta.toFixed(2) : 'N/A',
         };
      }
      return data;
    } catch (err) {
      console.error("getStocksData error:", err);
      return {};
    }
  }

  static async getStockInfo(symbol: string) {
     const res = await fetch(`/api/info?symbol=${encodeURIComponent(symbol)}`);
     return await res.json();
  }
}
