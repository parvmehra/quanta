import 'dotenv/config';
import { log } from '../utils/logger.js';

const secret = (process.env.JWT_SECRET || '').trim();

if (secret.length < 32 || /^(change|your|secret|example)/i.test(secret)) {
  log.error(
    '\n[config] JWT_SECRET is missing, too short (min 32 chars) or a placeholder.\n' +
    '         Generate one with:\n' +
    '           node -e "log.info(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
    '         and put it in backend/.env as JWT_SECRET=<value>\n'
  );
  process.exit(1);
}

export const JWT_SECRET = secret;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
