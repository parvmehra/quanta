import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { spawn } from 'child_process';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { io as connectSocket } from 'socket.io-client';
import User from '../models/User.js';
import ChatMessage from '../models/ChatMessage.js';
import Subscription from '../models/Subscription.js';
import NotificationLog from '../models/NotificationLog.js';
import Watchlist from '../models/Watchlist.js';

const URI = (process.env.MONGO_DB_URI || '').trim();
const skip = URI ? false : 'MONGO_DB_URI is not set';
const PORT = 3100 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const EMAIL_RE = /^apitest-.*@example\.com$/;
const PASSWORD = 'ApiTest12345';
let server;
const sockets = [];

const ip = () => `10.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}`;
async function call(method, path, { body, token, headers = {}, ipAddr } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipAddr || ip(), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

const uniqueEmail = () => `apitest-${crypto.randomUUID().slice(0, 12)}@example.com`;

async function registerAndLogin(email = uniqueEmail(), name = 'Api Tester') {
  const ipAddr = ip();
  const s = await call('POST', '/api/auth/signup', { body: { name, email, password: PASSWORD }, ipAddr });
  assert.strictEqual(s.status, 201);
  const v = await call('POST', '/api/auth/verify-email', { body: { email, token: s.data.debugCode }, ipAddr });
  assert.strictEqual(v.status, 200);
  const l = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr });
  const o = await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: l.data.debugCode }, ipAddr });
  assert.strictEqual(o.status, 200);
  return { email, token: o.data.token, id: o.data.user.id, ipAddr };
}

function socketFor(token) {
  const s = connectSocket(BASE, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true });
  sockets.push(s);
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  if (skip) return;
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  server = spawn(process.execPath, ['index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status !== 503) return;
    } catch { }
    await wait(500);
  }
  throw new Error('test server did not start');
});

after(async () => {
  if (skip) return;
  sockets.forEach((s) => s.close());
  const users = await User.find({ email: EMAIL_RE }).select('_id').lean();
  const ids = users.map((u) => u._id);
  await Promise.all([
    User.deleteMany({ email: EMAIL_RE }),
    ChatMessage.deleteMany({ senderId: { $in: ids } }),
    Subscription.deleteMany({ userId: { $in: ids } }),
    NotificationLog.deleteMany({ userId: { $in: ids } }),
    Watchlist.deleteMany({ userId: { $in: ids } }),
  ]);
  await mongoose.disconnect();
  server?.kill();
});

test('public endpoints are open and protected ones require a login', { skip }, async () => {
  assert.strictEqual((await call('GET', '/api/health')).status, 200);
  assert.strictEqual((await call('POST', '/api/stocks/advisor', { body: {} })).status, 404, 'the old unauthenticated advisor route is gone');
  for (const [m, p] of [
    ['GET', '/api/orders'], ['POST', '/api/orders'], ['GET', '/api/positions'], ['GET', '/api/ledger'], ['GET', '/api/wallet'], ['POST', '/api/wallet/topup'],
    ['POST', '/api/portfolio/import'], ['POST', '/api/advisor/chat'], ['GET', '/api/advisor/context/AAPL'], ['POST', '/api/stocks/cache/clear'], ['GET', '/api/stocks/subscriptions'],
    ['GET', '/api/chat/admin/rooms'], ['GET', '/api/chat/some-room'], ['GET', '/api/auth/me'],
  ]) {
    const r = await call(m, p, { body: m === 'POST' ? {} : undefined });
    assert.strictEqual(r.status, 401, `${m} ${p} should be 401, got ${r.status}`);
  }
});

