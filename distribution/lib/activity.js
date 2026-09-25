const { db } = require('./db');

/**
 * سجل نشاط إداري مستهدف - بيسجل بس العمليات الإدارية الحساسة (دخول، تعديل مستخدمين،
 * عقود وقوائم أسعار، عكس قيود) عشان يوريك "مين عمل إيه" بدون ما يلمس أو يبطّئ محرك
 * العمليات المالية الأساسي (اللي أصلاً متتبّع بالكامل عن طريق created_by_user_id
 * ودفتر اليومية مع شرح كل عملية).
 */
function logActivity({ company_id, user_id, action, entity_type, entity_id, description }) {
  try {
    db.prepare(
      `INSERT INTO activity_log (company_id, user_id, action, entity_type, entity_id, description) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(company_id || null, user_id || null, action, entity_type || null, entity_id || null, description || null);
  } catch (_) {
    // سجل النشاط إضافي/معلوماتي - فشل تسجيله مايوقفش العملية الأساسية
  }
}

function listActivityLog(companyId, { limit } = {}) {
  const cap = Math.min(Number(limit) || 200, 1000);
  return db
    .prepare(
      `SELECT al.*, u.username FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
       WHERE al.company_id = ? OR al.company_id IS NULL
       ORDER BY al.id DESC LIMIT ?`
    )
    .all(companyId, cap);
}

module.exports = { logActivity, listActivityLog };
