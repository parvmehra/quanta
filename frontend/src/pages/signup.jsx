import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, CheckCircle2, RefreshCw, KeyRound, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './login.css';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification step state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const navigate = useNavigate();
  const { signup, verifyEmail, resendVerification, googleLogin } = useAuth();
  const { addNotification } = useNotification();

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one uppercase letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await signup(name, email, password);
      if (res.requiresVerification) {
        setIsVerifying(true);
        if (res.debugCode) setDevCode(res.debugCode);
        addNotification('Verification Code Sent', 'Check your inbox for your 6-digit activation code.', 'info');
        startCooldown();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
      addNotification('Error', err.response?.data?.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!verifyCode || verifyCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyEmail(email.trim(), verifyCode.trim());
      addNotification('Welcome to Quanta!', 'Your account has been verified successfully.', 'success');
      navigate('/analyzer');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired verification code.');
      addNotification('Verification Failed', err.response?.data?.message || 'Invalid code', 'error');
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
      const res = await resendVerification(email.trim());
      if (res.debugCode) setDevCode(res.debugCode);
      addNotification('Code Resent', 'A fresh code has been sent to your email address.', 'info');
      startCooldown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const { signInWithPopup } = await import('firebase/auth');
      const { auth, googleProvider, isFirebaseConfigured } = await import('../config/firebase.js');
      
      if (!isFirebaseConfigured || !auth || !googleProvider) {
        throw new Error('Firebase Google Sign-In is not configured yet. Please set VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID in frontend/.env');
      }

      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      
      await googleLogin({ idToken });
      addNotification('Signed in with Google', 'Welcome to Quanta!', 'success');
      navigate('/analyzer');
    } catch (err) {
      console.error('Google Sign-Up error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up was blocked. Please allow pop-ups for this site.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error connecting to Google. If using an Ad-Blocker, Brave Shields, or VPN, please disable it for localhost and retry.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized in Firebase Console.');
      } else {
        setError(err.response?.data?.message || err.message || 'Google Sign-Up failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-background-effects">
        <div className="auth-glow"></div>
        <div className="auth-grid"></div>
      </div>

      <div className="auth-card animate-fade-in">
        {!isVerifying ? (
          <>
            <div className="auth-header">
              <h2>Create Account</h2>
              <p>Sign up to track real-time stocks, execute simulated trades, and analyze portfolios.</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleRegisterSubmit}>
              <div className="auth-input-group">
                <User className="auth-icon" size={20} />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="auth-input-group">
                <Mail className="auth-icon" size={20} />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="auth-input-group">
                <Lock className="auth-icon" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password (Min 8 chars, 1 uppercase, 1 number)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <div className="auth-input-group">
                <Lock className="auth-icon" size={20} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                {loading ? 'Creating Account...' : 'Sign Up'} <ArrowRight size={18} />
              </button>
            </form>

            <div className="auth-divider">
              <span>OR CONTINUE WITH</span>
            </div>

            <button
              type="button"
              className="google-auth-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign up with Google</span>
            </button>

            <p className="auth-footer">
              Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        ) : (
          /* Email Verification Code View */
          <div className="verify-view animate-fade-in">
            <div className="auth-header">
              <div className="verify-badge-icon">
                <Mail size={26} color="#22c55e" />
              </div>
              <h2>Verify your email</h2>
              <p>
                We sent a 6-digit confirmation code to:
                <br />
                <strong style={{ color: '#ffffff' }}>{email}</strong>
              </p>
            </div>

            {devCode && (
              <div className="dev-code-alert">
                <KeyRound size={16} />
                <span>Sandbox Verification Code: <strong>{devCode}</strong></span>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleVerifySubmit}>
              <div className="auth-input-group">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="auth-code-input"
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading || verifyCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'} <CheckCircle2 size={18} />
              </button>
            </form>

            <div className="verify-resend-row">
              <button
                type="button"
                className="resend-link"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}
              </button>
            </div>

            <p className="auth-footer">
              Entered wrong email?{' '}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => { setIsVerifying(false); setError(''); }}
              >
                Change details
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup;
