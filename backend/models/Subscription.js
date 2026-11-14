import mongoose from 'mongoose';
import crypto from 'crypto';

const subscriptionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    userId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true },
    companyName: { type: String, default: '' },
    priceAtSubscription: { type: Number, default: 0 },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false },
);

subscriptionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export default mongoose.model('Subscription', subscriptionSchema);
