import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';

const CHUNK = 20; // backend limit per batch request

/** Batch quotes for any number of symbols -> { [SYMBOL]: quote }. */
export function useQuotes(symbols, { interval = 0 } = {}) {
  const key = useMemo(() => [...new Set((symbols || []).map((s) => String(s).toUpperCase()))].sort().join(','), [symbols]);
  const [state, setState] = useState({ quotes: {}, error: null, loading: Boolean(key), updatedAt: null });
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (!key) { setState({ quotes: {}, error: null, loading: false, updatedAt: null }); return; }
    const list = key.split(',');
    const chunks = [];
    for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
    try {
      const results = await Promise.all(chunks.map((c) => axiosInstance.get(`/api/stocks/quotes?symbols=${encodeURIComponent(c.join(','))}`, { timeout: 20000 })));
      const merged = Object.assign({}, ...results.map((r) => r.data));
      if (aliveRef.current) setState({ quotes: merged, error: null, loading: false, updatedAt: new Date() });
    } catch (err) {
      if (aliveRef.current) setState((s) => ({ ...s, error: err.response?.data?.message || err.message, loading: false }));
    }
  }, [key]);

  useEffect(() => {
    aliveRef.current = true;
    setState((s) => ({ ...s, loading: Boolean(key) }));
    load();
    let id;
    if (interval > 0) id = setInterval(() => { if (!document.hidden) load(); }, interval);
    return () => { aliveRef.current = false; if (id) clearInterval(id); };
  }, [load, interval, key]);

  return { ...state, refresh: load };
}
