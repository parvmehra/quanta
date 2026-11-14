import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart2, BookOpen, Briefcase, Newspaper, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useNotification } from '../contexts/NotificationContext';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import "./Hero.css";

const CompanyLogo = ({ type, size = 20 }) => {
  switch (type) {
    case 'apple':
      return (
        <svg width={size} height={size} viewBox="0 0 170 170" fill="currentColor">
          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12-14.44-6.1-9.35-10.87-20.03-14.3-32.05-3.43-12.01-5.14-23.3-5.14-33.87 0-14.79 3.73-26.79 11.19-36 7.46-9.22 16.89-13.93 28.3-14.13 5.44 0 11.39 1.48 17.84 4.45 6.45 2.97 10.51 4.51 12.19 4.63 1.25 0 5.66-1.61 13.24-4.83 7.58-3.22 13.91-4.63 18.99-4.24 14.36.85 25.55 6.42 33.57 16.71-12.62 7.64-18.8 18.06-18.55 31.27.26 10.28 4.17 18.88 11.74 25.8 7.57 6.92 16.7 10.97 27.4 12.15-2.22 6.85-4.87 13.78-7.96 20.81zM119.22 33.56c0-7.39 2.65-14.28 7.95-20.67 5.3-6.39 11.89-10.42 19.77-12.09.22 1.08.33 2.17.33 3.26 0 7.39-2.75 14.4-8.25 21.03-5.5 6.63-12.19 10.55-20.07 11.76-.11-1.09-.17-2.18-.17-3.29z"/>
        </svg>
      );
    case 'google':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
        </svg>
      );
    case 'tesla':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4.5c3.2 0 6.1 1.1 8.5 2.9l1.5-2C19.1 3.2 15.7 2 12 2 8.3 2 4.9 3.2 2 5.4l1.5 2C5.9 5.6 8.8 4.5 12 4.5zm0 3.8c-2.3 0-4.4.8-6.1 2.1l1.3 1.7c1.4-1 3-1.6 4.8-1.6s3.4.6 4.8 1.6l1.3-1.7C16.4 9.1 14.3 8.3 12 8.3zm0 3.7c-.7 0-1.2.5-1.2 1.2v7.7h2.4v-7.7c0-.7-.5-1.2-1.2-1.2z"/>
        </svg>
      );
    case 'reliance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M7 8h5a3 3 0 0 1 0 6H7V8zm0 6h4l3 4h-2.5L9 14H7v4H5V8h2z" fill="currentColor"/>
        </svg>
      );
    case 'tatamotors':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M8 9h8v2.2H13v6h-2v-6H8V9z" fill="currentColor"/>
        </svg>
      );
    case 'tcs':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/>
          <text x="12" y="15" fontSize="8" fontWeight="800" textAnchor="middle" fill="currentColor">TCS</text>
        </svg>
      );
    case 'nvidia':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.2 16.5c-1.3-.8-2.2-2.2-2.2-3.8 0-2.4 2-4.4 4.4-4.4 2 0 3.7 1.3 4.2 3.1h2.2c-.6-3-3.1-5.2-6.4-5.2-3.6 0-6.6 2.9-6.6 6.5 0 2.4 1.3 4.5 3.3 5.6l1.1-1.8zm5.5-3.8c0-1.3-1-2.3-2.3-2.3s-2.3 1-2.3 2.3 1 2.3 2.3 2.3c1.3 0 2.3-1 2.3-2.3z" fill="#76B900"/>
        </svg>
      );
    case 'microsoft':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
          <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
          <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
          <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
        </svg>
      );
    default:
      return <TrendingUp size={size} />;
  }
};

