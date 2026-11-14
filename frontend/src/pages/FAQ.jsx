import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  HelpCircle,
  TrendingUp,
  ShieldCheck,
  Wallet,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mail,
  Smartphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './FAQ.css';

const FAQ_DATA = [
  // ── CATEGORY A: Getting Started ──────────────────────────────────────────
  {
    id: 'a1',
    category: 'getting-started',
    categoryName: 'Getting Started',
    question: 'What is MarketLens and what tools does it provide?',
    answer:
      'MarketLens is an institutional-grade financial analytics and paper-trading platform designed for both global (NASDAQ, NYSE) and Indian (NSE, BSE) stock markets. It provides real-time market screening, interactive candlestick and sparkline charts, technical indicators, multi-broker CSV portfolio imports (Zerodha, Groww, Angel One), simulated order execution, and multi-channel notifications via Nodemailer email and Twilio SMS.',
  },
  {
    id: 'a2',
    category: 'getting-started',
    categoryName: 'Getting Started',
    question: 'How do I create and activate an account?',
    answer:
      'Click the "Sign Up" button on the navigation header. Provide your full name, a valid email address, and a secure password (minimum 8 characters, containing uppercase and numerical characters). After submitting the registration form, MarketLens dispatches a 6-digit confirmation code via Nodemailer. Enter this code to verify mailbox ownership and activate your account.',
  },
  {
    id: 'a3',
    category: 'getting-started',
    categoryName: 'Getting Started',
    question: 'How does Google Sign-In work and how is it secured?',
    answer:
      'MarketLens supports streamlined Google authentication. When signing in with Google, your email is verified automatically by Google OAuth. First-time Google users are provisioned with an initial $500,000 paper trading margin and presented with a non-blocking prompt to optionally add and verify a mobile number for SMS notifications.',
  },
  {
    id: 'a4',
    category: 'getting-started',
    categoryName: 'Getting Started',
    question: 'How do I add and verify my mobile number for SMS alerts?',
    answer:
      'Navigate to your Account Profile (/profile). Under the "Security & Identity" card, click "Verify Phone". Enter your mobile number in standard international E.164 format (e.g., +14155552671 for US or +919876543210 for India). MarketLens dispatches a 6-digit OTP via Twilio SMS. Once confirmed, your phone status updates to "Verified" and SMS notifications are unlocked.',
  },
  {
    id: 'a5',
    category: 'getting-started',
    categoryName: 'Getting Started',
    question: 'How do I recover or reset my password?',
    answer:
      'On the Sign In page (/login), click the "Forgot password?" link. Enter your registered email address to receive a secure, time-limited 6-digit recovery authorization code (valid for 30 minutes). Enter the recovery code alongside your new password to restore account access.',
  },

  // ── CATEGORY B: Stock Analyzer ───────────────────────────────────────────
  {
    id: 'b1',
    category: 'stock-analyzer',
    categoryName: 'Stock Analyzer',
    question: 'How do I search for a stock on the global screener?',
    answer:
      'Use the search bar in the Bento Hero on the Analyzer page (/analyzer) or the quick search bar in the top navigation. Enter a ticker symbol (e.g. AAPL, TSLA, NVDA) or an Indian equity ending with .NS or .BO (e.g. RELIANCE.NS, TCS.NS, TATAMOTORS.NS). You can also click popular search chips for instant filtering.',
  },
  {
    id: 'b2',
    category: 'stock-analyzer',
    categoryName: 'Stock Analyzer',
    question: 'What does a ticker symbol mean and what are the exchange suffixes?',
    answer:
      'A ticker symbol is a unique series of characters representing a publicly traded corporation. US equities trade without suffixes (e.g., AAPL for Apple Inc. on NASDAQ). Indian equities listed on the National Stock Exchange use the suffix ".NS" (e.g., TCS.NS), while Bombay Stock Exchange equities use ".BO" (e.g., RELIANCE.BO). Prices and market caps adapt automatically between USD ($) and Indian Rupees (₹).',
  },
  {
    id: 'b3',
    category: 'stock-analyzer',
    categoryName: 'Stock Analyzer',
    question: 'What do OHLC prices, Daily Change, and Volume mean?',
    answer:
      '• Open: The initial price at which a stock traded when the market opened.\n• High / Low: The maximum and minimum execution prices reached during the trading session.\n• Daily Change: The net percentage and currency change compared to the prior session closing price (green for gains, red for losses).\n• Trading Volume: The total number of shares transacted throughout the trading day, indicating market liquidity.',
  },
  {
    id: 'b4',
    category: 'stock-analyzer',
    categoryName: 'Stock Analyzer',
    question: 'How do I adjust timeframe tabs and interpret chart sparklines?',
    answer:
      'On stock cards and detail views, toggle between 1D (real-time intraday ticks), 1W (1 week), 1M (1 month), 3M (1 quarter), and 1Y (1 year). Green gradient area fills denote an upward trajectory, while red gradients indicate net downward momentum. Intraday 1D charts pulse with live socket updates.',
  },

  // ── CATEGORY C: Trading Window & Order Concepts ──────────────────────────
  {
    id: 'c1',
    category: 'trading-orders',
    categoryName: 'Trading & Orders',
    question: 'What is MarketLens paper trading and does it execute real-world trades?',
    answer:
      'CRITICAL NOTICE: MarketLens is a financial analytics, screening, and educational paper-trading simulator. It does NOT connect to a registered securities broker and does NOT execute real-world financial transactions or hold custody of actual company shares. All order submissions simulate trade executions against live market prices for educational risk-free practice.',
  },
  {
    id: 'c2',
    category: 'trading-orders',
    categoryName: 'Trading & Orders',
    question: 'What is the difference between Market Orders and Limit Orders in the terminal?',
    answer:
      '• Market Order: Executes immediately at the best available current market price.\n• Limit Order: Allows you to specify the maximum price you are willing to pay (BUY) or the minimum price you will accept (SELL). Limit orders must fall within daily circuit bounds.',
  },
  {
    id: 'c3',
    category: 'trading-orders',
    categoryName: 'Trading & Orders',
    question: 'What are Daily Circuit Limits and how are they enforced?',
    answer:
      'Circuit limits represent regulatory boundaries (typically ±10% from the previous closing price) designed to mitigate catastrophic intraday volatility. The MarketLens Trading Terminal automatically calculates upper and lower circuit bounds and rejects orders placed outside these limits.',
  },
  {
    id: 'c4',
    category: 'trading-orders',
    categoryName: 'Trading & Orders',
    question: 'What are Margin Requirements, Order Value, and Remaining Funds?',
    answer:
      '• Order Value: Quantity multiplied by effective execution price.\n• Required Margin: The capital required to back the position, including estimated brokerage fees and regulatory charges.\n• Available Funds / Margin: Your trading wallet balance. If required margin exceeds available balance, the order is blocked with an insufficient margin alert.',
  },

  // ── CATEGORY D: Portfolio & Broker Import ────────────────────────────────
  {
    id: 'd1',
    category: 'portfolio',
    categoryName: 'Portfolio Analytics',
    question: 'How do I track and manage holdings in my portfolio?',
    answer:
      'Navigate to the Portfolio page (/portfolio). Your portfolio displays total invested capital, current market valuation, overall profit/loss percentage, and asset allocation breakdown. Live prices update in real-time via Socket.IO connections.',
  },
  {
    id: 'd2',
    category: 'portfolio',
    categoryName: 'Portfolio Analytics',
    question: 'How does Broker CSV import work (Zerodha, Groww, Angel One)?',
    answer:
      'MarketLens allows one-click CSV imports from major brokers:\n• Zerodha (Kite): Holdings CSV statement.\n• Groww: Stocks statement CSV.\n• Angel One: Portfolio export.\n• Generic CSV: Any CSV with symbol, shares, and avg_price columns.\nClick "Import CSV" on the Portfolio page, drag-and-drop your file, preview the detected holdings, and confirm import to populate your portfolio instantly.',
  },
  {
    id: 'd3',
    category: 'portfolio',
    categoryName: 'Portfolio Analytics',
    question: 'How are realized and unrealized Profit & Loss (P&L) calculated?',
    answer:
      '• Unrealized P&L: (Current Market Price - Average Purchase Price) × Quantity for active open holdings.\n• Realized P&L: Profit or loss permanently secured upon executing a SELL order in the trading terminal, with net proceeds credited to your wallet.',
  },

  // ── CATEGORY E: Stock Subscriptions & Watchlists ─────────────────────────
  {
    id: 'e1',
    category: 'subscriptions',
    categoryName: 'Stock Subscriptions',
    question: 'What does subscribing to a stock mean in MarketLens?',
    answer:
      'Subscribing to a stock adds it to your active alert watchlist. When subscribed, MarketLens monitors price quote fluctuations and dispatches transactional email and SMS updates (subject to your notification preferences). Subscribing does NOT purchase shares.',
  },
  {
    id: 'e2',
    category: 'subscriptions',
    categoryName: 'Stock Subscriptions',
    question: 'How do I subscribe or unsubscribe from a stock?',
    answer:
      'On any stock detail page (/stock/:symbol), click the "Subscribe" button in the action header. To unsubscribe, click the button again or manage your active subscriptions list under your Account Profile (/profile).',
  },

  // ── CATEGORY F: Wallet & Razorpay Deposits ───────────────────────────────
  {
    id: 'f1',
    category: 'wallet',
    categoryName: 'Wallet & Razorpay',
    question: 'What is the MarketLens Wallet used for?',
    answer:
      'The MarketLens Wallet maintains your available simulated margin for paper trading across global equities. It tracks your initial balance, deposits, debits from executed BUY orders, and credits from SELL orders.',
  },
  {
    id: 'f2',
    category: 'wallet',
    categoryName: 'Wallet & Razorpay',
    question: 'How does Razorpay deposit integration work?',
    answer:
      'You can top up trading margin by clicking "Top-Up Margin" on your Profile page (/profile). Select a preset amount ($1,000, $5,000, $10,000, etc.) and confirm the payment order. Deposits are verified on the backend and trigger immediate Email and SMS confirmations with a unique transaction reference ID.',
  },
  {
    id: 'f3',
    category: 'wallet',
    categoryName: 'Wallet & Razorpay',
    question: 'Can wallet funds be withdrawn as actual fiat currency?',
    answer:
      'No. MarketLens wallet funds represent paper-trading margin strictly for simulation and educational trading practice. Wallet balances hold no monetary cash value and cannot be withdrawn to external bank accounts.',
  },

  // ── CATEGORY G: Account Security & Notifications ─────────────────────────
  {
    id: 'g1',
    category: 'security',
    categoryName: 'Account & Security',
    question: 'How do I configure my email and SMS notification preferences?',
    answer:
      'Visit your Account Profile (/profile) to access the Notification Preferences Centre. You can toggle independent controls for Email and SMS across Security Alerts, Stock Subscriptions, Trade Confirmations, and Wallet Deposits. SMS alerts require a verified mobile phone number.',
  },
  {
    id: 'g2',
    category: 'security',
    categoryName: 'Account & Security',
    question: 'Where can I see the delivery history of notifications sent to me?',
    answer:
      'The Delivery Activity Log on your Profile page (/profile) records recent notification events, displaying the delivery channel (Email or SMS), title, recipient, timestamp, and status (Sent, Simulated, or Failed).',
  },

  // ── CATEGORY H: Market Data & Risk ───────────────────────────────────────
  {
    id: 'h1',
    category: 'market-data',
    categoryName: 'Market Data & Risk',
    question: 'Why might prices vary slightly or appear delayed?',
    answer:
      'MarketLens aggregates live quotes from Yahoo Finance, Finnhub, and Twelve Data. While US quotes and major indices are real-time, certain exchanges apply standard 15-minute regulatory delays during active trading sessions. Off-market hours reflect the latest official closing price.',
  },
  {
    id: 'h2',
    category: 'market-data',
    categoryName: 'Market Data & Risk',
    question: 'What is MarketLens investment policy regarding financial advice?',
    answer:
      'MarketLens provides informational analytics, technical indicators, and simulated trading strictly for educational and portfolio evaluation purposes. Nothing on MarketLens constitutes personalized investment, tax, or legal advice. Historical returns do not guarantee future investment performance.',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'stock-analyzer', label: 'Stock Analyzer' },
  { id: 'trading-orders', label: 'Trading & Orders' },
  { id: 'portfolio', label: 'Portfolio Analytics' },
  { id: 'subscriptions', label: 'Stock Subscriptions' },
  { id: 'wallet', label: 'Wallet & Razorpay' },
  { id: 'security', label: 'Account & Security' },
  { id: 'market-data', label: 'Market Data & Risk' },
];

