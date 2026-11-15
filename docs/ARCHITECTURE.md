# Architecture

How Quanta is put together and why. For trading rules see `TRADING_ENGINE.md`; for the history of decisions see `IMPLEMENTATION_PLAN.md`.

## Overview

```
Browser (React SPA, Vite)
   │  HTTPS JSON           │  Socket.IO (live prices)
   ▼                       ▼
Express 5 server (backend/index.js, one process, port 3001)
   ├─ routes → controllers/services
   ├─ Yahoo Finance (yahoo-finance2)      market data, no key
   ├─ MongoDB Atlas (Mongoose)            accounts, money, orders, watchlists
   └─ optional: Gemini, SMTP/Gmail, Twilio, Firebase Admin, Finnhub
```

One long-running Node process serves the API and the sockets. It needs a MongoDB replica set (Atlas free tier works) because orders use multi-document transactions. Without a database the process still starts: market-data pages work, account and trading routes answer `503 DB_UNAVAILABLE`.

## Backend (`backend/`)

| Area | Files | Notes |
|---|---|---|
| Entry | `index.js` | Helmet, CORS allow-list, 100 kb JSON limit, request logging, route mounting, Socket.IO, 15 s price poller, 20 s order matcher, error handler, graceful shutdown. |
| Config | `config/env.js`, `connectDB.js`, `firebase.js` | Refuses to start without a strong `JWT_SECRET`. Database connection is non-fatal. |
| Auth | `routes/authRoutes.js`, `middlewares/auth.js` | bcrypt passwords, JWT, two-step login with emailed one-time codes (hashed, single use, attempt-capped), rate limits. Each user has a `tokenVersion`; changing or resetting a password bumps it and every older token stops working. |
| Market data | `routes/stockRoutes.js`, `controllers/stockDataController.js`, `services/yahoo.js` | Quotes, search, charts, fundamentals, news, sparklines, market overview and movers. Short in-memory caches. Failures return 503, never invented data. |
| Trading | `routes/tradingRoutes.js`, `walletRoutes.js`, `services/tradeService.js` | The only code that changes money. See `TRADING_ENGINE.md`. |
| Watchlists | `routes/watchlistRoutes.js`, `models/Watchlist.js` | Up to 10 lists of 100 symbols per user, one protected default list, one-time import of the old browser list. |
| AI Advisor | `routes/advisorRoutes.js`, `services/advisorService.js` | The server collects every figure itself (quote, indicators from daily closes, fundamentals, headlines). The model receives only those facts and must return structured JSON; otherwise a rule-based summary built from the same facts is returned. |
| Notifications | `services/notificationService.js`, `emailService.js`, `smsService.js`, `utils/logSafe.js` | Email and SMS go through real providers when configured and are simulated otherwise. Sensitive messages are logged by title only, so codes and reset links never reach the database log. |
| Utilities | `utils/logger.js`, `codes.js`, `indicators.js` | Structured logger (readable in development, one JSON object per line when `NODE_ENV=production`), secure code generation, SMA/EMA/RSI/Bollinger/MACD. |

### Data model (MongoDB)

`User`, `Wallet` (balances per currency in integer minor units), `Holding`, `Order`, `LedgerEntry` (append-only; the sum of entries equals the wallet balance), `Watchlist`, `Subscription` (price alerts), `NotificationLog`.

### Live prices

Clients emit `subscribe` / `unsubscribe` for a symbol. A single poller asks Yahoo for all subscribed symbols every 15 seconds (at most 50 symbols, at most 20 per socket) and emits `priceUpdate` only when the price or volume changed. Sockets read the JWT from the handshake; anonymous sockets can follow public price rooms only.

### Order matcher

Every 20 seconds, if the database is ready, resting limit and stop orders are checked against live prices and filled inside a transaction. A running pass is allowed to finish during shutdown.

### Security notes

- Every money route requires a valid token and is scoped to the caller's own user id; prices, balances and ids are never taken from the client.
- Orders carry a client order id, so a retried request cannot fill twice.
- Rate limits cover sign-in, one-time code checks, password change, order placement and the market-data and advisor endpoints. They are in memory, so they reset when the server restarts.
- Errors returned to clients never include stack traces or parser messages.

## Frontend (`frontend/src/`)

- `App.jsx`: routes, lazy-loaded pages, providers. Two layouts: `layouts/PublicLayout` (landing, about, sign-in, sign-up) and `layouts/AppShell` (sidebar, top bar with search, notifications and account menu, index ticker).
- `pages/`: Dashboard, Market Overview, Stock Explorer, Stock Details, Trading Terminal, Portfolio, Orders, Wallet, AI Advisor, Watchlist, Profile, Settings, Notifications, FAQ, About, Home, Login, Signup.
- `components/ui/`: shared primitives (`ChangeValue`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `Tabs`) and `DataTable`. `components/` also holds the chart, order ticket, import dialog, symbol search and similar building blocks.
- `hooks/`: `useFetch` (loading, error, retry), `useQuotes` (batched quotes with polling), `useLiveQuote` (socket price with polling fallback).
- `contexts/`: auth, notifications, theme, watchlist.
- `utils/`: currency formatting (₹ for `.NS` and `.BO`, $ otherwise), portfolio maths, broker CSV parsing, indicators, market hours. Pure helpers have unit tests.
- Styling: plain CSS driven by design tokens in `styles/tokens.css`; shared page and stock styles in `styles/workspace.css` and `styles/stock.css`. Text and surface colours meet WCAG AA contrast.

### Conventions

- Missing data renders as "—", never zero.
- The UI never calculates money that the server owns; it shows what the server returned.
- Every data view has loading, empty and error states.

## Testing

| Suite | Command | Covers |
|---|---|---|
| Backend | `cd backend && npm test` | Trade engine, API security and accounts, watchlists, advisor. Uses `MONGO_DB_URI` from `backend/.env` and removes its own data. |
| Frontend units | `cd frontend && node --test src/utils/*.test.js` | Portfolio maths, broker CSV, indicators. |
| Lint | `cd frontend && npm run lint` | Zero warnings. |
| Browser | not in the repository | Page flows were exercised with a headless browser during development, including an automated accessibility scan (axe, WCAG A and AA) of every page. |

## Known limits

- Market data is from an unofficial Yahoo Finance interface and can be delayed or briefly unavailable.
- The order matcher and live-price poller run inside the web process, so the server needs to be long-running (not serverless) and runs one instance.
- Firebase is used only for Google sign-in. `npm audit` reports advisories in its Firestore/gRPC dependencies, which the app never loads.
- No account deletion and no CI workflow yet. Deployment steps are in `DEPLOYMENT.md`.
