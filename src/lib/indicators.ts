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
    let gain = 0;
    let loss = 0;
    if (change > 0) gain = change;
    else loss = -change;

    avgGain = (avgGain * (periods - 1) + gain) / periods;
    avgLoss = (avgLoss * (periods - 1) + loss) / periods;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateSimpleMA(prices: number[], periods: number): number {
  if (prices.length < periods) return 0;
  const slice = prices.slice(-periods);
  return slice.reduce((a, b) => a + b, 0) / periods;
}
