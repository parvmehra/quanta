const KEY = 'quanta-watchlist';

export function readWatchlist() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function isInWatchlist(symbol) {
  return readWatchlist().includes(String(symbol).toUpperCase());
}

export function toggleWatchlist(symbol) {
  const sym = String(symbol).toUpperCase();
  const list = readWatchlist();
  const next = list.includes(sym) ? list.filter((s) => s !== sym) : [...list, sym];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { }
  return next.includes(sym);
}
