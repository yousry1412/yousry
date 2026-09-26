/* =====================================================================
 * Umrah ERP — persistence (node:sqlite, same stack as distribution-erp)
 *  users · auth_sessions · companies · company_state (one versioned
 *  document per company) · state_versions (history + labelled snapshots)
 *  · files (uploads on disk) · chat · notifications · kv · audit
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'umrah.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS', 'AGENT', 'SUPERVISOR', 'HOUSING'];
const STAFF_ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS'];
const PORTAL_ROLES = ['AGENT', 'SUPERVISOR', 'HOUSING'];

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS company_state (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE, version INTEGER NOT NULL, json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT
);
CREATE TABLE IF NOT EXISTS state_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')), saved_by TEXT, label TEXT
);
CREATE INDEX IF NOT EXISTS state_versions_company ON state_versions (company_id, id);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, company_id INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  uploaded_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, channel TEXT NOT NULL, user_id INTEGER, user_name TEXT,
  text TEXT, file_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_idx ON chat_messages (company_id, channel, id);
CREATE TABLE IF NOT EXISTS chat_reads (user_id INTEGER NOT NULL, company_id INTEGER NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, company_id, channel));
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, roles TEXT, user_id INTEGER, text TEXT NOT NULL, link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notif_reads (user_id INTEGER PRIMARY KEY, last_id INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, company_id INTEGER, action TEXT NOT NULL
);
`);

// ---- light migrations for databases created by the first online version
function ensureColumn(table, column, ddl) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
(function migrateUsers() {
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get() || {}).sql || '';
  if (/CHECK \(role IN/.test(sql)) { // v1 had a role CHECK that rejects the new roles → rebuild table
    db.exec(`CREATE TABLE users_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO users_v2 (id, username, display_name, password_hash, role, is_active, created_at) SELECT id, username, display_name, password_hash, role, is_active, created_at FROM users;
      PRAGMA foreign_keys = OFF; DROP TABLE users; ALTER TABLE users_v2 RENAME TO users; PRAGMA foreign_keys = ON;`);
  }
})();
ensureColumn('users', 'company_id', 'company_id INTEGER');
ensureColumn('users', 'branch_id', 'branch_id TEXT');
ensureColumn('users', 'agent_ref', 'agent_ref TEXT');
ensureColumn('users', 'phone', 'phone TEXT');
ensureColumn('chat_messages', 'to_user_id', 'to_user_id INTEGER');
ensureColumn('chat_messages', 'to_name', 'to_name TEXT');
ensureColumn('chat_messages', 'private', 'private INTEGER NOT NULL DEFAULT 0');
(function migrateSingleState() {
  const old = db.prepare("SELECT name FROM sqlite_master WHERE name = 'app_state'").get();
  if (!old || db.prepare('SELECT COUNT(*) c FROM companies').get().c) return;
  const row = db.prepare('SELECT * FROM app_state WHERE id = 1').get();
  if (!row) return;
  const id = Number(db.prepare("INSERT INTO companies (name) VALUES ('الشركة الرئيسية')").run().lastInsertRowid);
  db.prepare('INSERT INTO company_state (company_id, version, json, updated_by) VALUES (?, ?, ?, ?)').run(id, row.version, row.json, row.updated_by);
  db.prepare("UPDATE users SET company_id = ? WHERE role <> 'OWNER'").run(id);
})();

// ------------------------------------------------------------------ users
function hashPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`; }
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const publicUser = (u) => (u ? { id: u.id, username: u.username, display_name: u.display_name, role: u.role, is_active: !!u.is_active,
  company_id: u.company_id || null, branch_id: u.branch_id || null, agent_ref: u.agent_ref || null, phone: u.phone || '' } : null);
const isSetup = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;

function validatePassword(pw) {
  pw = String(pw || '');
  if (pw.length < 8) throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
  if (!/[0-9]/.test(pw) || !/[^0-9]/.test(pw)) throw new Error('كلمة السر لازم تجمع بين حروف وأرقام');
}
function createUser({ username, display_name, password, role, company_id, branch_id, agent_ref, phone }) {
  username = String(username || '').trim().toLowerCase();
  display_name = String(display_name || username).trim();
  if (!/^[a-z0-9._@+-]{3,64}$/.test(username)) throw new Error('اسم المستخدم: حروف إنجليزية أو أرقام أو إيميل (3–64 حرف، بدون مسافات)');
  validatePassword(password);
  if (!ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  if (role !== 'OWNER' && !company_id) throw new Error('لازم تحدد الشركة لهذا المستخدم');
  if (role === 'AGENT' && !agent_ref) throw new Error('حساب المندوب لازم يرتبط بسجل وكيل/مندوب');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error('اسم المستخدم ده مستخدم بالفعل');
  const info = db.prepare('INSERT INTO users (username, display_name, password_hash, role, company_id, branch_id, agent_ref, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(username, display_name, hashPassword(String(password)), role, role === 'OWNER' ? null : Number(company_id), branch_id || null, agent_ref || null, phone || null);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
}
function setupOwner(body) {
  if (isSetup()) throw new Error('النظام متضبط بالفعل - استخدم تسجيل الدخول');
  return createUser({ ...body, role: 'OWNER' });
}
function updateUser(id, b) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new Error('مستخدم غير موجود');
  const role = b.role || u.role;
  if (!ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  const active = b.is_active === undefined ? u.is_active : b.is_active ? 1 : 0;
  if (u.role === 'OWNER' && (role !== 'OWNER' || !active)) {
    if (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'OWNER' AND is_active = 1").get().c <= 1) throw new Error('لازم يفضل مالك واحد نشط على الأقل');
  }
  const company = role === 'OWNER' ? null : b.company_id !== undefined ? Number(b.company_id) || null : u.company_id;
  if (role !== 'OWNER' && !company) throw new Error('لازم تحدد الشركة لهذا المستخدم');
  const agent = b.agent_ref !== undefined ? b.agent_ref || null : u.agent_ref;
  if (role === 'AGENT' && !agent) throw new Error('حساب المندوب لازم يرتبط بسجل وكيل/مندوب');
  db.prepare('UPDATE users SET role = ?, is_active = ?, display_name = ?, company_id = ?, branch_id = ?, agent_ref = ?, phone = ? WHERE id = ?')
    .run(role, active, b.display_name || u.display_name, company, b.branch_id !== undefined ? b.branch_id || null : u.branch_id, agent, b.phone !== undefined ? b.phone : u.phone, id);
  if (b.password) { validatePassword(b.password); db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password)), id); }
  if (b.password || !active || role !== u.role) db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id); // force re-login
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}
const listUsers = (companyId) => (companyId
  ? db.prepare('SELECT * FROM users WHERE company_id = ? OR company_id IS NULL ORDER BY id').all(companyId)
  : db.prepare('SELECT * FROM users ORDER BY id').all()).map(publicUser);
const getUser = (id) => publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
/**
 * Owner recovery (forgotten password): set OWNER_RESET_USERNAME + OWNER_RESET_PASSWORD in the hosting
 * environment and restart → that owner gets the new password (or is created if the system has no owner
 * with that username), all his sessions are closed. Remove the two variables after logging in.
 */
