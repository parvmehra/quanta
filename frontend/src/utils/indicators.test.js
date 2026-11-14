import test from 'node:test';
import assert from 'node:assert';
import { sma, bollinger, rsi, withIndicators } from './indicators.js';

test('sma is null until the window is full, then averages the window', () => {
  assert.deepStrictEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('bollinger bands are symmetric around the mean and collapse for constant input', () => {
  const flat = bollinger([5, 5, 5, 5], 3, 2);
  assert.strictEqual(flat[2].upper, 5);
  assert.strictEqual(flat[2].lower, 5);
  const b = bollinger([1, 2, 3], 3, 2)[2];
  assert.ok(Math.abs(b.upper - 2 - (2 - b.lower)) < 1e-12);
  assert.ok(b.upper > 2 && b.lower < 2);
});

test('rsi is 100 for a strictly rising series and 0 for a strictly falling one', () => {
  const up = rsi(Array.from({ length: 30 }, (_, i) => i + 1), 14);
  const down = rsi(Array.from({ length: 30 }, (_, i) => 100 - i), 14);
  assert.strictEqual(up[29], 100);
  assert.strictEqual(down[29], 0);
  assert.strictEqual(up[13], null);
});

test('rsi matches the textbook Wilder example value range', () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  const r = rsi(closes, 14);
  assert.ok(Math.abs(r[14] - 70.46) < 0.1);
});

test('withIndicators maps fields for the candlestick chart', () => {
  const pts = Array.from({ length: 25 }, (_, i) => ({ t: 1000 + i, open: i, high: i + 1, low: i - 1, close: i, volume: 10 }));
  const out = withIndicators(pts);
  assert.strictEqual(out.length, 25);
  assert.strictEqual(out[0].sma, null);
  assert.notStrictEqual(out[24].sma, null);
  assert.strictEqual(out[24].date, 1024);
});
