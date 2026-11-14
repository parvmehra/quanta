import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Tabs } from './ui/ui';
import { apiMessage, CURRENCY_SYMBOL, newClientOrderId, submitOrder } from '../services/trading';
import { displaySymbol, formatMoney, formatPrice, getCurrencyCode } from '../utils/format';
import './OrderTicket.css';

const FEE_RATE = 0.0003;
const TYPES = [{ id: 'MARKET', label: 'Market' }, { id: 'LIMIT', label: 'Limit' }, { id: 'STOP', label: 'Stop' }];
const SIDES = [{ id: 'BUY', label: 'Buy' }, { id: 'SELL', label: 'Sell' }];
const CLOSED_STATES = ['CLOSED', 'PREPRE', 'POSTPOST', 'PRE', 'POST'];

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const decimals = (x) => { const s = String(x); const i = s.indexOf('.'); return i === -1 ? 0 : s.length - i - 1; };

export default function OrderTicket({ symbol, quote, position, balances, preset, onDone }) {
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('MARKET');
  const [qty, setQty] = useState('1');
  const [limit, setLimit] = useState('');
  const [stop, setStop] = useState('');
  const [review, setReview] = useState(false);
  const [clientId, setClientId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!preset) return;
    setSide(preset.side || 'BUY');
    if (preset.quantity) setQty(String(preset.quantity));
    setType('MARKET');
    setReview(false);
  }, [preset]);

  useEffect(() => { setReview(false); setError(null); setLimit(''); setStop(''); setClientId(null); }, [symbol]);

  const currency = getCurrencyCode(symbol);
  const cs = CURRENCY_SYMBOL[currency];
  const last = quote?.price > 0 ? quote.price : null;
  const owned = position?.quantity || 0;
  const balance = balances ? balances[currency] : null;

  const calc = useMemo(() => {
    const q = num(qty);
    const trigger = type === 'LIMIT' ? num(limit) : type === 'STOP' ? num(stop) : last;
    const refPrice = type === 'MARKET' ? last : trigger;
    const value = Number.isFinite(q) && Number.isFinite(refPrice) ? Math.round(q * refPrice * 100) / 100 : null;
    const fee = value === null ? null : Math.round(value * 100 * FEE_RATE) / 100;
    const total = value === null ? null : side === 'BUY' ? value + fee : value - fee;
    return { q, trigger, refPrice, value, fee, total };
  }, [qty, limit, stop, type, side, last]);

  const problems = [];
  if (!(calc.q > 0) || decimals(qty) > 4 || calc.q > 1_000_000) problems.push('Enter a quantity above zero (up to 4 decimals).');
  if (type === 'LIMIT' && !(num(limit) > 0)) problems.push('Enter a limit price.');
  if (type === 'STOP' && !(num(stop) > 0)) problems.push('Enter a stop price.');
  if (type === 'MARKET' && !last) problems.push('Waiting for a live price.');
  if (!problems.length && calc.total !== null) {
    if (side === 'BUY' && balance !== null && calc.total > balance) problems.push(`Not enough ${currency} balance for this order.`);
    if (side === 'SELL' && calc.q > owned + 1e-9) problems.push(`You own ${owned} shares of ${displaySymbol(symbol)}.`);
  }

  const hint = (() => {
    if (!last) return null;
    if (type === 'LIMIT' && num(limit) > 0) {
      if (side === 'BUY' && num(limit) >= last) return 'This limit is at or above the market, so it fills straight away at the market price.';
      if (side === 'SELL' && num(limit) <= last) return 'This limit is at or below the market, so it fills straight away at the market price.';
      return 'The order waits until the market reaches your price.';
    }
    if (type === 'STOP' && num(stop) > 0) {
      if (side === 'SELL' && num(stop) >= last) return 'The stop is at or above the market, so it triggers straight away.';
      if (side === 'BUY' && num(stop) <= last) return 'The stop is at or below the market, so it triggers straight away.';
      return side === 'SELL' ? 'Sells when the price falls to your stop.' : 'Buys when the price rises to your stop.';
    }
    return null;
  })();

  const marketClosed = quote?.marketState && CLOSED_STATES.includes(quote.marketState);

  const goReview = (e) => {
    e.preventDefault();
    setError(null);
    if (problems.length) return;
    setClientId(newClientOrderId());
    setReview(true);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { symbol, side, type, quantity: calc.q, clientOrderId: clientId };
      if (type === 'LIMIT') payload.limitPrice = num(limit);
      if (type === 'STOP') payload.stopPrice = num(stop);
      const res = await submitOrder(payload);
      const o = res.order;
      if (o.status === 'FILLED') toast.success(`${o.side === 'BUY' ? 'Bought' : 'Sold'} ${o.quantity} ${displaySymbol(o.symbol)} at ${formatPrice(o.fillPrice, o.symbol)} (simulated)`);
      else toast.success(`Order placed: ${o.type.toLowerCase()} ${o.side.toLowerCase()} ${o.quantity} ${displaySymbol(o.symbol)}`);
      setReview(false);
      setClientId(null);
      setLimit('');
      setStop('');
      onDone?.(res);
    } catch (err) {
      setError(apiMessage(err));
      if (err.response) { setClientId(null); setReview(false); }
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const step = (d) => setQty((cur) => { const n = Math.max(0, (Number.isFinite(num(cur)) ? num(cur) : 0) + d); return String(Math.round(n * 1e4) / 1e4 || ''); });

  return (
    <section className="panel ot" aria-label="Order ticket">
      <div className="panel-head">
        <h2 className="panel-title">Order ticket</h2>
        <span className="ot-sim">Simulated</span>
      </div>

      <form className="ot-body" onSubmit={goReview}>
        <div className={`ot-sides ot-sides--${side.toLowerCase()}`} role="tablist" aria-label="Side">
          {SIDES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={side === s.id} className={side === s.id ? 'is-active' : ''} onClick={() => { setSide(s.id); setReview(false); }}>{s.label}</button>
          ))}
        </div>

        <Tabs tabs={TYPES} value={type} onChange={(t) => { setType(t); setReview(false); }} label="Order type" />

        <label className="ot-field">
          <span>Quantity{side === 'SELL' && owned > 0 ? <button type="button" className="ot-link" onClick={() => setQty(String(owned))}>Max {owned}</button> : null}</span>
          <div className="ot-input">
            <button type="button" aria-label="Decrease quantity" onClick={() => step(-1)}>−</button>
            <input inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setReview(false); }} aria-label="Quantity" />
            <button type="button" aria-label="Increase quantity" onClick={() => step(1)}>+</button>
          </div>
        </label>

        {type === 'LIMIT' && (
          <label className="ot-field">
            <span>Limit price ({currency})</span>
            <div className="ot-input"><em>{cs}</em><input inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setReview(false); }} placeholder={last ? String(last) : ''} aria-label="Limit price" /></div>
          </label>
        )}
        {type === 'STOP' && (
          <label className="ot-field">
            <span>Stop price ({currency})</span>
            <div className="ot-input"><em>{cs}</em><input inputMode="decimal" value={stop} onChange={(e) => { setStop(e.target.value); setReview(false); }} placeholder={last ? String(last) : ''} aria-label="Stop price" /></div>
          </label>
        )}
        {hint && <p className="ot-hint">{hint}</p>}

        <dl className="ot-sum">
          <div><dt>{type === 'MARKET' ? 'Last price' : 'Order price'}</dt><dd>{formatPrice(type === 'MARKET' ? last : calc.refPrice, symbol)}</dd></div>
          <div><dt>Estimated value</dt><dd>{calc.value === null ? '—' : formatMoney(calc.value, symbol)}</dd></div>
          <div><dt>Fee (0.03%)</dt><dd>{calc.fee === null ? '—' : formatMoney(calc.fee, symbol)}</dd></div>
          <div className="ot-sum__total"><dt>{side === 'BUY' ? 'Estimated total' : 'Estimated proceeds'}</dt><dd>{calc.total === null ? '—' : formatMoney(calc.total, symbol)}</dd></div>
          <div><dt>Available {currency}</dt><dd>{balance === null ? '…' : formatMoney(balance, symbol)}</dd></div>
          {side === 'SELL' && <div><dt>You own</dt><dd>{owned}</dd></div>}
        </dl>

        {marketClosed && type === 'MARKET' && <p className="ot-note">The market is closed. A market order fills at the last available price.</p>}
        {problems.length > 0 && qty !== '' && <p className="ot-error" role="alert">{problems[0]}</p>}
        {error && <p className="ot-error" role="alert">{error}</p>}

        {!review ? (
          <button type="submit" className={`btn ot-submit ot-submit--${side.toLowerCase()}`} disabled={problems.length > 0}>
            Review {side === 'BUY' ? 'buy' : 'sell'} order
          </button>
        ) : (
          <div className="ot-review" role="group" aria-label="Confirm order">
            <p><strong>{side === 'BUY' ? 'Buy' : 'Sell'} {calc.q} × {displaySymbol(symbol)}</strong> · {type.toLowerCase()}{type === 'LIMIT' ? ` at ${formatPrice(num(limit), symbol)}` : type === 'STOP' ? ` at ${formatPrice(num(stop), symbol)}` : ''}</p>
            <p className="ot-note">Simulated order. No real trade is placed on any exchange. It fills at the latest price Quanta receives from Yahoo Finance, which may be delayed, so the final price can differ from the estimate.</p>
            <div className="ot-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)} disabled={busy}>Edit</button>
              <button type="button" className={`btn ot-submit ot-submit--${side.toLowerCase()}`} onClick={confirm} disabled={busy}>{busy ? 'Placing…' : `Confirm ${side.toLowerCase()}`}</button>
            </div>
          </div>
        )}
        <p className="ot-foot"><Link to="/wallet">Add simulated funds</Link></p>
      </form>
    </section>
  );
}
