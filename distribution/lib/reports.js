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

/** كشف حساب موظف: سلف وعهدات نقدية وعهدة بضاعة سيارة (رصيد موجب = مستحق على الموظف للمنشأة) */
function employeeStatement(companyId, employeeId) {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ? AND company_id = ?').get(employeeId, companyId);
  if (!employee) throw new Error('موظف غير موجود');
  const accountIds = db
    .prepare('SELECT id, code FROM accounts WHERE company_id = ? AND code IN (?, ?, ?)')
    .all(companyId, ACC.EMP_ADVANCES, ACC.PETTY_CUSTODY, ACC.CUSTODY);
  if (accountIds.length === 0) {
    return { employee, rows: [], advancesBalance: 0, custodyBalance: 0, vehicleGoodsBalance: 0, balance: 0 };
  }
  const idsPlaceholder = accountIds.map(() => '?').join(',');
  const lines = db
    .prepare(
      `SELECT je.entry_date, je.description, jl.debit, jl.credit, a.code AS account_code
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.account_id IN (${idsPlaceholder}) AND jl.party_type = 'employee' AND jl.party_id = ?
       ORDER BY je.entry_date, je.id`
    )
    .all(...accountIds.map((a) => a.id), employeeId);
  let balance = 0;
  let advancesBalance = 0;
  let custodyBalance = 0;
  let vehicleGoodsBalance = 0;
  const rows = lines.map((l) => {
    balance = round2(balance + l.debit - l.credit);
    if (l.account_code === ACC.EMP_ADVANCES) advancesBalance = round2(advancesBalance + l.debit - l.credit);
    else if (l.account_code === ACC.CUSTODY) vehicleGoodsBalance = round2(vehicleGoodsBalance + l.debit - l.credit);
    else custodyBalance = round2(custodyBalance + l.debit - l.credit);
    return { ...l, balance };
  });
  return { employee, rows, advancesBalance, custodyBalance, vehicleGoodsBalance, balance };
}

function allEmployeeBalances(companyId) {
  const employees = db.prepare('SELECT * FROM employees WHERE company_id = ? AND is_active = 1 ORDER BY name').all(companyId);
  const accountIds = db
    .prepare('SELECT id FROM accounts WHERE company_id = ? AND code IN (?, ?, ?)')
    .all(companyId, ACC.EMP_ADVANCES, ACC.PETTY_CUSTODY, ACC.CUSTODY)
    .map((a) => a.id);
  if (accountIds.length === 0) return employees.map((e) => ({ ...e, balance: 0 }));
  const idsPlaceholder = accountIds.map(() => '?').join(',');
  return employees.map((e) => {
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c
         FROM journal_lines WHERE account_id IN (${idsPlaceholder}) AND party_type='employee' AND party_id = ?`
      )
      .get(...accountIds, e.id);
    return { ...e, balance: round2(sums.d - sums.c) };
  });
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
// أعمار الديون (مدين/دائن) - عملاء وموردين
// ---------------------------------------------------------------------------

/**
 * بيحسب لكل طرف (عميل أو مورد) المبالغ المفتوحة المستحقة وبيوزعها على أعمار حسب
 * تاريخ نشأتها، عن طريق تسوية المبالغ المحصّلة/المدفوعة مع أقدم حركة مفتوحة أولاً
 * (FIFO)، لأن مفيش ربط مباشر بين كل فاتورة وسداداتها في الجدول.
 */
function partyAgingReport(companyId, { asOf, branchId, table, accountCode, partyType } = {}) {
  const asOfDate = asOf || today();
  const increaseIsDebit = partyType === 'customer';
  const accountRow = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, accountCode);
  if (!accountRow) return { asOf: asOfDate, rows: [], totals: { current: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 } };

  const parties = db.prepare(`SELECT * FROM ${table} WHERE company_id = ? AND is_active = 1 ORDER BY name`).all(companyId);
  const branchFilter = branchId ? 'AND jl.branch_id = ?' : '';

  const rows = parties
    .map((party) => {
      const params = branchId
        ? [accountRow.id, partyType, party.id, asOfDate, branchId]
        : [accountRow.id, partyType, party.id, asOfDate];
      const lines = db
        .prepare(
          `SELECT je.entry_date, jl.debit, jl.credit
           FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
           WHERE jl.account_id = ? AND jl.party_type = ? AND jl.party_id = ? AND je.entry_date <= ? ${branchFilter}
           ORDER BY je.entry_date, je.id`
        )
        .all(...params);

      const openBuckets = [];
      lines.forEach((l) => {
        const inc = increaseIsDebit ? l.debit : l.credit;
        const dec = increaseIsDebit ? l.credit : l.debit;
        if (inc > 0) openBuckets.push({ date: l.entry_date, amount: inc });
        if (dec > 0) {
          let remaining = dec;
          for (const bucket of openBuckets) {
            if (remaining <= 0) break;
            const take = Math.min(bucket.amount, remaining);
            bucket.amount = round2(bucket.amount - take);
            remaining = round2(remaining - take);
          }
        }
      });

      const sums = { current: 0, d31_60: 0, d61_90: 0, over90: 0 };
      openBuckets
        .filter((b) => b.amount > 0.004)
        .forEach((b) => {
          const days = Math.floor((new Date(asOfDate) - new Date(b.date)) / 86400000);
          if (days <= 30) sums.current = round2(sums.current + b.amount);
          else if (days <= 60) sums.d31_60 = round2(sums.d31_60 + b.amount);
          else if (days <= 90) sums.d61_90 = round2(sums.d61_90 + b.amount);
          else sums.over90 = round2(sums.over90 + b.amount);
        });
      const total = round2(sums.current + sums.d31_60 + sums.d61_90 + sums.over90);
      return { party_id: party.id, name: party.name, phone: party.phone, ...sums, total };
    })
    .filter((r) => r.total > 0.004)
    .sort((a, b) => b.total - a.total);

  const totals = rows.reduce(
    (acc, r) => ({
      current: round2(acc.current + r.current),
      d31_60: round2(acc.d31_60 + r.d31_60),
      d61_90: round2(acc.d61_90 + r.d61_90),
      over90: round2(acc.over90 + r.over90),
      total: round2(acc.total + r.total),
    }),
    { current: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 }
  );

  return { asOf: asOfDate, rows, totals };
}

/**
 * مسؤولية التحصيل حسب البائع: كل فاتورة بيع بتحمل هوية اللي أصدرها (created_by_user_id)،
 * وهنا بنجمع المبلغ المفتوح (المتبقي) على كل عميل ونحدد نصيب كل بائع منه بنفس منطق FIFO
 * المستخدم في أعمار الديون - البائع اللي أصدر الفاتورة هو المسؤول عن تحصيلها لحد ما تتقفل،
 * حتى لو السند اللي قفلها اتسجل من حد تاني.
 */
function salesRepAccountabilityReport(companyId, { asOf, branchId } = {}) {
  const asOfDate = asOf || today();
  const arAccount = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?').get(companyId, ACC.AR);
  if (!arAccount) return { asOf: asOfDate, rows: [], total: 0 };

  const customers = db.prepare('SELECT id FROM customers WHERE company_id = ?').all(companyId);
  const branchFilter = branchId ? 'AND jl.branch_id = ?' : '';
  const bySalesperson = {};

  customers.forEach((customer) => {
    const params = branchId
      ? [arAccount.id, customer.id, asOfDate, branchId]
      : [arAccount.id, customer.id, asOfDate];
    const lines = db
      .prepare(
        `SELECT je.entry_date, jl.debit, jl.credit, je.ref_type, je.ref_id
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE jl.account_id = ? AND jl.party_type = 'customer' AND jl.party_id = ? AND je.entry_date <= ? ${branchFilter}
         ORDER BY je.entry_date, je.id`
      )
      .all(...params);

    const openBuckets = [];
    lines.forEach((l) => {
      if (l.debit > 0) {
        let createdBy = null;
        if (l.ref_type === 'sale') {
          const inv = db.prepare('SELECT created_by_user_id FROM sales_invoices WHERE id = ?').get(l.ref_id);
          createdBy = inv ? inv.created_by_user_id : null;
        }
        openBuckets.push({ amount: l.debit, created_by_user_id: createdBy });
      }
      if (l.credit > 0) {
        let remaining = l.credit;
        for (const bucket of openBuckets) {
          if (remaining <= 0) break;
          const take = Math.min(bucket.amount, remaining);
          bucket.amount = round2(bucket.amount - take);
          remaining = round2(remaining - take);
        }
      }
    });

    openBuckets
      .filter((b) => b.amount > 0.004)
      .forEach((b) => {
        const key = b.created_by_user_id || 'unknown';
        if (!bySalesperson[key]) bySalesperson[key] = { user_id: b.created_by_user_id, outstanding: 0 };
        bySalesperson[key].outstanding = round2(bySalesperson[key].outstanding + b.amount);
      });
  });

  const rows = Object.values(bySalesperson)
    .map((r) => {
      const user = r.user_id ? db.prepare('SELECT username FROM users WHERE id = ?').get(r.user_id) : null;
      return {
        user_id: r.user_id,
        username: user ? user.username : 'فواتير قديمة بدون بائع محدد',
        outstanding: r.outstanding,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  return { asOf: asOfDate, rows, total: round2(rows.reduce((s, r) => s + r.outstanding, 0)) };
}

function arAgingReport(companyId, { asOf, branchId } = {}) {
  return partyAgingReport(companyId, { asOf, branchId, table: 'customers', accountCode: ACC.AR, partyType: 'customer' });
}

function apAgingReport(companyId, { asOf, branchId } = {}) {
  return partyAgingReport(companyId, { asOf, branchId, table: 'suppliers', accountCode: ACC.AP, partyType: 'supplier' });
}

// ---------------------------------------------------------------------------
// مواقع الفواتير (خريطة المبيعات)
// ---------------------------------------------------------------------------

function invoiceLocationsReport(companyId, { from, to, branchId } = {}) {
  const conditions = ['sv.company_id = ?', 'sv.latitude IS NOT NULL', 'sv.longitude IS NOT NULL'];
  const params = [companyId];
  if (branchId) {
    conditions.push('sv.branch_id = ?');
    params.push(branchId);
  }
  if (from && to) {
    conditions.push('sv.invoice_date BETWEEN ? AND ?');
    params.push(from, to);
  }
  return db
    .prepare(
      `SELECT sv.id, sv.invoice_no, sv.invoice_date, sv.total, sv.latitude, sv.longitude,
              c.name AS customer_name, t.trip_no
       FROM sales_invoices sv
       JOIN customers c ON c.id = sv.customer_id
       LEFT JOIN trips t ON t.id = sv.trip_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sv.invoice_date DESC, sv.id DESC
       LIMIT 1000`
    )
    .all(...params);
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

/**
 * مطابقة المخزون: qty_on_hand في product_stock رقم متراكم بيتحدّث تلقائيًا مع كل حركة،
 * ومفيش أي تحقق مستقل منه - الدالة دي بتعيد حساب الكمية من مجموع stock_movements نفسه
 * (مصدر الحقيقة التفصيلي) وتقارنها بالرقم المخزّن، عشان تكشف أي انحراف مستقبلي (باج،
 * تعديل يدوي في القاعدة، إلخ) قبل ما يأثر على تقييم المخزون أو حسابات الشركاء.
 */
function inventoryReconciliation(companyId, branchId) {
  const branchFilter = branchId ? 'AND ps.branch_id = ?' : '';
  const rows = db
    .prepare(
      `SELECT ps.product_id, ps.branch_id, ps.qty_on_hand AS stored_qty, ps.cost_price,
              p.name AS product_name, p.unit AS product_unit, b.name AS branch_name,
              COALESCE((SELECT SUM(sm.qty) FROM stock_movements sm
                        WHERE sm.product_id = ps.product_id AND sm.branch_id = ps.branch_id), 0) AS computed_qty
       FROM product_stock ps
       JOIN products p ON p.id = ps.product_id
       JOIN branches b ON b.id = ps.branch_id
       WHERE p.company_id = ? ${branchFilter}
       ORDER BY p.name`
    )
    .all(...(branchId ? [companyId, branchId] : [companyId]));

  const mismatches = rows
    .map((r) => ({ ...r, diff: round2(r.stored_qty - r.computed_qty) }))
    .filter((r) => Math.abs(r.diff) > 0.01);

  return { checkedCount: rows.length, mismatches };
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
    .prepare(`SELECT DISTINCT product_id FROM trip_loads WHERE trip_id = ? AND status = 'approved'`)
    .all(tripId);
  const pendingLoads = db
    .prepare(
      `SELECT tl.*, p.name AS product_name, p.unit AS product_unit FROM trip_loads tl
       JOIN products p ON p.id = tl.product_id WHERE tl.trip_id = ? AND tl.status = 'pending'`
    )
    .all(tripId);

  const reconciliation = products.map((row) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(row.product_id);
    const loaded = db
      .prepare(`SELECT COALESCE(SUM(qty_loaded),0) AS q FROM trip_loads WHERE trip_id=? AND product_id=? AND status='approved'`)
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
    const remaining = tripRemainingQty(tripId, row.product_id);
    return {
      product_id: row.product_id,
      product_name: product.name,
      unit: product.unit,
      loaded,
      sold,
      returned,
      damaged,
      remaining,
      // قيمة العهدة المتبقية بسعر البيع الحالي - مقياس رقابي لمتابعة السائق، مش رقم محاسبي
      custody_sale_value: round2(remaining * (product.sale_price || 0)),
    };
  });
  const custodySaleValueTotal = round2(reconciliation.reduce((s, r) => s + r.custody_sale_value, 0));
  const custodySaleValueLoaded = round2(
    db.prepare(`SELECT COALESCE(SUM(sale_value),0) AS s FROM trip_loads WHERE trip_id = ? AND status = 'approved'`).get(tripId).s
  );

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

  const kmDriven = trip.odometer_start != null && trip.odometer_end != null
    ? round2(trip.odometer_end - trip.odometer_start)
    : null;
  const costPerKm = kmDriven && kmDriven > 0 ? round2(expensesTotal / kmDriven) : null;

  return {
    trip,
    pendingLoads,
    reconciliation,
    performance: { odometer_start: trip.odometer_start, odometer_end: trip.odometer_end, km_driven: kmDriven, cost_per_km: costPerKm },
    custody: {
      sale_value_loaded: custodySaleValueLoaded,
      sale_value_remaining: custodySaleValueTotal,
    },
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
// تقرير الربحية (أعلى المنتجات/العملاء/الرحلات عائدًا)
// ---------------------------------------------------------------------------

/** ربحية كل منتج اتباع خلال فترة معينة، بعد خصم أي مرتجعات مبيعات عليه */
function productProfitability(companyId, { from, to, branchId } = {}) {
  const conditions = ['sv.company_id = ?'];
  const params = [companyId];
  if (branchId) {
    conditions.push('sv.branch_id = ?');
    params.push(branchId);
  }
  if (from && to) {
    conditions.push('sv.invoice_date BETWEEN ? AND ?');
    params.push(from, to);
  }
  const where = conditions.join(' AND ');

  const soldRows = db
    .prepare(
      `SELECT p.id AS product_id, p.name AS product_name, p.unit,
              COALESCE(SUM(si.qty),0) AS qty_sold,
              COALESCE(SUM(si.line_total),0) AS revenue,
              COALESCE(SUM(si.qty * si.unit_cost),0) AS cost
       FROM sales_items si
       JOIN sales_invoices sv ON sv.id = si.invoice_id
       JOIN products p ON p.id = si.product_id
       WHERE ${where}
       GROUP BY p.id`
    )
    .all(...params);

  const returnConditions = ['sr.company_id = ?'];
  const returnParams = [companyId];
  if (branchId) {
    returnConditions.push('sr.branch_id = ?');
    returnParams.push(branchId);
  }
  if (from && to) {
    returnConditions.push('sr.return_date BETWEEN ? AND ?');
    returnParams.push(from, to);
  }
  const returnsByProduct = {};
  db.prepare(
    `SELECT ri.product_id, COALESCE(SUM(ri.qty),0) AS qty, COALESCE(SUM(ri.line_total),0) AS revenue,
            COALESCE(SUM(ri.qty * ri.unit_cost),0) AS cost
     FROM sales_return_items ri JOIN sales_returns sr ON sr.id = ri.return_id
     WHERE ${returnConditions.join(' AND ')} GROUP BY ri.product_id`
  )
    .all(...returnParams)
    .forEach((r) => {
      returnsByProduct[r.product_id] = r;
    });

  return soldRows
    .map((r) => {
      const ret = returnsByProduct[r.product_id] || { qty: 0, revenue: 0, cost: 0 };
      const qty = round2(r.qty_sold - ret.qty);
      const revenue = round2(r.revenue - ret.revenue);
      const cost = round2(r.cost - ret.cost);
      const profit = round2(revenue - cost);
      const margin = revenue !== 0 ? round2((profit / revenue) * 100) : 0;
      return { product_id: r.product_id, product_name: r.product_name, unit: r.unit, qty, revenue, cost, profit, margin };
    })
    .sort((a, b) => b.profit - a.profit);
}

/** ربحية كل عميل خلال فترة معينة (إجمالي مبيعاته وهامش الربح اللي جابه)، بعد خصم مرتجعاته */
function customerProfitability(companyId, { from, to, branchId } = {}) {
  const conditions = ['sv.company_id = ?'];
  const params = [companyId];
  if (branchId) {
    conditions.push('sv.branch_id = ?');
    params.push(branchId);
  }
  if (from && to) {
    conditions.push('sv.invoice_date BETWEEN ? AND ?');
    params.push(from, to);
  }
  const where = conditions.join(' AND ');

  const soldRows = db
    .prepare(
      `SELECT c.id AS customer_id, c.name AS customer_name,
              COALESCE(SUM(si.line_total),0) AS revenue,
              COALESCE(SUM(si.qty * si.unit_cost),0) AS cost,
              COUNT(DISTINCT sv.id) AS invoice_count
       FROM sales_items si
       JOIN sales_invoices sv ON sv.id = si.invoice_id
       JOIN customers c ON c.id = sv.customer_id
       WHERE ${where}
       GROUP BY c.id`
    )
    .all(...params);

  const returnConditions = ['sr.company_id = ?'];
  const returnParams = [companyId];
  if (branchId) {
    returnConditions.push('sr.branch_id = ?');
    returnParams.push(branchId);
  }
  if (from && to) {
    returnConditions.push('sr.return_date BETWEEN ? AND ?');
    returnParams.push(from, to);
  }
  const returnsByCustomer = {};
  db.prepare(
    `SELECT sr.customer_id, COALESCE(SUM(ri.line_total),0) AS revenue, COALESCE(SUM(ri.qty * ri.unit_cost),0) AS cost
     FROM sales_return_items ri JOIN sales_returns sr ON sr.id = ri.return_id
     WHERE ${returnConditions.join(' AND ')} GROUP BY sr.customer_id`
  )
    .all(...returnParams)
    .forEach((r) => {
      returnsByCustomer[r.customer_id] = r;
    });

  return soldRows
    .map((r) => {
      const ret = returnsByCustomer[r.customer_id] || { revenue: 0, cost: 0 };
      const revenue = round2(r.revenue - ret.revenue);
      const cost = round2(r.cost - ret.cost);
      const profit = round2(revenue - cost);
      const margin = revenue !== 0 ? round2((profit / revenue) * 100) : 0;
      return { customer_id: r.customer_id, customer_name: r.customer_name, invoice_count: r.invoice_count, revenue, cost, profit, margin };
    })
    .sort((a, b) => b.profit - a.profit);
}

/** نتيجة كل رحلة توزيع (مبيعات - تكلفة بضاعة - مصروفات - توالف) عشان تعرف أكتر الرحلات/السيارات ربحًا */
function tripProfitability(companyId, { from, to, branchId } = {}) {
  const conditions = ['t.company_id = ?'];
  const params = [companyId];
  if (branchId) {
    conditions.push('t.branch_id = ?');
    params.push(branchId);
  }
  if (from && to) {
    conditions.push('t.trip_date BETWEEN ? AND ?');
    params.push(from, to);
  }
  const trips = db
    .prepare(
      `SELECT t.id, t.trip_no, t.trip_date, t.status, t.odometer_start, t.odometer_end,
              v.name AS vehicle_name, e.name AS driver_name
       FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN employees e ON e.id = t.responsible_employee_id
       WHERE ${conditions.join(' AND ')} ORDER BY t.trip_date DESC`
    )
    .all(...params);

  return trips
    .map((t) => {
      const sales = db.prepare('SELECT COALESCE(SUM(total),0) AS s FROM sales_invoices WHERE trip_id = ?').get(t.id).s;
      const cogs = db
        .prepare(
          `SELECT COALESCE(SUM(si.qty * si.unit_cost),0) AS s FROM sales_items si
           JOIN sales_invoices sv ON sv.id = si.invoice_id WHERE sv.trip_id = ?`
        )
        .get(t.id).s;
      const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM trip_expenses WHERE trip_id = ?').get(t.id).s;
      const damages = db.prepare('SELECT COALESCE(SUM(qty * unit_cost),0) AS s FROM damages WHERE trip_id = ?').get(t.id).s;
      const grossProfit = round2(sales - cogs);
      const netResult = round2(grossProfit - expenses - damages);
      const kmDriven = t.odometer_start != null && t.odometer_end != null ? round2(t.odometer_end - t.odometer_start) : null;
      const costPerKm = kmDriven && kmDriven > 0 ? round2(expenses / kmDriven) : null;
      return {
        trip_id: t.id,
        trip_no: t.trip_no,
        trip_date: t.trip_date,
        status: t.status,
        vehicle_name: t.vehicle_name,
        driver_name: t.driver_name,
        km_driven: kmDriven,
        cost_per_km: costPerKm,
        sales: round2(sales),
        cogs: round2(cogs),
        expenses: round2(expenses),
        damages: round2(damages),
        netResult,
      };
    })
    .sort((a, b) => b.netResult - a.netResult);
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

/**
 * الخزنة الرئيسية: رصيد الكاش والبنك الحالي (إجمالي ولكل فرع)، بالإضافة لسجل حركة يومي
 * (دفتر خزينة) بكل ما دخل وخرج من الكاش/البنك، عشان مراقبة المدفوعات والمصروفات في مكان واحد.
 */
function treasuryOverview(companyId, { branchId, from, to, limit = 300 } = {}) {
  const cash = accountBalance(companyId, ACC.CASH, branchId);
  const bank = accountBalance(companyId, ACC.BANK, branchId);

  const branches = db.prepare('SELECT id, name FROM branches WHERE company_id = ? AND is_active = 1 ORDER BY is_main DESC, name').all(companyId);
  const byBranch = branchId
    ? []
    : branches.map((b) => ({
        branch_id: b.id,
        branch_name: b.name,
        cash: accountBalance(companyId, ACC.CASH, b.id),
        bank: accountBalance(companyId, ACC.BANK, b.id),
      }));

  const accountIds = db.prepare('SELECT id, code FROM accounts WHERE company_id = ? AND code IN (?, ?)').all(companyId, ACC.CASH, ACC.BANK);
  if (accountIds.length === 0) {
    return { cash, bank, total: round2(cash + bank), byBranch, movements: [] };
  }
  const idsPlaceholder = accountIds.map(() => '?').join(',');
  const conditions = [];
  const params = [...accountIds.map((a) => a.id)];
  if (branchId) {
    conditions.push('jl.branch_id = ?');
    params.push(branchId);
  }
  if (from) {
    conditions.push('je.entry_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('je.entry_date <= ?');
    params.push(to);
  }
  const extraFilter = conditions.length ? 'AND ' + conditions.join(' AND ') : '';
  const movements = db
    .prepare(
      `SELECT je.entry_date, je.description, je.ref_type, a.code AS account_code, jl.debit, jl.credit, b.name AS branch_name
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
       LEFT JOIN branches b ON b.id = jl.branch_id
       WHERE jl.account_id IN (${idsPlaceholder}) ${extraFilter}
       ORDER BY je.entry_date DESC, je.id DESC LIMIT ?`
    )
    .all(...params, limit);

  return { cash, bank, total: round2(cash + bank), byBranch, movements };
}

function listFiscalClosings(companyId) {
  return db
    .prepare(
      `SELECT fc.*, b.name AS branch_name FROM fiscal_closings fc
       LEFT JOIN branches b ON b.id = fc.branch_id
       WHERE fc.company_id = ? ORDER BY fc.period_to DESC`
    )
    .all(companyId);
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
  employeeStatement,
  allEmployeeBalances,
  arAgingReport,
  apAgingReport,
  salesRepAccountabilityReport,
  invoiceLocationsReport,
  inventoryValuation,
  inventoryReconciliation,
  tripSettlementReport,
  productProfitability,
  customerProfitability,
  tripProfitability,
  partnersEquityStatement,
  cashFlowStatement,
  treasuryOverview,
  listFiscalClosings,
  dashboardSummary,
};
