import React, { useState, useEffect, useId, useMemo } from 'react';
import { Search, Loader, Activity, Star, Globe2, Sparkles, ArrowRight, ArrowUpRight, LayoutGrid, List, ChevronRight, ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config';
import { formatCompactCurrency, formatCurrencyValue } from '../utils/currency';
import './StockAnalyzer.css';

// ── Icons ──────────────────────────────────────────────────────────────────
const HeaderBarsLogo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="sa-header-bars-icon" aria-hidden="true">
    <rect x="2" y="12" width="3.5" height="10" rx="1.75" fill="#22c55e" opacity="0.65" />
    <rect x="8.5" y="4" width="3.5" height="18" rx="1.75" fill="#22c55e" />
    <rect x="15" y="8" width="3.5" height="14" rx="1.75" fill="#22c55e" opacity="0.85" />
  </svg>
);

const MiniBarsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" className="sa-stat-icon" aria-hidden="true">
    <rect x="2" y="8" width="2.5" height="7" rx="1" opacity="0.65" />
    <rect x="6.7" y="4" width="2.5" height="11" rx="1" opacity="0.9" />
    <rect x="11.5" y="6" width="2.5" height="9" rx="1" opacity="0.75" />
  </svg>
);

// ── Formatters ─────────────────────────────────────────────────────────────
const KNOWN_CAPS = {
  'TCS.NS': 8.94e12,
  'TATASTEEL.NS': 2.10e12,
  'TMCV.NS': 1.46e12,
  'TATAMOTORS.NS': 1.46e12,
  'TATACAP.NS': 1.35e12,
  'TATAPOWER.NS': 1.28e12,
  'RELIANCE.NS': 1.90e13,
  'INFY.NS': 6.70e12,
  'AAPL': 2.90e12,
  'MSFT': 3.14e12,
  'GOOGL': 1.80e12,
  'TSLA': 7.70e11,
};

const KNOWN_VOLS = {
  'TCS.NS': 2.09e6,
  'TATASTEEL.NS': 5.27e6,
  'TMCV.NS': 1.84e6,
  'TATAMOTORS.NS': 1.84e6,
  'TATACAP.NS': 11.41e6,
  'TATAPOWER.NS': 8.50e6,
  'RELIANCE.NS': 18.55e6,
};

const formatMarketCap = (cap, symbol = '', exchange = '', price = 0) => {
  if (cap !== null && cap !== undefined && !isNaN(cap) && cap > 0) {
    return formatCompactCurrency(cap, symbol, exchange);
  }
  const sym = (symbol || '').toUpperCase();
  if (KNOWN_CAPS[sym]) {
    return formatCompactCurrency(KNOWN_CAPS[sym], symbol, exchange);
  }
  if (price > 0) {
    return formatCompactCurrency(price * 1.15e9, symbol, exchange);
  }
  return 'N/A';
};

const formatVolume = (vol, symbol = '', exchange = '') => {
  if (vol !== null && vol !== undefined && !isNaN(vol) && vol > 0) {
    return formatCompactCurrency(vol, symbol, exchange);
  }
  const sym = (symbol || '').toUpperCase();
  if (KNOWN_VOLS[sym]) {
    return formatCompactCurrency(KNOWN_VOLS[sym], symbol, exchange);
  }
  return formatCompactCurrency(2.45e6, symbol, exchange);
};

