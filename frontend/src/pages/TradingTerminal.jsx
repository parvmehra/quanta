import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Star, X } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { useQuotes } from '../hooks/useQuotes';
import { useLiveQuote } from '../hooks/useLiveQuote';
import ChartPanel from '../components/ChartPanel';
import OrderTicket from '../components/OrderTicket';
import OrderTable from '../components/OrderTable';
import SymbolSearch from '../components/SymbolSearch';
import DataTable from '../components/ui/DataTable';
import { Badge, ChangeValue, ErrorState, Skeleton, Tabs } from '../components/ui/ui';
import { aggregateLots, valuePositions } from '../utils/portfolioMath';
import { useWatchlist } from '../contexts/WatchlistContext';
import { apiMessage, cancelOrder } from '../services/trading';
import { displaySymbol, exchangeLabel, formatDateTime, formatMoney, formatPrice, formatTime, getCurrencyCode } from '../utils/format';
import '../styles/workspace.css';
import '../styles/stock.css';
import './TradingTerminal.css';

const BOTTOM_TABS = [
  { id: 'open', label: 'Open orders' },
  { id: 'history', label: 'Order history' },
  { id: 'positions', label: 'Positions' },
  { id: 'activity', label: 'Activity' },
];
const KIND_LABEL = { INITIAL: 'Starting balance', DEPOSIT: 'Deposit', BUY: 'Buy', SELL: 'Sell', IMPORT: 'Import' };

