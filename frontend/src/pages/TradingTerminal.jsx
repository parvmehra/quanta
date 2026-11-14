import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import QuantaAdvisor from '../components/QuantaAdvisor';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config';
import { 
  ArrowLeft, Wifi, WifiOff, Star, Sparkles, TrendingUp, TrendingDown, 
  DollarSign, Activity, AlertCircle, ArrowUpRight, ArrowDownRight, 
  HelpCircle, RefreshCw, Layers, ShieldAlert, Cpu, Search, X
} from 'lucide-react';
import { 
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import LightweightCandlestickChart from '../components/LightweightCandlestickChart';
import toast from 'react-hot-toast';
import { formatCurrencyValue, formatCompactCurrency, getCurrencyCode } from '../utils/currency';
import './TradingTerminal.css';

const formatLargeNumber = (num, symbol = '', exchange = '') => {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return formatCompactCurrency(num, symbol, exchange);
};

const ChartTooltip = ({ active, payload, currencyCode = 'USD' }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isUp = data.close >= data.open;
    const currencySymbol = currencyCode === 'INR' ? '₹' : '$';
    return (
      <div className="tt-chart-tooltip">
        <p className="tt-tooltip-date">{data.date}</p>
        <div className="tt-tooltip-row">
          <span>Open:</span>
          <span className="tt-tooltip-val">{currencySymbol}{data.open.toFixed(2)}</span>
        </div>
        <div className="tt-tooltip-row">
          <span>High:</span>
          <span className="tt-tooltip-val">{currencySymbol}{data.high.toFixed(2)}</span>
        </div>
        <div className="tt-tooltip-row">
          <span>Low:</span>
          <span className="tt-tooltip-val">{currencySymbol}{data.low.toFixed(2)}</span>
        </div>
        <div className="tt-tooltip-row">
          <span>Close:</span>
          <span className={`tt-tooltip-val ${isUp ? 'up' : 'down'}`}>
            {currencySymbol}{data.close.toFixed(2)}
          </span>
        </div>
        <div className="tt-tooltip-row">
          <span>Volume:</span>
          <span className="tt-tooltip-val">{data.volume.toLocaleString()}</span>
        </div>
        {data.sma !== undefined && (
          <div className="tt-tooltip-row" style={{ color: '#2563eb' }}>
            <span>SMA (15):</span>
            <span className="tt-tooltip-val">{currencySymbol}{data.sma.toFixed(2)}</span>
          </div>
        )}
        {data.rsi !== undefined && (
          <div className="tt-tooltip-row" style={{ color: '#ca8a04' }}>
            <span>RSI (14):</span>
            <span className="tt-tooltip-val">{data.rsi.toFixed(1)}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const TradingTerminal = () => {
  const { symbol: routeSymbol } = useParams();
  const symbol = (routeSymbol || 'AAPL').toUpperCase();
  const navigate = useNavigate();

  const [isAiOpen, setIsAiOpen] = useState(true);
  const [highlightedOrder, setHighlightedOrder] = useState(null);
  const orderPanelRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef(null);
  const socketRef = useRef(null);

  const [stockData, setStockData] = useState(null);
  const [stockHistory, setStockHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [recentTrades, setRecentTrades] = useState([]);

  const [isInWatchlist, setIsInWatchlist] = useState(() => {
    const saved = localStorage.getItem('quanta-watchlist');
    if (saved) {
      try {
        return JSON.parse(saved).includes(symbol?.toUpperCase());
      } catch (e) {}
    }
    return false;
  });

  const [timeframe, setTimeframe] = useState('ALL');
  const [showSMA, setShowSMA] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRSI, setShowRSI] = useState(false);

  const [isBuy, setIsBuy] = useState(true);
  const [productType, setProductType] = useState('MIS');
  const [orderType, setOrderType] = useState('LIMIT');
  
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [triggerPrice, setTriggerPrice] = useState(0);
  
  const [hasTarget, setHasTarget] = useState(false);
  const [targetPrice, setTargetPrice] = useState(0);
  const [hasStopLoss, setHasStopLoss] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState(0);

  const [portfolioItems, setPortfolioItems] = useState([]);
  const [walletBalance, setWalletBalance] = useState(() => {
    const saved = localStorage.getItem('quanta-wallet');
    return saved ? parseFloat(saved) : 50000.00;
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [marketDepth, setMarketDepth] = useState({ bids: [], asks: [], buyPressure: 50 });

  const fetchStockQuote = async () => {
    try {
      setLoading(true);
      const quoteRes = await axios.get(`${API_BASE_URL}/api/stocks/quote/${symbol}`);
      setStockData(quoteRes.data);
      setPrice(quoteRes.data.price || 0);
      setTriggerPrice(quoteRes.data.price ? parseFloat((quoteRes.data.price * 0.98).toFixed(2)) : 0);
      setTargetPrice(quoteRes.data.price ? parseFloat((quoteRes.data.price * 1.05).toFixed(2)) : 0);
      setStopLossPrice(quoteRes.data.price ? parseFloat((quoteRes.data.price * 0.95).toFixed(2)) : 0);
      setError(null);
    } catch (err) {
      console.error("Failed quote fetch:", err);
      setError(`Could not fetch data for ticker "${symbol}". Please check the symbol and try again.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockHistory = async () => {
    try {
      const historyRes = await axios.get(`${API_BASE_URL}/api/stocks/history/${symbol}`);
      setStockHistory(historyRes.data || []);
    } catch (err) {
      console.error("Failed history fetch:", err);
    }
  };

  const fetchPortfolio = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/protfolio`, { withCredentials: true });
      setPortfolioItems(res.data || []);
    } catch (e) {
      console.warn("Portfolio fetch failed", e);
    }
  };

  useEffect(() => {
    if (!symbol) return;
    fetchStockQuote();
    fetchStockHistory();
    fetchPortfolio();

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setWsConnected(true);
      socket.emit('subscribe', symbol.toUpperCase());
    });

    socket.on('priceUpdate', (data) => {
      setIsUpdating(true);
      setStockData(prev => {
        if (!prev) return data;
        return { ...prev, ...data };
      });
      setTimeout(() => setIsUpdating(false), 300);
    });

    socket.on('disconnect', () => {
      setWsConnected(false);
    });

    return () => {
      socket.emit('unsubscribe', symbol.toUpperCase());
      socket.disconnect();
      socketRef.current = null;
    };
  }, [symbol]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(res.data || []);
      } catch (e) {
        console.warn("Stock search in Trade failed", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (orderType === 'MARKET' && stockData) {
      setPrice(stockData.price);
    }
  }, [orderType, stockData]);

  useEffect(() => {
    if (!stockData?.price) return;

    const generateDepth = () => {
      const currentPrice = stockData.price;
      const step = 0.05;
      
      const bids = [];
      const asks = [];
      let totalBidQty = 0;
      let totalAskQty = 0;

      for (let i = 0; i < 5; i++) {
        const bidPrice = currentPrice - (i + 1) * step + (Math.random() - 0.5) * 0.02;
        const bidQty = Math.floor(Math.random() * 300) + 50;
        bids.push({ price: parseFloat(bidPrice.toFixed(2)), qty: bidQty });
        totalBidQty += bidQty;

        const askPrice = currentPrice + (i + 1) * step + (Math.random() - 0.5) * 0.02;
        const askQty = Math.floor(Math.random() * 300) + 50;
        asks.push({ price: parseFloat(askPrice.toFixed(2)), qty: askQty });
        totalAskQty += askQty;
      }

      bids.sort((a, b) => b.price - a.price);
      asks.sort((a, b) => a.price - b.price);

      const pressure = Math.round((totalBidQty / (totalBidQty + totalAskQty)) * 100);

      setMarketDepth({ bids, asks, buyPressure: pressure });
    };

    generateDepth();
    const timer = setInterval(generateDepth, 3500);
    return () => clearInterval(timer);
  }, [stockData?.price]);

  const handleWatchlistToggle = () => {
    const saved = localStorage.getItem('quanta-watchlist');
    let items = [];
    try {
      if (saved) items = JSON.parse(saved);
    } catch (e) {}

    const newStatus = !isInWatchlist;
    setIsInWatchlist(newStatus);

    if (newStatus) {
      if (!items.includes(symbol.toUpperCase())) items.push(symbol.toUpperCase());
      toast.success(`${symbol.toUpperCase()} added to Watchlist`);
    } else {
      items = items.filter(i => i !== symbol.toUpperCase());
      toast.success(`${symbol.toUpperCase()} removed from Watchlist`);
    }
    localStorage.setItem('quanta-watchlist', JSON.stringify(items));
  };

  const getProcessedChartData = () => {
    if (!stockHistory || stockHistory.length === 0) return [];

    let raw = [...stockHistory];

    if (timeframe === '1D') raw = raw.slice(-5);
    else if (timeframe === '1W') raw = raw.slice(-10);
    else if (timeframe === '1M') raw = raw.slice(-20);
    else if (timeframe === '3M') raw = raw.slice(-45);
    else if (timeframe === '1Y') raw = raw.slice(-85);

    const withIndicators = raw.map((d, index, arr) => {
      const open = d.open || d.price * 0.99;
      const close = d.price;
      const high = d.high || Math.max(open, close) * 1.01;
      const low = d.low || Math.min(open, close) * 0.99;

      let sma = undefined;
      const smaPeriod = 15;
      if (index >= smaPeriod - 1) {
        const slice = arr.slice(index - smaPeriod + 1, index + 1);
        const sum = slice.reduce((acc, curr) => acc + curr.price, 0);
        sma = sum / smaPeriod;
      }

      let bbUpper = undefined;
      let bbLower = undefined;
      let bbMiddle = undefined;
      const bbPeriod = 20;
      if (index >= bbPeriod - 1) {
        const slice = arr.slice(index - bbPeriod + 1, index + 1);
        const prices = slice.map(s => s.price);
        const mean = prices.reduce((acc, curr) => acc + curr, 0) / bbPeriod;
        const variance = prices.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0) / bbPeriod;
        const stdDev = Math.sqrt(variance);
        bbMiddle = mean;
        bbUpper = mean + 2 * stdDev;
        bbLower = mean - 2 * stdDev;
      }

      let rsi = 50;
      const rsiPeriod = 14;
      if (index >= rsiPeriod) {
        let gains = 0;
        let losses = 0;
        for (let i = index - rsiPeriod + 1; i <= index; i++) {
          const diff = arr[i].price - arr[i - 1].price;
          if (diff > 0) gains += diff;
          else losses += Math.abs(diff);
        }
        const avgGain = gains / rsiPeriod;
        const avgLoss = losses / rsiPeriod;
        if (avgLoss === 0) rsi = 100;
        else {
          const rs = avgGain / avgLoss;
          rsi = 100 - 100 / (1 + rs);
        }
      }

      return {
        date: d.date,
        open,
        close,
        high,
        low,
        volume: d.volume || 1000,
        openClose: [Math.min(open, close), Math.max(open, close)],
        wick: [low, high],
        color: close >= open ? 'var(--green)' : 'var(--red)',
        sma,
        bbUpper,
        bbMiddle,
        bbLower,
        rsi
      };
    });

    if (stockData && withIndicators.length > 0 && typeof stockData.price === 'number') {
      const last = withIndicators[withIndicators.length - 1];
      const todayStr = new Date().toISOString().split('T')[0];
      
      const liveClose = stockData.price;
      const validHigh = typeof stockData.high === 'number' && !isNaN(stockData.high) ? stockData.high : liveClose;
      const validLow = typeof stockData.low === 'number' && !isNaN(stockData.low) ? stockData.low : liveClose;
      
      if (last.date === todayStr || last.date === 'Live') {
        last.close = liveClose;
        last.high = Math.max(last.high, liveClose, validHigh);
        last.low = Math.min(last.low, liveClose, validLow);
        if (stockData.volume) last.volume = stockData.volume;
        last.openClose = [Math.min(last.open, last.close), Math.max(last.open, last.close)];
        last.wick = [last.low, last.high];
        last.color = last.close >= last.open ? 'var(--green)' : 'var(--red)';
      } else {
        const liveOpen = last.close;
        const liveHigh = Math.max(liveOpen, liveClose, validHigh);
        const liveLow = Math.min(liveOpen, liveClose, validLow);
        
        const liveCandle = {
          date: todayStr,
          open: liveOpen,
          close: liveClose,
          high: liveHigh,
          low: liveLow,
          volume: stockData.volume || 5000,
          openClose: [Math.min(liveOpen, liveClose), Math.max(liveOpen, liveClose)],
          wick: [liveLow, liveHigh],
          color: liveClose >= liveOpen ? 'var(--green)' : 'var(--red)',
          sma: last.sma,
          bbMiddle: last.bbMiddle,
          bbUpper: last.bbUpper,
          bbLower: last.bbLower,
          rsi: last.rsi
        };
        withIndicators.push(liveCandle);
      }
    }

    return withIndicators;
  };

  const processedData = useMemo(() => {
    return getProcessedChartData();
  }, [stockHistory, timeframe, stockData?.price, stockData?.high, stockData?.low, stockData?.volume]);

  const getVWAP = () => {
    if (!stockData) return 0;
    const h = stockData.high || stockData.price;
    const l = stockData.low || stockData.price;
    const c = stockData.price;
    return (h + l + c) / 3;
  };

  const currentVWAP = getVWAP();
  const lowerCircuit = stockData ? parseFloat((stockData.previousClose * 0.9).toFixed(2)) : 0;
  const upperCircuit = stockData ? parseFloat((stockData.previousClose * 1.1).toFixed(2)) : 0;

  const finalPrice = orderType === 'MARKET' ? (stockData?.price || 0) : price;
  const orderValue = quantity * finalPrice;
  
  const brokerage = productType === 'MIS' ? Math.min(orderValue * 0.0005, 20.00) : 0;
  const taxesAndTolls = orderValue * 0.0003;
  const totalCharges = brokerage + taxesAndTolls;
  const totalCost = orderValue + totalCharges;

  const marginMultiplier = productType === 'MIS' ? 0.20 : 1.00;
  const requiredMargin = orderValue * marginMultiplier + totalCharges;
  const remainingFunds = walletBalance - requiredMargin;

  const usedMargin = portfolioItems.reduce((acc, curr) => acc + (curr.shares * curr.avgPrice * 0.20), 0);

  const getRiskRewardRatio = () => {
    if (!hasTarget || !hasStopLoss || !stockData?.price) return 'N/A';
    const current = stockData.price;
    const reward = Math.abs(targetPrice - current);
    const risk = Math.abs(current - stopLossPrice);
    if (risk === 0) return 'N/A';
    return (reward / risk).toFixed(2);
  };

  const riskReward = getRiskRewardRatio();

  const getAISuggestion = () => {
    if (processedData.length === 0) return { action: 'Analyzing...', desc: 'Reading price feed and historical trends.' };
    
    const lastData = processedData[processedData.length - 1];
    const rsi = lastData.rsi || 50;
    
    if (rsi < 35) {
      return {
        action: 'STRONG BUY (Oversold)',
        desc: `RSI is low at ${rsi.toFixed(1)}, indicating oversold conditions. A technical bounce is highly probable. Support forms at $${(stockData?.low || lastData.low).toFixed(2)}.`
      };
    } else if (rsi > 70) {
      return {
        action: 'STRONG SELL (Overbought)',
        desc: `RSI stands high at ${rsi.toFixed(1)}, pointing to heavily overbought states. Expect price corrections soon. Resistance sits near $${(stockData?.high || lastData.high).toFixed(2)}.`
      };
    } else {
      const isPositive = (stockData?.changePercent || 0) >= 0;
      return {
        action: isPositive ? 'ACCUMULATE (Bullish)' : 'HOLD (Consolidating)',
        desc: isPositive 
          ? `Short-term momentum is upwards. Buy-on-dips strategy suggested near SMA support ($${(lastData.sma || lastData.close * 0.98).toFixed(2)}).`
          : `Market shows consolidation. Neutral indicators. Recommending range-bound entries. target: $${(targetPrice).toFixed(2)}.`
      };
    }
  };

  const aiSuggestion = getAISuggestion();

  const stepQuantity = (amt) => {
    setQuantity(prev => Math.max(1, prev + amt));
  };

  const stepPrice = (amt) => {
    setPrice(prev => parseFloat(Math.max(0.01, prev + amt).toFixed(2)));
  };

  const handlePlaceOrderClick = (e) => {
    e.preventDefault();
    if (quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (finalPrice <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }
    if (requiredMargin > walletBalance) {
      toast.error("Insufficient wallet balance for this trade");
      return;
    }
    if (orderType === 'LIMIT' && (price < lowerCircuit || price > upperCircuit)) {
      toast.error(`Price must be within daily circuit limits ($${lowerCircuit} - $${upperCircuit})`);
      return;
    }
    
    setShowConfirmModal(true);
  };

  const executeOrder = async () => {
    setShowConfirmModal(false);
    
    try {
      const payloadPrice = parseFloat(finalPrice.toFixed(2));
      const payloadQty = Number(quantity);

      if (isBuy) {
        await axios.post(`${API_BASE_URL}/api/protfolio`, {
          symbol: symbol.toUpperCase(),
          shares: payloadQty,
          avgPrice: payloadPrice,
          name: stockData?.name || symbol.toUpperCase(),
          currentPrice: stockData?.price || payloadPrice
        }, { withCredentials: true });

        const newBalance = walletBalance - requiredMargin;
        setWalletBalance(newBalance);
        localStorage.setItem('quanta-wallet', newBalance.toString());

        const newTrade = {
          time: new Date().toLocaleTimeString(),
          type: 'BUY',
          price: payloadPrice,
          qty: payloadQty
        };
        setRecentTrades(prev => [newTrade, ...prev]);

        toast.success(`Buy order executed: ${payloadQty} shares of ${symbol.toUpperCase()} at $${payloadPrice}`);
      } else {
        const symbolHoldings = portfolioItems.filter(item => item.symbol.toUpperCase() === symbol.toUpperCase());
        const totalOwned = symbolHoldings.reduce((sum, h) => sum + h.shares, 0);

        if (totalOwned === 0) {
          toast.error(`You do not own any shares of ${symbol.toUpperCase()}`);
          return;
        }

        if (totalOwned < payloadQty) {
          toast.error(`Insufficient shares. You only own ${totalOwned} shares of ${symbol.toUpperCase()}`);
          return;
        }

        let qtyToReduce = payloadQty;
        for (const h of symbolHoldings) {
          if (qtyToReduce <= 0) break;
          if (h.shares <= qtyToReduce) {
            qtyToReduce -= h.shares;
            await axios.delete(`${API_BASE_URL}/api/protfolio/${h._id}`, { withCredentials: true });
          } else {
            await axios.put(`${API_BASE_URL}/api/protfolio/${h._id}`, {
              shares: h.shares - qtyToReduce,
              avgPrice: h.avgPrice,
              currentPrice: stockData?.price || payloadPrice
            }, { withCredentials: true });
            qtyToReduce = 0;
          }
        }

        const proceeds = orderValue - totalCharges;
        const newBalance = walletBalance + proceeds;
        setWalletBalance(newBalance);
        localStorage.setItem('quanta-wallet', newBalance.toString());

        const newTrade = {
          time: new Date().toLocaleTimeString(),
          type: 'SELL',
          price: payloadPrice,
          qty: payloadQty
        };
        setRecentTrades(prev => [newTrade, ...prev]);

        toast.success(`Sell order executed: ${payloadQty} shares of ${symbol.toUpperCase()} at $${payloadPrice}`);
      }

      fetchPortfolio();

    } catch (err) {
      console.error("Order execution failed:", err);
      toast.error("Order placement failed. Server error.");
    }
  };

  const handleFormReset = () => {
    setQuantity(1);
    if (stockData) {
      setPrice(stockData.price);
    }
    setHasTarget(false);
    setHasStopLoss(false);
    toast.success("Trading inputs reset");
  };

  if (loading) {
    return (
      <div className="sd-loading-screen">
        <div className="sd-loading-spinner"></div>
        <p>Loading Trading Terminal for <strong>{symbol.toUpperCase()}</strong>...</p>
      </div>
    );
  }

  if (error || !stockData) {
    return (
      <div className="sd-error-page">
        <div className="sd-error-card">
          <div className="sd-error-icon">!</div>
          <h2>Trading Terminal Error</h2>
          <p>{error || 'Stock quote data is unavailable.'}</p>
          <Link to="/analyzer" className="sd-error-back-btn">
            <ArrowLeft size={18} /> Back to Search
          </Link>
        </div>
      </div>
    );
  }

  const stockChangePercent = stockData.changePercent || 0;
  const isUp = stockChangePercent >= 0;
  const priceCurrencyCode = getCurrencyCode(symbol, stockData?.exchange);
  const priceCurrencySymbol = priceCurrencyCode === 'INR' ? '₹' : '$';

  return (
    <div className="tt-page">
      <div className={`tt-ambient-glow ${isBuy ? 'buy-glow' : 'sell-glow'}`}></div>

      <div className="tt-container animate-fade-in">
        
        <div className="tt-header tt-glass-card">
          <div className="tt-header-left">
            <Link to={`/stock/${symbol}`} className="tt-back-btn" title="Back to Details">
              <ArrowLeft size={18} />
            </Link>
            <div className="tt-search-container" ref={searchContainerRef}>
              <div className="tt-search-input-wrap">
                <Search size={13} className="tt-search-icon" />
                <input 
                  type="text" 
                  className="tt-search-input"
                  placeholder="Search stock (e.g. AAPL, RELIANCE)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0 || searchResults.length > 0) {
                      setShowSearchDropdown(true);
                    }
                  }}
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    className="tt-search-clear"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setShowSearchDropdown(false);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {showSearchDropdown && (
                <div className="tt-search-dropdown animate-fade-in">
                  {isSearching ? (
                    <div className="tt-search-loading">Searching equities...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="tt-search-empty">
                      {searchQuery.trim() ? 'No matching tickers found' : 'Type to search global & Indian stocks'}
                    </div>
                  ) : (
                    searchResults.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="tt-search-item"
                        onClick={() => {
                          navigate(`/trade/${item.symbol}`);
                          setShowSearchDropdown(false);
                          setSearchQuery('');
                        }}
                      >
                        <div className="tt-search-item-left">
                          <span className="tt-search-sym">{item.symbol}</span>
                          <span className="tt-search-name">{item.description || item.name}</span>
                        </div>
                        <div className="tt-search-item-right">
                          {item.price && (
                            <span className="tt-search-price">
                              {formatCurrencyValue(item.price, item.symbol, item.exchange)}
                            </span>
                          )}
                          <span className="tt-search-exch">{item.exchange || 'EQUITY'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="tt-symbol-badge">{stockData.symbol}</div>
            <h1 className="tt-company-name">{stockData.name}</h1>
            <span className="tt-exchange-badge">NSE/NASDAQ</span>
          </div>

          <div className="tt-header-middle">
            <div className="tt-live-price-wrap">
              <span className="tt-price-symbol">{priceCurrencySymbol}</span>
              <span className={`tt-price-value ${isUpdating ? 'positive' : ''}`}>
                {stockData.price.toFixed(2)}
              </span>
            </div>
            <div className={`tt-price-change ${isUp ? 'up' : 'down'}`}>
              {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{isUp ? '+' : ''}{formatCurrencyValue(stockData.change, stockData.symbol, stockData.exchange)} ({stockChangePercent.toFixed(2)}%)</span>
            </div>
          </div>

          <div className="tt-header-right">
            <div className="tt-market-status">
              <span className={`tt-status-dot ${wsConnected ? 'open' : 'closed'}`}></span>
              <span>{wsConnected ? 'LIVE FEED' : 'OFFLINE'}</span>
            </div>
            <div className="tt-conn-badge">
              <span className={`tt-pulse-ring ${isUpdating ? 'updating' : ''}`}></span>
              <span>{isUpdating ? 'SYNC' : 'CONNECTED'}</span>
            </div>
            <button 
              className={`tt-watchlist-btn ${isInWatchlist ? 'active' : ''}`}
              onClick={handleWatchlistToggle}
            >
              <Star size={14} fill={isInWatchlist ? "var(--yellow)" : "none"} />
              <span>{isInWatchlist ? 'Watchlisted' : 'Watchlist'}</span>
            </button>
            <button 
              type="button" 
              className={`mla-trigger-btn ${isAiOpen ? 'active' : ''}`}
              onClick={() => setIsAiOpen(!isAiOpen)}
              title="Toggle Quanta AI Assistant"
            >
              <Sparkles size={14} />
              <span>Quanta AI</span>
            </button>
          </div>
        </div>

        <div className={`tt-workspace-split ${!isAiOpen ? 'full-width' : ''}`}>
          <div className="tt-workspace-main">
            <div className="tt-main-grid">
          
          <div className="tt-chart-card tt-glass-card">
            <div className="tt-chart-toolbar">
              <div className="tt-chart-left-tools">
                <span className="tt-chart-title">Candlestick & Indicator Dashboard</span>
                
                <div className="tt-tf-group">
                  {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(tf => (
                    <button 
                      key={tf}
                      className={`tt-tf-btn ${timeframe === tf ? 'active' : ''}`}
                      onClick={() => setTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tt-indicators-group">
                <button 
                  className={`tt-indicator-toggle ${showSMA ? 'active' : ''}`}
                  onClick={() => setShowSMA(!showSMA)}
                >
                  <Activity size={12} />
                  SMA (15)
                </button>
                <button 
                  className={`tt-indicator-toggle ${showBollinger ? 'active' : ''}`}
                  onClick={() => setShowBollinger(!showBollinger)}
                >
                  <Layers size={12} />
                  Bollinger
                </button>
                <button 
                  className={`tt-indicator-toggle ${showRSI ? 'active' : ''}`}
                  onClick={() => setShowRSI(!showRSI)}
                >
                  <Cpu size={12} />
                  RSI (14)
                </button>
              </div>
            </div>

            <div className="tt-chart-wrapper">
              <LightweightCandlestickChart
                data={processedData}
                showSMA={showSMA}
                showBollinger={showBollinger}
                showRSI={showRSI}
                currencySymbol={priceCurrencySymbol}
                currencyCode={priceCurrencyCode}
                symbol={symbol}
              />
            </div>
          </div>

          <div ref={orderPanelRef} className={`tt-trading-panel tt-glass-card ${highlightedOrder ? `tt-highlight-${highlightedOrder}` : ''}`}>
            <div className="tt-panel-toggle">
              <button 
                className={`tt-toggle-tab buy-tab ${isBuy ? 'active' : ''}`}
                onClick={() => setIsBuy(true)}
              >
                Buy
              </button>
              <button 
                className={`tt-toggle-tab sell-tab ${!isBuy ? 'active' : ''}`}
                onClick={() => setIsBuy(false)}
              >
                Sell
              </button>
            </div>

            <div className="tt-input-field-wrap">
              <label className="tt-input-label">Product Type</label>
              <div className="tt-selector-row">
                <button 
                  className={`tt-select-btn ${productType === 'MIS' ? 'active' : ''}`}
                  onClick={() => setProductType('MIS')}
                >
                  Intraday (MIS)
                </button>
                <button 
                  className={`tt-select-btn ${productType === 'CNC' ? 'active' : ''}`}
                  onClick={() => setProductType('CNC')}
                >
                  Delivery (CNC)
                </button>
              </div>
            </div>

            <div className="tt-input-field-wrap">
              <label className="tt-input-label">Order Type</label>
              <div className="tt-selector-row">
                {['MARKET', 'LIMIT', 'SL'].map(type => (
                  <button 
                    key={type}
                    className={`tt-select-btn ${orderType === type ? 'active' : ''}`}
                    onClick={() => setOrderType(type)}
                  >
                    {type === 'SL' ? 'Stop Loss' : type}
                  </button>
                ))}
              </div>
            </div>

            <div className="tt-form-row two-col">
              <div className="tt-input-field-wrap">
                <label className="tt-input-label">Qty</label>
                <div className="tt-number-input-box">
                  <button className="tt-math-btn" onClick={() => stepQuantity(-1)}>-</button>
                  <input 
                    type="number" 
                    className="tt-field-input"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                  />
                  <button className="tt-math-btn" onClick={() => stepQuantity(1)}>+</button>
                </div>
              </div>

              <div className="tt-input-field-wrap">
                <label className="tt-input-label">
                  <span>Price</span>
                  {orderType === 'MARKET' && <span className="tt-label-hint">Market Price</span>}
                </label>
                <div className={`tt-number-input-box ${orderType === 'MARKET' ? 'disabled' : ''}`}>
                  <button className="tt-math-btn" onClick={() => stepPrice(-0.5)}>-</button>
                  <input 
                    type="number" 
                    className="tt-field-input"
                    value={price.toFixed(2)}
                    onChange={(e) => setPrice(parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
                    disabled={orderType === 'MARKET'}
                    step="0.05"
                  />
                  <button className="tt-math-btn" onClick={() => stepPrice(0.5)}>+</button>
                </div>
              </div>
            </div>

            {orderType === 'SL' && (
              <div className="tt-input-field-wrap">
                <label className="tt-input-label">Trigger Price</label>
                <div className="tt-number-input-box">
                  <button className="tt-math-btn" onClick={() => setTriggerPrice(prev => parseFloat(Math.max(0.01, prev - 0.5).toFixed(2)))}>-</button>
                  <input 
                    type="number" 
                    className="tt-field-input"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || 0)}
                    step="0.05"
                  />
                  <button className="tt-math-btn" onClick={() => setTriggerPrice(prev => parseFloat((prev + 0.5).toFixed(2)))}>+</button>
                </div>
              </div>
            )}

            <div className="tt-form-row two-col">
              <div className="tt-input-field-wrap">
                <div className="tt-bracket-check-row">
                  <input 
                    type="checkbox" 
                    id="hasTarget" 
                    className="tt-checkbox"
                    checked={hasTarget}
                    onChange={(e) => setHasTarget(e.target.checked)}
                  />
                  <label htmlFor="hasTarget" className="tt-checkbox-label">Set Target</label>
                </div>
                {hasTarget && (
                  <div className="tt-number-input-box" style={{ marginTop: '4px' }}>
                    <input 
                      type="number" 
                      className="tt-field-input"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                      step="0.05"
                    />
                  </div>
                )}
              </div>

              <div className="tt-input-field-wrap">
                <div className="tt-bracket-check-row">
                  <input 
                    type="checkbox" 
                    id="hasStopLoss" 
                    className="tt-checkbox"
                    checked={hasStopLoss}
                    onChange={(e) => setHasStopLoss(e.target.checked)}
                  />
                  <label htmlFor="hasStopLoss" className="tt-checkbox-label">Set Stop Loss</label>
                </div>
                {hasStopLoss && (
                  <div className="tt-number-input-box" style={{ marginTop: '4px' }}>
                    <input 
                      type="number" 
                      className="tt-field-input"
                      value={stopLossPrice}
                      onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
                      step="0.05"
                    />
                  </div>
                )}
              </div>
            </div>

            {hasTarget && hasStopLoss && (
              <div className="tt-risk-reward-badge">
                <span>Est. Risk/Reward Ratio:</span>
                <span className="font-mono positive">{riskReward}</span>
              </div>
            )}

            <div className="tt-wallet-card">
              <div className="tt-wallet-row">
                <span>Available Margin</span>
                <span className="tt-wallet-val">{formatCurrencyValue(walletBalance, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-wallet-row">
                <span>Used Margin</span>
                <span className="tt-wallet-val">{formatCurrencyValue(usedMargin, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-wallet-row">
                <span>Required Margin</span>
                <span className="tt-wallet-val">{formatCurrencyValue(requiredMargin, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-wallet-row strong">
                <span>Remaining Margin</span>
                <span className="tt-wallet-val">{formatCurrencyValue(remainingFunds, symbol, stockData?.exchange)}</span>
              </div>
            </div>

            <div className="tt-summary-card">
              <div className="tt-summary-title">Order Value Summary</div>
              <div className="tt-summary-row">
                <span>Order Value:</span>
                <span className="tt-summary-val">{formatCurrencyValue(orderValue, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-summary-row">
                <span>Est. Brokerage:</span>
                <span className="tt-summary-val">{formatCurrencyValue(brokerage, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-summary-row">
                <span>Taxes & charges:</span>
                <span className="tt-summary-val">{formatCurrencyValue(taxesAndTolls, symbol, stockData?.exchange)}</span>
              </div>
              <div className="tt-summary-row total">
                <span>Payable Amount:</span>
                <span className="tt-summary-val">{formatCurrencyValue(totalCost, symbol, stockData?.exchange)}</span>
              </div>
            </div>

            <div className="tt-action-row">
              <button 
                type="submit" 
                className={`tt-trade-btn ${isBuy ? 'buy' : 'sell'}`}
                onClick={handlePlaceOrderClick}
              >
                Place {isBuy ? 'Buy' : 'Sell'} Order
              </button>
              <button 
                type="button" 
                className="tt-reset-btn"
                onClick={handleFormReset}
                title="Reset Form"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="tt-bottom-grid">
          <div className="tt-depth-card tt-glass-card">
            <div className="tt-section-header">
              <Layers size={14} />
              <span>Market Depth</span>
            </div>
            
            <div className="tt-depth-grid">
              <div>
                <div className="tt-depth-side-header">
                  <span>Qty</span>
                  <span style={{ textAlign: 'right' }}>Bid Price</span>
                </div>
                <div className="tt-depth-list">
                  {marketDepth.bids.map((b, i) => (
                    <div key={i} className="tt-depth-row">
                      <div className="tt-depth-bg bid" style={{ width: `${(b.qty / 350) * 100}%` }}></div>
                      <span className="tt-depth-qty">{b.qty}</span>
                      <span className="tt-depth-val bid">${b.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="tt-depth-divider"></div>

              <div>
                <div className="tt-depth-side-header">
                  <span>Ask Price</span>
                  <span style={{ textAlign: 'right' }}>Qty</span>
                </div>
                <div className="tt-depth-list">
                  {marketDepth.asks.map((a, i) => (
                    <div key={i} className="tt-depth-row">
                      <div className="tt-depth-bg ask" style={{ width: `${(a.qty / 350) * 100}%` }}></div>
                      <span className="tt-depth-val ask">${a.price.toFixed(2)}</span>
                      <span className="tt-depth-qty ask">{a.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="tt-sentiment-labels">
                <span className="positive">BUYERS {marketDepth.buyPressure}%</span>
                <span className="negative">SELLERS {100 - marketDepth.buyPressure}%</span>
              </div>
              <div className="tt-pressure-bar-wrap">
                <div className="tt-pressure-bar bid" style={{ width: `${marketDepth.buyPressure}%` }}></div>
                <div className="tt-pressure-bar ask" style={{ width: `${100 - marketDepth.buyPressure}%` }}></div>
              </div>
            </div>
          </div>

          <div className="tt-stats-card tt-glass-card">
            <div className="tt-section-header">
              <Activity size={14} />
              <span>LTP Price Statistics</span>
            </div>
            
            <div className="tt-stats-list">
              <div className="tt-stat-row">
                <span>Open Price</span>
                <span className="tt-stat-val">{formatCurrencyValue(stockData.open, stockData.symbol, stockData.exchange)}</span>
              </div>
              <div className="tt-stat-row">
                <span>Day High</span>
                <span className="tt-stat-val up">{formatCurrencyValue(stockData.high, stockData.symbol, stockData.exchange)}</span>
              </div>
              <div className="tt-stat-row">
                <span>Day Low</span>
                <span className="tt-stat-val down">{formatCurrencyValue(stockData.low, stockData.symbol, stockData.exchange)}</span>
              </div>
              <div className="tt-stat-row">
                <span>Previous Close</span>
                <span className="tt-stat-val">{formatCurrencyValue(stockData.previousClose, stockData.symbol, stockData.exchange)}</span>
              </div>
              <div className="tt-stat-row">
                <span>Volume Weighted Avg Price (VWAP)</span>
                <span className="tt-stat-val">{formatCurrencyValue(currentVWAP, stockData.symbol, stockData.exchange)}</span>
              </div>
              <div className="tt-stat-row">
                <span>Lower / Upper Circuit Limit (10%)</span>
                <span className="tt-stat-val font-mono" style={{ fontSize: '0.7rem' }}>
                  {formatCurrencyValue(lowerCircuit, stockData.symbol, stockData.exchange)} - {formatCurrencyValue(upperCircuit, stockData.symbol, stockData.exchange)}
                </span>
              </div>
            </div>
          </div>

          <div className="tt-stats-card tt-glass-card">
            <div className="tt-section-header">
              <Layers size={14} />
              <span>Quick Key Metrics</span>
            </div>
            
            <div className="tt-metrics-grid">
              <div className="tt-metric-cell">
                <span className="tt-metric-label">PE Ratio</span>
                <span className="tt-metric-value">{(22.45 + (stockData.price / 150)).toFixed(2)}</span>
              </div>
              <div className="tt-metric-cell">
                <span className="tt-metric-label">EPS</span>
                <span className="tt-metric-value">${(5.24 + (stockData.price / 400)).toFixed(2)}</span>
              </div>
              <div className="tt-metric-cell">
                <span className="tt-metric-label">Market Cap</span>
                <span className="tt-metric-value">
                  {formatLargeNumber(stockData.marketCap || (stockData.price * 800_000_000))}
                </span>
              </div>
              <div className="tt-metric-cell">
                <span className="tt-metric-label">Div. Yield</span>
                <span className="tt-metric-value">{(1.22 + (stockData.price / 1000)).toFixed(2)}%</span>
              </div>
              <div className="tt-metric-cell">
                <span className="tt-metric-label">Beta Coefficient</span>
                <span className="tt-metric-value">{(0.95 + (stockData.price / 2000)).toFixed(2)}</span>
              </div>
              <div className="tt-metric-cell">
                <span className="tt-metric-label">52 W High / Low</span>
                <span className="tt-metric-value" style={{ fontSize: '0.72rem' }}>
                  ${(stockData.price * 0.7).toFixed(0)} - ${(stockData.price * 1.3).toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="tt-advanced-row">
          <div className="tt-stats-card tt-glass-card tt-sentiment-meter-wrap">
            <div className="tt-section-header">
              <Activity size={14} />
              <span>Market Sentiment Meter</span>
            </div>
            <div className="tt-sentiment-labels">
              <span className="negative">Bearish</span>
              <span style={{ color: 'var(--yellow)' }}>Neutral</span>
              <span className="positive">Bullish</span>
            </div>
            <div className="tt-sentiment-gauge">
              <div 
                className="tt-sentiment-marker" 
                style={{ left: `${Math.max(10, Math.min(90, 50 + stockChangePercent * 8))}%` }}
              ></div>
            </div>
            <p className="tt-sentiment-text">
              Sentiment is currently <strong className={isUp ? 'positive' : 'negative'}>{isUp ? 'BULLISH' : 'BEARISH'}</strong> based on today's price movement.
            </p>
          </div>

          <div className="tt-stats-card tt-glass-card">
            <div className="tt-section-header">
              <Cpu size={14} />
              <span>AI Trade Suggestions</span>
            </div>
            <div className="tt-ai-suggestion-box animate-fade-in">
              <Sparkles size={20} className="tt-ai-icon" />
              <div className="tt-ai-content">
                <div className="tt-ai-title">
                  <span>Advisory suggestion</span>
                  <span className="tt-ai-badge">Copilot</span>
                </div>
                <div className="tt-ai-desc">
                  <strong>Recommendation: {aiSuggestion.action}</strong>
                  <br />
                  {aiSuggestion.desc}
                  <button 
                    type="button" 
                    className="tt-ai-expand-chat-btn"
                    onClick={() => setIsAiOpen(true)}
                    style={{
                      marginTop: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(121, 190, 154, 0.15)',
                      border: '1px solid rgba(121, 190, 154, 0.35)',
                      color: '#79BE9A',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Sparkles size={12} /> Consult Quanta AI
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="tt-stats-card tt-glass-card">
            <div className="tt-section-header">
              <Layers size={14} />
              <span>Recent Executions (Session)</span>
            </div>
            
            <div className="tt-trades-feed">
              {recentTrades.length === 0 ? (
                <div className="tt-sentiment-text" style={{ padding: '24px' }}>No orders placed in this session</div>
              ) : (
                recentTrades.map((t, idx) => (
                  <div key={idx} className="tt-feed-row animate-fade-in">
                    <span className="tt-feed-time">{t.time}</span>
                    <span className={`tt-feed-type ${t.type.toLowerCase()}`}>{t.type}</span>
                    <span>{t.qty} shares</span>
                    <span style={{ fontWeight: 600 }}>${t.price.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <p className="tt-warning-text">
          <ShieldAlert size={12} style={{ display: 'inline-block', marginRight: '4px', verticalAlign: 'middle', color: 'var(--yellow)' }} />
          <strong>Risk Warning:</strong> Trading in financial markets carries high risk. Margins provide high leverage which can multiply both profits and losses. Stock market investments are subject to market risks, read all scheme related documents carefully before investing.
        </p>
          </div>

          {isAiOpen && (
            <div className="tt-workspace-ai-side">
              <QuantaAdvisor
                symbol={symbol}
                stockData={stockData}
                indicators={{
                  rsi: processedData.length > 0 ? (processedData[processedData.length - 1].rsi || 50).toFixed(1) : '50.0',
                  sma: processedData.length > 0 ? (processedData[processedData.length - 1].sma || stockData.price).toFixed(2) : stockData.price.toFixed(2),
                  vwap: currentVWAP.toFixed(2),
                  dayHigh: stockData.high,
                  dayLow: stockData.low,
                }}
                onSwitchStock={(newSym) => {
                  navigate(`/trade/${newSym}`);
                  toast.success(`Switched Trade window to ${newSym.toUpperCase()}`);
                }}
                onOpenBuyOrder={() => {
                  setIsBuy(true);
                  if (orderType === 'LIMIT') setPrice(stockData.price);
                  setHighlightedOrder('buy');
                  toast.success(`Configured Buy order for ${stockData.symbol}. Review details below.`);
                  setTimeout(() => {
                    orderPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                  setTimeout(() => setHighlightedOrder(null), 2500);
                }}
                onOpenSellOrder={() => {
                  setIsBuy(false);
                  if (orderType === 'LIMIT') setPrice(stockData.price);
                  setHighlightedOrder('sell');
                  toast.success(`Configured Sell order for ${stockData.symbol}. Review details below.`);
                  setTimeout(() => {
                    orderPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                  setTimeout(() => setHighlightedOrder(null), 2500);
                }}
                onAddToWatchlist={handleWatchlistToggle}
                onViewAnalysis={(targetSym) => navigate(`/stock/${targetSym}`)}
                onClose={() => setIsAiOpen(false)}
              />
            </div>
          )}
        </div>

      </div>

      {showConfirmModal && (
        <div className="tt-modal-overlay">
          <div className="tt-modal-box">
            <div className="tt-modal-header">
              <span className="tt-modal-title">Confirm {isBuy ? 'Buy' : 'Sell'} Transaction</span>
              <button 
                type="button" 
                className="tt-modal-close" 
                onClick={() => setShowConfirmModal(false)}
              >
                &times;
              </button>
            </div>
            
            <div className="tt-modal-body">
              <div className="tt-modal-summary-card">
                <div className="tt-modal-row">
                  <span>Instrument:</span>
                  <span className="tt-modal-val">{symbol.toUpperCase()}</span>
                </div>
                <div className="tt-modal-row">
                  <span>Action:</span>
                  <span className={`tt-modal-val ${isBuy ? 'buy' : 'sell'}`}>
                    {isBuy ? 'BUYING (LONG)' : 'SELLING (SHORT)'}
                  </span>
                </div>
                <div className="tt-modal-row">
                  <span>Quantity:</span>
                  <span className="tt-modal-val">{quantity} shares</span>
                </div>
                <div className="tt-modal-row">
                  <span>Order Type:</span>
                  <span className="tt-modal-val">{orderType} ({productType})</span>
                </div>
                <div className="tt-modal-row">
                  <span>Price per Share:</span>
                  <span className="tt-modal-val">{formatCurrencyValue(finalPrice, symbol, stockData?.exchange)}</span>
                </div>
                <div className="tt-modal-row">
                  <span>Required Margin:</span>
                  <span className="tt-modal-val">{formatCurrencyValue(requiredMargin, symbol, stockData?.exchange)}</span>
                </div>
                <div className="tt-modal-row total">
                  <span>Total Est. Payable:</span>
                  <span className="tt-modal-val">{formatCurrencyValue(totalCost, symbol, stockData?.exchange)}</span>
                </div>
              </div>

              {(hasTarget || hasStopLoss) && (
                <div className="tt-wallet-card" style={{ fontSize: '0.75rem' }}>
                  <div className="tt-summary-title">Bracket Targets</div>
                  {hasTarget && (
                    <div className="tt-modal-row">
                      <span>Target Price:</span>
                      <span className="tt-modal-val positive">${targetPrice.toFixed(2)}</span>
                    </div>
                  )}
                  {hasStopLoss && (
                    <div className="tt-modal-row">
                      <span>Stop Loss Trigger:</span>
                      <span className="tt-modal-val negative">${stopLossPrice.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="tt-modal-actions">
                <button 
                  type="button" 
                  className="tt-modal-btn cancel"
                  onClick={() => setShowConfirmModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className={`tt-modal-btn confirm ${isBuy ? 'buy' : 'sell'}`}
                  onClick={executeOrder}
                >
                  Confirm Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TradingTerminal;
