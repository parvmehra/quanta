import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { useQuotes } from '../hooks/useQuotes';
import DataTable from '../components/ui/DataTable';
import { ChangeValue, EmptyState, ErrorState, Tabs } from '../components/ui/ui';
import { aggregateLots, totalsByCurrency, valuePositions } from '../utils/portfolioMath';
import { getMarketStatus } from '../utils/marketHours';
import { displaySymbol, formatDateTime, formatMoney, formatNumber, formatPrice, formatTime, NA } from '../utils/format';
import '../styles/workspace.css';

// Categorical palette: no red/green (reserved for gain/loss).
const PALETTE = ['#60A5FA', '#A78BFA', '#FBBF24', '#F472B6', '#22D3EE', '#FB923C', '#818CF8'];
const OTHER = '#64748B';

const readWatchlist = () => {
  try {
    const v = JSON.parse(localStorage.getItem('stockpulse-watchlist') || '[]');
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

function StatStrip({ totals: t0 }) {
  const sym = t0.currency === 'INR' ? '.NS' : '';
  const hasPrices = t0.count > t0.unpriced;
  const totals = hasPrices ? t0 : { ...t0, value: null, invested: null, pnl: null, pnlPct: null, dayPnl: null, dayPnlPct: null };
  const sign = (n) => (n > 0 ? '+' : '');
  return (
    <div>
      <div className="strip-caption">{totals.currency === 'INR' ? 'India holdings (INR)' : 'US holdings (USD)'}</div>
      <div className="stat-strip">
        <div className="stat"><span className="stat__label">Portfolio value</span><span className="stat__value">{formatMoney(totals.value, sym)}</span><span className="stat__sub">{totals.count} position{totals.count === 1 ? '' : 's'}{totals.unpriced ? `, ${totals.unpriced} without a live price` : ''}</span></div>
        <div className="stat"><span className="stat__label">Invested</span><span className="stat__value">{formatMoney(totals.invested, sym)}</span><span className="stat__sub">Cost basis</span></div>
        <div className="stat"><span className="stat__label">Total P&amp;L</span><span className={`stat__value ${totals.pnl > 0 ? 'positive' : totals.pnl < 0 ? 'negative' : ''}`}>{sign(totals.pnl)}{formatMoney(totals.pnl, sym)}</span><span className="stat__sub"><ChangeValue value={totals.pnlPct} /> unrealised</span></div>
        <div className="stat"><span className="stat__label">Today&rsquo;s P&amp;L</span><span className={`stat__value ${totals.dayPnl > 0 ? 'positive' : totals.dayPnl < 0 ? 'negative' : ''}`}>{sign(totals.dayPnl)}{formatMoney(totals.dayPnl, sym)}</span><span className="stat__sub"><ChangeValue value={totals.dayPnlPct} /></span></div>
      </div>
    </div>
  );
}

function Allocation({ positions, currency }) {
  const rows = positions.filter((p) => p.currency === currency && p.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, p) => s + p.value, 0);
  const top = rows.slice(0, PALETTE.length);
  const rest = rows.slice(PALETTE.length).reduce((s, p) => s + p.value, 0);
  const slices = [...top.map((p, i) => ({ name: displaySymbol(p.symbol), value: p.value, color: PALETTE[i] })), ...(rest > 0 ? [{ name: 'Other', value: rest, color: OTHER }] : [])];
  if (!total) return <EmptyState title="Nothing to allocate">No priced holdings in this currency.</EmptyState>;
  return (
    <div className="panel-body" style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 150, height: 150, flex: 'none' }} role="img" aria-label="Allocation by market value">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={1} stroke="var(--q-surface)">
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${((v / total) * 100).toFixed(1)}%`, n]}
              contentStyle={{ background: 'var(--q-surface-2)', border: '1px solid var(--q-border-strong)', borderRadius: 4, fontSize: 12 }}
              itemStyle={{ color: 'var(--q-text)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend" style={{ flex: 1, minWidth: 140 }}>
        {slices.map((s) => (<li key={s.name}><i style={{ background: s.color }} /><span>{s.name}</span><span>{((s.value / total) * 100).toFixed(1)}%</span></li>))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const wallet = useFetch('/api/wallet');
  const lots = useFetch('/api/protfolio');
  const [region, setRegion] = useState('US');
  const [side, setSide] = useState('gainers');
  const [allocCurrency, setAllocCurrency] = useState(null);
  const movers = useFetch(`/api/market/movers?region=${region}`, { interval: 120_000 });

  const lotSymbols = useMemo(() => [...new Set((lots.data || []).map((l) => String(l.symbol).toUpperCase()))], [lots.data]);
  const watchSymbols = useMemo(readWatchlist, []);
  const allSymbols = useMemo(() => [...new Set([...lotSymbols, ...watchSymbols])], [lotSymbols, watchSymbols]);
  const { quotes, loading: quotesLoading, error: quotesError, updatedAt } = useQuotes(allSymbols, { interval: 60_000 });

  const positions = useMemo(() => valuePositions(aggregateLots(lots.data || []), quotes), [lots.data, quotes]);
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
  const balance = wallet.data?.wallet?.balance ?? user?.wallet?.balance;
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
          <div className="stat__label">Wallet balance (simulated)</div>
          <div className="stat__value">{wallet.loading && balance === undefined ? '…' : formatMoney(balance, 'USD')}</div>
        </div>
      </header>

      {lots.error && !lots.data ? (
        <section className="panel"><ErrorState title="Could not load your holdings" onRetry={lots.refresh}>{lots.error}</ErrorState></section>
      ) : totals.length > 0 ? (
        totals.map((t) => <StatStrip key={t.currency} totals={t} />)
      ) : (
        !lots.loading && (
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

      <section className="panel" aria-label="Recent wallet activity">
        <div className="panel-head"><h2 className="panel-title">Recent wallet activity</h2><span className="pg-meta">Simulated funds</span></div>
        {wallet.error && !wallet.data ? (
          <ErrorState title="Wallet unavailable" onRetry={wallet.refresh}>{wallet.error}</ErrorState>
        ) : (
          <DataTable
            columns={[
              { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
              { key: 'type', label: 'Type', render: (r) => (r.type === 'TOPUP' ? 'Simulated deposit' : r.type) },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => formatMoney(r.amount, 'USD') },
              { key: 'balanceAfter', label: 'Balance after', align: 'right', hideBelow: 'sm', render: (r) => formatMoney(r.balanceAfter, 'USD') },
            ]}
            rows={txs} rowKey={(r) => r._id} loading={wallet.loading && !wallet.data} skeletonRows={3} empty="No wallet activity yet." dense
          />
        )}
      </section>
    </div>
  );
}
