import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useFetch } from '../hooks/useFetch';
import DataTable from '../components/ui/DataTable';
import { Badge, ErrorState, Tabs } from '../components/ui/ui';
import { apiMessage, CURRENCY_SYMBOL, depositFunds } from '../services/trading';
import { displaySymbol, formatDateTime } from '../utils/format';
import '../styles/workspace.css';
import './Wallet.css';

const KIND_FILTERS = [
  { id: '', label: 'All' },
  { id: 'DEPOSIT', label: 'Deposits' },
  { id: 'BUY', label: 'Buys' },
  { id: 'SELL', label: 'Sells' },
];
const KIND_LABEL = { INITIAL: 'Starting balance', DEPOSIT: 'Simulated deposit', BUY: 'Buy', SELL: 'Sell', IMPORT: 'Imported holding' };
const QUICK = { USD: [1000, 10000, 50000], INR: [10000, 100000, 500000] };

const money = (n, cur) => (n == null ? '—' : new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n));

export default function Wallet() {
  const [kind, setKind] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('10000');
  const [busy, setBusy] = useState(false);
  const wallet = useFetch('/api/wallet');
  const ledger = useFetch(`/api/ledger?limit=100${kind ? `&kind=${kind}` : ''}`);

  const balances = wallet.data?.wallet?.balances;
  const limits = wallet.data?.limits;

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) { toast.error('Enter an amount greater than zero.'); return; }
    setBusy(true);
    try {
      await depositFunds(currency, n);
      toast.success(`Added ${money(n, currency)} of simulated funds`);
      wallet.refresh();
      ledger.refresh();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
    { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'SELL' || r.kind === 'DEPOSIT' ? 'positive' : r.kind === 'BUY' ? 'negative' : 'neutral'}>{KIND_LABEL[r.kind] || r.kind}</Badge> },
    { key: 'symbol', label: 'Details', hideBelow: 'sm', render: (r) => (r.symbol ? `${displaySymbol(r.symbol)}${r.quantity ? ` × ${r.quantity}` : ''}${r.price ? ` @ ${r.price}` : ''}` : (r.note || '—')) },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className={r.amount > 0 ? 'positive' : r.amount < 0 ? 'negative' : ''}>{r.amount > 0 ? '+' : ''}{money(r.amount, r.currency)}</span> },
    { key: 'fee', label: 'Fee', align: 'right', hideBelow: 'md', render: (r) => (r.fee ? money(r.fee, r.currency) : '—') },
    { key: 'balanceAfter', label: 'Balance after', align: 'right', hideBelow: 'sm', render: (r) => money(r.balanceAfter, r.currency) },
  ];

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Wallet</h1>
          <p className="pg-sub">Simulated funds for paper trading. No real money moves and no payment gateway is used.</p>
        </div>
      </header>

      {wallet.error && !wallet.data ? (
        <section className="panel"><ErrorState title="Wallet unavailable" onRetry={wallet.refresh}>{wallet.error}</ErrorState></section>
      ) : (
        <div className="pg-grid pg-grid--3-1 wl-grid">
          <div className="stat-strip" aria-label="Balances">
            {['USD', 'INR'].map((cur) => (
              <div className="stat" key={cur}>
                <span className="stat__label">{cur === 'USD' ? 'US dollars' : 'Indian rupees'}</span>
                <span className="stat__value">{balances ? money(balances[cur], cur) : '…'}</span>
                <span className="stat__sub">Used for {cur === 'USD' ? 'US-listed' : 'NSE / BSE'} stocks</span>
              </div>
            ))}
          </div>

          <section className="panel" aria-label="Add simulated funds">
            <div className="panel-head"><h2 className="panel-title">Add simulated funds</h2></div>
            <form className="wl-form" onSubmit={submit}>
              <Tabs tabs={[{ id: 'USD', label: 'USD' }, { id: 'INR', label: 'INR' }]} value={currency} onChange={(c) => { setCurrency(c); setAmount(String(QUICK[c][1])); }} label="Currency" />
              <label className="field wl-field">
                <span>{CURRENCY_SYMBOL[currency]}</span>
                <input type="number" min="1" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
              </label>
              <div className="chip-row">
                {QUICK[currency].map((v) => (<button type="button" key={v} className="chip" onClick={() => setAmount(String(v))}>{CURRENCY_SYMBOL[currency]}{v.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')}</button>))}
              </div>
              <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? 'Adding…' : 'Add funds'}</button>
              {limits && <p className="pg-meta">Up to {limits.depositMax.toLocaleString('en-US')} per deposit and {limits.depositDailyCap.toLocaleString('en-US')} per day in each currency.</p>}
            </form>
          </section>
        </div>
      )}

      <section className="panel" aria-label="Transaction history">
        <div className="panel-head">
          <h2 className="panel-title">Transaction history</h2>
          <Tabs tabs={KIND_FILTERS} value={kind} onChange={setKind} label="Filter" />
        </div>
        {ledger.error && !ledger.data ? (
          <ErrorState title="History unavailable" onRetry={ledger.refresh}>{ledger.error}</ErrorState>
        ) : (
          <DataTable columns={columns} rows={ledger.data?.entries || []} rowKey={(r) => r.id} loading={ledger.loading && !ledger.data} empty="No transactions yet." />
        )}
        <div className="panel-note">Every change to your balance is recorded here and cannot be edited. Trade fees are 0.03% of the order value.</div>
      </section>
    </div>
  );
}
