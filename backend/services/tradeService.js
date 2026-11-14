import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import Holding from '../models/Holding.js';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { yahooFinance, VALID_SYMBOL } from './yahoo.js';

export const FEE_RATE = 0.0003;
export const INITIAL_BALANCES = { USD: 50_000_000, INR: 500_000_000 };
export const DEPOSIT_MAX = 1_000_000;
export const DEPOSIT_DAILY_CAP = 5_000_000;
export const CURRENCIES = ['USD', 'INR'];

export class TradeError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const toMinor = (x) => Math.round(Number(x) * 100);
export const toMajor = (m) => (m === null || m === undefined ? null : Math.round(m) / 100);
export const round4 = (x) => Math.round(x * 1e4) / 1e4;
export const currencyOf = (symbol) => (/\.(NS|BO)$/.test(symbol) ? 'INR' : 'USD');
export const feeMinor = (valueMinor) => Math.round(valueMinor * FEE_RATE);

async function runTx(fn) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

const isDuplicateKey = (err) => err && (err.code === 11000 || err.code === 11001);

export function normalizeOrder(raw = {}) {
  const symbol = String(raw.symbol || '').trim().toUpperCase();
  if (!VALID_SYMBOL.test(symbol) || symbol.startsWith('^') || symbol.includes('=')) {
    throw new TradeError(400, 'INVALID_SYMBOL', 'A valid stock symbol is required.');
  }
  const side = String(raw.side || '').toUpperCase();
  if (!['BUY', 'SELL'].includes(side)) throw new TradeError(400, 'INVALID_SIDE', 'Side must be BUY or SELL.');
  const type = String(raw.type || 'MARKET').toUpperCase();
  if (!['MARKET', 'LIMIT', 'STOP'].includes(type)) throw new TradeError(400, 'INVALID_TYPE', 'Order type must be MARKET, LIMIT or STOP.');

  const quantity = typeof raw.quantity === 'number' || /^\d+(\.\d+)?$/.test(String(raw.quantity ?? '')) ? Number(raw.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || Math.abs(round4(quantity) - quantity) > 1e-9) {
    throw new TradeError(400, 'INVALID_QUANTITY', 'Quantity must be a positive number with at most 4 decimals.');
  }

  const price = (v, label) => {
    const n = typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v ?? '')) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) throw new TradeError(400, 'INVALID_PRICE', `${label} must be a positive number.`);
    return Math.round(n * 100) / 100;
  };
  const limitPrice = type === 'LIMIT' ? price(raw.limitPrice, 'Limit price') : null;
  const stopPrice = type === 'STOP' ? price(raw.stopPrice, 'Stop price') : null;

  const clientOrderId = String(raw.clientOrderId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientOrderId)) {
    throw new TradeError(400, 'INVALID_CLIENT_ORDER_ID', 'A unique clientOrderId (8-64 characters) is required.');
  }
  return { symbol, side, type, quantity: round4(quantity), limitPrice, stopPrice, clientOrderId };
}

export async function defaultGetQuote(symbol) {
  const q = await yahooFinance.quote(symbol, {}, { validateResult: false });
  if (!q || !(q.regularMarketPrice > 0)) return null;
  return {
    price: q.regularMarketPrice,
    name: q.shortName || q.longName || symbol,
    quoteType: q.quoteType,
    marketState: q.marketState || null,
  };
}

export async function defaultGetQuotes(symbols) {
  const result = await yahooFinance.quote(symbols, {}, { validateResult: false });
  const out = {};
  for (const q of Array.isArray(result) ? result : [result]) {
    if (q && q.symbol && q.regularMarketPrice > 0) out[q.symbol] = { price: q.regularMarketPrice };
  }
  return out;
}

