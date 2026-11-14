import express from 'express';
import { searchStocks, getStockQuote, getStockNews, getStockHistory, clearCache, getMarketPulse, getBatchQuotes, getStockAdvisorResponse } from '../controllers/stockControllers.js';
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
router.get('/market-pulse', getMarketPulse);
router.post('/advisor', getStockAdvisorResponse);
router.post('/cache/clear', clearCache);

// ── Stock Subscriptions Endpoints ──────────────────────────────────────────

// GET User's Subscribed Stocks
router.get('/subscriptions', protect, (req, res) => {
  try {
    if (!store.subscriptions) store.subscriptions = [];
    const userSubs = store.subscriptions.filter(s => s.userId === req.user._id);
    res.json(userSubs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST Subscribe to Stock Alerts
router.post('/subscriptions', protect, async (req, res) => {
  const { symbol, companyName, price } = req.body;

  if (!symbol) {
    return res.status(400).json({ message: 'Stock symbol is required.' });
  }

  try {
    if (!store.subscriptions) store.subscriptions = [];
    const symUpper = symbol.trim().toUpperCase();

    // Check if already subscribed
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

    // Trigger Email & SMS notification to the user
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

// DELETE Unsubscribe from Stock Alerts
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
