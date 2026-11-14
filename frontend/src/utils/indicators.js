export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  return values.map((_, i) => {
    if (mid[i] === null) return { upper: null, lower: null };
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(variance / period);
    return { upper: mid[i] + mult * sd, lower: mid[i] - mult * sd };
  });
}

export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const calc = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function withIndicators(points) {
  const closes = points.map((p) => p.close);
  const ma = sma(closes, 20);
  const bb = bollinger(closes, 20, 2);
  const r = rsi(closes, 14);
  return points.map((p, i) => ({
    date: p.t,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    sma: ma[i],
    bbUpper: bb[i].upper,
    bbLower: bb[i].lower,
    rsi: r[i],
  }));
}
