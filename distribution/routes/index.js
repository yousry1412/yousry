const express = require('express');
const { db } = require('../lib/db');
const services = require('../lib/services');
const reports = require('../lib/reports');
const whatsapp = require('../lib/whatsapp');

const router = express.Router();

// ---------------------------------------------------------------------------
// سياق المنشأة والفرع (Company / Branch context) - عن طريق الهيدرز
// ---------------------------------------------------------------------------

router.use((req, res, next) => {
  const companyId = Number(req.header('X-Company-Id')) || null;
  const branchId = Number(req.header('X-Branch-Id')) || null;

  if (companyId) {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!company) return res.status(400).json({ error: 'منشأة غير موجودة' });
    req.companyId = companyId;
  }
  if (companyId && branchId) {
    const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?').get(branchId, companyId);
    if (!branch) return res.status(400).json({ error: 'فرع غير موجود لهذه المنشأة' });
    req.branchId = branchId;
  }
  next();
});

function ctx(req, { needBranch = true } = {}) {
  if (!req.companyId) throw new Error('اختر المنشأة أولاً');
  if (needBranch && !req.branchId) throw new Error('اختر الفرع أولاً');
  return { company_id: req.companyId, branch_id: req.branchId };
}

function reportBranch(req) {
  return req.query.allBranches === '1' ? null : req.branchId || null;
}

function handle(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      if (result && typeof result.then === 'function') {
        result.then((r) => res.json(r)).catch((err) => res.status(err.statusCode || 400).json({ error: err.message || 'حدث خطأ غير متوقع' }));
      } else {
        res.json(result);
      }
    } catch (err) {
      const status = err.statusCode || 400;
      res.status(status).json({ error: err.message || 'حدث خطأ غير متوقع' });
    }
  };
}

// ---------------------------------------------------------------------------
// المنشآت والفروع والشركاء
// ---------------------------------------------------------------------------

