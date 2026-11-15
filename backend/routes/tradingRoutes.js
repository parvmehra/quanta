import express from 'express';
import rateLimit from 'express-rate-limit';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { protect } from '../middlewares/auth.js';
import { requireDb } from '../middlewares/requireDb.js';
import User from '../models/User.js';
import { notifyUser } from '../services/notificationService.js';
import { log } from '../utils/logger.js';
import {
  TradeError, placeOrder, cancelOrder, getBalances, getPositions, importHoldings, serializeOrder, serializeEntry,
} from '../services/tradeService.js';

const router = express.Router();

const byUser = (req) => req.user._id;
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { code: 'RATE_LIMITED', message: 'Too many orders. Please slow down.' },
});

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof TradeError) {
      return res.status(err.status).json({ code: err.code, message: err.message, order: err.order ? serializeOrder(err.order) : undefined });
    }
    log.error('Trading route error:', err.message);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
  }
};

const guard = [protect, requireDb];

router.post('/orders', ...guard, orderLimiter, handle(async (req, res) => {
  const { order, duplicate } = await placeOrder(byUser(req), req.body);
  const balances = await getBalances(byUser(req));
  if (order.status === 'REJECTED') {
    return res.status(422).json({ code: order.rejectReason, message: 'The order was rejected.', order: serializeOrder(order), balances });
  }
  res.status(duplicate ? 200 : 201).json({ order: serializeOrder(order), balances, duplicate: Boolean(duplicate) });

  if (!duplicate && order.status === 'FILLED') {
    const user = await User.findById(byUser(req));
    if (user) {
      notifyUser(user, 'STOCK_PURCHASE', {
        tradeDetails: {
          symbol: order.symbol, shares: order.quantity, price: order.fillPrice,
          total: ((order.value + order.fee * (order.side === 'BUY' ? 1 : -1)) / 100).toFixed(2),
          type: order.side, referenceId: String(order._id),
        },
      }).catch(() => {});
    }
  }
}));

router.get('/orders', ...guard, handle(async (req, res) => {
  const filter = { userId: byUser(req) };
  const status = String(req.query.status || '').toUpperCase();
  if (['OPEN', 'FILLED', 'CANCELLED', 'REJECTED'].includes(status)) filter.status = status;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ orders: orders.map(serializeOrder) });
}));

router.delete('/orders/:id', ...guard, handle(async (req, res) => {
  const order = await cancelOrder(byUser(req), req.params.id);
  res.json({ order: serializeOrder(order) });
}));

router.get('/positions', ...guard, handle(async (req, res) => {
  res.json(await getPositions(byUser(req)));
}));

router.get('/ledger', ...guard, handle(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const filter = { userId: byUser(req) };
  const kind = String(req.query.kind || '').toUpperCase();
  if (['INITIAL', 'DEPOSIT', 'BUY', 'SELL', 'IMPORT'].includes(kind)) filter.kind = kind;
  const entries = await LedgerEntry.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  res.json({ entries: entries.map(serializeEntry) });
}));

router.post('/portfolio/import', ...guard, handle(async (req, res) => {
  const result = await importHoldings(byUser(req), req.body?.holdings);
  res.status(201).json(result);
}));

export default router;
