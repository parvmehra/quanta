import React, { useState } from 'react';
import { Smartphone, CheckCircle2, Shield, X, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import './PhoneOnboardingModal.css';

const PhoneOnboardingModal = () => {
  const { showPhonePrompt, dismissPhonePrompt, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [step, setStep] = useState('INPUT'); // 'INPUT' | 'VERIFY'
  const [phone, setPhone] = useState('+1');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  if (!showPhonePrompt) return null;

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 8 || !phone.startsWith('+')) {
      toast.error('Please enter a valid international number in E.164 format (e.g. +14155552671 or +919876543210)');
      return;
    }
    if (!consent) {
      toast.error('Please provide consent for transactional SMS alerts');
      return;
    }

    setLoading(true);
    try {
      const res = await sendPhoneOtp(phone.trim());
      toast.success(res.message || 'Verification code sent via SMS!');
      if (res.debugOtp) {
        setDevOtp(res.debugOtp);
        setOtp(res.debugOtp);
        toast(`Dev Mode OTP: ${res.debugOtp}`, { icon: '🔑', duration: 8000 });
      }
      setStep('VERIFY');
      startCooldown();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to send OTP code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneOtp(otp.trim());
      toast.success('Mobile number verified successfully! SMS alerts enabled.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const startCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await sendPhoneOtp(phone.trim());
      toast.success('A new code has been sent!');
      if (res.debugOtp) toast(`Dev Mode OTP: ${res.debugOtp}`, { icon: '🔑' });
      startCooldown();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="phone-modal-overlay animate-fade-in" role="dialog" aria-modal="true">
      <div className="phone-modal-card">
        <button
          className="phone-modal-close"
          onClick={dismissPhonePrompt}
          aria-label="Dismiss onboarding"
          title="Maybe later"
        >
          <X size={18} />
        </button>

        <div className="phone-modal-header">
          <div className="phone-modal-icon-wrap">
            <Smartphone size={24} className="phone-modal-icon" />
          </div>
          <h3>Complete your MarketLens profile</h3>
          <p>
            Add and verify your mobile number to receive important account alerts, stock subscription updates, and transaction notifications by SMS.
          </p>
        </div>

        {step === 'INPUT' ? (
          <form className="phone-modal-form" onSubmit={handleSendOtp}>
            <div className="phone-input-group">
              <label htmlFor="onboarding-phone-input">Mobile Phone (E.164 Format)</label>
              <input
                id="onboarding-phone-input"
                type="tel"
                placeholder="+14155552671 or +919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
              />
              <span className="phone-input-help">Must start with country code (+1 for US, +91 for India, etc.)</span>
            </div>

            <div className="phone-consent-wrap">
              <input
                type="checkbox"
                id="sms-consent-checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <label htmlFor="sms-consent-checkbox">
                I agree to receive security and transactional notifications via SMS. Standard carrier rates may apply.
              </label>
            </div>

            <div className="phone-modal-actions">
              <button
                type="button"
                className="btn-phone-secondary"
                onClick={dismissPhonePrompt}
                disabled={loading}
              >
                Maybe later
              </button>
              <button
                type="submit"
                className="btn-phone-primary"
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Send Code'}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <form className="phone-modal-form" onSubmit={handleVerifyOtp}>
            {devOtp && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: '#22c55e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setOtp(devOtp)}>
                <span>🔑 Dev Mode OTP: <strong>{devOtp}</strong> (Click to autofill)</span>
              </div>
            )}
            <div className="phone-input-group">
              <label htmlFor="phone-otp-input">Enter 6-digit Code sent to {phone}</label>
              <input
                id="phone-otp-input"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="phone-otp-input"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <div className="phone-resend-row">
              <button
                type="button"
                className="phone-resend-btn"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="phone-change-btn"
                onClick={() => setStep('INPUT')}
              >
                Change number
              </button>
            </div>

            <div className="phone-modal-actions">
              <button
                type="button"
                className="btn-phone-secondary"
                onClick={dismissPhonePrompt}
                disabled={loading}
              >
                Skip for now
              </button>
              <button
                type="submit"
                className="btn-phone-primary"
                disabled={loading || otp.length !== 6}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Verify & Enable'}
                <CheckCircle2 size={16} />
              </button>
            </div>
          </form>
        )}

        <div className="phone-modal-footer">
          <Shield size={13} />
          <span>Your number is encrypted and only used for verified alerts.</span>
        </div>
      </div>
    </div>
  );
};

export default PhoneOnboardingModal;
