import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import Holding from '../models/Holding.js';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import {
  placeOrder, cancelOrder, runMatcher, deposit, importHoldings, getBalances, getPositions,
  TradeError, INITIAL_BALANCES, DEPOSIT_MAX, feeMinor, toMinor,
} from '../services/tradeService.js';

const URI = (process.env.MONGO_DB_URI || '').trim();
const skip = URI ? false : 'MONGO_DB_URI is not set';
const users = [];
const newUser = () => { const id = `test-${crypto.randomUUID()}`; users.push(id); return id; };
const cid = () => crypto.randomBytes(8).toString('hex');
const quote = (price, extra = {}) => async () => ({ price, name: 'Test Co', quoteType: 'EQUITY', marketState: 'REGULAR', ...extra });
const buy = (userId, symbol, quantity, price, extra = {}) => placeOrder(userId, { symbol, side: 'BUY', type: 'MARKET', quantity, clientOrderId: cid(), ...extra }, { getQuote: quote(price) });
const sell = (userId, symbol, quantity, price, extra = {}) => placeOrder(userId, { symbol, side: 'SELL', type: 'MARKET', quantity, clientOrderId: cid(), ...extra }, { getQuote: quote(price) });

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => { assert.ok(err instanceof TradeError, `expected TradeError, got ${err}`); assert.strictEqual(err.code, code); return true; });
}

async function assertLedgerMatchesWallet(userId) {
  const wallet = await Wallet.findById(userId).lean();
  for (const cur of ['USD', 'INR']) {
    const sum = (await LedgerEntry.find({ userId, currency: cur }).lean()).reduce((s, e) => s + e.amount, 0);
    assert.strictEqual(sum, wallet.balances[cur], `ledger sum must equal ${cur} balance`);
  }
}

before(async () => { if (!skip) await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 }); });
after(async () => {
  if (skip) return;
  await Promise.all([Wallet.deleteMany({ _id: { $in: users } }), Holding.deleteMany({ userId: { $in: users } }), Order.deleteMany({ userId: { $in: users } }), LedgerEntry.deleteMany({ userId: { $in: users } })]);
  await mongoose.disconnect();
});

test('new wallet gets the simulated starting balances and an auditable ledger', { skip }, async () => {
  const u = newUser();
  const b = await getBalances(u);
  assert.deepStrictEqual(b, { USD: 500000, INR: 5000000 });
  await assertLedgerMatchesWallet(u);
  assert.strictEqual(await LedgerEntry.countDocuments({ userId: u, kind: 'INITIAL' }), 2);
});

test('buy fills at the server price, ignores client-supplied prices and updates wallet, holding and ledger', { skip }, async () => {
  const u = newUser();
  const { order } = await buy(u, 'AAPL', 10, 100, { price: 1, fillPrice: 1, userId: 'someone-else', balance: 9e9 });
  assert.strictEqual(order.status, 'FILLED');
  assert.strictEqual(order.fillPrice, 100);
  assert.strictEqual(order.userId, u);
  const value = toMinor(10 * 100);
  const fee = feeMinor(value);
  const wallet = await Wallet.findById(u).lean();
  assert.strictEqual(wallet.balances.USD, INITIAL_BALANCES.USD - value - fee);
  assert.strictEqual(wallet.balances.INR, INITIAL_BALANCES.INR);
  const { positions } = await getPositions(u);
  assert.strictEqual(positions.length, 1);
  assert.strictEqual(positions[0].quantity, 10);
  assert.ok(Math.abs(positions[0].avgCost - (1000 + fee / 100) / 10) < 1e-9, 'average cost includes the buy fee');
  assert.strictEqual(await LedgerEntry.countDocuments({ userId: u, kind: 'BUY' }), 1);
  await assertLedgerMatchesWallet(u);
});