test('signup validates input and never stores passwords or codes in plain text', { skip }, async () => {
  const ipAddr = ip();
  const bad = [
    { name: 'A', email: uniqueEmail(), password: PASSWORD },
    { name: 'Api Tester', email: 'not-an-email', password: PASSWORD },
    { name: 'Api Tester', email: uniqueEmail(), password: 'short1A' },
    { name: 'Api Tester', email: uniqueEmail(), password: 'alllowercase1' },
    { name: 'Api Tester', email: uniqueEmail(), password: 'NoNumbersHere' },
    { name: 'Api Tester', email: { $ne: null }, password: PASSWORD },
  ];
  for (const body of bad) assert.strictEqual((await call('POST', '/api/auth/signup', { body, ipAddr })).status, 400, JSON.stringify(body).slice(0, 60));

  const email = uniqueEmail();
  const s = await call('POST', '/api/auth/signup', { body: { name: 'Api Tester', email, password: PASSWORD }, ipAddr });
  assert.strictEqual(s.status, 201);
  const doc = await User.findOne({ email }).lean();
  assert.notStrictEqual(doc.password, PASSWORD);
  assert.ok(doc.password.startsWith('$2'), 'password is a bcrypt hash');
  assert.ok(!JSON.stringify(doc).includes(s.data.debugCode), 'verification code is stored hashed');
  assert.strictEqual(doc.isEmailVerified, false);
});

test('email verification: wrong code rejected, right code verifies, re-verifying is refused', { skip }, async () => {
  const email = uniqueEmail();
  const ipAddr = ip();
  const s = await call('POST', '/api/auth/signup', { body: { name: 'Api Tester', email, password: PASSWORD }, ipAddr });
  assert.strictEqual((await call('POST', '/api/auth/verify-email', { body: { email, token: '000000' }, ipAddr })).status, 400);
  const ok = await call('POST', '/api/auth/verify-email', { body: { email, token: s.data.debugCode }, ipAddr });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.data.token);
  assert.strictEqual(ok.data.user.password, undefined);
  assert.strictEqual((await call('POST', '/api/auth/verify-email', { body: { email, token: s.data.debugCode }, ipAddr })).status, 400);
  const dup = await call('POST', '/api/auth/signup', { body: { name: 'Api Tester', email, password: PASSWORD }, ipAddr });
  assert.strictEqual(dup.status, 400);
});

test('login: generic errors, lockout after repeated failures, then a code is required', { skip }, async () => {
  const { email } = await registerAndLogin();
  const ipAddr = ip();
  const unknown = await call('POST', '/api/auth/login', { body: { email: uniqueEmail(), password: PASSWORD }, ipAddr });
  const wrong = await call('POST', '/api/auth/login', { body: { email, password: 'WrongPass123' }, ipAddr });
  assert.strictEqual(unknown.status, 400);
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual(unknown.data.message, wrong.data.message, 'unknown and wrong-password errors are identical');
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/login', { body: { email, password: 'WrongPass123' }, ipAddr });
  const locked = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr });
  assert.strictEqual(locked.status, 429, 'account is locked after 5 failures');
});

test('login codes: attempts are capped, codes are single use, and /me never leaks secrets', { skip }, async () => {
  const email = uniqueEmail();
  await registerAndLogin(email);
  const ipAddr = ip();
  const l = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr });
  assert.strictEqual(l.status, 200);
  assert.strictEqual(l.data.requiresOtp, true);
  const code = l.data.debugCode;
  for (let i = 0; i < 4; i++) assert.strictEqual((await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: '123456' === code ? '654321' : '123456' }, ipAddr })).status, 400);
  const fifth = await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: '123456' === code ? '654321' : '123456' }, ipAddr });
  assert.match(fifth.data.message, /Too many incorrect codes/);
  assert.strictEqual((await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: code }, ipAddr })).status, 400, 'the real code no longer works after the cap');

  const l2 = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr });
  const ok = await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: l2.data.debugCode }, ipAddr });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: l2.data.debugCode }, ipAddr })).status, 400, 'a code cannot be reused');
  const me = await call('GET', '/api/auth/me', { token: ok.data.token });
  assert.strictEqual(me.status, 200);
  const text = JSON.stringify(me.data);
  for (const secret of ['password', 'loginOtp', 'resetPassword', 'emailVerificationToken', 'phoneVerificationOtp']) assert.ok(!text.includes(secret), `/me must not expose ${secret}`);
});

