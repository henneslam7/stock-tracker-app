import { Stock } from "./types";

export const INITIAL_WATCHLIST = ["AAPL", "GOOGL", "TSLA", "MSFT", "AMZN"];

export const STOCK_METADATA: Record<string, Partial<Stock>> = {
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
  TSLA: { name: "Tesla, Inc.", sector: "Automotive" },
  MSFT: { name: "Microsoft Corporation", sector: "Technology" },
  AMZN: { name: "Amazon.com, Inc.", sector: "Consumer Cyclical" },
  NVDA: { name: "NVIDIA Corporation", sector: "Semiconductors" },
  META: { name: "Meta Platforms, Inc.", sector: "Communication Services" },
  BRK_B: { name: "Berkshire Hathaway Inc.", sector: "Financial Services" },
  V: { name: "Visa Inc.", sector: "Financial Services" },
  JPM: { name: "JPMorgan Chase & Co.", sector: "Financial Services" },
};