const FAQ = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  // Filter FAQs based on search and category
  const filteredFaqs = useMemo(() => {
    return FAQ_DATA.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="faq-page">
      <div className="faq-container animate-fade-in">
        {/* Header Hero */}
        <div className="faq-hero">
          <div className="faq-badge">
            <BookOpen size={14} />
            <span>KNOWLEDGE & EDUCATION CENTRE</span>
          </div>

          <h1 className="faq-title">
            How can we help you trade with <span className="text-green">MarketLens</span>?
          </h1>

          <p className="faq-subtitle">
            Comprehensive guides on stock screening, order execution, paper margin, portfolio analytics, and automated alert notifications.
          </p>

          {/* Search Box */}
          <div className="faq-search-wrapper">
            <Search size={18} className="faq-search-icon" />
            <input
              type="text"
              placeholder="Search concepts, orders, verification, or questions (e.g. margin, CSV import, SMS)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="faq-search-input"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                className="faq-search-clear"
                onClick={() => setSearchQuery('')}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="faq-categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`faq-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Counter */}
        <div className="faq-results-bar">
          <span className="faq-results-count">
            Showing <strong>{filteredFaqs.length}</strong> questions
            {selectedCategory !== 'all' && ` in ${CATEGORIES.find((c) => c.id === selectedCategory)?.label}`}
          </span>
        </div>

        {/* FAQ Accordion List */}
        {filteredFaqs.length === 0 ? (
          <div className="faq-empty-state">
            <HelpCircle size={40} className="faq-empty-icon" />
            <h3>No matching questions found</h3>
            <p>Try searching with different keywords or reset your topic filter.</p>
            <button
              type="button"
              className="btn-faq-reset"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="faq-list" role="region" aria-label="Frequently Asked Questions">
            {filteredFaqs.map((faq) => {
              const isExpanded = expandedId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`faq-item ${isExpanded ? 'expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => toggleExpand(faq.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="faq-q-text">
                      <span className="faq-q-cat">{faq.categoryName}</span>
                      <h3 className="faq-q-title">{faq.question}</h3>
                    </div>
                    <div className={`faq-chevron ${isExpanded ? 'open' : ''}`}>
                      <ChevronDown size={18} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="faq-answer-panel animate-fade-in">
                      <p className="faq-answer-text">
                        {faq.answer.split('\n').map((line, idx) => (
                          <React.Fragment key={idx}>
                            {line}
                            {idx < faq.answer.split('\n').length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Resource Cards */}
        <div className="faq-quick-cards">
          <div className="quick-card">
            <TrendingUp size={22} className="qc-icon" />
            <h4>Live Stock Screener</h4>
            <p>Analyze quotes, interactive sparklines, and market breadth across global exchanges.</p>
            <Link to="/analyzer" className="qc-link">
              Launch Screener <ArrowRight size={14} />
            </Link>
          </div>

          <div className="quick-card">
            <Wallet size={22} className="qc-icon" />
            <h4>Trading Terminal & Wallet</h4>
            <p>Practice simulated executions with real-time margin calculations and live tickers.</p>
            <Link to="/trade/AAPL" className="qc-link">
              Open Trading Terminal <ArrowRight size={14} />
            </Link>
          </div>

          <div className="quick-card">
            <ShieldCheck size={22} className="qc-icon" />
            <h4>Account & Alert Preferences</h4>
            <p>Manage verified credentials, verify mobile phone, and set Email/SMS alert preferences.</p>
            <Link to="/profile" className="qc-link">
              Manage Preferences <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
