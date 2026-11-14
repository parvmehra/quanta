# MarketLens — Agent Guidelines & Project Knowledge (AGENTS.md)

> **CRITICAL FOR ALL AGENTS**: Do NOT recursively search or analyze this repository again. All architecture, tech stack, file maps, design guidelines, and API contracts are documented in this file.

---

## 1. Project Overview & Architecture
**MarketLens** is a full-stack financial web application for global and Indian stock screening, real-time market tracking, portfolio management, and stock analysis.

### Directory Structure & Workspace Root
Note: The repository contains nested folders:
`d:/Downloads/StockPortfolio-main (2)/StockPortfolio-main/StockPortfolio-main/StockPortfolio-main/`
- **`backend/`**: Express.js REST API & Socket.IO server.
- **`frontend/`**: Vite + React 19 single-page application.
- **`start.bat`**: Startup script for both servers.

---

## 2. Tech Stack

### Frontend
- **Framework**: React 19 + Vite 7
- **Routing**: `react-router-dom` v7
- **Charts**: `recharts` v3 and customized SVG sparklines
- **Icons**: `lucide-react`
- **Styling**: Vanilla CSS with comprehensive CSS custom properties (design tokens) defined in `frontend/src/index.css`
- **Real-Time Client**: `socket.io-client`
- **Dev Server**: Default port `5173` (`http://localhost:5173`)

### Backend
- **Framework**: Express 5.1 (ES Modules: `"type": "module"`)
- **Real-Time Server**: Socket.IO (`socket.io` 4.8)
- **Market Data Sources**:
  - `yahoo-finance2` (Primary for quotes, history, search, news)
  - `Finnhub` (Secondary fallback with API key)
  - Internal offline mock generators for resilience against rate-limits
- **Data Persistence**: MongoDB / Mongoose with JSON fallback (`dataStore.js` / `data.json`)
- **Port**: `3001` (`http://localhost:3001`)

---

## 3. Key API Endpoints (`/api/stocks`)
- `GET /api/stocks/search?q=:query`: Searches global and Indian equities (enriched with live quotes).
- `GET /api/stocks/quote/:symbol`: Detailed quote (price, change, high, low, volume, market cap).
- `GET /api/stocks/quotes?symbols=AAPL,TCS.NS`: Batch quotes for up to 20 symbols.
- `GET /api/stocks/history/:symbol`: Historical candle data (100 days default).
- `GET /api/stocks/news/:symbol`: Latest news articles for ticker.
- `GET /api/stocks/market-pulse`: Macro indices (S&P 500, NASDAQ, NIFTY 50) and exchange status.
- `POST /api/stocks/cache/clear`: Flushes in-memory cache.

---

## 4. Frontend File & Component Map
```
frontend/src/
├── App.jsx                     # Router, Navigation, global providers
├── index.css                   # Global theme tokens, typography, reset
├── config.js                   # API_BASE_URL (5000), SOCKET_URL (5000)
├── pages/
│   ├── StockAnalyzer.jsx       # Global Screener, Search, Stock Cards & Real-Time Charts
│   ├── StockAnalyzer.css       # Screener & Stock Card Bento Grid Styles
│   ├── StockDetails.jsx        # In-depth symbol breakdown, interactive AreaChart, News
│   ├── StockDetails.css        # Stock detail view styles
│   ├── Portfolio.jsx           # Portfolio tracking, holdings, P&L
│   ├── Trade.jsx               # Buy/Sell execution & order simulation
│   ├── Home.jsx                # Landing page
│   └── About.jsx               # About project
├── components/
│   ├── Navbar.jsx              # Top header navigation
│   ├── Footer.jsx              # Global footer
│   └── ...
├── utils/
│   └── currency.js             # Currency formatting (₹ INR for .NS/.BO vs $ USD)
└── contexts/
    ├── AuthContext.jsx         # User authentication state
    └── NotificationContext.jsx # Toast / banner notifications
```

---

## 5. Stock Card & Charting Design Conventions
When rendering stock cards (e.g. in `StockAnalyzer.jsx`):
- **Card Styling**:
  - Dark sleek container (`#101614` / `#131b17`), subtle border (`rgba(255, 255, 255, 0.08)` or `#1e2d24`), rounded corners (`16px`).
- **Header**:
  - Left: Symbol in bold mono, exchange pill badge (e.g. `NSE` in emerald green pill), company name below.
  - Right: Price formatted with `formatCurrencyValue`, Change pill with `▲ +X.XX%` (green) or `▼ -X.XX%` (red).
- **Real-Time Sparkline / Area Chart**:
  - Smooth area curve (`type="monotone"` or SVG path).
  - Green gradient fill (`#22c55e` to `transparent`) if positive; Red gradient fill (`#ef4444` to `transparent`) if negative.
  - Glowing pulsing endpoint circle at the tip of the line.
  - Real-time tick updates on `1D` view.
  - Timeframe tabs: `1D`, `1W`, `1M`, `3M`, `1Y`.
- **Metrics**:
  - Mini bar chart icon with `Market Cap` and `Volume` formatted via `formatCompactCurrency`.
- **Actions**:
  - `Analysis ↗` button (dark outline) -> `/stock/:symbol`
  - `Trade →` button (solid emerald green `#22c55e` / `#6EB790`) -> `/trade/:symbol`

---

## 6. Currency & Localization Rules
- Tickers ending with `.NS`, `.BO` or containing `NSE`/`BSE` are **Indian Stocks**:
  - Format with Indian Rupee symbol `₹` (e.g. `₹2,470.20`).
  - Format large numbers with `T` (Trillion), `B` (Billion), or `M` (Million) or Crores/Lakhs via `utils/currency.js`.
- All other symbols default to USD `$`.

---

## 7. Developer Workflow & Commands
- **Backend**:
  ```powershell
  cd "d:\Downloads\StockPortfolio-main (2)\StockPortfolio-main\StockPortfolio-main\StockPortfolio-main\backend"
  npm run dev
  ```
- **Frontend**:
  ```powershell
  cd "d:\Downloads\StockPortfolio-main (2)\StockPortfolio-main\StockPortfolio-main\StockPortfolio-main\frontend"
  npm run dev
  ```
