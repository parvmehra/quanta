# Quanta — Agent Guidelines

Quanta is a financial analytics and paper-trading web app, developed incrementally. **Read `docs/PROJECT_AUDIT.md` (what exists, what is broken) and `docs/IMPLEMENTATION_PLAN.md` (phases, decisions) before changing code.** Do not rewrite from scratch; preserve working features.

## Layout
- `backend/` — Express 5 (ESM) + Socket.IO on one server, default port **3001**. Money (wallet, holdings, orders, ledger) is in MongoDB via `services/tradeService.js` (see `docs/TRADING_ENGINE.md`). Users, notifications, chat and alert subscriptions are still in a JSON file (`backend/.data/data.json`, gitignored) until they are migrated.
- `frontend/` — Vite + React 19, plain CSS, react-router v7, dev server **5173**.
- `frontend/src/styles/tokens.css` — design tokens (use these, never raw hex). Legacy names (`--bg-body`, `--text-1`, `--accent`) are aliases kept for pages that have not been moved to the new tokens yet.
- `frontend/src/layouts/` — `AppShell` (sidebar + top bar + index strip, used by app pages) and `PublicLayout` (landing/login/signup/about).
- `frontend/src/components/ui/ui.jsx` — shared primitives (`ChangeValue`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState`).

## Commands
```
cd backend  && npm install && npm run dev     # needs backend/.env with JWT_SECRET (see .env.example)
cd frontend && npm install && npm run dev
cd frontend && npm run lint && node --test src/utils/*.test.js
cd backend  && npm test
```

## Rules
- Never print, log or commit secrets. `.env*` (except `.env.example`), `serviceAccount*.json`, `backend/.data/`, `backend/data.json` are gitignored.
- Do not show random/simulated numbers as real market data. Label demo data explicitly.
- Money/trade logic is server-authoritative. Never trust client-supplied prices, balances or user ids; change trading rules only in `tradeService.js` and keep `docs/TRADING_ENGINE.md` and the engine tests in step.
- Sidebar entries only for routes that exist; no placeholder pages.
- Commits are authored by the repository owner only; do not add co-author trailers.
