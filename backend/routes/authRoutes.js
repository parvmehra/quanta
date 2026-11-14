import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { protect } from '../middlewares/auth.js';
import { store, saveStore } from '../dataStore.js';
import { notifyUser } from '../services/notificationService.js';
import { sendPhoneVerificationOtp, verifyPhoneOtp, isValidE164 } from '../services/smsService.js';
import admin from '../config/firebase.js';
import { JWT_SECRET } from '../config/env.js';

const router = express.Router();

// ── Rate Limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 6, // 6 OTP requests per 10 mins
  message: { message: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Security Helpers ───────────────────────────────────────────────────────
const isSecureRequest = (req) => {
  return process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
};

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
};

const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
};

const validateEmailFormat = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim().toLowerCase());
};

const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role || 'user',
  isEmailVerified: !!user.isEmailVerified,
  phone: user.phone || '',
  isPhoneVerified: !!user.isPhoneVerified,
  phonePromptDismissed: !!user.phonePromptDismissed,
  wallet: user.wallet || { balance: 500000, currency: 'USD' },
  notificationPreferences: user.notificationPreferences || {
    email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
    sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
  },
});

// ── 1. GET Current Authenticated User (/api/auth/me) ───────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: formatUserResponse(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── 2. Real Registration With Email Verification (/api/auth/signup) ────────
router.post('/signup', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Please provide a valid full name.' });
    }

    if (!validateEmailFormat(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      return res.status(400).json({ message: pwdError });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if account already exists
    let existingUser = store.users.find(u => u.email === normalizedEmail);
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
      }
      // If unverified, refresh the verification code rather than leaking error
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      existingUser.emailVerificationToken = crypto.createHash('sha256').update(verifyCode).digest('hex');
      existingUser.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
      saveStore();

      await notifyUser(existingUser, 'EMAIL_VERIFICATION', { token: verifyCode });

      return res.status(200).json({
        requiresVerification: true,
        email: existingUser.email,
        message: 'A fresh verification code has been sent to your email address.',
        debugCode: process.env.NODE_ENV !== 'production' ? verifyCode : undefined,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-digit secure verification code
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedVerifyToken = crypto.createHash('sha256').update(verifyCode).digest('hex');

    const newUser = {
      _id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'user',
      isEmailVerified: false,
      emailVerificationToken: hashedVerifyToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      phone: '',
      isPhoneVerified: false,
      phonePromptDismissed: false,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      wallet: {
        balance: 500000, // $500,000 initial paper trading margin
        currency: 'USD',
      },
      notificationPreferences: {
        email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
        sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
      },
      createdAt: Date.now(),
      lastLogin: null,
    };

    store.users.push(newUser);
    saveStore();

    // Trigger verification email via Nodemailer
    await notifyUser(newUser, 'EMAIL_VERIFICATION', { token: verifyCode });

    // Send a welcome email immediately on signup (even before verification)
    await notifyUser(newUser, 'SIGNUP_WELCOME');

    res.status(201).json({
      requiresVerification: true,
      email: newUser.email,
      message: 'Registration successful! We have sent a verification code to your email.',
      debugCode: process.env.NODE_ENV !== 'production' ? verifyCode : undefined,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ── 3. Email Verification Endpoint (/api/auth/verify-email) ────────────────
router.post('/verify-email', async (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ message: 'Email and verification code are required.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    if (!user) {
      return res.status(400).json({ message: 'Invalid verification request.' });
    }

    if (user.isEmailVerified) {
      const jwtToken = generateToken(user._id);
      return res.json({
        message: 'Account already verified.',
        token: jwtToken,
        user: formatUserResponse(user),
      });
    }

    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      return res.status(400).json({ message: 'No pending verification found. Please request a new code.' });
    }

    if (Date.now() > user.emailVerificationExpires) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    const hashedInput = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    if (hashedInput !== user.emailVerificationToken) {
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    // Mark as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    user.lastLogin = Date.now();

    // Send Welcome Email if not already sent during signup
    if (!user.welcomeEmailSent) {
      user.welcomeEmailSent = true;
      await notifyUser(user, 'WELCOME');
    }
    saveStore();

    // Send Login Alert since this is effectively a login event
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Web Browser';
    await notifyUser(user, 'LOGIN_ALERT', { ip: clientIp, userAgent });

    const jwtToken = generateToken(user._id);
    const isSecure = isSecureRequest(req);

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Email verified successfully! Welcome to Quanta.',
      token: jwtToken,
      user: formatUserResponse(user),
    });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// ── 4. Resend Verification Email (/api/auth/resend-verification) ───────────
router.post('/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmailFormat(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    // Standard generic message to avoid email enumeration
    const genericSuccess = { message: 'If an unverified account exists, a new verification code has been sent.' };

    if (!user || user.isEmailVerified) {
      return res.json(genericSuccess);
    }

    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationToken = crypto.createHash('sha256').update(verifyCode).digest('hex');
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    saveStore();

    await notifyUser(user, 'EMAIL_VERIFICATION', { token: verifyCode });

    res.json({
      ...genericSuccess,
      debugCode: process.env.NODE_ENV !== 'production' ? verifyCode : undefined,
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── 5. Real Login With Verification & Rate-Limiting (/api/auth/login) ──────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // Check Lockout
    if (user.lockoutUntil && Date.now() < user.lockoutUntil) {
      const waitMins = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
      return res.status(429).json({ message: `Account temporarily locked due to repeated failed logins. Please try again in ${waitMins} minutes.` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lockout
        user.failedLoginAttempts = 0;
      }
      saveStore();
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailVerificationToken = crypto.createHash('sha256').update(verifyCode).digest('hex');
      user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
      saveStore();

      await notifyUser(user, 'EMAIL_VERIFICATION', { token: verifyCode });

      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message: 'Your email address has not been verified yet. A verification code has been dispatched.',
        debugCode: process.env.NODE_ENV !== 'production' ? verifyCode : undefined,
      });
    }

    // Reset failed counter
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    
    // Generate 6-digit Login OTP for 2-Factor Email Authentication
    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.loginOtp = crypto.createHash('sha256').update(loginOtp).digest('hex');
    user.loginOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    saveStore();

    // Send OTP to user's registered email
    await notifyUser(user, 'LOGIN_OTP', { otp: loginOtp });

    res.json({
      requiresOtp: true,
      email: user.email,
      message: 'A 6-digit login verification code has been dispatched to your email.',
      debugCode: process.env.NODE_ENV !== 'production' ? loginOtp : undefined,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── 5.1 Verify Login OTP (/api/auth/verify-login-otp) ────────────────────────
router.post('/verify-login-otp', authLimiter, async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and 6-digit verification code are required.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    if (!user || !user.loginOtp || !user.loginOtpExpires) {
      return res.status(400).json({ message: 'No pending login code found. Please log in again.' });
    }

    if (Date.now() > user.loginOtpExpires) {
      user.loginOtp = null;
      user.loginOtpExpires = null;
      saveStore();
      return res.status(400).json({ message: 'Verification code has expired. Please log in again.' });
    }

    const hashedInput = crypto.createHash('sha256').update(otp.trim()).digest('hex');
    if (hashedInput !== user.loginOtp) {
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    // Success! Clear OTP and mark logged in
    user.loginOtp = null;
    user.loginOtpExpires = null;
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    user.lastLogin = Date.now();
    user.isEmailVerified = true;

    // Send Welcome Email if not yet sent
    if (!user.welcomeEmailSent) {
      user.welcomeEmailSent = true;
      await notifyUser(user, 'WELCOME');
    }

    saveStore();

    // Trigger Login Notification Security Alert Email
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Web Browser';
    await notifyUser(user, 'LOGIN_ALERT', { ip: clientIp, userAgent });

    const token = generateToken(user._id);
    const isSecure = isSecureRequest(req);

    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: formatUserResponse(user),
    });
  } catch (err) {
    console.error('Verify login OTP error:', err);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// ── 5.2 Resend Login OTP (/api/auth/resend-login-otp) ────────────────────────
router.post('/resend-login-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    if (!user) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.loginOtp = crypto.createHash('sha256').update(loginOtp).digest('hex');
    user.loginOtpExpires = Date.now() + 10 * 60 * 1000;
    saveStore();

    await notifyUser(user, 'LOGIN_OTP', { otp: loginOtp });

    res.json({
      success: true,
      message: 'A fresh login verification code has been dispatched to your email.',
      debugCode: process.env.NODE_ENV !== 'production' ? loginOtp : undefined,
    });
  } catch (err) {
    console.error('Resend login OTP error:', err);
    res.status(500).json({ message: 'Server error resending code.' });
  }
});

// ── 6. Google Sign-In Endpoint (/api/auth/google) ──────────────────────────
router.post('/google', async (req, res) => {
  try {
    let email, name, googleId, picture;

    // If frontend sends a Firebase ID token, verify it server-side
    if (req.body.idToken && admin.apps.length) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        email = decodedToken.email;
        name = decodedToken.name || decodedToken.email?.split('@')[0] || 'Google User';
        googleId = decodedToken.uid;
        picture = decodedToken.picture || '';
      } catch (tokenErr) {
        console.error('Firebase token verification failed:', tokenErr.message);
        return res.status(401).json({ message: 'Invalid Google authentication token.' });
      }
    } else {
      // Fallback: trust the body (for development without Firebase)
      email = req.body.email;
      name = req.body.name;
      googleId = req.body.googleId;
    }

    if (!email || !name) {
      return res.status(400).json({ message: 'Email and name are required from Google.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = store.users.find(u => u.email === normalizedEmail);

    if (!user) {
      // First time Google OAuth user -> create account automatically verified
      user = {
        _id: crypto.randomUUID(),
        name: name.trim(),
        email: normalizedEmail,
        googleId: googleId || crypto.randomUUID(),
        picture: picture || '',
        password: await bcrypt.hash(crypto.randomUUID(), 10),
        role: 'user',
        isEmailVerified: true,
        phone: '',
        isPhoneVerified: false,
        phonePromptDismissed: false,
        wallet: { balance: 500000, currency: 'USD' },
        notificationPreferences: {
          email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
          sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
        },
        createdAt: Date.now(),
        lastLogin: Date.now(),
        welcomeEmailSent: true,
      };
      store.users.push(user);
      saveStore();

      await notifyUser(user, 'WELCOME');
    } else {
      user.isEmailVerified = true;
      user.lastLogin = Date.now();
      if (picture) user.picture = picture;

      if (!user.welcomeEmailSent) {
        user.welcomeEmailSent = true;
        await notifyUser(user, 'WELCOME');
      }
      saveStore();
    }

    const token = generateToken(user._id);
    const isSecure = isSecureRequest(req);

    // Trigger Login Notification for Google Auth
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Web Browser';
    await notifyUser(user, 'LOGIN_ALERT', { ip: clientIp, userAgent });

    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const requiresPhoneOnboarding = !user.isPhoneVerified && !user.phonePromptDismissed;

    res.json({
      token,
      user: formatUserResponse(user),
      requiresPhoneOnboarding,
    });
  } catch (err) {
    console.error('Google Auth error:', err);
    res.status(500).json({ message: 'Server error during Google authentication.' });
  }
});

// ── 7. Password Recovery (/api/auth/forgot-password) ───────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmailFormat(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    const genericSuccess = { message: 'If an account matches that email, a password recovery code has been sent.' };
    if (!user) return res.json(genericSuccess);

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = crypto.createHash('sha256').update(resetCode).digest('hex');
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    saveStore();

    await notifyUser(user, 'PASSWORD_RESET', { resetToken: resetCode });

    res.json({
      ...genericSuccess,
      debugCode: process.env.NODE_ENV !== 'production' ? resetCode : undefined,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── 8. Reset Password With Token (/api/auth/reset-password) ────────────────
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'Email, token, and new password are required.' });
  }

  const pwdError = validatePasswordStrength(newPassword);
  if (pwdError) return res.status(400).json({ message: pwdError });

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = store.users.find(u => u.email === normalizedEmail);

    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Invalid or expired password reset request.' });
    }

    if (Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Password reset code has expired. Please request a new one.' });
    }

    const hashedInput = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    if (hashedInput !== user.resetPasswordToken) {
      return res.status(400).json({ message: 'Invalid password reset code.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    saveStore();

    res.json({ message: 'Password has been successfully updated. You may now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

// ── 9. Mobile Phone Verification: Send OTP (/api/auth/phone/send-otp) ──────
router.post('/phone/send-otp', protect, otpLimiter, async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required.' });
  }

  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const result = await sendPhoneVerificationOtp(user, phone);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── 10. Mobile Phone Verification: Confirm OTP (/api/auth/phone/verify-otp) ─
router.post('/phone/verify-otp', protect, async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ message: 'Verification OTP code is required.' });
  }

  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const result = await verifyPhoneOtp(user, otp);
    res.json({
      ...result,
      user: formatUserResponse(user),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── 11. Dismiss Mobile Onboarding Prompt (/api/auth/phone/dismiss-prompt) ───
router.post('/phone/dismiss-prompt', protect, async (req, res) => {
  try {
    const user = store.users.find(u => u._id === req.user._id);
    if (user) {
      user.phonePromptDismissed = true;
      saveStore();
    }
    res.json({ message: 'Mobile onboarding dismissed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── 12. Notification Preferences Centre (/api/auth/preferences) ───────────
router.get('/preferences', protect, (req, res) => {
  const user = store.users.find(u => u._id === req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({
    preferences: user.notificationPreferences || {
      email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
      sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
    },
    isEmailVerified: !!user.isEmailVerified,
    isPhoneVerified: !!user.isPhoneVerified,
    phone: user.phone || '',
  });
});

router.put('/preferences', protect, (req, res) => {
  const { preferences } = req.body;

  const user = store.users.find(u => u._id === req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (preferences) {
    user.notificationPreferences = {
      email: {
        security: preferences.email?.security ?? true,
        subscriptions: preferences.email?.subscriptions ?? true,
        trades: preferences.email?.trades ?? true,
        wallet: preferences.email?.wallet ?? true,
        market: preferences.email?.market ?? false,
      },
      sms: {
        security: preferences.sms?.security ?? true,
        subscriptions: preferences.sms?.subscriptions ?? false,
        trades: preferences.sms?.trades ?? true,
        wallet: preferences.sms?.wallet ?? true,
        market: preferences.sms?.market ?? false,
      },
    };
    saveStore();
  }

  res.json({
    message: 'Notification preferences updated successfully',
    preferences: user.notificationPreferences,
  });
});

// ── 13. Notification History Log (/api/auth/notifications/history) ──────────
router.get('/notifications/history', protect, (req, res) => {
  try {
    const logs = (store.notificationLogs || [])
      .filter(l => l.userId === req.user._id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── 14. Logout (/api/auth/logout) ──────────────────────────────────────────
router.post('/logout', (req, res) => {
  const isSecure = isSecureRequest(req);
  res.clearCookie('token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

export default router;
