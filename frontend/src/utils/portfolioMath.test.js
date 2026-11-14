import test from 'node:test';
import assert from 'node:assert';
import { aggregateLots, valuePositions, totalsByCurrency } from './portfolioMath.js';

test('aggregateLots computes share-weighted average cost', () => {
  const [p] = aggregateLots([
    { symbol: 'aapl', shares: 10, avgPrice: 100 },
    { symbol: 'AAPL', shares: 30, avgPrice: 200 },
  ]);
  assert.strictEqual(p.symbol, 'AAPL');
  assert.strictEqual(p.shares, 40);
  assert.strictEqual(p.cost, 7000);
  assert.strictEqual(p.avgCost, 175);
});

test('aggregateLots ignores invalid lots', () => {
  const out = aggregateLots([
    { symbol: 'X', shares: 0, avgPrice: 10 },
    { symbol: 'X', shares: -5, avgPrice: 10 },
    { symbol: 'X', shares: 'abc', avgPrice: 10 },
    { shares: 5, avgPrice: 10 },
  ]);
  assert.deepStrictEqual(out, []);
});

test('valuePositions computes value, pnl and day pnl from quotes', () => {
  const pos = aggregateLots([{ symbol: 'AAPL', shares: 10, avgPrice: 100 }]);
  const [v] = valuePositions(pos, { AAPL: { price: 120, change: 2, name: 'Apple' } });
  assert.strictEqual(v.value, 1200);
  assert.strictEqual(v.pnl, 200);
  assert.strictEqual(v.pnlPct, 20);
  assert.strictEqual(v.dayPnl, 20);
  assert.strictEqual(v.currency, 'USD');
});

test('positions without a live price are excluded from totals, not valued at zero', () => {
  const pos = aggregateLots([
    { symbol: 'AAPL', shares: 10, avgPrice: 100 },
    { symbol: 'MSFT', shares: 5, avgPrice: 300 },
  ]);
  const valued = valuePositions(pos, { AAPL: { price: 110, change: 1 } });
  const t = totalsByCurrency(valued).USD;
  assert.strictEqual(t.invested, 1000);
  assert.strictEqual(t.value, 1100);
  assert.strictEqual(t.unpriced, 1);
  assert.strictEqual(t.pnl, 100);
});

test('currencies are kept separate', () => {
  const pos = aggregateLots([
    { symbol: 'AAPL', shares: 1, avgPrice: 100 },
    { symbol: 'TCS.NS', shares: 2, avgPrice: 3000 },
  ]);
  const totals = totalsByCurrency(valuePositions(pos, { AAPL: { price: 100 }, 'TCS.NS': { price: 3100 } }));
  assert.strictEqual(totals.USD.value, 100);
  assert.strictEqual(totals.INR.value, 6200);
  assert.strictEqual(totals.INR.pnl, 200);
});