export async function ensureWallet(userId) {
  if (await Wallet.exists({ _id: userId })) return;
  try {
    await runTx(async (session) => {
      if (await Wallet.exists({ _id: userId }).session(session)) return;
      await Wallet.create([{ _id: userId, balances: { ...INITIAL_BALANCES } }], { session });
      await LedgerEntry.create(
        CURRENCIES.map((currency) => ({
          userId, kind: 'INITIAL', currency, amount: INITIAL_BALANCES[currency], balanceAfter: INITIAL_BALANCES[currency], note: 'Simulated starting balance',
        })),
        { session, ordered: true },
      );
    });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

export async function getBalances(userId) {
  await ensureWallet(userId);
  const w = await Wallet.findById(userId).lean();
  return { USD: toMajor(w.balances.USD), INR: toMajor(w.balances.INR) };
}

async function applyFill(session, { userId, symbol, name, side, quantity, price, currency, orderId }) {
  const value = toMinor(quantity * price);
  const fee = feeMinor(value);
  const balanceField = `balances.${currency}`;

  if (side === 'BUY') {
    const total = value + fee;
    const wallet = await Wallet.findOneAndUpdate(
      { _id: userId, [balanceField]: { $gte: total } },
      { $inc: { [balanceField]: -total } },
      { new: true, session },
    );
    if (!wallet) throw new TradeError(422, 'INSUFFICIENT_FUNDS', `Not enough ${currency} balance for this order.`);

    const existing = await Holding.findOne({ userId, symbol }).session(session);
    if (existing) {
      const newQty = round4(existing.quantity + quantity);
      const newAvg = (existing.quantity * existing.avgCost + quantity * price + fee / 100) / newQty;
      await Holding.updateOne({ _id: existing._id }, { $set: { quantity: newQty, avgCost: newAvg, name: name || existing.name } }, { session });
    } else {
      const avgCost = (quantity * price + fee / 100) / quantity;
      await Holding.create([{ userId, symbol, name, currency, quantity, avgCost }], { session });
    }
    await LedgerEntry.create([{
      userId, kind: 'BUY', currency, amount: -total, balanceAfter: wallet.balances[currency], orderId, symbol, quantity, price, fee,
    }], { session });
    return { value, fee, total, realizedPnl: null, balanceAfter: wallet.balances[currency] };
  }

  const holding = await Holding.findOne({ userId, symbol }).session(session);
  if (!holding || holding.quantity + 1e-9 < quantity) {
    throw new TradeError(422, 'INSUFFICIENT_HOLDINGS', `You do not own enough ${symbol} to sell ${quantity}.`);
  }
  const remaining = round4(holding.quantity - quantity);
  if (remaining <= 1e-9) await Holding.deleteOne({ _id: holding._id }, { session });
  else await Holding.updateOne({ _id: holding._id }, { $set: { quantity: remaining } }, { session });

  const proceeds = value - fee;
  const realizedPnl = proceeds - toMinor(holding.avgCost * quantity);
  const wallet = await Wallet.findOneAndUpdate({ _id: userId }, { $inc: { [balanceField]: proceeds } }, { new: true, session });
  await LedgerEntry.create([{
    userId, kind: 'SELL', currency, amount: proceeds, balanceAfter: wallet.balances[currency], orderId, symbol, quantity, price, fee, realizedPnl,
  }], { session });
  return { value, fee, total: proceeds, realizedPnl, balanceAfter: wallet.balances[currency] };
}

async function recordRejected(base, err) {
  try {
    return await Order.create({ ...base, status: 'REJECTED', rejectReason: err.code });
  } catch (e) {
    if (isDuplicateKey(e)) return Order.findOne({ userId: base.userId, clientOrderId: base.clientOrderId });
    throw e;
  }
}

async function fillMarketOrder(base, price) {
  let created;
  try {
    await runTx(async (session) => {
      const [order] = await Order.create([{ ...base, status: 'FILLED', fillPrice: price, filledAt: new Date() }], { session });
      const fill = await applyFill(session, { ...base, price, orderId: order._id });
      await Order.updateOne({ _id: order._id }, { $set: { value: fill.value, fee: fill.fee, realizedPnl: fill.realizedPnl } }, { session });
      created = order._id;
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      const existing = await Order.findOne({ userId: base.userId, clientOrderId: base.clientOrderId });
      if (existing) return existing;
    }
    if (err instanceof TradeError) {
      err.order = await recordRejected(base, err);
    }
    throw err;
  }
  return Order.findById(created);
}

export function isTriggered(order, price) {
  if (order.type === 'LIMIT') return order.side === 'BUY' ? price <= order.limitPrice : price >= order.limitPrice;
  if (order.type === 'STOP') return order.side === 'BUY' ? price >= order.stopPrice : price <= order.stopPrice;
  return false;
}

export async function fillOpenOrder(orderId, price) {
  let outcome = null;
  try {
    await runTx(async (session) => {
      outcome = null;
      const order = await Order.findOne({ _id: orderId, status: 'OPEN' }).session(session);
      if (!order) return;
      const fill = await applyFill(session, {
        userId: order.userId, symbol: order.symbol, name: order.name, side: order.side,
        quantity: order.quantity, price, currency: order.currency, orderId: order._id,
      });
      await Order.updateOne(
        { _id: order._id },
        { $set: { status: 'FILLED', fillPrice: price, filledAt: new Date(), value: fill.value, fee: fill.fee, realizedPnl: fill.realizedPnl } },
        { session },
      );
      outcome = order._id;
    });
  } catch (err) {
    if (err instanceof TradeError) {
      await Order.updateOne({ _id: orderId, status: 'OPEN' }, { $set: { status: 'REJECTED', rejectReason: err.code } });
      return null;
    }
    throw err;
  }
  return outcome ? Order.findById(outcome) : null;
}

export async function placeOrder(userId, raw, deps = {}) {
  const getQuote = deps.getQuote || defaultGetQuote;
  const input = normalizeOrder(raw);

  const existing = await Order.findOne({ userId, clientOrderId: input.clientOrderId });
  if (existing) return { order: existing, duplicate: true };

  let quote;
  try {
    quote = await getQuote(input.symbol);
  } catch {
    quote = null;
  }
  if (!quote || !(quote.price > 0)) throw new TradeError(503, 'PRICE_UNAVAILABLE', 'A live price is not available for this symbol right now.');
  if (!['EQUITY', 'ETF'].includes(quote.quoteType)) throw new TradeError(400, 'NOT_TRADABLE', 'Only stocks and ETFs can be traded.');

  const currency = currencyOf(input.symbol);
  await ensureWallet(userId);
  const base = { userId, ...input, name: quote.name || input.symbol, currency, marketState: quote.marketState || null };

  if (input.type === 'MARKET') {
    return { order: await fillMarketOrder(base, quote.price) };
  }

  try {
    if (input.side === 'BUY') {
      const refPrice = input.limitPrice ?? input.stopPrice;
      const need = toMinor(input.quantity * refPrice);
      const w = await Wallet.findById(userId).lean();
      if (w.balances[currency] < need + feeMinor(need)) throw new TradeError(422, 'INSUFFICIENT_FUNDS', `Not enough ${currency} balance for this order.`);
    } else {
      const h = await Holding.findOne({ userId, symbol: input.symbol }).lean();
      if (!h || h.quantity + 1e-9 < input.quantity) throw new TradeError(422, 'INSUFFICIENT_HOLDINGS', `You do not own enough ${input.symbol} to sell ${input.quantity}.`);
    }
  } catch (err) {
    if (err instanceof TradeError) err.order = await recordRejected(base, err);
    throw err;
  }

  let order;
  try {
    order = await Order.create({ ...base, status: 'OPEN' });
  } catch (err) {
    if (isDuplicateKey(err)) return { order: await Order.findOne({ userId, clientOrderId: input.clientOrderId }), duplicate: true };
    throw err;
  }
  if (isTriggered(order, quote.price)) {
    const filled = await fillOpenOrder(order._id, quote.price);
    if (filled) return { order: filled };
    return { order: await Order.findById(order._id) };
  }
  return { order };
}

export async function cancelOrder(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) throw new TradeError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const cancelled = await Order.findOneAndUpdate(
    { _id: orderId, userId, status: 'OPEN' },
    { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
    { new: true },
  );
  if (cancelled) return cancelled;
  const exists = await Order.findOne({ _id: orderId, userId }).lean();
  if (!exists) throw new TradeError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  throw new TradeError(409, 'ORDER_NOT_OPEN', `Order is already ${exists.status.toLowerCase()}.`);
}

export async function runMatcher(deps = {}) {
  const getQuotes = deps.getQuotes || defaultGetQuotes;
  const open = await Order.find({ status: 'OPEN' }).sort({ createdAt: 1 }).limit(200).lean();
  if (!open.length) return { checked: 0, filled: 0 };
  const symbols = [...new Set(open.map((o) => o.symbol))].slice(0, 50);
  let quotes;
  try {
    quotes = await getQuotes(symbols);
  } catch {
    return { checked: open.length, filled: 0 };
  }
  let filled = 0;
  for (const order of open) {
    const q = quotes[order.symbol];
    if (q && q.price > 0 && isTriggered(order, q.price)) {
      if (await fillOpenOrder(order._id, q.price)) filled += 1;
    }
  }
  return { checked: open.length, filled };
}

export async function deposit(userId, currency, amount) {
  const cur = String(currency || '').toUpperCase();
  if (!CURRENCIES.includes(cur)) throw new TradeError(400, 'INVALID_CURRENCY', 'Currency must be USD or INR.');
  const n = typeof amount === 'number' || /^\d+(\.\d+)?$/.test(String(amount ?? '')) ? Number(amount) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new TradeError(400, 'INVALID_AMOUNT', 'Amount must be greater than zero.');
  if (n > DEPOSIT_MAX) throw new TradeError(400, 'AMOUNT_TOO_LARGE', `A single simulated deposit is limited to ${DEPOSIT_MAX.toLocaleString('en-US')} ${cur}.`);
  const minor = toMinor(n);

  await ensureWallet(userId);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const today = await LedgerEntry.aggregate([
    { $match: { userId, kind: 'DEPOSIT', currency: cur, createdAt: { $gte: startOfDay } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  if ((today[0]?.total || 0) + minor > toMinor(DEPOSIT_DAILY_CAP)) {
    throw new TradeError(422, 'DAILY_LIMIT', `Daily simulated deposit limit of ${DEPOSIT_DAILY_CAP.toLocaleString('en-US')} ${cur} reached.`);
  }

  let entry;
  await runTx(async (session) => {
    const wallet = await Wallet.findOneAndUpdate({ _id: userId }, { $inc: { [`balances.${cur}`]: minor } }, { new: true, session });
    [entry] = await LedgerEntry.create([{
      userId, kind: 'DEPOSIT', currency: cur, amount: minor, balanceAfter: wallet.balances[cur], note: 'Simulated deposit',
    }], { session });
  });
  return entry;
}

export async function importHoldings(userId, rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TradeError(400, 'NO_ROWS', 'Provide at least one holding.');
  if (rows.length > 500) throw new TradeError(400, 'TOO_MANY_ROWS', 'At most 500 holdings can be imported at once.');
  const clean = rows.map((r, i) => {
    const symbol = String(r?.symbol || '').trim().toUpperCase();
    const shares = Number(r?.shares);
    const avgPrice = Number(r?.avgPrice);
    if (!VALID_SYMBOL.test(symbol) || symbol.startsWith('^') || symbol.includes('=')) throw new TradeError(400, 'INVALID_ROW', `Row ${i + 1}: invalid symbol.`);
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1_000_000 || Math.abs(round4(shares) - shares) > 1e-9) throw new TradeError(400, 'INVALID_ROW', `Row ${i + 1}: quantity must be a positive number with at most 4 decimals.`);
    if (!Number.isFinite(avgPrice) || avgPrice < 0 || avgPrice > 10_000_000) throw new TradeError(400, 'INVALID_ROW', `Row ${i + 1}: average price must be zero or more.`);
    return { symbol, shares: round4(shares), avgPrice, name: String(r?.name || '').slice(0, 120) };
  });

  await ensureWallet(userId);
  await runTx(async (session) => {
    for (const r of clean) {
      const currency = currencyOf(r.symbol);
      const existing = await Holding.findOne({ userId, symbol: r.symbol }).session(session);
      if (existing) {
        const newQty = round4(existing.quantity + r.shares);
        const newAvg = (existing.quantity * existing.avgCost + r.shares * r.avgPrice) / newQty;
        await Holding.updateOne({ _id: existing._id }, { $set: { quantity: newQty, avgCost: newAvg } }, { session });
      } else {
        await Holding.create([{ userId, symbol: r.symbol, name: r.name, currency, quantity: r.shares, avgCost: r.avgPrice }], { session });
      }
      await LedgerEntry.create([{
        userId, kind: 'IMPORT', currency, amount: 0, symbol: r.symbol, quantity: r.shares, price: r.avgPrice, note: 'Imported holding (no wallet change)',
      }], { session });
    }
  });
  return { imported: clean.length };
}

export async function getPositions(userId) {
  const holdings = await Holding.find({ userId }).sort({ symbol: 1 }).lean();
  const realized = await LedgerEntry.aggregate([
    { $match: { userId, kind: 'SELL' } },
    { $group: { _id: '$currency', total: { $sum: '$realizedPnl' }, trades: { $sum: 1 } } },
  ]);
  return {
    positions: holdings.map((h) => ({
      id: String(h._id), symbol: h.symbol, name: h.name, currency: h.currency, quantity: h.quantity, avgCost: h.avgCost,
    })),
    realized: Object.fromEntries(realized.map((r) => [r._id, { pnl: toMajor(r.total), trades: r.trades }])),
  };
}

export const serializeOrder = (o) => ({
  id: String(o._id),
  symbol: o.symbol,
  name: o.name,
  currency: o.currency,
  side: o.side,
  type: o.type,
  quantity: o.quantity,
  limitPrice: o.limitPrice,
  stopPrice: o.stopPrice,
  status: o.status,
  rejectReason: o.rejectReason,
  marketState: o.marketState,
  fillPrice: o.fillPrice,
  value: toMajor(o.value),
  fee: toMajor(o.fee),
  realizedPnl: toMajor(o.realizedPnl),
  createdAt: o.createdAt,
  filledAt: o.filledAt,
  cancelledAt: o.cancelledAt,
});

export const serializeEntry = (e) => ({
  id: String(e._id),
  kind: e.kind,
  currency: e.currency,
  amount: toMajor(e.amount),
  balanceAfter: toMajor(e.balanceAfter),
  symbol: e.symbol,
  quantity: e.quantity,
  price: e.price,
  fee: toMajor(e.fee),
  realizedPnl: toMajor(e.realizedPnl),
  note: e.note,
  orderId: e.orderId ? String(e.orderId) : null,
  createdAt: e.createdAt,
});
