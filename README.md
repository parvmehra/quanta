# Quanta

Financial analytics and paper-trading platform: explore markets, research stocks, manage a portfolio and simulate trades. Trades are **simulated** — no real orders are placed and no payment gateway is used.

Project notes: `docs/PROJECT_AUDIT.md` (current state and known issues) and `docs/IMPLEMENTATION_PLAN.md` (roadmap).

## Stack
React 19 · Vite · React Router · Recharts · Lightweight Charts · Express 5 · Socket.IO · Yahoo Finance (`yahoo-finance2`).

## Run locally
```bash
# Terminal 1
cd backend
cp .env.example .env        # then set JWT_SECRET (command is in the file)
npm install
npm run dev                 # http://localhost:3001

# Terminal 2
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```
Required: `JWT_SECRET`. Needed for trading, wallet and portfolio: `MONGO_DB_URI` (a MongoDB Atlas free cluster works; it must be a replica set because orders use transactions). Without it the rest of the app still runs and those pages show an unavailable message. Email, SMS, AI (Gemini), Google sign-in and extra market-data keys are optional; without them those features run in simulated/offline mode.

## Tests and lint
```bash
cd frontend && npm run lint && node --test src/utils/*.test.js
cd backend && npm test      # trading engine tests; use a dedicated database and MONGO_DB_URI in backend/.env
```

Trading rules and the API are described in `docs/TRADING_ENGINE.md`.
