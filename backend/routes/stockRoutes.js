import express from 'express';
import rateLimit from 'express-rate-limit';
import { searchStocks, getStockQuote, getStockNews, getStockHistory, clearCache, getMarketPulse, getBatchQuotes } from '../controllers/stockControllers.js';
import { getChart, getFundamentals, getSparklines } from '../controllers/stockDataController.js';
import { protect, requireAdmin } from '../middlewares/auth.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { notifyUser } from '../services/notificationService.js';
import { VALID_SYMBOL } from '../services/yahoo.js';

const router = express.Router();

const limit = (max, message) => rateLimit({ windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message } });
const dataLimiter = limit(90, 'Too many requests. Please slow down.');

router.get('/search', searchStocks);
router.get('/quotes', getBatchQuotes);
router.get('/quote/:symbol', getStockQuote);
router.get('/news/:symbol', getStockNews);
router.get('/history/:symbol', getStockHistory);
router.get('/chart/:symbol', dataLimiter, getChart);
router.get('/fundamentals/:symbol', dataLimiter, getFundamentals);
router.get('/sparklines', dataLimiter, getSparklines);
router.get('/market-pulse', getMarketPulse);

router.post('/cache/clear', protect, requireAdmin, clearCache);

const cleanSymbol = (raw) => {
  const s = String(raw || '').trim().toUpperCase();
  return VALID_SYMBOL.test(s) && !s.startsWith('^') ? s : null;
};

router.get('/subscriptions', protect, async (req, res) => {
  try {
    const subs = await Subscription.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(subs);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/subscriptions', protect, async (req, res) => {
  const symbol = cleanSymbol(req.body?.symbol);
  if (!symbol) return res.status(400).json({ message: 'A valid stock symbol is required.' });

  try {
    const existing = await Subscription.findOne({ userId: req.user._id, symbol }).lean();
    if (existing) return res.json({ message: `Already subscribed to ${symbol}`, subscription: existing });

    const count = await Subscription.countDocuments({ userId: req.user._id });
    if (count >= 50) return res.status(400).json({ message: 'You can follow at most 50 stocks.' });

    const companyName = String(req.body?.companyName || symbol).slice(0, 120);
    const price = Number(req.body?.price);
    const subscription = await Subscription.create({
      userId: req.user._id,
      symbol,
      companyName,
      priceAtSubscription: Number.isFinite(price) && price > 0 ? price : 0,
    });

    const user = await User.findById(req.user._id);
    if (user) notifyUser(user, 'STOCK_SUBSCRIPTION', { symbol, companyName, price: subscription.priceAtSubscription }).catch(() => {});

    res.status(201).json({ message: `Successfully subscribed to alerts for ${symbol}`, subscription });
  } catch (err) {
    if (err?.code === 11000) return res.json({ message: `Already subscribed to ${symbol}` });
    console.error('Subscription error:', err.message);
    res.status(500).json({ message: 'Server error subscribing to stock.' });
  }
});

router.delete('/subscriptions/:symbol', protect, async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ message: 'A valid stock symbol is required.' });
  try {
    const result = await Subscription.deleteOne({ userId: req.user._id, symbol });
    res.json({ message: `Unsubscribed from ${symbol}`, removed: result.deletedCount > 0 });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
