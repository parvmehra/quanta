import { formatCurrencyValue, formatCompactCurrency, getCurrencyCode } from './currency.js';

export const NA = '—';
const isNil = (v) => v === null || v === undefined || Number.isNaN(Number(v));

export const formatPrice = (value, symbol = '') => (isNil(value) || Number(value) <= 0 ? NA : formatCurrencyValue(value, symbol));
export const formatMoney = (value, symbol = '', options) => (isNil(value) ? NA : formatCurrencyValue(value, symbol, '', options));
export const formatMarketCap = (value, symbol = '') => (isNil(value) || Number(value) <= 0 ? NA : formatCompactCurrency(value, symbol));
export const formatVolume = (value) => (isNil(value) || Number(value) <= 0 ? NA : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value));
export const formatNumber = (value, digits = 2) => (isNil(value) ? NA : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }));
export const formatTime = (date) => (date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : NA);
export const formatDateTime = (date) => (date ? new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : NA);

export const exchangeLabel = (symbol = '', exchange = '') => {
  const s = String(symbol).toUpperCase();
  if (s.endsWith('.NS')) return 'NSE';
  if (s.endsWith('.BO')) return 'BSE';
  const e = String(exchange || '').trim();
  if (!e || e.toLowerCase() === 'unknown') return 'US';
  return e.length > 10 ? e.slice(0, 10) : e;
};

export const displaySymbol = (symbol = '') => String(symbol).replace(/\.(NS|BO)$/i, '');
export { getCurrencyCode };
