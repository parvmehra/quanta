# Quanta — Project Audit (Phase 0)

Audit date: 2026-11-13. Scope: `quanta-main/` only.
Method: static code reading plus the existing unit test and ESLint. **The backend and frontend were not started, and no external API or database was called.** "Works" below means "the code path is complete and coherent", not "verified at runtime". Runtime verification is scheduled in the plan.
No credential values appear in this document; only variable names and file names.


---

## 1. Architecture as it actually is

```
quanta-main/
├── backend/   Express 5 (ESM) + Socket.IO on one http.Server, port from PORT (3002 in local .env, 3001 default)
│   ├── index.js            server, CORS, Socket.IO handlers (price rooms + support chat)
│   ├── dataStore.js        THE database: in-memory object persisted to backend/.data/data.json (debounced writes)
│   ├── routes/             auth, stocks (+subscriptions), protfolio [sic], wallet, chat
│   ├── controllers/        stockControllers.js (market data + advisor), protfolio.js (DEAD, see §6)
│   ├── middlewares/auth.js JWT check (Bearer header or `token` cookie) → looks user up in the JSON store
│   ├── models/             3 Mongoose models — NOT USED by any running code
│   ├── config/             connectDB.js (call commented out in index.js), firebase.js (optional)
│   ├── services/           emailService (nodemailer), smsService (twilio), notificationService, geminiAdvisorService
│   └── seed/seedStock.js   Mongoose seed script (unused path)
└── frontend/  Vite 7 + React 19, plain CSS per page/component, react-router v7
    └── src/    App.jsx, 9 routes, 4 contexts, 7 pages, 8 components, 3 utils
```

- **Persistence is a JSON file, not MongoDB.** `connectDB()` is commented out in `backend/index.js`; `mongoose` models exist but nothing imports them in the request path. `store` (users, portfolios, messages, notificationLogs, walletTransactions, subscriptions) is loaded at boot and mutated in place.
- **Styling:** vanilla CSS with custom properties (`index.css` + per-page CSS). **Tailwind is not installed**. No design-token system is shared across pages.
- **State:** React Context (Auth, Notification, Theme, Trading) + local component state. No server-state library.
- **API client:** mixed. `utils/axiosInstance.js` (used by auth, profile, advisor) and raw `axios` + `API_BASE_URL` (stocks, portfolio, trading). A global axios interceptor in `main.jsx` also attaches the JWT. Portfolio/trading calls pass `withCredentials: true` and also receive the Bearer header.
- **Auth transport:** JWT stored in `localStorage` (`token`, `userId`, `isAuthenticated`) *and* set as an httpOnly cookie.
- **Deployment hints:** Netlify redirects (`netlify.toml`, `frontend/public/_redirects`), CORS allow-list contains hosted origins (Netlify/Render).

## 2. Frontend route inventory (`frontend/src/App.jsx`)

| Route | Component | Guard | Notes |
|---|---|---|---|
| `/` | `Home` → `Hero` (778 lines) | none | landing + curated stock showcase; uses simulated candles for chart fallback |
| `/analyzer` | `StockAnalyzer` (725) | none | screener/search/market-pulse, sparkline cards |
| `/stock/:symbol` | `StockDetails` (400) | none | quote, history, news, socket, alert subscribe, embeds `QuantaAdvisor` |
| `/trade`, `/trade/:symbol` | `TradingTerminal` (1388) | `AuthLayout` | order form, chart, indicators |
| `/portfolio` | `Portfolio` (645) | `AuthLayout` | holdings CRUD, CSV import, live P&L |
| `/profile` | `Profile` (604) | `AuthLayout` | profile, wallet top-up, subscriptions, notification prefs/history |
| `/faq` | `FAQ` | `AuthLayout` (odd: public content behind login) | |
| `/about` | `About` | none | |
| `/login`, `/signup` | `login`, `signup` | none | password+OTP flow, Google sign-in, reset flow in `login.jsx` |

No `*` catch-all route. No dedicated Dashboard, Market Overview, Watchlist, Wallet, Orders, Settings or Notifications page exists; those features are either embedded in other pages or absent (see §4).

## 3. Backend API inventory

