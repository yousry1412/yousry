const { db } = require('./db');

/** يتوقع رقم الـ id التالي لجدول معين (يعتمد على AUTOINCREMENT) لبناء رقم مستند متسلسل */
function peekNextId(table) {
  const row = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table);
  return (row ? row.seq : 0) + 1;
}

function nextNumber(table, prefix) {
  const id = peekNextId(table);
  return `${prefix}-${String(id).padStart(6, '0')}`;
}

module.exports = { nextNumber };