function resetOwnerFromEnv() {
  const username = String(process.env.OWNER_RESET_USERNAME || '').trim().toLowerCase(), pw = process.env.OWNER_RESET_PASSWORD;
  if (!username || !pw) return null;
  validatePassword(pw);
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (u) {
    db.prepare("UPDATE users SET password_hash = ?, role = 'OWNER', company_id = NULL, is_active = 1 WHERE id = ?").run(hashPassword(String(pw)), u.id);
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(u.id);
  } else createUser({ username, display_name: 'المالك', password: pw, role: 'OWNER' });
  db.prepare('INSERT INTO audit (user_id, company_id, action) VALUES (NULL, NULL, ?)').run(`استعادة حساب المالك ${username} من إعدادات السيرفر`);
  console.log(`[afwaj] owner account "${username}" password was reset from environment variables — remove OWNER_RESET_* now`);
  return username;
}
function authenticate(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!u || !u.is_active || !verifyPassword(String(password || ''), u.password_hash)) return null;
  return u;
}
const SESSION_DAYS = 14;
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(new Date().toISOString());
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

// ------------------------------------------------------------ companies
const listCompanies = () => db.prepare('SELECT id, name FROM companies ORDER BY id').all();
const getCompany = (id) => db.prepare('SELECT id, name FROM companies WHERE id = ?').get(id);
function createCompany(name, stateJson, by) {
  const id = Number(db.prepare('INSERT INTO companies (name) VALUES (?)').run(name).lastInsertRowid);
  db.prepare('INSERT INTO company_state (company_id, version, json, updated_by) VALUES (?, 1, ?, ?)').run(id, stateJson, by || null);
  return getCompany(id);
}
const renameCompany = (id, name) => db.prepare('UPDATE companies SET name = ? WHERE id = ?').run(name, id);

