const { db, inTransaction, seedChartForCompany } = require('./db');
const { postEntry } = require('./accounting');
const { applyStockMovement, getProduct, getProductWithStock } = require('./inventory');
const { nextNumber } = require('./numbering');
const {
  ACC,
  PRODUCT_KIND_TO_INVENTORY_ACC,
  EXPENSE_CATEGORY_TO_ACC,
  TRIP_EXPENSE_CATEGORY_TO_ACC,
} = require('./accounts');

function cashOrBank(method) {
  return method === 'bank' ? ACC.BANK : ACC.CASH;
}

function invAccFor(product) {
  return PRODUCT_KIND_TO_INVENTORY_ACC[product.kind];
}

/** بيحوّل قيمة جاية من فورم (زي '0'/'1' نصية) لـ boolean صح، عشان '0' النصية متتحسبش true غلط */
function toBool(v) {
  return v === true || v === 1 || v === '1';
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * يتأكد إن صف معين (مورد/عميل/سيارة/فرع...) موجود فعلاً وتابع لنفس المنشأة الحالية،
 * عشان يمنع أي طلب (بالغلط أو بالتلاعب) يربط مستند بمنشأة تانية عن طريق تمرير id تابع لها.
 */
function assertBelongs(table, id, companyId, label) {
  if (id === undefined || id === null || id === '') throw new Error(`لازم تحدد ${label}`);
  const row = db.prepare(`SELECT company_id FROM ${table} WHERE id = ?`).get(id);
  if (!row || row.company_id !== companyId) throw new Error(`${label} غير موجود أو لا ينتمي لهذه المنشأة`);
}

// ---------------------------------------------------------------------------
// المنشآت والفروع والشركاء
// ---------------------------------------------------------------------------

function createCompany({ name, legal_name, tax_number, phone, address, public_url, country, vat_enabled, vat_rate, geofence_radius_m }) {
  return inTransaction(() => {
    const info = db
      .prepare(
        `INSERT INTO companies (name, legal_name, tax_number, phone, address, public_url, country, vat_enabled, vat_rate, geofence_radius_m)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        legal_name || null,
        tax_number || null,
        phone || null,
        address || null,
        public_url || null,
        country || 'مصر',
        toBool(vat_enabled) ? 1 : 0,
        round2(Number(vat_rate) || 0),
        round2(Number(geofence_radius_m) || 300)
      );
    const companyId = info.lastInsertRowid;
    db.prepare('INSERT INTO branches (company_id, name, is_main) VALUES (?, ?, 1)').run(companyId, 'الفرع الرئيسي');
    seedChartForCompany(companyId);
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  });
}

function createBranch({ company_id, name, address, phone, is_main }) {
  return inTransaction(() => {
    if (is_main) db.prepare('UPDATE branches SET is_main = 0 WHERE company_id = ?').run(company_id);
    const info = db
      .prepare('INSERT INTO branches (company_id, name, address, phone, is_main) VALUES (?, ?, ?, ?, ?)')
      .run(company_id, name, address || null, phone || null, is_main ? 1 : 0);
    return db.prepare('SELECT * FROM branches WHERE id = ?').get(info.lastInsertRowid);
  });
}

function createPartner({ company_id, branch_id, name, phone, share_percentage, notes }) {
  const pct = Number(share_percentage);
  if (!(pct > 0 && pct <= 100)) throw new Error('نسبة الشريك لازم تكون رقم بين 0 و 100');
  if (branch_id) assertBelongs('branches', branch_id, company_id, 'الفرع');
  const info = db
    .prepare('INSERT INTO partners (company_id, branch_id, name, phone, share_percentage, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(company_id, branch_id || null, name, phone || null, pct, notes || null);
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(info.lastInsertRowid);
}

function createCustomAccount({ company_id, code, name, type, parent_code, is_postable }) {
  const exists = db.prepare('SELECT 1 FROM accounts WHERE company_id = ? AND code = ?').get(company_id, code);
  if (exists) throw new Error(`الكود ${code} مستخدم بالفعل في شجرة الحسابات`);
  db.prepare(
    `INSERT INTO accounts (company_id, code, name, type, parent_code, is_postable, is_system)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(company_id, code, name, type, parent_code || null, is_postable ? 1 : 0);
  return db.prepare('SELECT * FROM accounts WHERE company_id = ? AND code = ?').get(company_id, code);
}

// ---------------------------------------------------------------------------
// موردون وعملاء
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// الموظفون (HR)
// ---------------------------------------------------------------------------

function createEmployee({ company_id, branch_id, name, phone, job_title, salary, hire_date }) {
  const info = db
    .prepare(
      `INSERT INTO employees (company_id, branch_id, name, phone, job_title, salary, hire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(company_id, branch_id || null, name, phone || null, job_title || null, round2(Number(salary) || 0), hire_date || null);
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
}

function updateEmployee(id, companyId, { name, phone, job_title, salary, hire_date, branch_id, is_active }) {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing || existing.company_id !== companyId) throw new Error('موظف غير موجود');
  db.prepare(
    `UPDATE employees SET name=?, phone=?, job_title=?, salary=?, hire_date=?, branch_id=?, is_active=? WHERE id=?`
  ).run(
    name ?? existing.name,
    phone ?? existing.phone,
    job_title ?? existing.job_title,
    salary === undefined ? existing.salary : round2(Number(salary) || 0),
    hire_date ?? existing.hire_date,
    branch_id === undefined ? existing.branch_id : branch_id || null,
    is_active === undefined ? existing.is_active : (toBool(is_active) ? 1 : 0),
    id
  );
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

function createSupplier({ company_id, name, phone, address, notes, opening_balance, latitude, longitude, geofence_radius_m }) {
  return inTransaction(() => {
    const ob = round2(Number(opening_balance) || 0);
    const coord = sanitizeCoord(latitude, longitude);
    const info = db
      .prepare(
        `INSERT INTO suppliers (company_id, name, phone, address, notes, opening_balance, latitude, longitude, geofence_radius_m)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company_id,
        name,
        phone || null,
        address || null,
        notes || null,
        ob,
        coord.latitude,
        coord.longitude,
        geofence_radius_m === undefined || geofence_radius_m === '' || geofence_radius_m === null ? null : round2(Number(geofence_radius_m))
      );
    const id = info.lastInsertRowid;
    if (ob !== 0) {
      postEntry({
        company_id,
        date: new Date().toISOString().slice(0, 10),
        ref_type: 'opening',
        ref_id: id,
        description: `رصيد افتتاحي - مورد ${name}`,
        lines: [
          { account_code: ACC.OPENING_EQUITY, debit: ob },
          { account_code: ACC.AP, credit: ob, party_type: 'supplier', party_id: id },
        ],
      });
    }
    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  });
}

function createCustomer({ company_id, name, phone, address, notes, credit_limit, opening_balance }) {
  return inTransaction(() => {
    const ob = round2(Number(opening_balance) || 0);
    const info = db
      .prepare(
        `INSERT INTO customers (company_id, name, phone, address, notes, credit_limit, opening_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, name, phone || null, address || null, notes || null, Number(credit_limit) || 0, ob);
    const id = info.lastInsertRowid;
    if (ob !== 0) {
      postEntry({
        company_id,
        date: new Date().toISOString().slice(0, 10),
        ref_type: 'opening',
        ref_id: id,
        description: `رصيد افتتاحي - عميل ${name}`,
        lines: [
          { account_code: ACC.AR, debit: ob, party_type: 'customer', party_id: id },
          { account_code: ACC.OPENING_EQUITY, credit: ob },
        ],
      });
    }
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  });
}

// ---------------------------------------------------------------------------
// تصنيفات المنتجات
// ---------------------------------------------------------------------------

function createProductCategory({ company_id, name }) {
  if (!name || !name.trim()) throw new Error('لازم تكتب اسم التصنيف');
  const info = db.prepare('INSERT INTO product_categories (company_id, name) VALUES (?, ?)').run(company_id, name.trim());
  return db.prepare('SELECT * FROM product_categories WHERE id = ?').get(info.lastInsertRowid);
}

function updateProductCategory(id, companyId, { name }) {
  assertBelongs('product_categories', id, companyId, 'التصنيف');
  db.prepare('UPDATE product_categories SET name = ? WHERE id = ?').run(name, id);
  return db.prepare('SELECT * FROM product_categories WHERE id = ?').get(id);
}

function listProductCategories(companyId) {
  return db.prepare('SELECT * FROM product_categories WHERE company_id = ? ORDER BY name').all(companyId);
}

// ---------------------------------------------------------------------------
// المنتجات و BOM ووحدات القياس
// ---------------------------------------------------------------------------

function createProduct({ company_id, branch_id, category_id, name, sku, unit, kind, sale_price, cost_price, reorder_level, opening_qty, bom }) {
  return inTransaction(() => {
    if (category_id) assertBelongs('product_categories', category_id, company_id, 'التصنيف');
    const info = db
      .prepare(
        `INSERT INTO products (company_id, category_id, name, sku, unit, kind, sale_price, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, category_id || null, name, sku || null, unit || 'وحدة', kind, Number(sale_price) || 0, Number(reorder_level) || 0);
    const id = info.lastInsertRowid;

    const oQty = round2(Number(opening_qty) || 0);
    if (oQty > 0 && branch_id) {
      const cost = Number(cost_price) || 0;
      applyStockMovement({
        product_id: id,
        branch_id,
        date: new Date().toISOString().slice(0, 10),
        qty: oQty,
        unit_cost: cost,
        ref_type: 'opening',
        ref_id: id,
        notes: 'رصيد افتتاحي',
      });
      const amount = round2(oQty * cost);
      if (amount > 0) {
        const product = getProduct(id, company_id);
        postEntry({
          company_id,
          branch_id,
          date: new Date().toISOString().slice(0, 10),
          ref_type: 'opening',
          ref_id: id,
          description: `رصيد افتتاحي مخزون - ${name}`,
          lines: [
            { account_code: invAccFor(product), debit: amount },
            { account_code: ACC.OPENING_EQUITY, credit: amount },
          ],
        });
      }
    }

    if (kind === 'manufactured' && Array.isArray(bom) && bom.length > 0) {
      setBom(id, bom, company_id);
    }

    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  });
}

function setBom(productId, items, companyId) {
  return inTransaction(() => {
    assertBelongs('products', productId, companyId, 'المنتج');
    db.prepare('DELETE FROM bom_items WHERE product_id = ?').run(productId);
    const insert = db.prepare(
      'INSERT INTO bom_items (product_id, component_id, qty_per_unit) VALUES (?, ?, ?)'
    );
    for (const item of items) {
      if (Number(item.component_id) === Number(productId)) {
        throw new Error('لا يمكن أن يكون المنتج مكوّنًا لنفسه');
      }
      assertBelongs('products', item.component_id, companyId, 'المكوّن');
      insert.run(productId, item.component_id, Number(item.qty_per_unit) || 0);
    }
    return db
      .prepare(
        `SELECT b.*, p.name AS component_name, p.unit AS component_unit
         FROM bom_items b JOIN products p ON p.id = b.component_id
         WHERE b.product_id = ?`
      )
      .all(productId);
  });
}

/** استبدال كل وحدات القياس الإضافية (الأكبر من الوحدة الأساسية) لمنتج معين */
function setProductUnits(productId, items, companyId) {
  return inTransaction(() => {
    assertBelongs('products', productId, companyId, 'المنتج');
    db.prepare('DELETE FROM product_units WHERE product_id = ?').run(productId);
    const insert = db.prepare('INSERT INTO product_units (product_id, unit_name, factor) VALUES (?, ?, ?)');
    for (const item of items || []) {
      const factor = Number(item.factor);
      if (!item.unit_name || !item.unit_name.trim()) throw new Error('لازم تكتب اسم الوحدة');
      if (!(factor > 0)) throw new Error(`معامل التحويل لوحدة "${item.unit_name}" لازم يكون أكبر من صفر`);
      insert.run(productId, item.unit_name.trim(), factor);
    }
    return db.prepare('SELECT * FROM product_units WHERE product_id = ?').all(productId);
  });
}

function listProductUnits(productId) {
  return db.prepare('SELECT * FROM product_units WHERE product_id = ?').all(productId);
}

/** معامل التحويل لوحدة قياس معينة لمنتج معين (1 لو مفيش وحدة محددة = الوحدة الأساسية) */
function getUnitFactor(productId, companyId, unitId) {
  if (!unitId) return 1;
  const row = db
    .prepare(
      `SELECT pu.factor FROM product_units pu JOIN products p ON p.id = pu.product_id
       WHERE pu.id = ? AND pu.product_id = ? AND p.company_id = ?`
    )
    .get(unitId, productId, companyId);
  if (!row) throw new Error('وحدة قياس غير صحيحة لهذا المنتج');
  return row.factor;
}

// ---------------------------------------------------------------------------
// المشتريات ومرتجعاتها
// ---------------------------------------------------------------------------

/** المسافة بالمتر بين نقطتين جغرافيتين (Haversine) */
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function createPurchaseInvoice({
  company_id, branch_id, supplier_id, invoice_date, items, paid_amount, paid_from, notes,
  latitude, longitude, created_by_user_id,
}) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للفاتورة');
    assertBelongs('suppliers', supplier_id, company_id, 'المورد');
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(company_id);

    // رقابة جغرافية مانعة: لو المورد له موقع مسجّل، لازم الفاتورة تتسجل جواه أو في نطاق مسموح بيه
    if (supplier.latitude !== null && supplier.longitude !== null) {
      const coord = sanitizeCoord(latitude, longitude);
      if (coord.latitude === null) {
        throw new Error('لازم تسمح بمشاركة موقعك عشان تسجل فاتورة شراء لهذا المورد - في رقابة على أماكن ضرب الفواتير');
      }
      const radius = supplier.geofence_radius_m ?? company.geofence_radius_m ?? 300;
      const distance = haversineMeters(
        { lat: supplier.latitude, lng: supplier.longitude },
        { lat: coord.latitude, lng: coord.longitude }
      );
      if (distance > radius) {
        throw new Error(
          `موقعك الحالي بعيد عن موقع المورد المسجّل بـ ${Math.round(distance)} متر (المسموح ${Math.round(radius)} متر) - الفاتورة دي مرفوضة. لازم تسجل الفاتورة وإنت فعليًا عند المورد`
        );
      }
    }

    const invoice_no = nextNumber('purchase_invoices', 'PINV');
    let subtotal = 0;
    const lineData = items.map((it) => {
      const enteredQty = Number(it.qty);
      const enteredUnitCost = Number(it.unit_cost);
      if (!(enteredQty > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
      const factor = getUnitFactor(it.product_id, company_id, it.unit_id);
      const line_total = round2(enteredQty * enteredUnitCost);
      const qty = round2(enteredQty * factor);
      const unit_cost = factor === 1 ? enteredUnitCost : round2(line_total / qty);
      subtotal += line_total;
      return {
        product_id: it.product_id,
        qty,
        unit_cost,
        line_total,
        unit_id: factor === 1 ? null : it.unit_id,
        unit_qty: factor === 1 ? null : enteredQty,
      };
    });
    subtotal = round2(subtotal);
    const vat_amount = company.vat_enabled ? round2(subtotal * (company.vat_rate / 100)) : 0;
    const total = round2(subtotal + vat_amount);
    const paid = Math.max(0, Math.min(round2(Number(paid_amount) || 0), total));
    const coord = sanitizeCoord(latitude, longitude);

    const info = db
      .prepare(
        `INSERT INTO purchase_invoices
         (company_id, branch_id, invoice_no, supplier_id, invoice_date, paid_amount, paid_from, subtotal, vat_amount, total, notes, latitude, longitude, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company_id, branch_id, invoice_no, supplier_id, invoice_date, paid, paid_from || 'cash',
        subtotal, vat_amount, total, notes || null, coord.latitude, coord.longitude, created_by_user_id || null
      );
    const invoiceId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO purchase_items (invoice_id, product_id, qty, unit_cost, line_total, unit_id, unit_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const invAccTotals = {};
    for (const line of lineData) {
      insertItem.run(invoiceId, line.product_id, line.qty, line.unit_cost, line.line_total, line.unit_id || null, line.unit_qty ?? null);
      applyStockMovement({
        product_id: line.product_id,
        branch_id,
        date: invoice_date,
        qty: line.qty,
        unit_cost: line.unit_cost,
        ref_type: 'purchase',
        ref_id: invoiceId,
      });
      const product = getProduct(line.product_id, company_id);
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + line.line_total);
    }

    const jLines = Object.entries(invAccTotals).map(([account_code, amount]) => ({
      account_code,
      debit: amount,
    }));
    if (vat_amount > 0) jLines.push({ account_code: ACC.VAT_INPUT, debit: vat_amount });
    if (paid > 0) jLines.push({ account_code: cashOrBank(paid_from), credit: paid });
    const remaining = round2(total - paid);
    if (remaining > 0) {
      jLines.push({
        account_code: ACC.AP,
        credit: remaining,
        party_type: 'supplier',
        party_id: supplier_id,
      });
    }

    postEntry({
      company_id,
      branch_id,
      date: invoice_date,
      ref_type: 'purchase',
      ref_id: invoiceId,
      description: `فاتورة شراء ${invoice_no} - ${supplier ? supplier.name : ''}`,
      lines: jLines,
    });

    return getPurchaseInvoice(invoiceId);
  });
}

function getPurchaseInvoice(id) {
  const invoice = db
    .prepare(
      `SELECT pi.*, s.name AS supplier_name FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.id = ?`
    )
    .get(id);
  if (!invoice) return null;
  invoice.items = db
    .prepare(
      `SELECT pit.*, p.name AS product_name, p.unit AS product_unit, pu.unit_name AS entered_unit_name
       FROM purchase_items pit
       JOIN products p ON p.id = pit.product_id
       LEFT JOIN product_units pu ON pu.id = pit.unit_id
       WHERE pit.invoice_id = ?`
    )
    .all(id);
  return invoice;
}

function createPurchaseReturn({ company_id, branch_id, supplier_id, purchase_invoice_id, return_date, items, refund_amount, refund_to, notes }) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للمرتجع');
    assertBelongs('suppliers', supplier_id, company_id, 'المورد');

    const return_no = nextNumber('purchase_returns', 'PRET');
    const info = db
      .prepare(
        `INSERT INTO purchase_returns (company_id, branch_id, return_no, supplier_id, purchase_invoice_id, return_date, total, refund_amount, refund_to, notes)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        company_id,
        branch_id,
        return_no,
        supplier_id,
        purchase_invoice_id || null,
        return_date,
        round2(Number(refund_amount) || 0),
        refund_to || 'cash',
        notes || null
      );
    const returnId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO purchase_return_items (return_id, product_id, qty, unit_cost, line_total) VALUES (?, ?, ?, ?, ?)`
    );
    const invAccTotals = {};
    let total = 0;
    for (const it of items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) continue;
      const stock = getProductWithStock(it.product_id, branch_id, company_id);
      if (stock.qty_on_hand < qty) {
        throw new Error(`المخزون غير كافٍ من "${stock.name}" لإرجاعه للمورد (متاح ${stock.qty_on_hand})`);
      }
      const effectiveCost = applyStockMovement({
        product_id: it.product_id,
        branch_id,
        date: return_date,
        qty: -qty,
        ref_type: 'purchase_return',
        ref_id: returnId,
      });
      const line_total = round2(qty * effectiveCost);
      insertItem.run(returnId, it.product_id, qty, effectiveCost, line_total);
      total = round2(total + line_total);
      const acc = invAccFor(stock);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + line_total);
    }
    if (total === 0) throw new Error('لازم تحدد كمية أكبر من صفر لصنف واحد على الأقل');

    db.prepare('UPDATE purchase_returns SET total = ? WHERE id = ?').run(total, returnId);

    const refund = Math.max(0, Math.min(round2(Number(refund_amount) || 0), total));
    const remaining = round2(total - refund);
    const jLines = Object.entries(invAccTotals).map(([account_code, amount]) => ({ account_code, credit: amount }));
    if (remaining > 0) jLines.push({ account_code: ACC.AP, debit: remaining, party_type: 'supplier', party_id: supplier_id });
    if (refund > 0) jLines.push({ account_code: cashOrBank(refund_to), debit: refund });

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
    postEntry({
      company_id,
      branch_id,
      date: return_date,
      ref_type: 'purchase_return',
      ref_id: returnId,
      description: `مرتجع مشتريات ${return_no} - ${supplier ? supplier.name : ''}`,
      lines: jLines,
    });

    return getPurchaseReturn(returnId);
  });
}

function getPurchaseReturn(id) {
  const ret = db
    .prepare(
      `SELECT pr.*, s.name AS supplier_name FROM purchase_returns pr
       JOIN suppliers s ON s.id = pr.supplier_id WHERE pr.id = ?`
    )
    .get(id);
  if (!ret) return null;
  ret.items = db
    .prepare(
      `SELECT i.*, p.name AS product_name, p.unit AS product_unit
       FROM purchase_return_items i JOIN products p ON p.id = i.product_id WHERE i.return_id = ?`
    )
    .all(id);
  return ret;
}

// ---------------------------------------------------------------------------
// أوامر التصنيع
// ---------------------------------------------------------------------------

function createProductionOrder({ company_id, branch_id, product_id, qty_produced, order_date, extra_cost, paid_from, notes, items }) {
  return inTransaction(() => {
    const product = getProduct(product_id, company_id);
    if (product.kind !== 'manufactured') {
      throw new Error('أمر التصنيع لازم يكون لمنتج من نوع "مُصنّع"');
    }
    const qtyProduced = Number(qty_produced);
    if (!(qtyProduced > 0)) throw new Error('كمية الإنتاج لازم تكون أكبر من صفر');

    let components = items;
    if (!Array.isArray(components) || components.length === 0) {
      const bom = db.prepare('SELECT * FROM bom_items WHERE product_id = ?').all(product_id);
      if (bom.length === 0) throw new Error('لا يوجد تركيبة (BOM) لهذا المنتج، حدد المكونات يدويًا');
      components = bom.map((b) => ({ component_id: b.component_id, qty_used: b.qty_per_unit * qtyProduced }));
    }

    const order_no = nextNumber('production_orders', 'PORD');
    const extraCost = Math.max(0, round2(Number(extra_cost) || 0));
    const info = db
      .prepare(
        `INSERT INTO production_orders (company_id, branch_id, order_no, product_id, qty_produced, order_date, extra_cost, paid_from, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, branch_id, order_no, product_id, qtyProduced, order_date, extraCost, paid_from || 'cash', notes || null);
    const orderId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO production_items (order_id, component_id, qty_used, unit_cost) VALUES (?, ?, ?, ?)`
    );
    const rawAccTotals = {};
    let rawTotal = 0;
    for (const comp of components) {
      const qtyUsed = Number(comp.qty_used);
      if (!(qtyUsed > 0)) continue;
      const compStock = getProductWithStock(comp.component_id, branch_id, company_id);
      if (compStock.qty_on_hand < qtyUsed) {
        throw new Error(
          `المخزون غير كافٍ من "${compStock.name}" (متاح ${compStock.qty_on_hand}، مطلوب ${qtyUsed})`
        );
      }
      const effectiveCost = applyStockMovement({
        product_id: comp.component_id,
        branch_id,
        date: order_date,
        qty: -qtyUsed,
        ref_type: 'production_out',
        ref_id: orderId,
      });
      insertItem.run(orderId, comp.component_id, qtyUsed, effectiveCost);
      const lineCost = round2(qtyUsed * effectiveCost);
      rawTotal = round2(rawTotal + lineCost);
      const acc = invAccFor(compStock);
      rawAccTotals[acc] = round2((rawAccTotals[acc] || 0) + lineCost);
    }

    const totalCost = round2(rawTotal + extraCost);
    const unitCost = totalCost / qtyProduced;
    applyStockMovement({
      product_id,
      branch_id,
      date: order_date,
      qty: qtyProduced,
      unit_cost: unitCost,
      ref_type: 'production_in',
      ref_id: orderId,
    });

    const jLines = [{ account_code: invAccFor(product), debit: totalCost }];
    for (const [account_code, amount] of Object.entries(rawAccTotals)) {
      jLines.push({ account_code, credit: amount });
    }
    if (extraCost > 0) jLines.push({ account_code: cashOrBank(paid_from), credit: extraCost });

    postEntry({
      company_id,
      branch_id,
      date: order_date,
      ref_type: 'production',
      ref_id: orderId,
      description: `أمر تصنيع ${order_no} - ${product.name}`,
      lines: jLines,
    });

    return getProductionOrder(orderId);
  });
}

function getProductionOrder(id) {
  const order = db
    .prepare(
      `SELECT po.*, p.name AS product_name, p.unit AS product_unit FROM production_orders po
       JOIN products p ON p.id = po.product_id WHERE po.id = ?`
    )
    .get(id);
  if (!order) return null;
  order.items = db
    .prepare(
      `SELECT pit.*, p.name AS component_name, p.unit AS component_unit
       FROM production_items pit JOIN products p ON p.id = pit.component_id WHERE pit.order_id = ?`
    )
    .all(id);
  return order;
}

// ---------------------------------------------------------------------------
// السيارات والرحلات
// ---------------------------------------------------------------------------

function createVehicle({ company_id, branch_id, name, ownership, driver_name, monthly_rent, notes }) {
  const info = db
    .prepare(
      `INSERT INTO vehicles (company_id, branch_id, name, ownership, driver_name, monthly_rent, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(company_id, branch_id, name, ownership, driver_name || null, Number(monthly_rent) || 0, notes || null);
  return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid);
}

function createTrip({ company_id, branch_id, vehicle_id, responsible_employee_id, trip_date, notes }) {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle || vehicle.company_id !== company_id) throw new Error('سيارة غير موجودة');
  if (vehicle.branch_id !== branch_id) throw new Error('السيارة دي مش تابعة للفرع الحالي');
  if (!responsible_employee_id) throw new Error('لازم تحدد الموظف/السائق المسؤول عن السيارة والبضاعة قبل بدء الرحلة');
  assertBelongs('employees', responsible_employee_id, company_id, 'الموظف المسؤول');
  const trip_no = nextNumber('trips', 'TRIP');
  const info = db
    .prepare(
      `INSERT INTO trips (company_id, branch_id, trip_no, vehicle_id, responsible_employee_id, trip_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(company_id, branch_id, trip_no, vehicle_id, responsible_employee_id, trip_date, notes || null);
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(info.lastInsertRowid);
}

function requireTrip(trip_id) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip_id);
  if (!trip) throw new Error('رحلة غير موجودة');
  return trip;
}

function requireOpenTrip(trip_id) {
  const trip = requireTrip(trip_id);
  if (trip.status !== 'open') throw new Error('الرحلة مُقفلة (متسواة) بالفعل');
  return trip;
}

// ---------------------------------------------------------------------------
// تتبع موقع الرحلة (خرائط جوجل)
// ---------------------------------------------------------------------------

function recordDriverLocation({ company_id, branch_id, trip_id, user_id, latitude, longitude, accuracy }) {
  const trip = requireOpenTrip(trip_id);
  if (trip.company_id !== company_id) throw new Error('رحلة غير موجودة أو لا تنتمي لهذه المنشأة');
  const coord = sanitizeCoord(latitude, longitude);
  if (coord.latitude === null) throw new Error('إحداثيات غير صالحة');
  db.prepare(
    `INSERT INTO driver_locations (company_id, branch_id, trip_id, user_id, latitude, longitude, accuracy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(company_id, branch_id || trip.branch_id, trip_id, user_id || null, coord.latitude, coord.longitude, Number(accuracy) || null);
  return { ok: true };
}

function tripLocationTrail(tripId, companyId) {
  assertBelongs('trips', tripId, companyId, 'رحلة');
  return db
    .prepare(
      `SELECT dl.id, dl.latitude, dl.longitude, dl.accuracy, dl.recorded_at, u.username
       FROM driver_locations dl LEFT JOIN users u ON u.id = dl.user_id
       WHERE dl.trip_id = ? ORDER BY dl.recorded_at DESC LIMIT 300`
    )
    .all(tripId);
}

/** آخر موقع معروف لكل الرحلات المفتوحة (خريطة تتبع حية للمالك/المحاسب) */
function liveTripLocations(companyId, branchId) {
  const branchFilter = branchId ? 'AND t.branch_id = ?' : '';
  const params = branchId ? [companyId, branchId] : [companyId];
  const trips = db
    .prepare(
      `SELECT t.id, t.trip_no, t.trip_date, v.name AS vehicle_name
       FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
       WHERE t.company_id = ? AND t.status = 'open' ${branchFilter}`
    )
    .all(...params);
  return trips
    .map((t) => {
      const last = db
        .prepare(
          `SELECT latitude, longitude, accuracy, recorded_at FROM driver_locations
           WHERE trip_id = ? ORDER BY recorded_at DESC LIMIT 1`
        )
        .get(t.id);
      return last ? { ...t, ...last } : null;
    })
    .filter(Boolean);
}

function addTripLoad({ trip_id, items }) {
  return inTransaction(() => {
    const trip = requireOpenTrip(trip_id);
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف أصناف للتحميل');

    const insertLoad = db.prepare(
      `INSERT INTO trip_loads (trip_id, product_id, qty_loaded, unit_cost) VALUES (?, ?, ?, ?)`
    );
    const invAccTotals = {};
    let totalValue = 0;
    for (const it of items) {
      const qty = Number(it.qty_loaded);
      if (!(qty > 0)) continue;
      const stock = getProductWithStock(it.product_id, trip.branch_id, trip.company_id);
      if (stock.qty_on_hand < qty) {
        throw new Error(`المخزون غير كافٍ من "${stock.name}" (متاح ${stock.qty_on_hand}، مطلوب ${qty})`);
      }
      const effectiveCost = applyStockMovement({
        product_id: it.product_id,
        branch_id: trip.branch_id,
        date: trip.trip_date,
        qty: -qty,
        ref_type: 'trip_load',
        ref_id: trip_id,
      });
      insertLoad.run(trip_id, it.product_id, qty, effectiveCost);
      const value = round2(qty * effectiveCost);
      totalValue = round2(totalValue + value);
      const acc = invAccFor(stock);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + value);
    }

    if (totalValue > 0) {
      const jLines = [
        { account_code: ACC.CUSTODY, debit: totalValue, party_type: 'employee', party_id: trip.responsible_employee_id },
      ];
      for (const [account_code, amount] of Object.entries(invAccTotals)) {
        jLines.push({ account_code, credit: amount });
      }
      postEntry({
        company_id: trip.company_id,
        branch_id: trip.branch_id,
        date: trip.trip_date,
        ref_type: 'trip_load',
        ref_id: trip_id,
        description: `تحميل رحلة ${trip.trip_no}`,
        lines: jLines,
      });
    }

    return getTrip(trip_id);
  });
}

function tripLoadUnitCost(trip_id, product_id) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(qty_loaded * unit_cost),0) AS val, COALESCE(SUM(qty_loaded),0) AS qty
       FROM trip_loads WHERE trip_id = ? AND product_id = ?`
    )
    .get(trip_id, product_id);
  return row.qty > 0 ? row.val / row.qty : 0;
}

function tripRemainingQty(trip_id, product_id) {
  const loaded = db
    .prepare('SELECT COALESCE(SUM(qty_loaded),0) AS q FROM trip_loads WHERE trip_id = ? AND product_id = ?')
    .get(trip_id, product_id).q;
  const sold = db
    .prepare(
      `SELECT COALESCE(SUM(si.qty),0) AS q FROM sales_items si
       JOIN sales_invoices sv ON sv.id = si.invoice_id
       WHERE sv.trip_id = ? AND si.product_id = ?`
    )
    .get(trip_id, product_id).q;
  const returned = db
    .prepare('SELECT COALESCE(SUM(qty_returned),0) AS q FROM trip_returns WHERE trip_id = ? AND product_id = ?')
    .get(trip_id, product_id).q;
  const damaged = db
    .prepare('SELECT COALESCE(SUM(qty),0) AS q FROM damages WHERE trip_id = ? AND product_id = ?')
    .get(trip_id, product_id).q;
  return round2(loaded - sold - returned - damaged);
}

function addTripExpense({ trip_id, category, amount, paid_from, notes }) {
  return inTransaction(() => {
    const trip = requireOpenTrip(trip_id);
    const amt = round2(Number(amount));
    if (!(amt > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const from = paid_from || 'cash';
    if (from === 'driver_custody' && !trip.responsible_employee_id) {
      throw new Error('الرحلة دي مالهاش موظف مسؤول محدد، مينفعش يتصرف من عهدته');
    }
    const info = db
      .prepare(
        `INSERT INTO trip_expenses (trip_id, category, amount, paid_from, notes) VALUES (?, ?, ?, ?, ?)`
      )
      .run(trip_id, category, amt, from, notes || null);

    // 'driver_custody' = المصروف اتدفع من الكاش اللي في إيد السائق (تحصيلات ميدانية)، فبنقلل عهدته
    // النقدية بدل ما نلمس خزنة/بنك المنشأة اللي أصلًا محصلش منها حاجة.
    const creditLine =
      from === 'driver_custody'
        ? { account_code: ACC.PETTY_CUSTODY, credit: amt, party_type: 'employee', party_id: trip.responsible_employee_id }
        : { account_code: cashOrBank(from), credit: amt };

    postEntry({
      company_id: trip.company_id,
      branch_id: trip.branch_id,
      date: trip.trip_date,
      ref_type: 'trip_expense',
      ref_id: info.lastInsertRowid,
      description: `مصروف رحلة ${trip.trip_no} - ${category}`,
      lines: [
        { account_code: TRIP_EXPENSE_CATEGORY_TO_ACC[category] || ACC.MISC_EXP, debit: amt },
        creditLine,
      ],
    });
    return getTrip(trip_id);
  });
}

function addTripReturn({ trip_id, items }) {
  return inTransaction(() => {
    const trip = requireOpenTrip(trip_id);
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف أصناف للإرجاع');

    const insertReturn = db.prepare(
      `INSERT INTO trip_returns (trip_id, product_id, qty_returned, unit_cost) VALUES (?, ?, ?, ?)`
    );
    const invAccTotals = {};
    let totalValue = 0;
    for (const it of items) {
      const qty = Number(it.qty_returned);
      if (!(qty > 0)) continue;
      const remaining = tripRemainingQty(trip_id, it.product_id);
      if (qty > remaining) {
        const product = getProduct(it.product_id, trip.company_id);
        throw new Error(`كمية الإرجاع أكبر من المتبقي في العهدة لـ "${product.name}" (المتبقي ${remaining})`);
      }
      const unitCost = tripLoadUnitCost(trip_id, it.product_id);
      applyStockMovement({
        product_id: it.product_id,
        branch_id: trip.branch_id,
        date: trip.trip_date,
        qty,
        unit_cost: unitCost,
        ref_type: 'trip_return',
        ref_id: trip_id,
      });
      insertReturn.run(trip_id, it.product_id, qty, unitCost);
      const value = round2(qty * unitCost);
      totalValue = round2(totalValue + value);
      const product = getProduct(it.product_id, trip.company_id);
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + value);
    }

    if (totalValue > 0) {
      const jLines = [
        { account_code: ACC.CUSTODY, credit: totalValue, party_type: 'employee', party_id: trip.responsible_employee_id },
      ];
      for (const [account_code, amount] of Object.entries(invAccTotals)) {
        jLines.push({ account_code, debit: amount });
      }
      postEntry({
        company_id: trip.company_id,
        branch_id: trip.branch_id,
        date: trip.trip_date,
        ref_type: 'trip_return',
        ref_id: trip_id,
        description: `مرتجع رحلة ${trip.trip_no}`,
        lines: jLines,
      });
    }

    return getTrip(trip_id);
  });
}

function settleTrip({ trip_id, write_off_discrepancy }) {
  return inTransaction(() => {
    const trip = requireOpenTrip(trip_id);
    const products = db
      .prepare('SELECT DISTINCT product_id FROM trip_loads WHERE trip_id = ?')
      .all(trip_id);

    const reconciliation = products.map((row) => {
      const product = getProduct(row.product_id, trip.company_id);
      const remaining = tripRemainingQty(trip_id, row.product_id);
      return { product_id: row.product_id, product_name: product.name, remaining };
    });

    if (write_off_discrepancy) {
      for (const item of reconciliation) {
        if (item.remaining > 0) {
          createDamage({
            company_id: trip.company_id,
            branch_id: trip.branch_id,
            product_id: item.product_id,
            qty: item.remaining,
            damage_date: trip.trip_date,
            reason: 'عجز عند تسوية الرحلة',
            trip_id,
          });
          item.remaining = 0;
        }
      }
    }

    db.prepare(`UPDATE trips SET status = 'settled', settled_at = datetime('now') WHERE id = ?`).run(trip_id);
    return { trip: getTrip(trip_id), reconciliation };
  });
}

function getTrip(id) {
  const trip = db
    .prepare(
      `SELECT t.*, v.name AS vehicle_name, v.ownership, e.name AS responsible_employee_name
       FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN employees e ON e.id = t.responsible_employee_id
       WHERE t.id = ?`
    )
    .get(id);
  if (!trip) return null;
  trip.loads = db
    .prepare(
      `SELECT tl.*, p.name AS product_name, p.unit AS product_unit FROM trip_loads tl
       JOIN products p ON p.id = tl.product_id WHERE tl.trip_id = ?`
    )
    .all(id);
  trip.returns = db
    .prepare(
      `SELECT tr.*, p.name AS product_name, p.unit AS product_unit FROM trip_returns tr
       JOIN products p ON p.id = tr.product_id WHERE tr.trip_id = ?`
    )
    .all(id);
  trip.expenses = db.prepare('SELECT * FROM trip_expenses WHERE trip_id = ?').all(id);
  trip.sales = db
    .prepare(
      `SELECT si.*, c.name AS customer_name FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id WHERE si.trip_id = ?`
    )
    .all(id);
  trip.damages = db.prepare('SELECT * FROM damages WHERE trip_id = ?').all(id);
  return trip;
}

// ---------------------------------------------------------------------------
// المبيعات ومرتجعاتها
// ---------------------------------------------------------------------------

function sanitizeCoord(lat, lng) {
  if (lat === '' || lat === null || lat === undefined || lng === '' || lng === null || lng === undefined) {
    return { latitude: null, longitude: null };
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { latitude: null, longitude: null };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return { latitude: null, longitude: null };
  return { latitude, longitude };
}

function createSalesInvoice({
  company_id, branch_id, customer_id, trip_id, invoice_date, items, paid_amount, paid_to, notes,
  latitude, longitude, created_by_user_id,
}) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للفاتورة');

    let trip = null;
    if (trip_id) {
      trip = requireOpenTrip(trip_id);
      company_id = trip.company_id;
      branch_id = trip.branch_id;
    }
    if (!company_id || !branch_id) throw new Error('لازم تحديد المنشأة والفرع');
    assertBelongs('customers', customer_id, company_id, 'العميل');
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(company_id);

    const invoice_no = nextNumber('sales_invoices', 'SINV');
    let subtotal = 0;
    let totalCost = 0;
    const lineData = [];

    // تمريرة أولى: تحقق فقط + حساب التكلفة والإجمالي بدون تعديل المخزون
    for (const it of items) {
      const enteredQty = Number(it.qty);
      const enteredUnitPrice = Number(it.unit_price);
      if (!(enteredQty > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
      const factor = getUnitFactor(it.product_id, company_id, it.unit_id);
      const qty = round2(enteredQty * factor);

      let unit_cost;
      let productKind;
      if (trip_id) {
        const remaining = tripRemainingQty(trip_id, it.product_id);
        if (qty > remaining) {
          const product = getProduct(it.product_id, company_id);
          throw new Error(`الكمية أكبر من المتاح في عهدة الرحلة لـ "${product.name}" (المتاح ${remaining})`);
        }
        unit_cost = tripLoadUnitCost(trip_id, it.product_id);
        productKind = getProduct(it.product_id, company_id).kind;
      } else {
        const stock = getProductWithStock(it.product_id, branch_id, company_id);
        if (stock.qty_on_hand < qty) {
          throw new Error(`المخزون غير كافٍ من "${stock.name}" (متاح ${stock.qty_on_hand}، مطلوب ${qty})`);
        }
        unit_cost = stock.cost_price;
        productKind = stock.kind;
      }

      const line_total = round2(enteredQty * enteredUnitPrice);
      const unit_price = factor === 1 ? enteredUnitPrice : round2(line_total / qty);
      subtotal = round2(subtotal + line_total);
      totalCost = round2(totalCost + round2(qty * unit_cost));
      lineData.push({
        product_id: it.product_id,
        qty,
        unit_price,
        unit_cost,
        line_total,
        kind: productKind,
        unit_id: factor === 1 ? null : it.unit_id,
        unit_qty: factor === 1 ? null : enteredQty,
      });
    }

    const vat_amount = company.vat_enabled ? round2(subtotal * (company.vat_rate / 100)) : 0;
    const total = round2(subtotal + vat_amount);
    const paid = Math.max(0, Math.min(round2(Number(paid_amount) || 0), total));
    const coord = sanitizeCoord(latitude, longitude);
    const info = db
      .prepare(
        `INSERT INTO sales_invoices
         (company_id, branch_id, invoice_no, customer_id, trip_id, invoice_date, paid_amount, paid_to, subtotal, vat_amount, total, notes, latitude, longitude, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company_id,
        branch_id,
        invoice_no,
        customer_id,
        trip_id || null,
        invoice_date,
        paid,
        paid_to || 'cash',
        subtotal,
        vat_amount,
        total,
        notes || null,
        coord.latitude,
        coord.longitude,
        created_by_user_id || null
      );
    const invoiceId = info.lastInsertRowid;

    // تمريرة ثانية: الآن بعد ما بقى عندنا رقم الفاتورة، نسجل بنود الفاتورة ونحرك المخزون فعليًا
    const insertItem = db.prepare(
      `INSERT INTO sales_items (invoice_id, product_id, qty, unit_price, unit_cost, line_total, unit_id, unit_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const cogsAccTotals = {};
    for (const line of lineData) {
      insertItem.run(invoiceId, line.product_id, line.qty, line.unit_price, line.unit_cost, line.line_total, line.unit_id || null, line.unit_qty ?? null);
      if (!trip_id) {
        applyStockMovement({
          product_id: line.product_id,
          branch_id,
          date: invoice_date,
          qty: -line.qty,
          ref_type: 'sale',
          ref_id: invoiceId,
        });
      }
      const value = round2(line.qty * line.unit_cost);
      const acc = trip_id ? ACC.CUSTODY : PRODUCT_KIND_TO_INVENTORY_ACC[line.kind];
      cogsAccTotals[acc] = round2((cogsAccTotals[acc] || 0) + value);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    const jLines = [];
    if (paid > 0) {
      // تحصيل نقدي أثناء رحلة توزيع = كاش في إيد السائق (عهدة)، لحد ما يورّده لخزنة المنشأة.
      // تحصيل بنكي (تحويل مباشر للعميل) بيروح لحساب البنك على طول حتى لو الفاتورة مربوطة برحلة.
      if (trip_id && (paid_to || 'cash') === 'cash') {
        jLines.push({ account_code: ACC.PETTY_CUSTODY, debit: paid, party_type: 'employee', party_id: trip.responsible_employee_id });
      } else {
        jLines.push({ account_code: cashOrBank(paid_to), debit: paid });
      }
    }
    const remaining = round2(total - paid);
    if (remaining > 0) {
      jLines.push({ account_code: ACC.AR, debit: remaining, party_type: 'customer', party_id: customer_id });
    }
    jLines.push({ account_code: ACC.SALES, credit: subtotal });
    if (vat_amount > 0) jLines.push({ account_code: ACC.VAT_OUTPUT, credit: vat_amount });
    if (totalCost > 0) {
      jLines.push({ account_code: ACC.COGS, debit: totalCost });
      for (const [account_code, amount] of Object.entries(cogsAccTotals)) {
        const line = { account_code, credit: amount };
        if (trip_id && account_code === ACC.CUSTODY) {
          line.party_type = 'employee';
          line.party_id = trip.responsible_employee_id;
        }
        jLines.push(line);
      }
    }

    postEntry({
      company_id,
      branch_id,
      date: invoice_date,
      ref_type: 'sale',
      ref_id: invoiceId,
      description: `فاتورة مبيعات ${invoice_no} - ${customer ? customer.name : ''}`,
      lines: jLines,
    });

    return getSalesInvoice(invoiceId);
  });
}

function getSalesInvoice(id) {
  const invoice = db
    .prepare(
      `SELECT si.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
              t.trip_no, co.name AS company_name, co.public_url AS company_public_url
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       JOIN companies co ON co.id = si.company_id
       LEFT JOIN trips t ON t.id = si.trip_id
       WHERE si.id = ?`
    )
    .get(id);
  if (!invoice) return null;
  invoice.items = db
    .prepare(
      `SELECT sit.*, p.name AS product_name, p.unit AS product_unit, pu.unit_name AS entered_unit_name
       FROM sales_items sit
       JOIN products p ON p.id = sit.product_id
       LEFT JOIN product_units pu ON pu.id = sit.unit_id
       WHERE sit.invoice_id = ?`
    )
    .all(id);
  return invoice;
}

function createSalesReturn({ company_id, branch_id, customer_id, sales_invoice_id, return_date, items, refund_amount, refund_from, notes }) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للمرتجع');
    assertBelongs('customers', customer_id, company_id, 'العميل');

    const return_no = nextNumber('sales_returns', 'SRET');
    const info = db
      .prepare(
        `INSERT INTO sales_returns (company_id, branch_id, return_no, customer_id, sales_invoice_id, return_date, total, refund_amount, refund_from, notes)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        company_id,
        branch_id,
        return_no,
        customer_id,
        sales_invoice_id || null,
        return_date,
        round2(Number(refund_amount) || 0),
        refund_from || 'cash',
        notes || null
      );
    const returnId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO sales_return_items (return_id, product_id, qty, unit_price, unit_cost, line_total) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const invAccTotals = {};
    let total = 0;
    let totalCost = 0;
    for (const it of items) {
      const qty = Number(it.qty);
      const unit_price = Number(it.unit_price);
      if (!(qty > 0)) continue;

      let unit_cost = null;
      if (sales_invoice_id) {
        const origLine = db
          .prepare('SELECT unit_cost FROM sales_items WHERE invoice_id = ? AND product_id = ? LIMIT 1')
          .get(sales_invoice_id, it.product_id);
        if (origLine) unit_cost = origLine.unit_cost;
      }
      const product = getProduct(it.product_id, company_id);
      if (unit_cost === null) {
        const stock = getProductWithStock(it.product_id, branch_id, company_id);
        unit_cost = stock.cost_price;
      }

      applyStockMovement({
        product_id: it.product_id,
        branch_id,
        date: return_date,
        qty,
        unit_cost,
        ref_type: 'sales_return',
        ref_id: returnId,
      });
      const line_total = round2(qty * unit_price);
      insertItem.run(returnId, it.product_id, qty, unit_price, unit_cost, line_total);
      total = round2(total + line_total);
      totalCost = round2(totalCost + round2(qty * unit_cost));
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + round2(qty * unit_cost));
    }
    if (total === 0) throw new Error('لازم تحدد كمية أكبر من صفر لصنف واحد على الأقل');

    db.prepare('UPDATE sales_returns SET total = ? WHERE id = ?').run(total, returnId);

    const refund = Math.max(0, Math.min(round2(Number(refund_amount) || 0), total));
    const remaining = round2(total - refund);
    const jLines = [{ account_code: ACC.SALES_RETURNS, debit: total }];
    if (remaining > 0) jLines.push({ account_code: ACC.AR, credit: remaining, party_type: 'customer', party_id: customer_id });
    if (refund > 0) jLines.push({ account_code: cashOrBank(refund_from), credit: refund });
    if (totalCost > 0) {
      jLines.push({ account_code: ACC.COGS, credit: totalCost });
      for (const [account_code, amount] of Object.entries(invAccTotals)) {
        jLines.push({ account_code, debit: amount });
      }
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    postEntry({
      company_id,
      branch_id,
      date: return_date,
      ref_type: 'sales_return',
      ref_id: returnId,
      description: `مرتجع مبيعات ${return_no} - ${customer ? customer.name : ''}`,
      lines: jLines,
    });

    return getSalesReturn(returnId);
  });
}

