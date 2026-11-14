import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    balances: {
      USD: { type: Number, default: 0, min: 0 },
      INR: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('Wallet', walletSchema);
