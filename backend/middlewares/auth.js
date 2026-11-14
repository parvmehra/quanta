import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { isDbReady } from '../config/connectDB.js';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Token failed' });
  }

  if (!isDbReady()) return res.status(503).json({ code: 'DB_UNAVAILABLE', message: 'The database is not available right now.' });

  try {
    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user) return res.status(401).json({ message: 'Token failed' });
    req.user = user;
    next();
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Not authorized' });
  next();
};
