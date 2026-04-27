export function calculateRSI(prices: number[], periods: number = 14): number {
  if (prices.length < periods + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= periods; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / periods;
  let avgLoss = losses / periods;

  for (let i = periods + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (periods - 1) + gain) / periods;
    avgLoss = (avgLoss * (periods - 1) + loss) / periods;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calculateSimpleMA(prices: number[], periods: number): number {
  if (prices.length < periods) return 0;
  const slice = prices.slice(-periods);
  return slice.reduce((a, b) => a + b, 0) / periods;
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const empty = { macd: 0, signal: 0, histogram: 0 };
  if (prices.length < 35) return empty;

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);

  // Signal line = EMA9 of MACD, computed over stable portion (after index 25)
  const macdStable = macdLine.slice(25);
  if (macdStable.length < 9) return empty;
  const signalLine = calculateEMA(macdStable, 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];

  return {
    macd: parseFloat(macd.toFixed(4)),
    signal: parseFloat(signal.toFixed(4)),
    histogram: parseFloat((macd - signal).toFixed(4)),
  };
}
