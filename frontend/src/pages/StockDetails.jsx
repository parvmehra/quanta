import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, BellOff, ExternalLink, Star } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useFetch } from '../hooks/useFetch';
import { useQuotes } from '../hooks/useQuotes';
import ChartPanel from '../components/ChartPanel';
import { useLiveQuote } from '../hooks/useLiveQuote';
import { Badge, ChangeValue, EmptyState, ErrorState, Skeleton, Tabs } from '../components/ui/ui';
import DataTable from '../components/ui/DataTable';
import { isInWatchlist, toggleWatchlist } from '../utils/watchlist';
import { displaySymbol, exchangeLabel, formatDateTime, formatMarketCap, formatNumber, formatPrice, formatTime, formatVolume, getCurrencyCode, NA } from '../utils/format';
import '../styles/workspace.css';
import '../styles/stock.css';

const PAGE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'chart', label: 'Chart' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'news', label: 'News' },
];
const MARKET_STATE = {
  REGULAR: { label: 'Market open', live: true },
  PRE: { label: 'Pre-market', live: false },
  PREPRE: { label: 'Market closed', live: false },
  POST: { label: 'After hours', live: false },
  POSTPOST: { label: 'Market closed', live: false },
  CLOSED: { label: 'Market closed', live: false },
};

const currencyFmt = (code, opts) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code || 'USD', ...opts });