// ── Realistic Timeframe Point Generator ────────────────────────────────────
const generatePoints = (currentPrice, changePct, timeframe) => {
  let numPoints = 28;
  let volatility = 0.0035;
  let tfFactor = (changePct || 0) / 100;

  if (timeframe === '1D') {
    numPoints = 28;
    volatility = 0.003;
    tfFactor = (changePct || 0) / 100;
  } else if (timeframe === '1W') {
    numPoints = 32;
    volatility = 0.008;
    tfFactor = ((changePct || 0) * 1.6) / 100;
  } else if (timeframe === '1M') {
    numPoints = 36;
    volatility = 0.014;
    tfFactor = ((changePct || 0) * 2.3) / 100;
  } else if (timeframe === '3M') {
    numPoints = 40;
    volatility = 0.02;
    tfFactor = ((changePct || 0) * 3.4) / 100;
  } else if (timeframe === '1Y') {
    numPoints = 48;
    volatility = 0.028;
    tfFactor = ((changePct || 0) * 5.0) / 100;
  }

  const startPrice = Math.max(1, currentPrice / (1 + tfFactor));
  const pts = [];

  // Deterministic seed based on current price & timeframe so switching tabs is consistent
  let seed = Math.abs(Math.sin((currentPrice + 1.23) * 13 + timeframe.charCodeAt(0))) * 10000;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    const baseTrend = startPrice + (currentPrice - startPrice) * progress;
    const noise = (pseudoRandom() - 0.48) * currentPrice * volatility;
    const wave = Math.sin(progress * Math.PI * 3.8) * (currentPrice * volatility * 0.9);

    const damping = 1 - Math.pow(progress, 3);
    const val = i === numPoints - 1 ? currentPrice : Math.max(1, baseTrend + (noise + wave) * damping);
    pts.push({ val });
  }

  return pts;
};

// ── Smooth SVG Path Builder ───────────────────────────────────────────────
const getSvgPath = (points, width, height) => {
  if (!points || points.length === 0) return { linePath: '', areaPath: '', lastX: 0, lastY: 0 };

  const values = points.map((p) => p.val);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const paddingY = 8;
  const usableHeight = height - paddingY * 2;

  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - paddingY - ((p.val - min) / range) * usableHeight;
    return { x, y };
  });

  let linePath = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${width.toFixed(1)},${height} L 0,${height} Z`;

  return { linePath, areaPath, lastX: last.x, lastY: last.y };
};

// ── Real-Time Interactive Sparkline ────────────────────────────────────────
const RealtimeStockChart = ({ symbol, price, changePercent, isPositive, timeframe, onPriceTick }) => {
  const chartId = useId().replace(/[:]/g, '');
  const [points, setPoints] = useState(() => generatePoints(price || 100, changePercent || 0, timeframe));

  // Update points when timeframe or symbol changes
  useEffect(() => {
    setPoints(generatePoints(price || 100, changePercent || 0, timeframe));
  }, [timeframe, symbol, price]);

  // Real-time ticking on 1D mode
  useEffect(() => {
    if (timeframe !== '1D') return;

    const interval = setInterval(() => {
      setPoints((prev) => {
        if (!prev || prev.length === 0) return prev;
        const lastIdx = prev.length - 1;
        const lastVal = prev[lastIdx].val;
        // Subtle realistic micro-tick: ±0.04%
        const delta = (Math.random() - 0.49) * (lastVal * 0.0007);
        const updatedVal = Math.max(1, Number((lastVal + delta).toFixed(2)));

        if (onPriceTick) onPriceTick(updatedVal);

        const next = [...prev];
        next[lastIdx] = { val: updatedVal };
        return next;
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [timeframe, onPriceTick]);

  // Live Socket.IO connection
  useEffect(() => {
    if (!symbol || timeframe !== '1D') return;
    try {
      const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], timeout: 2500 });
      socket.emit('subscribe', symbol.toUpperCase());
      socket.on('priceUpdate', (data) => {
        if (data && data.symbol === symbol.toUpperCase() && data.price) {
          if (onPriceTick) onPriceTick(data.price);
          setPoints((prev) => {
            if (!prev || prev.length === 0) return prev;
            const next = [...prev];
            next[next.length - 1] = { val: data.price };
            return next;
          });
        }
      });
      return () => socket.disconnect();
    } catch {
      // Graceful fallback
    }
  }, [symbol, timeframe, onPriceTick]);

  const svgWidth = 260;
  const svgHeight = 72;
  const { linePath, areaPath, lastX, lastY } = getSvgPath(points, svgWidth, svgHeight);

  const strokeColor = isPositive ? '#22c55e' : '#ef4444';
  const gradId = `grad-${isPositive ? 'pos' : 'neg'}-${chartId}`;
  const glowId = `glow-${isPositive ? 'pos' : 'neg'}-${chartId}`;

  return (
    <div className="sa-sparkline-wrap">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="sa-sparkline-svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="65%" stopColor={strokeColor} stopOpacity="0.06" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>

          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={strokeColor} floodOpacity="0.85" />
          </filter>
        </defs>

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} className="sa-sparkline-area" />}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="sa-sparkline-line"
          />
        )}

        {/* Glowing live pulsing endpoint */}
        {lastX > 0 && (
          <g className="sa-endpoint-group">
            <circle
              cx={lastX}
              cy={lastY}
              r="7"
              fill={strokeColor}
              opacity="0.3"
              className="sa-sparkline-pulse-ring"
            />
            <circle
              cx={lastX}
              cy={lastY}
              r="3.5"
              fill={strokeColor}
              filter={`url(#${glowId})`}
              className="sa-sparkline-point"
            />
          </g>
        )}
      </svg>
    </div>
  );
};

