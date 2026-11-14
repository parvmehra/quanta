import crypto from 'crypto';

export const sixDigitCode = () => String(crypto.randomInt(100000, 1000000));
export const hashCode = (code) => crypto.createHash('sha256').update(String(code).trim()).digest('hex');

export const safeEqualHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};