function formatField(value, type, currency) {
  if (value === null || value === undefined) return NA;
  switch (type) {
    case 'money': return currencyFmt(currency, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
    case 'price': return currencyFmt(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    case 'ratio': return Number(value).toFixed(2);
    case 'pct': return `${(Number(value) * 100).toFixed(2)}%`;
    case 'number': return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
    case 'date': return formatDateTime(value).split(',')[0] || NA;
    case 'text': return String(value).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    default: return String(value);
  }
}

const SECTIONS = [
  { title: 'Valuation', rows: [
    ['valuation', 'marketCap', 'Market cap', 'money'], ['valuation', 'enterpriseValue', 'Enterprise value', 'money'],
    ['valuation', 'trailingPE', 'P/E (trailing)', 'ratio'], ['valuation', 'forwardPE', 'P/E (forward)', 'ratio'],
    ['valuation', 'pegRatio', 'PEG ratio', 'ratio'], ['valuation', 'priceToSales', 'Price / sales', 'ratio'],
    ['valuation', 'priceToBook', 'Price / book', 'ratio'], ['valuation', 'evToEbitda', 'EV / EBITDA', 'ratio'],
    ['valuation', 'evToRevenue', 'EV / revenue', 'ratio'],
  ] },
  { title: 'Profitability and growth', rows: [
    ['profitability', 'grossMargin', 'Gross margin', 'pct'], ['profitability', 'operatingMargin', 'Operating margin', 'pct'],
    ['profitability', 'profitMargin', 'Net profit margin', 'pct'], ['profitability', 'returnOnEquity', 'Return on equity', 'pct'],
    ['profitability', 'returnOnAssets', 'Return on assets', 'pct'], ['growth', 'revenueGrowth', 'Revenue growth (YoY)', 'pct'],
    ['growth', 'earningsGrowth', 'Earnings growth (YoY)', 'pct'],
  ] },
  { title: 'Per share and dividends', rows: [
    ['perShare', 'epsTrailing', 'EPS (trailing)', 'price'], ['perShare', 'epsForward', 'EPS (forward)', 'price'],
    ['perShare', 'bookValue', 'Book value', 'price'], ['perShare', 'revenuePerShare', 'Revenue per share', 'price'],
    ['dividends', 'dividendRate', 'Dividend rate', 'price'], ['dividends', 'dividendYield', 'Dividend yield', 'pct'],
    ['dividends', 'payoutRatio', 'Payout ratio', 'pct'], ['dividends', 'exDividendDate', 'Ex-dividend date', 'date'],
  ] },
  { title: 'Financial health', rows: [
    ['health', 'totalRevenue', 'Revenue (TTM)', 'money'], ['health', 'ebitda', 'EBITDA', 'money'],
    ['health', 'totalCash', 'Total cash', 'money'], ['health', 'totalDebt', 'Total debt', 'money'],
    ['health', 'debtToEquity', 'Debt / equity', 'ratio'], ['health', 'currentRatio', 'Current ratio', 'ratio'],
    ['health', 'quickRatio', 'Quick ratio', 'ratio'], ['health', 'freeCashflow', 'Free cash flow', 'money'],
    ['health', 'operatingCashflow', 'Operating cash flow', 'money'],
  ] },
  { title: 'Trading', rows: [
    ['trading', 'beta', 'Beta', 'ratio'], ['trading', 'averageVolume', 'Average volume', 'number'],
    ['trading', 'averageVolume10Day', 'Average volume (10d)', 'number'], ['trading', 'fiftyDayAverage', '50-day average', 'price'],
    ['trading', 'twoHundredDayAverage', '200-day average', 'price'], ['trading', 'sharesOutstanding', 'Shares outstanding', 'number'],
    ['trading', 'floatShares', 'Float', 'number'],
  ] },
  { title: 'Analyst view', rows: [
    ['analyst', 'recommendation', 'Consensus', 'text'], ['analyst', 'analystCount', 'Analysts', 'number'],
    ['analyst', 'targetMean', 'Target price (mean)', 'price'], ['analyst', 'targetHigh', 'Target price (high)', 'price'],
    ['analyst', 'targetLow', 'Target price (low)', 'price'],
  ] },
];

function RangeBar({ low, high, value, symbol }) {
  if (low == null || high == null || high <= low) return <span>{NA}</span>;
  const pos = value == null ? null : Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <div className="sd-range">
      <div className="sd-range__bar">{pos !== null && <span className="sd-range__dot" style={{ left: `${pos}%` }} />}</div>
      <div className="sd-range__labels"><span>{formatPrice(low, symbol)}</span><span>{formatPrice(high, symbol)}</span></div>
    </div>
  );
}

function StatRow({ label, children }) {
  return (<div className="sd-row"><dt>{label}</dt><dd>{children}</dd></div>);
}

function NewsList({ news, limit }) {
  if (news.loading && !news.data) return <div className="panel-body"><Skeleton height={14} width="80%" /><br /><br /><Skeleton height={14} width="60%" /></div>;
  if (news.error && !news.data) return <ErrorState title="News unavailable" onRetry={news.refresh}>{news.error}</ErrorState>;
  const items = (news.data || []).slice(0, limit);
  if (!items.length) return <EmptyState title="No recent news">No articles were returned for this symbol.</EmptyState>;
  return (
    <ul className="sd-news">
      {items.map((a, i) => (
        <li key={`${a.url}-${i}`}>
          <a href={a.url} target="_blank" rel="noopener noreferrer">{a.headline} <ExternalLink size={12} aria-hidden="true" /></a>
          <span className="sd-news__meta">{a.source}{a.datetime ? ` · ${formatDateTime(a.datetime)}` : ''}</span>
          {a.summary && a.summary !== a.headline && <p>{a.summary}</p>}
        </li>
      ))}
    </ul>
  );
}

function StockPage({ symbol }) {
  const { isAuthenticated } = useAuth();
  const { addNotification } = useNotification();
  const enc = encodeURIComponent(symbol);

  const lq = useLiveQuote(symbol);
  const q = lq.quote;
  const live = lq.live;
  const connected = lq.connected;
  const fund = useFetch(`/api/stocks/fundamentals/${enc}`);
  const news = useFetch(`/api/stocks/news/${enc}`);
  const subs = useFetch('/api/stocks/subscriptions', { enabled: isAuthenticated });

  const [tab, setTab] = useState('overview');
  const [watching, setWatching] = useState(() => isInWatchlist(symbol));
  const [alertOverride, setAlertOverride] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const alertsOn = alertOverride ?? (subs.data || []).some((s) => s.symbol === symbol);

  const f = fund.data;
  const name = f?.name || q?.name || symbol;
  const currency = f?.currency || getCurrencyCode(symbol);

  useEffect(() => {
    if (!alertsOn || !live) return;
    const key = `quanta-lastAlert-${symbol}`;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 60000) {
        addNotification(`Price update: ${displaySymbol(symbol)}`, `Now ${formatPrice(live.price, symbol)}`, 'info');
        sessionStorage.setItem(key, String(Date.now()));
      }
    } catch { }
  }, [live, alertsOn, symbol, addNotification]);

  const relatedSymbols = useMemo(() => (f?.related || []).map((r) => r.symbol), [f]);
  const related = useQuotes(relatedSymbols);

  const onWatch = () => {
    const now = toggleWatchlist(symbol);
    setWatching(now);
    toast.success(now ? `${displaySymbol(symbol)} added to watchlist` : `${displaySymbol(symbol)} removed from watchlist`);
  };

  const onAlerts = async () => {
    if (!isAuthenticated) { toast.error('Log in to manage price alerts.'); return; }
    const next = !alertsOn;
    setAlertOverride(next);
    try {
      if (next) await axiosInstance.post('/api/stocks/subscriptions', { symbol, companyName: name, price: q?.price || 0 });
      else await axiosInstance.delete(`/api/stocks/subscriptions/${enc}`);
      toast.success(next ? `Alerts on for ${displaySymbol(symbol)}` : `Alerts off for ${displaySymbol(symbol)}`);
    } catch (err) {
      setAlertOverride(!next);
      toast.error(err.response?.data?.message || 'Could not update alerts.');
    }
  };

  if (lq.error && !q) {
    return (
      <div className="pg">
        <section className="panel">
          <ErrorState title={`Could not load ${displaySymbol(symbol)}`} onRetry={lq.refresh}>
            {lq.error} The symbol may not exist, or the data provider is temporarily unavailable. <Link to="/analyzer" className="shell-link-btn">Back to Stock Explorer</Link>
          </ErrorState>
        </section>
      </div>
    );
  }

  const state = MARKET_STATE[live?.marketState];
  const profile = f?.profile;

  return (
    <div className="pg">
      <header className="sd-head panel">
        <div className="sd-head__id">
          <div className="sd-head__title">
            <h1 className="pg-title">{name}</h1>
            <Badge>{exchangeLabel(symbol, f?.exchange)}</Badge>
            <span className="sd-sym">{displaySymbol(symbol)}</span>
          </div>
          <p className="pg-sub">{[profile?.sector, profile?.industry].filter(Boolean).join(' · ') || (fund.loading ? ' ' : 'Sector information unavailable')}</p>
        </div>

        <div className="sd-head__price">
          {q ? (
            <>
              <span className="sd-price">{formatPrice(q.price, symbol)}</span>
              <span className="sd-chg"><ChangeValue value={q.change} suffix="" digits={2} /> <ChangeValue value={q.changePercent} /></span>
              <span className="pg-meta">
                {state ? `${state.label}. ` : ''}{connected ? 'Streaming' : 'Not streaming'}{live ? ` · updated ${formatTime(live.timestamp)}` : ''} · Yahoo Finance, may be delayed
              </span>
            </>
          ) : <Skeleton width={180} height={34} />}
        </div>

        <div className="sd-head__actions">
          <button type="button" className={`btn btn-secondary btn-sm${watching ? ' is-on' : ''}`} onClick={onWatch} aria-pressed={watching}>
            <Star size={14} fill={watching ? 'currentColor' : 'none'} /> {watching ? 'Watching' : 'Watchlist'}
          </button>
          <button type="button" className={`btn btn-secondary btn-sm${alertsOn ? ' is-on' : ''}`} onClick={onAlerts} aria-pressed={alertsOn}>
            {alertsOn ? <BellOff size={14} /> : <Bell size={14} />} {alertsOn ? 'Alerts on' : 'Alerts'}
          </button>
          <Link to={`/advisor?symbol=${enc}`} className="btn btn-secondary btn-sm">Ask AI</Link>
          <Link to={`/trade/${enc}`} className="btn btn-accent btn-sm">Trade</Link>
        </div>
      </header>

      <div className="sd-tabs" role="tablist" aria-label="Sections">
        {PAGE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`sd-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="pg-grid pg-grid--2-1">
          <div className="sd-col">
            <div className="sd-o1"><ChartPanel symbol={symbol} defaultRange="1M" /></div>

            <section className="panel sd-o3" aria-label="About the company">
              <div className="panel-head"><h2 className="panel-title">About</h2></div>
              {fund.loading && !f ? <div className="panel-body"><Skeleton width="90%" /><br /><br /><Skeleton width="70%" /></div>
                : profile?.description ? (
                  <div className="panel-body">
                    <p className={`sd-about${aboutOpen ? ' is-open' : ''}`}>{profile.description}</p>
                    <button type="button" className="shell-link-btn" onClick={() => setAboutOpen(!aboutOpen)}>{aboutOpen ? 'Show less' : 'Show more'}</button>
                    <dl className="sd-facts">
                      {profile.sector && <StatRow label="Sector">{profile.sector}</StatRow>}
                      {profile.industry && <StatRow label="Industry">{profile.industry}</StatRow>}
                      {profile.employees != null && <StatRow label="Employees">{formatNumber(profile.employees, 0)}</StatRow>}
                      {(profile.city || profile.country) && <StatRow label="Headquarters">{[profile.city, profile.country].filter(Boolean).join(', ')}</StatRow>}
                      {profile.website && <StatRow label="Website"><a href={profile.website} target="_blank" rel="noopener noreferrer">{profile.website.replace(/^https?:\/\//, '')}</a></StatRow>}
                    </dl>
                  </div>
                ) : <EmptyState title="No company profile">The provider did not return a description for this symbol.</EmptyState>}
            </section>

            <section className="panel sd-o4" aria-label="Latest news">
              <div className="panel-head"><h2 className="panel-title">Latest news</h2><button type="button" className="shell-link-btn" onClick={() => setTab('news')}>All news →</button></div>
              <NewsList news={news} limit={3} />
            </section>
          </div>

          <div className="sd-col">
            <section className="panel sd-o2" aria-label="Key statistics">
              <div className="panel-head"><h2 className="panel-title">Key statistics</h2></div>
              <dl className="sd-facts sd-facts--pad">
                <StatRow label="Open">{formatPrice(q?.open, symbol)}</StatRow>
                <StatRow label="Previous close">{formatPrice(q?.previousClose, symbol)}</StatRow>
                <StatRow label="Day range"><RangeBar low={q?.low} high={q?.high} value={q?.price} symbol={symbol} /></StatRow>
                <StatRow label="52-week range"><RangeBar low={f?.range52?.low} high={f?.range52?.high} value={q?.price} symbol={symbol} /></StatRow>
                <StatRow label="Volume">{formatVolume(q?.volume)}</StatRow>
                <StatRow label="Avg. volume">{formatVolume(f?.trading?.averageVolume)}</StatRow>
                <StatRow label="Market cap">{formatMarketCap(f?.valuation?.marketCap ?? q?.marketCap, symbol)}</StatRow>
                <StatRow label="P/E (trailing)">{formatField(f?.valuation?.trailingPE, 'ratio')}</StatRow>
                <StatRow label="EPS (trailing)">{formatField(f?.perShare?.epsTrailing, 'price', currency)}</StatRow>
                <StatRow label="Dividend yield">{formatField(f?.dividends?.dividendYield, 'pct')}</StatRow>
                <StatRow label="Beta">{formatField(f?.trading?.beta, 'ratio')}</StatRow>
              </dl>
            </section>

            {relatedSymbols.length > 0 && (
              <section className="panel sd-o5" aria-label="Related stocks">
                <div className="panel-head"><h2 className="panel-title">Related stocks</h2></div>
                <DataTable
                  columns={[
                    { key: 'symbol', label: 'Symbol', render: (r) => <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link><small>{related.quotes[r.symbol]?.name}</small></span> },
                    { key: 'price', label: 'Price', align: 'right', render: (r) => formatPrice(related.quotes[r.symbol]?.price, r.symbol) },
                    { key: 'chg', label: '% Chg', align: 'right', render: (r) => <ChangeValue value={related.quotes[r.symbol]?.changePercent} /> },
                  ]}
                  rows={f.related} rowKey={(r) => r.symbol} loading={related.loading && !Object.keys(related.quotes).length} skeletonRows={4} dense
                />
                <div className="panel-note">Suggested by Yahoo Finance.</div>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'chart' && <ChartPanel symbol={symbol} full defaultRange="6M" />}

      {tab === 'fundamentals' && (
        fund.error && !f ? (
          <section className="panel"><ErrorState title="Company data unavailable" onRetry={fund.refresh}>{fund.error}</ErrorState></section>
        ) : (
          <>
            <div className="pg-grid pg-grid--3 sd-fund">
              {SECTIONS.map((sec) => (
                <section className="panel" key={sec.title}>
                  <div className="panel-head"><h2 className="panel-title">{sec.title}</h2></div>
                  <dl className="sd-facts sd-facts--pad">
                    {sec.rows.map(([group, key, label, type]) => (
                      <StatRow key={key} label={label}>{fund.loading && !f ? <Skeleton width={60} /> : formatField(f?.[group]?.[key], type, currency)}</StatRow>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <p className="pg-meta">“—” means the data provider did not report the value; it is not zero. {f ? `Source: ${f.source}, fetched ${formatTime(f.fetchedAt)}. Percentages are shown as reported by the provider.` : ''}</p>
          </>
        )
      )}

      {tab === 'news' && (
        <section className="panel" aria-label="News">
          <div className="panel-head"><h2 className="panel-title">News for {displaySymbol(symbol)}</h2></div>
          <NewsList news={news} limit={20} />
          <div className="panel-note">Headlines link to the publisher. Quanta does not endorse their content.</div>
        </section>
      )}
    </div>
  );
}

export default function StockDetails() {
  const { symbol } = useParams();
  let s = '';
  try { s = decodeURIComponent(symbol || '').trim().toUpperCase(); } catch { s = String(symbol || '').toUpperCase(); }
  return <StockPage key={s} symbol={s} />;
}
