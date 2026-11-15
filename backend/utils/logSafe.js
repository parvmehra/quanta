const SENSITIVE_EVENTS = {
  EMAIL_VERIFICATION: 'Email verification code sent',
  LOGIN_OTP: 'Login code sent',
  PASSWORD_RESET: 'Password reset code sent',
  PHONE_VERIFICATION_OTP: 'Mobile verification code sent',
};

const strip = (value) => String(value ?? '')
  .replace(/\b\d{6}\b/g, '••••••')
  .replace(/\b(token|verifyToken|resetToken|code|otp)=[^&\s]+/gi, '$1=••••');

export function safeLogContent(eventType, title, message) {
  if (SENSITIVE_EVENTS[eventType]) {
    return { title: SENSITIVE_EVENTS[eventType], message: 'A one-time code was sent. The code itself is not stored.' };
  }
  return { title: strip(title).slice(0, 200), message: strip(message).slice(0, 500) };
}
