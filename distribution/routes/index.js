const express = require('express');
const { db } = require('../lib/db');
const services = require('../lib/services');
const reports = require('../lib/reports');

const router = express.Router();

function handle(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      res.json(result);
    } catch (err) {
      const status = err.statusCode || 400;
      res.status(status).json({ error: err.message || 'حدث خطأ غير متوقع' });
    }
  };
}

// ---------------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------------

router.get('/suppliers', handle(() => reports.allSupplierBalances()));
router.get(
  '/suppliers/:id/statement',
  handle((req) => reports.supplierStatement(Number(req.params.id)))
);
router.post('/suppliers', handle((req) => services.createSupplier(req.body)));
router.put(
  '/suppliers/:id',
  handle((req) => {
    const { name, phone, address, notes, is_active } = req.body;
    db.prepare(
      'UPDATE suppliers SET name=?, phone=?, address=?, notes=?, is_active=? WHERE id=?'
    ).run(name, phone || null, address || null, notes || null, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// العملاء
// ---------------------------------------------------------------------------

router.get('/customers', handle(() => reports.allCustomerBalances()));
router.get(
  '/customers/:id/statement',
  handle((req) => reports.customerStatement(Number(req.params.id)))
);
router.post('/customers', handle((req) => services.createCustomer(req.body)));
router.put(
  '/customers/:id',
  handle((req) => {
    const { name, phone, address, notes, credit_limit, is_active } = req.body;
    db.prepare(
      'UPDATE customers SET name=?, phone=?, address=?, notes=?, credit_limit=?, is_active=? WHERE id=?'
    ).run(
      name,
      phone || null,
      address || null,
      notes || null,
      Number(credit_limit) || 0,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// المنتجات
// ---------------------------------------------------------------------------

router.get(
  '/products',
  handle(() => db.prepare('SELECT * FROM products ORDER BY kind, name').all())
);
router.get(
  '/products/:id',
  handle((req) => {
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!product) throw new Error('منتج غير موجود');
    product.bom = db
      .prepare(
        `SELECT b.*, p.name AS component_name, p.unit AS component_unit, p.cost_price AS component_cost
         FROM bom_items b JOIN products p ON p.id = b.component_id WHERE b.product_id = ?`
      )
      .all(req.params.id);
    product.movements = db
      .prepare('SELECT * FROM stock_movements WHERE product_id=? ORDER BY id DESC LIMIT 200')
      .all(req.params.id);
    return product;
  })
);
router.post('/products', handle((req) => services.createProduct(req.body)));
router.put(
  '/products/:id',
  handle((req) => {
    const { name, sku, unit, sale_price, reorder_level, is_active } = req.body;
    db.prepare(
      'UPDATE products SET name=?, sku=?, unit=?, sale_price=?, reorder_level=?, is_active=? WHERE id=?'
    ).run(
      name,
      sku || null,
      unit || 'وحدة',
      Number(sale_price) || 0,
      Number(reorder_level) || 0,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  })
);
router.put(
  '/products/:id/bom',
  handle((req) => services.setBom(Number(req.params.id), req.body.items || []))
);

// ---------------------------------------------------------------------------
// المشتريات
// ---------------------------------------------------------------------------

router.get(
  '/purchases',
  handle(() =>
    db
      .prepare(
        `SELECT pi.*, s.name AS supplier_name FROM purchase_invoices pi
         JOIN suppliers s ON s.id = pi.supplier_id ORDER BY pi.id DESC LIMIT 500`
      )
      .all()
  )
);
router.get(
  '/purchases/:id',
  handle((req) => {
    const inv = services.getPurchaseInvoice(Number(req.params.id));
    if (!inv) throw new Error('فاتورة غير موجودة');
    return inv;
  })
);
router.post('/purchases', handle((req) => services.createPurchaseInvoice(req.body)));

// ---------------------------------------------------------------------------
// التصنيع
// ---------------------------------------------------------------------------

router.get(
  '/production',
  handle(() =>
    db
      .prepare(
        `SELECT po.*, p.name AS product_name FROM production_orders po
         JOIN products p ON p.id = po.product_id ORDER BY po.id DESC LIMIT 500`
      )
      .all()
  )
);
router.get(
  '/production/:id',
  handle((req) => {
    const order = services.getProductionOrder(Number(req.params.id));
    if (!order) throw new Error('أمر تصنيع غير موجود');
    return order;
  })
);
router.post('/production', handle((req) => services.createProductionOrder(req.body)));

// ---------------------------------------------------------------------------
// السيارات
// ---------------------------------------------------------------------------

router.get(
  '/vehicles',
  handle(() => db.prepare('SELECT * FROM vehicles ORDER BY id DESC').all())
);
router.post('/vehicles', handle((req) => services.createVehicle(req.body)));
router.put(
  '/vehicles/:id',
  handle((req) => {
    const { name, ownership, driver_name, monthly_rent, notes, is_active } = req.body;
    db.prepare(
      'UPDATE vehicles SET name=?, ownership=?, driver_name=?, monthly_rent=?, notes=?, is_active=? WHERE id=?'
    ).run(
      name,
      ownership,
      driver_name || null,
      Number(monthly_rent) || 0,
      notes || null,
      is_active ? 1 : 0,
      req.params.id
    );
    return db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  })
);

// ---------------------------------------------------------------------------
// الرحلات
// ---------------------------------------------------------------------------

router.get(
  '/trips',
  handle(() =>
    db
      .prepare(
        `SELECT t.*, v.name AS vehicle_name FROM trips t
         JOIN vehicles v ON v.id = t.vehicle_id ORDER BY t.id DESC LIMIT 500`
      )
      .all()
  )
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
router.post('/trips', handle((req) => services.createTrip(req.body)));
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
// المبيعات
// ---------------------------------------------------------------------------

router.get(
  '/sales',
  handle(() =>
    db
      .prepare(
        `SELECT si.*, c.name AS customer_name, t.trip_no FROM sales_invoices si
         JOIN customers c ON c.id = si.customer_id
         LEFT JOIN trips t ON t.id = si.trip_id
         ORDER BY si.id DESC LIMIT 500`
      )
      .all()
  )
);
router.get(
  '/sales/:id',
  handle((req) => {
    const inv = services.getSalesInvoice(Number(req.params.id));
    if (!inv) throw new Error('فاتورة غير موجودة');
    return inv;
  })
);
router.post('/sales', handle((req) => services.createSalesInvoice(req.body)));

// ---------------------------------------------------------------------------
// التوالف
// ---------------------------------------------------------------------------

router.get(
  '/damages',
  handle(() =>
    db
      .prepare(
        `SELECT d.*, p.name AS product_name, p.unit AS product_unit FROM damages d
         JOIN products p ON p.id = d.product_id ORDER BY d.id DESC LIMIT 500`
      )
      .all()
  )
);
router.post('/damages', handle((req) => services.createDamage(req.body)));

// ---------------------------------------------------------------------------
// المصروفات
// ---------------------------------------------------------------------------

router.get(
  '/expenses',
  handle(() => db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 500').all())
);
router.post('/expenses', handle((req) => services.createExpense(req.body)));

// ---------------------------------------------------------------------------
// السندات
// ---------------------------------------------------------------------------

router.get(
  '/vouchers',
  handle(() => db.prepare('SELECT * FROM vouchers ORDER BY id DESC LIMIT 500').all())
);
router.post('/vouchers', handle((req) => services.createVoucher(req.body)));

// ---------------------------------------------------------------------------
// الحسابات والتقارير
// ---------------------------------------------------------------------------

router.get(
  '/accounts',
  handle(() => db.prepare('SELECT * FROM accounts ORDER BY code').all())
);
router.get(
  '/journal',
  handle((req) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const entries = db
      .prepare('SELECT * FROM journal_entries ORDER BY id DESC LIMIT ?')
      .all(limit);
    const lineStmt = db.prepare(
      `SELECT jl.*, a.code AS account_code, a.name AS account_name FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id WHERE jl.entry_id = ?`
    );
    for (const e of entries) e.lines = lineStmt.all(e.id);
    return entries;
  })
);

router.get('/reports/trial-balance', handle(() => reports.trialBalance()));
router.get(
  '/reports/income-statement',
  handle((req) => reports.incomeStatement({ from: req.query.from, to: req.query.to }))
);
router.get(
  '/reports/balance-sheet',
  handle((req) => reports.balanceSheet({ asOf: req.query.asOf }))
);
router.get('/reports/inventory-valuation', handle(() => reports.inventoryValuation()));

router.get('/dashboard', handle(() => reports.dashboardSummary()));

module.exports = router;
