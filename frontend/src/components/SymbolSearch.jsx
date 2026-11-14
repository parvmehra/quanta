import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { displaySymbol, exchangeLabel } from '../utils/format';

export default function SymbolSearch({ onSelect, fluid = false, hotkey = true, placeholder = 'Search symbol or company' }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!hotkey) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hotkey]);

  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); setLoading(false); return undefined; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      axiosInstance.get(`/api/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, timeout: 15000 })
        .then((res) => { setResults(Array.isArray(res.data) ? res.data.slice(0, 7) : []); setActive(-1); setLoading(false); })
        .catch((err) => { if (!ctrl.signal.aborted && err.code !== 'ERR_CANCELED') { setResults([]); setLoading(false); } });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const reset = () => { setQuery(''); setResults([]); setOpen(false); setActive(-1); inputRef.current?.blur(); };
  const goStock = (symbol) => {
    if (onSelect) onSelect(symbol);
    else navigate(`/stock/${encodeURIComponent(symbol)}`);
    reset();
  };
  const goExplorer = () => {
    const q = query.trim();
    if (!q) return;
    if (onSelect) { onSelect(q.toUpperCase()); reset(); return; }
    navigate(`/analyzer?q=${encodeURIComponent(q)}`);
    reset();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) goStock(results[active].symbol);
      else goExplorer();
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className={`shell-search-wrap${fluid ? ' is-fluid' : ''}`} ref={wrapRef}>
      <div className="shell-search" role="search">
        <Search size={15} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search stocks"
          role="combobox"
          aria-expanded={showList}
          aria-controls="symbol-search-list"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `symbol-opt-${active}` : undefined}
          autoComplete="off"
        />
        {hotkey && <kbd aria-hidden="true">/</kbd>}
      </div>
      {showList && (
        <ul className="shell-suggest" id="symbol-search-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`symbol-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); goStock(r.symbol); }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{displaySymbol(r.symbol)}</strong>
              <span className="shell-suggest__name">{r.description || r.name}</span>
              <span className="shell-suggest__ex">{exchangeLabel(r.symbol, r.exchange)}</span>
            </li>
          ))}
          {!loading && results.length === 0 && <li className="shell-suggest__empty" role="presentation">No matches</li>}
          {loading && results.length === 0 && <li className="shell-suggest__empty" role="presentation">Searching…</li>}
          <li className="shell-suggest__all" role="presentation" onMouseDown={(e) => { e.preventDefault(); goExplorer(); }}>
            {onSelect ? `Use “${query.trim().toUpperCase()}” as the symbol` : `See all results for “${query.trim()}” in Stock Explorer`}
          </li>
        </ul>
      )}
    </div>
  );
}
