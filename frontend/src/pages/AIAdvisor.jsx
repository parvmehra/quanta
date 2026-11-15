import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Send, Sparkles, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useFetch } from '../hooks/useFetch';
import SymbolSearch from '../components/SymbolSearch';
import { Badge, ChangeValue, ErrorState, Skeleton } from '../components/ui/ui';
import { isInWatchlist, toggleWatchlist } from '../utils/watchlist';
import { apiMessage } from '../services/trading';
import { displaySymbol, formatDateTime, formatMarketCap, formatPrice, formatTime, NA } from '../utils/format';
import '../styles/workspace.css';
import '../styles/stock.css';
import './AIAdvisor.css';

const MAX_LEN = 1000;
const GENERAL_STARTERS = ['What is a P/E ratio?', 'How do limit and stop orders differ?', 'What does RSI measure?', 'What is diversification?'];
const stockStarters = (s) => [`Give me an overview of ${s}`, `What are the main risks for ${s}?`, `Is ${s} expensive on valuation?`, `What does the trend say for ${s}?`];

function Facts({ ctx, symbol }) {
  const ready = ctx.data && ctx.data.symbol === symbol;
  if (ctx.error && !ready) return <ErrorState title="Data unavailable" onRetry={ctx.refresh}>{ctx.error}</ErrorState>;
  if (!ready) return <div className="panel-body"><Skeleton width="100%" height={14} /><br /><br /><Skeleton width="70%" height={14} /></div>;
  const f = ctx.data;
  const t = f.technical;
  const q = f.fundamentals;
  const row = (label, value) => (<div className="sd-row" key={label}><dt>{label}</dt><dd>{value ?? NA}</dd></div>);
  return (
    <>
      <dl className="sd-facts sd-facts--pad">
        {row('Price', <span>{formatPrice(f.price, f.symbol)} <ChangeValue value={f.changePercent} /></span>)}
        {row('RSI (14)', t.rsi14)}
        {row('20-day average', t.sma20 != null ? formatPrice(t.sma20, f.symbol) : null)}
        {row('50-day average', t.sma50 != null ? formatPrice(t.sma50, f.symbol) : null)}
        {row('52-week position', f.week52.positionPct != null ? `${f.week52.positionPct}%` : null)}
        {row('Market cap', formatMarketCap(q.marketCap, f.symbol))}
        {row('P/E (trailing)', q.trailingPE)}
        {row('Profit margin', q.profitMarginPct != null ? `${q.profitMarginPct}%` : null)}
        {row('Analyst consensus', q.analystConsensus ? `${q.analystConsensus.replace(/_/g, ' ')}${q.analystCount ? ` (${q.analystCount})` : ''}` : null)}
      </dl>
      {f.news.length > 0 && (
        <div className="adv-news">
          <h3>Recent headlines</h3>
          <ul>{f.news.map((n) => <li key={n.title}>{n.title}<small> {n.publisher}</small></li>)}</ul>
        </div>
      )}
      <div className="panel-note">As of {formatDateTime(f.asOf)} · {f.source} · may be delayed. These are the only figures the advisor is given.</div>
    </>
  );
}

