const express = require('express');
const { db } = require('../lib/db');
const services = require('../lib/services');
const reports = require('../lib/reports');
const whatsapp = require('../lib/whatsapp');
const maps = require('../lib/maps');
const auth = require('../lib/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// سياق المنشأة والفرع (Company / Branch context)
// ---------------------------------------------------------------------------
//
// المالك (owner) بيختار المنشأة والفرع بنفسه من الهيدرز (X-Company-Id/X-Branch-Id)
// زي أي سويتشر في الواجهة. أي مستخدم تاني (محاسب/مندوب/أمين مخزن) لو متقفل
// على منشأة أو فرع معين، بيتفرض عليه إجباريًا هنا بغض النظر عن أي هيدر باعته -
// ده اللي بيمنعه يشوف أو يلمس بيانات منشأة/فرع تاني حتى لو عدّل الهيدر يدويًا.

router.use((req, res, next) => {
  const headerCompanyId = Number(req.header('X-Company-Id')) || null;
  const headerBranchId = Number(req.header('X-Branch-Id')) || null;
  const user = req.user;

  const companyId = user && user.company_id ? user.company_id : headerCompanyId;
  if (companyId) {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!company) return res.status(400).json({ error: 'منشأة غير موجودة' });
    req.companyId = companyId;
  }

  const branchId = user && user.branch_id ? user.branch_id : headerBranchId;
  if (req.companyId && branchId) {
    const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?').get(branchId, req.companyId);
    if (!branch) return res.status(400).json({ error: 'فرع غير موجود لهذه المنشأة' });
    req.branchId = branchId;
  }
  next();
});

// مهم جدًا: أي كول لـ services بيبني الـ object بتاعه بصيغة { ...req.body, ...ctx(req) } -
// يعني ctx() لازم تتحط دايمًا في الآخر عشان قيمها متتغلبش من أي company_id/branch_id
// جاي في جسم الطلب نفسه (ده بالظبط اللي بيمنع أي منشأة من التلاعب في بيانات منشأة تانية).
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

/** يتأكد إن صف معين موجود وتابع للمنشأة الحالية، وإلا بيرفضه كأنه مش موجود أصلاً */
function assertOwned(row, companyId, notFoundMsg) {
  if (!row || row.company_id !== companyId) throw new Error(notFoundMsg);
  return row;
}

// ---------------------------------------------------------------------------
// صلاحيات الأدوار
// ---------------------------------------------------------------------------

const OWNER = ['owner'];
const FIN = ['owner', 'accountant']; // محاسبة وتقارير وسندات وإقفال
const SALES_G = ['owner', 'accountant', 'sales']; // عملاء ومبيعات
const WH_G = ['owner', 'accountant', 'warehouse']; // موردين ومشتريات ومخزون
const ALL_ROLES = ['owner', 'accountant', 'sales', 'warehouse'];

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'الحساب ده مالوش صلاحية الوصول للجزء ده' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// المنشآت والفروع والشركاء
// ---------------------------------------------------------------------------

