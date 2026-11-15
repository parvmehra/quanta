import mongoose from 'mongoose';
import crypto from 'crypto';

const watchlistSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    nameKey: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    symbols: { type: [String], default: [] },
  },
  { timestamps: true },
);

watchlistSchema.index({ userId: 1, nameKey: 1 }, { unique: true });
watchlistSchema.index({ userId: 1, createdAt: 1 });

export default mongoose.model('Watchlist', watchlistSchema);