// ---------------------------------------------------------------- state
function getState(companyId) {
  const r = db.prepare('SELECT version, json, updated_at, updated_by FROM company_state WHERE company_id = ?').get(companyId);
  return r ? { version: r.version, json: r.json, updatedAt: r.updated_at, updatedBy: r.updated_by } : null;
}
const getVersion = (companyId) => { const r = db.prepare('SELECT version FROM company_state WHERE company_id = ?').get(companyId); return r ? r.version : 0; };
const KEEP_VERSIONS = 60;
/** Optimistic concurrency; the previous document goes to history so any save can be rolled back. */
function saveState(companyId, baseVersion, json, byName, label) {
  const cur = db.prepare('SELECT version, json FROM company_state WHERE company_id = ?').get(companyId);
  if (!cur) throw new Error('الشركة غير موجودة');
  if (cur.version !== Number(baseVersion)) return { ok: false };
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO state_versions (company_id, version, json, saved_by, label) VALUES (?, ?, ?, ?, ?)').run(companyId, cur.version, cur.json, byName || null, label || null);
    db.prepare("UPDATE company_state SET version = version + 1, json = ?, updated_at = datetime('now'), updated_by = ? WHERE company_id = ?").run(json, byName || null, companyId);
    // keep the last N unlabelled versions; labelled snapshots are kept forever
    db.prepare(`DELETE FROM state_versions WHERE company_id = ? AND label IS NULL AND id NOT IN
      (SELECT id FROM state_versions WHERE company_id = ? AND label IS NULL ORDER BY id DESC LIMIT ${KEEP_VERSIONS})`).run(companyId, companyId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true, version: cur.version + 1 };
}
function snapshot(companyId, label, byName) {
  const cur = db.prepare('SELECT version, json FROM company_state WHERE company_id = ?').get(companyId);
  db.prepare('INSERT INTO state_versions (company_id, version, json, saved_by, label) VALUES (?, ?, ?, ?, ?)').run(companyId, cur.version, cur.json, byName || null, label);
}
const listVersions = (companyId) => db.prepare('SELECT id, version, saved_at, saved_by, label, length(json) AS size FROM state_versions WHERE company_id = ? ORDER BY id DESC LIMIT 100').all(companyId);
const getVersionJson = (companyId, id) => { const r = db.prepare('SELECT json FROM state_versions WHERE company_id = ? AND id = ?').get(companyId, id); return r && r.json; };

