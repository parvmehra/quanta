import express from 'express';
import rateLimit from 'express-rate-limit';
import { getOverview, getMovers } from '../controllers/marketController.js';

const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
}));

router.get('/overview', getOverview);
router.get('/movers', getMovers);

export default router;
