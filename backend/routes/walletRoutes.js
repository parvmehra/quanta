import express from 'express';
import crypto from 'crypto';
import { protect } from '../middlewares/auth.js';
import { store, saveStore } from '../dataStore.js';
import { notifyUser } from '../services/notificationService.js';

const router = express.Router();

router.get('/', protect, (req, res) => {
  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.wallet) {
      user.wallet = { balance: 500000, currency: 'USD' };
      saveStore();
    }

    if (!store.walletTransactions) store.walletTransactions = [];
    const transactions = store.walletTransactions
      .filter(tx => tx.userId === req.user._id)
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      wallet: user.wallet,
      transactions,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/topup', protect, async (req, res) => {
  const { amount, paymentMethod, paymentId } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ message: 'Top-up amount must be greater than zero.' });
  }

  if (numAmount > 10000000) {
    return res.status(400).json({ message: 'Maximum single deposit limit is $10,000,000.' });
  }

  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.wallet) user.wallet = { balance: 500000, currency: 'USD' };

    const referenceId = paymentId || `pay_rzp_${crypto.randomUUID().slice(0, 10)}`;
    const newBalance = Number((user.wallet.balance + numAmount).toFixed(2));
    user.wallet.balance = newBalance;

    if (!store.walletTransactions) store.walletTransactions = [];
    const transaction = {
      _id: crypto.randomUUID(),
      userId: user._id,
      type: 'TOPUP',
      amount: numAmount,
      balanceAfter: newBalance,
      referenceId,
      paymentMethod: paymentMethod || 'Razorpay Instant',
      status: 'COMPLETED',
      description: `Wallet margin deposit via ${paymentMethod || 'Razorpay Checkout'}`,
      createdAt: Date.now(),
    };

    store.walletTransactions.push(transaction);
    saveStore();

    await notifyUser(user, 'WALLET_TOPUP', {
      amount: numAmount,
      newBalance,
      method: paymentMethod || 'Razorpay Checkout',
      referenceId,
    });

    res.status(201).json({
      message: `Wallet successfully credited with +$${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      wallet: user.wallet,
      transaction,
    });
  } catch (err) {
    console.error('Wallet topup error:', err);
    res.status(500).json({ message: 'Server error processing wallet deposit.' });
  }
});

export default router;