test('resend and forgot-password do not reveal whether an account exists', { skip }, async () => {
  const { email } = await registerAndLogin();
  const ipAddr = ip();
  const a = await call('POST', '/api/auth/resend-login-otp', { body: { email }, ipAddr });
  const b = await call('POST', '/api/auth/resend-login-otp', { body: { email: uniqueEmail() }, ipAddr });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(a.data.message, b.data.message);
  const c = await call('POST', '/api/auth/forgot-password', { body: { email }, ipAddr });
  const d = await call('POST', '/api/auth/forgot-password', { body: { email: uniqueEmail() }, ipAddr });
  assert.strictEqual(c.data.message, d.data.message);
  assert.strictEqual(c.status, d.status);
});

test('password reset: attempts are capped and a successful reset swaps the password', { skip }, async () => {
  const { email } = await registerAndLogin();
  const ipAddr = ip();
  const f = await call('POST', '/api/auth/forgot-password', { body: { email }, ipAddr });
  const code = f.data.debugCode;
  const wrongCode = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/reset-password', { body: { email, token: wrongCode, newPassword: 'NewPass12345' }, ipAddr });
  const afterCap = await call('POST', '/api/auth/reset-password', { body: { email, token: code, newPassword: 'NewPass12345' }, ipAddr });
  assert.strictEqual(afterCap.status, 400, 'the real code is dead after five wrong attempts');

  const f2 = await call('POST', '/api/auth/forgot-password', { body: { email }, ipAddr });
  assert.strictEqual((await call('POST', '/api/auth/reset-password', { body: { email, token: f2.data.debugCode, newPassword: 'weak' }, ipAddr })).status, 400);
  const good = await call('POST', '/api/auth/reset-password', { body: { email, token: f2.data.debugCode, newPassword: 'NewPass12345' }, ipAddr });
  assert.strictEqual(good.status, 200);
  assert.strictEqual((await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr })).status, 400, 'old password stops working');
  assert.strictEqual((await call('POST', '/api/auth/login', { body: { email, password: 'NewPass12345' }, ipAddr })).status, 200);
});

test('code-checking endpoints are rate limited', { skip }, async () => {
  const email = uniqueEmail();
  const ipAddr = ip();
  await call('POST', '/api/auth/signup', { body: { name: 'Api Tester', email, password: PASSWORD }, ipAddr });
  const statuses = [];
  for (let i = 0; i < 18; i++) statuses.push((await call('POST', '/api/auth/verify-email', { body: { email, token: '000000' }, ipAddr })).status);
  assert.ok(statuses.includes(429), `expected a 429 in ${statuses.join(',')}`);
});

test('Google sign-in cannot be used to take over an account by sending an email address', { skip }, async () => {
  const { email } = await registerAndLogin();
  const r = await call('POST', '/api/auth/google', { body: { email, name: 'Attacker', googleId: 'x' } });
  assert.ok([400, 503].includes(r.status), `got ${r.status}`);
  assert.strictEqual(r.data.token, undefined);
  const r2 = await call('POST', '/api/auth/google', { body: { idToken: 'not-a-real-token', email } });
  assert.ok([401, 503].includes(r2.status));
  assert.strictEqual(r2.data.token, undefined);
});

test('forged, tampered and orphaned tokens are rejected', { skip }, async () => {
  const user = await registerAndLogin();
  assert.strictEqual((await call('GET', '/api/auth/me', { token: user.token })).status, 200);
  const legacy = jwt.sign({ id: user.id }, 'marketlens_jwt_secret_key_2026', { expiresIn: '1h' });
  assert.strictEqual((await call('GET', '/api/auth/me', { token: legacy })).status, 401, 'token signed with the old public secret');
  assert.strictEqual((await call('GET', '/api/auth/me', { token: user.token.slice(0, -3) + 'abc' })).status, 401, 'tampered signature');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ id: user.id })).toString('base64url') + '.';
  assert.strictEqual((await call('GET', '/api/auth/me', { token: none })).status, 401, 'alg=none');
  const expired = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.strictEqual((await call('GET', '/api/auth/me', { token: expired })).status, 401, 'expired');
  const orphan = jwt.sign({ id: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.strictEqual((await call('GET', '/api/auth/me', { token: orphan })).status, 401, 'valid signature but user does not exist');
});