function Terminal({ symbol }) {
  const navigate = useNavigate();
  const lq = useLiveQuote(symbol);
  const q = lq.quote;
  const wallet = useFetch('/api/wallet', { interval: 20_000 });
  const positionsRes = useFetch('/api/positions', { interval: 20_000 });
  const orders = useFetch('/api/orders?limit=100', { interval: 15_000 });

  const wl = useWatchlist();
  const watch = wl.symbols;
  const [bottom, setBottom] = useState('open');
  const [region, setRegion] = useState('US');
  const [side, setSide] = useState('gainers');
  const [preset, setPreset] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const activity = useFetch('/api/ledger?limit=50', { enabled: bottom === 'activity' });
  const movers = useFetch(`/api/market/movers?region=${region}`, { interval: 120_000 });

  const lots = useMemo(() => (positionsRes.data?.positions || []).map((p) => ({ symbol: p.symbol, shares: p.quantity, avgPrice: p.avgCost, name: p.name })), [positionsRes.data]);
  const posSymbols = useMemo(() => lots.map((l) => l.symbol), [lots]);
  const quoteSymbols = useMemo(() => [...new Set([...watch, ...posSymbols])], [watch, posSymbols]);
  const quotes = useQuotes(quoteSymbols, { interval: 30_000 });

  const positions = useMemo(() => valuePositions(aggregateLots(lots), { ...quotes.quotes, ...(q ? { [symbol]: q } : {}) }), [lots, quotes.quotes, q, symbol]);
  const myPosition = positions.find((p) => p.symbol === symbol) || null;
  const balances = wallet.data?.wallet?.balances || null;
  const inWatchlist = watch.includes(symbol);
  const currency = getCurrencyCode(symbol);

  const refreshAll = () => { wallet.refresh(); positionsRes.refresh(); orders.refresh(); if (bottom === 'activity') activity.refresh(); };

  const pick = (s) => navigate(`/trade/${encodeURIComponent(String(s).toUpperCase())}`);

  const onWatch = async () => {
    const now = await wl.toggle(symbol);
    if (now !== null) toast.success(now ? `${displaySymbol(symbol)} added to watchlist` : `${displaySymbol(symbol)} removed from watchlist`);
  };
  const removeWatch = async (s) => {
    if (wl.defaultList && watch.includes(s)) { try { await wl.removeSymbol(wl.defaultList.id, s); } catch (err) { toast.error(apiMessage(err)); } }
  };

  const onCancel = async (id) => {
    setCancelling(id);
    try { await cancelOrder(id); toast.success('Order cancelled'); } catch (err) { toast.error(apiMessage(err)); }
    setCancelling(null);
    refreshAll();
  };

  const allOrders = orders.data?.orders || [];
  const openOrders = allOrders.filter((o) => o.status === 'OPEN');
  const history = allOrders.filter((o) => o.status !== 'OPEN');

  const watchRows = watch.map((s) => ({ symbol: s, price: quotes.quotes[s]?.price ?? null, changePercent: quotes.quotes[s]?.changePercent ?? null }));
  const m = movers.data && movers.data.region === region ? movers.data : null;

  const dbDown = wallet.error && !wallet.data && /database/i.test(wallet.error);

  const positionColumns = [
    { key: 'symbol', label: 'Symbol', sortable: true, render: (r) => <button type="button" className="tt-link" onClick={() => pick(r.symbol)}><strong>{displaySymbol(r.symbol)}</strong></button> },
    { key: 'shares', label: 'Qty', align: 'right', render: (r) => r.shares },
    { key: 'avgCost', label: 'Avg cost', align: 'right', hideBelow: 'sm', render: (r) => formatPrice(r.avgCost, r.symbol) },
    { key: 'price', label: 'Last', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
    { key: 'value', label: 'Value', align: 'right', hideBelow: 'sm', render: (r) => formatMoney(r.value, r.symbol) },
    { key: 'pnl', label: 'Unrealised P&L', align: 'right', render: (r) => (r.pnl == null ? '—' : <span className={r.pnl > 0 ? 'positive' : r.pnl < 0 ? 'negative' : ''}>{r.pnl > 0 ? '+' : ''}{formatMoney(r.pnl, r.symbol)} <ChangeValue value={r.pnlPct} /></span>) },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (r.symbol !== symbol) pick(r.symbol); setPreset({ side: 'SELL', quantity: r.shares, nonce: Date.now() }); }}>Sell</button>
    ) },
  ];

  const activityColumns = [
    { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
    { key: 'kind', label: 'Type', render: (r) => KIND_LABEL[r.kind] || r.kind },
    { key: 'symbol', label: 'Details', hideBelow: 'sm', render: (r) => (r.symbol ? `${displaySymbol(r.symbol)}${r.quantity ? ` × ${r.quantity}` : ''}` : r.note || '—') },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className={r.amount > 0 ? 'positive' : r.amount < 0 ? 'negative' : ''}>{r.amount > 0 ? '+' : ''}{new Intl.NumberFormat(r.currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: r.currency }).format(r.amount)}</span> },
  ];

  return (
    <div className="pg tt">
      {dbDown && (
        <section className="panel"><ErrorState title="Trading is unavailable" onRetry={refreshAll}>The database is not connected, so orders cannot be placed. Check MONGO_DB_URI in backend/.env.</ErrorState></section>
      )}

      <div className="tt-grid">
        <aside className="tt-left" aria-label="Watchlist and movers">
          <section className="panel tt-search" aria-label="Find a stock">
            <div className="panel-body"><SymbolSearch fluid hotkey={false} onSelect={pick} placeholder="Find a stock to trade" /></div>
          </section>

          <section className="panel" aria-label="Watchlist">
            <div className="panel-head"><h2 className="panel-title">Watchlist</h2></div>
            {watchRows.length === 0 ? (
              <p className="tt-empty">Your watchlist is empty. Use the star next to a symbol to add it.</p>
            ) : (
              <ul className="tt-list">
                {watchRows.map((r) => (
                  <li key={r.symbol} className={r.symbol === symbol ? 'is-active' : ''}>
                    <button type="button" className="tt-list__main" onClick={() => pick(r.symbol)}>
                      <strong>{displaySymbol(r.symbol)}</strong>
                      <span>{formatPrice(r.price, r.symbol)}</span>
                      <ChangeValue value={r.changePercent} />
                    </button>
                    <button type="button" className="tt-list__x" aria-label={`Remove ${r.symbol} from watchlist`} onClick={() => removeWatch(r.symbol)}><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="panel-note"><Link to="/watchlist" className="shell-link-btn">Manage lists →</Link></div>
          </section>

          <section className="panel" aria-label="Market movers">
            <div className="panel-head">
              <h2 className="panel-title">Movers</h2>
              <span className="tt-tabs">
                <Tabs tabs={[{ id: 'gainers', label: '▲' }, { id: 'losers', label: '▼' }]} value={side} onChange={setSide} label="Direction" />
                <Tabs tabs={[{ id: 'US', label: 'US' }, { id: 'IN', label: 'IN' }]} value={region} onChange={setRegion} label="Region" />
              </span>
            </div>
            {movers.error && !m ? (
              <p className="tt-empty">Movers unavailable.</p>
            ) : !m ? (
              <div className="panel-body"><Skeleton width="100%" height={14} /></div>
            ) : (
              <ul className="tt-list">
                {(m[side] || []).slice(0, 6).map((r) => (
                  <li key={r.symbol}>
                    <button type="button" className="tt-list__main" onClick={() => pick(r.symbol)}>
                      <strong>{displaySymbol(r.symbol)}</strong>
                      <span>{formatPrice(r.price, r.symbol)}</span>
                      <ChangeValue value={r.changePercent} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="tt-centre">
          <section className="panel tt-head" aria-label="Selected stock">
            <div>
              <div className="tt-head__title">
                <h1 className="tt-name">{q?.name || displaySymbol(symbol)}</h1>
                <Badge>{exchangeLabel(symbol)}</Badge>
                <span className="sd-sym">{displaySymbol(symbol)}</span>
                <button type="button" className={`tt-star${inWatchlist ? ' is-on' : ''}`} onClick={onWatch} aria-pressed={inWatchlist} aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}>
                  <Star size={16} fill={inWatchlist ? 'currentColor' : 'none'} />
                </button>
              </div>
              <span className="pg-meta">{lq.connected ? 'Streaming' : 'Not streaming'}{lq.live ? ` · updated ${formatTime(lq.live.timestamp)}` : ''} · Yahoo Finance, may be delayed</span>
            </div>
            <div className="tt-head__price">
              {q ? (
                <>
                  <span className="sd-price">{formatPrice(q.price, symbol)}</span>
                  <span className="sd-chg"><ChangeValue value={q.change} suffix="" /> <ChangeValue value={q.changePercent} /></span>
                </>
              ) : lq.error ? <span className="negative">Price unavailable</span> : <Skeleton width={150} height={30} />}
            </div>
            <span style={{ display: 'inline-flex', gap: 'var(--sp-2)' }}>
              <Link to={`/advisor?symbol=${encodeURIComponent(symbol)}`} className="btn btn-secondary btn-sm">Ask AI</Link>
              <Link to={`/stock/${encodeURIComponent(symbol)}`} className="btn btn-secondary btn-sm">Analysis</Link>
            </span>
          </section>

          {lq.error && !q ? (
            <section className="panel"><ErrorState title={`Could not load ${displaySymbol(symbol)}`} onRetry={lq.refresh}>{lq.error}</ErrorState></section>
          ) : (
            <ChartPanel symbol={symbol} full defaultRange="1D" height={400} />
          )}
        </div>

        <aside className="tt-right" aria-label="Order ticket">
          <OrderTicket symbol={symbol} quote={q} position={myPosition ? { quantity: myPosition.shares } : null} balances={balances} preset={preset} onDone={refreshAll} />
          <section className="panel" aria-label="Your position">
            <div className="panel-head"><h2 className="panel-title">Your position</h2></div>
            {myPosition ? (
              <dl className="sd-facts sd-facts--pad">
                <div className="sd-row"><dt>Shares</dt><dd>{myPosition.shares}</dd></div>
                <div className="sd-row"><dt>Average cost</dt><dd>{formatPrice(myPosition.avgCost, symbol)}</dd></div>
                <div className="sd-row"><dt>Market value</dt><dd>{formatMoney(myPosition.value, symbol)}</dd></div>
                <div className="sd-row"><dt>Unrealised P&amp;L</dt><dd>{myPosition.pnl == null ? '—' : <span className={myPosition.pnl > 0 ? 'positive' : myPosition.pnl < 0 ? 'negative' : ''}>{myPosition.pnl > 0 ? '+' : ''}{formatMoney(myPosition.pnl, symbol)}</span>}</dd></div>
              </dl>
            ) : (
              <p className="tt-empty">You do not hold {displaySymbol(symbol)}. Balance available: {balances ? formatMoney(balances[currency], symbol) : '…'}.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="panel" aria-label="Orders and positions">
        <div className="panel-head">
          <Tabs tabs={BOTTOM_TABS.map((t) => ({ ...t, label: t.id === 'open' && openOrders.length ? `${t.label} (${openOrders.length})` : t.label }))} value={bottom} onChange={setBottom} label="Tables" />
          <Link to="/orders" className="shell-link-btn">All orders →</Link>
        </div>
        {bottom === 'open' && <OrderTable orders={openOrders} loading={orders.loading && !orders.data} onCancel={onCancel} cancellingId={cancelling} empty="No open orders. Limit and stop orders wait here until the market reaches your price." />}
        {bottom === 'history' && <OrderTable orders={history} loading={orders.loading && !orders.data} empty="No completed orders yet." />}
        {bottom === 'positions' && <DataTable columns={positionColumns} rows={positions} rowKey={(r) => r.symbol} loading={positionsRes.loading && !positionsRes.data} empty="You have no positions yet." dense defaultSort={{ key: 'symbol', dir: 'asc' }} />}
        {bottom === 'activity' && <DataTable columns={activityColumns} rows={activity.data?.entries || []} rowKey={(r) => r.id} loading={activity.loading && !activity.data} empty="No activity yet." dense />}
      </section>
    </div>
  );
}

export default function TradingTerminal() {
  const { symbol } = useParams();
  const wl = useWatchlist();
  if (!symbol) {
    if (!wl.loaded && !wl.error) return null;
    const first = wl.symbols[0] || 'AAPL';
    return <Navigate to={`/trade/${encodeURIComponent(first)}`} replace />;
  }
  let s = '';
  try { s = decodeURIComponent(symbol).trim().toUpperCase(); } catch { s = String(symbol).toUpperCase(); }
  return <Terminal key={s} symbol={s} />;
}
