import { format } from 'node:util';

const asJson = process.env.NODE_ENV === 'production';

function emit(level, args) {
  const msg = format(...args);
  const now = new Date();
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ level, time: now.toISOString(), msg })}\n`);
    return;
  }
  const line = `${now.toTimeString().slice(0, 8)} ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
};

export default log;
