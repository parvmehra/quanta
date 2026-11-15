import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { yahooFinance, VALID_SYMBOL } from './services/yahoo.js';
import stockRoutes from './routes/stockRoutes.js';
import authRoutes from './routes/authRoutes.js';
import tradingRoutes from './routes/tradingRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import advisorRoutes from './routes/advisorRoutes.js';
import watchlistRoutes from './routes/watchlistRoutes.js';
import connectDB, { isDbReady } from './config/connectDB.js';
import { runMatcher } from './services/tradeService.js';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { log } from './utils/logger.js';
import { JWT_SECRET } from './config/env.js';

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const io = new SocketIO(server, {
  cors: {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    const line = `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) log.error(line);
    else if (res.statusCode >= 400 && res.statusCode !== 404) log.warn(line);
    else if (ms > 2000) log.warn(`slow ${line}`);
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/stocks', stockRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', tradingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/advisor', advisorRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'quanta', time: Date.now() }));
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }));

app.use((err, req, res, _next) => {
  const status = Number(err.status || err.statusCode) || 500;
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON in the request body.' });
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ message: 'Origin not allowed.' });
  if (status >= 500) log.error(`Unhandled error on ${req.method} ${req.originalUrl.split('?')[0]}: ${err.message}`);
  if (res.headersSent) return undefined;
  return res.status(status).json({ message: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
});

const POLL_INTERVAL_MS = 15 * 1000;
const MAX_SYMBOLS_PER_POLL = 50;
const MAX_SUBSCRIPTIONS_PER_SOCKET = 20;

const symbolSubscribers = new Map();
const lastSent = new Map();
let globalPollingTimer = null;
let polling = false;

async function pollOnce() {
  if (polling) return;
  const symbols = Array.from(symbolSubscribers.keys()).slice(0, MAX_SYMBOLS_PER_POLL);
  if (symbols.length === 0) return;
  polling = true;
  try {
    const result = await yahooFinance.quote(symbols, {}, { validateResult: false });
    for (const q of Array.isArray(result) ? result : [result]) {
      if (!q || !q.symbol || !(q.regularMarketPrice > 0)) continue;
      const fingerprint = q.regularMarketPrice + ':' + (q.regularMarketVolume || 0);
      if (lastSent.get(q.symbol) === fingerprint) continue;
      lastSent.set(q.symbol, fingerprint);
      io.to(q.symbol).emit('priceUpdate', {
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        high: q.regularMarketDayHigh ?? null,
        low: q.regularMarketDayLow ?? null,
        open: q.regularMarketOpen ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        volume: q.regularMarketVolume ?? null,
        marketState: q.marketState ?? null,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    log.warn('Live price poll failed:', err.message);
  } finally {
    polling = false;
  }
}

function startGlobalPolling() {
  if (globalPollingTimer) return;
  globalPollingTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

function stopGlobalPolling() {
  if (globalPollingTimer) {
    clearInterval(globalPollingTimer);
    globalPollingTimer = null;
    lastSent.clear();
  }
}

io.use(async (socket, next) => {
  socket.data.user = null;
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('name role').lean();
    if (user) socket.data.user = { id: user._id, name: user.name, role: user.role };
  } catch {
    socket.data.user = null;
  }
  next();
});

io.on('connection', (socket) => {
  socket.on('subscribe', (symbol) => {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!VALID_SYMBOL.test(sym)) return;

    const joined = Array.from(socket.rooms).filter((r) => symbolSubscribers.has(r)).length;
    if (!socket.rooms.has(sym) && joined >= MAX_SUBSCRIPTIONS_PER_SOCKET) return;

    socket.join(sym);
    if (!symbolSubscribers.has(sym)) {
      symbolSubscribers.set(sym, new Set());
      setTimeout(pollOnce, 500);
    }
    symbolSubscribers.get(sym).add(socket.id);
    startGlobalPolling();
  });

  socket.on('unsubscribe', (symbol) => {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym) return;

    socket.leave(sym);

    const subs = symbolSubscribers.get(sym);
    if (subs) {
      subs.delete(socket.id);
      if (subs.size === 0) {
        symbolSubscribers.delete(sym);
        if (symbolSubscribers.size === 0) stopGlobalPolling();
      }
    }
  });

  socket.on('disconnect', () => {
    for (const [sym, subs] of symbolSubscribers.entries()) {
      subs.delete(socket.id);
      if (subs.size === 0) {
        symbolSubscribers.delete(sym);
        if (symbolSubscribers.size === 0) stopGlobalPolling();
      }
    }
  });
});

const MATCHER_INTERVAL_MS = 20 * 1000;
let matching = false;
let matcherTimer = null;
function startMatcher() {
  matcherTimer = setInterval(async () => {
    if (matching || !isDbReady()) return;
    matching = true;
    try {
      const { filled } = await runMatcher();
      if (filled > 0) log.info(`Order matcher filled ${filled} order(s)`);
    } catch (err) {
      log.error('Order matcher error:', err.message);
    } finally {
      matching = false;
    }
  }, MATCHER_INTERVAL_MS);
  matcherTimer.unref();
}

connectDB().then((ok) => { if (ok) startMatcher(); });

const PORT = process.env.PORT || 3001;
server.on('error', (err) => {
  log.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other process or set PORT.` : `Server error: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, () => log.info(`Quanta API listening on port ${PORT}`));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received, shutting down`);
  const force = setTimeout(() => { log.error('Shutdown timed out, exiting'); process.exit(1); }, 10000);
  force.unref();
  stopGlobalPolling();
  if (matcherTimer) clearInterval(matcherTimer);
  const waitStart = Date.now();
  while (matching && Date.now() - waitStart < 5000) await new Promise((r) => setTimeout(r, 100));
  await new Promise((resolve) => io.close(resolve));
  server.closeAllConnections?.();
  await mongoose.disconnect().catch(() => {});
  log.info('Shutdown complete');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason instanceof Error ? reason.message : String(reason)));
process.on('uncaughtException', (err) => { log.error('Uncaught exception:', err.message); process.exit(1); });
