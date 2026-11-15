import mongoose from 'mongoose';
import { log } from '../utils/logger.js';

const redact = (message, uri) => String(message).split(uri).join('<uri>').replace(/\/\/[^@\s/]+@/g, '//<credentials>@');

export const isDbReady = () => mongoose.connection.readyState === 1;

export default async function connectDB() {
  const uri = (process.env.MONGO_DB_URI || '').trim();
  if (!uri) {
    log.warn('MONGO_DB_URI is not set: wallet, orders and portfolio features are disabled.');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    log.info(`MongoDB connected (database: ${mongoose.connection.name})`);
    return true;
  } catch (err) {
    log.error('MongoDB connection failed:', redact(err.message, uri));
    return false;
  }
}
