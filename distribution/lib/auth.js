const crypto = require('crypto');
const { db } = require('./db');

const SESSION_DAYS = 30;
const ROLES = ['owner', 'accountant', 'sales', 'warehouse', 'partner'];

/** الشريك بيتقفل تلقائيًا على نفس فرع سجل الشريك بتاعه (أو كل الفروع لو الشراكة على مستوى الشركة كلها) */
function resolvePartnerLink(companyId, role, partnerId) {
  if (role !== 'partner') return { partnerId: null, branchId: null };
  if (!partnerId) throw new Error('لازم تحدد الشريك المرتبط بحساب الدخول ده');
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId);
  if (!partner || partner.company_id !== companyId) throw new Error('الشريك ده مش تابع لنفس المنشأة');
  return { partnerId: partner.id, branchId: partner.branch_id || null };
}

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

function isSetup() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

/** أول مستخدم في النظام - دايمًا مالك (owner) بصلاحية كاملة وبدون قفل على منشأة معينة */
function setupOwner({ username, password }) {
  if (isSetup()) throw new Error('النظام متضبط بالفعل - استخدم تسجيل الدخول');
  return createUser({ username, password, role: 'owner', company_id: null, branch_id: null });
}

function createUser({
  username, password, role, company_id, branch_id, phone,
  notify_new_invoices, notify_trip_start, notify_new_expenses, notify_expiry_alerts,
  commission_pct, partner_id,
}) {
  username = String(username || '').trim();
  if (username.length < 3) throw new Error('اسم المستخدم لازم يكون 3 حروف على الأقل');
  if (!password || String(password).length < 8) {
    throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
  }
  if (!ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) throw new Error('اسم المستخدم ده مستخدم بالفعل');
  if (role !== 'owner' && !company_id) throw new Error('لازم تحدد المنشأة لهذا المستخدم');
  const anyNotify = notify_new_invoices || notify_trip_start || notify_new_expenses || notify_expiry_alerts;
  if (anyNotify && (!phone || !String(phone).trim())) {
    throw new Error('لازم تسجل رقم هاتف المستخدم عشان تقدر تفعّل أي تنبيه على واتساب');
  }
  const link = resolvePartnerLink(company_id, role, partner_id);
  const finalBranchId = role === 'partner' ? link.branchId : branch_id || null;

  const commission = commission_pct === undefined || commission_pct === '' || commission_pct === null ? null : Number(commission_pct);
  const info = db
    .prepare(
      `INSERT INTO users (company_id, branch_id, username, password_hash, role, phone, notify_new_invoices, notify_trip_start, notify_new_expenses, notify_expiry_alerts, commission_pct, partner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      company_id || null, finalBranchId, username, hashPassword(String(password)), role, phone || null,
      notify_new_invoices ? 1 : 0, notify_trip_start ? 1 : 0, notify_new_expenses ? 1 : 0, notify_expiry_alerts ? 1 : 0,
      commission, link.partnerId
    );
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
}

function updateUser(id, {
  role, company_id, branch_id, is_active, password, phone,
  notify_new_invoices, notify_trip_start, notify_new_expenses, notify_expiry_alerts,
  commission_pct, partner_id,
}) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new Error('مستخدم غير موجود');
  if (role && !ROLES.includes(role)) throw new Error('صلاحية غير معروفة');
  const nextRole = role || user.role;
  const nextCompany = nextRole === 'owner' ? null : company_id ?? user.company_id;
  if (nextRole !== 'owner' && !nextCompany) throw new Error('لازم تحدد المنشأة لهذا المستخدم');
  const nextPhone = phone !== undefined ? (phone || null) : user.phone;
  const nextNotifyInvoices = notify_new_invoices !== undefined ? (notify_new_invoices ? 1 : 0) : user.notify_new_invoices;
  const nextNotifyTripStart = notify_trip_start !== undefined ? (notify_trip_start ? 1 : 0) : user.notify_trip_start;
  const nextNotifyExpenses = notify_new_expenses !== undefined ? (notify_new_expenses ? 1 : 0) : user.notify_new_expenses;
  const nextNotifyExpiry = notify_expiry_alerts !== undefined ? (notify_expiry_alerts ? 1 : 0) : user.notify_expiry_alerts;
  const nextActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;
  const nextCommission = commission_pct !== undefined ? (commission_pct === '' || commission_pct === null ? null : Number(commission_pct)) : user.commission_pct;
  if ((nextNotifyInvoices || nextNotifyTripStart || nextNotifyExpenses || nextNotifyExpiry) && (!nextPhone || !String(nextPhone).trim())) {
    throw new Error('لازم تسجل رقم هاتف المستخدم عشان تقدر تفعّل أي تنبيه على واتساب');
  }
  const nextPartnerId = partner_id !== undefined ? partner_id : user.partner_id;
  const link = resolvePartnerLink(nextCompany, nextRole, nextPartnerId);
  const nextBranch = nextRole === 'owner' ? null : nextRole === 'partner' ? link.branchId : branch_id ?? user.branch_id;

  db.prepare(
    `UPDATE users SET role = ?, company_id = ?, branch_id = ?, is_active = ?, phone = ?,
       notify_new_invoices = ?, notify_trip_start = ?, notify_new_expenses = ?, notify_expiry_alerts = ?,
       commission_pct = ?, partner_id = ? WHERE id = ?`
  ).run(
    nextRole, nextCompany, nextBranch, nextActive, nextPhone,
    nextNotifyInvoices, nextNotifyTripStart, nextNotifyExpenses, nextNotifyExpiry,
    nextCommission, link.partnerId, id
  );

  if (password) {
    if (String(password).length < 8) throw new Error('كلمة السر لازم تكون 8 حروف أو أرقام على الأقل');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), id);
  }
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function listUsers(companyId) {
  const rows = companyId
    ? db.prepare('SELECT * FROM users WHERE company_id = ? OR company_id IS NULL ORDER BY id').all(companyId)
    : db.prepare('SELECT * FROM users ORDER BY id').all();
  return rows.map(publicUser);
}

function authenticate(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user || !user.is_active) return null;
  if (!verifyPassword(String(password || ''), user.password_hash)) return null;
  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

/** بيرجع صف المستخدم الكامل (مش النسخة العامة) عشان نعرف صلاحياته/منشأته المقفول عليها */
function userFromSession(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.expires_at, u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }
  if (!row.is_active) return null;
  return row;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}

module.exports = {
  ROLES,
  isSetup,
  setupOwner,
  createUser,
  updateUser,
  listUsers,
  authenticate,
  createSession,
  userFromSession,
  destroySession,
  publicUser,
  SESSION_DAYS,
};