router.get(
  '/companies',
  allow(...ALL_ROLES),
  handle((req) => {
    if (req.user.company_id) {
      return db.prepare('SELECT * FROM companies WHERE id = ?').all(req.user.company_id);
    }
    return db.prepare('SELECT * FROM companies ORDER BY id').all();
  })
);
router.post('/companies', allow(...OWNER), handle((req) => services.createCompany(req.body)));
router.put(
  '/companies/:id',
  allow(...OWNER),
  handle((req) => {
    if (!req.companyId || Number(req.params.id) !== req.companyId) {
      throw new Error('لازم تختار المنشأة دي كسياق العمل الحالي قبل تعديل بياناتها');
    }
    const { name, legal_name, tax_number, phone, address, public_url, is_active } = req.body;
    db.prepare(
      `UPDATE companies SET name=?, legal_name=?, tax_number=?, phone=?, address=?, public_url=?, is_active=? WHERE id=?`
    ).run(name, legal_name || null, tax_number || null, phone || null, address || null, public_url || null, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
  })
);

router.get(
  '/branches',
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY is_main DESC, id').all(company_id);
  })
);
router.post(
  '/branches',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createBranch({ ...req.body, company_id });
  })
);
router.put(
  '/branches/:id',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const branch = assertOwned(db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id), company_id, 'فرع غير موجود');
    const { name, address, phone, is_main, is_active } = req.body;
    if (is_main) db.prepare('UPDATE branches SET is_main = 0 WHERE company_id = ?').run(branch.company_id);
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
  allow(...FIN),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM partners WHERE company_id = ? ORDER BY name').all(company_id);
  })
);
router.post(
  '/partners',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.createPartner({ ...req.body, company_id });
  })
);
router.put(
  '/partners/:id',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    assertOwned(db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id), company_id, 'شريك غير موجود');
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
// المستخدمون (owner بس)
// ---------------------------------------------------------------------------

router.get(
  '/users',
  allow(...OWNER),
  handle((req) => auth.listUsers(req.companyId))
);
router.post(
  '/users',
  allow(...OWNER),
  handle((req) => {
    const company_id = req.body.role === 'owner' ? null : req.body.company_id || req.companyId;
    return auth.createUser({ ...req.body, company_id });
  })
);
router.put(
  '/users/:id',
  allow(...OWNER),
  handle((req) => auth.updateUser(Number(req.params.id), req.body))
);

// ---------------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------------

router.get(
  '/suppliers',
  allow(...WH_G),
  handle((req) => reports.allSupplierBalances(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/suppliers/:id/statement',
  allow(...WH_G),
  handle((req) => reports.supplierStatement(ctx(req, { needBranch: false }).company_id, Number(req.params.id)))
);
router.post(
  '/suppliers',
  allow(...WH_G),
  handle((req) => services.createSupplier({ ...req.body, company_id: ctx(req, { needBranch: false }).company_id }))
);
router.put(
  '/suppliers/:id',
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    assertOwned(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id), company_id, 'مورد غير موجود');
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
  allow(...SALES_G),
  handle((req) => reports.allCustomerBalances(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/customers/:id/statement',
  allow(...SALES_G),
  handle((req) => reports.customerStatement(ctx(req, { needBranch: false }).company_id, Number(req.params.id)))
);
router.post(
  '/customers',
  allow(...SALES_G),
  handle((req) => services.createCustomer({ ...req.body, company_id: ctx(req, { needBranch: false }).company_id }))
);
router.put(
  '/customers/:id',
  allow(...SALES_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    assertOwned(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id), company_id, 'عميل غير موجود');
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
  allow(...ALL_ROLES),
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
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    const product = assertOwned(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id), company_id, 'منتج غير موجود');
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
  allow(...WH_G),
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return services.createProduct({ ...req.body, company_id, branch_id });
  })
);
router.put(
  '/products/:id',
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req);
    assertOwned(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id), company_id, 'منتج غير موجود');
    const { name, sku, unit, sale_price, reorder_level, is_active } = req.body;
    db.prepare(
      'UPDATE products SET name=?, sku=?, unit=?, sale_price=?, reorder_level=?, is_active=? WHERE id=?'
    ).run(name, sku || null, unit || 'وحدة', Number(sale_price) || 0, Number(reorder_level) || 0, is_active ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  })
);
router.put(
  '/products/:id/bom',
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req);
    return services.setBom(Number(req.params.id), req.body.items || [], company_id);
  })
);

// ---------------------------------------------------------------------------
// المشتريات ومرتجعاتها
// ---------------------------------------------------------------------------

