import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
  headline: { type: String, required: true },
  source: { type: String, required: true },
  url: { type: String, required: true },
  summary: { type: String },
  datetime: { type: Date }
}, { _id: false });

const stockSchema = new mongoose.Schema({
  symbol: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String },
  
  price: { type: Number },
  open: { type: Number },
  high: { type: Number },
  low: { type: Number },
  previousClose: { type: Number },
  change: { type: Number },
  changePercent: { type: Number },
  
  country: { type: String },
  currency: { type: String },
  exchange: { type: String },
  industry: { type: String },
  ipo: { type: String },
  marketCap: { type: Number },
  phone: { type: String },
  weburl: { type: String },
  logo: { type: String },
  
  news: [newsSchema],
}, { timestamps: true });

const Stock = mongoose.model('Stock', stockSchema);

export default Stock;
