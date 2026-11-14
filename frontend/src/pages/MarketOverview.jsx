import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import DataTable from '../components/ui/DataTable';
import { ChangeValue, ErrorState, Tabs } from '../components/ui/ui';
import { getMarketStatus } from '../utils/marketHours';
import { displaySymbol, formatDateTime, formatNumber, formatPrice, formatTime, formatVolume } from '../utils/format';
import '../styles/workspace.css';

const REGIONS = [{ id: 'US', label: 'United States' }, { id: 'IN', label: 'India' }];

const indexColumns = [
  { key: 'name', label: 'Index', sortable: true, render: (r) => <strong>{r.name}</strong> },
  { key: 'region', label: 'Market', hideBelow: 'sm', render: (r) => (r.region === 'US' ? 'US' : 'India') },
  { key: 'price', label: 'Last', align: 'right', sortable: true, render: (r) => formatNumber(r.price) },
  { key: 'change', label: 'Change', align: 'right', hideBelow: 'sm', render: (r) => <ChangeValue value={r.change} suffix="" /> },
  { key: 'changePercent', label: '% Change', align: 'right', sortable: true, render: (r) => <ChangeValue value={r.changePercent} /> },
  { key: 'asOf', label: 'As of', align: 'right', hideBelow: 'md', render: (r) => formatDateTime(r.asOf) },
];

const moverColumns = (kind) => [
  { key: 'symbol', label: 'Symbol', sortable: true, render: (r) => (
    <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link><small>{r.name}</small></span>
  ) },
  kind === 'active'
    ? { key: 'volume', label: 'Volume', align: 'right', sortable: true, render: (r) => formatVolume(r.volume) }
    : { key: 'price', label: 'Price', align: 'right', sortable: true, render: (r) => formatPrice(r.price, r.symbol) },
  { key: 'changePercent', label: '% Chg', align: 'right', sortable: true, render: (r) => <ChangeValue value={r.changePercent} /> },
];

function MoversTable({ title, rows, loading, defaultKey, kind }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head"><h2 className="panel-title">{title}</h2></div>
      <DataTable
        columns={moverColumns(kind)}
        rows={rows}
        rowKey={(r) => r.symbol}
        loading={loading}
        skeletonRows={5}
        defaultSort={{ key: defaultKey, dir: defaultKey === 'volume' ? 'desc' : title === 'Top losers' ? 'asc' : 'desc' }}
        empty="No data available"
        dense
      />
    </section>
  );
}

export default function MarketOverview() {
  const [region, setRegion] = useState('US');
  const overview = useFetch('/api/market/overview', { interval: 60_000 });
  const movers = useFetch(`/api/market/movers?region=${region}`, { interval: 120_000 });
  const status = useMemo(() => getMarketStatus(), []);

  const m = movers.data && movers.data.region === region ? movers.data : null;

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Market Overview</h1>
          <p className="pg-sub">
            {status.map((s) => `${s.label}: ${s.isOpen ? 'open' : 'closed'}`).join(' · ')}
            <span className="pg-meta"> (scheduled hours; holidays not reflected)</span>
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { overview.refresh(); movers.refresh(); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <section className="panel" aria-label="Market indices">
        <div className="panel-head"><h2 className="panel-title">Indices</h2><span className="pg-meta">Updated {formatTime(overview.updatedAt)}</span></div>
        {overview.error && !overview.data ? (
          <ErrorState title="Index data unavailable" onRetry={overview.refresh}>The data provider did not respond. Nothing is shown rather than an estimate.</ErrorState>
        ) : (
          <DataTable
            columns={indexColumns}
            rows={overview.data?.indices || []}
            rowKey={(r) => r.symbol}
            loading={overview.loading}
            skeletonRows={5}
            empty="No index data available"
          />
        )}
        {overview.data && <div className="panel-note">Source: {overview.data.source}. Quotes may be delayed.</div>}
      </section>

      <div className="pg-head">
        <h2 className="pg-title" style={{ fontSize: 'var(--fs-lg)' }}>Movers</h2>
        <Tabs tabs={REGIONS} value={region} onChange={setRegion} label="Region" />
      </div>

      {movers.error && !m ? (
        <section className="panel"><ErrorState title="Movers unavailable" onRetry={movers.refresh}>{movers.error}</ErrorState></section>
      ) : (
        <>
          <div className="pg-grid pg-grid--3">
            <MoversTable title="Top gainers" kind="gainers" rows={m?.gainers || []} loading={!m} defaultKey="changePercent" />
            <MoversTable title="Top losers" kind="losers" rows={m?.losers || []} loading={!m} defaultKey="changePercent" />
            <MoversTable title="Most active" kind="active" rows={m?.active || []} loading={!m} defaultKey="volume" />
          </div>
          {m && <p className="pg-meta">Universe: {m.universe}. Source: {m.source}, may be delayed. Fetched {formatTime(m.fetchedAt)}.</p>}
        </>
      )}
    </div>
  );
}