router.get(
  '/purchases',
  allow(...WH_G),
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
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const inv = assertOwned(services.getPurchaseInvoice(Number(req.params.id)), company_id, 'فاتورة غير موجودة');
    return inv;
  })
);
router.post(
  '/purchases',
  allow(...WH_G),
  handle((req) => services.createPurchaseInvoice({ ...req.body, ...ctx(req) }))
);

router.get(
  '/purchase-returns',
  allow(...WH_G),
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
  allow(...WH_G),
  handle((req) => services.createPurchaseReturn({ ...req.body, ...ctx(req) }))
);

// ---------------------------------------------------------------------------
// التصنيع
// ---------------------------------------------------------------------------

router.get(
  '/production',
  allow(...WH_G),
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
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return assertOwned(services.getProductionOrder(Number(req.params.id)), company_id, 'أمر تصنيع غير موجود');
  })
);
router.post(
  '/production',
  allow(...WH_G),
  handle((req) => services.createProductionOrder({ ...req.body, ...ctx(req) }))
);

// ---------------------------------------------------------------------------
// السيارات
// ---------------------------------------------------------------------------

router.get(
  '/vehicles',
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db.prepare('SELECT * FROM vehicles WHERE company_id = ? AND branch_id = ? ORDER BY id DESC').all(company_id, branch_id);
  })
);
router.post(
  '/vehicles',
  allow(...WH_G),
  handle((req) => services.createVehicle({ ...req.body, ...ctx(req) }))
);
router.put(
  '/vehicles/:id',
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req);
    assertOwned(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id), company_id, 'سيارة غير موجودة');
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

function ownedTrip(req, { needBranch = false } = {}) {
  const { company_id } = ctx(req, { needBranch });
  return assertOwned(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id), company_id, 'رحلة غير موجودة');
}

router.get(
  '/trips',
  allow(...ALL_ROLES),
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
  '/trips/live-locations',
  allow(...FIN),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.liveTripLocations(company_id, reportBranch(req));
  })
);
router.get(
  '/trips/:id',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return services.getTrip(Number(req.params.id));
  })
);
router.get(
  '/trips/:id/settlement',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return reports.tripSettlementReport(Number(req.params.id));
  })
);
router.post(
  '/trips',
  allow(...ALL_ROLES),
  handle((req) => services.createTrip({ ...req.body, ...ctx(req) }))
);
router.post(
  '/trips/:id/load',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return services.addTripLoad({ trip_id: Number(req.params.id), items: req.body.items });
  })
);
router.post(
  '/trips/:id/expense',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return services.addTripExpense({ ...req.body, trip_id: Number(req.params.id) });
  })
);
router.post(
  '/trips/:id/return',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return services.addTripReturn({ trip_id: Number(req.params.id), items: req.body.items });
  })
);
router.post(
  '/trips/:id/settle',
  allow(...ALL_ROLES),
  handle((req) => {
    ownedTrip(req);
    return services.settleTrip({ trip_id: Number(req.params.id), write_off_discrepancy: !!req.body.write_off_discrepancy });
  })
);
router.post(
  '/trips/:id/location',
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id, branch_id } = ctx(req, { needBranch: false });
    return services.recordDriverLocation({
      company_id,
      branch_id,
      trip_id: Number(req.params.id),
      user_id: req.user.id,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      accuracy: req.body.accuracy,
    });
  })
);
router.get(
  '/trips/:id/location-trail',
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return services.tripLocationTrail(Number(req.params.id), company_id);
  })
);

// ---------------------------------------------------------------------------
// المبيعات ومرتجعاتها
// ---------------------------------------------------------------------------

router.get(
  '/sales',
  allow(...SALES_G),
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
  allow(...SALES_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return assertOwned(services.getSalesInvoice(Number(req.params.id)), company_id, 'فاتورة غير موجودة');
  })
);
router.post(
  '/sales',
  allow(...SALES_G),
  handle((req) => services.createSalesInvoice({ ...req.body, ...ctx(req, { needBranch: !req.body.trip_id }) }))
);
router.post(
  '/sales/:id/send-whatsapp',
  allow(...SALES_G),
  handle(async (req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const invoice = assertOwned(services.getSalesInvoice(Number(req.params.id)), company_id, 'فاتورة غير موجودة');
    return whatsapp.sendInvoiceNotification({
      companyId: invoice.company_id,
      invoice,
      customerPhone: req.body.phone || invoice.customer_phone,
    });
  })
);

