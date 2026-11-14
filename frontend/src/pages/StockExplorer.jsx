import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { useQuotes } from '../hooks/useQuotes';
import DataTable from '../components/ui/DataTable';
import { Badge, ChangeValue, ErrorState, Tabs } from '../components/ui/ui';
import { displaySymbol, exchangeLabel, formatMarketCap, formatPrice, formatTime, formatVolume, getCurrencyCode } from '../utils/format';
import '../styles/workspace.css';

// Shown when there is no search query. Real symbols, live quotes - not a ranking.
const POPULAR = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM',
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'SBIN.NS', 'TMPV.NS', 'ITC.NS',
];
const SUGGESTIONS = ['AAPL', 'TSLA', 'NVDA', 'RELIANCE', 'TCS', 'TATA'];
const MARKETS = [{ id: 'ALL', label: 'All' }, { id: 'USD', label: 'US' }, { id: 'INR', label: 'India' }];

const columns = [
  { key: 'symbol', label: 'Symbol', sortable: true, render: (r) => (
    <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link><small>{r.name}</small></span>
  ) },
  { key: 'exchange', label: 'Exchange', hideBelow: 'sm', sortable: true, render: (r) => <Badge>{r.exchange}</Badge> },
  { key: 'price', label: 'Price', align: 'right', sortable: true, render: (r) => formatPrice(r.price, r.symbol) },
  { key: 'changePercent', label: '% Change', align: 'right', sortable: true, render: (r) => <ChangeValue value={r.changePercent} /> },
  { key: 'volume', label: 'Volume', align: 'right', hideBelow: 'md', sortable: true, render: (r) => formatVolume(r.volume) },
  { key: 'marketCap', label: 'Market cap', align: 'right', hideBelow: 'md', sortable: true, render: (r) => formatMarketCap(r.marketCap, r.symbol) },
  { key: 'actions', label: '', align: 'right', render: (r) => (
    <span className="row-actions">
      <Link to={`/stock/${encodeURIComponent(r.symbol)}`}>Analyze</Link>
      <Link to={`/trade/${encodeURIComponent(r.symbol)}`}>Trade</Link>
    </span>
  ) },
];

export default function StockExplorer() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [input, setInput] = useState(q);
  const [market, setMarket] = useState('ALL');
  const [search, setSearch] = useState({ q: null, results: [], error: null });

  // URL -> input (header search box navigates here)
  useEffect(() => { setInput(q); }, [q]);

  // input -> URL, debounced
  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim();
      if (next !== q) setParams(next ? { q: next } : {}, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [input, q, setParams]);

  // Run the search for the URL query
  useEffect(() => {
    if (q.length < 1) { setSearch({ q: null, results: [], error: null }); return undefined; }
    const ctrl = new AbortController();
    axiosInstance.get(`/api/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, timeout: 20000 })
      .then((res) => setSearch({ q, results: Array.isArray(res.data) ? res.data : [], error: null }))
      .catch((err) => { if (!ctrl.signal.aborted) setSearch({ q, results: [], error: err.response?.data?.message || err.message }); });
    return () => ctrl.abort();
  }, [q]);

  const searching = q.length > 0 && search.q !== q;
  const symbols = useMemo(() => (q ? search.results.map((r) => r.symbol) : POPULAR), [q, search.results]);
  // The server caches search results for hours, so always overlay a fresh batch quote.
  const { quotes, loading: quotesLoading, updatedAt, error: quotesError } = useQuotes(searching ? [] : symbols, { interval: 60_000 });

  const rows = useMemo(() => {
    const base = q
      ? search.results.map((r) => ({ symbol: r.symbol, name: r.description, exchange: exchangeLabel(r.symbol, r.exchange), fallback: r }))
      : POPULAR.map((s) => ({ symbol: s, name: s, exchange: exchangeLabel(s), fallback: null }));
    return base
      .map((r) => {
        const live = quotes[r.symbol];
        const src = live || r.fallback || {};
        return {
          symbol: r.symbol,
          name: live?.name || r.name,
          exchange: r.exchange,
          price: live ? live.price : null,
          changePercent: live ? live.changePercent : null,
          volume: src.volume ?? null,
          marketCap: src.marketCap ?? null,
          hasLive: Boolean(live),
        };
      })
      .filter((r) => market === 'ALL' || getCurrencyCode(r.symbol, r.exchange) === market);
  }, [q, search.results, quotes, market]);

  const loading = searching || (quotesLoading && rows.every((r) => !r.hasLive));

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Stock Explorer</h1>
          <p className="pg-sub">{q ? `Results for “${q}”` : 'Popular stocks across US and Indian markets'}</p>
        </div>
      </header>

      <section className="panel" aria-label="Stock screener">
        <div className="toolbar">
          <label className="field">
            <Search size={15} aria-hidden="true" />
            <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by symbol or company, e.g. AAPL, Reliance" aria-label="Search stocks" />
          </label>
          <Tabs tabs={MARKETS} value={market} onChange={setMarket} label="Market" />
          {!q && (
            <div className="chip-row" aria-label="Suggestions">
              {SUGGESTIONS.map((s) => (<button key={s} type="button" className="chip" onClick={() => setInput(s)}>{s}</button>))}
            </div>
          )}
        </div>

        {search.error && !searching ? (
          <ErrorState title="Search failed" onRetry={() => setParams({ q }, { replace: true })}>{search.error}</ErrorState>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.symbol}
            loading={loading}
            defaultSort={q ? undefined : { key: 'symbol', dir: 'asc' }}
            empty={q ? `No stocks found for “${q}”.` : 'No data available.'}
          />
        )}
        <div className="panel-note">
          {quotesError && 'Live quotes could not be refreshed. '}
          Prices: Yahoo Finance, may be delayed. {updatedAt ? `Last updated ${formatTime(updatedAt)}.` : ''} Missing values are shown as “—”.
        </div>
      </section>
    </div>
  );
}
