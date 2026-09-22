const { db, accountIdByCode } = require('./db');

const EPS = 0.005; // فرق مسموح به لتقريب الكسور العشرية في الجنيه

const insertEntryStmt = db.prepare(
  'INSERT INTO journal_entries (entry_date, ref_type, ref_id, description) VALUES (?, ?, ?, ?)'
);
const insertLineStmt = db.prepare(
  `INSERT INTO journal_lines (entry_id, account_id, debit, credit, party_type, party_id, memo)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

/**
 * يرحّل قيد يومية بالقيد المزدوج. لازم مجموع المدين = مجموع الدائن.
 * lines: [{ account_code, debit=0, credit=0, party_type, party_id, memo }]
 * لازم تتنفذ داخل معاملة (transaction) مع باقي عمليات الحركة.
 */
function postEntry({ date, ref_type, ref_id, description, lines }) {
  const cleanLines = (lines || []).filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0);
  if (cleanLines.length === 0) throw new Error('لا يمكن ترحيل قيد بدون سطور');

  const totalDebit = cleanLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = cleanLines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > EPS) {
    throw new Error(
      `القيد غير متزن: مدين ${totalDebit.toFixed(2)} لا يساوي دائن ${totalCredit.toFixed(2)}`
    );
  }

  const info = insertEntryStmt.run(date, ref_type, ref_id ?? null, description ?? null);
  const entryId = info.lastInsertRowid;

  for (const line of cleanLines) {
    const accountId = accountIdByCode(line.account_code);
    insertLineStmt.run(
      entryId,
      accountId,
      line.debit || 0,
      line.credit || 0,
      line.party_type || null,
      line.party_id ?? null,
      line.memo || null
    );
  }
  return entryId;
}

function accountBalance(code) {
  const acc = db.prepare('SELECT * FROM accounts WHERE code = ?').get(code);
  if (!acc) return 0;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
       FROM journal_lines WHERE account_id = ?`
    )
    .get(acc.id);
  const natural = acc.type === 'asset' || acc.type === 'expense' ? 1 : -1;
  return natural * (row.d - row.c);
}

/** رصيد طرف (عميل/مورد) على حساب معين (مثلاً حساب العملاء أو الموردين) */
function partyBalance(accountCode, partyType, partyId) {
  const accountId = accountIdByCode(accountCode);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
       FROM journal_lines WHERE account_id = ? AND party_type = ? AND party_id = ?`
    )
    .get(accountId, partyType, partyId);
  return row.d - row.c; // موجب = مدين له (عميل: يستحق عليه، مورد: مدفوع له زيادة)
}

module.exports = { postEntry, accountBalance, partyBalance, EPS };