const CURATED_STOCKS = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    displaySymbol: 'AAPL',
    exchange: 'NASDAQ',
    currency: '$',
    country: 'US',
    logo: 'apple',
    basePrice: 189.42,
    baseChange: 2.31,
    baseChangePercent: 1.24,
    marketCap: '$2.96T',
    peRatio: '32.4',
    fiftyTwoHigh: '$199.62',
    fiftyTwoLow: '$124.17',
    priceDecimals: 2,
    xLabels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    displaySymbol: 'GOOGL',
    exchange: 'NASDAQ',
    currency: '$',
    country: 'US',
    logo: 'google',
    basePrice: 178.60,
    baseChange: 3.15,
    baseChangePercent: 1.80,
    marketCap: '$2.24T',
    peRatio: '25.6',
    fiftyTwoHigh: '$191.75',
    fiftyTwoLow: '$120.21',
    priceDecimals: 2,
    xLabels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    displaySymbol: 'TSLA',
    exchange: 'NASDAQ',
    currency: '$',
    country: 'US',
    logo: 'tesla',
    basePrice: 243.80,
    baseChange: -2.10,
    baseChangePercent: -0.86,
    marketCap: '$770B',
    peRatio: '68.2',
    fiftyTwoHigh: '$271.00',
    fiftyTwoLow: '$138.80',
    priceDecimals: 2,
    xLabels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'RELIANCE.NS',
    name: 'Reliance Industries Ltd.',
    displaySymbol: 'RELIANCE',
    exchange: 'NSE',
    currency: '₹',
    country: 'IN',
    logo: 'reliance',
    basePrice: 1171.30,
    baseChange: 13.30,
    baseChangePercent: 1.15,
    marketCap: '₹15.85T',
    peRatio: '26.4',
    fiftyTwoHigh: '₹1,608.80',
    fiftyTwoLow: '₹1,155.60',
    priceDecimals: 2,
    xLabels: ['9:15', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'TATAMOTORS.NS',
    name: 'Tata Motors Limited',
    displaySymbol: 'TATAMOTORS',
    exchange: 'NSE',
    currency: '₹',
    country: 'IN',
    logo: 'tatamotors',
    basePrice: 885.40,
    baseChange: 12.60,
    baseChangePercent: 1.44,
    marketCap: '₹3.26T',
    peRatio: '10.8',
    fiftyTwoHigh: '₹1,179.05',
    fiftyTwoLow: '₹621.50',
    priceDecimals: 2,
    xLabels: ['9:15', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'TCS.NS',
    name: 'Tata Consultancy Services',
    displaySymbol: 'TCS',
    exchange: 'NSE',
    currency: '₹',
    country: 'IN',
    logo: 'tcs',
    basePrice: 3680.25,
    baseChange: 38.75,
    baseChangePercent: 1.07,
    marketCap: '₹13.31T',
    peRatio: '28.1',
    fiftyTwoHigh: '₹4,592.25',
    fiftyTwoLow: '₹3,313.00',
    priceDecimals: 2,
    xLabels: ['9:15', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    displaySymbol: 'NVDA',
    exchange: 'NASDAQ',
    currency: '$',
    country: 'US',
    logo: 'nvidia',
    basePrice: 138.25,
    baseChange: 4.12,
    baseChangePercent: 3.07,
    marketCap: '$3.39T',
    peRatio: '58.5',
    fiftyTwoHigh: '$140.76',
    fiftyTwoLow: '$39.23',
    priceDecimals: 2,
    xLabels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    displaySymbol: 'MSFT',
    exchange: 'NASDAQ',
    currency: '$',
    country: 'US',
    logo: 'microsoft',
    basePrice: 428.50,
    baseChange: 3.45,
    baseChangePercent: 0.81,
    marketCap: '$3.18T',
    peRatio: '34.2',
    fiftyTwoHigh: '$468.35',
    fiftyTwoLow: '$309.45',
    priceDecimals: 2,
    xLabels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30']
  }
];

const TIME_TABS = ['1D', '1W', '1M', '1Y', '5Y', 'All'];

const formatVal = (currency, val, decimals = 2, showPlus = false) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  const sign = num < 0 ? '-' : (showPlus && num > 0 ? '+' : '');
  const formatted = Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sign}${currency}${formatted}`;
};

const generateCandlesForStock = (stock, currentPrice, currentChange, timeframe, historyData = []) => {
  const p = currentPrice || stock.basePrice;
  const isPos = currentChange >= 0;

  if (historyData && historyData.length > 5 && timeframe !== '1D') {
    let sliced = [];
    if (timeframe === '1W') sliced = historyData.slice(-7);
    else if (timeframe === '1M') sliced = historyData.slice(-22);
    else if (timeframe === '1Y') {
      sliced = historyData.filter((_, idx) => idx % 3 === 0).slice(-26);
    } else {
      sliced = historyData.filter((_, idx) => idx % 5 === 0).slice(-24);
    }

    if (sliced.length >= 5) {
      return sliced.map((pt, i) => {
        const o = pt.open || pt.price * 0.995;
        const c = pt.price || pt.close || o;
        const h = pt.high || Math.max(o, c) * 1.006;
        const l = pt.low || Math.min(o, c) * 0.994;
        const v = pt.volume || Math.floor(50 + (i % 7) * 12);
        return { o, h, l, c, v, label: pt.date ? pt.date.slice(5) : `#${i + 1}` };
      });
    }
  }

  const candleCount = 20;
  const delta = (p * (stock.baseChangePercent || 1.2)) / 100;
  const startP = p - delta;
  const volBase = 65;

  const candles = [];
  let cur = startP;

  for (let i = 0; i < candleCount; i++) {
    const trendWeight = isPos ? 0.62 : 0.38;
    const isUp = Math.random() < trendWeight;
    const variance = (Math.random() * 0.006 + 0.002) * p;
    
    let o = cur;
    let c = isUp ? o + variance : o - variance;
    if (i === candleCount - 1) c = p;

    const highExtra = Math.random() * 0.004 * p;
    const lowExtra = Math.random() * 0.004 * p;
    const h = Math.max(o, c) + highExtra;
    const l = Math.min(o, c) - lowExtra;

    const v = Math.floor(volBase + Math.sin(i * 0.6) * 25 + (Math.random() * 20));
    candles.push({
      o: Number(o.toFixed(2)),
      h: Number(h.toFixed(2)),
      l: Number(l.toFixed(2)),
      c: Number(c.toFixed(2)),
      v,
      label: stock.xLabels[Math.floor((i / candleCount) * stock.xLabels.length)] || ''
    });

    cur = c;
  }

  return candles;
};

