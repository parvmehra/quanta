import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middlewares/auth.js';
import { AdvisorError, chat, getFacts } from '../services/advisorService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

const perUser = (max, message) => rateLimit({
  windowMs: 60 * 1000,
  max,
  keyGenerator: (req) => req.user?._id || req.ip,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message },
});

const fail = (res, err) => {
  if (err instanceof AdvisorError) return res.status(err.status).json({ code: err.code, message: err.message });
  log.error('Advisor route error:', err.message);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'The advisor is unavailable right now. Please try again.' });
};

router.post('/chat', protect, perUser(15, 'Too many questions. Please wait a moment.'), async (req, res) => {
  try {
    res.json(await chat(req.body || {}));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/context/:symbol', protect, perUser(40, 'Too many requests. Please wait a moment.'), async (req, res) => {
  try {
    res.json(await getFacts(req.params.symbol));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
