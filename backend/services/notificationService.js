import {
  sendVerificationEmail,
  sendLoginOtpEmail,
  sendWelcomeEmail,
  sendSignupWelcomeEmail,
  sendLoginAlertEmail,
  sendStockSubscriptionEmail,
  sendTradeConfirmationEmail,
  sendWalletTopupEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from './emailService.js';
import {
  sendStockSubscriptionSMS,
  sendTradeConfirmationSMS,
  sendWalletTopupSMS,
  sendSms,
} from './smsService.js';

const processedEvents = new Map();

const isEventProcessed = (referenceId) => {
  if (!referenceId) return false;
  if (processedEvents.has(referenceId)) return true;
  processedEvents.set(referenceId, Date.now());

  if (processedEvents.size > 2000) {
    const oneHourAgo = Date.now() - 3600000;
    for (const [k, v] of processedEvents.entries()) {
      if (v < oneHourAgo) processedEvents.delete(k);
    }
  }
  return false;
};

export const notifyUser = async (user, eventType, data = {}) => {
  if (!user) return;

  const referenceId = data.referenceId || `${user._id}_${eventType}_${Date.now()}`;
  if (data.referenceId && isEventProcessed(data.referenceId)) {
    console.log(`ℹ️ Notification for reference ${data.referenceId} already processed (idempotent skipped)`);
    return { skipped: true, reason: 'Duplicate event' };
  }

  const prefs = user.notificationPreferences || {
    email: { security: true, subscriptions: true, trades: true, wallet: true, market: false },
    sms: { security: true, subscriptions: false, trades: true, wallet: true, market: false },
  };

  const results = { email: null, sms: null };

  const shouldSendEmail = Boolean(user.email);
  try {
    switch (eventType) {
      case 'EMAIL_VERIFICATION':
        results.email = await sendVerificationEmail({
          toEmail: user.email,
          name: user.name,
          token: data.token,
          userId: user._id,
        });
        break;

      case 'LOGIN_OTP':
        results.email = await sendLoginOtpEmail({
          toEmail: user.email,
          name: user.name,
          otp: data.otp,
          userId: user._id,
        });
        break;

      case 'WELCOME':
        if (shouldSendEmail && user.isEmailVerified) {
          results.email = await sendWelcomeEmail({
            toEmail: user.email,
            name: user.name,
            userId: user._id,
          });
        }
        break;

      case 'SIGNUP_WELCOME':
        if (shouldSendEmail) {
          results.email = await sendSignupWelcomeEmail({
            toEmail: user.email,
            name: user.name,
            userId: user._id,
          });
        }
        break;

      case 'LOGIN_ALERT':
        if (shouldSendEmail) {
          results.email = await sendLoginAlertEmail({
            toEmail: user.email,
            name: user.name,
            ip: data.ip,
            userAgent: data.userAgent,
            userId: user._id,
          });
        }
        break;

      case 'STOCK_SUBSCRIPTION':
        if (shouldSendEmail && prefs.email?.subscriptions) {
          results.email = await sendStockSubscriptionEmail({
            toEmail: user.email,
            name: user.name,
            symbol: data.symbol,
            companyName: data.companyName,
            price: data.price,
            userId: user._id,
          });
        }
        break;

      case 'STOCK_PURCHASE':
        if (shouldSendEmail && prefs.email?.trades) {
          results.email = await sendTradeConfirmationEmail({
            toEmail: user.email,
            name: user.name,
            tradeDetails: data.tradeDetails,
            userId: user._id,
          });
        }
        break;

      case 'WALLET_TOPUP':
        if (shouldSendEmail && prefs.email?.wallet) {
          results.email = await sendWalletTopupEmail({
            toEmail: user.email,
            name: user.name,
            amount: data.amount,
            newBalance: data.newBalance,
            referenceId,
            method: data.method,
            userId: user._id,
          });
        }
        break;

      case 'PASSWORD_CHANGED':
        results.email = await sendPasswordChangedEmail({
          toEmail: user.email,
          name: user.name,
          ip: data.ip,
          userAgent: data.userAgent,
          userId: user._id,
        });
        break;

      case 'PASSWORD_RESET':
        results.email = await sendPasswordResetEmail({
          toEmail: user.email,
          name: user.name,
          resetToken: data.resetToken,
          userId: user._id,
        });
        break;

      default:
        break;
    }
  } catch (err) {
    console.error(`Email dispatch error for ${eventType}:`, err.message);
  }

  const shouldSendSms = user.phone && user.isPhoneVerified;
  try {
    if (shouldSendSms) {
      switch (eventType) {
        case 'STOCK_SUBSCRIPTION':
          if (prefs.sms?.subscriptions) {
            results.sms = await sendStockSubscriptionSMS(user.phone, data.symbol, data.companyName, user._id);
          }
          break;

        case 'STOCK_PURCHASE':
          if (prefs.sms?.trades) {
            results.sms = await sendTradeConfirmationSMS(user.phone, data.tradeDetails, user._id);
          }
          break;

        case 'WALLET_TOPUP':
          if (prefs.sms?.wallet) {
            results.sms = await sendWalletTopupSMS(user.phone, data.amount, data.newBalance, referenceId, user._id);
          }
          break;

        case 'LOGIN_ALERT':
          if (prefs.sms?.security) {
            results.sms = await sendSms({
              to: user.phone,
              message: `Security Notice: A new sign-in to your Quanta account was detected at ${new Date().toLocaleTimeString()}.`,
              userId: user._id,
              eventType: 'LOGIN_ALERT',
              referenceId,
            });
          }
          break;

        default:
          break;
      }
    }
  } catch (err) {
    console.error(`SMS dispatch error for ${eventType}:`, err.message);
  }

  return results;
};
