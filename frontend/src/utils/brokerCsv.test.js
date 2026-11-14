import test from 'node:test';
import assert from 'node:assert';
import { parseCsv, mapRows } from './brokerCsv.js';

test('parseCsv handles quoted commas, escaped quotes, CRLF and BOM', () => {
  const csv = '\uFEFFsymbol,shares,avg_price,name\r\nAAPL,10,150.5,"Apple, Inc."\r\nMSFT,2,"1,200.00","The ""Big"" One"\r\n\r\n';
  const rows = parseCsv(csv);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].name, 'Apple, Inc.');
  assert.strictEqual(rows[1].avg_price, '1,200.00');
  assert.strictEqual(rows[1].name, 'The "Big" One');
});

test('parseCsv returns nothing for header-only or empty input', () => {
  assert.deepStrictEqual(parseCsv(''), []);
  assert.deepStrictEqual(parseCsv('symbol,shares,avg_price'), []);
});

test('Indian broker presets add the NSE suffix so holdings are priced in INR', () => {
  const rows = parseCsv('tradingsymbol,quantity,average_price,instrument\nRELIANCE,10,2400.5,Reliance\nTCS.NS,2,3500,TCS');
  const { holdings, skipped } = mapRows(rows, 'zerodha');
  assert.deepStrictEqual(holdings.map((h) => h.symbol), ['RELIANCE.NS', 'TCS.NS']);
  assert.strictEqual(skipped.length, 0);
});

test('generic preset leaves symbols untouched', () => {
  const { holdings } = mapRows(parseCsv('symbol,shares,avg_price\naapl,1.5,100'), 'generic');
  assert.deepStrictEqual(holdings, [{ symbol: 'AAPL', shares: 1.5, avgPrice: 100, name: 'AAPL' }]);
});

test('invalid rows are reported instead of silently dropped or defaulted to zero', () => {
  const rows = parseCsv('symbol,shares,avg_price\n,1,10\nAAPL,0,10\nMSFT,abc,10\nGOOG,1,-5\nNVDA,3,"1,000.50"');
  const { holdings, skipped } = mapRows(rows, 'generic');
  assert.strictEqual(holdings.length, 1);
  assert.strictEqual(holdings[0].avgPrice, 1000.5);
  assert.strictEqual(skipped.length, 4);
  assert.ok(skipped.every((s) => s.reason));
});
