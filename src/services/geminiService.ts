import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysis, Recommendation, Stock } from "../types";

const ai = new GoogleGenAI({ 
  apiKey: (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || ""
});

export async function analyzeStock(stock: Stock, historicalData: any[], news: any[], quoteSummary: any, userEntryPrice: number): Promise<AIAnalysis> {
  try {
    const prompt = `
      You are a quantitative stock analyst AI. Analyze the given stock data and output your response strictly as JSON.
      DO NOT include markdown blocks (\`\`\`json) or any textual explanation outside the JSON.
      Please write your explanations ('summary', 'opportunities', 'risks') in Cantonese (Traditional Chinese - 廣東話/繁體中文).
      
      Stock: ${stock.symbol} (${stock.name})
      Current Market Price: $${stock.price}
      User's Planned/Current Entry Price: $${userEntryPrice}
      
      Key Stats: PE Ratio: ${stock.peRatio}, 52W Range: ${stock.low52w} - ${stock.high52w}, Yield: ${stock.dividendYield}, Beta: ${stock.beta}
      Extended Financials & Stats: ${JSON.stringify(quoteSummary)}
      Recent Chart Data (30d): ${JSON.stringify(historicalData ? historicalData.slice(-15) : [])}
      Recent Headlines: ${JSON.stringify(news ? news.map((n:any) => n.title) : [])}

      Calculation Guidelines:
      1. buyInPrice: Base this STRICTLY on the CURRENT MARKET PRICE ($${stock.price}) using technical support levels and recent dips.
      2. sellingPrice: Base this on BOTH the CURRENT MARKET PRICE ($${stock.price}) and the USER'S INPUTTED ENTRY PRICE ($${userEntryPrice}). 
         - Factor in a reasonable profit margin from the user's entry price while ensuring it aligns with market resistance levels relative to the current price.

      Output format:
      {
        "sentiment": "High" | "Mild" | "Low",
        "priceTarget": number (12-month expected price),
        "buyInPrice": number (suggested entry price),
        "sellingPrice": number (suggested exit/take-profit price),
        "confidence": number (between 0 and 1),
        "summary": string (concise 2-sentence summary referencing news and chart trends, IN CANTONESE),
        "opportunities": string[] (IN CANTONESE),
        "risks": string[] (IN CANTONESE)
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    let text = response.text || "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      sentiment: "neutral",
      priceTarget: stock.price * 1.05,
      buyInPrice: stock.price * 0.95,
      sellingPrice: stock.price * 1.10,
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
      Output MUST be pure JSON format, no markdown wrappers.
      The 'reason' string MUST be in Cantonese (Traditional Chinese / 廣東話).
      Format:
      [
        {
          "symbol": string,
          "name": string,
          "market": "US" | "HK" | "ETF",
          "reason": string (short reason to watch in Cantonese),
          "indicator": "High" | "Mild" | "Low",
          "technicals": {
             "rsi": string (string or number like "45.2"),
             "macd": string (e.g., "Bullish Crossover" or "Bearish Divergence")
          }
        }
      ]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    let text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Recommendations Error:", error);
    return [];
  }
}