test('admin-only routes refuse ordinary users, and chat rooms are private', { skip }, async () => {
  const a = await registerAndLogin();
  const b = await registerAndLogin();
  assert.strictEqual((await call('POST', '/api/stocks/cache/clear', { token: a.token, body: {} })).status, 403);
  assert.strictEqual((await call('GET', '/api/chat/admin/rooms', { token: a.token })).status, 403);
  assert.strictEqual((await call('GET', `/api/chat/${b.id}`, { token: a.token })).status, 403, 'cannot read another user\'s chat');
  assert.strictEqual((await call('GET', `/api/chat/${a.id}`, { token: a.token })).status, 200);
});

test('chat sockets: identity comes from the token, rooms are private, admin room needs the admin role', { skip }, async () => {
  const a = await registerAndLogin(uniqueEmail(), 'Alice Tester');
  const b = await registerAndLogin(uniqueEmail(), 'Bob Tester');
  const adminUser = await registerAndLogin(uniqueEmail(), 'Real Admin');
  await User.updateOne({ _id: adminUser.id }, { $set: { role: 'admin' } });

  const anon = await socketFor();
  const sa = await socketFor(a.token);
  const sb = await socketFor(b.token);
  const sadmin = await socketFor(adminUser.token);

  const heard = { anon: [], b: [], admin: [] };
  anon.on('receive_message', (m) => heard.anon.push(m));
  sb.on('receive_message', (m) => heard.b.push(m));
  sadmin.on('receive_message', (m) => heard.admin.push(m));

  anon.emit('join_admin'); anon.emit('join_chat', a.id);
  sb.emit('join_admin'); sb.emit('join_chat', a.id);
  sadmin.emit('join_admin');
  sa.emit('join_chat', a.id);
  await wait(500);

  sa.emit('send_message', { roomId: 'someone-elses-room', senderId: b.id, senderName: 'Admin', text: 'hello from alice' });
  anon.emit('send_message', { roomId: a.id, senderId: a.id, senderName: 'Alice Tester', text: 'anonymous spoof' });
  await wait(1500);

  assert.strictEqual(heard.anon.length, 0, 'unauthenticated sockets receive nothing');
  assert.strictEqual(heard.b.length, 0, 'another user cannot listen to alice\'s room or the admin room');
  assert.strictEqual(heard.admin.length, 1, 'the admin sees the message');
  const saved = heard.admin[0];
  assert.strictEqual(saved.senderId, a.id, 'sender id is taken from the token');
  assert.strictEqual(saved.senderName, 'Alice Tester', 'sender name is taken from the account, not the client');
  assert.strictEqual(saved.roomId, a.id, 'users can only write to their own room');
  assert.strictEqual(await ChatMessage.countDocuments({ text: 'anonymous spoof' }), 0);
});

