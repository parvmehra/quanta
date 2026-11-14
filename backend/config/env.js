import 'dotenv/config';

// Single place that validates security-critical environment variables.
// The server refuses to start without a strong JWT secret instead of falling
// back to a value that is public in the source code.
const LEGACY_FALLBACK = 'marketlens_jwt_secret_key_2026';

const secret = (process.env.JWT_SECRET || '').trim();

if (secret.length < 32 || secret === LEGACY_FALLBACK || /^(change|your|secret|example)/i.test(secret)) {
  console.error(
    '\n[config] JWT_SECRET is missing, too short (min 32 chars) or a placeholder.\n' +
    '         Generate one with:\n' +
    '           node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
    '         and put it in backend/.env as JWT_SECRET=<value>\n'
  );
  process.exit(1);
}

export const JWT_SECRET = secret;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
