import express from 'express';
import { searchStocks, getStockQuote, getStockNews, getStockHistory, clearCache, getMarketPulse, getBatchQuotes, getStockAdvisorResponse } from '../controllers/stockControllers.js';
import { getChart, getFundamentals } from '../controllers/stockDataController.js';
import rateLimit from 'express-rate-limit';
import { protect } from '../middlewares/auth.js';
import { store, saveStore } from '../dataStore.js';
import { notifyUser } from '../services/notificationService.js';
import crypto from 'crypto';

const router = express.Router();

router.get('/search', searchStocks);
router.get('/quotes', getBatchQuotes);
router.get('/quote/:symbol', getStockQuote);
router.get('/news/:symbol', getStockNews);
router.get('/history/:symbol', getStockHistory);

const dataLimiter = rateLimit({ windowMs: 60 * 1000, max: 90, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } });
router.get('/chart/:symbol', dataLimiter, getChart);
router.get('/fundamentals/:symbol', dataLimiter, getFundamentals);
router.get('/market-pulse', getMarketPulse);
router.post('/advisor', getStockAdvisorResponse);
router.post('/cache/clear', clearCache);

router.get('/subscriptions', protect, (req, res) => {
  try {
    if (!store.subscriptions) store.subscriptions = [];
    const userSubs = store.subscriptions.filter(s => s.userId === req.user._id);
    res.json(userSubs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/subscriptions', protect, async (req, res) => {
  const { symbol, companyName, price } = req.body;

  if (!symbol) {
    return res.status(400).json({ message: 'Stock symbol is required.' });
  }

  try {
    if (!store.subscriptions) store.subscriptions = [];
    const symUpper = symbol.trim().toUpperCase();

    let existing = store.subscriptions.find(s => s.userId === req.user._id && s.symbol === symUpper);
    if (existing) {
      return res.json({ message: `Already subscribed to ${symUpper}`, subscription: existing });
    }

    const newSub = {
      _id: crypto.randomUUID(),
      userId: req.user._id,
      symbol: symUpper,
      companyName: companyName || symUpper,
      priceAtSubscription: Number(price) || 0,
      createdAt: Date.now(),
    };

    store.subscriptions.push(newSub);
    saveStore();

    const fullUser = store.users.find(u => u._id === req.user._id);
    if (fullUser) {
      notifyUser(fullUser, 'STOCK_SUBSCRIPTION', {
        symbol: symUpper,
        companyName: companyName || symUpper,
        price: Number(price) || 0,
      });
    }

    res.status(201).json({
      message: `Successfully subscribed to alerts for ${symUpper}`,
      subscription: newSub,
    });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Server error subscribing to stock.' });
  }
});

router.delete('/subscriptions/:symbol', protect, (req, res) => {
  const symUpper = req.params.symbol.trim().toUpperCase();

  try {
    if (!store.subscriptions) store.subscriptions = [];
    const initialLen = store.subscriptions.length;
    store.subscriptions = store.subscriptions.filter(
      s => !(s.userId === req.user._id && s.symbol === symUpper)
    );

    saveStore();

    res.json({
      message: `Unsubscribed from ${symUpper}`,
      removed: store.subscriptions.length < initialLen,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