const CandleChart = ({ candles, currency, decimals = 2, xLabels = [] }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const W = 580;
  const H = 160;
  const volH = 32;
  const PAD_L = 8;
  const PAD_R = 56;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - volH - 12;

  const allVals = candles.flatMap(c => [c.h, c.l]);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const buffer = (rawMax - rawMin) * 0.08 || 1;
  const minP = rawMin - buffer;
  const maxP = rawMax + buffer;
  const range = maxP - minP;

  const py = (v) => chartH - ((v - minP) / range) * chartH + 6;
  const n = candles.length;
  const colW = chartW / n;
  const candleW = Math.max(Math.floor(colW * 0.58), 4);
  const cx = (i) => PAD_L + (i + 0.5) * colW;

  const maxVol = Math.max(...candles.map(c => c.v || 50), 100);

  const gridSteps = 4;
  const gridPrices = useMemo(() => {
    return Array.from({ length: gridSteps + 1 }, (_, i) => {
      const p = maxP - (i / gridSteps) * range;
      return Number(p.toFixed(decimals));
    });
  }, [minP, maxP, range, decimals]);

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * W;
    const relX = svgX - PAD_L;
    const idx = Math.floor(relX / colW);
    if (idx >= 0 && idx < n) {
      setHoverIdx(idx);
    } else {
      setHoverIdx(null);
    }
  };

  const handleMouseLeave = () => setHoverIdx(null);

  const activeCandle = hoverIdx !== null && candles[hoverIdx] ? candles[hoverIdx] : null;

  return (
    <div className="hv-chart-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="hv-chart-svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="Stock Candlestick Chart"
      >
        {gridPrices.map(p => (
          <line
            key={p}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={py(p)}
            y2={py(p)}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 2"
            strokeWidth="1"
          />
        ))}

        {candles.map((c, i) => {
          const x = cx(i);
          const barH = ((c.v || 50) / maxVol) * (volH - 6);
          const isUp = c.c >= c.o;
          const isHovered = hoverIdx === i;
          return (
            <rect
              key={`vol-${i}`}
              x={x - candleW / 2}
              y={H - barH}
              width={candleW}
              height={Math.max(barH, 2)}
              fill={isUp ? '#22C55E' : '#EF4444'}
              opacity={isHovered ? 0.75 : 0.32}
              rx="1"
            />
          );
        })}

        {candles.map((c, i) => {
          const x = cx(i);
          const isUp = c.c >= c.o;
          const color = isUp ? '#22C55E' : '#EF4444';
          const bodyTop = py(Math.max(c.o, c.c));
          const bodyBot = py(Math.min(c.o, c.c));
          const bodyH = Math.max(bodyBot - bodyTop, 1.5);
          const isHovered = hoverIdx === i;

          return (
            <g key={`candle-${i}`} className={`candle-group${isHovered ? ' active' : ''}`}>
              <line
                x1={x}
                x2={x}
                y1={py(c.h)}
                y2={py(c.l)}
                stroke={color}
                strokeWidth={isHovered ? 1.8 : 1.2}
                opacity={isHovered ? 1 : 0.8}
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
                opacity={isHovered ? 1 : 0.9}
                rx="1"
              />
            </g>
          );
        })}

        {hoverIdx !== null && (
          <line
            x1={cx(hoverIdx)}
            x2={cx(hoverIdx)}
            y1={0}
            y2={H}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="3 3"
            strokeWidth="1"
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="hv-y-labels" aria-hidden="true">
        {gridPrices.map((v, i) => (
          <span key={i} className="hv-y-label">
            {v.toFixed(decimals)}
          </span>
        ))}
      </div>

      {activeCandle && hoverIdx !== null && (
        <div
          className="hv-tooltip"
          style={{
            left: `${Math.min(Math.max((cx(hoverIdx) / W) * 100, 18), 78)}%`
          }}
        >
          <div className="hv-tooltip-header">
            <span>{activeCandle.label || 'Intraday'}</span>
            <span className={activeCandle.c >= activeCandle.o ? 'positive' : 'negative'}>
              {activeCandle.c >= activeCandle.o ? '▲ Bullish' : '▼ Bearish'}
            </span>
          </div>
          <div className="hv-tooltip-grid">
            <div><span className="hv-tt-label">O:</span> {currency}{activeCandle.o.toFixed(decimals)}</div>
            <div><span className="hv-tt-label">H:</span> {currency}{activeCandle.h.toFixed(decimals)}</div>
            <div><span className="hv-tt-label">L:</span> {currency}{activeCandle.l.toFixed(decimals)}</div>
            <div><span className="hv-tt-label">C:</span> {currency}{activeCandle.c.toFixed(decimals)}</div>
          </div>
        </div>
      )}

      <div className="hv-x-labels" aria-hidden="true">
        {xLabels.map((l, i) => (
          <span key={i} className="hv-x-label">{l}</span>
        ))}
      </div>
    </div>
  );
};

const Hero = () => {
  const [selectedStock, setSelectedStock] = useState(CURATED_STOCKS[0]);
  const [activeTab, setActiveTab] = useState('1D');
  const [livePrice, setLivePrice] = useState(CURATED_STOCKS[0].basePrice);
  const [priceChange, setPriceChange] = useState(CURATED_STOCKS[0].baseChange);
  const [changePercent, setChangePercent] = useState(CURATED_STOCKS[0].baseChangePercent);
  const [isUpdating, setIsUpdating] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [metrics, setMetrics] = useState({
    marketCap: CURATED_STOCKS[0].marketCap,
    peRatio: CURATED_STOCKS[0].peRatio,
    fiftyTwoHigh: CURATED_STOCKS[0].fiftyTwoHigh,
    fiftyTwoLow: CURATED_STOCKS[0].fiftyTwoLow
  });

  const navigate = useNavigate();
  const { addNotification } = useNotification();

  useEffect(() => {
    let isMounted = true;
    setIsUpdating(true);

    setLivePrice(selectedStock.basePrice);
    setPriceChange(selectedStock.baseChange);
    setChangePercent(selectedStock.baseChangePercent);
    setMetrics({
      marketCap: selectedStock.marketCap,
      peRatio: selectedStock.peRatio,
      fiftyTwoHigh: selectedStock.fiftyTwoHigh,
      fiftyTwoLow: selectedStock.fiftyTwoLow
    });

    const fetchStockData = async () => {
      try {
        const quoteRes = await axios.get(`${API_BASE_URL}/api/stocks/quote/${encodeURIComponent(selectedStock.symbol)}`, {
          timeout: 4000
        });
        if (isMounted && quoteRes.data && quoteRes.data.price) {
          const q = quoteRes.data;
          setLivePrice(q.price);
          setPriceChange(q.change || 0);
          setChangePercent(q.changePercent || 0);

          setMetrics(prev => ({
            ...prev,
            marketCap: q.marketCap ? `${selectedStock.currency}${(q.marketCap / 1e12).toFixed(2)}T` : prev.marketCap,
            fiftyTwoHigh: q.high ? `${selectedStock.currency}${q.high.toFixed(selectedStock.priceDecimals)}` : prev.fiftyTwoHigh,
            fiftyTwoLow: q.low ? `${selectedStock.currency}${q.low.toFixed(selectedStock.priceDecimals)}` : prev.fiftyTwoLow
          }));
        }
      } catch (err) {
      }

      try {
        const histRes = await axios.get(`${API_BASE_URL}/api/stocks/history/${encodeURIComponent(selectedStock.symbol)}`, {
          timeout: 4500
        });
        if (isMounted && Array.isArray(histRes.data) && histRes.data.length > 0) {
          setHistoryData(histRes.data);
        }
      } catch (err) {
      } finally {
        if (isMounted) setIsUpdating(false);
      }
    };

    fetchStockData();

    return () => {
      isMounted = false;
    };
  }, [selectedStock]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLivePrice(prev => {
        const microDeltaPercent = (Math.random() - 0.48) * 0.08;
        const tickVal = (prev * microDeltaPercent) / 100;
        const newPrice = Number((prev + tickVal).toFixed(selectedStock.priceDecimals));
        
        setPriceChange(prevChg => Number((prevChg + tickVal).toFixed(selectedStock.priceDecimals)));
        return newPrice;
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [selectedStock]);

  const candles = useMemo(() => {
    return generateCandlesForStock(
      selectedStock,
      livePrice,
      priceChange,
      activeTab,
      historyData
    );
  }, [selectedStock, livePrice, priceChange, activeTab, historyData]);

  const isPositive = priceChange >= 0;

  const handleProtected = (e, path) => {
    e.preventDefault();
    const auth = localStorage.getItem('isAuthenticated') === 'true';
    if (!auth) {
      addNotification('Sign in required', 'Please sign in to access this feature.', 'info');
      navigate('/login');
    } else {
      navigate(path);
    }
  };

  const FEATURES = [
    {
      icon: BarChart2,
      iconClass: 'hf-icon-green',
      title: 'Stock Analysis',
      desc: 'Detailed charts, indicators and price analysis.',
      path: '/analyzer',
      protected: true,
    },
    {
      icon: BookOpen,
      iconClass: 'hf-icon-blue',
      title: 'Company Fundamentals',
      desc: 'Financial ratios, earnings and key metrics.',
      path: '/analyzer',
      protected: true,
    },
    {
      icon: Briefcase,
      iconClass: 'hf-icon-amber',
      title: 'Portfolio Tracking',
      desc: 'Track performance and analyze your holdings.',
      path: '/portfolio',
      protected: true,
    },
    {
      icon: Newspaper,
      iconClass: 'hf-icon-purple',
      title: 'Market News',
      desc: 'Stay updated with the latest market news.',
      path: '/about',
      protected: false,
    },
  ];

  return (
    <>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-inner">
          <div className="hero-body">
            <div className="hero-content">
              <span className="hero-eyebrow">DATA. INSIGHTS. BETTER DECISIONS.</span>

              <h1 className="hero-title" id="hero-heading">
                Understand the market.<br />
                Make <span className="hero-title-accent">better decisions.</span>
              </h1>

              <p className="hero-description">
                Explore real-time data, company fundamentals, technical indicators
                and market news — all in one place.
              </p>

              <div className="hero-cta">
                <button
                  className="btn-hero-primary"
                  onClick={e => handleProtected(e, '/analyzer')}
                  id="hero-cta-analyze"
                >
                  Analyze a stock <ArrowRight size={16} />
                </button>
                <Link to="/about" className="btn-hero-secondary" id="hero-cta-explore">
                  Explore platform
                </Link>
              </div>

              <div className="hero-stats">
                <div className="hero-stat-item">
                  <span className="hero-stat-number">5K+</span>
                  <span className="hero-stat-label">Stocks covered</span>
                </div>
                <div className="hero-stat-item">
                  <span className="hero-stat-number">50+</span>
                  <span className="hero-stat-label">Technical indicators</span>
                </div>
                <div className="hero-stat-item">
                  <span className="hero-stat-number">Real-time</span>
                  <span className="hero-stat-label">Market data</span>
                </div>
                <div className="hero-stat-item">
                  <span className="hero-stat-number">Built for</span>
                  <span className="hero-stat-label">Retail investors</span>
                </div>
              </div>
            </div>

            <div className="hero-visual" aria-label="Interactive Stock Chart Card">
              
              <div className="hv-stocks-bar" role="tablist" aria-label="Select stock">
                <span className="hv-bar-label">WATCHLIST:</span>
                <div className="hv-stocks-scroll">
                  {CURATED_STOCKS.map(stk => (
                    <button
                      key={stk.symbol}
                      className={`hv-stock-chip${selectedStock.symbol === stk.symbol ? ' active' : ''}`}
                      onClick={() => setSelectedStock(stk)}
                      role="tab"
                      aria-selected={selectedStock.symbol === stk.symbol}
                    >
                      <span className="hv-chip-logo">
                        <CompanyLogo type={stk.logo} size={14} />
                      </span>
                      <span className="hv-chip-symbol">{stk.displaySymbol}</span>
                      <span className="hv-chip-tag">{stk.country}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="hv-header">
                <div className="hv-stock-info">
                  <div className="hv-stock-logo">
                    <CompanyLogo type={selectedStock.logo} size={22} />
                  </div>
                  <div>
                    <div className="hv-symbol-row">
                      <span className="hv-stock-symbol">{selectedStock.displaySymbol}</span>
                      <span className="hv-exchange-badge">{selectedStock.exchange}</span>
                      <span className="hv-live-badge">
                        <span className="hv-live-dot" /> LIVE
                      </span>
                    </div>
                    <span className="hv-stock-name">{selectedStock.name}</span>
                  </div>
                </div>

                <div className="hv-time-tabs" role="tablist" aria-label="Chart time range">
                  {TIME_TABS.map(tab => (
                    <button
                      key={tab}
                      className={`hv-time-tab${activeTab === tab ? ' active' : ''}`}
                      role="tab"
                      aria-selected={activeTab === tab}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hv-price-section">
                <span className="hv-price">
                  {formatVal(selectedStock.currency, livePrice, selectedStock.priceDecimals)}
                </span>
                <span className={`hv-price-change ${isPositive ? 'positive' : 'negative'}`}>
                  {formatVal(selectedStock.currency, priceChange, selectedStock.priceDecimals, true)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                </span>
                {isUpdating && <RefreshCw size={13} className="hv-refresh-spinner" />}
              </div>

              <div className="hv-chart-area">
                <CandleChart
                  candles={candles}
                  currency={selectedStock.currency}
                  decimals={selectedStock.priceDecimals}
                  xLabels={selectedStock.xLabels}
                />
              </div>

              <div className="hv-metrics">
                <div className="hv-metric">
                  <span className="hv-metric-label">Market Cap</span>
                  <span className="hv-metric-value">{metrics.marketCap}</span>
                </div>
                <div className="hv-metric">
                  <span className="hv-metric-label">P/E Ratio</span>
                  <span className="hv-metric-value">{metrics.peRatio}</span>
                </div>
                <div className="hv-metric">
                  <span className="hv-metric-label">52W High</span>
                  <span className="hv-metric-value">{metrics.fiftyTwoHigh}</span>
                </div>
                <div className="hv-metric">
                  <span className="hv-metric-label">52W Low</span>
                  <span className="hv-metric-value">{metrics.fiftyTwoLow}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      <div className="hero-features">
        <div className="hero-features-inner">
          {FEATURES.map(({ icon: Icon, iconClass, title, desc, path, protected: prot }) => (
            <a
              key={title}
              href={path}
              className="hf-card"
              onClick={prot ? e => handleProtected(e, path) : undefined}
            >
              <div className={`hf-icon ${iconClass}`}>
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <div className="hf-body">
                <div className="hf-title">{title}</div>
                <div className="hf-desc">{desc}</div>
              </div>
              <ArrowRight size={16} className="hf-arrow" />
            </a>
          ))}
        </div>
      </div>
    </>
  );
};

export default Hero;
