import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { yahooFinance, VALID_SYMBOL } from './services/yahoo.js';
import stockRoutes from './routes/stockRoutes.js';
import authRoutes from './routes/authRoutes.js';
import protfolioRoutes from './routes/protfolioRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import { store, saveStore } from './dataStore.js';
import cookieParser from "cookie-parser";
import crypto from 'crypto';

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

app.use(express.json());
app.use(cookieParser());

app.use('/api/stocks', stockRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/protfolio', protfolioRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/market', marketRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'quanta', time: Date.now() }));

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
    console.warn('Live price poll failed:', err.message);
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

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join_chat', (roomId) => {
    socket.join(`chat_${roomId}`);
    console.log(`💬 User joined chat room: ${roomId}`);
  });

  socket.on('join_admin', () => {
    socket.join('admin_room');
    console.log(`👑 Admin joined admin room`);
  });

  socket.on('send_message', (data) => {
    const message = {
      _id: crypto.randomUUID(),
      roomId: data.roomId,
      senderId: data.senderId,
      senderName: data.senderName,
      text: data.text,
      timestamp: data.timestamp || Date.now()
    };
    
    if (!store.messages) store.messages = [];
    store.messages.push(message);
    saveStore();

    io.to(`chat_${data.roomId}`).emit('receive_message', message);
    
    io.to('admin_room').emit('receive_message', message);
  });

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
    console.log(`📤 ${socket.id} unsubscribed from ${sym}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);

    for (const [sym, subs] of symbolSubscribers.entries()) {
      subs.delete(socket.id);
      if (subs.size === 0) {
        symbolSubscribers.delete(sym);
        if (symbolSubscribers.size === 0) stopGlobalPolling();
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 WebSocket ready for live price updates`);
});