test('invalid quantities, symbols and ids are rejected before anything is written', { skip }, async () => {
  const u = newUser();
  for (const quantity of [0, -1, 'abc', 1.00001, NaN, 1e9, null, undefined, '', '1e3']) {
    await rejects(buy(u, 'AAPL', quantity, 100), 'INVALID_QUANTITY');
  }
  await rejects(buy(u, '^GSPC', 1, 100), 'INVALID_SYMBOL');
  await rejects(buy(u, 'BAD SYMBOL!', 1, 100), 'INVALID_SYMBOL');
  await rejects(placeOrder(u, { symbol: 'AAPL', side: 'HOLD', type: 'MARKET', quantity: 1, clientOrderId: cid() }, { getQuote: quote(100) }), 'INVALID_SIDE');
  await rejects(placeOrder(u, { symbol: 'AAPL', side: 'BUY', type: 'MARKET', quantity: 1 }, { getQuote: quote(100) }), 'INVALID_CLIENT_ORDER_ID');
  await rejects(placeOrder(u, { symbol: 'AAPL', side: 'BUY', type: 'LIMIT', quantity: 1, clientOrderId: cid() }, { getQuote: quote(100) }), 'INVALID_PRICE');
  assert.strictEqual(await Order.countDocuments({ userId: u }), 0);
  assert.strictEqual(await Holding.countDocuments({ userId: u }), 0);
});

test('insufficient balance rejects the order, records it as REJECTED and changes nothing else', { skip }, async () => {
  const u = newUser();
  await assert.rejects(buy(u, 'AAPL', 10000, 100), (err) => { assert.strictEqual(err.code, 'INSUFFICIENT_FUNDS'); assert.strictEqual(err.order.status, 'REJECTED'); return true; });
  assert.deepStrictEqual(await getBalances(u), { USD: 500000, INR: 5000000 });
  assert.strictEqual(await Holding.countDocuments({ userId: u }), 0);
  await assertLedgerMatchesWallet(u);
});

test('selling more than owned, or something never owned, is rejected', { skip }, async () => {
  const u = newUser();
  await rejects(sell(u, 'AAPL', 1, 100), 'INSUFFICIENT_HOLDINGS');
  await buy(u, 'AAPL', 5, 100);
  await rejects(sell(u, 'AAPL', 6, 100), 'INSUFFICIENT_HOLDINGS');
  const { positions } = await getPositions(u);
  assert.strictEqual(positions[0].quantity, 5);
  await assertLedgerMatchesWallet(u);
});

test('duplicate submissions with the same clientOrderId execute exactly once', { skip }, async () => {
  const u = newUser();
  const clientOrderId = cid();
  const first = await placeOrder(u, { symbol: 'MSFT', side: 'BUY', type: 'MARKET', quantity: 2, clientOrderId }, { getQuote: quote(100) });
  const second = await placeOrder(u, { symbol: 'MSFT', side: 'BUY', type: 'MARKET', quantity: 2, clientOrderId }, { getQuote: quote(100) });
  assert.strictEqual(String(first.order._id), String(second.order._id));
  assert.strictEqual(second.duplicate, true);

  const racing = cid();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => placeOrder(u, { symbol: 'MSFT', side: 'BUY', type: 'MARKET', quantity: 1, clientOrderId: racing }, { getQuote: quote(100) })));
  assert.ok(results.every((r) => r.status === 'fulfilled'), 'every racing duplicate resolves to the same order');
  assert.strictEqual(new Set(results.map((r) => String(r.value.order._id))).size, 1);
  assert.strictEqual(await Order.countDocuments({ userId: u, status: 'FILLED' }), 2);
  const { positions } = await getPositions(u);
  assert.strictEqual(positions[0].quantity, 3);
  await assertLedgerMatchesWallet(u);
});

