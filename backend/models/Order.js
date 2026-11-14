import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    clientOrderId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true },
    name: { type: String, default: '' },
    currency: { type: String, enum: ['USD', 'INR'], required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    type: { type: String, enum: ['MARKET', 'LIMIT', 'STOP'], required: true },
    quantity: { type: Number, required: true, min: 0 },
    limitPrice: { type: Number, default: null },
    stopPrice: { type: Number, default: null },
    status: { type: String, enum: ['OPEN', 'FILLED', 'CANCELLED', 'REJECTED'], required: true },
    rejectReason: { type: String, default: null },
    marketState: { type: String, default: null },
    fillPrice: { type: Number, default: null },
    value: { type: Number, default: null },
    fee: { type: Number, default: null },
    realizedPnl: { type: Number, default: null },
    filledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ userId: 1, clientOrderId: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, symbol: 1 });

export default mongoose.model('Order', orderSchema);
