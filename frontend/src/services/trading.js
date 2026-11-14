import axiosInstance from '../utils/axiosInstance';

export const newClientOrderId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

export const apiMessage = (err, fallback = 'Something went wrong. Please try again.') => err?.response?.data?.message || fallback;

export const submitOrder = (order) => axiosInstance.post('/api/orders', order).then((r) => r.data);
export const cancelOrder = (id) => axiosInstance.delete(`/api/orders/${encodeURIComponent(id)}`).then((r) => r.data);
export const depositFunds = (currency, amount) => axiosInstance.post('/api/wallet/topup', { currency, amount }).then((r) => r.data);
export const importHoldings = (holdings) => axiosInstance.post('/api/portfolio/import', { holdings }).then((r) => r.data);

export const CURRENCY_SYMBOL = { USD: '$', INR: '₹' };
export const ORDER_STATUS_TONE = { OPEN: 'info', FILLED: 'positive', CANCELLED: 'neutral', REJECTED: 'negative' };

export const REJECT_REASONS = {
  INSUFFICIENT_FUNDS: 'Not enough balance',
  INSUFFICIENT_HOLDINGS: 'Not enough shares',
};
