import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useWatchlist } from '../contexts/WatchlistContext';
import { useQuotes } from '../hooks/useQuotes';
import DataTable from '../components/ui/DataTable';
import Dialog from '../components/Dialog';
import Sparkline from '../components/Sparkline';
import SymbolSearch from '../components/SymbolSearch';
import { ChangeValue, EmptyState, ErrorState, Skeleton } from '../components/ui/ui';
import { apiMessage } from '../services/trading';
import { displaySymbol, formatMarketCap, formatPrice, formatTime, formatVolume } from '../utils/format';
import '../styles/workspace.css';
import './Watchlist.css';

const CHUNK = 20;

function useSparklines(symbols) {
  const key = symbols.join(',');
  const [state, setState] = useState({ data: {}, loading: false });
  useEffect(() => {
    if (!symbols.length) { setState({ data: {}, loading: false }); return undefined; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const chunks = [];
      for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));
      const results = await Promise.all(chunks.map((c) => axiosInstance.get(`/api/stocks/sparklines?symbols=${encodeURIComponent(c.join(','))}`, { timeout: 30000 }).then((r) => r.data.sparklines).catch(() => ({}))));
      if (!cancelled) setState({ data: Object.assign({}, ...results), loading: false });
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function NameDialog({ title, initial = '', submitLabel, onSubmit, onClose }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean) { setError('Enter a name.'); return; }
    setBusy(true);
    try { await onSubmit(clean); onClose(); } catch (err) { setError(apiMessage(err)); setBusy(false); }
  };
  return (
    <Dialog title={title} onClose={onClose} footer={(
      <>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" form="name-form" className="btn btn-accent btn-sm" disabled={busy}>{submitLabel}</button>
      </>
    )}>
      <form id="name-form" onSubmit={submit}>
        <label>List name<input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setError(null); }} aria-label="List name" /></label>
        {error && <p className="dlg-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

export default function Watchlist() {
  const wl = useWatchlist();
  const [activeId, setActiveId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [filter, setFilter] = useState('');

  const active = wl.lists.find((l) => l.id === activeId) || wl.defaultList;
  const symbols = useMemo(() => active?.symbols || [], [active]);
  const quotes = useQuotes(symbols, { interval: 30_000 });
  const sparks = useSparklines(symbols);

  const rows = useMemo(() => symbols.map((s) => {
    const q = quotes.quotes[s];
    const sp = sparks.data[s];
    return { symbol: s, name: q?.name || null, price: q?.price ?? null, changePercent: q?.changePercent ?? null, volume: q?.volume ?? null, marketCap: q?.marketCap ?? null, spark: sp?.closes || null, trendPct: sp?.changePct ?? null };
  }).filter((r) => !filter.trim() || r.symbol.toLowerCase().includes(filter.trim().toLowerCase()) || (r.name || '').toLowerCase().includes(filter.trim().toLowerCase())), [symbols, quotes.quotes, sparks.data, filter]);

  const add = async (symbol) => {
    if (!active) return;
    try {
      const res = await wl.addSymbol(active.id, symbol);
      toast.success(res.duplicate ? `${displaySymbol(symbol)} is already in ${active.name}` : `${displaySymbol(symbol)} added to ${active.name}`);
    } catch (err) {
      toast.error(apiMessage(err));
    }
  };
  const remove = async (symbol) => {
    try { await wl.removeSymbol(active.id, symbol); } catch (err) { toast.error(apiMessage(err)); }
  };

  const columns = [
    { key: 'symbol', label: 'Symbol', sortable: true, render: (r) => (
      <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link>{r.name && <small>{r.name}</small>}</span>
    ) },
    { key: 'price', label: 'Price', align: 'right', sortable: true, render: (r) => formatPrice(r.price, r.symbol) },
    { key: 'changePercent', label: 'Day', align: 'right', sortable: true, render: (r) => <ChangeValue value={r.changePercent} /> },
    { key: 'trendPct', label: '1 month', align: 'right', hideBelow: 'sm', sortable: true, render: (r) => (
      <span className="wl-trend">{sparks.loading && !r.spark ? <Skeleton width={96} height={28} /> : <Sparkline closes={r.spark} label={`${displaySymbol(r.symbol)} one month trend`} />}<ChangeValue value={r.trendPct} /></span>
    ) },
    { key: 'volume', label: 'Volume', align: 'right', hideBelow: 'md', sortable: true, render: (r) => formatVolume(r.volume) },
    { key: 'marketCap', label: 'Market cap', align: 'right', hideBelow: 'lg', sortable: true, render: (r) => formatMarketCap(r.marketCap, r.symbol) },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <span className="row-actions">
        <Link to={`/trade/${encodeURIComponent(r.symbol)}`}>Trade</Link>
        <Link to={`/advisor?symbol=${encodeURIComponent(r.symbol)}`}>Ask AI</Link>
        <button type="button" className="wl-x" onClick={() => remove(r.symbol)} aria-label={`Remove ${r.symbol}`}><X size={14} /></button>
      </span>
    ) },
  ];

  if (wl.error && !wl.loaded) {
    return <div className="pg"><section className="panel"><ErrorState title="Could not load your watchlists" onRetry={wl.reload}>{wl.error}</ErrorState></section></div>;
  }

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Watchlists</h1>
          <p className="pg-sub">Stocks you follow, saved to your account. Prices from Yahoo Finance, may be delayed.</p>
        </div>
        <button type="button" className="btn btn-accent btn-sm" onClick={() => setDialog({ type: 'create' })} disabled={wl.lists.length >= wl.limits.maxLists}><Plus size={14} /> New list</button>
      </header>

      {!wl.loaded ? (
        <section className="panel"><div className="panel-body"><Skeleton width="100%" height={16} /><br /><Skeleton width="60%" height={16} /></div></section>
      ) : (
        <section className="panel" aria-label="Watchlist">
          <div className="wl-tabs" role="tablist" aria-label="Your lists">
            {wl.lists.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={active?.id === l.id} className={`wl-tab${active?.id === l.id ? ' is-active' : ''}`} onClick={() => setActiveId(l.id)}>
                {l.name} <span className="wl-count">{l.symbols.length}</span>
              </button>
            ))}
          </div>

          <div className="toolbar">
            <div className="wl-add"><SymbolSearch fluid hotkey={false} onSelect={add} placeholder={`Add a stock to ${active?.name || 'this list'}`} /></div>
            <label className="field wl-filter">
              <Search size={14} aria-hidden="true" />
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter this list" aria-label="Filter this list" />
            </label>
            <span className="wl-list-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ type: 'rename' })}><Pencil size={13} /> Rename</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ type: 'delete' })} disabled={active?.isDefault} title={active?.isDefault ? 'The default list cannot be deleted' : undefined}><Trash2 size={13} /> Delete</button>
            </span>
          </div>

          {symbols.length === 0 ? (
            <EmptyState title="This list is empty">Search for a stock above to add it. You can also use the star on any stock page.</EmptyState>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.symbol}
              loading={quotes.loading && Object.keys(quotes.quotes).length === 0}
              skeletonRows={Math.min(symbols.length, 6)}
              defaultSort={{ key: 'symbol', dir: 'asc' }}
              empty={filter ? `No stocks match “${filter}”.` : 'Nothing to show.'}
            />
          )}
          <div className="panel-note">{quotes.updatedAt ? `Prices updated ${formatTime(quotes.updatedAt)}. ` : ''}Trend charts show the last month of daily closes. Up to {wl.limits.maxSymbols} stocks per list and {wl.limits.maxLists} lists.</div>
        </section>
      )}

      {dialog?.type === 'create' && <NameDialog title="New watchlist" submitLabel="Create list" onClose={() => setDialog(null)} onSubmit={async (name) => { const l = await wl.createList(name); setActiveId(l.id); toast.success(`Created “${l.name}”`); }} />}
      {dialog?.type === 'rename' && active && <NameDialog title="Rename list" initial={active.name} submitLabel="Save" onClose={() => setDialog(null)} onSubmit={(name) => wl.renameList(active.id, name)} />}
      {dialog?.type === 'delete' && active && (
        <Dialog title="Delete list" onClose={() => setDialog(null)} footer={(
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog(null)}>Cancel</button>
            <button type="button" className="btn btn-accent btn-sm" onClick={async () => { try { await wl.deleteList(active.id); setActiveId(null); toast.success('List deleted'); setDialog(null); } catch (err) { toast.error(apiMessage(err)); } }}>Delete list</button>
          </>
        )}>
          <p>Delete “{active.name}” and its {active.symbols.length} stock{active.symbols.length === 1 ? '' : 's'}? This cannot be undone.</p>
        </Dialog>
      )}
    </div>
  );
}
