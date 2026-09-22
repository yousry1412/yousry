const crypto = require('crypto');
const { db } = require('./db');

const SESSION_DAYS = 30;
const SETTINGS_KEY = 'auth_password_hash';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const testBuf = crypto.scryptSync(password, salt, 64);
  if (hashBuf.length !== testBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, testBuf);
}

function getPasswordHash() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY);
  return row ? row.value : null;
}

function isSetup() {
  return !!getPasswordHash();
}

function setPassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error('كلمة السر لازم تكون 6 حروف أو أرقام على الأقل');
  }
  const hash = hashPassword(String(password));
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, hash);
}

function checkPassword(password) {
  return verifyPassword(String(password || ''), getPasswordHash());
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO auth_sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
  return { token, expiresAt };
}

function validateSession(token) {
  if (!token) return false;
  const row = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token);
  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}

module.exports = {
  isSetup,
  setPassword,
  checkPassword,
  createSession,
  validateSession,
  destroySession,
  SESSION_DAYS,
};
