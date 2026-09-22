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

function seedAccounts() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM accounts').get().c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO accounts (code, name, type, parent_code, is_postable) VALUES (?, ?, ?, ?, ?)'
  );
  for (const acc of CHART_OF_ACCOUNTS) {
    insert.run(acc.code, acc.name, acc.type, acc.parent_code, acc.is_postable);
  }
}
seedAccounts();

function accountIdByCode(code) {
  const row = db.prepare('SELECT id FROM accounts WHERE code = ?').get(code);
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

module.exports = { db, accountIdByCode, inTransaction, DB_PATH };