router.get('/companies', handle(() => db.prepare('SELECT * FROM companies ORDER BY id').all()));
router.post('/companies', handle((req) => services.createCompany(req.body)));
router.put(
  '/companies/:id',
  handle((req) => {
    const { name, legal_name, tax_number, phone, address, public_url, is_active } = req.body;
    db.prepare(
      `UPDATE companies SET name=?, legal_name=?, tax_number=?, phone=?, address=?, public_url=?, is_active=? WHERE id=?`
    ).run(name, legal_name || null, tax_number || null, phone || null, address || null, public_url || null, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
  })
);

router.get(
  '/branches',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY is_main DESC, id').all(company_id);
  })
);
router.post(
  '/branches',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createBranch({ company_id, ...req.body });
  })
);
router.put(
  '/branches/:id',
  handle((req) => {
    const { name, address, phone, is_main, is_active } = req.body;
    if (is_main) {
      const branch = db.prepare('SELECT company_id FROM branches WHERE id = ?').get(req.params.id);
      db.prepare('UPDATE branches SET is_main = 0 WHERE company_id = ?').run(branch.company_id);
    }
    db.prepare('UPDATE branches SET name=?, address=?, phone=?, is_main=?, is_active=? WHERE id=?').run(
      name,
      address || null,
      phone || null,
      is_main ? 1 : 0,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM branches WHERE id=?').get(req.params.id);
  })
);

router.get(
  '/partners',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM partners WHERE company_id = ? ORDER BY name').all(company_id);
  })
);
router.post(
  '/partners',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createPartner({ company_id, ...req.body });
  })
);
router.put(
  '/partners/:id',
  handle((req) => {
    const { name, phone, share_percentage, notes, is_active } = req.body;
    const pct = Number(share_percentage);
    if (!(pct > 0 && pct <= 100)) throw new Error('نسبة الشريك لازم تكون رقم بين 0 و 100');
    db.prepare('UPDATE partners SET name=?, phone=?, share_percentage=?, notes=?, is_active=? WHERE id=?').run(
      name,
      phone || null,
      pct,
      notes || null,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM partners WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------------

router.get(
  '/suppliers',
  handle((req) => reports.allSupplierBalances(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/suppliers/:id/statement',
  handle((req) => reports.supplierStatement(ctx(req, { needBranch: false }).company_id, Number(req.params.id)))
);
router.post(
  '/suppliers',
  handle((req) => services.createSupplier({ company_id: ctx(req, { needBranch: false }).company_id, ...req.body }))
);
router.put(
  '/suppliers/:id',
  handle((req) => {
    const { name, phone, address, notes, is_active } = req.body;
    db.prepare('UPDATE suppliers SET name=?, phone=?, address=?, notes=?, is_active=? WHERE id=?').run(
      name,
      phone || null,
      address || null,
      notes || null,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// العملاء
// ---------------------------------------------------------------------------

router.get(
  '/customers',
  handle((req) => reports.allCustomerBalances(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/customers/:id/statement',
  handle((req) => reports.customerStatement(ctx(req, { needBranch: false }).company_id, Number(req.params.id)))
);
router.post(
  '/customers',
  handle((req) => services.createCustomer({ company_id: ctx(req, { needBranch: false }).company_id, ...req.body }))
);
router.put(
  '/customers/:id',
  handle((req) => {
    const { name, phone, address, notes, credit_limit, is_active } = req.body;
    db.prepare(
      'UPDATE customers SET name=?, phone=?, address=?, notes=?, credit_limit=?, is_active=? WHERE id=?'
    ).run(name, phone || null, address || null, notes || null, Number(credit_limit) || 0, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// المنتجات
// ---------------------------------------------------------------------------

router.get(
  '/products',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT p.*, COALESCE(ps.qty_on_hand,0) AS qty_on_hand, COALESCE(ps.cost_price,0) AS cost_price
         FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.branch_id = ?
         WHERE p.company_id = ? ORDER BY p.kind, p.name`
      )
      .all(branch_id, company_id);
  })
);
router.get(
  '/products/:id',
  handle((req) => {
    const { branch_id } = ctx(req);
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!product) throw new Error('منتج غير موجود');
    const stock = db.prepare('SELECT * FROM product_stock WHERE product_id=? AND branch_id=?').get(req.params.id, branch_id);
    product.qty_on_hand = stock ? stock.qty_on_hand : 0;
    product.cost_price = stock ? stock.cost_price : 0;
    product.bom = db
      .prepare(
        `SELECT b.*, p.name AS component_name, p.unit AS component_unit
         FROM bom_items b JOIN products p ON p.id = b.component_id WHERE b.product_id = ?`
      )
      .all(req.params.id);
    product.movements = db
      .prepare('SELECT * FROM stock_movements WHERE product_id=? AND branch_id=? ORDER BY id DESC LIMIT 200')
      .all(req.params.id, branch_id);
    return product;
  })
);
router.post(
  '/products',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return services.createProduct({ company_id, branch_id, ...req.body });
  })
);
router.put(
  '/products/:id',
  handle((req) => {
    const { name, sku, unit, sale_price, reorder_level, is_active } = req.body;
    db.prepare(
      'UPDATE products SET name=?, sku=?, unit=?, sale_price=?, reorder_level=?, is_active=? WHERE id=?'
    ).run(name, sku || null, unit || 'وحدة', Number(sale_price) || 0, Number(reorder_level) || 0, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  })
);
router.put(
  '/products/:id/bom',
  handle((req) => services.setBom(Number(req.params.id), req.body.items || []))
);

// ---------------------------------------------------------------------------
// المشتريات ومرتجعاتها
// ---------------------------------------------------------------------------

router.get(
  '/purchases',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT pi.*, s.name AS supplier_name FROM purchase_invoices pi
         JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.company_id = ? AND pi.branch_id = ? ORDER BY pi.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.get(
  '/purchases/:id',
  handle((req) => {
    const inv = services.getPurchaseInvoice(Number(req.params.id));
    if (!inv) throw new Error('فاتورة غير موجودة');
    return inv;
  })
);
router.post(
  '/purchases',
  handle((req) => services.createPurchaseInvoice({ ...ctx(req), ...req.body }))
);

router.get(
  '/purchase-returns',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT pr.*, s.name AS supplier_name FROM purchase_returns pr
         JOIN suppliers s ON s.id = pr.supplier_id
         WHERE pr.company_id = ? AND pr.branch_id = ? ORDER BY pr.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.post(
  '/purchase-returns',
  handle((req) => services.createPurchaseReturn({ ...ctx(req), ...req.body }))
);

// ---------------------------------------------------------------------------
// التصنيع
// ---------------------------------------------------------------------------

router.get(
  '/production',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT po.*, p.name AS product_name FROM production_orders po
         JOIN products p ON p.id = po.product_id
         WHERE po.company_id = ? AND po.branch_id = ? ORDER BY po.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.get(
  '/production/:id',
  handle((req) => {
    const order = services.getProductionOrder(Number(req.params.id));
    if (!order) throw new Error('أمر تصنيع غير موجود');
    return order;
  })
);
router.post(
  '/production',
  handle((req) => services.createProductionOrder({ ...ctx(req), ...req.body }))
);

// ---------------------------------------------------------------------------
// السيارات
// ---------------------------------------------------------------------------

router.get(
  '/vehicles',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db.prepare('SELECT * FROM vehicles WHERE company_id = ? AND branch_id = ? ORDER BY id DESC').all(company_id, branch_id);
  })
);
router.post(
  '/vehicles',
  handle((req) => services.createVehicle({ ...ctx(req), ...req.body }))
);
router.put(
  '/vehicles/:id',
  handle((req) => {
    const { name, ownership, driver_name, monthly_rent, notes, is_active } = req.body;
    db.prepare(
      'UPDATE vehicles SET name=?, ownership=?, driver_name=?, monthly_rent=?, notes=?, is_active=? WHERE id=?'
    ).run(name, ownership, driver_name || null, Number(monthly_rent) || 0, notes || null, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// الرحلات
// ---------------------------------------------------------------------------

router.get(
  '/trips',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT t.*, v.name AS vehicle_name FROM trips t
         JOIN vehicles v ON v.id = t.vehicle_id
         WHERE t.company_id = ? AND t.branch_id = ? ORDER BY t.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.get(
  '/trips/:id',
  handle((req) => {
    const trip = services.getTrip(Number(req.params.id));
    if (!trip) throw new Error('رحلة غير موجودة');
    return trip;
  })
);
router.get(
  '/trips/:id/settlement',
  handle((req) => reports.tripSettlementReport(Number(req.params.id)))
);
router.post(
  '/trips',
  handle((req) => services.createTrip({ ...ctx(req), ...req.body }))
);
router.post(
  '/trips/:id/load',
  handle((req) => services.addTripLoad({ trip_id: Number(req.params.id), items: req.body.items }))
);
router.post(
  '/trips/:id/expense',
  handle((req) => services.addTripExpense({ trip_id: Number(req.params.id), ...req.body }))
);
router.post(
  '/trips/:id/return',
  handle((req) => services.addTripReturn({ trip_id: Number(req.params.id), items: req.body.items }))
);
router.post(
  '/trips/:id/settle',
  handle((req) =>
    services.settleTrip({ trip_id: Number(req.params.id), write_off_discrepancy: !!req.body.write_off_discrepancy })
  )
);

// ---------------------------------------------------------------------------
// المبيعات ومرتجعاتها
// ---------------------------------------------------------------------------

router.get(
  '/sales',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT si.*, c.name AS customer_name, t.trip_no FROM sales_invoices si
         JOIN customers c ON c.id = si.customer_id
         LEFT JOIN trips t ON t.id = si.trip_id
         WHERE si.company_id = ? AND si.branch_id = ? ORDER BY si.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.get(
  '/sales/:id',
  handle((req) => {
    const inv = services.getSalesInvoice(Number(req.params.id));
    if (!inv) throw new Error('فاتورة غير موجودة');
    return inv;
  })
);
router.post(
  '/sales',
  handle((req) => services.createSalesInvoice({ ...ctx(req, { needBranch: !req.body.trip_id }), ...req.body }))
);
router.post(
  '/sales/:id/send-whatsapp',
  handle(async (req) => {
    const invoice = services.getSalesInvoice(Number(req.params.id));
    if (!invoice) throw new Error('فاتورة غير موجودة');
    return whatsapp.sendInvoiceNotification({
      companyId: invoice.company_id,
      invoice,
      customerPhone: req.body.phone || invoice.customer_phone,
    });
  })
);

router.get(
  '/sales-returns',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT sr.*, c.name AS customer_name FROM sales_returns sr
         JOIN customers c ON c.id = sr.customer_id
         WHERE sr.company_id = ? AND sr.branch_id = ? ORDER BY sr.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.post(
  '/sales-returns',
  handle((req) => services.createSalesReturn({ ...ctx(req), ...req.body }))
);

// ---------------------------------------------------------------------------
// التوالف
// ---------------------------------------------------------------------------

router.get(
  '/damages',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT d.*, p.name AS product_name, p.unit AS product_unit FROM damages d
         JOIN products p ON p.id = d.product_id
         WHERE d.company_id = ? AND d.branch_id = ? ORDER BY d.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.post(
  '/damages',
  handle((req) => services.createDamage({ ...ctx(req, { needBranch: !req.body.trip_id }), ...req.body }))
);

// ---------------------------------------------------------------------------
// تحويلات وتسويات المخزون
// ---------------------------------------------------------------------------

router.get(
  '/stock-transfers',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db
      .prepare(
        `SELECT st.*, fb.name AS from_branch_name, tb.name AS to_branch_name FROM stock_transfers st
         JOIN branches fb ON fb.id = st.from_branch_id
         JOIN branches tb ON tb.id = st.to_branch_id
         WHERE st.company_id = ? ORDER BY st.id DESC LIMIT 500`
      )
      .all(company_id);
  })
);
router.get(
  '/stock-transfers/:id',
  handle((req) => {
    const transfer = db.prepare('SELECT * FROM stock_transfers WHERE id=?').get(req.params.id);
    if (!transfer) throw new Error('تحويل غير موجود');
    transfer.items = db
      .prepare(
        `SELECT i.*, p.name AS product_name, p.unit AS product_unit FROM stock_transfer_items i
         JOIN products p ON p.id = i.product_id WHERE i.transfer_id = ?`
      )
      .all(req.params.id);
    return transfer;
  })
);
router.post(
  '/stock-transfers',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createStockTransfer({ company_id, from_branch_id: req.branchId, ...req.body });
  })
);

router.get(
  '/stock-adjustments',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db
      .prepare(
        `SELECT a.*, p.name AS product_name, p.unit AS product_unit FROM stock_adjustments a
         JOIN products p ON p.id = a.product_id
         WHERE a.company_id = ? AND a.branch_id = ? ORDER BY a.id DESC LIMIT 500`
      )
      .all(company_id, branch_id);
  })
);
router.post(
  '/stock-adjustments',
  handle((req) => services.createStockAdjustment({ ...ctx(req), ...req.body }))
);

// ---------------------------------------------------------------------------
// المصروفات
// ---------------------------------------------------------------------------

router.get(
  '/expenses',
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db.prepare('SELECT * FROM expenses WHERE company_id = ? AND branch_id = ? ORDER BY id DESC LIMIT 500').all(company_id, branch_id);
  })
);
router.post(
  '/expenses',
  handle((req) => services.createExpense({ ...ctx(req), ...req.body }))
);

// ---------------------------------------------------------------------------
// السندات
// ---------------------------------------------------------------------------

router.get(
  '/vouchers',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM vouchers WHERE company_id = ? ORDER BY id DESC LIMIT 500').all(company_id);
  })
);
router.post(
  '/vouchers',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createVoucher({ company_id, branch_id: req.branchId, ...req.body });
  })
);

// ---------------------------------------------------------------------------
// الحسابات والتقارير
// ---------------------------------------------------------------------------

router.get(
  '/accounts',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM accounts WHERE company_id = ? ORDER BY code').all(company_id);
  })
);
router.post(
  '/accounts',
  handle((req) => services.createCustomAccount({ company_id: ctx(req, { needBranch: false }).company_id, ...req.body }))
);

router.get(
  '/journal',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const entries = db
      .prepare('SELECT * FROM journal_entries WHERE company_id = ? ORDER BY id DESC LIMIT ?')
      .all(company_id, limit);
    const lineStmt = db.prepare(
      `SELECT jl.*, a.code AS account_code, a.name AS account_name, b.name AS branch_name
       FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
       LEFT JOIN branches b ON b.id = jl.branch_id WHERE jl.entry_id = ?`
    );
    for (const e of entries) e.lines = lineStmt.all(e.id);
    return entries;
  })
);

router.get(
  '/reports/trial-balance',
  handle((req) => reports.trialBalance(ctx(req, { needBranch: false }).company_id, reportBranch(req)))
);
router.get(
  '/reports/income-statement',
  handle((req) =>
    reports.incomeStatement(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);
router.get(
  '/reports/balance-sheet',
  handle((req) =>
    reports.balanceSheet(ctx(req, { needBranch: false }).company_id, { asOf: req.query.asOf, branchId: reportBranch(req) })
  )
);
router.get(
  '/reports/inventory-valuation',
  handle((req) => reports.inventoryValuation(ctx(req, { needBranch: false }).company_id, reportBranch(req)))
);
router.get(
  '/reports/partners-equity',
  handle((req) =>
    reports.partnersEquityStatement(ctx(req, { needBranch: false }).company_id, { from: req.query.from, to: req.query.to })
  )
);
router.get(
  '/reports/cash-flow',
  handle((req) =>
    reports.cashFlowStatement(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);

router.get(
  '/fiscal-closings',
  handle((req) => reports.listFiscalClosings(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/fiscal-closings/:id',
  handle((req) => {
    const closing = services.getFiscalClosing(Number(req.params.id));
    if (!closing) throw new Error('إقفال غير موجود');
    return closing;
  })
);
router.post(
  '/fiscal-closings',
  handle((req) => services.closeFiscalPeriod({ company_id: ctx(req, { needBranch: false }).company_id, ...req.body }))
);

router.get('/dashboard', handle((req) => reports.dashboardSummary(ctx(req, { needBranch: false }).company_id, reportBranch(req))));

// ---------------------------------------------------------------------------
// واتساب
// ---------------------------------------------------------------------------

router.get(
  '/whatsapp/config',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const config = whatsapp.getConfig(company_id);
    if (!config) return { company_id, access_token: '', phone_number_id: '', template_name: 'invoice_notification', template_lang: 'ar', default_country_code: '20' };
    return { ...config, access_token: config.access_token ? '••••••••' : '' };
  })
);
router.put(
  '/whatsapp/config',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return whatsapp.saveConfig(company_id, req.body);
  })
);
router.post(
  '/whatsapp/test',
  handle(async (req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return whatsapp.sendTestMessage({ companyId: company_id, phone: req.body.phone, text: req.body.text });
  })
);
router.get(
  '/whatsapp/log',
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM whatsapp_log WHERE company_id = ? ORDER BY id DESC LIMIT 200').all(company_id);
  })
);

module.exports = router;
