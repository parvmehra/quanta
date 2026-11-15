import 'dotenv/config';
import twilio from 'twilio';
import crypto from 'crypto';
import NotificationLog from '../models/NotificationLog.js';
import { safeLogContent } from '../utils/logSafe.js';
import { IS_PRODUCTION } from '../config/env.js';
import { sixDigitCode, hashCode, safeEqualHex } from '../utils/codes.js';
import { log } from '../utils/logger.js';

let twilioClient = null;
let hasTwilioCredentials = false;

export const initTwilio = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (accountSid && authToken && accountSid.startsWith('AC')) {
    try {
      twilioClient = twilio(accountSid, authToken);
      hasTwilioCredentials = true;
      log.info('Twilio SMS: Initialized with verified credentials');
    } catch (err) {
      log.error('Twilio initialization failed:', err.message);
      hasTwilioCredentials = false;
    }
  } else {
    hasTwilioCredentials = false;
    log.info('Twilio SMS: Running in Simulated Mode (logs to the database)');
  }
};

initTwilio();

export const isValidE164 = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const clean = phone.trim();
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(clean);
};

const logSms = (userId, eventType, recipient, message, status, referenceId = null) => {
  try {
    const log = {
      _id: crypto.randomUUID(),
      userId,
      channel: 'sms',
      eventType,
      recipient,
      title: 'SMS Alert',
      message: safeLogContent(eventType, 'SMS Alert', message).message,
      status,
      referenceId: referenceId || crypto.randomUUID(),
      createdAt: Date.now(),
    };
    NotificationLog.create(log).catch((err) => log.error('Failed to log SMS notification:', err.message));
  } catch (err) {
    log.error('Failed to log SMS notification:', err);
  }
};

export const sendSms = async ({ to, message, userId = null, eventType = 'GENERAL', referenceId = null }) => {
  if (!isValidE164(to)) {
    log.warn(`Invalid E.164 format for phone: ${to}`);
    logSms(userId, eventType, to, message, 'FAILED_INVALID_NUMBER', referenceId);
    return { success: false, error: 'Invalid international phone number format (must be E.164, e.g. +14155552671)' };
  }

  if (!hasTwilioCredentials || !twilioClient) {
    log.info(`\n[SIMULATED SMS] To: ${to}`);
    log.info(`Message: "${message}"\n`);
    logSms(userId, eventType, to, message, 'SIMULATED', referenceId);
    return { success: true, simulated: true, sid: 'sim_sms_' + Date.now() };
  }

  try {
    const payload = {
      to,
      body: `Quanta: ${message}`,
    };

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      payload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else if (process.env.TWILIO_PHONE_NUMBER) {
      payload.from = process.env.TWILIO_PHONE_NUMBER;
    } else {
      payload.from = '+15005550006';
    }

    const res = await twilioClient.messages.create(payload);
    logSms(userId, eventType, to, message, 'SENT', referenceId || res.sid);
    return { success: true, sid: res.sid };
  } catch (err) {
    log.error('Twilio SMS Error:', err.message);
    logSms(userId, eventType, to, message, 'FAILED', referenceId);
    return { success: false, error: err.message };
  }
};

export const sendPhoneVerificationOtp = async (user, phoneNumber) => {
  if (!isValidE164(phoneNumber)) {
    throw new Error('Please enter a valid international mobile number in E.164 format (e.g. +14155552671 or +919876543210)');
  }

  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000;
  const EXPIRY_MS = 10 * 60 * 1000;

  if (user.phoneOtpLastSent && now - user.phoneOtpLastSent < COOLDOWN_MS) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - (now - user.phoneOtpLastSent)) / 1000);
    throw new Error(`Please wait ${waitSeconds} seconds before requesting a new OTP code`);
  }

  const otpCode = sixDigitCode();
  const hashedOtp = hashCode(otpCode);

  user.phone = phoneNumber;
  user.phoneVerificationOtp = hashedOtp;
  user.phoneOtpExpires = now + EXPIRY_MS;
  user.phoneOtpAttempts = 0;
  user.phoneOtpLastSent = now;
  await user.save();

  const smsText = `Your Quanta mobile verification code is: ${otpCode}. Valid for 10 minutes. Do not share this code.`;
  const result = await sendSms({
    to: phoneNumber,
    message: smsText,
    userId: user._id,
    eventType: 'PHONE_VERIFICATION_OTP',
  });

  const isFallbackNeeded = !result.success || result.simulated;
  if (!result.success) {
    log.warn(`Twilio SMS dispatch failed (${result.error}). Providing fallback OTP: ${otpCode}`);
  }

  return {
    success: true,
    simulated: !!result.simulated,
    debugOtp: isFallbackNeeded && !IS_PRODUCTION ? otpCode : undefined,
    message: result.success
      ? `Verification code sent to ${phoneNumber}`
      : IS_PRODUCTION ? 'The SMS could not be delivered. Please try again later.' : `Twilio delivery failed (${result.error}). Dev OTP provided: ${otpCode}`,
  };
};

export const verifyPhoneOtp = async (user, inputOtp) => {
  if (!user.phoneVerificationOtp || !user.phoneOtpExpires) {
    throw new Error('No pending OTP request found. Please request a new code.');
  }

  const now = Date.now();
  if (now > user.phoneOtpExpires) {
    user.phoneVerificationOtp = null;
    user.phoneOtpExpires = null;
    await user.save();
    throw new Error('OTP code has expired. Please request a new verification code.');
  }

  if ((user.phoneOtpAttempts || 0) >= 4) {
    user.phoneVerificationOtp = null;
    user.phoneOtpExpires = null;
    await user.save();
    throw new Error('Too many failed attempts. Please request a new verification code.');
  }

  if (!safeEqualHex(hashCode(inputOtp), user.phoneVerificationOtp)) {
    user.phoneOtpAttempts = (user.phoneOtpAttempts || 0) + 1;
    await user.save();
    throw new Error('Invalid OTP code. Please check and try again.');
  }

  user.isPhoneVerified = true;
  user.phoneVerificationOtp = null;
  user.phoneOtpExpires = null;
  user.phoneOtpAttempts = 0;
  await user.save();

  await sendSms({
    to: user.phone,
    message: 'Your mobile number has been successfully verified for Quanta account alerts.',
    userId: user._id,
    eventType: 'PHONE_VERIFIED',
  });

  return { success: true, message: 'Mobile number verified successfully!' };
};

export const sendStockSubscriptionSMS = async (phoneNumber, symbol, companyName, userId) => {
  return sendSms({
    to: phoneNumber,
    message: `Subscribed! You are now receiving alerts for ${symbol} (${companyName || symbol}). Manage preferences in your Quanta profile.`,
    userId,
    eventType: 'STOCK_SUBSCRIPTION',
  });
};

export const sendTradeConfirmationSMS = async (phoneNumber, tradeDetails, userId) => {
  const { symbol, shares, price, total, type, referenceId } = tradeDetails;
  return sendSms({
    to: phoneNumber,
    message: `Trade Executed: ${type} ${shares} ${symbol} @ $${price} (Total: $${total}). Ref: ${referenceId.slice(0, 8)}. Mode: Paper Trading.`,
    userId,
    eventType: 'STOCK_PURCHASE',
    referenceId,
  });
};

export const sendWalletTopupSMS = async (phoneNumber, amount, newBalance, referenceId, userId) => {
  return sendSms({
    to: phoneNumber,
    message: `Wallet Credited: +$${amount}. New available trading balance: $${newBalance}. Ref: ${referenceId.slice(0, 8)}.`,
    userId,
    eventType: 'WALLET_TOPUP',
    referenceId,
  });
};