router.get(
  '/sales-returns',
  allow(...SALES_G),
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
  allow(...SALES_G),
  handle((req) => services.createSalesReturn({ ...req.body, ...ctx(req) }))
);

// ---------------------------------------------------------------------------
// التوالف
// ---------------------------------------------------------------------------

router.get(
  '/damages',
  allow(...ALL_ROLES),
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
  allow(...ALL_ROLES),
  handle((req) => services.createDamage({ ...req.body, ...ctx(req, { needBranch: !req.body.trip_id }) }))
);

// ---------------------------------------------------------------------------
// تحويلات وتسويات المخزون
// ---------------------------------------------------------------------------

router.get(
  '/stock-transfers',
  allow(...WH_G),
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
  allow(...WH_G),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const transfer = assertOwned(db.prepare('SELECT * FROM stock_transfers WHERE id=?').get(req.params.id), company_id, 'تحويل غير موجود');
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
  allow(...WH_G),
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return services.createStockTransfer({ ...req.body, company_id, from_branch_id: branch_id });
  })
);

router.get(
  '/stock-adjustments',
  allow(...WH_G),
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
  allow(...WH_G),
  handle((req) => services.createStockAdjustment({ ...req.body, ...ctx(req) }))
);

// ---------------------------------------------------------------------------
// المصروفات
// ---------------------------------------------------------------------------

router.get(
  '/expenses',
  allow(...FIN),
  handle((req) => {
    const { company_id, branch_id } = ctx(req);
    return db.prepare('SELECT * FROM expenses WHERE company_id = ? AND branch_id = ? ORDER BY id DESC LIMIT 500').all(company_id, branch_id);
  })
);
router.post(
  '/expenses',
  allow(...FIN),
  handle((req) => services.createExpense({ ...req.body, ...ctx(req) }))
);

// ---------------------------------------------------------------------------
// السندات
// ---------------------------------------------------------------------------

router.get(
  '/vouchers',
  allow(...FIN),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM vouchers WHERE company_id = ? ORDER BY id DESC LIMIT 500').all(company_id);
  })
);
router.post(
  '/vouchers',
  allow(...FIN),
  handle((req) => {
    const { company_id, branch_id } = ctx(req, { needBranch: false });
    return services.createVoucher({ ...req.body, company_id, branch_id });
  })
);

// ---------------------------------------------------------------------------
// الحسابات والتقارير
// ---------------------------------------------------------------------------

router.get(
  '/accounts',
  allow(...FIN),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM accounts WHERE company_id = ? ORDER BY code').all(company_id);
  })
);
router.post(
  '/accounts',
  allow(...OWNER),
  handle((req) => services.createCustomAccount({ ...req.body, company_id: ctx(req, { needBranch: false }).company_id }))
);

