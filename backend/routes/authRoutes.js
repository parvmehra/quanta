import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { protect } from '../middlewares/auth.js';
import { requireDb } from '../middlewares/requireDb.js';
import User from '../models/User.js';
import NotificationLog from '../models/NotificationLog.js';
import { notifyUser } from '../services/notificationService.js';
import { sendPhoneVerificationOtp, verifyPhoneOtp } from '../services/smsService.js';
import admin from '../config/firebase.js';
import { JWT_SECRET, IS_PRODUCTION } from '../config/env.js';
import { sixDigitCode, hashCode, safeEqualHex } from '../utils/codes.js';

const router = express.Router();
router.use(requireDb);

const limiter = (windowMin, max, message) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  max,
  message: { message },
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = limiter(15, 20, 'Too many authentication attempts. Please try again after 15 minutes.');
const verifyLimiter = limiter(15, 15, 'Too many verification attempts. Please try again later.');
const otpLimiter = limiter(10, 6, 'Too many code requests. Please try again later.');

const DAY = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const debugOnly = (code) => (IS_PRODUCTION ? undefined : code);

const isSecureRequest = (req) => IS_PRODUCTION || req.secure || req.headers['x-forwarded-proto'] === 'https';
const generateToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });

const setAuthCookie = (req, res, token) => {
  const secure = isSecureRequest(req);
  res.cookie('token', token, { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', maxAge: 7 * DAY });
};

const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 128) return 'Password is too long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
};

const validateEmailFormat = (email) => {
  if (!email || typeof email !== 'string' || email.length > 254) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim().toLowerCase());
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role || 'user',
  isEmailVerified: !!user.isEmailVerified,
  phone: user.phone || '',
  isPhoneVerified: !!user.isPhoneVerified,
  phonePromptDismissed: !!user.phonePromptDismissed,
  notificationPreferences: user.notificationPreferences,
});

const clientInfo = (req) => ({
  ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  userAgent: req.headers['user-agent'] || 'Web Browser',
});

async function issueEmailVerification(user) {
  const code = sixDigitCode();
  user.emailVerificationToken = hashCode(code);
  user.emailVerificationExpires = Date.now() + DAY;
  await user.save();
  await notifyUser(user, 'EMAIL_VERIFICATION', { token: code });
  return code;
}

