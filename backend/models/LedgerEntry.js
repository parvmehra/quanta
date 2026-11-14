import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    kind: { type: String, enum: ['INITIAL', 'DEPOSIT', 'BUY', 'SELL', 'IMPORT'], required: true },
    currency: { type: String, enum: ['USD', 'INR'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    symbol: { type: String, default: null },
    quantity: { type: Number, default: null },
    price: { type: Number, default: null },
    fee: { type: Number, default: null },
    realizedPnl: { type: Number, default: null },
    note: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

ledgerSchema.index({ userId: 1, createdAt: -1 });
ledgerSchema.index({ userId: 1, kind: 1, createdAt: -1 });

export default mongoose.model('LedgerEntry', ledgerSchema);
