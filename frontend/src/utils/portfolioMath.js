import { getCurrencyCode } from './currency.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Merge individual lots (one row per buy) into one position per symbol.
 * avgCost is share-weighted: sum(shares * lotPrice) / sum(shares).
 */
export function aggregateLots(lots = []) {
  const map = new Map();
  for (const lot of lots) {
    const shares = num(lot.shares);
    const price = num(lot.avgPrice);
    if (shares <= 0 || price < 0 || !lot.symbol) continue;
    const symbol = String(lot.symbol).toUpperCase();
    const p = map.get(symbol) || { symbol, name: lot.name || symbol, shares: 0, cost: 0 };
    p.shares += shares;
    p.cost += shares * price;
    map.set(symbol, p);
  }
  return [...map.values()].map((p) => ({ ...p, avgCost: p.cost / p.shares }));
}

/** Attach live quotes. Positions without a usable price keep value/pnl = null. */
export function valuePositions(positions, quotes = {}) {
  return positions.map((p) => {
    const q = quotes[p.symbol];
    const price = q && num(q.price) > 0 ? num(q.price) : null;
    const value = price === null ? null : p.shares * price;
    const pnl = value === null ? null : value - p.cost;
    return {
      ...p,
      name: q?.name || p.name,
      currency: getCurrencyCode(p.symbol),
      price,
      value,
      pnl,
      pnlPct: pnl === null || p.cost <= 0 ? null : (pnl / p.cost) * 100,
      dayPnl: price === null || q?.change === undefined || q?.change === null ? null : p.shares * num(q.change),
    };
  });
}

/** Totals per currency. Currencies are never added together (no FX conversion). */
export function totalsByCurrency(positions) {
  const out = {};
  for (const p of positions) {
    const t = out[p.currency] || (out[p.currency] = { currency: p.currency, invested: 0, value: 0, dayPnl: 0, unpriced: 0, count: 0 });
    t.count += 1;
    if (p.value === null) { t.unpriced += 1; continue; }
    t.invested += p.cost;
    t.value += p.value;
    t.dayPnl += p.dayPnl ?? 0;
  }
  for (const t of Object.values(out)) {
    t.pnl = t.value - t.invested;
    t.pnlPct = t.invested > 0 ? (t.pnl / t.invested) * 100 : null;
    const prev = t.value - t.dayPnl;
    t.dayPnlPct = prev > 0 ? (t.dayPnl / prev) * 100 : null;
  }
  return out;
}
