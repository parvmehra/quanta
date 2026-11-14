import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, default: '' },
    currency: { type: String, enum: ['USD', 'INR'], required: true },
    quantity: { type: Number, required: true, min: 0 },
    avgCost: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

holdingSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export default mongoose.model('Holding', holdingSchema);
