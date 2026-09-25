/* =====================================================================
 * Umrah ERP — persistence (node:sqlite, same approach as distribution-erp)
 *  - users / auth_sessions : logins shared by the whole team
 *  - app_state             : ONE versioned JSON document (the whole ERP state)
 *                            saved with optimistic concurrency (baseVersion)
 *  - audit                 : who saved what, when
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'umrah.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','HEAD','SALES','OPERATIONS')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_state (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  version    INTEGER NOT NULL,
  json       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  action  TEXT NOT NULL
);
`);

// ------------------------------------------------------------------ users
const ROLES = ['OWNER', 'MANAGER', 'HEAD', 'SALES', 'OPERATIONS'];
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const publicUser = (u) => (u ? { id: u.id, username: u.username, display_name: u.display_name, role: u.role, is_active: !!u.is_active } : null);
const isSetup = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;

function createUser({ username, display_name, password, role }) {
  username = String(username || '').trim();
  display_name = String(display_name || username).trim();
  if (username.length < 3) throw new Error('اسم المستخدم لازم يكون 3 حروف على الأقل');
  if (String(password || '').length < 8) throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
  if (!ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error('اسم المستخدم ده مستخدم بالفعل');
  const info = db.prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(username, display_name, hashPassword(String(password)), role);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
}
function setupOwner(body) {
  if (isSetup()) throw new Error('النظام متضبط بالفعل - استخدم تسجيل الدخول');
  return createUser({ ...body, role: 'OWNER' });
}
function updateUser(id, { role, is_active, password, display_name }) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new Error('مستخدم غير موجود');
  if (role && !ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  const nextRole = role || u.role;
  const nextActive = is_active === undefined ? u.is_active : is_active ? 1 : 0;
  if (u.role === 'OWNER' && (nextRole !== 'OWNER' || !nextActive)) {
    const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'OWNER' AND is_active = 1").get().c;
    if (owners <= 1) throw new Error('لازم يفضل مالك واحد نشط على الأقل');
  }
  db.prepare('UPDATE users SET role = ?, is_active = ?, display_name = ? WHERE id = ?').run(nextRole, nextActive, display_name || u.display_name, id);
  if (password) {
    if (String(password).length < 8) throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), id);
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  }
  if (!nextActive) db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}
const listUsers = () => db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser);
function authenticate(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!u || !u.is_active || !verifyPassword(String(password || ''), u.password_hash)) return null;
  return u;
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  return token;
}
function userFromSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT s.expires_at, u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) { db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token); return null; }
  return row.is_active ? row : null;
}
const destroySession = (token) => token && db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);

// ------------------------------------------------------------------ state
function getState() {
  const row = db.prepare('SELECT version, json, updated_at, updated_by FROM app_state WHERE id = 1').get();
  return row ? { version: row.version, state: JSON.parse(row.json), updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
}
const getVersion = () => { const r = db.prepare('SELECT version FROM app_state WHERE id = 1').get(); return r ? r.version : 0; };

/** Optimistic concurrency: the write only lands if nobody saved since `baseVersion`. */
function saveState(baseVersion, state, byName) {
  const json = JSON.stringify(state);
  const current = getVersion();
  if (current === 0) {
    db.prepare('INSERT INTO app_state (id, version, json, updated_by) VALUES (1, 1, ?, ?)').run(json, byName || null);
    return { ok: true, version: 1 };
  }
  const info = db.prepare("UPDATE app_state SET version = version + 1, json = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1 AND version = ?")
    .run(json, byName || null, baseVersion);
  if (info.changes === 0) return { ok: false, conflict: getState() };
  return { ok: true, version: baseVersion + 1 };
}
function forceState(state, byName) {
  const v = getVersion();
  if (v === 0) return saveState(0, state, byName);
  return saveState(v, state, byName);
}
const audit = (userId, action) => db.prepare('INSERT INTO audit (user_id, action) VALUES (?, ?)').run(userId || null, action);

module.exports = {
  db, ROLES, SESSION_DAYS, isSetup, setupOwner, createUser, updateUser, listUsers, authenticate,
  createSession, userFromSession, destroySession, publicUser, getState, getVersion, saveState, forceState, audit,
};