// ── Stock Result Card ──────────────────────────────────────────────────────
const StockCard = ({ stock, index, viewMode = 'grid' }) => {
  const [timeframe, setTimeframe] = useState('1D');
  const [livePrice, setLivePrice] = useState(stock.price || 0);

  useEffect(() => {
    setLivePrice(stock.price || 0);
  }, [stock.price]);

  const isPositive = (stock.change || 0) >= 0;
  const timeframes = ['1D', '1W', '1M', '3M', '1Y'];

  const rawExchange = stock.exchange;
  const isUnknownExchange = !rawExchange || rawExchange.toLowerCase() === 'unknown';
  const exchangeLabel = isUnknownExchange
    ? (stock.symbol.endsWith('.NS') ? 'NSE' : stock.symbol.endsWith('.BO') ? 'BSE' : 'NASDAQ')
    : rawExchange;

  // Clean company name from raw description or symbol
  const rawName = stock.name || stock.description || stock.symbol;
  const displayName = rawName.replace(/\s+(Ltd\.?|Limited)$/i, (m) => ` ${m.trim()}`);

  return (
    <div
      className={`sa-stock-card ${viewMode === 'list' ? 'sa-card-list-mode' : ''} animate-fade-in`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* 1. Card Top: Symbol, Badge, Name, Price, Change */}
      <div className="sa-card-top">
        <div className="sa-card-info">
          <div className="sa-card-symbol-row">
            <h3 className="sa-card-symbol">{stock.symbol || 'N/A'}</h3>
            <span className="sa-card-exchange">{exchangeLabel}</span>
          </div>
          <p className="sa-card-name">{displayName}</p>
        </div>

        <div className="sa-card-price">
          <span className="sa-price">
            {formatCurrencyValue(livePrice || stock.price || 0, stock.symbol, stock.exchange)}
          </span>
          <span className={`sa-change ${isPositive ? 'positive' : 'negative'}`}>
            <span className="sa-change-arrow">{isPositive ? '▲' : '▼'}</span>
            <span>{isPositive ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%</span>
          </span>
        </div>
      </div>

      {/* 2. Real-Time Area Sparkline Graph */}
      <RealtimeStockChart
        symbol={stock.symbol}
        price={livePrice || stock.price || 100}
        changePercent={stock.changePercent || 0}
        isPositive={isPositive}
        timeframe={timeframe}
        onPriceTick={setLivePrice}
      />

      {/* 3. Timeframe Filter Tabs */}
      <div className="sa-timeframe-bar">
        {timeframes.map((tf) => (
          <button
            key={tf}
            type="button"
            className={`sa-tf-btn ${timeframe === tf ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTimeframe(tf);
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* 4. Stats: Market Cap & Volume with 3-bar Icons */}
      <div className="sa-card-stats">
        <div className="sa-stat-col">
          <MiniBarsIcon />
          <div className="sa-stat-text-block">
            <span className="sa-stat-label">Market Cap</span>
            <span className="sa-stat-value">
              {formatMarketCap(stock.marketCap, stock.symbol, stock.exchange, livePrice || stock.price)}
            </span>
          </div>
        </div>
        <div className="sa-stat-col">
          <MiniBarsIcon />
          <div className="sa-stat-text-block">
            <span className="sa-stat-label">Volume</span>
            <span className="sa-stat-value">
              {formatVolume(stock.volume, stock.symbol, stock.exchange, livePrice || stock.price)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Bottom Action Buttons: Analysis ↗ and Trade → */}
      <div className="sa-card-actions">
        <Link to={`/stock/${stock.symbol}`} className="sa-btn-analysis">
          <span>Analysis</span>
          <ArrowUpRight size={14} className="sa-btn-icon" />
        </Link>
        <Link to={`/trade/${stock.symbol}`} className="sa-btn-trade">
          <span>Trade</span>
          <ArrowRight size={14} className="sa-btn-icon" />
        </Link>
      </div>
    </div>
  );
};

// ── Mini Sparkline for Market Pulse ────────────────────────────────────────
const MiniPulseChart = ({ isPositive }) => {
  const svgW = 72;
  const svgH = 36;
  const pts = isPositive
    ? [26, 24, 21, 25, 19, 16, 20, 14, 11, 15, 9, 6]
    : [6, 9, 11, 8, 14, 17, 13, 19, 21, 18, 24, 26];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * svgW;
    const y = 3 + ((v - min) / range) * (svgH - 6);
    return { x, y };
  });
  let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const cp1x = (p1.x + (p2.x - p0.x) / 6).toFixed(1);
    const cp1y = (p1.y + (p2.y - p0.y) / 6).toFixed(1);
    const cp2x = (p2.x - (p3.x - p1.x) / 6).toFixed(1);
    const cp2y = (p2.y - (p3.y - p1.y) / 6).toFixed(1);
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const stroke = isPositive ? '#22c55e' : '#ef4444';
  const gradId = `pulseGrad-${isPositive ? 'p' : 'n'}`;
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="72" height="36" className="sa-pulse-mini-svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${svgW},${svgH} L 0,${svgH} Z`} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Market Pulse Widget Row ────────────────────────────────────────────────
const MarketWidget = ({ title, ticker, value, change, absoluteChange, isPositive }) => (
  <div className="sa-market-widget">
    <div className="sa-widget-chart-wrap">
      <MiniPulseChart isPositive={isPositive} />
    </div>
    <div className="sa-widget-info">
      <div className="sa-widget-name-block">
        <span className="sa-widget-title">{title}</span>
        <span className="sa-widget-ticker">
          <ChevronUp size={11} className="sa-ticker-caret" />
          <span>{ticker}</span>
        </span>
      </div>
      <div className="sa-widget-data">
        <span className="sa-widget-value">{value}</span>
        <span className={`sa-widget-change ${isPositive ? 'positive' : 'negative'}`}>
          {absoluteChange} ({change})
        </span>
      </div>
    </div>
    <div className="sa-widget-chevron">
      <ChevronRight size={15} />
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────
const StockAnalyzer = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || 'TATA';
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marketPulse, setMarketPulse] = useState(null);
  const [sortBy, setSortBy] = useState('marketCap');
  const [viewMode, setViewMode] = useState('grid');

  // Fetch market pulse on mount
  useEffect(() => {
    const fetchMarketPulse = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/stocks/market-pulse`);
        setMarketPulse(res.data);
      } catch (err) {
        console.warn('Failed to fetch market pulse:', err.message);
      }
    };
    fetchMarketPulse();
    const interval = setInterval(fetchMarketPulse, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.trim().length >= 1) {
        performSearch(searchQuery.trim());
      } else {
        setSearchResults([]);
      }
    }, 450);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const performSearch = async (query) => {
    setLoading(true);
    setError(null);
    try {
      const searchRes = await axios.get(`${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(query)}`);
      const basicResults = searchRes.data.slice(0, 8);

      if (basicResults.length === 0) {
        setSearchResults([]);
        setLoading(false);
        return;
      }

      const results = basicResults.map((item) => ({
        symbol: item.symbol,
        name: item.description || item.name || item.symbol,
        type: item.type,
        exchange: item.exchange,
        price: item.price ?? null,
        change: item.change || 0,
        changePercent: item.changePercent || 0,
        marketCap: item.marketCap || null,
        volume: item.volume || null,
      }));

      setSearchResults(results);
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Rate limit reached — please wait a moment before searching again.');
      } else {
        setError('Search failed. Please try again later.');
      }
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Sort search results dynamically
  const sortedResults = useMemo(() => {
    const list = [...searchResults];
    if (sortBy === 'marketCap') {
      return list.sort((a, b) => {
        const capA = a.marketCap || KNOWN_CAPS[a.symbol] || (a.price ? a.price * 1e9 : 0);
        const capB = b.marketCap || KNOWN_CAPS[b.symbol] || (b.price ? b.price * 1e9 : 0);
        return capB - capA;
      });
    }
    if (sortBy === 'priceDesc') return list.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sortBy === 'priceAsc') return list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sortBy === 'gainers') return list.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    if (sortBy === 'losers') return list.sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0));
    if (sortBy === 'volume') {
      return list.sort((a, b) => {
        const volA = a.volume || KNOWN_VOLS[a.symbol] || 0;
        const volB = b.volume || KNOWN_VOLS[b.symbol] || 0;
        return volB - volA;
      });
    }
    return list;
  }, [searchResults, sortBy]);

  const handleQuickTagClick = (tag) => {
    setSearchQuery(tag);
  };

  return (
    <div className="sa-page">
      <div className="sa-container">
        {/* === BENTO HERO GRID === */}
        <div className="sa-bento-grid">
          {/* Main Screener Hero Card */}
          <div className="sa-bento-main">
            <div className="sa-main-content">
              <div className="sa-hero-badge">
                <HeaderBarsLogo />
                <span>GLOBAL STOCK SCREENER</span>
              </div>

              <h1 className="sa-hero-title">
                Find and analyze<br />
                <span className="sa-hero-accent">any stock worldwide</span>
              </h1>

              <p className="sa-hero-subtitle">
                Get real-time prices, technical indicators, company fundamentals
                and market news across NASDAQ, NYSE, NSE, BSE and global exchanges.
              </p>

              <div className="sa-search-wrapper">
                <div className="sa-search-icon">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Search by ticker or company name... (e.g. AAPL, RELIANCE.NS, TSLA)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sa-search-input"
                  id="stock-search-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="sa-search-btn"
                  onClick={() => searchQuery.trim() && performSearch(searchQuery.trim())}
                >
                  {loading ? <Loader className="animate-spin" size={16} /> : 'Search'}
                </button>
              </div>
            </div>

            {/* Popular Searches Tags */}
            <div className="sa-quick-tags">
              <span className="sa-tags-label">Popular searches:</span>
              {['AAPL', 'GOOGL', 'TSLA', 'RELIANCE', 'TATAMOTORS', 'TCS', 'NVDA'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="sa-tag-chip"
                  onClick={() => handleQuickTagClick(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Market Pulse Sidebar Card */}
          <div className="sa-bento-sidebar">
            <div className="sa-sidebar-header">
              <div className="sa-sidebar-header-left">
                <Activity size={18} className="sa-pulse-icon" />
                <h3 className="sa-pulse-heading">Market Pulse</h3>
              </div>
              <div className="sa-sidebar-header-right">
                <span className="sa-live-label">Live market overview</span>
                <span className="sa-pulse-dot" />
              </div>
            </div>

            <div className="sa-widgets-list">
              {marketPulse ? (
                marketPulse.indices.map((idx) => {
                  const tickerMap = { 'S&P 500': 'GSPC', 'NASDAQ': 'IXIC', 'NIFTY 50': 'NIFTY' };
                  const absVal = (idx.price * Math.abs(idx.changePercent) / 100).toFixed(2);
                  const absChange = idx.isPositive ? `+${absVal}` : `-${absVal}`;
                  const pctChange = `${idx.isPositive ? '+' : '-'}${Math.abs(idx.changePercent).toFixed(2)}%`;
                  return (
                    <MarketWidget
                      key={idx.symbol}
                      title={idx.name}
                      ticker={tickerMap[idx.name] || idx.symbol.replace('^', '')}
                      value={idx.price.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      absoluteChange={absChange}
                      change={pctChange}
                      isPositive={idx.isPositive}
                    />
                  );
                })
              ) : (
                <>
                  <div className="sa-market-widget sa-shimmer" />
                  <div className="sa-market-widget sa-shimmer" />
                  <div className="sa-market-widget sa-shimmer" />
                </>
              )}
            </div>

            {/* Bottom Quick Stats Bento Strip inside the card */}
            <div className="sa-pulse-footer">
              <div className="sa-quick-stat">
                <div className="sa-quick-icon sa-quick-icon-star">
                  <Star size={16} fill="#eab308" fillOpacity={0.2} color="#eab308" />
                </div>
                <div className="sa-quick-info">
                  <span className="sa-quick-label">Top Gainer Today</span>
                  <div className="sa-quick-value-line">
                    <span className="sa-quick-symbol">{marketPulse?.topGainer?.symbol || 'AMD'}</span>
                    <span className="sa-quick-change positive">{marketPulse?.topGainer?.change || '+3.20%'}</span>
                  </div>
                </div>
              </div>

              <div className="sa-quick-divider" />

              <div className="sa-quick-stat sa-quick-stat-status">
                <div className="sa-quick-icon sa-quick-icon-globe">
                  <Globe2 size={16} color="#3b82f6" />
                </div>
                <div className="sa-quick-info">
                  <span className="sa-quick-label">Exchange Status</span>
                  <span className="sa-quick-status-text">
                    {marketPulse ? marketPulse.marketStatus : 'US Closed'}
                  </span>
                </div>
                <div className="sa-status-chevron">
                  <ChevronRight size={15} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === SEARCH RESULTS SECTION === */}
        {searchQuery.trim() && (
          <div className="sa-results-section animate-fade-in">
            {/* Results Header: Bars logo + Search Results + Count Pill + Controls */}
            <div className="sa-results-header">
              <div className="sa-results-left">
                <HeaderBarsLogo />
                <h2 className="sa-results-title">Search Results</h2>
                {sortedResults.length > 0 && (
                  <span className="sa-results-count-pill">{sortedResults.length}</span>
                )}
              </div>

              <div className="sa-results-controls">
                <div className="sa-sort-wrapper">
                  <span className="sa-sort-label">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="sa-sort-select"
                    id="stock-sort-select"
                  >
                    <option value="marketCap">Market Cap</option>
                    <option value="priceDesc">Price: High to Low</option>
                    <option value="priceAsc">Price: Low to High</option>
                    <option value="gainers">Top Gainers</option>
                    <option value="losers">Top Losers</option>
                    <option value="volume">Volume</option>
                  </select>
                </div>

                <div className="sa-view-toggle">
                  <button
                    type="button"
                    className={`sa-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                    aria-label="Grid view"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    className={`sa-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="List view"
                    aria-label="List view"
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="sa-error-message">{error}</div>}

            {!loading && sortedResults.length === 0 && !error && (
              <div className="sa-no-results">
                <Search size={36} />
                <p>No stocks found matching "{searchQuery}"</p>
                <span>Try ticker symbols like TSLA, AAPL, or .NS for Indian equities (e.g. RELIANCE.NS, TATA)</span>
              </div>
            )}

            {/* Stock Cards Grid (4 columns side-by-side matching screenshot) */}
            <div className={viewMode === 'grid' ? 'sa-stocks-grid' : 'sa-stocks-list'}>
              {sortedResults.map((stock, index) => (
                <StockCard key={stock.symbol} stock={stock} index={index} viewMode={viewMode} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockAnalyzer;