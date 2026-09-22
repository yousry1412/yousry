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

function trialBalance() {
  const accounts = db.prepare('SELECT * FROM accounts WHERE is_postable = 1 ORDER BY code').all();
  const rows = accounts.map((acc) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
         FROM journal_lines WHERE account_id = ?`
      )
      .get(acc.id);
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

function incomeStatement({ from, to } = {}) {
  const dateFilter = from && to ? 'AND je.entry_date BETWEEN ? AND ?' : '';
  const params = from && to ? [from, to] : [];

  const accounts = db
    .prepare(`SELECT * FROM accounts WHERE is_postable = 1 AND type IN ('revenue','expense') ORDER BY code`)
    .all();

  const lines = accounts.map((acc) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE jl.account_id = ? ${dateFilter}`
      )
      .get(acc.id, ...params);
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

function balanceSheet({ asOf } = {}) {
  const dateFilter = asOf ? 'AND je.entry_date <= ?' : '';
  const params = asOf ? [asOf] : [];

  function typeBalances(type) {
    const accounts = db
      .prepare('SELECT * FROM accounts WHERE is_postable = 1 AND type = ? ORDER BY code')
      .all(type);
    const natural = type === 'asset' || type === 'expense' ? 1 : -1;
    const rows = accounts.map((acc) => {
      const sums = db
        .prepare(
          `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
           FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
           WHERE jl.account_id = ? ${dateFilter}`
        )
        .get(acc.id, ...params);
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

  const income = incomeStatement(asOf ? { from: '0000-01-01', to: asOf } : {});
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

function customerStatement(customerId) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('عميل غير موجود');
  const accountId = db.prepare('SELECT id FROM accounts WHERE code = ?').get(ACC.AR).id;
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

function supplierStatement(supplierId) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) throw new Error('مورد غير موجود');
  const accountId = db.prepare('SELECT id FROM accounts WHERE code = ?').get(ACC.AP).id;
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
    balance = round2(balance + l.credit - l.debit); // بالنسبة للمورد: الرصيد الدائن = المستحق له
    return { ...l, balance };
  });
  return { supplier, rows, balance };
}

function allCustomerBalances() {
  const customers = db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY name').all();
  const accountId = db.prepare('SELECT id FROM accounts WHERE code = ?').get(ACC.AR).id;
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

function allSupplierBalances() {
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name').all();
  const accountId = db.prepare('SELECT id FROM accounts WHERE code = ?').get(ACC.AP).id;
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

function inventoryValuation() {
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY kind, name').all();
  const rows = products.map((p) => ({
    ...p,
    value: round2(p.qty_on_hand * p.cost_price),
    low_stock: p.qty_on_hand <= p.reorder_level,
  }));
  const totalValue = round2(rows.reduce((s, r) => s + r.value, 0));
  return { rows, totalValue };
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
// لوحة التحكم
// ---------------------------------------------------------------------------

function dashboardSummary() {
  const cash = accountBalance(ACC.CASH);
  const bank = accountBalance(ACC.BANK);
  const receivables = accountBalance(ACC.AR);
  const payables = accountBalance(ACC.AP);
  const inventoryValue = round2(
    accountBalance(ACC.INV_RAW) + accountBalance(ACC.INV_FG) + accountBalance(ACC.INV_TRADE) + accountBalance(ACC.CUSTODY)
  );
  const todaySales = db
    .prepare('SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE invoice_date = ?')
    .get(today()).s;
  const monthStart = today().slice(0, 7) + '-01';
  const monthSales = db
    .prepare('SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE invoice_date >= ?')
    .get(monthStart).s;
  const monthIncome = incomeStatement({ from: monthStart, to: today() });
  const lowStockCount = db
    .prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND qty_on_hand <= reorder_level')
    .get().c;
  const openTrips = db.prepare(`SELECT COUNT(*) AS c FROM trips WHERE status = 'open'`).get().c;

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
    openTrips,
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
  dashboardSummary,
};
