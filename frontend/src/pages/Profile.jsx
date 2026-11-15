import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, LogOut, Pencil, Smartphone, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import DataTable from '../components/ui/DataTable';
import { Badge, ErrorState } from '../components/ui/ui';
import { apiMessage } from '../services/trading';
import { displaySymbol, formatDateTime, formatPrice } from '../utils/format';
import '../styles/workspace.css';
import '../styles/stock.css';
import './Profile.css';

const formatMember = (ts) => (ts ? new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' }) : '—');

export default function Profile() {
  const { user, updateProfile, logout, setShowPhonePrompt } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const subs = useFetch('/api/stocks/subscriptions');

  const startEdit = () => { setName(user?.name || ''); setError(null); setEditing(true); };

  const save = async (e) => {
    e.preventDefault();
    const clean = name.replace(/\s+/g, ' ').trim();
    if (clean.length < 2) { setError('Enter at least 2 characters.'); return; }
    if (clean === user.name) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateProfile(clean);
      toast.success('Name updated');
      setEditing(false);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const unsubscribe = async (symbol) => {
    try {
      await axiosInstance.delete(`/api/stocks/subscriptions/${encodeURIComponent(symbol)}`);
      toast.success(`Alerts off for ${displaySymbol(symbol)}`);
      subs.refresh();
    } catch (err) {
      toast.error(apiMessage(err));
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (!user) return null;

  const columns = [
    { key: 'symbol', label: 'Stock', render: (r) => <span className="sym"><Link to={`/stock/${encodeURIComponent(r.symbol)}`}>{displaySymbol(r.symbol)}</Link><small>{r.companyName}</small></span> },
    { key: 'priceAtSubscription', label: 'Price when added', align: 'right', hideBelow: 'sm', render: (r) => (r.priceAtSubscription > 0 ? formatPrice(r.priceAtSubscription, r.symbol) : '—') },
    { key: 'createdAt', label: 'Added', align: 'right', hideBelow: 'md', render: (r) => formatDateTime(r.createdAt) },
    { key: 'actions', label: '', align: 'right', render: (r) => <button type="button" className="btn btn-secondary btn-sm" onClick={() => unsubscribe(r.symbol)}>Turn off</button> },
  ];

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Profile</h1>
          <p className="pg-sub">Your account details. Notification choices and your password are in <Link to="/settings" className="shell-link-btn">Settings</Link>.</p>
        </div>
      </header>

      <div className="pg-grid pg-grid--2">
        <section className="panel" aria-label="Personal details">
          <div className="panel-head"><h2 className="panel-title">Personal details</h2></div>
          <div className="pf-who">
            <span className="pf-avatar" aria-hidden="true">{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</span>
            <div className="pf-who__text">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <dl className="sd-facts sd-facts--pad">
            <div className="sd-row">
              <dt>Name</dt>
              <dd>
                {editing ? (
                  <form className="pf-edit" onSubmit={save}>
                    <input value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setError(null); }} aria-label="Your name" />
                    <button type="submit" className="btn btn-accent btn-sm" disabled={saving} aria-label="Save name"><Check size={14} /></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} aria-label="Cancel"><X size={14} /></button>
                  </form>
                ) : (
                  <span className="pf-inline">{user.name} <button type="button" className="shell-link-btn" onClick={startEdit}><Pencil size={12} /> Edit</button></span>
                )}
                {error && <span className="pf-error" role="alert">{error}</span>}
              </dd>
            </div>
            <div className="sd-row"><dt>Email</dt><dd><span className="pf-inline">{user.email} <Badge tone={user.isEmailVerified ? 'positive' : 'warning'}>{user.isEmailVerified ? 'Verified' : 'Not verified'}</Badge></span></dd></div>
            <div className="sd-row">
              <dt>Mobile</dt>
              <dd>
                <span className="pf-inline">
                  {user.phone || 'Not added'} {user.phone && <Badge tone={user.isPhoneVerified ? 'positive' : 'warning'}>{user.isPhoneVerified ? 'Verified' : 'Not verified'}</Badge>}
                  {!user.isPhoneVerified && <button type="button" className="shell-link-btn" onClick={() => setShowPhonePrompt(true)}><Smartphone size={12} /> {user.phone ? 'Verify' : 'Add number'}</button>}
                </span>
              </dd>
            </div>
            <div className="sd-row"><dt>Member since</dt><dd>{formatMember(user.createdAt)}</dd></div>
            <div className="sd-row"><dt>Last sign-in</dt><dd>{user.lastLogin ? formatDateTime(user.lastLogin) : '—'}</dd></div>
            <div className="sd-row"><dt>Sign-in method</dt><dd>{user.hasGoogle ? 'Google or email and password' : 'Email and password with a login code'}</dd></div>
          </dl>
          <div className="panel-note">Your email address cannot be changed yet. Your mobile number is only used for the alerts you turn on in Settings.</div>
        </section>

        <section className="panel" aria-label="Account shortcuts">
          <div className="panel-head"><h2 className="panel-title">Account</h2></div>
          <ul className="pf-links">
            <li><Link to="/wallet">Wallet and transaction history</Link><span>Simulated funds only</span></li>
            <li><Link to="/settings">Settings</Link><span>Notifications and password</span></li>
            <li><Link to="/notifications">Notifications</Link><span>In-app messages and email and SMS log</span></li>
            <li><Link to="/orders">Orders</Link><span>Open and past simulated orders</span></li>
          </ul>
          <div className="pf-logout"><button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}><LogOut size={14} /> Log out</button></div>
        </section>
      </div>

      <section className="panel" aria-label="Price alerts">
        <div className="panel-head"><h2 className="panel-title">Price alerts</h2><span className="pg-meta">Turn alerts on from any stock page</span></div>
        {subs.error && !subs.data ? (
          <ErrorState title="Could not load your alerts" onRetry={subs.refresh}>{subs.error}</ErrorState>
        ) : (
          <DataTable columns={columns} rows={subs.data || []} rowKey={(r) => r._id} loading={subs.loading && !subs.data} empty="You have no price alerts. Open a stock and choose Alerts to follow it." skeletonRows={2} dense />
        )}
      </section>
    </div>
  );
}