async function issueLoginOtp(user) {
  const code = sixDigitCode();
  user.loginOtp = hashCode(code);
  user.loginOtpExpires = Date.now() + 10 * 60 * 1000;
  user.loginOtpAttempts = 0;
  await user.save();
  await notifyUser(user, 'LOGIN_OTP', { otp: code });
  return code;
}

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: formatUserResponse(user) });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/signup', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};
  try {
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Please provide a valid full name.' });
    }
    if (!validateEmailFormat(email)) return res.status(400).json({ message: 'Please provide a valid email address.' });
    const pwdError = validatePasswordStrength(password);
    if (pwdError) return res.status(400).json({ message: pwdError });

    const normalizedEmail = normalizeEmail(email);
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (existing.isEmailVerified) {
        return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
      }
      const code = await issueEmailVerification(existing);
      return res.status(200).json({
        requiresVerification: true,
        email: existing.email,
        message: 'A fresh verification code has been sent to your email address.',
        debugCode: debugOnly(code),
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
    });
    const code = await issueEmailVerification(user);
    await notifyUser(user, 'SIGNUP_WELCOME');

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      message: 'Registration successful! We have sent a verification code to your email.',
      debugCode: debugOnly(code),
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
    console.error('Registration error:', err.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

router.post('/verify-email', verifyLimiter, async (req, res) => {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ message: 'Email and verification code are required.' });

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(400).json({ message: 'Invalid verification request.' });

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'This account is already verified. Please sign in.' });
    }
    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      return res.status(400).json({ message: 'No pending verification found. Please request a new code.' });
    }
    if (Date.now() > user.emailVerificationExpires) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }
    if (!safeEqualHex(hashCode(token), user.emailVerificationToken)) {
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    user.lastLogin = Date.now();
    if (!user.welcomeEmailSent) {
      user.welcomeEmailSent = true;
      await notifyUser(user, 'WELCOME');
    }
    await user.save();
    await notifyUser(user, 'LOGIN_ALERT', clientInfo(req));

    const jwtToken = generateToken(user._id);
    setAuthCookie(req, res, jwtToken);
    res.json({ message: 'Email verified successfully! Welcome to Quanta.', token: jwtToken, user: formatUserResponse(user) });
  } catch (err) {
    console.error('Email verification error:', err.message);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

router.post('/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!validateEmailFormat(email)) return res.status(400).json({ message: 'Please provide a valid email address.' });

  const generic = { message: 'If an unverified account exists, a new verification code has been sent.' };
  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || user.isEmailVerified) return res.json(generic);
    const code = await issueEmailVerification(user);
    res.json({ ...generic, debugCode: debugOnly(code) });
  } catch (err) {
    console.error('Resend verification error:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required.' });

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(400).json({ message: 'Invalid credentials.' });

    if (user.lockoutUntil && Date.now() < user.lockoutUntil) {
      const waitMins = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
      return res.status(429).json({ message: `Account temporarily locked due to repeated failed logins. Please try again in ${waitMins} minutes.` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = Date.now() + 15 * 60 * 1000;
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    if (!user.isEmailVerified) {
      const code = await issueEmailVerification(user);
      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message: 'Your email address has not been verified yet. A verification code has been dispatched.',
        debugCode: debugOnly(code),
      });
    }

    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    const otp = await issueLoginOtp(user);

    res.json({
      requiresOtp: true,
      email: user.email,
      message: 'A 6-digit login verification code has been dispatched to your email.',
      debugCode: debugOnly(otp),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

router.post('/verify-login-otp', authLimiter, async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ message: 'Email and 6-digit verification code are required.' });

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !user.loginOtp || !user.loginOtpExpires) {
      return res.status(400).json({ message: 'No pending login code found. Please log in again.' });
    }
    if (Date.now() > user.loginOtpExpires) {
      user.loginOtp = null;
      user.loginOtpExpires = null;
      await user.save();
      return res.status(400).json({ message: 'Verification code has expired. Please log in again.' });
    }
    if (!safeEqualHex(hashCode(otp), user.loginOtp)) {
      user.loginOtpAttempts = (user.loginOtpAttempts || 0) + 1;
      if (user.loginOtpAttempts >= MAX_CODE_ATTEMPTS) {
        user.loginOtp = null;
        user.loginOtpExpires = null;
        user.loginOtpAttempts = 0;
        await user.save();
        return res.status(400).json({ message: 'Too many incorrect codes. Please log in again to get a new one.' });
      }
      await user.save();
      return res.status(400).json({ message: 'Invalid verification code. Please check your email.' });
    }

    user.loginOtp = null;
    user.loginOtpExpires = null;
    user.loginOtpAttempts = 0;
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    user.lastLogin = Date.now();
    if (!user.welcomeEmailSent) {
      user.welcomeEmailSent = true;
      await notifyUser(user, 'WELCOME');
    }
    await user.save();
    await notifyUser(user, 'LOGIN_ALERT', clientInfo(req));

    const token = generateToken(user._id);
    setAuthCookie(req, res, token);
    res.json({ token, user: formatUserResponse(user) });
  } catch (err) {
    console.error('Verify login OTP error:', err.message);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

router.post('/resend-login-otp', otpLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!validateEmailFormat(email)) return res.status(400).json({ message: 'Email address is required.' });

  const generic = { success: true, message: 'If the account exists, a fresh login verification code has been sent.' };
  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !user.isEmailVerified) return res.json(generic);
    const otp = await issueLoginOtp(user);
    res.json({ ...generic, debugCode: debugOnly(otp) });
  } catch (err) {
    console.error('Resend login OTP error:', err.message);
    res.status(500).json({ message: 'Server error resending code.' });
  }
});

