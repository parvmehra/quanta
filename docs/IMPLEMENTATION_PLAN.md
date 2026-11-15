# Quanta — Implementation Plan

Companion to `PROJECT_AUDIT.md`. Nothing below has started. **Phase 1+ begins only after the owner approves this plan and answers the decisions in §2.**

Principles: no rewrite; app stays runnable (`backend: npm run dev`, `frontend: npm run dev`) at the end of every phase; every phase ends with a baseline commit/tag, a test run and a short report.

---

## 1. Key finding that changes the order of work

The initial phase order puts the backend work (Phase 6) last. The audit shows the trading and wallet flows are **client-authoritative** (S1, S3) and the data store is a tracked JSON file (S2). Building the Trading Terminal and Portfolio screens (Phase 4) on top of that would polish an insecure, non-functional core, and it would force a second UI rewrite when the API contract changes.

**Proposed adjustment:** keep the original phases, but split Phase 6 into a small **Phase 1B (security hygiene + trade API contract)** executed right after the design foundation, and keep the large MongoDB migration in its original place but **before** the Phase 4 UI work that depends on it. Details below.

## 2. Decisions requested (blocking where marked)

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Tailwind.** Tailwind was considered; the project uses vanilla CSS and has no Tailwind. | Do **not** add Tailwind. Build the design system with CSS custom properties (`tokens.css`) plus a small set of shared component classes. Fewer dependencies, no build-config change, lowest regression risk with 6 existing CSS files. Reconsider only if you specifically want Tailwind for the portfolio story. **Blocking for Phase 1.** |
| D2 | **Git history contains `backend/data.json` (user records/password hashes).** | Untrack it now and add to `.gitignore`. Rewriting history (`git filter-repo`) is destructive and only matters if this repo is, or has been, pushed anywhere public; tell me whether it has. |
| D3 | **Credential rotation.** `backend/.env` and a Google service-account key sit in the working tree. | You rotate: Mongo user, Gmail app password, Twilio token, Gemini/Finnhub keys, Firebase key. I will not read, print or move them. |
| D4 | **MongoDB.** Is there an Atlas cluster (M0 free tier is a replica set, so multi-document transactions work)? Is the existing `MONGO_DB_URI` a cluster you want to use? | Use Atlas M0; verify transaction support at startup and refuse to run trading in "unsafe" mode. |
| D5 | **Existing JSON data.** ~25 user records (likely test/real mixed). | One-off import script for users and holdings; wallet balances re-based. Or start clean — your call. |
| D6 | **Mandatory email-OTP on every login.** Currently every sign-in requires an e-mailed code. | Keep (it's a feature) but make it opt-in per user and keep it working in demo mode. Ask if you want it left as-is. |
| D7 | **Market segment.** Existing code mixes US (`$`) and NSE/BSE (`₹`) symbols; wallet is USD only. | Keep both exchanges, wallet stays USD, show per-symbol currency, no FX conversion (documented). Alternatively add a simple wallet-currency note. |
| D8 | **Order types.** Today MARKET/LIMIT/SL all fill instantly. | Implement real semantics: MARKET fills immediately; LIMIT and SL (stop) rest as OPEN orders and are evaluated by a small in-process check on each quote refresh (no workers, no Redis). MIS/CNC product types and their 20% margin: **keep or drop?** I recommend dropping MIS leverage (a paper-trading simplification) unless you rely on it. |
| D9 | **Support chat.** Not in the original feature list. | Keep, but require auth for sockets, restrict `join_admin` to `role==='admin'`, move to Mongo. |
| D10 | **Naming.** `protfolio` typo is in URLs. | Add `/api/portfolio` as the canonical route; keep `/api/protfolio` as an alias until the frontend is migrated, then remove (documented). |

## 3. Phases

### Phase 0 — Audit ✅ (this deliverable)
Output: `docs/PROJECT_AUDIT.md`, `docs/IMPLEMENTATION_PLAN.md`.
Not yet done and needed for runtime confirmation: start both servers, exercise each flow, capture console errors. Moved to **Phase 1 step 0**.

### Phase 1 — Baseline, hygiene, foundation (design system)

**1.0 Baseline and hygiene** (small, reversible)
- Commit the current uncommitted work as `baseline: pre-quanta state` (excluding `.env*`, key files, `.data/`, `data.json`). Tag it.
- `git rm --cached backend/data.json`; extend `.gitignore` (`.data/`, `data.json`, `serviceAccount*`, `*.log`, `cookies.txt`). Move live data out of the tree to a gitignored location, copy kept locally.
- Fix `.env.example` for both apps (names only; add `GMAIL_*`, `ALPHA_VANTAGE`, `DEMO_MODE`, `JWT_SECRET` required; remove unused Razorpay/TwelveData).
- Make the server **fail fast** if `JWT_SECRET` is missing or equals the old fallback.
- Run both servers and record a **runtime smoke-test matrix** (each route loads, login works, quote/history/news/market-pulse respond, console errors) appended to the audit as §14.
- Reconcile ports (`3001` everywhere) and rewrite `AGENTS.md`/`.agents/rules` to match reality.

**1.1 Design system** (frontend only)
- `frontend/src/styles/tokens.css`: colours, spacing, radii, type scale, z-index, as CSS variables, light/dark via `[data-theme]`. Existing `ThemeContext` kept.
- Inter via `@fontsource-variable/inter` (local, no Google CDN request) — *small new dependency, needs approval* — or system-font fallback if not approved.
- `layouts/AppShell.jsx`: collapsible sidebar, top bar (global search, market status, notifications, user menu), content outlet; mobile drawer.
- UI primitives only where reused ≥3 times: `Button`, `Input`, `Select`, `Tabs`, `DataTable`, `Stat`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `Modal`, `ChangeValue` (colour + sign + arrow, never colour alone).
- Utilities: consolidate number/currency/percent formatting into `utils/format.js`; keep `utils/currency.js` behaviour.
- Router: add shell, add `*` 404, keep **all existing routes**. Sidebar entries that lack a page yet link to the closest existing page or are hidden until the page exists (no placeholder pages).
- Rename strings/branding to Quanta (title, logo, emails, footer, FAQ/About copy).

*Done when:* both servers start from clean `npm install`; all 9 existing routes render inside the new shell; no new console errors; ESLint errors from the audit (49) down to 0 in touched files; baseline tag + report.

### Phase 1B — Security fixes that don't need Mongo (backend, small diffs)
- Remove JWT fallback (done in 1.0), stop returning `debugCode` except when `DEMO_MODE=true` **and** `NODE_ENV!=='production'`; use `crypto.randomInt` for codes; add limiters to `verify-email`, `reset-password`, `resend-login-otp`; make resend generic.
- Google sign-in: require a verified Firebase ID token; remove the body-trust fallback; require `email_verified`.
- Socket.IO: auth middleware (JWT from handshake), per-socket limits (≤ 20 symbol subscriptions, validated symbol format), `join_admin` only for admins, chat rooms scoped to the user's own id.
- Auth-protect `/stocks/advisor` and `/stocks/cache/clear` (admin only); rate-limit market endpoints (`express-rate-limit`, already installed).
- Add `helmet`? *(new dependency, tiny; needs approval).* Body size limit, error handler that never leaks `err.message`.
- Input validation on portfolio routes and bulk import (hand-written validators in `validators/`; no Zod/Joi unless approved).

*Done when:* manual abuse tests fail as expected (forged token, fake admin join, unauthenticated advisor, over-large body).

### Phase 6A (pulled forward) — MongoDB migration and server-side trade engine
Needed before Phases 3–5 touch trading/portfolio/wallet screens.

**Schemas (Mongoose, new files; old models replaced):**
- `User` (existing fields preserved: role, verification, lockout, notification prefs, phone), index `email` unique.
- `Wallet` embedded in User or its own doc: `balance` stored as integer cents (or Decimal128) — decision on money type documented.
- `Holding` { userId, symbol, quantity, avgCost, currency } unique `(userId, symbol)`.
- `Order` { userId, symbol, side, type MARKET|LIMIT|SL, qty, limitPrice, stopPrice, status OPEN|FILLED|CANCELLED|REJECTED, clientOrderId (unique with userId for idempotency), fillPrice, fees, timestamps }.
- `LedgerEntry` (append-only) { userId, kind TOPUP|BUY|SELL|FEE, amount, balanceAfter, orderId, ref }.
- `Subscription`, `NotificationLog`, `ChatMessage`, `Watchlist` { userId, name, symbols[] } (moves watchlists from localStorage to server, fulfilling Phase 5).

**Trade engine (`services/tradeService.js`):**
- `POST /api/orders` (auth): body = `{symbol, side, type, qty, limitPrice?, stopPrice?, clientOrderId}`. Server fetches its **own** quote (stale-guard, reject when only mock/unknown), validates qty (positive, integral for equities), computes fees server-side, then within a Mongo transaction: check balance/holdings, upsert holding with weighted-average cost, write order + ledger, debit/credit wallet. Idempotent on `clientOrderId`.
- MARKET fills immediately; LIMIT/SL stay OPEN and are evaluated on each refresh by `orderMatcher` (single in-process interval, only while OPEN orders exist, bounded batch size).
- `GET /api/orders`, `DELETE /api/orders/:id` (cancel), `GET /api/positions`, `GET /api/ledger`, `GET /api/wallet` (reads the ledger).
- `POST /api/wallet/topup` becomes a **clearly labelled simulated deposit** with a per-day cap and ledger entry; no client-supplied reference ids.
- Realised P&L computed from the ledger at sell time and stored on the SELL ledger entry; unrealised from live quote.
- If the deployment does **not** support transactions, stop and report (agreed rule); fallback proposal: single-document wallet with `$inc` guarded by `balance >= x` and holdings in the same document array. 

**Migration:** `scripts/importLegacyJson.js` reads the gitignored JSON file, hashes untouched, maps IDs, flags suspicious data. Dry-run mode.

**Compatibility:** keep `/api/protfolio` read endpoints working through the new `Holding` data during the frontend migration; remove client-side wallet in localStorage.

*Done when:* the financial test suite passes (see §4), a concurrent double-submit test leaves the balance correct, server restart preserves state, and the JSON store is no longer used by any route.

### Phase 2 — Dashboard, market overview, stock explorer
- New `Dashboard` (default post-login), `MarketOverview`, `StockExplorer` (successor of `StockAnalyzer`, keep `/analyzer` as redirect).
- Data hooks: `useQuotes(symbols)`, `useMarketPulse()`, `useHistory(symbol, range)` with request dedupe, abort on unmount, shared in-memory cache, visible **source / as-of / delayed-or-live** badges.
- Backend: add `GET /api/market/movers` (gainers/losers/most active from a Yahoo screener or a bounded default universe — to be chosen by what the provider supports; label the universe). Remove random mock data from responses; return `503 {code:'DATA_UNAVAILABLE'}` or `demo:true` payloads depending on `DEMO_MODE`.
- Replace client-side `Math.random()` "live" ticks with real socket/polled data, or no animation.
- Sparklines in tables only with real history (batch endpoint to avoid N requests).

*Done when:* every number on those pages traces to an API response; with the network offline the pages show unavailable states, not invented prices.

### Phase 3 — Stock research
- `StockDetails` → tabs Overview / Chart / Fundamentals / News; timeframe selector; volume sub-chart; Lightweight Charts for candles, Recharts for simple series.
- Backend: `GET /api/stocks/fundamentals/:symbol` using `yahooFinance.quoteSummary` modules actually available; fields missing → `null`, UI shows "—" (never 0).
- Fix the socket poller (batch Yahoo quote, ≥15 s interval, bounded symbols) so the live price header is genuine.
- Related stocks: only if the provider returns recommendations; otherwise omit.

### Phase 4 — Trading terminal and portfolio (on the new API)
- Terminal 3-column layout (watchlist/search | chart | order ticket), tabs below for Open orders / Order history / Trades / Positions, all from server endpoints.
- Remove local wallet/trade state; show "Simulated — not a real exchange order" in the ticket and confirmation.
- Portfolio: totals, invested, current value, realised/unrealised P&L, allocation (Recharts donut), sector allocation only if `quoteSummary` provides sector, holdings table, ledger-backed history, CSV import wired to a validated bulk endpoint that creates holdings plus an `IMPORT` ledger entry (no wallet debit; documented).
- Replace inline math with shared `utils/` functions (also used by tests).
- Wallet page: balance, ledger table, simulated top-up.

### Phase 5 — Supporting functionality
- Watchlists on the server (multiple lists, add/remove, sort, search); migrate existing localStorage list on first load.
- AI Advisor page: reuse `geminiAdvisorService`; conversation UI, suggested prompts, stock context, "AI-generated, not investment advice" label, key in a header (not in the URL), works without key via the existing rule-based fallback and says so.
- Notifications centre page (reads `notificationLogs` + in-app events), Settings page (notification prefs, theme, DEMO info), Profile (name/password change via authenticated endpoints), FAQ/About refreshed to match reality.
- Support chat restyle.

### Phase 6B — Remaining backend hardening
Structured logging (no PII/codes), centralised error handler, config validation at boot (zod-free), remove dead files (`controllers/protfolio.js`, old models, `ws`, `react-hook-form`, `TradingContext.jsx`, stale seed script — each removal listed in a changelog), indexes review, graceful shutdown.

### Phase 7 — QA
Full manual workflow pass, responsive pass (360, 768, 1024, 1440), accessibility pass (focus, contrast, keyboard), clean-clone install test, docs final (`README.md`, `ARCHITECTURE.md`, API reference, schema doc, financial-calculation doc).

## 4. Test strategy

- Backend: Node's built-in `node:test` (already used) + `mongodb-memory-server` **only if approved** (dev-dependency, downloads a binary) — otherwise tests run against a dedicated Atlas database named in `.env.test`.
- Financial tests (mandatory before Phase 4 sign-off): buy, sell, insufficient balance, invalid/zero/negative/fractional qty, sell more than owned, duplicate `clientOrderId`, 20 concurrent buys exhausting balance, weighted average cost after multiple buys, realised P&L after partial sell, ledger sum equals balance, ownership isolation between two users.
- Security tests: forged/expired JWT, no-secret boot refusal, socket without token, non-admin `join_admin`, unauthenticated advisor/cache clear, rate limiter responses.
- Frontend: Vitest + React Testing Library **only if approved**; otherwise `node --test` for pure utils and a written manual checklist per page.
- Existing 8 tests stay; production code switched to import those helpers.

## 5. Dependency changes (all subject to your approval)

| Action | Package | Reason |
|---|---|---|
| Remove | `ws` (backend), `react-hook-form` (frontend) | Not imported anywhere |
| Move | `nodemon` → devDependencies | build hygiene |
| Decide | `node-cache` | currently unused; either use it for the market-data cache or remove it |
| Add (optional) | `helmet` | security headers, ~tiny |
| Add (optional) | `@fontsource-variable/inter` | local Inter font |
| Add (optional, dev) | `vitest`, `@testing-library/react`, `mongodb-memory-server` | automated tests |
| Not adding | Tailwind, Redis, Docker, state libraries, ORMs | per D1 |

## 6. Local development impact

No change to the workflow: `cd backend && npm install && npm run dev`; `cd frontend && npm install && npm run dev`. New requirement: `MONGO_DB_URI` pointing at Atlas (Phase 6A onward) and a real `JWT_SECRET`. `DEMO_MODE=true` will allow running without Mongo? **No** — without Mongo the trading features cannot be safe; the app will boot and show data-unavailable states for those pages instead of falling back to a JSON file. (Decision D4/D5 may change this.) Optional services (SMTP, Twilio, Gemini, Firebase, Finnhub) stay optional.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Yahoo unofficial API throttling or schema drift | single provider module, cache TTLs (quote 15–30 s, history 5 min), explicit unavailable state, `DEMO_MODE` |
| Mongo transactions unavailable on the chosen cluster | verify at boot; stop and propose alternative (don't weaken integrity) |
| Mixed currencies in one USD wallet | documented limitation (D7) |
| Large page files (Hero 778, TradingTerminal 1388 lines) are risky to restyle | restyle incrementally behind the shell; extract only components that are reused |
| Existing users’ sessions | JWT format unchanged; secret change invalidates sessions — announce, or accept one forced re-login |
| History still contains hashes | decision D2 |

## 8. Phase completion checklist (applies to every phase)

1. `npm install` clean on both apps. 2. Both dev servers start. 3. Affected routes load; no new console errors. 4. Relevant tests pass. 5. ESLint clean on touched files. 6. Docs updated. 7. Report: what changed, what is outstanding, any limitation documented rather than hidden.

---

## 9. Progress log

**Phase 1 — done (2026-11-14).** Delivered: clean baseline commit; fresh repo; `JWT_SECRET` fail-fast; `debugCode` no longer returned in production; helmet + `/api/health`; CORS defaults limited to localhost + `CORS_ORIGIN`; port unified to 3001; `.env.example` rewritten; old third-party credentials removed from the working `.env` files (originals backed up outside the repo); Quanta branding; design tokens (`styles/tokens.css`); `AppShell` (collapsible sidebar, mobile drawer, search with `/` hotkey, schedule-based market status, index strip from real data with unavailable state, notifications, user menu) and `PublicLayout`; shared UI primitives; 404 route; route-level code splitting (main bundle 1,059 kB → 340 kB); local Inter font (no Google Fonts request); lint errors 49 → 0 (15 hook-dependency warnings remain, to be fixed as each page is rewritten).

Deviations from the plan (all small):
- `/faq` is now public (it is static help content).
- `TradingContext.jsx` (dead simulated terminal) deleted now instead of Phase 6B; `ws` and `react-hook-form` removed.
- eslint config relaxed for three rules (unused catch variable, empty catch block, context-file export warning); real unused code was fixed rather than silenced.
- Sidebar shows only routes that exist today; Dashboard, Market Overview, Watchlist, Orders, AI Advisor, Wallet, Settings appear when those pages are built.
- Not done in Phase 1 (moved): the 15 remaining hook warnings; Google sign-in disabled until a Firebase config is supplied.

**Phase 2 — done (2026-11-14).** Delivered:
- Backend: `GET /api/market/overview` (5 indices) and `GET /api/market/movers?region=US|IN`. Every response carries `source`, `delayed`, `fetchedAt`; on provider failure they return `503 DATA_UNAVAILABLE` instead of estimated numbers. US movers come from Yahoo's predefined screeners filtered to market cap ≥ $2B; India movers rank a fixed list of the 50 NIFTY constituents (labelled as such in the response). 60 s / 2 min in-process cache, 120 req/min limiter.
- Frontend: new `Dashboard` (`/dashboard`, default after login), `MarketOverview` (`/markets`) and `StockExplorer` (`/analyzer`, replaces the old screener page; `?q=` and the search API are preserved). Shared `DataTable` (sortable, missing values sort last, responsive column hiding), `Tabs`, `useFetch`, `useQuotes` hooks, `utils/format.js`.
- Portfolio maths extracted to `utils/portfolioMath.js` with unit tests (weighted average cost, unpriced positions excluded from totals, currencies never summed). 13 unit tests pass.
- Dashboard shows only data that exists: holdings, live P&L, allocation, movers, watchlist, wallet activity. There is **no portfolio-over-time chart** because no historical portfolio values are stored (needs the Phase 6A ledger).
- Verified in a real browser at 1440 and 390 px: all routes, search, sort, filters, auth redirect, 0 console errors.

Known limitations carried forward:
- Wallet balance on the dashboard is the server value, which trades do not yet change (S1/S3); it will be correct after Phase 6A.
- Watchlist is still browser-local until Phase 5.
- Yahoo returned no quote for `TATAMOTORS.NS` (the company is now listed as `TMPV.NS` / `TMCV.NS`); lists were updated. Fixed symbol lists need occasional review.

**Phase 3 — done (2026-11-14).** Delivered:
- Stock page (`/stock/:symbol`) with Overview, Chart, Fundamentals and News tabs. Overview: header with price, change, streaming state and watchlist / alerts / trade actions; chart with 8 timeframes; key statistics with day and 52-week range bars; company profile; latest news; related stocks. Chart tab: line (with volume bars) or candlesticks with SMA 20, Bollinger and RSI 14. Fundamentals: 45 fields in six groups; missing values show "—", never zero.
- Backend: `GET /api/stocks/chart/:symbol?range=` (1D, 1W, 1M, 3M, 6M, 1Y, 5Y, MAX; regular trading hours only; cached; 503 on failure), `GET /api/stocks/fundamentals/:symbol` (Yahoo `quoteSummary`, plus related symbols), shared Yahoo client in `services/yahoo.js`.
- Live prices: the socket poller now batches subscribed symbols to Yahoo every 15 s (was one symbol every 2 h), validates symbols and caps subscriptions per socket. Update payload gained `marketState`.
- Removed fabricated data: `GET /api/stocks/quote` and `/history` no longer return hard-coded or random prices when the provider fails; they return `503 DATA_UNAVAILABLE`. The news endpoint returns an empty list instead of a placeholder article, and news publish times are now converted correctly (they were off by a factor of 1000).
- Top-bar search shows suggestions (keyboard navigable); Enter without a selection opens the Stock Explorer.
- Alerts now use the server subscription endpoints (login required) instead of browser-only storage.
- Tests: 18 unit tests (indicators incl. a textbook RSI value, portfolio maths, trading helpers); 35 browser checks for this page including mobile widths.

Known limitations:
- News comes from Yahoo's search results, which usually return about three to five articles.
- Fundamentals for indices and some non-US symbols are sparse by nature of the data.
- Percentages come as fractions from the provider and are multiplied by 100 for display; if the provider changes units this needs re-checking.
- The Hero and Trading Terminal still contain simulated chart data of their own; they are addressed in Phase 4.

**Phase 4 — done (2026-11-14).** Delivered:
- Server-side trade engine on MongoDB Atlas (`docs/TRADING_ENGINE.md`): wallet per currency, holdings, orders, append-only ledger; every fill, deposit and import is a transaction; idempotent order submission; MARKET, LIMIT and STOP orders with an in-process matcher; simulated deposits with limits; validated CSV import. The browser no longer holds any balance or decides any price.
- Removed the client-authoritative paths: `/api/protfolio` (add, edit, delete, bulk), the old JSON wallet top-up with caller-chosen amounts and payment references, and the localStorage wallet in the terminal.
- Trading Terminal rebuilt in three columns (find, watchlist and movers | chart | order ticket and position) with open orders, order history, positions and activity underneath. Order ticket has a review step, live cost estimate and funds / holdings checks; the server remains the authority.
- New pages: Orders (`/orders`), Wallet (`/wallet`). Portfolio rebuilt on server data: value, invested, unrealised and realised P&L per currency, holdings table, allocation by stock or sector, transaction history and the CSV importer. Dashboard reads positions and the ledger. Profile no longer carries a second wallet form.
- CSV import: proper quoted-field parsing, `.NS` suffix added for Indian brokers (previously imported as US stocks), skipped rows reported.
- Tests: 20 engine tests against Atlas (concurrency, idempotency, rollbacks, ledger invariant), 5 CSV tests, 42 browser checks covering the money flows and mobile widths.

Decisions implemented from the plan: D8 (limit and stop orders rest; no leverage; flat 0.03% fee), D7 (separate USD and INR wallets, no conversion), D10 (canonical API names; the misspelled `protfolio` routes are removed).

Not yet done (next): users, notification logs, chat and alert subscriptions still live in the JSON file, so the app is not deployable until they move to MongoDB; socket authentication; the landing-page showcase still contains simulated chart data; the portfolio-over-time chart (now possible from the ledger plus historical prices).

**Phase 4B — done (2026-11-14).** Everything that was in the local JSON file now lives in MongoDB: users, notification logs, chat messages and alert subscriptions. The JSON store (`dataStore.js`) is deleted. The previous accounts were not imported, so everyone signs up fresh. The app now needs `MONGO_DB_URI` to run; without it, account and trading routes answer `503 DB_UNAVAILABLE` while market data pages keep working.

Security fixes delivered with it (audit S5–S9):
- Sockets: the JWT is read from the handshake; unauthenticated sockets can only follow public price rooms. `join_admin` needs the admin role, users can only join and write to their own chat room, and sender id and name come from the token, never from the client.
- Chat history: a user can only read their own room; admins can read all.
- Google sign-in: requires a verified Firebase ID token with a verified email. The old fallback that trusted an email address in the request body is removed.
- Codes: generated with a secure random source, stored hashed, compared in constant time; login, password-reset and phone codes are invalidated after five wrong attempts; `verify-email`, `reset-password` and phone verification have rate limits; resend and forgot-password answer identically for unknown accounts. Phone one-time codes are no longer returned in API responses in production.
- `/api/stocks/advisor` needs a login (and is rate limited); `/api/stocks/cache/clear` is admin only; request bodies are limited to 100 KB; error responses no longer echo internal messages.
- Tests: `backend/tests/api.test.js` starts the real server and checks 16 attack scenarios (forged, expired and unsigned tokens, tokens for deleted users, injection in credentials, brute-forced codes, rate limits, socket spoofing, cross-user access). All pass together with the 20 engine tests.

Remaining before a first deployment: choose the hosting setup (the server needs a long-running process for Socket.IO), set production environment variables, tighten MongoDB network access, and add a CI workflow.

**Phase 5 progress (2026-11-15).**
- AI Advisor (done): dedicated page with a server-side data panel and structured answers. The server fetches every figure itself (quote, indicators computed from daily closes, fundamentals, headlines) and the browser cannot supply market data. The model gets only those facts and must say when something is unavailable; its key travels in a header, user text never enters the system prompt, and an answer that is not valid JSON is replaced by a rule-based summary built from the same facts. Without a key the page says so. Endpoints: `POST /api/advisor/chat`, `GET /api/advisor/context/:symbol` (login required, rate limited).
- Watchlists (done): saved to the account, up to 10 lists of 100 stocks each, with a default list that cannot be deleted. Endpoints under `/api/watchlists`; one-time import of the old browser list on first load; the star on the stock page, terminal and advisor all use the default list through one shared context. The Watchlist page offers add by search, filter, sorting, per-stock one-month trend charts (`GET /api/stocks/sparklines`, real daily closes, null when unavailable) and rename, create and delete.
- Tests: backend 54 (engine 20, API and security 22, advisor 12); browser suites for the advisor (25) and watchlists (27) in addition to the earlier ones.
- Still to do in Phase 5: Notifications page, Settings page, Profile editing (name and password), FAQ and About rewrite.