test('concurrent purchases can never overspend the wallet', { skip }, async () => {
  const u = newUser();
  const price = 1500;
  const qty = 100;
  const cost = toMinor(qty * price) + feeMinor(toMinor(qty * price));
  const affordable = Math.floor(INITIAL_BALANCES.USD / cost);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => buy(u, 'NVDA', qty, price)));
  const filled = results.filter((r) => r.status === 'fulfilled').length;
  const refused = results.filter((r) => r.status === 'rejected' && r.reason.code === 'INSUFFICIENT_FUNDS').length;
  assert.strictEqual(filled, affordable);
  assert.strictEqual(filled + refused, 10, 'every attempt either filled or was refused for funds');
  const wallet = await Wallet.findById(u).lean();
  assert.strictEqual(wallet.balances.USD, INITIAL_BALANCES.USD - filled * cost);
  assert.ok(wallet.balances.USD >= 0);
  const { positions } = await getPositions(u);
  assert.strictEqual(positions[0].quantity, filled * qty);
  await assertLedgerMatchesWallet(u);
});

test('concurrent sells can never sell more than is owned', { skip }, async () => {
  const u = newUser();
  await buy(u, 'AAPL', 10, 100);
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => sell(u, 'AAPL', 4, 100)));
  const filled = results.filter((r) => r.status === 'fulfilled').length;
  assert.strictEqual(filled, 2);
  const { positions } = await getPositions(u);
  assert.strictEqual(positions[0].quantity, 2);
  await assertLedgerMatchesWallet(u);
});

test('average cost is share-weighted and realised P&L is recorded on sell', { skip }, async () => {
  const u = newUser();
  await buy(u, 'AAPL', 10, 100);
  await buy(u, 'AAPL', 10, 200);
  const fee1 = feeMinor(toMinor(1000));
  const fee2 = feeMinor(toMinor(2000));
  const expectedAvg = (10 * 100 + 10 * 200 + (fee1 + fee2) / 100) / 20;
  let { positions } = await getPositions(u);
  assert.strictEqual(positions[0].quantity, 20);
  assert.ok(Math.abs(positions[0].avgCost - expectedAvg) < 1e-9);

  const { order } = await sell(u, 'AAPL', 5, 180);
  const value = toMinor(5 * 180);
  const proceeds = value - feeMinor(value);
  const expectedPnl = proceeds - toMinor(expectedAvg * 5);
  assert.strictEqual(order.realizedPnl, expectedPnl);
  ({ positions } = await getPositions(u));
  assert.strictEqual(positions[0].quantity, 15);
  assert.ok(Math.abs(positions[0].avgCost - expectedAvg) < 1e-9, 'selling does not change average cost');
  const realized = (await getPositions(u)).realized;
  assert.strictEqual(realized.USD.pnl * 100, expectedPnl);
  await assertLedgerMatchesWallet(u);
});

test('selling the whole position removes the holding', { skip }, async () => {
  const u = newUser();
  await buy(u, 'AAPL', 3, 100);
  await sell(u, 'AAPL', 3, 110);
  assert.strictEqual(await Holding.countDocuments({ userId: u }), 0);
  await assertLedgerMatchesWallet(u);
});

test('Indian symbols use the INR wallet only', { skip }, async () => {
  const u = newUser();
  await buy(u, 'TCS.NS', 10, 3000);
  const w = await Wallet.findById(u).lean();
  assert.strictEqual(w.balances.USD, INITIAL_BALANCES.USD);
  assert.ok(w.balances.INR < INITIAL_BALANCES.INR);
  await assertLedgerMatchesWallet(u);
});

