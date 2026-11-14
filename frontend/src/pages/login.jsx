import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff, CheckCircle2, RefreshCw, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import axiosInstance from '../utils/axiosInstance';
import './login.css';

const Login = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Verification state (if user is unverified)
  const [isVerifying, setIsVerifying] = useState(!!searchParams.get('verifyToken'));
  const [verifyCode, setVerifyCode] = useState(searchParams.get('verifyToken') || '');
  const [devVerifyCode, setDevVerifyCode] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // 2-Step Login OTP state
  const [isLoginOtp, setIsLoginOtp] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState('');
  const [devLoginOtp, setDevLoginOtp] = useState(null);
  const [loginOtpCooldown, setLoginOtpCooldown] = useState(0);

  // Forgot password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: enter email, 2: enter code & new pwd
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devResetCode, setDevResetCode] = useState(null);

  const navigate = useNavigate();
  const { login, verifyLoginOtp, resendLoginOtp, verifyEmail, resendVerification, googleLogin } = useAuth();
  const { addNotification } = useNotification();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const res = await login(email.trim(), password);
      if (res?.requiresOtp) {
        setIsLoginOtp(true);
        if (res.debugCode) {
          setDevLoginOtp(res.debugCode);
        }
        addNotification('OTP Dispatched', 'A 6-digit security code was sent to your email.', 'info');
        startLoginOtpCooldown();
        return;
      }
      addNotification('Success', 'Welcome back to Quanta', 'success');
      navigate('/analyzer');
    } catch (err) {
      const data = err.response?.data;
      if (data?.requiresVerification) {
        setIsVerifying(true);
        if (data.debugCode) {
          setDevVerifyCode(data.debugCode);
          setVerifyCode(data.debugCode);
        }
        setError('Your email is not verified yet. Please enter the verification code sent to your inbox.');
        startCooldown();
      } else {
        setError(data?.message || 'Invalid email or password.');
        addNotification('Authentication Failed', 'Invalid credentials', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginOtpSubmit = async (e) => {
    e.preventDefault();
    if (!loginOtpCode || loginOtpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyLoginOtp(email.trim(), loginOtpCode.trim());
      addNotification('Authenticated', 'Login successful! Security alert dispatched to your email.', 'success');
      navigate('/analyzer');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const startLoginOtpCooldown = () => {
    setLoginOtpCooldown(60);
    const interval = setInterval(() => {
      setLoginOtpCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendLoginOtp = async () => {
    if (loginOtpCooldown > 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await resendLoginOtp(email.trim());
      if (res?.debugCode) setDevLoginOtp(res.debugCode);
      addNotification('New Code Sent', 'A fresh 6-digit login code has been dispatched.', 'info');
      startLoginOtpCooldown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend login code.');
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
      addNotification('Email Verified', 'Your account is now active!', 'success');
      navigate('/analyzer');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired verification code.');
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
      await resendVerification(email.trim());
      addNotification('Code Resent', 'A fresh code has been sent to your email.', 'info');
      startCooldown();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axiosInstance.post('/api/auth/forgot-password', { email: email.trim() });
      if (res.data.debugCode) setDevResetCode(res.data.debugCode);
      setForgotStep(2);
      addNotification('Reset Code Sent', 'Check your inbox for your password recovery code.', 'info');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axiosInstance.post('/api/auth/reset-password', {
        email: email.trim(),
        token: resetCode.trim(),
        newPassword,
      });
      addNotification('Password Updated', 'You can now sign in with your new password.', 'success');
      setIsForgotPassword(false);
      setForgotStep(1);
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
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
      addNotification('Signed in with Google', 'Welcome back!', 'success');
      navigate('/analyzer');
    } catch (err) {
      console.error('Google Sign-In error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up was blocked. Please allow pop-ups for this site.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error connecting to Google. If using an Ad-Blocker, Brave Shields, or VPN, please disable it for localhost and retry.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized in Firebase Console.');
      } else {
        setError(err.response?.data?.message || err.message || 'Google Sign-In failed. Please try again.');
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
        {/* VIEW 1: Standard Login Form */}
        {!isVerifying && !isForgotPassword && !isLoginOtp && (
          <>
            <div className="auth-header">
              <h2>Welcome Back</h2>
              <p>Enter your credentials to access your global portfolio.</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleLoginSubmit}>
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
                  placeholder="Password"
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

              <div className="auth-forgot-row">
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => { setIsForgotPassword(true); setError(''); }}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Sign In'} <ArrowRight size={18} />
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
              <span>Sign in with Google</span>
            </button>

            <p className="auth-footer">
              Don't have an account? <Link to="/signup" className="auth-link">Sign up</Link>
            </p>
          </>
        )}

        {/* VIEW 1.5: 2-Step Login OTP Verification */}
        {isLoginOtp && !isVerifying && !isForgotPassword && (
          <div className="verify-view animate-fade-in">
            <div className="auth-header">
              <div className="verify-badge-icon">
                <KeyRound size={26} color="#22c55e" />
              </div>
              <h2>Two-Step Verification</h2>
              <p>
                Enter the 6-digit login security code sent to:
                <br />
                <strong style={{ color: '#ffffff' }}>{email}</strong>
              </p>
            </div>

            {devLoginOtp && (
              <div
                className="dev-code-alert"
                onClick={() => setLoginOtpCode(devLoginOtp)}
                style={{ cursor: 'pointer' }}
              >
                <KeyRound size={16} />
                <span>Dev Code: <strong>{devLoginOtp}</strong> (Click to autofill)</span>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleLoginOtpSubmit}>
              <div className="auth-input-group">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={loginOtpCode}
                  onChange={(e) => setLoginOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="auth-code-input"
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading || loginOtpCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'} <CheckCircle2 size={18} />
              </button>
            </form>

            <div className="verify-resend-row">
              <button
                type="button"
                className="resend-link"
                onClick={handleResendLoginOtp}
                disabled={loginOtpCooldown > 0 || loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {loginOtpCooldown > 0 ? `Resend code in ${loginOtpCooldown}s` : 'Resend login code'}
              </button>
            </div>

            <p className="auth-footer">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setIsLoginOtp(false);
                  setError('');
                  setLoginOtpCode('');
                }}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </p>
          </div>
        )}

        {/* VIEW 2: Email Verification Flow */}
        {isVerifying && (
          <div className="verify-view animate-fade-in">
            <div className="auth-header">
              <div className="verify-badge-icon">
                <Mail size={26} color="#22c55e" />
              </div>
              <h2>Verify your email</h2>
              <p>
                Enter the 6-digit confirmation code sent to:
                <br />
                <strong style={{ color: '#ffffff' }}>{email}</strong>
              </p>
            </div>

            {devVerifyCode && (
              <div className="dev-code-alert" onClick={() => setVerifyCode(devVerifyCode)} style={{ cursor: 'pointer' }}>
                <KeyRound size={16} />
                <span>Verification Code: <strong>{devVerifyCode}</strong> (Click to autofill)</span>
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
                {loading ? 'Verifying...' : 'Verify & Sign In'} <CheckCircle2 size={18} />
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
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => { setIsVerifying(false); setError(''); }}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </p>
          </div>
        )}

        {/* VIEW 3: Forgot Password Flow */}
        {isForgotPassword && (
          <div className="forgot-view animate-fade-in">
            <div className="auth-header">
              <h2>Password Recovery</h2>
              <p>
                {forgotStep === 1
                  ? 'Enter your registered email address to receive a recovery authorization code.'
                  : `Enter the 6-digit recovery code sent to ${email} and set your new password.`}
              </p>
            </div>

            {devResetCode && (
              <div className="dev-code-alert">
                <KeyRound size={16} />
                <span>Sandbox Recovery Code: <strong>{devResetCode}</strong></span>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            {forgotStep === 1 ? (
              <form className="auth-form" onSubmit={handleForgotPasswordSubmit}>
                <div className="auth-input-group">
                  <Mail className="auth-icon" size={20} />
                  <input
                    type="email"
                    placeholder="Registered email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                  {loading ? 'Sending Code...' : 'Send Recovery Code'} <ArrowRight size={18} />
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleResetPasswordSubmit}>
                <div className="auth-input-group">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6-digit Recovery Code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    className="auth-code-input"
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <Lock className="auth-icon" size={20} />
                  <input
                    type="password"
                    placeholder="New Password (min 8 chars, 1 uppercase, 1 number)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                  {loading ? 'Updating Password...' : 'Save New Password'} <CheckCircle2 size={18} />
                </button>
              </form>
            )}

            <p className="auth-footer">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => { setIsForgotPassword(false); setForgotStep(1); setError(''); }}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
