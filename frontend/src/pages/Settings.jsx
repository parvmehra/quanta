import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { apiMessage } from '../services/trading';
import '../styles/workspace.css';
import './Settings.css';

const ROWS = [
  { key: 'security', label: 'Security', help: 'Sign-in alerts and account changes' },
  { key: 'subscriptions', label: 'Price alerts', help: 'Confirmations when you follow a stock' },
  { key: 'trades', label: 'Trades', help: 'Confirmations for simulated buys and sells' },
  { key: 'wallet', label: 'Wallet', help: 'Confirmations for simulated deposits' },
  { key: 'market', label: 'Market updates', help: 'Occasional market news (off by default)' },
];

const RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'An uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'A lowercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'A number' },
];

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`st-switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function PasswordField({ label, value, onChange, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="st-field">
      <span>{label}</span>
      <div className="st-pw">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-label={label} maxLength={128} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'}>{shown ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
    </label>
  );
}

export default function Settings() {
  const { user, updatePreferences, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  if (!user) return null;
  const prefs = user.notificationPreferences;
  const smsOff = !user.isPhoneVerified;

  const toggle = async (channel, key, value) => {
    const id = `${channel}.${key}`;
    setSaving(id);
    try {
      await updatePreferences({ ...prefs, [channel]: { ...prefs[channel], [key]: value } });
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (!current) { setPwError('Enter your current password.'); return; }
    if (!RULES.every((r) => r.test(next))) { setPwError('Your new password does not meet all the rules below.'); return; }
    if (next !== confirm) { setPwError('The new passwords do not match.'); return; }
    if (next === current) { setPwError('Choose a password that is different from your current one.'); return; }
    setPwBusy(true);
    try {
      await changePassword(current, next);
      toast.success('Password updated. Other sessions were signed out.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setPwError(apiMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="pg">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Settings</h1>
          <p className="pg-sub">Choose what Quanta sends you and keep your account secure.</p>
        </div>
      </header>

      <div className="pg-grid pg-grid--2">
        <section className="panel" aria-label="Notification preferences">
          <div className="panel-head"><h2 className="panel-title">Notifications</h2></div>
          <table className="st-prefs">
            <thead><tr><th scope="col">Send me</th><th scope="col">Email</th><th scope="col">SMS</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key}>
                  <th scope="row"><strong>{r.label}</strong><small>{r.help}</small></th>
                  <td><Switch checked={Boolean(prefs.email[r.key])} disabled={saving === `email.${r.key}`} onChange={(v) => toggle('email', r.key, v)} label={`${r.label} by email`} /></td>
                  <td><Switch checked={Boolean(prefs.sms[r.key]) && !smsOff} disabled={smsOff || saving === `sms.${r.key}`} onChange={(v) => toggle('sms', r.key, v)} label={`${r.label} by SMS`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="st-note"><Info size={14} aria-hidden="true" /><span>Login codes and password emails are always sent. {smsOff ? <>SMS needs a verified mobile number. <Link to="/profile">Add one in your profile.</Link></> : 'SMS alerts go to your verified mobile number.'} Without an email or SMS provider configured on the server, messages are only recorded, not delivered.</span></div>
        </section>

        <section className="panel" aria-label="Change password">
          <div className="panel-head"><h2 className="panel-title">Password</h2></div>
          <form className="st-form" onSubmit={submitPassword}>
            <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
            <ul className="st-rules" aria-label="Password rules">
              {RULES.map((r) => <li key={r.label} className={next && r.test(next) ? 'is-met' : ''}>{next && r.test(next) ? '✓' : '•'} {r.label}</li>)}
            </ul>
            <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {pwError && <p className="st-error" role="alert">{pwError}</p>}
            <button type="submit" className="btn btn-accent" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</button>
            <p className="pg-meta">You stay signed in on this device. Every other session is signed out and you get a confirmation email.</p>
          </form>
        </section>
      </div>

      <section className="panel" aria-label="Session">
        <div className="panel-head"><h2 className="panel-title">Session and data</h2></div>
        <div className="st-session">
          <p>Signed in as <strong>{user.email}</strong>.</p>
          <p>All funds, orders and holdings in Quanta are simulated. Your data is stored in your account on this server and is never sold or shared.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>Log out</button>
        </div>
      </section>
    </div>
  );
}
