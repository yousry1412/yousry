const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { CHART_OF_ACCOUNTS } = require('./accounts');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ترقيات خفيفة لقواعد بيانات قديمة اتعملها CREATE قبل إضافة أعمدة جديدة
// (CREATE TABLE IF NOT EXISTS مبيلمسش جدول موجود فعلاً)
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('sales_invoices', 'latitude', 'latitude REAL');
ensureColumn('sales_invoices', 'longitude', 'longitude REAL');

function seedChartForCompany(companyId) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM accounts WHERE company_id = ?').get(companyId).c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO accounts (company_id, code, name, type, parent_code, is_postable, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const acc of CHART_OF_ACCOUNTS) {
    insert.run(companyId, acc.code, acc.name, acc.type, acc.parent_code, acc.is_postable);
  }
}

function ensureDefaultCompany() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM companies').get().c;
  if (count > 0) return;
  const companyInfo = db
    .prepare('INSERT INTO companies (name, legal_name) VALUES (?, ?)')
    .run('الشركة الرئيسية', 'الشركة الرئيسية');
  const companyId = companyInfo.lastInsertRowid;
  db.prepare('INSERT INTO branches (company_id, name, is_main) VALUES (?, ?, 1)').run(companyId, 'الفرع الرئيسي');
  seedChartForCompany(companyId);
}
ensureDefaultCompany();

function accountIdByCode(companyId, code) {
  const row = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, code);
  if (!row) throw new Error(`حساب غير موجود بالكود: ${code}`);
  return row.id;
}

function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {
      /* ignore rollback failure */
    }
    throw err;
  }
}

module.exports = { db, accountIdByCode, inTransaction, seedChartForCompany, DB_PATH };
