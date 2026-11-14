import mongoose from "mongoose";

const portfolioSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    symbol: { type: String, required: true, uppercase: true },
    name: { type: String, default: "" },
    shares: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    currentPrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

portfolioSchema.virtual("totalValue").get(function() {
  return this.shares * this.currentPrice;
});
portfolioSchema.virtual("gainLoss").get(function() {
  return this.totalValue - this.shares * this.avgPrice;
});
portfolioSchema.virtual("gainLossPercent").get(function() {
  return this.avgPrice > 0 ? (this.gainLoss / (this.shares * this.avgPrice)) * 100 : 0;
});

export default mongoose.model("Portfolio", portfolioSchema);
