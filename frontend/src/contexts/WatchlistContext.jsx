import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext(null);
const LEGACY_KEY = 'quanta-watchlist';

const readLegacy = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
};
const clearLegacy = () => { try { localStorage.removeItem(LEGACY_KEY); } catch { } };

export function WatchlistProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [lists, setLists] = useState([]);
  const [limits, setLimits] = useState({ maxLists: 10, maxSymbols: 100 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLists([]); setLoaded(false); return; }
    setLoading(true);
    try {
      const res = await axiosInstance.get('/api/watchlists');
      let next = res.data.lists;
      const legacy = readLegacy();
      if (legacy.length) {
        try {
          const imported = await axiosInstance.post('/api/watchlists/import', { symbols: legacy });
          next = next.map((l) => (l.id === imported.data.list.id ? imported.data.list : l));
          clearLegacy();
        } catch { }
      }
      setLists(next);
      setLimits(res.data.limits || limits);
      setError(null);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your watchlists.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const replace = useCallback((list) => setLists((prev) => prev.map((l) => (l.id === list.id ? list : l))), []);

  const defaultList = useMemo(() => lists.find((l) => l.isDefault) || lists[0] || null, [lists]);

  const addSymbol = useCallback(async (listId, symbol) => {
    const res = await axiosInstance.post(`/api/watchlists/${listId}/symbols`, { symbol });
    replace(res.data.list);
    return res.data;
  }, [replace]);

  const removeSymbol = useCallback(async (listId, symbol) => {
    const res = await axiosInstance.delete(`/api/watchlists/${listId}/symbols/${encodeURIComponent(symbol)}`);
    replace(res.data.list);
  }, [replace]);

  const createList = useCallback(async (name) => {
    const res = await axiosInstance.post('/api/watchlists', { name });
    setLists((prev) => [...prev, res.data.list]);
    return res.data.list;
  }, []);

  const renameList = useCallback(async (id, name) => {
    const res = await axiosInstance.patch(`/api/watchlists/${id}`, { name });
    replace(res.data.list);
  }, [replace]);

  const deleteList = useCallback(async (id) => {
    await axiosInstance.delete(`/api/watchlists/${id}`);
    setLists((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const isWatching = useCallback((symbol) => Boolean(defaultList && defaultList.symbols.includes(String(symbol).toUpperCase())), [defaultList]);

  const toggle = useCallback(async (symbol) => {
    if (!isAuthenticated) { toast.error('Log in to use watchlists.'); return null; }
    if (!defaultList) return null;
    const sym = String(symbol).toUpperCase();
    try {
      if (defaultList.symbols.includes(sym)) { await removeSymbol(defaultList.id, sym); return false; }
      await addSymbol(defaultList.id, sym);
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update your watchlist.');
      return null;
    }
  }, [isAuthenticated, defaultList, addSymbol, removeSymbol]);

  const value = useMemo(() => ({
    lists, defaultList, symbols: defaultList?.symbols || [], limits, loading, loaded, error,
    reload: load, addSymbol, removeSymbol, createList, renameList, deleteList, isWatching, toggle,
  }), [lists, defaultList, limits, loading, loaded, error, load, addSymbol, removeSymbol, createList, renameList, deleteList, isWatching, toggle]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export const useWatchlist = () => {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used inside WatchlistProvider');
  return ctx;
};
