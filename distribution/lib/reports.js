const { db } = require('./db');
const { accountBalance } = require('./accounting');
const { ACC } = require('./accounts');
const { tripRemainingQty } = require('./services');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// ميزان المراجعة
// ---------------------------------------------------------------------------

function trialBalance(companyId, branchId) {
  const accounts = db
    .prepare('SELECT * FROM accounts WHERE company_id = ? AND is_postable = 1 ORDER BY code')
    .all(companyId);
  const branchFilter = branchId ? 'AND branch_id = ?' : '';
  const rows = accounts.map((acc) => {
    const params = branchId ? [acc.id, branchId] : [acc.id];
    const sums = db
      .prepare(`SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c FROM journal_lines WHERE account_id = ? ${branchFilter}`)
      .get(...params);
    const net = round2(sums.d - sums.c);
    return {
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    };
  });
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows: rows.filter((r) => r.debit !== 0 || r.credit !== 0), totalDebit, totalCredit };
}

// ---------------------------------------------------------------------------
// قائمة الدخل
// ---------------------------------------------------------------------------

function incomeStatement(companyId, { from, to, branchId } = {}) {
  const conditions = [];
  const baseParams = [];
  if (from && to) {
    conditions.push('je.entry_date BETWEEN ? AND ?');
    baseParams.push(from, to);
  }
  if (branchId) {
    conditions.push('jl.branch_id = ?');
    baseParams.push(branchId);
  }
  const dateFilter = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const accounts = db
    .prepare(`SELECT * FROM accounts WHERE company_id = ? AND is_postable = 1 AND type IN ('revenue','expense') ORDER BY code`)
    .all(companyId);

  const lines = accounts.map((acc) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE jl.account_id = ? ${dateFilter}`
      )
      .get(acc.id, ...baseParams);
    const amount = acc.type === 'revenue' ? round2(sums.c - sums.d) : round2(sums.d - sums.c);
    return { code: acc.code, name: acc.name, type: acc.type, amount };
  });

  const revenue = round2(lines.filter((l) => l.type === 'revenue').reduce((s, l) => s + l.amount, 0));
  const expense = round2(lines.filter((l) => l.type === 'expense').reduce((s, l) => s + l.amount, 0));
  const netProfit = round2(revenue - expense);

  return { lines: lines.filter((l) => l.amount !== 0), revenue, expense, netProfit, from, to };
}

// ---------------------------------------------------------------------------
// المركز المالي (ميزانية مبسطة)
// ---------------------------------------------------------------------------

function balanceSheet(companyId, { asOf, branchId } = {}) {
  const conditions = [];
  const baseParams = [];
  if (asOf) {
    conditions.push('je.entry_date <= ?');
    baseParams.push(asOf);
  }
  if (branchId) {
    conditions.push('jl.branch_id = ?');
    baseParams.push(branchId);
  }
  const dateFilter = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  function typeBalances(type) {
    const accounts = db
      .prepare('SELECT * FROM accounts WHERE company_id = ? AND is_postable = 1 AND type = ? ORDER BY code')
      .all(companyId, type);
    const natural = type === 'asset' || type === 'expense' ? 1 : -1;
    const rows = accounts.map((acc) => {
      const sums = db
        .prepare(
          `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
           FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
           WHERE jl.account_id = ? ${dateFilter}`
        )
        .get(acc.id, ...baseParams);
      return { code: acc.code, name: acc.name, balance: round2(natural * (sums.d - sums.c)) };
    });
    return rows.filter((r) => r.balance !== 0);
  }

  const assets = typeBalances('asset');
  const liabilities = typeBalances('liability');
  const equity = typeBalances('equity');

  const totalAssets = round2(assets.reduce((s, r) => s + r.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.balance, 0));
  const totalEquityDeclared = round2(equity.reduce((s, r) => s + r.balance, 0));

  const income = incomeStatement(companyId, asOf ? { from: '0000-01-01', to: asOf, branchId } : { branchId });
  const netIncomeToDate = income.netProfit;
  const totalEquity = round2(totalEquityDeclared + netIncomeToDate);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquityDeclared,
    netIncomeToDate,
    totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    asOf,
  };
}

// ---------------------------------------------------------------------------
// كشوف حسابات العملاء والموردين
// ---------------------------------------------------------------------------

function customerStatement(companyId, customerId) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(customerId, companyId);
  if (!customer) throw new Error('عميل غير موجود');
  const accountId = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.AR).id;
  const lines = db
    .prepare(
      `SELECT je.entry_date, je.description, jl.debit, jl.credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_id = ? AND jl.party_type = 'customer' AND jl.party_id = ?
       ORDER BY je.entry_date, je.id`
    )
    .all(accountId, customerId);
  let balance = 0;
  const rows = lines.map((l) => {
    balance = round2(balance + l.debit - l.credit);
    return { ...l, balance };
  });
  return { customer, rows, balance };
}

function supplierStatement(companyId, supplierId) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(supplierId, companyId);
  if (!supplier) throw new Error('مورد غير موجود');
  const accountId = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.AP).id;
  const lines = db
    .prepare(
      `SELECT je.entry_date, je.description, jl.debit, jl.credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_id = ? AND jl.party_type = 'supplier' AND jl.party_id = ?
       ORDER BY je.entry_date, je.id`
    )
    .all(accountId, supplierId);
  let balance = 0;
  const rows = lines.map((l) => {
    balance = round2(balance + l.credit - l.debit);
    return { ...l, balance };
  });
  return { supplier, rows, balance };
}

function allCustomerBalances(companyId) {
  const customers = db.prepare('SELECT * FROM customers WHERE company_id = ? AND is_active = 1 ORDER BY name').all(companyId);
  const accountId = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.AR).id;
  return customers.map((c) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
         FROM journal_lines WHERE account_id = ? AND party_type='customer' AND party_id = ?`
      )
      .get(accountId, c.id);
    return { ...c, balance: round2(sums.d - sums.c) };
  });
}