function getSalesReturn(id) {
  const ret = db
    .prepare(
      `SELECT sr.*, c.name AS customer_name FROM sales_returns sr
       JOIN customers c ON c.id = sr.customer_id WHERE sr.id = ?`
    )
    .get(id);
  if (!ret) return null;
  ret.items = db
    .prepare(
      `SELECT i.*, p.name AS product_name, p.unit AS product_unit
       FROM sales_return_items i JOIN products p ON p.id = i.product_id WHERE i.return_id = ?`
    )
    .all(id);
  return ret;
}

// ---------------------------------------------------------------------------
// التوالف
// ---------------------------------------------------------------------------

function createDamage({
  company_id, branch_id, product_id, qty, damage_date, reason, trip_id, notes,
  responsible_employee_id, responsible_name, photo_data,
}) {
  return inTransaction(() => {
    const qtyNum = Number(qty);
    if (!(qtyNum > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
    if (!reason || !reason.trim()) throw new Error('لازم تكتب سبب التلف');

    if (trip_id) {
      const trip = requireOpenTrip(trip_id);
      company_id = trip.company_id;
      branch_id = trip.branch_id;
    }
    if (!company_id || !branch_id) throw new Error('لازم تحديد المنشأة والفرع');

    const product = getProduct(product_id, company_id);
    let unit_cost;
    let creditAcc;
    let creditParty = {};
    if (trip_id) {
      const trip = requireTrip(trip_id);
      const remaining = tripRemainingQty(trip_id, product_id);
      if (qtyNum > remaining) {
        throw new Error(`الكمية أكبر من المتاح في عهدة الرحلة لـ "${product.name}" (المتاح ${remaining})`);
      }
      unit_cost = tripLoadUnitCost(trip_id, product_id);
      creditAcc = ACC.CUSTODY;
      creditParty = { party_type: 'employee', party_id: trip.responsible_employee_id };
      // افتراضيًا المسؤول عن التلف أثناء رحلة هو المسؤول عن الرحلة نفسه، إلا لو اتحدد حد تاني صراحة
      if (!responsible_employee_id && !responsible_name) responsible_employee_id = trip.responsible_employee_id;
    } else {
      const stock = getProductWithStock(product_id, branch_id, company_id);
      if (stock.qty_on_hand < qtyNum) {
        throw new Error(`المخزون غير كافٍ من "${stock.name}" (متاح ${stock.qty_on_hand}، مطلوب ${qtyNum})`);
      }
      unit_cost = stock.cost_price;
      creditAcc = invAccFor(stock);
    }

    if (responsible_employee_id) assertBelongs('employees', responsible_employee_id, company_id, 'المسؤول عن التلف');

    const damage_no = nextNumber('damages', 'DMG');
    const info = db
      .prepare(
        `INSERT INTO damages
         (company_id, branch_id, damage_no, product_id, qty, unit_cost, damage_date, reason, responsible_employee_id, responsible_name, photo_data, trip_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company_id,
        branch_id,
        damage_no,
        product_id,
        qtyNum,
        unit_cost,
        damage_date,
        reason.trim(),
        responsible_employee_id || null,
        responsible_employee_id ? null : responsible_name || null,
        photo_data || null,
        trip_id || null,
        notes || null
      );

    if (!trip_id) {
      applyStockMovement({
        product_id,
        branch_id,
        date: damage_date,
        qty: -qtyNum,
        ref_type: 'damage',
        ref_id: info.lastInsertRowid,
      });
    }

    const amount = round2(qtyNum * unit_cost);
    if (amount > 0) {
      postEntry({
        company_id,
        branch_id,
        date: damage_date,
        ref_type: 'damage',
        ref_id: info.lastInsertRowid,
        description: `توالف ${damage_no} - ${product.name}${reason ? ' (' + reason + ')' : ''}`,
        lines: [
          { account_code: ACC.DAMAGE_EXP, debit: amount },
          { account_code: creditAcc, credit: amount, ...creditParty },
        ],
      });
    }

    return db.prepare('SELECT * FROM damages WHERE id = ?').get(info.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------
// تحويلات وتسويات المخزون
// ---------------------------------------------------------------------------

function createStockTransfer({ company_id, from_branch_id, to_branch_id, transfer_date, items, notes }) {
  return inTransaction(() => {
    if (from_branch_id === to_branch_id) throw new Error('لازم يكون الفرع المرسل مختلف عن الفرع المستقبل');
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف أصناف للتحويل');
    assertBelongs('branches', from_branch_id, company_id, 'الفرع المرسل');
    assertBelongs('branches', to_branch_id, company_id, 'الفرع المستقبل');

    const transfer_no = nextNumber('stock_transfers', 'TRF');
    const info = db
      .prepare(
        `INSERT INTO stock_transfers (company_id, transfer_no, from_branch_id, to_branch_id, transfer_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, transfer_no, from_branch_id, to_branch_id, transfer_date, notes || null);
    const transferId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO stock_transfer_items (transfer_id, product_id, qty, unit_cost) VALUES (?, ?, ?, ?)`
    );
    let debitLines = {};
    let creditLines = {};
    for (const it of items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) continue;
      const stock = getProductWithStock(it.product_id, from_branch_id, company_id);
      if (stock.qty_on_hand < qty) {
        throw new Error(`المخزون غير كافٍ من "${stock.name}" بالفرع المرسل (متاح ${stock.qty_on_hand})`);
      }
      const effectiveCost = applyStockMovement({
        product_id: it.product_id,
        branch_id: from_branch_id,
        date: transfer_date,
        qty: -qty,
        ref_type: 'transfer_out',
        ref_id: transferId,
      });
      applyStockMovement({
        product_id: it.product_id,
        branch_id: to_branch_id,
        date: transfer_date,
        qty,
        unit_cost: effectiveCost,
        ref_type: 'transfer_in',
        ref_id: transferId,
      });
      insertItem.run(transferId, it.product_id, qty, effectiveCost);
      const value = round2(qty * effectiveCost);
      const acc = invAccFor(stock);
      debitLines[acc] = round2((debitLines[acc] || 0) + value);
      creditLines[acc] = round2((creditLines[acc] || 0) + value);
    }

    const jLines = [];
    for (const [account_code, amount] of Object.entries(debitLines)) {
      jLines.push({ account_code, debit: amount, branch_id: to_branch_id });
      jLines.push({ account_code, credit: amount, branch_id: from_branch_id });
    }
    if (jLines.length === 0) throw new Error('لازم تحدد كمية أكبر من صفر لصنف واحد على الأقل');

    postEntry({
      company_id,
      date: transfer_date,
      ref_type: 'stock_transfer',
      ref_id: transferId,
      description: `تحويل مخزون ${transfer_no}`,
      lines: jLines,
    });

    return db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(transferId);
  });
}

function createStockAdjustment({ company_id, branch_id, product_id, qty_counted, adjustment_date, reason, notes }) {
  return inTransaction(() => {
    const stock = getProductWithStock(product_id, branch_id, company_id);
    const qtyBefore = stock.qty_on_hand;
    const qtyCounted = Number(qty_counted);
    const diff = round2(qtyCounted - qtyBefore);

    const adjustment_no = nextNumber('stock_adjustments', 'ADJ');
    const unitCostForRecord = stock.cost_price;
    const info = db
      .prepare(
        `INSERT INTO stock_adjustments (company_id, branch_id, adjustment_no, product_id, qty_before, qty_counted, qty_diff, unit_cost, adjustment_date, reason, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, branch_id, adjustment_no, product_id, qtyBefore, qtyCounted, diff, unitCostForRecord, adjustment_date, reason || null, notes || null);

    if (diff !== 0) {
      const effectiveCost = applyStockMovement({
        product_id,
        branch_id,
        date: adjustment_date,
        qty: diff,
        unit_cost: unitCostForRecord,
        ref_type: 'adjustment',
        ref_id: info.lastInsertRowid,
      });
      const amount = round2(Math.abs(diff) * effectiveCost);
      const invAcc = invAccFor(stock);
      if (amount > 0) {
        const jLines =
          diff > 0
            ? [
                { account_code: invAcc, debit: amount },
                { account_code: ACC.OTHER_INCOME, credit: amount },
              ]
            : [
                { account_code: ACC.DAMAGE_EXP, debit: amount },
                { account_code: invAcc, credit: amount },
              ];
        postEntry({
          company_id,
          branch_id,
          date: adjustment_date,
          ref_type: 'adjustment',
          ref_id: info.lastInsertRowid,
          description: `تسوية جرد ${adjustment_no} - ${stock.name}${reason ? ' (' + reason + ')' : ''}`,
          lines: jLines,
        });
      }
    }

    return db.prepare('SELECT * FROM stock_adjustments WHERE id = ?').get(info.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------
// المصروفات العامة
// ---------------------------------------------------------------------------

function createExpense({ company_id, branch_id, category, amount, expense_date, paid_from, notes }) {
  return inTransaction(() => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const expense_no = nextNumber('expenses', 'EXP');
    const info = db
      .prepare(
        `INSERT INTO expenses (company_id, branch_id, expense_no, category, amount, expense_date, paid_from, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, branch_id, expense_no, category, amt, expense_date, paid_from || 'cash', notes || null);

    postEntry({
      company_id,
      branch_id,
      date: expense_date,
      ref_type: 'expense',
      ref_id: info.lastInsertRowid,
      description: `مصروف ${expense_no} - ${category}`,
      lines: [
        { account_code: EXPENSE_CATEGORY_TO_ACC[category] || ACC.MISC_EXP, debit: amt },
        { account_code: cashOrBank(paid_from), credit: amt },
      ],
    });
    return db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------
// سندات القبض والصرف
// ---------------------------------------------------------------------------

const EMPLOYEE_VOUCHER_TYPES = ['advance', 'advance_settlement', 'custody_out', 'custody_return', 'salary'];
const EMPLOYEE_VOUCHER_LABELS = {
  advance: 'سلفة لموظف',
  advance_settlement: 'تسوية سلفة موظف',
  custody_out: 'صرف عهدة لموظف',
  custody_return: 'استرجاع عهدة من موظف',
  salary: 'صرف راتب',
};

function createEmployeeVoucher({ company_id, branch_id, voucher_type, party_id, amt, method, voucher_date, notes }) {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(party_id);
  const voucher_no = nextNumber('vouchers', 'EMP');
  const info = db
    .prepare(
      `INSERT INTO vouchers (company_id, branch_id, voucher_no, voucher_type, party_type, party_id, party_name, amount, method, voucher_date, notes)
       VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?)`
    )
    .run(company_id, branch_id || null, voucher_no, voucher_type, party_id, employee.name, amt, method || 'cash', voucher_date, notes || null);

  let jLines;
  const cashLine = { account_code: cashOrBank(method), branch_id };
  const partyLine = (account_code) => ({ account_code, party_type: 'employee', party_id });
  switch (voucher_type) {
    case 'advance':
      jLines = [{ ...partyLine(ACC.EMP_ADVANCES), debit: amt }, { ...cashLine, credit: amt }];
      break;
    case 'advance_settlement':
      jLines = [{ ...cashLine, debit: amt }, { ...partyLine(ACC.EMP_ADVANCES), credit: amt }];
      break;
    case 'custody_out':
      jLines = [{ ...partyLine(ACC.PETTY_CUSTODY), debit: amt }, { ...cashLine, credit: amt }];
      break;
    case 'custody_return':
      jLines = [{ ...cashLine, debit: amt }, { ...partyLine(ACC.PETTY_CUSTODY), credit: amt }];
      break;
    case 'salary':
      jLines = [{ account_code: ACC.SALARIES_EXP, debit: amt, party_type: 'employee', party_id, branch_id }, { ...cashLine, credit: amt }];
      break;
    default:
      throw new Error('نوع سند غير مدعوم');
  }

  postEntry({
    company_id,
    branch_id,
    date: voucher_date,
    ref_type: 'voucher',
    ref_id: info.lastInsertRowid,
    description: `${EMPLOYEE_VOUCHER_LABELS[voucher_type]} ${voucher_no} - ${employee.name}`,
    lines: jLines,
  });

  return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(info.lastInsertRowid);
}

function createVoucher({ company_id, branch_id, voucher_type, party_type, party_id, party_name, other_account_code, amount, method, voucher_date, notes, trip_id }) {
  return inTransaction(() => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر');

    if (party_type === 'employee' && !EMPLOYEE_VOUCHER_TYPES.includes(voucher_type)) {
      throw new Error('نوع سند غير صحيح للموظف - لازم يكون سلفة أو تسوية سلفة أو صرف/استرجاع عهدة أو صرف راتب');
    }
    if (party_type !== 'employee') {
      if (voucher_type === 'receipt' && !['customer', 'partner', 'other'].includes(party_type)) {
        throw new Error('سند القبض يكون من عميل أو شريك أو طرف آخر فقط');
      }
      if (voucher_type === 'payment' && !['supplier', 'partner', 'other'].includes(party_type)) {
        throw new Error('سند الصرف يكون لمورد أو شريك أو طرف آخر فقط');
      }
    }
    if (party_type === 'other' && !other_account_code) {
      throw new Error('لازم تحدد الحساب المحاسبي المقابل للطرف الآخر');
    }
    const PARTY_TABLE = { customer: 'customers', supplier: 'suppliers', partner: 'partners', employee: 'employees' };
    const PARTY_LABEL = { customer: 'العميل', supplier: 'المورد', partner: 'الشريك', employee: 'الموظف' };
    if (party_type !== 'other') {
      assertBelongs(PARTY_TABLE[party_type], party_id, company_id, PARTY_LABEL[party_type]);
    }

    if (party_type === 'employee') {
      return createEmployeeVoucher({ company_id, branch_id, voucher_type, party_id, amt, method, voucher_date, notes });
    }

    // تحصيل ميداني من عميل أثناء رحلة توزيع مفتوحة: الكاش بيدخل عهدة المسؤول عن الرحلة
    // (لسه في إيده) بدل ما يدخل خزنة المنشأة على طول، لحد ما يورّده فعليًا.
    let trip = null;
    if (trip_id) {
      if (voucher_type !== 'receipt' || party_type !== 'customer') {
        throw new Error('ربط السند برحلة متاح بس لسند قبض من عميل');
      }
      trip = requireOpenTrip(trip_id);
      if (trip.company_id !== company_id) throw new Error('رحلة غير موجودة أو لا تنتمي لهذه المنشأة');
      if (!trip.responsible_employee_id) throw new Error('الرحلة دي مالهاش موظف مسؤول محدد');
    }

    const prefix = voucher_type === 'receipt' ? 'RCV' : 'PAY';
    const voucher_no = nextNumber('vouchers', prefix);
    const info = db
      .prepare(
        `INSERT INTO vouchers (company_id, branch_id, voucher_no, voucher_type, party_type, party_id, party_name, other_account_code, amount, method, voucher_date, trip_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company_id,
        branch_id || null,
        voucher_no,
        voucher_type,
        party_type,
        party_type === 'other' ? null : party_id,
        party_name || null,
        party_type === 'other' ? other_account_code : null,
        amt,
        method || 'cash',
        voucher_date,
        trip_id || null,
        notes || null
      );

    let partyName = party_name || '';
    let jLines;
    const partyAccountByType = { customer: ACC.AR, supplier: ACC.AP, partner: ACC.CAPITAL };
    const partyTableByType = { customer: 'customers', supplier: 'suppliers', partner: 'partners' };

    if (voucher_type === 'receipt') {
      if (party_type === 'other') {
        jLines = [
          { account_code: cashOrBank(method), debit: amt, branch_id },
          { account_code: other_account_code, credit: amt, memo: partyName },
        ];
      } else {
        const row = db.prepare(`SELECT * FROM ${partyTableByType[party_type]} WHERE id = ?`).get(party_id);
        partyName = row ? row.name : partyName;
        const debitLine =
          trip && (method || 'cash') === 'cash'
            ? { account_code: ACC.PETTY_CUSTODY, debit: amt, party_type: 'employee', party_id: trip.responsible_employee_id }
            : { account_code: cashOrBank(method), debit: amt, branch_id };
        jLines = [
          debitLine,
          { account_code: partyAccountByType[party_type], credit: amt, party_type, party_id },
        ];
      }
    } else {
      if (party_type === 'other') {
        jLines = [
          { account_code: other_account_code, debit: amt, memo: partyName },
          { account_code: cashOrBank(method), credit: amt, branch_id },
        ];
      } else {
        const row = db.prepare(`SELECT * FROM ${partyTableByType[party_type]} WHERE id = ?`).get(party_id);
        partyName = row ? row.name : partyName;
        const debitAccount = party_type === 'partner' ? ACC.DRAWINGS : partyAccountByType[party_type];
        jLines = [
          { account_code: debitAccount, debit: amt, party_type, party_id },
          { account_code: cashOrBank(method), credit: amt, branch_id },
        ];
      }
    }

    postEntry({
      company_id,
      branch_id,
      date: voucher_date,
      ref_type: 'voucher',
      ref_id: info.lastInsertRowid,
      description: `سند ${voucher_type === 'receipt' ? 'قبض' : 'صرف'} ${voucher_no}${partyName ? ' - ' + partyName : ''}`,
      lines: jLines,
    });

    return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(info.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------
// الإقفال المالي وتوزيع الأرباح على الشركاء
// ---------------------------------------------------------------------------

function closeFiscalPeriod({ company_id, branch_id, period_from, period_to, notes }) {
  return inTransaction(() => {
    if (branch_id) assertBelongs('branches', branch_id, company_id, 'الفرع');
    // إقفال فرع معين لازم ميتعارضش مع إقفال سابق لنفس الفرع ولا إقفال سابق على مستوى الشركة كلها
    // (لأن ده يبقى يكون قفل بيانات الفرع ده ضمنيًا بالفعل)، والعكس: إقفال الشركة كلها لازم ميتعارضش
    // مع أي إقفال فرع سابق (غير كده هنعيد قفل نفس الإيرادات/المصروفات مرتين ونوزّع نفس الربح مرتين)
    const lastClosing = branch_id
      ? db
          .prepare('SELECT MAX(period_to) AS d FROM fiscal_closings WHERE company_id = ? AND (branch_id = ? OR branch_id IS NULL)')
          .get(company_id, branch_id).d
      : db.prepare('SELECT MAX(period_to) AS d FROM fiscal_closings WHERE company_id = ?').get(company_id).d;
    if (lastClosing && period_from <= lastClosing) {
      throw new Error(`فيه فترة سابقة مقفولة لحد ${lastClosing}. اختر تاريخ بداية بعد كده`);
    }
    if (period_to < period_from) throw new Error('تاريخ نهاية الفترة لازم يكون بعد تاريخ البداية');

    const branchFilter = branch_id ? 'AND jl.branch_id = ?' : '';
    function periodBalance(acc) {
      const params = branch_id ? [acc.id, period_from, period_to, branch_id] : [acc.id, period_from, period_to];
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
           FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
           WHERE jl.account_id = ? AND je.entry_date BETWEEN ? AND ? ${branchFilter}`
        )
        .get(...params);
      return acc.type === 'revenue' ? round2(row.c - row.d) : round2(row.d - row.c);
    }

    const revenueAccounts = db
      .prepare(`SELECT * FROM accounts WHERE company_id = ? AND type = 'revenue' AND is_postable = 1`)
      .all(company_id);
    const expenseAccounts = db
      .prepare(`SELECT * FROM accounts WHERE company_id = ? AND type = 'expense' AND is_postable = 1`)
      .all(company_id);

    // ملحوظة: periodBalance بيرجع الرصيد "الطبيعي" للحساب (دائن-مدين للإيرادات، مدين-دائن للمصروفات).
    // حسابات عكسية زي "مردودات المبيعات" (نوعها إيراد لكن رصيدها الطبيعي مدين) بترجع بالسالب،
    // فلازم نعكس اتجاه القيد ليها عشان نقفلها صح (نزوّدها دائن مش مدين) والعكس للمصروفات العكسية.
    const jLines = [];
    let revenueTotal = 0;
    let expenseTotal = 0;
    for (const acc of revenueAccounts) {
      const bal = periodBalance(acc);
      if (bal > 0) jLines.push({ account_code: acc.code, debit: bal });
      else if (bal < 0) jLines.push({ account_code: acc.code, credit: -bal });
      if (bal !== 0) revenueTotal = round2(revenueTotal + bal);
    }
    for (const acc of expenseAccounts) {
      const bal = periodBalance(acc);
      if (bal > 0) jLines.push({ account_code: acc.code, credit: bal });
      else if (bal < 0) jLines.push({ account_code: acc.code, debit: -bal });
      if (bal !== 0) expenseTotal = round2(expenseTotal + bal);
    }
    if (jLines.length === 0) throw new Error('لا توجد أي حركة إيرادات أو مصروفات في هذه الفترة لإقفالها');

    const netProfit = round2(revenueTotal - expenseTotal);
    // إقفال فرع معين: شركاء الفرع ده بس، ولو معندوش شركاء خاصين بيه نرجع لشركاء الشركة العامين.
    // إقفال على مستوى الشركة كلها: الشركاء العامين بس (شركاء فرع معين نصيبهم بييجي من إقفال فرعهم لوحده).
    let partners;
    if (branch_id) {
      partners = db.prepare('SELECT * FROM partners WHERE company_id = ? AND branch_id = ? AND is_active = 1').all(company_id, branch_id);
      if (partners.length === 0) {
        partners = db.prepare('SELECT * FROM partners WHERE company_id = ? AND branch_id IS NULL AND is_active = 1').all(company_id);
      }
    } else {
      partners = db.prepare('SELECT * FROM partners WHERE company_id = ? AND branch_id IS NULL AND is_active = 1').all(company_id);
    }
    const distributions = [];

    if (partners.length > 0) {
      const sumPct = round2(partners.reduce((s, p) => s + p.share_percentage, 0));
      if (Math.abs(sumPct - 100) > 0.5) {
        throw new Error(`مجموع نسب الشركاء ${sumPct}% مش ١٠٠٪. صحّح النسب في صفحة الشركاء قبل الإقفال`);
      }
      let allocated = 0;
      partners.forEach((p, idx) => {
        let amount =
          idx === partners.length - 1
            ? round2(netProfit - allocated)
            : round2(netProfit * (p.share_percentage / 100));
        allocated = round2(allocated + amount);
        distributions.push({ partner_id: p.id, share_percentage: p.share_percentage, amount });
        if (amount > 0) jLines.push({ account_code: ACC.CAPITAL, credit: amount, party_type: 'partner', party_id: p.id });
        else if (amount < 0) jLines.push({ account_code: ACC.CAPITAL, debit: -amount, party_type: 'partner', party_id: p.id });
      });
    } else if (netProfit > 0) {
      jLines.push({ account_code: ACC.RETAINED_EARNINGS, credit: netProfit });
    } else if (netProfit < 0) {
      jLines.push({ account_code: ACC.RETAINED_EARNINGS, debit: -netProfit });
    }

    const closingInfo = db
      .prepare(
        `INSERT INTO fiscal_closings (company_id, branch_id, period_from, period_to, revenue_total, expense_total, net_profit, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(company_id, branch_id || null, period_from, period_to, revenueTotal, expenseTotal, netProfit, notes || null);
    const closingId = closingInfo.lastInsertRowid;

    postEntry({
      company_id,
      branch_id: branch_id || null,
      date: period_to,
      ref_type: 'closing',
      ref_id: closingId,
      description: `إقفال الفترة من ${period_from} إلى ${period_to}${branch_id ? ' (فرع محدد)' : ''}`,
      lines: jLines,
    });

    const insertDist = db.prepare(
      'INSERT INTO fiscal_closing_distributions (closing_id, partner_id, share_percentage, amount) VALUES (?, ?, ?, ?)'
    );
    distributions.forEach((d) => insertDist.run(closingId, d.partner_id, d.share_percentage, d.amount));

    return getFiscalClosing(closingId);
  });
}

function getFiscalClosing(id) {
  const closing = db.prepare('SELECT * FROM fiscal_closings WHERE id = ?').get(id);
  if (!closing) return null;
  closing.distributions = db
    .prepare(
      `SELECT fcd.*, p.name AS partner_name FROM fiscal_closing_distributions fcd
       JOIN partners p ON p.id = fcd.partner_id WHERE fcd.closing_id = ?`
    )
    .all(id);
  return closing;
}

module.exports = {
  sanitizeCoord,
  toBool,
  createEmployee,
  updateEmployee,
  createProductCategory,
  updateProductCategory,
  listProductCategories,
  setProductUnits,
  listProductUnits,
  createCompany,
  createBranch,
  createPartner,
  createCustomAccount,
  createSupplier,
  createCustomer,
  createProduct,
  setBom,
  createPurchaseInvoice,
  getPurchaseInvoice,
  createPurchaseReturn,
  getPurchaseReturn,
  createProductionOrder,
  getProductionOrder,
  createVehicle,
  createTrip,
  addTripLoad,
  addTripExpense,
  addTripReturn,
  settleTrip,
  getTrip,
  tripRemainingQty,
  recordDriverLocation,
  tripLocationTrail,
  liveTripLocations,
  createSalesInvoice,
  getSalesInvoice,
  createSalesReturn,
  getSalesReturn,
  createDamage,
  createStockTransfer,
  createStockAdjustment,
  createExpense,
  createVoucher,
  closeFiscalPeriod,
  getFiscalClosing,
};
