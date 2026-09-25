const { db, accountIdByCode } = require('./db');

const EPS = 0.005; // فرق مسموح به لتقريب الكسور العشرية في الجنيه

const insertEntryStmt = db.prepare(
  'INSERT INTO journal_entries (company_id, entry_date, ref_type, ref_id, description) VALUES (?, ?, ?, ?, ?)'
);
const insertLineStmt = db.prepare(
  `INSERT INTO journal_lines (entry_id, account_id, branch_id, debit, credit, party_type, party_id, memo)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

/**
 * يرحّل قيد يومية بالقيد المزدوج على دفاتر منشأة معينة. لازم مجموع المدين = مجموع الدائن.
 * lines: [{ account_code, debit=0, credit=0, branch_id, party_type, party_id, memo }]
 * لو سطر معين ماحددش branch_id بيُستخدم branch_id الافتراضي المُمرر لكامل القيد (مفيد لعمليات
 * زي تحويل مخزون بين فرعين، لكل سطر فيها فرع مختلف).
 * لازم تتنفذ داخل معاملة (transaction) مع باقي عمليات الحركة.
 */
function postEntry({ company_id, branch_id, date, ref_type, ref_id, description, lines }) {
  if (!company_id) throw new Error('لازم تحديد المنشأة عند ترحيل أي قيد');
  const cleanLines = (lines || []).filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0);
  if (cleanLines.length === 0) throw new Error('لا يمكن ترحيل قيد بدون سطور');

  const totalDebit = cleanLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = cleanLines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > EPS) {
    throw new Error(
      `القيد غير متزن: مدين ${totalDebit.toFixed(2)} لا يساوي دائن ${totalCredit.toFixed(2)}`
    );
  }

  const info = insertEntryStmt.run(company_id, date, ref_type, ref_id ?? null, description ?? null);
  const entryId = info.lastInsertRowid;

  for (const line of cleanLines) {
    const accountId = accountIdByCode(company_id, line.account_code);
    insertLineStmt.run(
      entryId,
      accountId,
      line.branch_id ?? branch_id ?? null,
      line.debit || 0,
      line.credit || 0,
      line.party_type || null,
      line.party_id ?? null,
      line.memo || null
    );
  }
  return entryId;
}

/** رصيد حساب معين لمنشأة (اختياريًا لفرع محدد فقط) */
function accountBalance(companyId, code, branchId) {
  const acc = db.prepare('SELECT * FROM accounts WHERE company_id = ? AND code = ?').get(companyId, code);
  if (!acc) return 0;
  const branchFilter = branchId ? 'AND jl.branch_id = ?' : '';
  const params = branchId ? [acc.id, branchId] : [acc.id];
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
       FROM journal_lines jl WHERE jl.account_id = ? ${branchFilter}`
    )
    .get(...params);
  const natural = acc.type === 'asset' || acc.type === 'expense' ? 1 : -1;
  return natural * (row.d - row.c);
}

/** رصيد طرف (عميل/مورد/شريك) على حساب معين */
function partyBalance(companyId, accountCode, partyType, partyId) {
  const accountId = accountIdByCode(companyId, accountCode);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
       FROM journal_lines WHERE account_id = ? AND party_type = ? AND party_id = ?`
    )
    .get(accountId, partyType, partyId);
  return row.d - row.c;
}

module.exports = { postEntry, accountBalance, partyBalance, EPS };
