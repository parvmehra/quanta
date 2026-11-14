import express from 'express';
import LedgerEntry from '../models/LedgerEntry.js';
import { protect } from '../middlewares/auth.js';
import { requireDb } from '../middlewares/requireDb.js';
import User from '../models/User.js';
import { notifyUser } from '../services/notificationService.js';
import { TradeError, getBalances, deposit, serializeEntry, DEPOSIT_MAX, DEPOSIT_DAILY_CAP } from '../services/tradeService.js';

const router = express.Router();
router.use(protect, requireDb);

const fail = (res, err) => {
  if (err instanceof TradeError) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error('Wallet route error:', err.message);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
};

router.get('/', async (req, res) => {
  try {
    const balances = await getBalances(req.user._id);
    const entries = await LedgerEntry.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
    res.json({
      wallet: { balances, balance: balances.USD, currency: 'USD' },
      limits: { depositMax: DEPOSIT_MAX, depositDailyCap: DEPOSIT_DAILY_CAP },
      transactions: entries.map(serializeEntry),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/topup', async (req, res) => {
  try {
    const entry = await deposit(req.user._id, req.body?.currency || 'USD', req.body?.amount);
    const balances = await getBalances(req.user._id);
    res.status(201).json({
      message: 'Simulated deposit added.',
      wallet: { balances, balance: balances.USD, currency: 'USD' },
      transaction: serializeEntry(entry),
    });
    const user = await User.findById(req.user._id);
    if (user) {
      notifyUser(user, 'WALLET_TOPUP', {
        amount: entry.amount / 100, newBalance: entry.balanceAfter / 100, method: 'Simulated deposit', referenceId: String(entry._id),
      }).catch(() => {});
    }
  } catch (err) {
    fail(res, err);
  }
});

export default router;
