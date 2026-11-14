import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { useFetch } from '../hooks/useFetch';
import { useQuotes } from '../hooks/useQuotes';
import DataTable from '../components/ui/DataTable';
import ImportModal from '../components/ImportModal';
import { Allocation, StatStrip } from '../components/PortfolioSummary';
import { Badge, ChangeValue, EmptyState, ErrorState, Tabs } from '../components/ui/ui';
import { aggregateLots, totalsByCurrency, valuePositions } from '../utils/portfolioMath';
import { displaySymbol, formatDateTime, formatMoney, formatNumber, formatPrice, formatTime, NA } from '../utils/format';
import '../styles/workspace.css';

const KIND_LABEL = { BUY: 'Buy', SELL: 'Sell', IMPORT: 'Import' };

const pnlCell = (amount, pct, symbol) => (
  amount === null || amount === undefined ? NA : (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span className={amount > 0 ? 'positive' : amount < 0 ? 'negative' : ''}>{amount > 0 ? '+' : ''}{formatMoney(amount, symbol)}</span>
      {pct !== undefined && <ChangeValue value={pct} />}
    </span>
  )
);

export default function Portfolio() {
  const posRes = useFetch('/api/positions', { interval: 30_000 });
  const ledger = useFetch('/api/ledger?limit=200');
  const [importOpen, setImportOpen] = useState(false);
  const [allocBy, setAllocBy] = useState('symbol');
  const [allocCurrency, setAllocCurrency] = useState(null);
  const [sectors, setSectors] = useState({});

  const lots = useMemo(() => (posRes.data?.positions || []).map((p) => ({ symbol: p.symbol, shares: p.quantity, avgPrice: p.avgCost, name: p.name })), [posRes.data]);
  const symbols = useMemo(() => lots.map((l) => l.symbol), [lots]);
  const quotes = useQuotes(symbols, { interval: 30_000 });
  const positions = useMemo(() => valuePositions(aggregateLots(lots), quotes.quotes), [lots, quotes.quotes]);
  const totals = useMemo(
    () => Object.values(totalsByCurrency(positions)).sort((a, b) => (a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : 0)),
    [positions],
  );
  const currencies = totals.map((t) => t.currency);
  const activeCurrency = allocCurrency && currencies.includes(allocCurrency) ? allocCurrency : currencies[0];
  const totalValueByCurrency = Object.fromEntries(totals.map((t) => [t.currency, t.value]));

  useEffect(() => {
    if (allocBy !== 'sector') return undefined;
    let cancelled = false;
    const missing = symbols.filter((s) => !(s in sectors)).slice(0, 25);
    (async () => {
      for (let i = 0; i < missing.length; i += 4) {
        const batch = missing.slice(i, i + 4);
        const results = await Promise.all(batch.map((s) => axiosInstance.get(`/api/stocks/fundamentals/${encodeURIComponent(s)}`, { timeout: 20000 }).then((r) => r.data?.profile?.sector || null).catch(() => null)));
        if (cancelled) return;
        setSectors((prev) => ({ ...prev, ...Object.fromEntries(batch.map((s, k) => [s, results[k]])) }));
      }
    })();
    return () => { cancelled = true; };
  }, [allocBy, symbols, sectors]);

  const trades = (ledger.data?.entries || []).filter((e) => ['BUY', 'SELL', 'IMPORT'].includes(e.kind));

  const holdingColumns = [
    { key: 'symbol', label: 'Symbol', sortable: true, render: (r) => (
      <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link>{r.name && r.name !== r.symbol && <small>{r.name}</small>}</span>
    ) },
    { key: 'shares', label: 'Shares', align: 'right', hideBelow: 'sm', sortable: true, render: (r) => formatNumber(r.shares, 4) },
    { key: 'avgCost', label: 'Avg cost', align: 'right', hideBelow: 'md', render: (r) => formatPrice(r.avgCost, r.symbol) },
    { key: 'price', label: 'Last', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
    { key: 'value', label: 'Value', align: 'right', sortable: true, render: (r) => formatMoney(r.value, r.symbol) },
    { key: 'weight', label: 'Weight', align: 'right', hideBelow: 'lg', sortValue: (r) => (r.value && totalValueByCurrency[r.currency] ? r.value / totalValueByCurrency[r.currency] : null), sortable: true, render: (r) => (r.value && totalValueByCurrency[r.currency] ? `${((r.value / totalValueByCurrency[r.currency]) * 100).toFixed(1)}%` : NA) },
    { key: 'pnl', label: 'Unrealised P&L', align: 'right', sortable: true, render: (r) => pnlCell(r.pnl, r.pnlPct, r.symbol) },
    { key: 'dayPnl', label: 'Today', align: 'right', hideBelow: 'md', sortable: true, render: (r) => pnlCell(r.dayPnl, undefined, r.symbol) },
    { key: 'actions', label: '', align: 'right', render: (r) => <Link to={`/trade/${encodeURIComponent(r.symbol)}`} className="row-actions"><span>Trade</span></Link> },
  ];

  const tradeColumns = [
    { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
    { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'BUY' ? 'positive' : r.kind === 'SELL' ? 'negative' : 'neutral'}>{KIND_LABEL[r.kind]}</Badge> },
    { key: 'symbol', label: 'Symbol', render: (r) => <Link to={`/stock/${encodeURIComponent(r.symbol)}`} className="sym-link"><strong>{displaySymbol(r.symbol)}</strong></Link> },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r) => formatNumber(r.quantity, 4) },
    { key: 'price', label: 'Price', align: 'right', render: (r) => formatPrice(r.price, r.symbol) },
    { key: 'fee', label: 'Fee', align: 'right', hideBelow: 'md', render: (r) => (r.fee ? formatMoney(r.fee, r.symbol) : NA) },
    { key: 'realizedPnl', label: 'Realised P&L', align: 'right', hideBelow: 'sm', render: (r) => (r.realizedPnl == null ? NA : pnlCell(r.realizedPnl, undefined, r.symbol)) },
    { key: 'amount', label: 'Wallet change', align: 'right', hideBelow: 'sm', render: (r) => (r.kind === 'IMPORT' ? 'None' : `${r.amount > 0 ? '+' : ''}${formatMoney(r.amount, r.symbol)}`) },
  ];

  const refresh = () => { posRes.refresh(); ledger.refresh(); quotes.refresh(); };

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Portfolio</h1>
          <p className="pg-sub">Simulated holdings. Values use live prices from Yahoo Finance, which may be delayed.</p>
        </div>
        <span style={{ display: 'inline-flex', gap: 'var(--sp-2)' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}><Upload size={14} /> Import CSV</button>
          <Link to="/trade" className="btn btn-accent btn-sm">Trade</Link>
        </span>
      </header>

      {posRes.error && !posRes.data ? (
        <section className="panel"><ErrorState title="Could not load your portfolio" onRetry={posRes.refresh}>{posRes.error}</ErrorState></section>
      ) : totals.length > 0 ? (
        totals.map((t) => <StatStrip key={t.currency} totals={t} realized={posRes.data?.realized?.[t.currency] || null} />)
      ) : (
        !posRes.loading && (
          <section className="panel">
            <EmptyState
              title="No holdings yet"
              action={<span style={{ display: 'inline-flex', gap: 'var(--sp-2)' }}><Link to="/trade" className="btn btn-accent btn-sm">Open the trading terminal</Link><button type="button" className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}>Import from CSV</button></span>}
            >
              Buy a stock in the trading terminal, or import holdings from a broker CSV.
            </EmptyState>
          </section>
        )
      )}

      {positions.length > 0 && (
        <div className="pg-grid pg-grid--3-1">
          <section className="panel" aria-label="Holdings">
            <div className="panel-head"><h2 className="panel-title">Holdings</h2><span className="pg-meta">{quotes.updatedAt ? `Prices updated ${formatTime(quotes.updatedAt)}` : ''}</span></div>
            <DataTable columns={holdingColumns} rows={positions} rowKey={(r) => r.symbol} loading={quotes.loading && positions.every((p) => p.price === null)} defaultSort={{ key: 'value', dir: 'desc' }} dense />
            <div className="panel-note">Average cost includes buy fees. Currencies are never converted or added together.</div>
          </section>
          <section className="panel" aria-label="Allocation">
            <div className="panel-head">
              <h2 className="panel-title">Allocation</h2>
              <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <Tabs tabs={[{ id: 'symbol', label: 'Stock' }, { id: 'sector', label: 'Sector' }]} value={allocBy} onChange={setAllocBy} label="Group by" />
                {currencies.length > 1 && <Tabs tabs={currencies.map((c) => ({ id: c, label: c }))} value={activeCurrency} onChange={setAllocCurrency} label="Currency" />}
              </span>
            </div>
            <Allocation positions={positions} currency={activeCurrency} by={allocBy} sectors={sectors} />
            {allocBy === 'sector' && <div className="panel-note">Sectors come from Yahoo Finance company profiles; funds and unknown symbols appear as Unclassified.</div>}
          </section>
        </div>
      )}

      <section className="panel" aria-label="Transaction history">
        <div className="panel-head"><h2 className="panel-title">Transaction history</h2><Link to="/wallet" className="shell-link-btn">Wallet →</Link></div>
        {ledger.error && !ledger.data ? (
          <ErrorState title="History unavailable" onRetry={ledger.refresh}>{ledger.error}</ErrorState>
        ) : (
          <DataTable columns={tradeColumns} rows={trades} rowKey={(r) => r.id} loading={ledger.loading && !ledger.data} empty="No trades or imports yet." dense />
        )}
      </section>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refresh} />
    </div>
  );
}
