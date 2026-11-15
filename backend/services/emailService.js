import nodemailer from 'nodemailer';
import crypto from 'crypto';
import NotificationLog from '../models/NotificationLog.js';
import { safeLogContent } from '../utils/logSafe.js';
import { log } from '../utils/logger.js';

let transporter = null;
let isSimulated = false;

const initTransporter = async () => {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASS,
        },
      });
      isSimulated = false;
      log.info(`Nodemailer: Configured with Gmail (${process.env.GMAIL_USER})`);
      return;
    } catch (err) {
      log.warn('Gmail transport init failed, falling back to simulated mode:', err.message);
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      isSimulated = false;
      log.info(`Nodemailer: Configured with custom SMTP provider (${process.env.SMTP_HOST})`);
      return;
    } catch (err) {
      log.warn('SMTP transport init failed, falling back to simulated mode:', err.message);
    }
  }

  isSimulated = true;
  log.info('Nodemailer: Running in Simulated Mode (logs to the database, codes returned in development)');
};

initTransporter();

const getFromAddress = () => {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (process.env.SMTP_USER) return `"Quanta" <${process.env.SMTP_USER}>`;
  if (process.env.GMAIL_USER) return `"Quanta" <${process.env.GMAIL_USER}>`;
  return '"Quanta" <no-reply@quanta.local>';
};

const getAppBaseUrl = () => {
  return process.env.APP_BASE_URL || 'http://localhost:5173';
};

