# Quanta

Financial analytics and paper-trading platform. Explore US and Indian markets, research stocks, follow watchlists, manage a simulated portfolio and practise placing orders against live prices.

Everything is **simulated**: no real orders are placed, there is no broker connection and no payment gateway. Prices come from Yahoo Finance and can be delayed.

## Features

- **Research**: market overview, stock explorer, charts with indicators, fundamentals and news.
- **Paper trading**: market, limit and stop orders with a flat 0.03% fee, separate USD and INR wallets, an append-only transaction history.
- **Portfolio**: holdings, average cost, realised and unrealised profit, CSV import from Zerodha, Groww, Angel One and Upstox.
- **Watchlists**: up to 10 lists saved to your account, with price, day change and a one-month trend.
- **AI Advisor**: research notes written from live figures the server gathers; never a buy or sell call. Works without an API key through a rule-based summary.
- **Accounts**: email and password with a one-time code, profile and settings, price alerts, password change that signs out other sessions.

## Stack

React 19, Vite, React Router, Recharts, Lightweight Charts, Express 5, Socket.IO, MongoDB (Mongoose), `yahoo-finance2`. Plain CSS with design tokens.

## Run locally

Requirements: Node 20.19 or newer (needed by Vite 7) and a MongoDB Atlas free cluster (a replica set is required for order transactions).

```bash
# Terminal 1: API on http://localhost:3001
cd backend
cp .env.example .env        # set JWT_SECRET and MONGO_DB_URI (generation command is in the file)
npm install
npm run dev

# Terminal 2: app on http://localhost:5173
cd frontend
cp .env.example .env
npm install
npm run dev
```

On Windows, `start.bat` opens both servers in separate windows.

Without `MONGO_DB_URI`, public market pages still work and account, wallet, trading and portfolio features report that the database is unavailable. Email, SMS, Gemini, Google sign-in and extra market-data keys are optional; without them those features run in simulated or offline mode (sign-in codes are then returned in development so you can still log in).

## Tests

```bash
cd backend  && npm test                                   # engine, security, accounts, watchlists, advisor
cd frontend && npm run lint && node --test src/utils/*.test.js
```

The backend tests use `MONGO_DB_URI` from `backend/.env` and remove the data they create.

## Documentation

- `docs/ARCHITECTURE.md`: how the pieces fit together.
- `docs/DEPLOYMENT.md`: deploying to Render and MongoDB Atlas (`render.yaml` at the repository root).
- `docs/TRADING_ENGINE.md`: money rules, order lifecycle and the API.
- `docs/IMPLEMENTATION_PLAN.md`: decisions and progress log.
- `docs/PROJECT_AUDIT.md`: the original audit of the codebase.

## Limits

Single server instance with in-process live-price polling and order matching; not suited to serverless hosting. No account deletion or CI workflow yet.
