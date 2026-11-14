import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFetch } from '../hooks/useFetch';
import OrderTable from '../components/OrderTable';
import { ErrorState, Tabs } from '../components/ui/ui';
import { apiMessage, cancelOrder } from '../services/trading';
import { formatTime } from '../utils/format';
import '../styles/workspace.css';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'FILLED', label: 'Filled' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'REJECTED', label: 'Rejected' },
];

export default function Orders() {
  const [status, setStatus] = useState('ALL');
  const [cancelling, setCancelling] = useState(null);
  const orders = useFetch(`/api/orders?limit=200${status === 'ALL' ? '' : `&status=${status}`}`, { interval: 15_000 });

  const onCancel = async (id) => {
    setCancelling(id);
    try {
      await cancelOrder(id);
      toast.success('Order cancelled');
      orders.refresh();
    } catch (err) {
      toast.error(apiMessage(err));
      orders.refresh();
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Orders</h1>
          <p className="pg-sub">Simulated orders. Nothing here is sent to a real exchange or broker.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={orders.refresh}><RefreshCw size={14} /> Refresh</button>
      </header>

      <section className="panel" aria-label="Orders">
        <div className="panel-head">
          <Tabs tabs={FILTERS} value={status} onChange={setStatus} label="Order status" />
          <span className="pg-meta">Updated {formatTime(orders.updatedAt)}</span>
        </div>
        {orders.error && !orders.data ? (
          <ErrorState title="Could not load orders" onRetry={orders.refresh}>{orders.error}</ErrorState>
        ) : (
          <OrderTable
            orders={orders.data?.orders || []}
            loading={orders.loading && !orders.data}
            onCancel={onCancel}
            cancellingId={cancelling}
            dense={false}
            empty={status === 'ALL' ? 'You have not placed any orders yet.' : `No ${status.toLowerCase()} orders.`}
          />
        )}
        <div className="panel-note">Limit and stop orders are checked against live prices about every 20 seconds while the server is running. Fills use the latest price from Yahoo Finance, which may be delayed.</div>
      </section>
    </div>
  );
}