test('limit orders rest until the price condition is met, then fill at the market price', { skip }, async () => {
  const u = newUser();
  const { order } = await placeOrder(u, { symbol: 'AMD', side: 'BUY', type: 'LIMIT', quantity: 10, limitPrice: 90, clientOrderId: cid() }, { getQuote: quote(100) });
  assert.strictEqual(order.status, 'OPEN');
  assert.strictEqual((await getPositions(u)).positions.length, 0);

  let r = await runMatcher({ getQuotes: async () => ({ AMD: { price: 95 } }) });
  assert.strictEqual((await Order.findById(order._id)).status, 'OPEN');
  assert.ok(r.checked >= 1);

  await runMatcher({ getQuotes: async () => ({ AMD: { price: 89.5 } }) });
  const filled = await Order.findById(order._id);
  assert.strictEqual(filled.status, 'FILLED');
  assert.strictEqual(filled.fillPrice, 89.5);
  assert.strictEqual((await getPositions(u)).positions[0].quantity, 10);

  await runMatcher({ getQuotes: async () => ({ AMD: { price: 50 } }) });
  assert.strictEqual((await getPositions(u)).positions[0].quantity, 10, 'a filled order never fills twice');
  await assertLedgerMatchesWallet(u);
});

test('a marketable limit order fills immediately', { skip }, async () => {
  const u = newUser();
  const { order } = await placeOrder(u, { symbol: 'AMD', side: 'BUY', type: 'LIMIT', quantity: 1, limitPrice: 120, clientOrderId: cid() }, { getQuote: quote(100) });
  assert.strictEqual(order.status, 'FILLED');
  assert.strictEqual(order.fillPrice, 100);
});

test('stop-loss sell triggers when the price falls to the stop', { skip }, async () => {
  const u = newUser();
  await buy(u, 'AAPL', 10, 100);
  const { order } = await placeOrder(u, { symbol: 'AAPL', side: 'SELL', type: 'STOP', quantity: 10, stopPrice: 90, clientOrderId: cid() }, { getQuote: quote(100) });
  assert.strictEqual(order.status, 'OPEN');
  await runMatcher({ getQuotes: async () => ({ AAPL: { price: 92 } }) });
  assert.strictEqual((await Order.findById(order._id)).status, 'OPEN');
  await runMatcher({ getQuotes: async () => ({ AAPL: { price: 88 } }) });
  const filled = await Order.findById(order._id);
  assert.strictEqual(filled.status, 'FILLED');
  assert.strictEqual(filled.fillPrice, 88);
  assert.strictEqual(await Holding.countDocuments({ userId: u }), 0);
  await assertLedgerMatchesWallet(u);
});

test('a resting order that can no longer be funded is rejected when it triggers', { skip }, async () => {
  const u = newUser();
  await buy(u, 'AAPL', 10, 100);
  const { order } = await placeOrder(u, { symbol: 'AAPL', side: 'SELL', type: 'LIMIT', quantity: 10, limitPrice: 150, clientOrderId: cid() }, { getQuote: quote(100) });
  await sell(u, 'AAPL', 10, 100);
  await runMatcher({ getQuotes: async () => ({ AAPL: { price: 160 } }) });
  const after = await Order.findById(order._id);
  assert.strictEqual(after.status, 'REJECTED');
  assert.strictEqual(after.rejectReason, 'INSUFFICIENT_HOLDINGS');
  await assertLedgerMatchesWallet(u);
});

test('orders can be cancelled only by their owner and only while open', { skip }, async () => {
  const a = newUser();
  const b = newUser();
  const { order } = await placeOrder(a, { symbol: 'AMD', side: 'BUY', type: 'LIMIT', quantity: 1, limitPrice: 50, clientOrderId: cid() }, { getQuote: quote(100) });
  await rejects(cancelOrder(b, String(order._id)), 'ORDER_NOT_FOUND');
  assert.strictEqual((await Order.findById(order._id)).status, 'OPEN');
  const cancelled = await cancelOrder(a, String(order._id));
  assert.strictEqual(cancelled.status, 'CANCELLED');
  await rejects(cancelOrder(a, String(order._id)), 'ORDER_NOT_OPEN');
  await rejects(cancelOrder(a, 'not-an-id'), 'ORDER_NOT_FOUND');
  await runMatcher({ getQuotes: async () => ({ AMD: { price: 10 } }) });
  assert.strictEqual((await Order.findById(order._id)).status, 'CANCELLED', 'cancelled orders never fill');
});

