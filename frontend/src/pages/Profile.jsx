import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Smartphone,
  Shield,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  ArrowRight,
  TrendingUp,
  History,
  Lock,
  Save,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import axiosInstance from '../utils/axiosInstance';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import './Profile.css';

const Profile = () => {
  const { user, setUser, updatePreferences, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const { addNotification } = useNotification();

  const [prefs, setPrefs] = useState({
    email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
    sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [otpStep, setOtpStep] = useState('SEND');
  const [otpLoading, setOtpLoading] = useState(false);
  const [, setResendCooldown] = useState(0);

  const [subscriptions, setSubscriptions] = useState([]);
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [, setLoadingData] = useState(true);

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPrefs(user.notificationPreferences);
    }
    fetchProfileData();
  }, [user]);

  const fetchProfileData = async () => {
    setLoadingData(true);
    try {
      const subsRes = await axiosInstance.get('/api/stocks/subscriptions');
      setSubscriptions(subsRes.data || []);

      const logsRes = await axiosInstance.get('/api/auth/notifications/history');
      setNotificationLogs(logsRes.data || []);
    } catch (err) {
      console.warn('Failed to load profile aux data:', err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const handleTogglePref = (channel, key) => {
    setPrefs((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [key]: !prev[channel][key],
      },
    }));
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await updatePreferences(prefs);
      toast.success('Notification preferences updated successfully!');
      addNotification('Preferences Saved', 'Your alert settings have been synchronized.', 'success');
    } catch (err) {
      toast.error('Failed to update preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSendPhoneOtp = async (e) => {
    e.preventDefault();
    if (!phoneNumber || !phoneNumber.startsWith('+')) {
      toast.error('Please enter an international number in E.164 format (e.g. +14155552671)');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await sendPhoneOtp(phoneNumber.trim());
      toast.success(res.message || 'OTP code sent via SMS!');
      if (res.debugOtp) {
        setDevOtp(res.debugOtp);
        setPhoneOtp(res.debugOtp);
        toast(`Dev Mode OTP: ${res.debugOtp}`, { icon: '🔑', duration: 8000 });
      }
      setOtpStep('VERIFY');
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((p) => {
          if (p <= 1) {
            clearInterval(timer);
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (!phoneOtp || phoneOtp.length !== 6) {
      toast.error('Please enter the 6-digit verification code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await verifyPhoneOtp(phoneOtp.trim());
      toast.success('Phone number verified successfully!');
      setShowPhoneModal(false);
      setOtpStep('SEND');
      setPhoneOtp('');
      if (res.user) setUser(res.user);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Invalid code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleUnsubscribeStock = async (symbol) => {
    try {
      await axiosInstance.delete(`/api/stocks/subscriptions/${symbol}`);
      setSubscriptions((prev) => prev.filter((s) => s.symbol !== symbol));
      toast.success(`Unsubscribed from ${symbol} alerts`);
    } catch (err) {
      toast.error('Failed to unsubscribe');
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-container animate-fade-in">
        <div className="profile-header">
          <div className="profile-header-left">
            <div className="profile-avatar-wrap">
              <User size={32} />
            </div>
            <div>
              <h1 className="profile-title">{user?.name || 'Account Settings'}</h1>
              <p className="profile-subtitle">{user?.email} • Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="profile-header-badge">
            <span className={`status-pill ${user?.isEmailVerified ? 'verified' : 'unverified'}`}>
              <CheckCircle2 size={13} /> {user?.isEmailVerified ? 'Email Verified' : 'Unverified Email'}
            </span>
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-col-left">
            <div className="profile-card">
              <h2 className="profile-card-title">
                <Shield size={18} className="profile-icon-green" /> Security & Identity
              </h2>

              <div className="identity-rows">
                <div className="identity-row">
                  <div className="identity-info">
                    <Mail size={16} className="identity-icon" />
                    <div>
                      <span className="identity-label">Email Address</span>
                      <span className="identity-val">{user?.email}</span>
                    </div>
                  </div>
                  <span className="badge-verified">
                    <CheckCircle2 size={13} /> Verified
                  </span>
                </div>

                <div className="identity-row">
                  <div className="identity-info">
                    <Smartphone size={16} className="identity-icon" />
                    <div>
                      <span className="identity-label">Mobile Phone (SMS Alerts)</span>
                      <span className="identity-val">{user?.phone || 'No phone number added'}</span>
                    </div>
                  </div>
                  {user?.isPhoneVerified ? (
                    <span className="badge-verified">
                      <CheckCircle2 size={13} /> Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-verify-phone"
                      onClick={() => setShowPhoneModal(true)}
                    >
                      Verify Phone
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-card">
              <div className="pref-card-header">
                <div>
                  <h2 className="profile-card-title">
                    <Bell size={18} className="profile-icon-green" /> Notification Preferences
                  </h2>
                  <p className="pref-card-sub">
                    Configure multi-channel alerts independently for Nodemailer email and Twilio SMS.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-save-prefs"
                  onClick={handleSavePreferences}
                  disabled={savingPrefs}
                >
                  {savingPrefs ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Save</span>
                </button>
              </div>

              <div className="pref-table">
                <div className="pref-table-header">
                  <span>Notification Event</span>
                  <span className="text-center">Email</span>
                  <span className="text-center">SMS</span>
                </div>

                <div className="pref-table-row">
                  <div className="pref-row-desc">
                    <strong>Account & Security Alerts</strong>
                    <span>New sign-ins, password updates, and verification codes</span>
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-email-sec"
                      checked={prefs.email.security}
                      onChange={() => handleTogglePref('email', 'security')}
                    />
                    <label htmlFor="pref-email-sec" />
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-sms-sec"
                      checked={prefs.sms.security}
                      disabled={!user?.isPhoneVerified}
                      onChange={() => handleTogglePref('sms', 'security')}
                    />
                    <label htmlFor="pref-sms-sec" title={!user?.isPhoneVerified ? 'Requires verified mobile number' : ''} />
                  </div>
                </div>

                <div className="pref-table-row">
                  <div className="pref-row-desc">
                    <strong>Stock Subscription Alerts</strong>
                    <span>Real-time price move notifications for followed stocks</span>
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-email-sub"
                      checked={prefs.email.subscriptions}
                      onChange={() => handleTogglePref('email', 'subscriptions')}
                    />
                    <label htmlFor="pref-email-sub" />
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-sms-sub"
                      checked={prefs.sms.subscriptions}
                      disabled={!user?.isPhoneVerified}
                      onChange={() => handleTogglePref('sms', 'subscriptions')}
                    />
                    <label htmlFor="pref-sms-sub" title={!user?.isPhoneVerified ? 'Requires verified mobile number' : ''} />
                  </div>
                </div>

                <div className="pref-table-row">
                  <div className="pref-row-desc">
                    <strong>Trade Executions</strong>
                    <span>Order confirmations for executed BUY and SELL trades</span>
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-email-trades"
                      checked={prefs.email.trades}
                      onChange={() => handleTogglePref('email', 'trades')}
                    />
                    <label htmlFor="pref-email-trades" />
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-sms-trades"
                      checked={prefs.sms.trades}
                      disabled={!user?.isPhoneVerified}
                      onChange={() => handleTogglePref('sms', 'trades')}
                    />
                    <label htmlFor="pref-sms-trades" title={!user?.isPhoneVerified ? 'Requires verified mobile number' : ''} />
                  </div>
                </div>

                <div className="pref-table-row">
                  <div className="pref-row-desc">
                    <strong>Wallet activity</strong>
                    <span>Top-up confirmations, refunds, and transaction receipts</span>
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-email-wallet"
                      checked={prefs.email.wallet}
                      onChange={() => handleTogglePref('email', 'wallet')}
                    />
                    <label htmlFor="pref-email-wallet" />
                  </div>
                  <div className="pref-toggle-wrap">
                    <input
                      type="checkbox"
                      id="pref-sms-wallet"
                      checked={prefs.sms.wallet}
                      disabled={!user?.isPhoneVerified}
                      onChange={() => handleTogglePref('sms', 'wallet')}
                    />
                    <label htmlFor="pref-sms-wallet" title={!user?.isPhoneVerified ? 'Requires verified mobile number' : ''} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-col-right">
            <div className="profile-card profile-wallet-card">
              <div className="wallet-card-header">
                <div>
                  <span className="wallet-sub-title">Simulated wallet</span>
                  <p style={{ color: 'var(--q-text-2)', fontSize: 'var(--fs-sm)', marginTop: 6 }}>
                    Your balances, deposits and full transaction history are on the Wallet page. All funds are simulated.
                  </p>
                </div>
                <Link to="/wallet" className="btn-topup-wallet">Open wallet</Link>
              </div>
            </div>

            <div className="profile-card">
              <h2 className="profile-card-title">
                <TrendingUp size={18} className="profile-icon-green" /> Active Stock Subscriptions
              </h2>

              {subscriptions.length === 0 ? (
                <div className="empty-subs-box">
                  <p>You have not subscribed to any stocks yet.</p>
                  <Link to="/analyzer" className="link-green">
                    Browse Screener to Follow Stocks →
                  </Link>
                </div>
              ) : (
                <div className="subs-list">
                  {subscriptions.map((sub) => (
                    <div key={sub._id} className="sub-item">
                      <div className="sub-info">
                        <Link to={`/stock/${sub.symbol}`} className="sub-sym">
                          {sub.symbol} <ExternalLink size={12} />
                        </Link>
                        <span className="sub-company">{sub.companyName}</span>
                      </div>
                      <div className="sub-actions">
                        <span className="sub-price">${Number(sub.priceAtSubscription).toFixed(2)}</span>
                        <button
                          type="button"
                          className="btn-unsub"
                          title="Unsubscribe"
                          onClick={() => handleUnsubscribeStock(sub.symbol)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="profile-card">
              <h2 className="profile-card-title">
                <History size={18} className="profile-icon-green" /> Delivery Activity Log
              </h2>

              {notificationLogs.length === 0 ? (
                <div className="empty-subs-box">
                  <p>No notifications delivered yet.</p>
                </div>
              ) : (
                <div className="logs-list">
                  {notificationLogs.slice(0, 5).map((log) => (
                    <div key={log._id} className="log-item">
                      <div className="log-icon-channel">
                        {log.channel === 'sms' ? <Smartphone size={15} color="#3b82f6" /> : <Mail size={15} color="#22c55e" />}
                      </div>
                      <div className="log-details">
                        <div className="log-title-row">
                          <span className="log-title">{log.title}</span>
                          <span className={`log-status ${log.status.toLowerCase()}`}>{log.status}</span>
                        </div>
                        <span className="log-time">
                          {new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPhoneModal && (
        <div className="profile-modal-overlay">
          <div className="profile-modal-card">
            <h3>Verify Mobile Number</h3>
            <p>Enter your international mobile number to receive instant SMS alerts.</p>

            {otpStep === 'SEND' ? (
              <form onSubmit={handleSendPhoneOtp}>
                <div className="modal-input-group">
                  <label>International Mobile Phone (E.164)</label>
                  <input
                    type="tel"
                    placeholder="+14155552671 or +919876543210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-modal-cancel" onClick={() => setShowPhoneModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-modal-submit" disabled={otpLoading}>
                    {otpLoading ? <Loader2 size={16} className="animate-spin" /> : 'Send Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp}>
                {devOtp && (
                  <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: '#22c55e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setPhoneOtp(devOtp)}>
                    <span>🔑 Dev Mode OTP: <strong>{devOtp}</strong> (Click to autofill)</span>
                  </div>
                )}
                <div className="modal-input-group">
                  <label>6-digit Code sent to {phoneNumber}</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    className="modal-otp-input"
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-modal-cancel" onClick={() => setOtpStep('SEND')}>
                    Change Number
                  </button>
                  <button type="submit" className="btn-modal-submit" disabled={otpLoading || phoneOtp.length !== 6}>
                    {otpLoading ? <Loader2 size={16} className="animate-spin" /> : 'Verify Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default Profile;
