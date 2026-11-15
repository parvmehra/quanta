import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Briefcase, LineChart, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useQuotes } from '../hooks/useQuotes';
import { ChangeValue, Skeleton } from '../components/ui/ui';
import { formatCurrencyValue } from '../utils/currency';
import './Home.css';

const STRIP = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^NSEI', label: 'NIFTY 50' },
  { symbol: 'AAPL', label: 'Apple' },
  { symbol: 'NVDA', label: 'NVIDIA' },
  { symbol: 'RELIANCE.NS', label: 'Reliance' },
];

const FEATURES = [
  { icon: BarChart3, title: 'Research', text: 'Charts with indicators, fundamentals, news and a market overview for US and Indian stocks.' },
  { icon: Briefcase, title: 'Paper trading', text: 'Market, limit and stop orders against live prices with a flat 0.03% fee and separate dollar and rupee wallets.' },
  { icon: LineChart, title: 'Portfolio', text: 'Holdings, average cost, realised and unrealised profit, plus CSV import from Indian brokers.' },
  { icon: Star, title: 'Watchlists', text: 'Up to ten lists saved to your account, each with price, day change and a one-month trend.' },
  { icon: Sparkles, title: 'AI Advisor', text: 'Research notes written from live figures the server gathers itself. Never a buy or sell call.' },
  { icon: ShieldCheck, title: 'Honest numbers', text: 'Missing data shows as a dash, never zero. Every balance change is kept in an append-only history.' },
];

const STEPS = [
  { n: '1', title: 'Create an account', text: 'Sign up with your email and confirm it with a one-time code.' },
  { n: '2', title: 'Start with simulated funds', text: 'You get 500,000 USD and 5,000,000 INR to practise with.' },
  { n: '3', title: 'Research and trade', text: 'Find a stock, read the data, place an order and track the result.' },
];

function MarketStrip() {
  const { quotes, loading, error } = useQuotes(STRIP.map((s) => s.symbol), { interval: 60000 });
  return (
    <section className="home-strip" aria-label="Live market snapshot">
      <ul>
        {STRIP.map((s) => {
          const q = quotes[s.symbol];
          const index = s.symbol.startsWith('^');
          return (
            <li key={s.symbol}>
              <Link to={`/stock/${encodeURIComponent(s.symbol)}`}>
                <span className="home-strip__name">{s.label}</span>
                {loading && !q ? <Skeleton width={70} height={14} /> : q && q.price != null ? (
                  <>
                    <span className="home-strip__price">{index ? Number(q.price).toLocaleString('en-US', { maximumFractionDigits: 2 }) : formatCurrencyValue(q.price, s.symbol)}</span>
                    <ChangeValue value={q.changePercent} />
                  </>
                ) : <span className="home-strip__price">—</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="home-strip__note">{error && !Object.keys(quotes).length ? 'Market data is temporarily unavailable.' : 'Yahoo Finance, may be delayed.'}</p>
    </section>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-wrap">
          <p className="home-eyebrow">Market research and paper trading</p>
          <h1>Practise investing with live prices and no real money at risk.</h1>
          <p className="home-lead">Quanta brings research, a simulated trading terminal and portfolio tracking for US and Indian markets into one workstation.</p>
          <div className="home-cta">
            {isAuthenticated
              ? <Link to="/dashboard" className="btn btn-accent">Open dashboard</Link>
              : <><Link to="/signup" className="btn btn-accent">Create free account</Link><Link to="/login" className="btn btn-secondary">Sign in</Link></>}
            <Link to="/markets" className="btn btn-secondary">View markets</Link>
          </div>
        </div>
      </section>

      <div className="home-wrap"><MarketStrip /></div>

      <section className="home-section">
        <div className="home-wrap">
          <h2>What you can do</h2>
          <div className="home-grid">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article className="home-card" key={title}>
                <Icon size={20} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-wrap">
          <h2>How it works</h2>
          <ol className="home-steps">
            {STEPS.map((s) => (
              <li key={s.n}><span className="home-steps__n" aria-hidden="true">{s.n}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section home-note">
        <div className="home-wrap">
          <p>Quanta is a simulator. Orders are never sent to an exchange, prices can be delayed and nothing here is investment advice. <Link to="/about">Read more</Link> or see the <Link to="/faq">FAQ</Link>.</p>
        </div>
      </section>
    </div>
  );
}
