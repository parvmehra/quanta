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
    } catch { /* not up yet */ }
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
  ]);
  await mongoose.disconnect();
  server?.kill();
});

test('public endpoints are open and protected ones require a login', { skip }, async () => {
  assert.strictEqual((await call('GET', '/api/health')).status, 200);
  for (const [m, p] of [
    ['GET', '/api/orders'], ['POST', '/api/orders'], ['GET', '/api/positions'], ['GET', '/api/ledger'], ['GET', '/api/wallet'], ['POST', '/api/wallet/topup'],
    ['POST', '/api/portfolio/import'], ['POST', '/api/stocks/advisor'], ['POST', '/api/stocks/cache/clear'], ['GET', '/api/stocks/subscriptions'],
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
