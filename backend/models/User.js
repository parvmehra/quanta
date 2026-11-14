import mongoose from 'mongoose';
import crypto from 'crypto';

const channelPrefs = (security, subscriptions) => ({
  security: { type: Boolean, default: security },
  subscriptions: { type: Boolean, default: subscriptions },
  trades: { type: Boolean, default: true },
  wallet: { type: Boolean, default: true },
  market: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    emailVerificationExpires: { type: Number, default: null },
    welcomeEmailSent: { type: Boolean, default: false },

    loginOtp: { type: String, default: null },
    loginOtpExpires: { type: Number, default: null },
    loginOtpAttempts: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Number, default: null },
    lastLogin: { type: Number, default: null },

    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Number, default: null },
    resetPasswordAttempts: { type: Number, default: 0 },

    googleId: { type: String, default: null },
    picture: { type: String, default: '' },

    phone: { type: String, default: '' },
    isPhoneVerified: { type: Boolean, default: false },
    phonePromptDismissed: { type: Boolean, default: false },
    phoneVerificationOtp: { type: String, default: null },
    phoneOtpExpires: { type: Number, default: null },
    phoneOtpAttempts: { type: Number, default: 0 },
    phoneOtpLastSent: { type: Number, default: null },

    notificationPreferences: {
      email: channelPrefs(true, true),
      sms: channelPrefs(true, false),
    },
  },
  { timestamps: true, minimize: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { sparse: true });

export default mongoose.model('User', userSchema);
