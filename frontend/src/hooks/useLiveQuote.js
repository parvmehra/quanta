import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { useFetch } from './useFetch';

export function useLiveQuote(symbol) {
  const enc = symbol ? encodeURIComponent(symbol) : null;
  const quote = useFetch(enc ? `/api/stocks/quote/${enc}` : null);
  const [live, setLive] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setLive(null);
    if (!symbol) return undefined;
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setConnected(true); socket.emit('subscribe', symbol); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('priceUpdate', (d) => { if (d.symbol === symbol) setLive(d); });
    return () => { socket.emit('unsubscribe', symbol); socket.disconnect(); setConnected(false); };
  }, [symbol]);

  const base = quote.data && quote.data.symbol === symbol ? quote.data : null;
  const merged = base ? { ...base, ...(live || {}) } : null;
  return { quote: merged, loading: quote.loading || (Boolean(symbol) && !base && !quote.error), error: quote.error, refresh: quote.refresh, live, connected };
}
