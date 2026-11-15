import { useCallback, useEffect, useRef, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';

export function useFetch(url, { interval = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url && enabled), updatedAt: null });
  const aliveRef = useRef(true);
  const ctrlRef = useRef(null);

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const res = await axiosInstance.get(url, { signal: ctrl.signal, timeout: 20000 });
      if (aliveRef.current && !ctrl.signal.aborted) setState({ data: res.data, error: null, loading: false, updatedAt: new Date() });
    } catch (err) {
      if (ctrl.signal.aborted || err.code === 'ERR_CANCELED') return;
      if (aliveRef.current) setState((s) => ({ ...s, error: err.response?.data?.message || err.message || 'Request failed', loading: false }));
    }
  }, [url, enabled]);

  useEffect(() => {
    aliveRef.current = true;
    setState((s) => ({ ...s, error: null, loading: Boolean(url && enabled) && s.data === null }));
    load();
    let id;
    if (interval > 0 && enabled) id = setInterval(() => { if (!document.hidden) load(); }, interval);
    return () => { aliveRef.current = false; ctrlRef.current?.abort(); if (id) clearInterval(id); };
  }, [load, interval, url, enabled]);

  return { ...state, refresh: load };
}