test('users never see or affect each other\'s money or positions', { skip }, async () => {
  const a = newUser();
  const b = newUser();
  await buy(a, 'AAPL', 5, 100);
  await deposit(a, 'USD', 1000);
  assert.strictEqual((await getPositions(b)).positions.length, 0);
  assert.deepStrictEqual(await getBalances(b), { USD: 500000, INR: 5000000 });
  await rejects(sell(b, 'AAPL', 1, 100), 'INSUFFICIENT_HOLDINGS');
  assert.strictEqual(await Order.countDocuments({ userId: b, status: 'FILLED' }), 0);
});

test('only tradable instruments with a live price can be ordered', { skip }, async () => {
  const u = newUser();
  await rejects(placeOrder(u, { symbol: 'FOO', side: 'BUY', type: 'MARKET', quantity: 1, clientOrderId: cid() }, { getQuote: quote(10, { quoteType: 'INDEX' }) }), 'NOT_TRADABLE');
  await rejects(placeOrder(u, { symbol: 'FOO', side: 'BUY', type: 'MARKET', quantity: 1, clientOrderId: cid() }, { getQuote: async () => null }), 'PRICE_UNAVAILABLE');
  await rejects(placeOrder(u, { symbol: 'FOO', side: 'BUY', type: 'MARKET', quantity: 1, clientOrderId: cid() }, { getQuote: async () => { throw new Error('provider down'); } }), 'PRICE_UNAVAILABLE');
  assert.deepStrictEqual(await getBalances(u), { USD: 500000, INR: 5000000 });
});

test('simulated deposits are validated and capped', { skip }, async () => {
  const u = newUser();
  for (const amount of [0, -5, 'x', NaN, null]) await rejects(deposit(u, 'USD', amount), 'INVALID_AMOUNT');
  await rejects(deposit(u, 'EUR', 10), 'INVALID_CURRENCY');
  await rejects(deposit(u, 'USD', DEPOSIT_MAX + 1), 'AMOUNT_TOO_LARGE');
  await deposit(u, 'USD', 1000);
  assert.strictEqual((await getBalances(u)).USD, 501000);
  for (let i = 0; i < 5; i++) await deposit(u, "INR", DEPOSIT_MAX);
  await rejects(deposit(u, 'INR', DEPOSIT_MAX), 'DAILY_LIMIT');
  await assertLedgerMatchesWallet(u);
});

test('importing holdings validates rows, merges by weighted cost and leaves the wallet untouched', { skip }, async () => {
  const u = newUser();
  await rejects(importHoldings(u, []), 'NO_ROWS');
  await rejects(importHoldings(u, [{ symbol: 'AAPL', shares: -1, avgPrice: 10 }]), 'INVALID_ROW');
  await rejects(importHoldings(u, [{ symbol: '^GSPC', shares: 1, avgPrice: 10 }]), 'INVALID_ROW');
  await rejects(importHoldings(u, Array.from({ length: 501 }, () => ({ symbol: 'AAPL', shares: 1, avgPrice: 1 }))), 'TOO_MANY_ROWS');
  assert.strictEqual(await Holding.countDocuments({ userId: u }), 0, 'a failed import writes nothing');

  await importHoldings(u, [{ symbol: 'aapl', shares: 10, avgPrice: 100 }, { symbol: 'TCS.NS', shares: 2, avgPrice: 3000 }]);
  await importHoldings(u, [{ symbol: 'AAPL', shares: 10, avgPrice: 200 }]);
  const { positions } = await getPositions(u);
  const aapl = positions.find((p) => p.symbol === 'AAPL');
  assert.strictEqual(aapl.quantity, 20);
  assert.strictEqual(aapl.avgCost, 150);
  assert.strictEqual(positions.find((p) => p.symbol === 'TCS.NS').currency, 'INR');
  assert.deepStrictEqual(await getBalances(u), { USD: 500000, INR: 5000000 });
  await assertLedgerMatchesWallet(u);
});