function AnswerCard({ msg, onAsk, symbol }) {
  const a = msg.answer;
  return (
    <div className="adv-msg adv-msg--ai">
      <div className="adv-msg__head">
        <Badge tone={msg.mode === 'ai' ? 'info' : 'neutral'}>{msg.mode === 'ai' ? `AI-generated${msg.model ? ` · ${msg.model}` : ''}` : 'Rule-based summary'}</Badge>
        <span className="pg-meta">{formatTime(msg.generatedAt)}</span>
      </div>
      <p className="adv-summary">{a.summary}</p>
      {a.keyPoints.length > 0 && (<><h4>Key points</h4><ul>{a.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></>)}
      {a.risks.length > 0 && (<><h4>Risks and caveats</h4><ul className="adv-risks">{a.risks.map((p, i) => <li key={i}>{p}</li>)}</ul></>)}
      <p className="adv-disclaimer">{msg.disclaimer}</p>
      {symbol && (
        <div className="adv-actions">
          <Link to={`/stock/${encodeURIComponent(symbol)}`} className="btn btn-secondary btn-sm">View analysis</Link>
          <Link to={`/trade/${encodeURIComponent(symbol)}`} className="btn btn-secondary btn-sm">Open in terminal</Link>
        </div>
      )}
      {a.followUps.length > 0 && (
        <div className="chip-row adv-followups" aria-label="Suggested follow-up questions">
          {a.followUps.map((q) => <button key={q} type="button" className="chip" onClick={() => onAsk(q)}>{q}</button>)}
        </div>
      )}
    </div>
  );
}

export default function AIAdvisor() {
  const [params, setParams] = useSearchParams();
  const symbol = (params.get('symbol') || '').trim().toUpperCase() || null;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const endRef = useRef(null);
  const ctx = useFetch(symbol ? `/api/advisor/context/${encodeURIComponent(symbol)}` : null);

  useEffect(() => { setWatching(symbol ? isInWatchlist(symbol) : false); }, [symbol]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const lastMode = [...messages].reverse().find((m) => m.role === 'assistant' && m.answer);
  const starters = useMemo(() => (symbol ? stockStarters(displaySymbol(symbol)) : GENERAL_STARTERS), [symbol]);

  const pick = (s) => {
    setParams({ symbol: String(s).toUpperCase() });
    setMessages((m) => (m.length ? [...m, { id: `d-${Date.now()}`, role: 'divider', text: `Now discussing ${displaySymbol(String(s).toUpperCase())}` }] : m));
  };

  const ask = async (text) => {
    const message = String(text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.answer))
      .slice(-6)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', content: m.role === 'user' ? m.text : m.answer.summary }));
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await axiosInstance.post('/api/advisor/chat', { symbol, message, history }, { timeout: 40000 });
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', symbol, ...res.data }]);
    } catch (err) {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: 'error', text: apiMessage(err, 'The advisor could not be reached. Please try again.') }]);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } };
  const onWatch = () => { const now = toggleWatchlist(symbol); setWatching(now); toast.success(now ? `${displaySymbol(symbol)} added to watchlist` : `${displaySymbol(symbol)} removed from watchlist`); };

  return (
    <div className="pg adv">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">AI Advisor</h1>
          <p className="pg-sub">Ask questions about a stock. Answers are built from live market data and are not investment advice.</p>
        </div>
      </header>

      <div className="adv-banner" role="note">
        <Info size={15} aria-hidden="true" />
        <span>
          {lastMode?.mode === 'rules' && lastMode.reason === 'no_key' ? 'No AI model is configured on this server, so you are seeing rule-based summaries computed from the data on the right. '
            : lastMode?.mode === 'rules' && lastMode.reason === 'ai_error' ? 'The AI model did not respond, so this answer is a rule-based summary of the data on the right. '
              : ''}
          This is not investment advice. Text written by an AI can be wrong, so check figures against the data panel and the stock page, and never treat any answer as a recommendation.
        </span>
      </div>

      <div className="adv-grid">
        <section className="panel adv-chat" aria-label="Conversation">
          <div className="adv-bar">
            <div className="adv-pick"><SymbolSearch fluid hotkey={false} onSelect={pick} placeholder={symbol ? `Discussing ${displaySymbol(symbol)} · change stock` : 'Choose a stock to discuss (optional)'} /></div>
            {symbol && (
              <span className="adv-bar__btns">
                <button type="button" className={`btn btn-secondary btn-sm${watching ? ' is-on' : ''}`} onClick={onWatch} aria-pressed={watching}><Star size={13} fill={watching ? 'currentColor' : 'none'} /> Watchlist</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setParams({}); }}>No stock</button>
              </span>
            )}
            {messages.length > 0 && <button type="button" className="shell-icon-btn" onClick={() => setMessages([])} aria-label="Clear conversation" title="Clear conversation"><Trash2 size={15} /></button>}
          </div>

          <div className="adv-log" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="adv-empty">
                <Sparkles size={22} aria-hidden="true" />
                <h2>{symbol ? `Research ${displaySymbol(symbol)}` : 'Ask about markets or a specific stock'}</h2>
                <p>{symbol ? 'Pick a question or write your own.' : 'Choose a stock above for data-based answers, or ask a general question.'}</p>
                <div className="chip-row adv-starters">{starters.map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
              </div>
            )}
            {messages.map((m) => {
              if (m.role === 'divider') return <div key={m.id} className="adv-divider"><span>{m.text}</span></div>;
              if (m.role === 'user') return <div key={m.id} className="adv-msg adv-msg--user"><p>{m.text}</p></div>;
              if (m.role === 'error') return <div key={m.id} className="adv-msg adv-msg--error" role="alert"><p>{m.text}</p></div>;
              return <AnswerCard key={m.id} msg={m} onAsk={ask} symbol={m.symbol} />;
            })}
            {busy && <div className="adv-msg adv-msg--ai adv-thinking" aria-label="Thinking"><Skeleton width="70%" height={12} /><br /><Skeleton width="90%" height={12} /><br /><Skeleton width="55%" height={12} /></div>}
            <div ref={endRef} />
          </div>

          <form className="adv-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onKey}
              placeholder={symbol ? `Ask about ${displaySymbol(symbol)}…` : 'Ask a question…'}
              rows={2}
              maxLength={MAX_LEN}
              aria-label="Your question"
            />
            <div className="adv-input__foot">
              <span className="pg-meta">{input.length}/{MAX_LEN} · Enter to send, Shift+Enter for a new line</span>
              <button type="submit" className="btn btn-accent btn-sm" disabled={busy || !input.trim()}><Send size={13} /> Ask</button>
            </div>
          </form>
        </section>

        <aside className="panel adv-side" aria-label="Data used">
          <div className="panel-head"><h2 className="panel-title">Data the advisor uses</h2></div>
          {symbol ? <Facts ctx={ctx} symbol={symbol} /> : <p className="tt-empty">Choose a stock to see the live figures the advisor is given. Without a stock, only general explanations are possible and no prices are quoted.</p>}
        </aside>
      </div>
    </div>
  );
}