function allSupplierBalances(companyId) {
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE company_id = ? AND is_active = 1 ORDER BY name').all(companyId);
  const accountId = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.AP).id;
  return suppliers.map((s) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
         FROM journal_lines WHERE account_id = ? AND party_type='supplier' AND party_id = ?`
      )
      .get(accountId, s.id);
    return { ...s, balance: round2(sums.c - sums.d) };
  });
}

// ---------------------------------------------------------------------------
// المخزون
// ---------------------------------------------------------------------------

function inventoryValuation(companyId, branchId) {
  let rows;
  if (branchId) {
    rows = db
      .prepare(
        `SELECT p.*, COALESCE(ps.qty_on_hand,0) AS qty_on_hand, COALESCE(ps.cost_price,0) AS cost_price
         FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.branch_id = ?
         WHERE p.company_id = ? AND p.is_active = 1 ORDER BY p.kind, p.name`
      )
      .all(branchId, companyId);
  } else {
    rows = db
      .prepare(
        `SELECT p.*, COALESCE(SUM(ps.qty_on_hand),0) AS qty_on_hand,
                CASE WHEN COALESCE(SUM(ps.qty_on_hand),0) > 0
                     THEN SUM(ps.qty_on_hand * ps.cost_price) / SUM(ps.qty_on_hand)
                     ELSE 0 END AS cost_price
         FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id
         WHERE p.company_id = ? AND p.is_active = 1 GROUP BY p.id ORDER BY p.kind, p.name`
      )
      .all(companyId);
  }
  const withValue = rows.map((p) => ({
    ...p,
    value: round2(p.qty_on_hand * p.cost_price),
    low_stock: p.qty_on_hand <= p.reorder_level,
  }));
  const totalValue = round2(withValue.reduce((s, r) => s + r.value, 0));
  return { rows: withValue, totalValue };
}

// ---------------------------------------------------------------------------
// تسوية الرحلة
// ---------------------------------------------------------------------------

function tripSettlementReport(tripId) {
  const trip = db
    .prepare(
      `SELECT t.*, v.name AS vehicle_name, v.ownership FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ?`
    )
    .get(tripId);
  if (!trip) throw new Error('رحلة غير موجودة');

  const products = db
    .prepare('SELECT DISTINCT product_id FROM trip_loads WHERE trip_id = ?')
    .all(tripId);

  const reconciliation = products.map((row) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(row.product_id);
    const loaded = db
      .prepare('SELECT COALESCE(SUM(qty_loaded),0) AS q FROM trip_loads WHERE trip_id=? AND product_id=?')
      .get(tripId, row.product_id).q;
    const sold = db
      .prepare(
        `SELECT COALESCE(SUM(si.qty),0) AS q FROM sales_items si
         JOIN sales_invoices sv ON sv.id = si.invoice_id
         WHERE sv.trip_id = ? AND si.product_id = ?`
      )
      .get(tripId, row.product_id).q;
    const returned = db
      .prepare('SELECT COALESCE(SUM(qty_returned),0) AS q FROM trip_returns WHERE trip_id=? AND product_id=?')
      .get(tripId, row.product_id).q;
    const damaged = db
      .prepare('SELECT COALESCE(SUM(qty),0) AS q FROM damages WHERE trip_id=? AND product_id=?')
      .get(tripId, row.product_id).q;
    return {
      product_id: row.product_id,
      product_name: product.name,
      unit: product.unit,
      loaded,
      sold,
      returned,
      damaged,
      remaining: tripRemainingQty(tripId, row.product_id),
    };
  });

  const salesTotal = db
    .prepare('SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE trip_id = ?')
    .get(tripId).s;
  const expensesTotal = db
    .prepare('SELECT COALESCE(SUM(amount),0) AS s FROM trip_expenses WHERE trip_id = ?')
    .get(tripId).s;
  const cogsTotal = db
    .prepare(
      `SELECT COALESCE(SUM(si.qty * si.unit_cost),0) AS s FROM sales_items si
       JOIN sales_invoices sv ON sv.id = si.invoice_id WHERE sv.trip_id = ?`
    )
    .get(tripId).s;
  const damagesTotal = db
    .prepare('SELECT COALESCE(SUM(qty * unit_cost),0) AS s FROM damages WHERE trip_id = ?')
    .get(tripId).s;

  const grossProfit = round2(salesTotal - cogsTotal);
  const netResult = round2(grossProfit - expensesTotal - damagesTotal);

  return {
    trip,
    reconciliation,
    financials: {
      salesTotal: round2(salesTotal),
      cogsTotal: round2(cogsTotal),
      grossProfit,
      expensesTotal: round2(expensesTotal),
      damagesTotal: round2(damagesTotal),
      netResult,
    },
  };
}

// ---------------------------------------------------------------------------
// حقوق الشركاء والتدفقات النقدية والإقفالات
// ---------------------------------------------------------------------------

function partnersEquityStatement(companyId, { from, to } = {}) {
  const partners = db.prepare('SELECT * FROM partners WHERE company_id = ? ORDER BY name').all(companyId);
  const capAcc = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.CAPITAL);
  const drawAcc = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.DRAWINGS);
  const dateFilter = from && to ? 'AND je.entry_date BETWEEN ? AND ?' : '';
  const dateParams = from && to ? [from, to] : [];

  function sumFor(accountId, partnerId, refType) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE jl.account_id = ? AND jl.party_type = 'partner' AND jl.party_id = ? AND je.ref_type = ? ${dateFilter}`
      )
      .get(accountId, partnerId, refType, ...dateParams);
    return row;
  }

  return partners.map((p) => {
    const contribRow = sumFor(capAcc.id, p.id, 'voucher');
    const profitRow = sumFor(capAcc.id, p.id, 'closing');
    const drawRow = sumFor(drawAcc.id, p.id, 'voucher');
    const contributions = round2(contribRow.c - contribRow.d);
    const profitShare = round2(profitRow.c - profitRow.d);
    const drawings = round2(drawRow.d - drawRow.c);
    const netEquity = round2(contributions + profitShare - drawings);
    return {
      partner_id: p.id,
      name: p.name,
      share_percentage: p.share_percentage,
      contributions,
      profitShare,
      drawings,
      netEquity,
    };
  });
}

function cashFlowStatement(companyId, { from, to, branchId } = {}) {
  const cashAccounts = db
    .prepare('SELECT id FROM accounts WHERE company_id = ? AND code IN (?, ?)')
    .all(companyId, ACC.CASH, ACC.BANK);
  const ids = cashAccounts.map((a) => a.id);
  if (ids.length === 0) return { operating: 0, financing: 0, netChange: 0, openingCash: 0, closingCash: 0, from, to };

  const idsPlaceholder = ids.map(() => '?').join(',');
  const conditions = [];
  const params = [...ids];
  if (from && to) {
    conditions.push('je.entry_date BETWEEN ? AND ?');
    params.push(from, to);
  }
  if (branchId) {
    conditions.push('jl.branch_id = ?');
    params.push(branchId);
  }
  const extraFilter = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const rows = db
    .prepare(
      `SELECT
         CASE WHEN je.ref_type = 'voucher' AND EXISTS (
           SELECT 1 FROM journal_lines jl2 WHERE jl2.entry_id = je.id AND jl2.party_type = 'partner'
         ) THEN 'financing' ELSE 'operating' END AS category,
         COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_id IN (${idsPlaceholder}) ${extraFilter}
       GROUP BY category`
    )
    .all(...params);

  const byCategory = { operating: 0, financing: 0 };
  rows.forEach((r) => {
    byCategory[r.category] = round2(r.d - r.c);
  });
  const netChange = round2(byCategory.operating + byCategory.financing);

  let openingCash = 0;
  if (from) {
    const openRow = db
      .prepare(
        `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE jl.account_id IN (${idsPlaceholder}) AND je.entry_date < ? ${branchId ? 'AND jl.branch_id = ?' : ''}`
      )
      .get(...ids, from, ...(branchId ? [branchId] : []));
    openingCash = round2(openRow.d - openRow.c);
  }
  const closingCash = round2(openingCash + netChange);

  return { operating: byCategory.operating, financing: byCategory.financing, netChange, openingCash, closingCash, from, to };
}

function listFiscalClosings(companyId) {
  return db.prepare('SELECT * FROM fiscal_closings WHERE company_id = ? ORDER BY period_to DESC').all(companyId);
}

// ---------------------------------------------------------------------------
// لوحة التحكم
// ---------------------------------------------------------------------------

function dashboardSummary(companyId, branchId) {
  const cash = accountBalance(companyId, ACC.CASH, branchId);
  const bank = accountBalance(companyId, ACC.BANK, branchId);
  const receivables = accountBalance(companyId, ACC.AR, branchId);
  const payables = accountBalance(companyId, ACC.AP, branchId);
  const inventoryValue = round2(
    accountBalance(companyId, ACC.INV_RAW, branchId) +
      accountBalance(companyId, ACC.INV_FG, branchId) +
      accountBalance(companyId, ACC.INV_TRADE, branchId) +
      accountBalance(companyId, ACC.CUSTODY, branchId)
  );
  const branchFilter = branchId ? 'AND branch_id = ?' : '';
  const salesParams = branchId ? [companyId, today(), branchId] : [companyId, today()];
  const todaySales = db
    .prepare(`SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE company_id = ? AND invoice_date = ? ${branchFilter}`)
    .get(...salesParams).s;
  const monthStart = today().slice(0, 7) + '-01';
  const monthParams = branchId ? [companyId, monthStart, branchId] : [companyId, monthStart];
  const monthSales = db
    .prepare(`SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE company_id = ? AND invoice_date >= ? ${branchFilter}`)
    .get(...monthParams).s;
  const monthIncome = incomeStatement(companyId, { from: monthStart, to: today(), branchId });
  const lowStockCount = branchId
    ? db
        .prepare(
          `SELECT COUNT(*) AS c FROM product_stock ps JOIN products p ON p.id = ps.product_id
           WHERE p.company_id = ? AND ps.branch_id = ? AND p.is_active = 1 AND ps.qty_on_hand <= p.reorder_level`
        )
        .get(companyId, branchId).c
    : db
        .prepare(
          `SELECT COUNT(*) AS c FROM (
             SELECT p.id, SUM(ps.qty_on_hand) AS q, p.reorder_level FROM products p
             LEFT JOIN product_stock ps ON ps.product_id = p.id
             WHERE p.company_id = ? AND p.is_active = 1 GROUP BY p.id HAVING q <= p.reorder_level
           )`
        )
        .get(companyId).c;
  const openTripsQuery = branchId
    ? db.prepare(`SELECT COUNT(*) AS c FROM trips WHERE company_id = ? AND branch_id = ? AND status = 'open'`).get(companyId, branchId)
    : db.prepare(`SELECT COUNT(*) AS c FROM trips WHERE company_id = ? AND status = 'open'`).get(companyId);

  return {
    cash: round2(cash),
    bank: round2(bank),
    totalCashAndBank: round2(cash + bank),
    receivables: round2(receivables),
    payables: round2(payables),
    inventoryValue,
    todaySales: round2(todaySales),
    monthSales: round2(monthSales),
    monthNetProfit: monthIncome.netProfit,
    lowStockCount,
    openTrips: openTripsQuery.c,
  };
}

module.exports = {
  trialBalance,
  incomeStatement,
  balanceSheet,
  customerStatement,
  supplierStatement,
  allCustomerBalances,
  allSupplierBalances,
  inventoryValuation,
  tripSettlementReport,
  partnersEquityStatement,
  cashFlowStatement,
  listFiscalClosings,
  dashboardSummary,
};
