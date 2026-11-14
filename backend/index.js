import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
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

const AV_BASE = 'https://www.alphavantage.co/query';
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const RATE_LIMIT_INTERVAL_MS = 2 * 60 * 60 * 1000;

const symbolSubscribers = new Map();
let globalPollingTimer = null;
let currentPollingIndex = 0;

async function fetchAndBroadcast(symbol) {
  try {
    const response = await axios.get(AV_BASE, {
      params: { function: 'GLOBAL_QUOTE', symbol, apikey: AV_KEY },
    });

    const gq = response.data['Global Quote'];
    if (!gq || !gq['01. symbol']) {
       if (response.data.Information || response.data.Note) {
           console.log(`⚠️ Alpha Vantage Rate Limit Hit when fetching ${symbol}`);
       }
       return;
    }

    const price = parseFloat(gq['05. price']) || 0;
    const change = parseFloat(gq['09. change']) || 0;
    const changePercent = parseFloat((gq['10. change percent'] || '0').replace('%', '')) || 0;

    const payload = {
      symbol: gq['01. symbol'],
      name: gq['01. symbol'],
      price,
      change,
      changePercent,
      high: parseFloat(gq['03. high']) || 0,
      low: parseFloat(gq['04. low']) || 0,
      open: parseFloat(gq['02. open']) || 0,
      previousClose: parseFloat(gq['08. previous close']) || 0,
      volume: parseInt(gq['06. volume'], 10) || 0,
      marketCap: null,
      sharesOutstanding: null,
      timestamp: Date.now(),
    };

    io.to(symbol).emit('priceUpdate', payload);
    console.log(`📡 Broadcast ${symbol}: $${price}`);
  } catch (err) {
    console.error(`WebSocket fetch error for ${symbol}:`, err.message);
  }
}

function processPollingQueue() {
    const activeSymbols = Array.from(symbolSubscribers.keys());
    if (activeSymbols.length === 0) return;

    if (currentPollingIndex >= activeSymbols.length) {
        currentPollingIndex = 0;
    }

    const symbolToFetch = activeSymbols[currentPollingIndex];
    fetchAndBroadcast(symbolToFetch);
    currentPollingIndex++;
}

function startGlobalPolling() {
  if (globalPollingTimer) return;
  globalPollingTimer = setInterval(processPollingQueue, RATE_LIMIT_INTERVAL_MS);
  console.log(`▶️  Started global rate-limited polling (1 req / 12.5s)`);
}

function stopGlobalPolling() {
  if (globalPollingTimer) {
    clearInterval(globalPollingTimer);
    globalPollingTimer = null;
    console.log(`⏹️  Stopped global polling`);
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
    if (!symbol) return;
    const sym = symbol.toUpperCase();

    socket.join(sym);

    if (!symbolSubscribers.has(sym)) {
      symbolSubscribers.set(sym, new Set());
      setTimeout(() => fetchAndBroadcast(sym), 1000); 
    }
    symbolSubscribers.get(sym).add(socket.id);

    startGlobalPolling();
    console.log(`📥 ${socket.id} subscribed to ${sym} (${symbolSubscribers.get(sym).size} subscribers)`);
  });

  socket.on('unsubscribe', (symbol) => {
    if (!symbol) return;
    const sym = symbol.toUpperCase();

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

