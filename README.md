# Quanta

Financial analytics and paper-trading platform: explore markets, research stocks, manage a portfolio and simulate trades. Trades are **simulated** — no real orders are placed and no payment gateway is used.

> Status: redevelopment in progress. See `docs/PROJECT_AUDIT.md` and `docs/IMPLEMENTATION_PLAN.md`.

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
Only `JWT_SECRET` is required. Email, SMS, AI (Gemini), Google sign-in and extra market-data keys are optional; without them those features run in simulated/offline mode.

## Tests and lint
```bash
cd frontend && npm run lint && node --test src/utils/tradingCalculations.test.js
```