test('price alert subscriptions are per user, validated and de-duplicated', { skip }, async () => {
  const a = await registerAndLogin();
  const b = await registerAndLogin();
  assert.strictEqual((await call('POST', '/api/stocks/subscriptions', { token: a.token, body: { symbol: '<script>' } })).status, 400);
  assert.strictEqual((await call('POST', '/api/stocks/subscriptions', { token: a.token, body: { symbol: '^GSPC' } })).status, 400);
  assert.strictEqual((await call('POST', '/api/stocks/subscriptions', { token: a.token, body: { symbol: 'aapl', companyName: 'Apple', price: 100 } })).status, 201);
  const again = await call('POST', '/api/stocks/subscriptions', { token: a.token, body: { symbol: 'AAPL' } });
  assert.strictEqual(again.status, 200);
  assert.strictEqual((await call('GET', '/api/stocks/subscriptions', { token: a.token })).data.length, 1);
  assert.strictEqual((await call('GET', '/api/stocks/subscriptions', { token: b.token })).data.length, 0, 'other users do not see it');
  assert.strictEqual((await call('DELETE', '/api/stocks/subscriptions/AAPL', { token: b.token })).data.removed, false, 'other users cannot remove it');
  assert.strictEqual((await call('DELETE', '/api/stocks/subscriptions/AAPL', { token: a.token })).data.removed, true);
});

