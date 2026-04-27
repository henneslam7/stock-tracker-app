import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, Recommendation, Stock } from "../types";

const ai = new GoogleGenAI({
  apiKey: (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || ""
});

export async function analyzeStock(stock: Stock, historicalData: any[], news: any[], quoteSummary: any, userEntryPrice: number): Promise<AIAnalysis> {
  try {
    const prompt = `
      You are a quantitative stock analyst AI. Analyze the given stock data and output your response strictly as JSON.
      DO NOT include markdown blocks or any textual explanation outside the JSON.
      Please write your explanations ('summary', 'opportunities', 'risks') in Cantonese (Traditional Chinese - 廣東話/繁體中文).

      Stock: ${stock.symbol} (${stock.name})
      Current Market Price: $${stock.price}
      User's Entry Price: $${userEntryPrice}

      Key Stats: PE Ratio: ${stock.peRatio}, 52W Range: ${stock.low52w} - ${stock.high52w}, Yield: ${stock.dividendYield}, Beta: ${stock.beta}
      Extended Financials: ${JSON.stringify(quoteSummary)}
      Recent Chart (30d): ${JSON.stringify(historicalData ? historicalData.slice(-15) : [])}
      Recent Headlines: ${JSON.stringify(news ? news.map((n: any) => n.title) : [])}

      Calculation Guidelines:
      1. buyInPrice: Based on CURRENT MARKET PRICE ($${stock.price}) using technical support levels.
      2. sellingPrice: Target profit price factoring user entry ($${userEntryPrice}) and market resistance.
      3. cutLossPrice: Stop-loss price based on technical support breakdown, typically 5-15% below current price. Must be BELOW current price.

      Output format (strict JSON, no markdown):
      {
        "sentiment": "High" | "Mild" | "Low",
        "priceTarget": number,
        "buyInPrice": number,
        "sellingPrice": number,
        "cutLossPrice": number,
        "confidence": number (0 to 1),
        "summary": string (2 sentences IN CANTONESE),
        "opportunities": string[] (IN CANTONESE),
        "risks": string[] (IN CANTONESE)
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text || "{}";
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      cutLossPrice: parsed.cutLossPrice ?? stock.price * 0.92,
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      sentiment: "Mild",
      priceTarget: stock.price * 1.05,
      buyInPrice: stock.price * 0.95,
      sellingPrice: stock.price * 1.10,
      cutLossPrice: stock.price * 0.92,
      confidence: 0.5,
      summary: "Analysis unavailable. Fallback default active.",
      risks: ["Market volatility"],
      opportunities: ["Long term growth"],
    };
  }
}

export async function getRecommendations(): Promise<Recommendation[]> {
  try {
    const prompt = `
      Provide exactly 5 of the best stock/ETF recommendations for EACH of the following 3 categories:
      1. US Market Equities
      2. HK Market Equities (symbol must end in .HK, e.g., 0700.HK)
      3. Global ETFs (e.g., SPY, QQQ)

      Total 15 recommendations.
      Output MUST be pure JSON array, no markdown wrappers.
      The 'reason' string MUST be in Cantonese (Traditional Chinese / 廣東話).
      Format:
      [
        {
          "symbol": string,
          "name": string,
          "market": "US" | "HK" | "ETF",
          "reason": string (short reason in Cantonese),
          "indicator": "High" | "Mild" | "Low",
          "technicals": {
            "rsi": string (e.g., "45.2"),
            "macd": string (e.g., "Bullish Crossover")
          }
        }
      ]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Recommendations Error:", error);
    return [];
  }
}
