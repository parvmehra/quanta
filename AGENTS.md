# Quanta — Agent Guidelines

Quanta is a financial analytics and paper-trading web app, developed incrementally. **Read `docs/PROJECT_AUDIT.md` (what exists, what is broken) and `docs/IMPLEMENTATION_PLAN.md` (phases, decisions) before changing code.** Do not rewrite from scratch; preserve working features.

## Layout
- `backend/` — Express 5 (ESM) + Socket.IO on one server, default port **3001**. Persistence is currently a JSON file (`backend/.data/data.json`, gitignored); MongoDB migration is planned (Phase 6A).
- `frontend/` — Vite + React 19, plain CSS, react-router v7, dev server **5173**.
- `frontend/src/styles/tokens.css` — design tokens (use these, never raw hex). Legacy names (`--bg-body`, `--text-1`, `--accent`) are aliases kept for pages that have not been moved to the new tokens yet.
- `frontend/src/layouts/` — `AppShell` (sidebar + top bar + index strip, used by app pages) and `PublicLayout` (landing/login/signup/about).
- `frontend/src/components/ui/ui.jsx` — shared primitives (`ChangeValue`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState`).

## Commands
```
cd backend  && npm install && npm run dev     # needs backend/.env with JWT_SECRET (see .env.example)
cd frontend && npm install && npm run dev
cd frontend && npm run lint && node --test src/utils/tradingCalculations.test.js
```

## Rules
- Never print, log or commit secrets. `.env*` (except `.env.example`), `serviceAccount*.json`, `backend/.data/`, `backend/data.json` are gitignored.
- Do not show random/simulated numbers as real market data. Label demo data explicitly.
- Money/trade logic must be server-authoritative (see audit S1–S3). Do not extend the client-side trading logic.
- Sidebar entries only for routes that exist; no placeholder pages.
- Commits are authored by the repository owner only; do not add co-author trailers.
