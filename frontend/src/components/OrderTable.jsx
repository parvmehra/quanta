import React from 'react';
import { Link } from 'react-router-dom';
import DataTable from './ui/DataTable';
import { Badge } from './ui/ui';
import { displaySymbol, formatDateTime, formatMoney, formatPrice, NA } from '../utils/format';
import { ORDER_STATUS_TONE, REJECT_REASONS } from '../services/trading';

const priceCell = (o) => {
  if (o.fillPrice != null) return formatPrice(o.fillPrice, o.symbol);
  if (o.type === 'LIMIT') return `Limit ${formatPrice(o.limitPrice, o.symbol)}`;
  if (o.type === 'STOP') return `Stop ${formatPrice(o.stopPrice, o.symbol)}`;
  return 'Market';
};

export default function OrderTable({ orders, loading, onCancel, cancellingId, empty = 'No orders yet.', dense = true }) {
  const columns = [
    { key: 'createdAt', label: 'Placed', render: (o) => formatDateTime(o.createdAt), sortValue: (o) => new Date(o.createdAt).getTime(), sortable: true },
    { key: 'symbol', label: 'Symbol', sortable: true, render: (o) => <Link to={`/stock/${encodeURIComponent(o.symbol)}`} className="sym-link"><strong>{displaySymbol(o.symbol)}</strong></Link> },
    { key: 'side', label: 'Side', render: (o) => <Badge tone={o.side === 'BUY' ? 'positive' : 'negative'}>{o.side}</Badge> },
    { key: 'type', label: 'Type', hideBelow: 'sm', render: (o) => o.type.charAt(0) + o.type.slice(1).toLowerCase() },
    { key: 'quantity', label: 'Qty', align: 'right', render: (o) => o.quantity },
    { key: 'price', label: 'Price', align: 'right', render: priceCell },
    { key: 'value', label: 'Value', align: 'right', hideBelow: 'md', render: (o) => (o.value == null ? NA : formatMoney(o.value, o.symbol)) },
    { key: 'fee', label: 'Fee', align: 'right', hideBelow: 'lg', render: (o) => (o.fee == null ? NA : formatMoney(o.fee, o.symbol)) },
    { key: 'realizedPnl', label: 'Realised P&L', align: 'right', hideBelow: 'md', render: (o) => (o.realizedPnl == null ? NA : <span className={o.realizedPnl > 0 ? 'positive' : o.realizedPnl < 0 ? 'negative' : ''}>{o.realizedPnl > 0 ? '+' : ''}{formatMoney(o.realizedPnl, o.symbol)}</span>) },
    { key: 'status', label: 'Status', render: (o) => (
      <span className="ot-status">
        <Badge tone={ORDER_STATUS_TONE[o.status]}>{o.status.charAt(0) + o.status.slice(1).toLowerCase()}</Badge>
        {o.status === 'REJECTED' && o.rejectReason && <small>{REJECT_REASONS[o.rejectReason] || o.rejectReason}</small>}
      </span>
    ) },
  ];
  if (onCancel) {
    columns.push({ key: 'actions', label: '', align: 'right', render: (o) => (
      o.status === 'OPEN'
        ? <button type="button" className="btn btn-secondary btn-sm" disabled={cancellingId === o.id} onClick={() => onCancel(o.id)}>{cancellingId === o.id ? 'Cancelling…' : 'Cancel'}</button>
        : null
    ) });
  }
  return <DataTable columns={columns} rows={orders} rowKey={(o) => o.id} loading={loading} skeletonRows={4} empty={empty} dense={dense} defaultSort={{ key: 'createdAt', dir: 'desc' }} />;
}
