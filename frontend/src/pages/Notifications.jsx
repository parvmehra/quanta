import React, { useCallback, useEffect, useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { useNotification } from '../contexts/NotificationContext';
import DataTable from '../components/ui/DataTable';
import { Badge, EmptyState, ErrorState, Tabs } from '../components/ui/ui';
import { apiMessage } from '../services/trading';
import { formatDateTime } from '../utils/format';
import '../styles/workspace.css';

const EVENT_LABEL = {
  EMAIL_VERIFICATION: 'Email verification',
  LOGIN_OTP: 'Login code',
  WELCOME: 'Welcome',
  SIGNUP_WELCOME: 'Welcome',
  LOGIN_ALERT: 'Sign-in alert',
  STOCK_SUBSCRIPTION: 'Price alert',
  STOCK_PURCHASE: 'Trade confirmation',
  WALLET_TOPUP: 'Wallet deposit',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
  PHONE_VERIFICATION_OTP: 'Mobile verification',
  PHONE_VERIFIED: 'Mobile verified',
};
const STATUS = {
  SENT: { label: 'Sent', tone: 'positive' },
  SIMULATED: { label: 'Recorded, not delivered', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'negative' },
  FAILED_INVALID_NUMBER: { label: 'Failed', tone: 'negative' },
};
const PAGE = 50;
const TONE = { success: 'positive', error: 'negative', warning: 'warning', info: 'info' };

function DeliveryLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/api/auth/notifications/history?limit=${PAGE}${before ? `&before=${before}` : ''}`);
      setRows((prev) => (before ? [...prev, ...res.data] : res.data));
      setMore(res.data.length === PAGE);
      setError(null);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !rows.length) return <ErrorState title="Could not load the log" onRetry={() => load()}>{error}</ErrorState>;

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => formatDateTime(r.createdAt) },
    { key: 'channel', label: 'Channel', render: (r) => (r.channel === 'sms' ? <span className="nt-ch"><MessageSquare size={13} /> SMS</span> : <span className="nt-ch"><Mail size={13} /> Email</span>) },
    { key: 'eventType', label: 'Type', hideBelow: 'sm', render: (r) => EVENT_LABEL[r.eventType] || r.eventType },
    { key: 'title', label: 'Subject', render: (r) => <span className="nt-subject">{r.title}</span> },
    { key: 'status', label: 'Status', align: 'right', render: (r) => { const s = STATUS[r.status] || { label: r.status || '—', tone: 'neutral' }; return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r._id} loading={loading && !rows.length} empty="Nothing has been sent to you yet." dense />
      {more && <div className="nt-more"><button type="button" className="btn btn-secondary btn-sm" onClick={() => load(rows[rows.length - 1]?.createdAt)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button></div>}
      <div className="panel-note">“Recorded, not delivered” means no email or SMS provider is configured on this server. One-time codes and reset tokens are never stored or shown here.</div>
    </>
  );
}

export default function Notifications() {
  const { notifications, unreadCount, markAllAsRead, clearNotifications } = useNotification();
  const [tab, setTab] = useState('app');

  useEffect(() => { if (tab === 'app' && unreadCount > 0) markAllAsRead(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Notifications</h1>
          <p className="pg-sub">Messages from the app and a record of the emails and texts Quanta sent you.</p>
        </div>
        <Tabs tabs={[{ id: 'app', label: 'In-app' }, { id: 'log', label: 'Email and SMS' }]} value={tab} onChange={setTab} label="Notification type" />
      </header>

      <section className="panel" aria-label="Notifications">
        {tab === 'app' ? (
          <>
            <div className="panel-head">
              <h2 className="panel-title">In-app messages</h2>
              {notifications.length > 0 && <button type="button" className="shell-link-btn" onClick={clearNotifications}>Clear all</button>}
            </div>
            {notifications.length === 0 ? (
              <EmptyState title="No messages">Price alerts and other in-app messages appear here and in the bell at the top.</EmptyState>
            ) : (
              <ul className="nt-list">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Badge tone={TONE[n.type] || 'neutral'}>{n.type || 'info'}</Badge>
                    <div><strong>{n.title}</strong><span>{n.message}</span></div>
                    <time dateTime={n.date}>{formatDateTime(n.date)}</time>
                  </li>
                ))}
              </ul>
            )}
            <div className="panel-note">In-app messages are kept in this browser, up to the latest 50.</div>
          </>
        ) : (
          <>
            <div className="panel-head"><h2 className="panel-title">Email and SMS log</h2></div>
            <DeliveryLog />
          </>
        )}
      </section>
    </div>
  );
}