router.get(
  '/journal',
  allow(...FIN),
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
  allow(...FIN),
  handle((req) => reports.trialBalance(ctx(req, { needBranch: false }).company_id, reportBranch(req)))
);
router.get(
  '/reports/income-statement',
  allow(...FIN),
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
  allow(...FIN),
  handle((req) =>
    reports.balanceSheet(ctx(req, { needBranch: false }).company_id, { asOf: req.query.asOf, branchId: reportBranch(req) })
  )
);
router.get(
  '/reports/inventory-valuation',
  allow(...WH_G),
  handle((req) => reports.inventoryValuation(ctx(req, { needBranch: false }).company_id, reportBranch(req)))
);
router.get(
  '/reports/profitability/products',
  allow(...FIN),
  handle((req) =>
    reports.productProfitability(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);
router.get(
  '/reports/profitability/customers',
  allow(...FIN),
  handle((req) =>
    reports.customerProfitability(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);
router.get(
  '/reports/profitability/trips',
  allow(...FIN),
  handle((req) =>
    reports.tripProfitability(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);
router.get(
  '/reports/ar-aging',
  allow(...FIN),
  handle((req) => reports.arAgingReport(ctx(req, { needBranch: false }).company_id, { asOf: req.query.asOf, branchId: reportBranch(req) }))
);
router.get(
  '/reports/ap-aging',
  allow(...FIN),
  handle((req) => reports.apAgingReport(ctx(req, { needBranch: false }).company_id, { asOf: req.query.asOf, branchId: reportBranch(req) }))
);
router.get(
  '/reports/invoice-locations',
  allow(...FIN),
  handle((req) =>
    reports.invoiceLocationsReport(ctx(req, { needBranch: false }).company_id, {
      from: req.query.from,
      to: req.query.to,
      branchId: reportBranch(req),
    })
  )
);
router.get(
  '/reports/partners-equity',
  allow(...FIN),
  handle((req) =>
    reports.partnersEquityStatement(ctx(req, { needBranch: false }).company_id, { from: req.query.from, to: req.query.to })
  )
);
router.get(
  '/reports/cash-flow',
  allow(...FIN),
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
  allow(...FIN),
  handle((req) => reports.listFiscalClosings(ctx(req, { needBranch: false }).company_id))
);
router.get(
  '/fiscal-closings/:id',
  allow(...FIN),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return assertOwned(services.getFiscalClosing(Number(req.params.id)), company_id, 'إقفال غير موجود');
  })
);
router.post(
  '/fiscal-closings',
  allow(...FIN),
  handle((req) => services.closeFiscalPeriod({ ...req.body, company_id: ctx(req, { needBranch: false }).company_id }))
);

router.get(
  '/dashboard',
  allow(...FIN),
  handle((req) => reports.dashboardSummary(ctx(req, { needBranch: false }).company_id, reportBranch(req)))
);

// ---------------------------------------------------------------------------
// واتساب
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// إعدادات الخرائط (Google Maps)
// ---------------------------------------------------------------------------

router.get(
  '/maps/config',
  allow(...ALL_ROLES),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const config = maps.getConfig(company_id);
    // مفتاح خرائط جوجل مش سر زي توكن واتساب - المفروض يتقيّد على الدومين
    // من Google Cloud Console، فمعمول له إرجاع كامل عشان يُستخدم في المتصفح
    return { google_maps_api_key: config ? config.google_maps_api_key || '' : '' };
  })
);
router.put(
  '/maps/config',
  allow(...OWNER),
  handle((req) => maps.saveConfig(ctx(req, { needBranch: false }).company_id, req.body))
);

router.get(
  '/whatsapp/config',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    const config = whatsapp.getConfig(company_id);
    if (!config) return { company_id, access_token: '', phone_number_id: '', template_name: 'invoice_notification', template_lang: 'ar', default_country_code: '20' };
    return { ...config, access_token: config.access_token ? '••••••••' : '' };
  })
);
router.put(
  '/whatsapp/config',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return whatsapp.saveConfig(company_id, req.body);
  })
);
router.post(
  '/whatsapp/test',
  allow(...OWNER),
  handle(async (req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return whatsapp.sendTestMessage({ companyId: company_id, phone: req.body.phone, text: req.body.text });
  })
);
router.get(
  '/whatsapp/log',
  allow(...OWNER),
  handle((req) => {
    const { company_id } = ctx(req, { needBranch: false });
    return db.prepare('SELECT * FROM whatsapp_log WHERE company_id = ? ORDER BY id DESC LIMIT 200').all(company_id);
  })
);

module.exports = router;