// ---------------------------------------------------------------- files
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx', 'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/msword': '.doc', 'application/zip': '.zip', 'text/csv': '.csv' };
function saveFile(companyId, name, mime, buf, by) {
  if (!ALLOWED[mime]) throw new Error('نوع الملف غير مسموح (صور، PDF، Excel، Word، ZIP فقط)');
  if (!buf.length) throw new Error('ملف فارغ');
  const id = crypto.randomBytes(16).toString('hex');
  const dir = path.join(UPLOAD_DIR, String(companyId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id), buf);
  const safeName = String(name || 'file').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'file';
  db.prepare('INSERT INTO files (id, company_id, name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)').run(id, companyId, safeName, mime, buf.length, by || null);
  return { id, name: safeName, mime, size: buf.length };
}
function getFile(companyId, id) {
  if (!/^[a-f0-9]{32}$/.test(String(id))) return null;
  const f = db.prepare('SELECT * FROM files WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!f) return null;
  return { ...f, path: path.join(UPLOAD_DIR, String(companyId), f.id) };
}

// ---------------------------------------------------------------- chat
/** to: addressed user (optional) · priv: 1 = only sender + recipient can ever read it; 0 = everyone in the channel sees it, tagged to the person. */
function postChat(companyId, channel, user, text, fileId, to, priv) {
  text = String(text || '').slice(0, 4000);
  if (!text.trim() && !fileId) throw new Error('رسالة فارغة');
  const info = db.prepare('INSERT INTO chat_messages (company_id, channel, user_id, user_name, text, file_id, to_user_id, to_name, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(companyId, channel, user.id, user.display_name, text, fileId || null, to ? to.id : null, to ? to.display_name : null, to && priv ? 1 : 0);
  return Number(info.lastInsertRowid);
}
// Visibility is enforced here (not in the browser): a private message is returned only to its two parties.
const VISIBLE = '(m.private = 0 OR m.user_id = @me OR m.to_user_id = @me)';
function listChat(companyId, channel, since, meId, withId) {
  const where = channel === 'dm'
    ? `(m.channel = 'dm' OR m.private = 1) AND (m.user_id = @me OR m.to_user_id = @me)${withId ? ' AND (m.user_id = @w OR m.to_user_id = @w)' : ''}`
    : `m.channel = @ch AND ${VISIBLE}`;
  const stmt = db.prepare(`SELECT m.*, f.name AS file_name, f.mime AS file_mime FROM chat_messages m LEFT JOIN files f ON f.id = m.file_id
    WHERE m.company_id = @c AND ${where} AND m.id > @since ORDER BY m.id DESC LIMIT 200`);
  const params = { c: companyId, me: meId, since: Number(since) || 0 }; // node:sqlite rejects unused named parameters
  if (channel === 'dm') { if (withId) params.w = Number(withId) || 0; } else params.ch = channel;
  return stmt.all(params).reverse();
}
function markChatRead(userId, companyId, channel, lastId) {
  db.prepare('INSERT INTO chat_reads (user_id, company_id, channel, last_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, company_id, channel) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)')
    .run(userId, companyId, channel, Number(lastId) || 0);
}
const chatUnread = (userId, companyId) => db.prepare(`SELECT m.channel, COUNT(*) AS c, SUM(CASE WHEN m.to_user_id = @me THEN 1 ELSE 0 END) AS mine FROM chat_messages m
  LEFT JOIN chat_reads r ON r.user_id = @me AND r.company_id = m.company_id AND r.channel = m.channel
  WHERE m.company_id = @c AND m.id > COALESCE(r.last_id, 0) AND m.user_id <> @me AND ${VISIBLE} GROUP BY m.channel`).all({ me: userId, c: companyId });

// ------------------------------------------------------- notifications
function notify(companyId, { roles, userId, text, link }) {
  db.prepare('INSERT INTO notifications (company_id, roles, user_id, text, link) VALUES (?, ?, ?, ?, ?)').run(companyId, roles ? ',' + roles.join(',') + ',' : null, userId || null, text, link || null);
}
function listNotifications(user, companyId) {
  const rows = db.prepare(`SELECT * FROM notifications WHERE company_id = ? AND (user_id = ? OR roles LIKE ?) ORDER BY id DESC LIMIT 50`)
    .all(companyId, user.id, `%,${user.role},%`);
  const last = (db.prepare('SELECT last_id FROM notif_reads WHERE user_id = ?').get(user.id) || { last_id: 0 }).last_id;
  return { items: rows, unread: rows.filter((r) => r.id > last).length };
}
const markNotificationsRead = (userId, lastId) => db.prepare('INSERT INTO notif_reads (user_id, last_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').run(userId, Number(lastId) || 0);

// ------------------------------------------------------------------- kv
const kvGet = (k) => { const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const kvSet = (k, v) => db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const audit = (userId, companyId, action) => db.prepare('INSERT INTO audit (user_id, company_id, action) VALUES (?, ?, ?)').run(userId || null, companyId || null, action);
const listAudit = (companyId, limit = 200) => db.prepare('SELECT a.*, u.display_name FROM audit a LEFT JOIN users u ON u.id = a.user_id WHERE a.company_id = ? OR a.company_id IS NULL ORDER BY a.id DESC LIMIT ?').all(companyId, Math.min(3000, Math.max(1, Number(limit) || 200)));

// --------------------------------------------------------- full backup
/** Everything needed to rebuild the system on another machine (a flash drive copy). */
function exportAll() {
  const tables = ['companies', 'users', 'company_state', 'state_versions', 'files', 'chat_messages', 'notifications', 'kv'];
  const out = { app: 'umrah-erp', format: 1, exportedAt: new Date().toISOString(), tables: {}, blobs: {} };
  for (const t of tables) out.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  out.tables.state_versions = out.tables.state_versions.filter((v) => v.label); // keep labelled snapshots only (size)
  for (const f of out.tables.files) {
    const p = path.join(UPLOAD_DIR, String(f.company_id), f.id);
    if (fs.existsSync(p)) out.blobs[f.id] = fs.readFileSync(p).toString('base64');
  }
  return out;
}
function importAll(b) {
  if (!b || b.app !== 'umrah-erp' || !b.tables || !Array.isArray(b.tables.users)) throw new Error('ملف النسخة الاحتياطية غير صالح');
  if (!b.tables.users.some((u) => u.role === 'OWNER' && u.is_active)) throw new Error('النسخة لا تحتوي على حساب مالك نشط');
  fs.writeFileSync(path.join(BACKUP_DIR, `before-restore-${Date.now()}.json`), JSON.stringify(exportAll()));
  const cols = { companies: ['id', 'name', 'created_at'], users: ['id', 'username', 'display_name', 'password_hash', 'role', 'is_active', 'created_at', 'company_id', 'branch_id', 'agent_ref', 'phone'],
    company_state: ['company_id', 'version', 'json', 'updated_at', 'updated_by'], state_versions: ['id', 'company_id', 'version', 'json', 'saved_at', 'saved_by', 'label'],
    files: ['id', 'company_id', 'name', 'mime', 'size', 'uploaded_by', 'created_at'], chat_messages: ['id', 'company_id', 'channel', 'user_id', 'user_name', 'text', 'file_id', 'created_at', 'to_user_id', 'to_name', 'private'],
    notifications: ['id', 'company_id', 'roles', 'user_id', 'text', 'link', 'created_at'], kv: ['key', 'value'] };
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const t of ['auth_sessions', 'chat_reads', 'notif_reads', ...Object.keys(cols)]) db.exec(`DELETE FROM ${t}`);
    for (const [t, c] of Object.entries(cols)) {
      const st = db.prepare(`INSERT INTO ${t} (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`);
      for (const row of b.tables[t] || []) st.run(...c.map((k) => (row[k] == null ? (k === 'private' ? 0 : null) : row[k])));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); db.exec('PRAGMA foreign_keys = ON'); throw e; }
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of b.tables.files || []) {
    if (!b.blobs || !b.blobs[f.id] || !/^[a-f0-9]{32}$/.test(f.id)) continue;
    const dir = path.join(UPLOAD_DIR, String(Number(f.company_id)));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, f.id), Buffer.from(b.blobs[f.id], 'base64'));
  }
}
/** Daily automatic backup on the persistent disk (last 14 kept). */
function autoBackup() {
  const name = `auto-${new Date().toISOString().slice(0, 10)}.json`;
  const p = path.join(BACKUP_DIR, name);
  if (fs.existsSync(p) || !isSetup()) return;
  fs.writeFileSync(p, JSON.stringify(exportAll()));
  const autos = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('auto-')).sort();
  for (const f of autos.slice(0, Math.max(0, autos.length - 14))) fs.unlinkSync(path.join(BACKUP_DIR, f));
}

module.exports = {
  db, ROLES, STAFF_ROLES, PORTAL_ROLES, SESSION_DAYS, isSetup, setupOwner, createUser, updateUser, listUsers, getUser, authenticate,
  createSession, userFromSession, destroySession, publicUser, listCompanies, getCompany, createCompany, renameCompany,
  getState, getVersion, saveState, snapshot, listVersions, getVersionJson, saveFile, getFile,
  postChat, listChat, markChatRead, chatUnread, notify, listNotifications, markNotificationsRead, kvGet, kvSet, audit, listAudit,
  exportAll, importAll, autoBackup, resetOwnerFromEnv,
};
