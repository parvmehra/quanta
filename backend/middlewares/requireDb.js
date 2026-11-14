import { isDbReady } from '../config/connectDB.js';

export const requireDb = (_req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({ code: 'DB_UNAVAILABLE', message: 'The database is not available right now.' });
  }
  next();
};