const emailHeader = (title) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b110e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 600px; margin: 30px auto; background-color: #121915; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { padding: 26px 32px; background: linear-gradient(180deg, #16221c 0%, #121915 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.06); text-align: left; }
    .logo { display: inline-flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; color: #ffffff; text-decoration: none; letter-spacing: -0.02em; }
    .logo-badge { background: #22c55e; color: #052e16; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
    .body { padding: 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1; }
    .h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    .card-box { background-color: #0c120f; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 10px; padding: 20px; margin: 24px 0; }
    .code-badge { font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #22c55e; text-align: center; display: block; margin: 12px 0; }
    .btn { display: inline-block; background-color: #22c55e; color: #042e16 !important; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 18px 0; text-align: center; }
    .footer { padding: 24px 32px; background-color: #0c120f; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; }
    .table-details { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table-details td { padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; }
    .table-details td.label { color: #8da194; width: 40%; }
    .table-details td.val { color: #ffffff; font-weight: 600; text-align: right; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .pill-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .pill-red { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">
        <span style="color: #22c55e; font-size: 22px;">▲</span> Quanta
        <span class="logo-badge">FINTECH</span>
      </div>
    </div>
    <div class="body">
`;

const emailFooter = `
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;">Quanta Financial Technologies Inc. • Global Markets & Portfolio Analytics</p>
      <p style="margin: 0;">This is an automated notification. For support or queries, visit the Quanta FAQ & Help Centre.</p>
    </div>
  </div>
</body>
</html>
`;

const logNotification = (userId, channel, eventType, recipient, title, message, status, referenceId = null) => {
  try {
    const safe = safeLogContent(eventType, title, message);
    const log = {
      _id: crypto.randomUUID(),
      userId,
      channel,
      eventType,
      recipient,
      title: safe.title,
      message: safe.message,
      status,
      referenceId: referenceId || crypto.randomUUID(),
      createdAt: Date.now(),
    };
    NotificationLog.create(log).catch((err) => log.error('Failed to save notification log:', err.message));
  } catch (err) {
    log.error('Failed to save notification log:', err);
  }
};

export const sendMail = async ({ to, subject, html, text, userId = null, eventType = 'GENERAL', referenceId = null }) => {
  try {
    if (!transporter) await initTransporter();

    const mailOptions = {
      from: getFromAddress(),
      to,
      subject,
      html,
      text,
    };

    if (isSimulated || !transporter) {
      log.info(`\n[SIMULATED EMAIL] To: ${to} | Subject: ${subject}`);
      log.info(`Preview: ${text?.slice(0, 140)}...\n`);
      logNotification(userId, 'email', eventType, to, subject, text, 'SIMULATED', referenceId);
      return { success: true, simulated: true, messageId: 'sim_' + Date.now() };
    }

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      log.info(`Ethereal Email Preview: ${previewUrl}`);
    }

    logNotification(userId, 'email', eventType, to, subject, text, 'SENT', referenceId);
    return { success: true, messageId: info.messageId, previewUrl };
  } catch (err) {
    log.error('Email sending failed:', err.message);
    logNotification(userId, 'email', eventType, to, subject, text, 'FAILED', referenceId);
    return { success: false, error: err.message };
  }
};

export const sendVerificationEmail = async ({ toEmail, name, token, userId }) => {
  const verifyLink = `${getAppBaseUrl()}/login?verifyToken=${encodeURIComponent(token)}&email=${encodeURIComponent(toEmail)}`;
  const subject = 'Verify your Quanta account';
  const text = `Hi ${name},\n\nWelcome to Quanta! Please verify your email address to activate your account.\n\nYour 6-digit verification code is: ${token}\n\nOr click this link to verify: ${verifyLink}\n\nThis verification code will expire in 24 hours.\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Verify your email address</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Thank you for creating your account on Quanta. To access the global stock screener, trade simulator, and portfolio management tools, please verify your email address.</p>
      
      <div class="card-box" style="text-align: center;">
        <span style="font-size: 13px; color: #8da194; text-transform: uppercase; letter-spacing: 0.05em;">Your Verification Code</span>
        <span class="code-badge">${token}</span>
        <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">Expires in 24 hours • Never share this code</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${verifyLink}" class="btn">Verify Email Address →</a>
      </div>

      <p style="font-size: 13px; color: #8da194;">If you did not register for an account on Quanta, you can safely ignore this email.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'EMAIL_VERIFICATION' });
};

export const sendLoginOtpEmail = async ({ toEmail, name, otp, userId }) => {
  const subject = `Your Quanta One-Time Login Code: ${otp}`;
  const text = `Hi ${name || 'Trader'},\n\nYour one-time login verification code for Quanta is: ${otp}\n\nThis code is valid for 10 minutes. If you did not request this login code, you can safely ignore this email.\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Your Login Verification Code</h1>
      <p>Hi <strong>${name || 'Trader'}</strong>,</p>
      <p>Use the 6-digit one-time passcode below to securely log in to your Quanta account:</p>
      
      <div class="card-box" style="text-align: center; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.3);">
        <span style="font-size: 13px; color: #8da194; text-transform: uppercase; letter-spacing: 0.06em;">One-Time Login Code</span>
        <span class="code-badge" style="font-size: 34px; letter-spacing: 8px; margin: 16px 0; color: #22c55e;">${otp}</span>
        <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">⏱️ Valid for 10 minutes &bull; Do not share this code with anyone</p>
      </div>

      <p style="font-size: 13px; color: #8da194;">If you did not attempt to sign in to Quanta, please disregard this email or review your account security.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'LOGIN_OTP' });
};

export const sendWelcomeEmail = async ({ toEmail, name, userId }) => {
  const dashboardLink = `${getAppBaseUrl()}/analyzer`;
  const tradeLink = `${getAppBaseUrl()}/trade/AAPL`;
  const portfolioLink = `${getAppBaseUrl()}/portfolio`;
  const subject = `Welcome to Quanta, ${name || 'Trader'}! Your Terminal is Ready 🚀`;

  const text = `Hi ${name || 'Trader'},

Welcome to Quanta! Your institutional-grade market terminal account is fully activated.

WHAT HAS BEEN PROVISIONED FOR YOU:
• Virtual Trading Balance: $500,000.00 USD (Paper Trading)
• Global Market Feeds: NASDAQ, NYSE, NSE, BSE
• AI Intelligence: Google Gemini Market Advisor
• Live Analytics: Real-time WebSockets & Screener

LAUNCH YOUR TERMINAL:
${dashboardLink}

Start trading AAPL or Indian equities (e.g. RELIANCE.NS, TCS.NS) risk-free today!

Best regards,
The Quanta Team
${getAppBaseUrl()}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; background-color: #080d0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 12px !important; }
      .content { padding: 20px !important; }
      .bento-cell { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #080d0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">

  <!-- Outer Canvas -->
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #080d0b; padding: 32px 0;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #0f1613; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 36px; background: linear-gradient(180deg, #15221b 0%, #0f1613 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                      <span style="color: #22c55e;">▲</span> Quanta
                    </span>
                    <span style="display: inline-block; margin-left: 8px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; vertical-align: middle; letter-spacing: 0.06em;">TERMINAL</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background: rgba(255, 255, 255, 0.05); color: #94a3b8; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 600;">
                      <span style="color: #22c55e; font-size: 14px; vertical-align: -1px;">●</span> Live Markets
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Greeting -->
          <tr>
            <td class="content" style="padding: 36px 36px 20px 36px;">
              <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #22c55e; text-transform: uppercase; letter-spacing: 0.08em;">Welcome Aboard</p>
              <h1 style="margin: 0 0 16px 0; font-size: 26px; font-weight: 800; color: #ffffff; line-height: 1.3;">
                Welcome to Quanta, ${name || 'Trader'}! 🎉
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                Your account is verified and ready. You now have instant access to our next-generation stock screener, real-time market feeds across global & Indian bourses, and a risk-free paper trading engine.
              </p>

              <!-- Provisioned Capital Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(15, 23, 42, 0.4) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #86efac;">Provisioned Paper Trading Capital</span>
                          <div style="font-size: 32px; font-weight: 900; color: #ffffff; margin: 4px 0; letter-spacing: -0.02em;">$500,000.00 <span style="font-size: 14px; font-weight: 600; color: #22c55e;">USD</span></div>
                          <span style="font-size: 12px; color: #94a3b8;">Virtual margin ready for market & limit orders with zero financial risk.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature Highlights Bento Grid -->
              <h3 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em;">What You Can Do Right Now</h3>
              
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <!-- Row 1 -->
                <tr>
                  <td class="bento-cell" width="48%" style="padding: 16px; background-color: #141d18; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; vertical-align: top;">
                    <div style="font-size: 20px; margin-bottom: 6px;">📈</div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Global Stock Screener</div>
                    <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Screen live US tickers (NASDAQ, NYSE) and Indian equities (NSE, BSE) with sparklines and interactive timeframes.</div>
                  </td>
                  <td width="4%">&nbsp;</td>
                  <td class="bento-cell" width="48%" style="padding: 16px; background-color: #141d18; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; vertical-align: top;">
                    <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Simulated Trading Terminal</div>
                    <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Execute instant buy and sell orders, test investment strategies, and track your profit & loss in real-time.</div>
                  </td>
                </tr>
                <!-- Spacer -->
                <tr><td height="12" colspan="3"></td></tr>
                <!-- Row 2 -->
                <tr>
                  <td class="bento-cell" width="48%" style="padding: 16px; background-color: #141d18; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; vertical-align: top;">
                    <div style="font-size: 20px; margin-bottom: 6px;">🤖</div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Gemini AI Market Advisor</div>
                    <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Get instant AI financial insights, company earnings analysis, and sentiment signals powered by Google Gemini.</div>
                  </td>
                  <td width="4%">&nbsp;</td>
                  <td class="bento-cell" width="48%" style="padding: 16px; background-color: #141d18; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; vertical-align: top;">
                    <div style="font-size: 20px; margin-bottom: 6px;">🔔</div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Real-Time Price & SMS Alerts</div>
                    <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Stay informed with live trade executions, security alerts, and custom stock price movement notifications.</div>
                  </td>
                </tr>
              </table>

              <!-- Call to Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${dashboardLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #042e16; font-size: 15px; font-weight: 800; text-decoration: none; padding: 15px 36px; border-radius: 10px; box-shadow: 0 8px 24px rgba(34, 197, 94, 0.35); letter-spacing: -0.01em;">
                      Launch Quanta Terminal &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Quick Start Tip -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b110e; border: 1px dashed rgba(255, 255, 255, 0.12); border-radius: 10px; margin-bottom: 12px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.6;">
                      💡 <strong style="color: #ffffff;">Quick Tip:</strong> Search for top Indian stocks by typing <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #86efac; font-family: monospace;">RELIANCE.NS</code>, <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #86efac; font-family: monospace;">TCS.NS</code>, or US giants like <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #86efac; font-family: monospace;">NVDA</code> and <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #86efac; font-family: monospace;">AAPL</code>.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #090e0c; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                Quanta Financial Technologies Inc. &bull; Global Market Intelligence & Simulated Trading
              </p>
              <p style="margin: 0 0 12px 0; font-size: 12px; color: #475569;">
                <a href="${dashboardLink}" style="color: #22c55e; text-decoration: none; margin: 0 8px;">Stock Screener</a> &bull;
                <a href="${tradeLink}" style="color: #22c55e; text-decoration: none; margin: 0 8px;">Paper Trading</a> &bull;
                <a href="${portfolioLink}" style="color: #22c55e; text-decoration: none; margin: 0 8px;">Portfolio</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                This email was sent to <span style="color: #94a3b8;">${toEmail}</span> because you created an account on Quanta. If this was not you, please contact support immediately.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'WELCOME' });
};

export const sendSignupWelcomeEmail = async ({ toEmail, name, userId }) => {
  const verifyLink = `${getAppBaseUrl()}/login`;
  const subject = `Welcome to Quanta, ${name || 'Trader'}! Please verify your account`;
  const text = `Hi ${name || 'Trader'},\n\nThank you for signing up for Quanta — your institutional-grade stock analysis and paper trading terminal.\n\nWHAT'S WAITING FOR YOU:\n• $500,000 Virtual Trading Capital\n• Real-time global market feeds (NASDAQ, NYSE, NSE, BSE)\n• AI-Powered Stock Advisor (Google Gemini)\n• Interactive candlestick charts & technical indicators\n• Multi-broker portfolio import support\n\nPlease check your inbox for the verification code and verify your email to unlock full access.\n\nSign in here: ${verifyLink}\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Welcome to Quanta! 🎉</h1>
      <p>Hi <strong>${name || 'Trader'}</strong>,</p>
      <p>Thank you for signing up! We're thrilled to have you join the Quanta community of traders and market analysts.</p>

      <div class="card-box" style="text-align: center; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.3);">
        <span style="font-size: 13px; color: #86efac; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">Your Account Has Been Created</span>
        <p style="margin: 12px 0 4px; font-size: 15px; color: #e2e8f0;">Please verify your email address to unlock full access to the trading terminal.</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">Check your inbox for the 6-digit verification code.</p>
      </div>

      <div class="card-box" style="margin-top: 20px;">
        <p style="font-size: 13px; color: #8da194; text-transform: uppercase; font-weight: 700; margin-top: 0;">What's Waiting for You</p>
        <table class="table-details">
          <tr><td class="label">Virtual Capital</td><td class="val" style="color: #22c55e;">$500,000.00 USD</td></tr>
          <tr><td class="label">Global Markets</td><td class="val">NASDAQ, NYSE, NSE, BSE</td></tr>
          <tr><td class="label">AI Advisor</td><td class="val">Google Gemini Powered</td></tr>
          <tr><td class="label">Charts & Indicators</td><td class="val">Candlestick, RSI, SMA, Bollinger</td></tr>
          <tr><td class="label">Portfolio Import</td><td class="val">Zerodha, Groww, Angel One</td></tr>
        </table>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${verifyLink}" class="btn">Verify & Start Trading →</a>
      </div>

      <p style="font-size: 12px; color: #64748b;">If you did not create this account, you can safely ignore this email.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'SIGNUP_WELCOME' });
};

export const sendLoginAlertEmail = async ({ toEmail, name, ip, userAgent, userId }) => {
  const subject = 'New sign-in to your Quanta account';
  const timeStr = new Date().toUTCString();
  const text = `Hi ${name},\n\nA new sign-in to your Quanta account was detected at ${timeStr}.\n\nIP Address: ${ip || 'Unknown'}\nDevice: ${userAgent || 'Web Browser'}\n\nIf this was you, no action is needed. If you did not sign in, please reset your password immediately.`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">New sign-in detected</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>We detected a new successful login to your Quanta account.</p>

      <div class="card-box">
        <table class="table-details">
          <tr><td class="label">Date & Time</td><td class="val">${timeStr}</td></tr>
          <tr><td class="label">IP Address</td><td class="val">${ip || 'Standard Localhost / Proxy'}</td></tr>
          <tr><td class="label">Client Device</td><td class="val" style="font-size: 12px;">${(userAgent || 'Web Client').slice(0, 48)}</td></tr>
          <tr><td class="label">Status</td><td class="val"><span class="pill pill-green">Authorized</span></td></tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #8da194;">If you authorized this login, you can safely disregard this notice. If you suspect unauthorized access, please update your password right away.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'LOGIN_ALERT' });
};

export const sendStockSubscriptionEmail = async ({ toEmail, name, symbol, companyName, price, userId }) => {
  const stockUrl = `${getAppBaseUrl()}/stock/${encodeURIComponent(symbol)}`;
  const subject = `Subscription Confirmed: ${symbol} (${companyName || symbol})`;
  const text = `Hi ${name},\n\nYou have subscribed to live alerts for ${symbol} (${companyName || symbol}) at current price $${price}.\n\nView stock details: ${stockUrl}\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Stock Alert Subscription Activated</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>You have successfully subscribed to real-time price updates and market signals for <strong>${companyName || symbol}</strong>.</p>

      <div class="card-box">
        <table class="table-details">
          <tr><td class="label">Ticker Symbol</td><td class="val" style="color: #22c55e; font-family: monospace; font-size: 16px;">${symbol}</td></tr>
          <tr><td class="label">Company Name</td><td class="val">${companyName || symbol}</td></tr>
          <tr><td class="label">Price at Subscription</td><td class="val">$${Number(price).toFixed(2)}</td></tr>
          <tr><td class="label">Subscription Time</td><td class="val">${new Date().toLocaleString()}</td></tr>
          <tr><td class="label">Alert Frequency</td><td class="val"><span class="pill pill-green">Live Ticks</span></td></tr>
        </table>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${stockUrl}" class="btn">View ${symbol} Details & Chart →</a>
      </div>

      <p style="font-size: 12px; color: #64748b;">You can manage or unsubscribe from stock alerts at any time via your Profile Settings or directly on the stock analysis page.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'STOCK_SUBSCRIPTION' });
};

export const sendTradeConfirmationEmail = async ({ toEmail, name, tradeDetails, userId }) => {
  const { symbol, shares, price, total, type, referenceId } = tradeDetails;
  const isBuy = (type || 'BUY').toUpperCase() === 'BUY';
  const subject = `Trade Executed: ${type} ${shares} ${symbol}`;
  const text = `Hi ${name},\n\nYour ${type} order for ${shares} shares of ${symbol} has been executed at $${price} (Total: $${total}). Reference: ${referenceId}.\n\nNote: This is a simulated paper-trading execution.\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Trade Confirmation — Order Executed</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your order has been recorded and processed by the Quanta execution engine.</p>

      <div class="card-box">
        <table class="table-details">
          <tr><td class="label">Order Type</td><td class="val"><span class="pill ${isBuy ? 'pill-green' : 'pill-red'}">${type}</span></td></tr>
          <tr><td class="label">Asset / Symbol</td><td class="val" style="font-family: monospace; font-size: 16px;">${symbol}</td></tr>
          <tr><td class="label">Quantity</td><td class="val">${shares} shares</td></tr>
          <tr><td class="label">Execution Price</td><td class="val">$${Number(price).toFixed(2)}</td></tr>
          <tr><td class="label">Total Value</td><td class="val" style="font-size: 16px; color: #ffffff;">$${Number(total).toFixed(2)}</td></tr>
          <tr><td class="label">Order Reference</td><td class="val" style="font-size: 12px; font-family: monospace;">${referenceId}</td></tr>
          <tr><td class="label">Execution Mode</td><td class="val"><span class="pill pill-green">Simulated Paper Trade</span></td></tr>
        </table>
      </div>

      <p style="font-size: 12px; color: #8da194; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px;">
        ℹ️ <strong>Trading Disclaimer:</strong> Quanta simulates executions using live market feeds for educational and portfolio testing purposes. No actual financial broker execution took place.
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${getAppBaseUrl()}/portfolio" class="btn">View Updated Portfolio →</a>
      </div>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'STOCK_PURCHASE', referenceId });
};

export const sendWalletTopupEmail = async ({ toEmail, name, amount, newBalance, referenceId, method, userId }) => {
  const subject = `Wallet Credited: +$${Number(amount).toFixed(2)}`;
  const text = `Hi ${name},\n\nYour Quanta trading wallet has been successfully topped up with $${amount}. New Balance: $${newBalance}. Reference ID: ${referenceId}.\n\nBest regards,\nThe Quanta Team`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Wallet Top-Up Confirmed</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your wallet deposit has been verified and added to your available trading margin.</p>

      <div class="card-box">
        <table class="table-details">
          <tr><td class="label">Amount Added</td><td class="val" style="color: #22c55e; font-size: 18px;">+$${Number(amount).toFixed(2)}</td></tr>
          <tr><td class="label">Updated Balance</td><td class="val" style="font-size: 16px;">$${Number(newBalance).toFixed(2)}</td></tr>
          <tr><td class="label">Payment Channel</td><td class="val">${method || 'Razorpay Verified'}</td></tr>
          <tr><td class="label">Transaction Reference</td><td class="val" style="font-family: monospace; font-size: 12px;">${referenceId}</td></tr>
          <tr><td class="label">Date</td><td class="val">${new Date().toLocaleString()}</td></tr>
          <tr><td class="label">Status</td><td class="val"><span class="pill pill-green">Completed</span></td></tr>
        </table>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${getAppBaseUrl()}/portfolio" class="btn">Go to Trading Terminal →</a>
      </div>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'WALLET_TOPUP', referenceId });
};

export const sendPasswordResetEmail = async ({ toEmail, name, resetToken, userId }) => {
  const resetLink = `${getAppBaseUrl()}/login?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(toEmail)}`;
  const subject = 'Reset your Quanta password';
  const text = `Hi ${name},\n\nA password reset was requested for your Quanta account. Use this token: ${resetToken} or click: ${resetLink}\n\nThis link is valid for 30 minutes. If you did not request this, please ignore this email.`;

  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Password Reset Request</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>We received a request to reset the password for your Quanta account.</p>

      <div class="card-box" style="text-align: center;">
        <span style="font-size: 13px; color: #8da194; text-transform: uppercase;">Reset Authorization Code</span>
        <span class="code-badge">${resetToken}</span>
        <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">Expires in 30 minutes • Single-use</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetLink}" class="btn">Set New Password →</a>
      </div>

      <p style="font-size: 12px; color: #64748b;">If you did not request a password reset, no changes have been made to your account. You can safely discard this email.</p>
    ${emailFooter}
  `;

  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'PASSWORD_RESET' });
};

export const sendPasswordChangedEmail = async ({ toEmail, name, ip, userAgent, userId }) => {
  const subject = 'Your Quanta password was changed';
  const when = new Date().toUTCString();
  const text = `Hi ${name},\n\nThe password for your Quanta account was changed on ${when}.\n\nIf this was you, no action is needed. If it was not you, reset your password immediately and review your account.\n\nBest regards,\nThe Quanta Team`;
  const html = `
    ${emailHeader(subject)}
      <h1 class="h1">Password changed</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>The password for your Quanta account was changed on <strong>${when}</strong>. For your security, you were signed out of your other sessions.</p>
      <div class="card-box">
        <table class="table-details">
          <tr><td class="label">Device</td><td class="val">${String(userAgent || 'Unknown').slice(0, 120)}</td></tr>
          <tr><td class="label">Network address</td><td class="val">${String(ip || 'Unknown').slice(0, 60)}</td></tr>
        </table>
      </div>
      <p style="font-size: 12px; color: #64748b;">If this was not you, reset your password right away.</p>
    ${emailFooter}
  `;
  return sendMail({ to: toEmail, subject, html, text, userId, eventType: 'PASSWORD_CHANGED' });
};