Base: `/api`. "Auth" = `protect` middleware.

**Stocks** (`routes/stockRoutes.js`)
| Method + path | Auth | Purpose |
|---|---|---|
| GET `/stocks/search?q=` | no | Yahoo search, enriched with quotes; hard-coded fallback list |
| GET `/stocks/quotes?symbols=` | no | batch quotes |
| GET `/stocks/quote/:symbol` | no | Yahoo → Finnhub → **random mock** |
| GET `/stocks/history/:symbol` | no | Yahoo chart/historical → Finnhub → **random mock** |
| GET `/stocks/news/:symbol` | no | Yahoo → Finnhub → placeholder article |
| GET `/stocks/market-pulse` | no | indices + gainers from a fixed 10-symbol list; static fallback |
| POST `/stocks/advisor` | **no** | Gemini advisor (spends API quota; unauthenticated) |
| POST `/stocks/cache/clear` | **no** | flushes cache for anyone |
| GET/POST/DELETE `/stocks/subscriptions[/:symbol]` | yes | email/SMS price-alert subscriptions |

**Auth** (`routes/authRoutes.js`): `GET /auth/me`; `POST /signup, /verify-email, /resend-verification, /login, /verify-login-otp, /resend-login-otp, /google, /forgot-password, /reset-password, /logout`; `POST /phone/send-otp, /phone/verify-otp, /phone/dismiss-prompt`; `GET|PUT /preferences`; `GET /notifications/history`.

**Portfolio** (`routes/protfolioRoutes.js`, URL spelled `protfolio`): `GET /`, `POST /` (called "BUY"), `PUT /:id`, `DELETE /:id`, `POST /bulk`. All authenticated and scoped to `req.user._id`.

**Wallet**: `GET /wallet`, `POST /wallet/topup`.
**Chat**: `GET /chat/:roomId`, `GET /chat/admin/rooms`.

**Socket.IO events** (in `index.js`): `subscribe`/`unsubscribe` (symbol rooms, emits `priceUpdate`), `join_chat`, `join_admin`, `send_message` → `receive_message`.

## 4. Feature inventory and real status

Legend: ✅ works as designed (by code reading) · ⚠️ works but with significant defects · 🟡 partial / UI-only · ❌ broken or absent.

