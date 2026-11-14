import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { useQuotes } from '../hooks/useQuotes';
import DataTable from '../components/ui/DataTable';
import { ChangeValue, EmptyState, ErrorState, Tabs } from '../components/ui/ui';
import { Allocation, StatStrip } from '../components/PortfolioSummary';
import { aggregateLots, totalsByCurrency, valuePositions } from '../utils/portfolioMath';
import { getMarketStatus } from '../utils/marketHours';
import { displaySymbol, formatDateTime, formatMoney, formatNumber, formatPrice, formatTime, NA } from '../utils/format';
import '../styles/workspace.css';

const readWatchlist = () => {
  try {
    const v = JSON.parse(localStorage.getItem('quanta-watchlist') || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, 20) : [];
  } catch { return []; }
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const symCell = (r) => (
  <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link>{r.name && r.name !== r.symbol && <small>{r.name}</small>}</span>
);

const pnlCell = (amount, pct, symbol) => (
  amount === null || amount === undefined ? NA : (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span className={amount > 0 ? 'positive' : amount < 0 ? 'negative' : ''}>{amount > 0 ? '+' : ''}{formatMoney(amount, symbol)}</span>
      {pct !== undefined && <ChangeValue value={pct} />}
    </span>
  )
);

export default function Dashboard() {
  const { user } = useAuth();
  const wallet = useFetch('/api/wallet');
  const posRes = useFetch('/api/positions');
  const [region, setRegion] = useState('US');
  const [side, setSide] = useState('gainers');
  const [allocCurrency, setAllocCurrency] = useState(null);
  const movers = useFetch(`/api/market/movers?region=${region}`, { interval: 120_000 });

  const lots = useMemo(() => (posRes.data?.positions || []).map((p) => ({ symbol: p.symbol, shares: p.quantity, avgPrice: p.avgCost, name: p.name })), [posRes.data]);
  const lotSymbols = useMemo(() => lots.map((l) => l.symbol), [lots]);
  const watchSymbols = useMemo(readWatchlist, []);
  const allSymbols = useMemo(() => [...new Set([...lotSymbols, ...watchSymbols])], [lotSymbols, watchSymbols]);
  const { quotes, loading: quotesLoading, error: quotesError, updatedAt } = useQuotes(allSymbols, { interval: 60_000 });

  const positions = useMemo(() => valuePositions(aggregateLots(lots), quotes), [lots, quotes]);
  const totals = useMemo(
    () => Object.values(totalsByCurrency(positions)).sort((a, b) => (a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : 0)),
    [positions],
  );
  const currencies = totals.map((t) => t.currency);
  const activeAlloc = allocCurrency && currencies.includes(allocCurrency) ? allocCurrency : currencies[0];

  const watchRows = watchSymbols.map((s) => ({ symbol: s, name: quotes[s]?.name, price: quotes[s]?.price ?? null, changePercent: quotes[s]?.changePercent ?? null }));
  const m = movers.data && movers.data.region === region ? movers.data : null;
  const moverRows = (m?.[side] || []).slice(0, 5);
  const txs = (wallet.data?.transactions || []).slice(0, 6);
  const balances = wallet.data?.wallet?.balances;
  const status = getMarketStatus();

  const holdingColumns = [
    { key: 'symbol', label: 'Symbol', sortable: true, render: symCell },
    { key: 'shares', label: 'Shares', align: 'right', hideBelow: 'sm', sortable: true, render: (r) => formatNumber(r.shares, 4) },
    { key: 'avgCost', label: 'Avg cost', align: 'right', hideBelow: 'lg', render: (r) => formatPrice(r.avgCost, r.symbol) },
    { key: 'price', label: 'Last', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
    { key: 'value', label: 'Value', align: 'right', sortable: true, render: (r) => formatMoney(r.value, r.symbol) },
    { key: 'pnl', label: 'Unrealised P&L', align: 'right', sortable: true, render: (r) => pnlCell(r.pnl, r.pnlPct, r.symbol) },
    { key: 'dayPnl', label: 'Today', align: 'right', hideBelow: 'md', sortable: true, render: (r) => pnlCell(r.dayPnl, undefined, r.symbol) },
  ];

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p className="pg-sub">{status.map((s) => `${s.id} market ${s.isOpen ? 'open' : 'closed'}`).join(' · ')}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat__label">Wallet (simulated)</div>
          <div className="stat__value">{balances ? formatMoney(balances.USD, 'USD') : wallet.error ? '—' : '…'}</div>
          <div className="stat__sub">{balances ? formatMoney(balances.INR, '.NS') : ''}</div>
        </div>
      </header>

      {posRes.error && !posRes.data ? (
        <section className="panel"><ErrorState title="Could not load your holdings" onRetry={posRes.refresh}>{posRes.error}</ErrorState></section>
      ) : totals.length > 0 ? (
        totals.map((t) => <StatStrip key={t.currency} totals={t} realized={posRes.data?.realized?.[t.currency] || null} />)
      ) : (
        !posRes.loading && (
          <section className="panel">
            <EmptyState title="No holdings yet" action={<Link to="/analyzer" className="btn btn-accent btn-sm">Explore stocks</Link>}>
              Your portfolio value, P&amp;L and allocation appear here once you add holdings or place a simulated trade.
            </EmptyState>
          </section>
        )
      )}
      {quotesError && <p className="pg-meta" role="status">Live prices could not be refreshed; figures may be missing or out of date.</p>}

      {positions.length > 0 && (
        <div className="pg-grid pg-grid--3-1">
          <section className="panel" aria-label="Holdings">
            <div className="panel-head"><h2 className="panel-title">Holdings</h2><Link to="/portfolio" className="shell-link-btn">Open portfolio →</Link></div>
            <DataTable columns={holdingColumns} rows={positions} rowKey={(r) => r.symbol} loading={quotesLoading && positions.every((p) => p.price === null)} defaultSort={{ key: 'value', dir: 'desc' }} dense />
            <div className="panel-note">Prices: Yahoo Finance, may be delayed{updatedAt ? `. Updated ${formatTime(updatedAt)}` : ''}. Currencies are not converted or combined.</div>
          </section>
          <section className="panel" aria-label="Allocation">
            <div className="panel-head">
              <h2 className="panel-title">Allocation</h2>
              {currencies.length > 1 && <Tabs tabs={currencies.map((c) => ({ id: c, label: c }))} value={activeAlloc} onChange={setAllocCurrency} label="Currency" />}
            </div>
            <Allocation positions={positions} currency={activeAlloc} />
          </section>
        </div>
      )}

      <div className="pg-grid pg-grid--2">
        <section className="panel" aria-label="Market movers">
          <div className="panel-head">
            <h2 className="panel-title">Market movers</h2>
            <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <Tabs tabs={[{ id: 'gainers', label: 'Gainers' }, { id: 'losers', label: 'Losers' }]} value={side} onChange={setSide} label="Direction" />
              <Tabs tabs={[{ id: 'US', label: 'US' }, { id: 'IN', label: 'India' }]} value={region} onChange={setRegion} label="Region" />
            </span>
          </div>
          {movers.error && !m ? (
            <ErrorState title="Movers unavailable" onRetry={movers.refresh}>{movers.error}</ErrorState>
          ) : (
            <DataTable
              columns={[
                { key: 'symbol', label: 'Symbol', render: symCell },
                { key: 'price', label: 'Price', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
                { key: 'changePercent', label: '% Chg', align: 'right', render: (r) => <ChangeValue value={r.changePercent} /> },
              ]}
              rows={moverRows} rowKey={(r) => r.symbol} loading={!m} skeletonRows={5} empty="No movers right now" dense
            />
          )}
          <div className="panel-note">{m ? `${m.universe}. ` : ''}<Link to="/markets" className="shell-link-btn">Full market overview →</Link></div>
        </section>

        <section className="panel" aria-label="Watchlist">
          <div className="panel-head"><h2 className="panel-title">Watchlist</h2><Link to="/trade" className="shell-link-btn">Trading terminal →</Link></div>
          <DataTable
            columns={[
              { key: 'symbol', label: 'Symbol', render: symCell },
              { key: 'price', label: 'Price', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
              { key: 'changePercent', label: '% Chg', align: 'right', render: (r) => <ChangeValue value={r.changePercent} /> },
            ]}
            rows={watchRows} rowKey={(r) => r.symbol} loading={quotesLoading && watchRows.length > 0 && watchRows.every((r) => r.price === null)}
            empty="Your watchlist is empty. Add stocks from a stock page." dense
          />
          <div className="panel-note">Watchlist is saved in this browser only.</div>
        </section>
      </div>

      <section className="panel" aria-label="Recent activity">
        <div className="panel-head"><h2 className="panel-title">Recent activity</h2><Link to="/wallet" className="shell-link-btn">Wallet →</Link></div>
        {wallet.error && !wallet.data ? (
          <ErrorState title="Wallet unavailable" onRetry={wallet.refresh}>{wallet.error}</ErrorState>
        ) : (
          <DataTable
            columns={[
              { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
              { key: 'kind', label: 'Type', render: (r) => ({ INITIAL: 'Starting balance', DEPOSIT: 'Simulated deposit', BUY: 'Buy', SELL: 'Sell', IMPORT: 'Imported holding' })[r.kind] || r.kind },
              { key: 'symbol', label: 'Details', hideBelow: 'sm', render: (r) => (r.symbol ? `${displaySymbol(r.symbol)}${r.quantity ? ` × ${r.quantity}` : ''}` : '—') },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className={r.amount > 0 ? 'positive' : r.amount < 0 ? 'negative' : ''}>{r.amount > 0 ? '+' : ''}{formatMoney(r.amount, r.currency === 'INR' ? '.NS' : 'USD')}</span> },
            ]}
            rows={txs} rowKey={(r) => r.id} loading={wallet.loading && !wallet.data} skeletonRows={3} empty="No activity yet." dense
          />
        )}
      </section>
    </div>
  );
}
