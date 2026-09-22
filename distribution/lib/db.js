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
ensureColumn('sales_invoices', 'subtotal', 'subtotal REAL NOT NULL DEFAULT 0');
ensureColumn('sales_invoices', 'vat_amount', 'vat_amount REAL NOT NULL DEFAULT 0');
ensureColumn('sales_invoices', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('purchase_invoices', 'subtotal', 'subtotal REAL NOT NULL DEFAULT 0');
ensureColumn('purchase_invoices', 'vat_amount', 'vat_amount REAL NOT NULL DEFAULT 0');
ensureColumn('purchase_invoices', 'latitude', 'latitude REAL');
ensureColumn('purchase_invoices', 'longitude', 'longitude REAL');
ensureColumn('purchase_invoices', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('companies', 'country', "country TEXT NOT NULL DEFAULT 'مصر'");
ensureColumn('companies', 'vat_enabled', 'vat_enabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('companies', 'vat_rate', 'vat_rate REAL NOT NULL DEFAULT 0');
ensureColumn('companies', 'geofence_radius_m', 'geofence_radius_m REAL NOT NULL DEFAULT 300');
ensureColumn('suppliers', 'latitude', 'latitude REAL');
ensureColumn('suppliers', 'longitude', 'longitude REAL');
ensureColumn('suppliers', 'geofence_radius_m', 'geofence_radius_m REAL');
ensureColumn('trips', 'responsible_employee_id', 'responsible_employee_id INTEGER REFERENCES employees(id)');
ensureColumn('products', 'category_id', 'category_id INTEGER REFERENCES product_categories(id)');
ensureColumn('purchase_items', 'unit_id', 'unit_id INTEGER REFERENCES product_units(id)');
ensureColumn('purchase_items', 'unit_qty', 'unit_qty REAL');
ensureColumn('sales_items', 'unit_id', 'unit_id INTEGER REFERENCES product_units(id)');
ensureColumn('sales_items', 'unit_qty', 'unit_qty REAL');
ensureColumn('partners', 'branch_id', 'branch_id INTEGER REFERENCES branches(id)');
ensureColumn('fiscal_closings', 'branch_id', 'branch_id INTEGER REFERENCES branches(id)');
ensureColumn('damages', 'responsible_employee_id', 'responsible_employee_id INTEGER REFERENCES employees(id)');
ensureColumn('damages', 'responsible_name', 'responsible_name TEXT');
ensureColumn('damages', 'photo_data', 'photo_data TEXT');
// تتبع "مين عمل العملية" على كل الجداول المالية اللي كانت ناقصاه - مهم للرقابة والشفافية
// بين الشركاء والموظفين لو حصل أي خلاف على مين المسؤول عن عملية معينة
ensureColumn('vouchers', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('damages', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('stock_adjustments', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('stock_transfers', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('production_orders', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('expenses', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('trip_loads', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('trip_loads', 'created_at', "created_at TEXT NOT NULL DEFAULT ''");
ensureColumn('trip_returns', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('trip_returns', 'created_at', "created_at TEXT NOT NULL DEFAULT ''");
ensureColumn('trip_expenses', 'created_by_user_id', 'created_by_user_id INTEGER REFERENCES users(id)');
// آلية عكس قيد رسمية للسندات والتوالف بدل أي تعديل/حذف مباشر لمستند مالي مرحّل
ensureColumn('vouchers', 'is_reversed', 'is_reversed INTEGER NOT NULL DEFAULT 0');
ensureColumn('vouchers', 'reversed_at', 'reversed_at TEXT');
ensureColumn('vouchers', 'reversed_by_user_id', 'reversed_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('vouchers', 'reversal_reason', 'reversal_reason TEXT');
ensureColumn('damages', 'is_reversed', 'is_reversed INTEGER NOT NULL DEFAULT 0');
ensureColumn('damages', 'reversed_at', 'reversed_at TEXT');
ensureColumn('damages', 'reversed_by_user_id', 'reversed_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('damages', 'reversal_reason', 'reversal_reason TEXT');

// بعض القيود القديمة (CHECK على party_type/voucher_type) كانت بتمنع قيم جديدة زي 'employee' -
// SQLite مسمحش بتعديل CHECK مباشرة، فلو لقينا الجدول لسه شايل القيد القديم، بنعيد إنشاءه بنفس البيانات
function dropCheckConstraintIfPresent(table, oldCheckSnippet, recreateSql) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`).get(table);
  if (!row || !row.sql.includes(oldCheckSnippet)) return;
  db.exec('BEGIN');
  try {
    const oldCols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old_migration`);
    db.exec(recreateSql);
    const newCols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    // بنستخدم بس الأعمدة المشتركة بين الجدول القديم والجديد - لو recreateSql ضاف عمود جديد
    // (زي trip_id) ماكانش موجود في الجدول القديم، هيتسيب NULL افتراضيًا بدل ما نكسر النسخ
    const cols = newCols.filter((c) => oldCols.includes(c));
    db.exec(`INSERT INTO ${table} (${cols.join(',')}) SELECT ${cols.join(',')} FROM ${table}_old_migration`);
    db.exec(`DROP TABLE ${table}_old_migration`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
dropCheckConstraintIfPresent(
  'journal_lines',
  "party_type IN ('customer','supplier','partner')",
  `CREATE TABLE journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    branch_id INTEGER REFERENCES branches(id),
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    party_type TEXT,
    party_id INTEGER,
    memo TEXT
  )`
);
dropCheckConstraintIfPresent(
  'vouchers',
  "party_type IN ('customer','supplier','partner','other')",
  `CREATE TABLE vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    branch_id INTEGER REFERENCES branches(id),
    voucher_no TEXT UNIQUE NOT NULL,
    voucher_type TEXT NOT NULL,
    party_type TEXT NOT NULL,
    party_id INTEGER,
    party_name TEXT,
    other_account_code TEXT,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank')),
    voucher_date TEXT NOT NULL,
    trip_id INTEGER REFERENCES trips(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
);
ensureColumn('vouchers', 'trip_id', 'trip_id INTEGER REFERENCES trips(id)');
ensureColumn('trips', 'odometer_start', 'odometer_start REAL');
ensureColumn('trips', 'odometer_end', 'odometer_end REAL');
// تحميلات قديمة كانت بتتحرك من المخزن فورًا وقت التسجيل (قبل ما نضيف خطوة موافقة السائق)،
// فلازم تتعامل معاها كـ"معتمدة" مش "معلّقة" - وإلا هتظهر وكأنها لسه محتاجة موافقة رغم إنها اتصرفت فعلاً.
ensureColumn('trip_loads', 'status', "status TEXT NOT NULL DEFAULT 'approved'");
ensureColumn('trip_loads', 'approved_by_user_id', 'approved_by_user_id INTEGER REFERENCES users(id)');
ensureColumn('trip_loads', 'approved_at', 'approved_at TEXT');
ensureColumn('trip_loads', 'rejected_reason', 'rejected_reason TEXT');
dropCheckConstraintIfPresent(
  'trip_expenses',
  "paid_from IN ('cash','bank')",
  `CREATE TABLE trip_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK(category IN ('fuel','rent','maintenance','toll','other')),
    amount REAL NOT NULL,
    paid_from TEXT NOT NULL DEFAULT 'cash',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
);

function ensureAccountsUpToDate() {
  const companies = db.prepare('SELECT id FROM companies').all();
  const insert = db.prepare(
    'INSERT INTO accounts (company_id, code, name, type, parent_code, is_postable, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const { id: companyId } of companies) {
    const existingCodes = new Set(db.prepare('SELECT code FROM accounts WHERE company_id = ?').all(companyId).map((r) => r.code));
    for (const acc of CHART_OF_ACCOUNTS) {
      if (!existingCodes.has(acc.code)) insert.run(companyId, acc.code, acc.name, acc.type, acc.parent_code, acc.is_postable);
    }
  }
}

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
ensureAccountsUpToDate();

function accountIdByCode(companyId, code) {
  const row = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, code);
  if (!row) throw new Error(`حساب غير موجود بالكود: ${code}`);
  return row.id;
}

// بعض العمليات (زي تسوية الرحلة) بتنادي عمليات تانية بتفتح معاملة بنفسها (زي تسجيل توالف) -
// عداد العمق ده بيخلي بس أقدم نداء هو اللي بيفتح/يقفل المعاملة الفعلية، والنداءات المتداخلة
// بتشارك في نفس المعاملة بدل ما تحاول تفتح معاملة جوه معاملة (SQLite مش بيسمح بده)
let transactionDepth = 0;
function inTransaction(fn) {
  const isOutermost = transactionDepth === 0;
  if (isOutermost) db.exec('BEGIN');
  transactionDepth++;
  try {
    const result = fn();
    transactionDepth--;
    if (isOutermost) db.exec('COMMIT');
    return result;
  } catch (err) {
    transactionDepth--;
    if (isOutermost) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        /* ignore rollback failure */
      }
    }
    throw err;
  }
}

module.exports = { db, accountIdByCode, inTransaction, seedChartForCompany, DB_PATH };