router.post('/google', authLimiter, async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(503).json({ message: 'Google sign-in is not configured on this server.' });
    }
    if (!req.body?.idToken || typeof req.body.idToken !== 'string') {
      return res.status(400).json({ message: 'A Google authentication token is required.' });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(req.body.idToken);
    } catch {
      return res.status(401).json({ message: 'Invalid Google authentication token.' });
    }
    if (!decoded.email || decoded.email_verified !== true) {
      return res.status(401).json({ message: 'Your Google account email is not verified.' });
    }

    const email = normalizeEmail(decoded.email);
    const name = (decoded.name || email.split('@')[0] || 'Google User').slice(0, 100);
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId: decoded.uid,
        picture: decoded.picture || '',
        password: await bcrypt.hash(sixDigitCode() + decoded.uid, 10),
        isEmailVerified: true,
        welcomeEmailSent: true,
        lastLogin: Date.now(),
      });
      await notifyUser(user, 'WELCOME');
    } else {
      user.isEmailVerified = true;
      user.lastLogin = Date.now();
      if (!user.googleId) user.googleId = decoded.uid;
      if (decoded.picture) user.picture = decoded.picture;
      if (!user.welcomeEmailSent) {
        user.welcomeEmailSent = true;
        await notifyUser(user, 'WELCOME');
      }
      await user.save();
    }

    const token = generateToken(user._id);
    setAuthCookie(req, res, token);
    await notifyUser(user, 'LOGIN_ALERT', clientInfo(req));

    res.json({
      token,
      user: formatUserResponse(user),
      requiresPhoneOnboarding: !user.isPhoneVerified && !user.phonePromptDismissed,
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ message: 'Server error during Google authentication.' });
  }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!validateEmailFormat(email)) return res.status(400).json({ message: 'Please provide a valid email address.' });

  const generic = { message: 'If an account matches that email, a password recovery code has been sent.' };
  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) return res.json(generic);

    const code = sixDigitCode();
    user.resetPasswordToken = hashCode(code);
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000;
    user.resetPasswordAttempts = 0;
    await user.save();
    await notifyUser(user, 'PASSWORD_RESET', { resetToken: code });

    res.json({ ...generic, debugCode: debugOnly(code) });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/reset-password', verifyLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) return res.status(400).json({ message: 'Email, token, and new password are required.' });
  const pwdError = validatePasswordStrength(newPassword);
  if (pwdError) return res.status(400).json({ message: pwdError });

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Invalid or expired password reset request.' });
    }
    if (Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Password reset code has expired. Please request a new one.' });
    }
    if (!safeEqualHex(hashCode(token), user.resetPasswordToken)) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      if (user.resetPasswordAttempts >= MAX_CODE_ATTEMPTS) {
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.resetPasswordAttempts = 0;
      }
      await user.save();
      return res.status(400).json({ message: 'Invalid password reset code.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.resetPasswordAttempts = 0;
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    res.json({ message: 'Password has been successfully updated. You may now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

router.post('/phone/send-otp', protect, otpLimiter, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ message: 'Phone number is required.' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(await sendPhoneVerificationOtp(user, phone));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/phone/verify-otp', protect, verifyLimiter, async (req, res) => {
  const { otp } = req.body || {};
  if (!otp) return res.status(400).json({ message: 'Verification OTP code is required.' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const result = await verifyPhoneOtp(user, otp);
    res.json({ ...result, user: formatUserResponse(user) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/phone/dismiss-prompt', protect, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $set: { phonePromptDismissed: true } });
    res.json({ message: 'Mobile onboarding dismissed' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/preferences', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      preferences: user.notificationPreferences,
      isEmailVerified: !!user.isEmailVerified,
      isPhoneVerified: !!user.isPhoneVerified,
      phone: user.phone || '',
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/preferences', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const prefs = req.body?.preferences;
    if (prefs && typeof prefs === 'object') {
      for (const channel of ['email', 'sms']) {
        for (const key of ['security', 'subscriptions', 'trades', 'wallet', 'market']) {
          const v = prefs[channel]?.[key];
          if (typeof v === 'boolean') user.notificationPreferences[channel][key] = v;
        }
      }
      user.markModified('notificationPreferences');
      await user.save();
    }
    res.json({ message: 'Notification preferences updated successfully', preferences: user.notificationPreferences });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/notifications/history', protect, async (req, res) => {
  try {
    const logs = await NotificationLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(logs);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  const secure = isSecureRequest(req);
  res.clearCookie('token', { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