test('notification preferences accept only known boolean keys', { skip }, async () => {
  const u = await registerAndLogin();
  const r = await call('PUT', '/api/auth/preferences', { token: u.token, body: { preferences: { email: { trades: false, evil: true, security: 'yes' }, sms: { market: true }, admin: true } } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.preferences.email.trades, false);
  assert.strictEqual(r.data.preferences.email.security, true, 'non-boolean values are ignored');
  assert.strictEqual(r.data.preferences.sms.market, true);
  assert.strictEqual(r.data.preferences.email.evil, undefined);
  assert.strictEqual((await User.findById(u.id).lean()).role, 'user');
});

test('oversized request bodies are refused', { skip }, async () => {
  const big = JSON.stringify({ name: 'x'.repeat(200_000), email: uniqueEmail(), password: PASSWORD });
  const r = await call('POST', '/api/auth/signup', { body: big });
  assert.strictEqual(r.status, 413);
});

test('Mongo-operator injection in credentials is treated as invalid input', { skip }, async () => {
  const ipAddr = ip();
  const r = await call('POST', '/api/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } }, ipAddr });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.token, undefined);
});

test('watchlists require a login and start with one empty default list', { skip }, async () => {
  assert.strictEqual((await call('GET', '/api/watchlists')).status, 401);
  assert.strictEqual((await call('POST', '/api/watchlists', { body: { name: 'x' } })).status, 401);
  const u = await registerAndLogin();
  const r = await call('GET', '/api/watchlists', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.lists.length, 1);
  assert.strictEqual(r.data.lists[0].isDefault, true);
  assert.deepStrictEqual(r.data.lists[0].symbols, []);
  const again = await call('GET', '/api/watchlists', { token: u.token });
  assert.strictEqual(again.data.lists.length, 1, 'the default list is created once');
});

test('watchlist symbols are validated, normalised and never duplicated, even under concurrency', { skip }, async () => {
  const u = await registerAndLogin();
  const id = (await call('GET', '/api/watchlists', { token: u.token })).data.lists[0].id;
  for (const symbol of ['<x>', '^GSPC', 'A=B', '', null, { $ne: 1 }, 'WAY-TOO-LONG-SYMBOL-NAME-123']) {
    assert.strictEqual((await call('POST', `/api/watchlists/${id}/symbols`, { token: u.token, body: { symbol } })).status, 400, JSON.stringify(symbol));
  }
  const add = await call('POST', `/api/watchlists/${id}/symbols`, { token: u.token, body: { symbol: ' aapl ' } });
  assert.strictEqual(add.status, 201);
  assert.deepStrictEqual(add.data.list.symbols, ['AAPL']);
  const dup = await call('POST', `/api/watchlists/${id}/symbols`, { token: u.token, body: { symbol: 'AAPL' } });
  assert.strictEqual(dup.data.duplicate, true);
  await Promise.all(Array.from({ length: 8 }, () => call('POST', `/api/watchlists/${id}/symbols`, { token: u.token, body: { symbol: 'TCS.NS' } })));
  const list = (await call('GET', '/api/watchlists', { token: u.token })).data.lists[0];
  assert.deepStrictEqual([...list.symbols].sort(), ['AAPL', 'TCS.NS'], 'concurrent adds produce one entry');
  const rm = await call('DELETE', `/api/watchlists/${id}/symbols/aapl`, { token: u.token });
  assert.deepStrictEqual(rm.data.list.symbols, ['TCS.NS']);
  assert.strictEqual((await call('DELETE', `/api/watchlists/${id}/symbols/NOPE`, { token: u.token })).status, 200, 'removing a missing symbol is harmless');
});

test('lists: names are validated and unique, the default is protected, and there is a cap', { skip }, async () => {
  const u = await registerAndLogin();
  for (const name of ['', '   ', 'x'.repeat(41), { $ne: null }, 123, null]) {
    assert.strictEqual((await call('POST', '/api/watchlists', { token: u.token, body: { name } })).status, 400, JSON.stringify(name));
  }
  const a = await call('POST', '/api/watchlists', { token: u.token, body: { name: '  Long   term ' } });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(a.data.list.name, 'Long term', 'whitespace is tidied');
  assert.strictEqual((await call('POST', '/api/watchlists', { token: u.token, body: { name: 'LONG TERM' } })).status, 409, 'names are unique ignoring case');
  const renamed = await call('PATCH', `/api/watchlists/${a.data.list.id}`, { token: u.token, body: { name: 'Dividends' } });
  assert.strictEqual(renamed.data.list.name, 'Dividends');
  const defaultId = (await call('GET', '/api/watchlists', { token: u.token })).data.lists.find((l) => l.isDefault).id;
  assert.strictEqual((await call('PATCH', `/api/watchlists/${defaultId}`, { token: u.token, body: { name: 'Dividends' } })).status, 409);
  assert.strictEqual((await call('DELETE', `/api/watchlists/${defaultId}`, { token: u.token })).status, 400, 'the default list cannot be deleted');
  assert.strictEqual((await call('DELETE', `/api/watchlists/${a.data.list.id}`, { token: u.token })).status, 200);
  for (let i = 0; i < 9; i++) assert.strictEqual((await call('POST', '/api/watchlists', { token: u.token, body: { name: `List ${i}` } })).status, 201);
  assert.strictEqual((await call('POST', '/api/watchlists', { token: u.token, body: { name: 'One too many' } })).status, 400, 'at most 10 lists');
});

test('watchlists are private to their owner', { skip }, async () => {
  const a = await registerAndLogin();
  const b = await registerAndLogin();
  const created = await call('POST', '/api/watchlists', { token: a.token, body: { name: 'Secret' } });
  const id = created.data.list.id;
  await call('POST', `/api/watchlists/${id}/symbols`, { token: a.token, body: { symbol: 'NVDA' } });
  assert.ok(!(await call('GET', '/api/watchlists', { token: b.token })).data.lists.some((l) => l.id === id));
  assert.strictEqual((await call('POST', `/api/watchlists/${id}/symbols`, { token: b.token, body: { symbol: 'AAPL' } })).status, 404);
  assert.strictEqual((await call('DELETE', `/api/watchlists/${id}/symbols/NVDA`, { token: b.token })).status, 404);
  assert.strictEqual((await call('PATCH', `/api/watchlists/${id}`, { token: b.token, body: { name: 'Hacked' } })).status, 404);
  assert.strictEqual((await call('DELETE', `/api/watchlists/${id}`, { token: b.token })).status, 404);
  const mine = (await call('GET', '/api/watchlists', { token: a.token })).data.lists.find((l) => l.id === id);
  assert.deepStrictEqual(mine.symbols, ['NVDA']);
  assert.strictEqual(mine.name, 'Secret');
});

test('watchlist size is capped and the browser list can be imported once without duplicates', { skip }, async () => {
  const u = await registerAndLogin();
  const imp = await call('POST', '/api/watchlists/import', { token: u.token, body: { symbols: ['aapl', 'MSFT', 'bad!!', 'AAPL', '^GSPC'] } });
  assert.strictEqual(imp.status, 200);
  assert.deepStrictEqual(imp.data.list.symbols, ['AAPL', 'MSFT']);
  assert.strictEqual(imp.data.added, 2);
  const again = await call('POST', '/api/watchlists/import', { token: u.token, body: { symbols: ['AAPL', 'MSFT'] } });
  assert.strictEqual(again.data.added, 0, 'importing twice adds nothing');
  const many = Array.from({ length: 150 }, (_, i) => `T${i}`);
  const full = await call('POST', '/api/watchlists/import', { token: u.token, body: { symbols: many } });
  assert.strictEqual(full.data.list.symbols.length, 100, 'capped at 100 stocks');
  const id = full.data.list.id;
  assert.strictEqual((await call('POST', `/api/watchlists/${id}/symbols`, { token: u.token, body: { symbol: 'ZZZ' } })).status, 400, 'the 101st stock is refused');
});

test('the sparkline endpoint returns compact real price history and validates input', { skip }, async () => {
  assert.strictEqual((await call('GET', '/api/stocks/sparklines')).status, 400);
  assert.strictEqual((await call('GET', '/api/stocks/sparklines?symbols=%3Cx%3E,%5EGSPC')).status, 400);
  const r = await call('GET', '/api/stocks/sparklines?symbols=AAPL,ZZZZNOPE');
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.sparklines.AAPL.closes.length >= 5 && r.data.sparklines.AAPL.closes.length <= 31);
  assert.ok(r.data.sparklines.AAPL.closes.every((n) => typeof n === 'number' && n > 0));
  assert.strictEqual(r.data.sparklines.ZZZZNOPE, null, 'unavailable symbols are null, never invented');
});

test('profile: only the name can be changed, and it is validated', { skip }, async () => {
  assert.strictEqual((await call('PATCH', '/api/auth/profile', { body: { name: 'Nobody' } })).status, 401);
  const u = await registerAndLogin();
  for (const name of ['', ' ', 'A', 'x'.repeat(101), { $ne: 1 }, 42, null]) {
    assert.strictEqual((await call('PATCH', '/api/auth/profile', { token: u.token, body: { name } })).status, 400, JSON.stringify(name));
  }
  const ok = await call('PATCH', '/api/auth/profile', { token: u.token, body: { name: '  Priya   Sharma ', email: 'hijack@example.com', role: 'admin', isEmailVerified: false } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.user.name, 'Priya Sharma');
  const doc = await User.findById(u.id).lean();
  assert.strictEqual(doc.email, u.email, 'the email cannot be changed here');
  assert.strictEqual(doc.role, 'user', 'the role cannot be changed here');
  assert.strictEqual(doc.isEmailVerified, true);
});

test('changing the password checks the old one, enforces the rules, and signs out other sessions', { skip }, async () => {
  assert.strictEqual((await call('POST', '/api/auth/change-password', { body: { currentPassword: 'a', newPassword: 'b' } })).status, 401);
  const u = await registerAndLogin();
  const attempt = (currentPassword, newPassword) => call('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword, newPassword } });
  assert.strictEqual((await attempt('WrongPass123', 'BrandNew12345')).status, 400, 'wrong current password');
  assert.strictEqual((await attempt(PASSWORD, 'weak')).status, 400, 'weak new password');
  assert.strictEqual((await attempt(PASSWORD, PASSWORD)).status, 400, 'same password');
  assert.strictEqual((await attempt('', 'BrandNew12345')).status, 400, 'empty current password');
  assert.strictEqual((await call('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: { $ne: 1 }, newPassword: 'BrandNew12345' } })).status, 400);
  assert.strictEqual((await call('GET', '/api/auth/me', { token: u.token })).status, 200, 'failed attempts change nothing');

  const ok = await attempt(PASSWORD, 'BrandNew12345');
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.data.token);
  assert.strictEqual((await call('GET', '/api/auth/me', { token: u.token })).status, 401, 'the old token stops working');
  assert.strictEqual((await call('GET', '/api/auth/me', { token: ok.data.token })).status, 200, 'the new token works');
  const ipAddr = ip();
  assert.strictEqual((await call('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD }, ipAddr })).status, 400, 'old password no longer works');
  assert.strictEqual((await call('POST', '/api/auth/login', { body: { email: u.email, password: 'BrandNew12345' }, ipAddr })).status, 200);
});

test('password change attempts are rate limited per account', { skip }, async () => {
  const u = await registerAndLogin();
  const statuses = [];
  for (let i = 0; i < 9; i++) statuses.push((await call('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: 'WrongPass123', newPassword: 'BrandNew12345' } })).status);
  assert.ok(statuses.includes(429), statuses.join(','));
});

test('a password reset also signs out existing sessions', { skip }, async () => {
  const u = await registerAndLogin();
  const ipAddr = ip();
  const f = await call('POST', '/api/auth/forgot-password', { body: { email: u.email }, ipAddr });
  assert.strictEqual((await call('POST', '/api/auth/reset-password', { body: { email: u.email, token: f.data.debugCode, newPassword: 'ResetPass12345' }, ipAddr })).status, 200);
  assert.strictEqual((await call('GET', '/api/auth/me', { token: u.token })).status, 401, 'tokens issued before the reset are dead');
});

test('the notification history never contains one-time codes or reset tokens', { skip }, async () => {
  const email = uniqueEmail();
  const ipAddr = ip();
  const codes = [];
  const s = await call('POST', '/api/auth/signup', { body: { name: 'Api Tester', email, password: PASSWORD }, ipAddr });
  codes.push(s.data.debugCode);
  await call('POST', '/api/auth/verify-email', { body: { email, token: s.data.debugCode }, ipAddr });
  const l = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD }, ipAddr });
  codes.push(l.data.debugCode);
  const o = await call('POST', '/api/auth/verify-login-otp', { body: { email, otp: l.data.debugCode }, ipAddr });
  const f = await call('POST', '/api/auth/forgot-password', { body: { email }, ipAddr });
  codes.push(f.data.debugCode);
  await wait(800);

  const history = await call('GET', '/api/auth/notifications/history', { token: o.data.token });
  assert.ok(Array.isArray(history.data) && history.data.length >= 3, 'logs exist');
  const text = JSON.stringify(history.data);
  for (const code of codes) assert.ok(!text.includes(code), `the code ${code} must not appear in the history`);
  const stored = JSON.stringify(await NotificationLog.find({ recipient: email }).lean());
  for (const code of codes) assert.ok(!stored.includes(code), `the code ${code} must not be stored in the database`);
  assert.ok(history.data.some((e) => e.title === 'Login code sent'));
  assert.ok(history.data.some((e) => e.title === 'Password reset code sent'));
});

test('notification history supports limit and cursor paging and is private', { skip }, async () => {
  const a = await registerAndLogin();
  const b = await registerAndLogin();
  await wait(500);
  const all = (await call('GET', '/api/auth/notifications/history?limit=100', { token: a.token })).data;
  assert.ok(all.length >= 3);
  const page1 = (await call('GET', '/api/auth/notifications/history?limit=2', { token: a.token })).data;
  assert.strictEqual(page1.length, 2);
  const page2 = (await call('GET', `/api/auth/notifications/history?limit=100&before=${page1[1].createdAt}`, { token: a.token })).data;
  assert.ok(page2.every((e) => e.createdAt < page1[1].createdAt));
  assert.strictEqual(page1.length + page2.length, all.length, 'paging does not skip or repeat entries');
  const mine = new Set(all.map((e) => e._id));
  const theirs = (await call('GET', '/api/auth/notifications/history?limit=100', { token: b.token })).data;
  assert.ok(theirs.every((e) => !mine.has(e._id)), 'users never see each other\'s notifications');
  assert.strictEqual((await call('GET', '/api/auth/notifications/history?limit=100000', { token: a.token })).data.length <= 100, true);
});