| # | Feature | Status | Evidence / notes |
|---|---|---|---|
| 1 | Registration + auth | ⚠️ | Complete: bcrypt, email verification code, **email-OTP 2FA on every login**, lockout after 5 failures, rate limit, Google via Firebase. Defects: JWT secret fallback literal; `debugCode` returned to client (unconditionally in one branch of `/login`); Google fallback trusts request body when Firebase isn't configured; user records in a JSON file. |
| 2 | Profile management | 🟡 | `Profile.jsx` shows wallet, subscriptions, notification prefs/logs, phone verification. No endpoint to edit name/email/password while logged in (only reset-by-code). |
| 3 | Stock search/exploration | ✅/⚠️ | Real Yahoo data; falls back to a hard-coded list; falls back to **random mock quotes** (`Math.random`) presented as real. |
| 4 | Stock info/company details | 🟡 | Quote fields only (price, hi/lo, volume, market cap). No fundamentals endpoint (P/E, EPS, 52-week range come from the quote if present, otherwise absent). The trading context contains a hard-coded `STOCK_DB` of 4 NSE stocks with invented metrics (see #11). |
| 5 | Historical charts | ⚠️ | Real Yahoo/Finnhub history, but the mock path emits random walks with HTTP 200 and no "simulated" flag. `Hero.jsx` and `StockAnalyzer.jsx` also synthesise candles/ticks client-side. |
| 6 | Market overview | 🟡 | `market-pulse` endpoint + panel inside `StockAnalyzer`. No dedicated page. "Gainers" come from a fixed list of 10 US tickers, not the market. Static fallback values on failure. |
| 7 | Watchlists | 🟡 | `TradingTerminal` keeps a watchlist in `localStorage['quanta-watchlist']` — per browser, not per user, not on the server. Server "subscriptions" are price-alert opt-ins, a different concept. |
| 8 | Portfolio management | ⚠️ | CRUD works (JSON store, per-user). Each BUY creates a **new row** instead of merging lots; "average price" is therefore per-lot, not per-symbol. Unvalidated `PUT` (strings/negatives accepted). |
| 9 | Holdings + average price | ⚠️ | No server-side aggregation. Sell logic lives in the browser and reduces lots in order. No realised P&L anywhere. |
| 10 | Simulated buy/sell | ❌ (integrity) | **There is no server-side trade engine.** The browser calls `POST /protfolio` with symbol, shares *and price*, and adjusts a wallet balance stored in `localStorage['quanta-wallet']`. The server wallet (`user.wallet.balance`, $500,000) is never debited by a trade. Sells are client-orchestrated DELETE/PUT calls. A user can fabricate holdings at any price via the API. |
| 11 | Trading terminal | ⚠️ | Real quotes/history via API, indicators (RSI/SMA/VWAP) computed client-side. Order types offered: MARKET, LIMIT, SL — **all execute instantly** at the form price; LIMIT/SL do not rest as pending orders. Circuit limits are computed as ±10% of previous close. `TradingContext.jsx` (a second, fully simulated terminal with random OHLC and order book) is **not imported anywhere** — dead code. Currency shown as `$` even for NSE tickers in several messages. |
| 12 | Order types | 🟡 | See #11. No open-order state, no order history store, no cancellation. |
| 13 | Wallet/balance | ❌ (integrity) | Two unrelated balances (server JSON vs. browser localStorage). Top-up has no payment step: any authenticated user can credit up to $10,000,000 per request, repeatedly. UI and transaction text say "Razorpay" though no gateway code exists. |
| 14 | Transaction history | 🟡 | Only top-ups are recorded (`walletTransactions`). Trades are not recorded server-side. The terminal's "recent trades" are an in-memory React array. |
| 15 | AI stock research | ✅ (optional) | `geminiAdvisorService` calls Gemini with news grounding and falls back to a rule-based "analytical" engine without a key. Isolated from core flows. Defects: endpoint unauthenticated; API key is passed in the request URL (query string); no disclaimer enforced server-side. |
| 16 | Market data integrations | ⚠️ | Yahoo (`yahoo-finance2`) primary; Finnhub fallback with `'demo'` key default; Alpha Vantage `'demo'` default for sockets; TwelveData var is declared but unused. |
| 17 | Real-time | ❌ | `index.js` polls Alpha Vantage *one symbol every 2 hours* (`RATE_LIMIT_INTERVAL_MS = 2h`, log text says "1 req / 12.5s"). With the default `demo` key the call mostly fails. Socket clients therefore receive almost no live ticks. The 1D "live" sparkline/terminal ticks are produced by `Math.random()` in the browser (`StockAnalyzer.jsx:189`, `Hero.jsx:582`) and look live. |
| 18 | CSV portfolio import | ✅ | Client parses broker CSV presets (Zerodha, Groww, Angel One, Upstox, generic) → `POST /protfolio/bulk`. Server does not validate rows (NaN→0 shares allowed, no size cap). |
| 19 | Notifications | ✅/⚠️ | Email (nodemailer, Gmail/SMTP) and SMS (Twilio) with per-event preferences and a DB log; "simulated mode" when unconfigured. In-app toast/notification context is localStorage. Trade/top-up emails are triggered by client-initiated calls. |
| 20 | Supporting pages | ✅ | About, FAQ (static). FAQ describes features that differ from reality (e.g. real-time ticks). |
| — | Support chat (`ChatWidget`) | ⚠️ | Not in the original feature list but exists; see security §5. |

## 5. Security and data-integrity findings

Ordered by severity. **S1–S3 should be treated as exploitable today.**

| ID | Severity | Finding | Location |
|---|---|---|---|
| S1 | **Critical** | Trading is client-authoritative: server accepts client-supplied price/shares into holdings; server wallet is untouched by trades; wallet balance for trading is browser localStorage. | `routes/protfolioRoutes.js`, `TradingTerminal.jsx:560-650` |
| S2 | **Critical** | `backend/data.json` (≈23 user records incl. bcrypt password hashes, emails, phones, OTP/reset hashes, notification logs) **is tracked in Git** and present in 3 commits of history. A second live copy sits in `backend/.data/data.json` (untracked). | `git ls-files`, history of `backend/data.json` |
| S3 | **Critical** | Unlimited free wallet credit: `POST /wallet/topup` has no payment verification and accepts a client-supplied `paymentId`. | `routes/walletRoutes.js` |
| S4 | High | JWT signing secret falls back to a hard-coded literal when `JWT_SECRET` is unset (both sign and verify). Anyone reading the repo can forge tokens for any user id on such a deployment. | `middlewares/auth.js:18`, `routes/authRoutes.js:37` |
| S5 | High | Socket.IO has no authentication. Any client can `join_admin` and receive every support message, `join_chat` any room, and `send_message` with arbitrary `senderId`/`senderName` (stored in the JSON file). `GET /chat/:roomId` lets any logged-in user read any room. | `index.js:155-185`, `routes/chatRoutes.js` |
| S6 | High | `/auth/google` accepts `{email,name}` from the request body when Firebase Admin isn't initialised → account takeover of any email by anyone. Also links to an existing account by email without checking `email_verified`. | `routes/authRoutes.js:468-490` |
| S7 | High | Verification/login/reset codes are returned in API responses (`debugCode`) unless `NODE_ENV=production`; in one branch of `/login` it is returned **unconditionally**. Codes are 6 digits from `Math.random()` (not cryptographically secure), no per-code attempt limit beyond the shared 20/15 min limiter; `verify-email`, `reset-password` have no limiter at all. | `routes/authRoutes.js` |
| S8 | Medium | `POST /stocks/cache/clear` and `POST /stocks/advisor` are unauthenticated (cost/DoS vector). No rate limiting on any stock/market endpoint. | `routes/stockRoutes.js` |
| S9 | Medium | JSON store with in-memory mutation and no locking: lost updates under concurrency; any crash mid-write corrupts the file (non-atomic `writeFileSync`). No backups. | `dataStore.js` |
| S10 | Medium | Local files holding live credentials exist in the working tree: `backend/.env`, `frontend/.env`, `backend/serviceAccountKey.json` (a Google service-account key). **Verified:** `.env` and `serviceAccountKey.json` are gitignored and were never committed (history checked). `backend/.env` contains real-looking values for Mongo, SMTP/Gmail, Twilio, Gemini, Finnhub, Firebase; `.env` also has duplicated keys. Treat all as exposed to anyone with the folder (the folder was shared/zipped: see the stray `cookies.txt` one level up). **Recommend rotating them.** | working tree |
| S11 | Medium | JWT in `localStorage` (XSS-readable) in addition to the cookie. 7-day lifetime, no revocation or logout-everywhere. `sameSite:'none'` cookies in production without CSRF mitigation (partly mitigated since the API also accepts the Bearer header, but the cookie is honoured too). | `AuthContext.jsx`, `authRoutes.js` |
| S12 | Medium | Portfolio/CSV inputs unvalidated (NaN, negative, huge arrays, symbols not checked). `PUT` stores raw strings. | `routes/protfolioRoutes.js` |
| S13 | Low | `express.json()` with default limits only; no `helmet`; stack/err messages echoed in advisor error (`error: err.message`). CORS allow-list in code hard-codes third-party hosted origins. | `index.js`, `stockControllers.js:754` |
| S14 | Low | `backend/test-sms.js` is a manual Twilio script in the source tree. Notification logs may store phone numbers/e-mail bodies in the JSON file. | `backend/` |
| S15 | Info | Passwords: bcrypt cost 10, strength rules present, generic "Invalid credentials" messages — good. Login lockout + email OTP — good. Account enumeration is possible via `/auth/resend-login-otp` ("User not found") and sign-up. | |

## 6. Dead / duplicate / misleading code

- `backend/controllers/protfolio.js` — CommonJS (`require`) file in an ESM package, in-memory demo data (AAPL/GOOGL/MSFT), **never imported**. Would crash if loaded. Safe to remove (Phase 6, documented).
- `backend/models/*.js` — Mongoose `User`, `Portfolio`, `Stock` models; unused at runtime; **do not match the real JSON user shape** (missing role, wallet, verification fields, notification prefs, phone). Schemas must be rewritten, not reused as-is.
- `frontend/src/contexts/TradingContext.jsx` — entire simulated terminal (fake OHLC/order book/stock DB) never mounted. Remove or quarantine; do not reuse its fake data.
- `frontend/src/utils/tradingCalculations.js` — tested helper functions, but `TradingTerminal.jsx` re-implements the same math inline instead of importing it (the tests do not cover production code).
- `frontend/src/assets/react.svg`, `public/vite.svg`, `App.css` (template leftovers — to confirm).
- `backend/data.json` (legacy, tracked) vs `backend/.data/data.json` (live) — two diverging copies (23 vs 25 users).
- `ws` dependency: no import found.

## 7. External integrations

| Integration | Where | Status |
|---|---|---|
| Yahoo Finance (`yahoo-finance2` v3) | stockControllers | Primary; unofficial API, no key, may rate-limit |
| Finnhub | stockControllers | Fallback; `'demo'` key default (demo key rejects most symbols) |
| Alpha Vantage | `index.js` socket loop | `'demo'` default; effectively dead at 1 call / 2 h |
| Twelve Data | declared in env | unused |
| Google Gemini (REST) | geminiAdvisorService | optional, with offline fallback |
| Firebase (client SDK + Admin) | login/Google | optional |
| Nodemailer (Gmail/SMTP) | emailService | optional (simulated mode without config) |
| Twilio | smsService | optional |
| Razorpay | `.env.example`, UI strings, `walletRoutes` default text | **no integration code** — cosmetic only |
| MongoDB Atlas | `connectDB`, models | **not connected** |

## 8. Dependencies

**Backend** (`package.json`): `ws` — unused (remove). `node-cache` — unused (the code uses a hand-rolled cache object; either adopt or remove). `uuid` — only imported by the dead controller (not even listed in `package.json` → the dead file would crash). `nodemon` is in `dependencies` (belongs in devDependencies). `axios` — used. `mongoose` — used only by unused modules today, but needed if we migrate (Phase 6). `firebase-admin`, `twilio`, `nodemailer` — optional features; keep, but already degrade gracefully. No `helmet`, no validation library (hand-written checks).
**Frontend**: `react-hook-form` — **0 imports** (remove). No `tailwindcss` (see decision D1 in the plan). `firebase` (large) only for Google sign-in — keep, lazy-load. `recharts` (2 files) and `lightweight-charts` (1 file) both used — keep both. No test runner (only `node --test` on one utils file).
**Tooling**: ESLint currently reports **62 problems (49 errors, 13 warnings)** — mostly unused vars/empty catch blocks, plus several `react-hooks/exhaustive-deps` warnings. The 8 existing unit tests pass (they test helper functions that production code does not import).

## 9. Repository hygiene

- `.git` exists at `quanta-main/` with 9 commits; the working tree has **58 uncommitted changes** (modified + untracked: services, wallet route, AuthContext, Profile, FAQ, etc.). The baseline is not committed. **Action before Phase 1: commit or tag a clean baseline** (without secrets or data files).
- Tracked but should not be: `backend/data.json`.
- Untracked and should be ignored: `backend/.data/`.
- `frontend/dist/` exists (ignored by `frontend/.gitignore`).
- `cookies.txt` sits in the parent folder (outside the project root; not touched).
- `.env.example` files exist for both apps and contain no values (checked key names only). The backend example lists Razorpay vars that nothing reads and omits `GMAIL_USER`/`GMAIL_APP_PASS`, which `emailService` does read; the real `backend/.env` also repeats the SMTP/Gmail block twice.
- Ports are inconsistent across the repo: backend default 3001, local `.env` 3002, frontend fallback 3002, Vite proxy 3002, `AGENTS.md` says 3001/5000.

## 10. What must be preserved

Email/password + OTP + Google login, phone verification, notification preferences and logs, stock search/quote/history/news/market-pulse endpoints (response shapes), portfolio CRUD + CSV importer and broker presets, stock-alert subscriptions, AI advisor (+ its no-key fallback), Socket.IO price-room mechanism (to be made functional), currency formatting (`utils/currency.js`, ₹ for `.NS/.BO`), existing routes (`/analyzer`, `/stock/:symbol`, `/trade[/:symbol]`, `/portfolio`, `/profile`, `/faq`, `/about`, `/login`, `/signup`), support chat (functionality kept, access fixed).

## 11. Recommended modifications (summary)

1. **Fix first :** commit a clean baseline; untrack and purge `data.json` from history decision; stop `debugCode` leaks; remove JWT secret fallback (fail fast); close `join_admin`/chat holes; lock `cache/clear` and `advisor`; rotate exposed credentials.
2. **Make trading real (server-authoritative):** server computes fills from its own quote, debits/credits the server wallet, writes an immutable ledger, aggregates holdings per symbol, supports pending LIMIT/SL orders in a minimal in-process matcher.
3. **Persistence:** migrate the JSON store to MongoDB via Mongoose with revised schemas and a one-off import script (see plan Phase 6). Verify Atlas supports multi-document transactions (replica set) — if unavailable, use single-document atomic updates with an embedded ledger entry.
4. **Market data:** add an explicit `source`/`asOf`/`delayed|simulated` field to every market response; remove random mock data from production code paths (replace by a clearly labelled `DEMO_MODE`); fix the socket poller (use Yahoo `quote` batch for subscribed symbols on a sensible interval, e.g. 15 s, capped).
5. **UI:** introduce tokens + app shell; Tailwind decision D1; reuse existing data hooks.
6. **Dependency cleanup:** remove `ws`, `react-hook-form`; decide on `node-cache`.

## 12. Open questions for the owner

See §"Decisions requested" in `IMPLEMENTATION_PLAN.md`.

---

## 14. Runtime smoke test (Phase 1, 2026-11-14)

Method: both dev servers started locally; Edge driven headlessly with a throw-away user created through the real signup/verify API (removed afterwards). Each route was loaded at 1440×900 and 390×844; console errors, failed/5xx requests and horizontal overflow recorded.

Result after the Phase 1 changes: **22/22 route×viewport loads with 0 console errors, 0 failed requests, 0 horizontal overflow.** Protected routes render when a valid token is present.

Observed at runtime (confirms the static audit):
- `GET /api/stocks/quote|history|market-pulse` return real Yahoo Finance data; `GET /api/protfolio` without a token → 401; server refuses to start without a strong `JWT_SECRET`.
- `market-pulse` reports `price: 0` when a provider call fails (the new index strip treats this as "unavailable", not as a price).
- Existing pages (Hero, StockAnalyzer, StockDetails, TradingTerminal, Portfolio) still use hard-coded emerald/dark-green colours and their own card styles; they are restyled in Phases 2–5.
- Not verified at runtime: email/SMS delivery (simulated mode), Gemini, Google sign-in, socket price ticks (poller interval defect S-list), CSV import end-to-end, trade execution (to be replaced in Phase 6A).

---

## 15. Status of the findings (2026-11-14)

| ID | Status |
|---|---|
| S1 client-authoritative trading | Fixed: server-side engine (`docs/TRADING_ENGINE.md`) |
| S2 user data tracked in Git | Fixed: untracked, ignored, history reset |
| S3 unlimited free wallet credit | Fixed: capped, simulated, ledger-recorded deposits only |
| S4 JWT secret fallback | Fixed: server refuses to start without a strong secret |
| S5 socket and chat access | Fixed: token-based socket identity, role and room checks |
| S6 Google sign-in trusting the request body | Fixed: verified ID token only |
| S7 codes in responses, weak codes, missing limits | Fixed: secure random codes, hashed, attempt caps, rate limits; codes are only echoed outside production |
| S8 unauthenticated advisor and cache-clear | Fixed: login required, admin only |
| S9 JSON file as the database | Fixed: all data in MongoDB |
| S10 local credential files | Original keys removed from the working tree; rotate anything that was ever shared |
| S11 token kept in browser storage | Open (known trade-off of the current design) |
| S12 portfolio and CSV input validation | Fixed on the server |
| S13 helmet, body limit, error leakage | Fixed |
