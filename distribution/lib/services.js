const { db, inTransaction } = require('./db');
const { postEntry } = require('./accounting');
const { applyStockMovement, getProduct } = require('./inventory');
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

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// موردون وعملاء
// ---------------------------------------------------------------------------

function createSupplier({ name, phone, address, notes, opening_balance }) {
  return inTransaction(() => {
    const ob = round2(Number(opening_balance) || 0);
    const info = db
      .prepare(
        `INSERT INTO suppliers (name, phone, address, notes, opening_balance) VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, phone || null, address || null, notes || null, ob);
    const id = info.lastInsertRowid;
    if (ob !== 0) {
      postEntry({
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

function createCustomer({ name, phone, address, notes, credit_limit, opening_balance }) {
  return inTransaction(() => {
    const ob = round2(Number(opening_balance) || 0);
    const info = db
      .prepare(
        `INSERT INTO customers (name, phone, address, notes, credit_limit, opening_balance)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(name, phone || null, address || null, notes || null, Number(credit_limit) || 0, ob);
    const id = info.lastInsertRowid;
    if (ob !== 0) {
      postEntry({
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
// المنتجات و BOM
// ---------------------------------------------------------------------------

function createProduct({ name, sku, unit, kind, sale_price, cost_price, reorder_level, opening_qty, bom }) {
  return inTransaction(() => {
    const info = db
      .prepare(
        `INSERT INTO products (name, sku, unit, kind, sale_price, cost_price, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        sku || null,
        unit || 'وحدة',
        kind,
        Number(sale_price) || 0,
        Number(cost_price) || 0,
        Number(reorder_level) || 0
      );
    const id = info.lastInsertRowid;

    const oQty = round2(Number(opening_qty) || 0);
    if (oQty > 0) {
      const cost = Number(cost_price) || 0;
      applyStockMovement({
        product_id: id,
        date: new Date().toISOString().slice(0, 10),
        qty: oQty,
        unit_cost: cost,
        ref_type: 'opening',
        ref_id: id,
        notes: 'رصيد افتتاحي',
      });
      const amount = round2(oQty * cost);
      if (amount > 0) {
        const product = getProduct(id);
        postEntry({
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
      setBom(id, bom);
    }

    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  });
}

function setBom(productId, items) {
  return inTransaction(() => {
    db.prepare('DELETE FROM bom_items WHERE product_id = ?').run(productId);
    const insert = db.prepare(
      'INSERT INTO bom_items (product_id, component_id, qty_per_unit) VALUES (?, ?, ?)'
    );
    for (const item of items) {
      if (Number(item.component_id) === Number(productId)) {
        throw new Error('لا يمكن أن يكون المنتج مكوّنًا لنفسه');
      }
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

// ---------------------------------------------------------------------------
// المشتريات
// ---------------------------------------------------------------------------

function createPurchaseInvoice({ supplier_id, invoice_date, items, paid_amount, paid_from, notes }) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للفاتورة');

    const invoice_no = nextNumber('purchase_invoices', 'PINV');
    let total = 0;
    const lineData = items.map((it) => {
      const qty = Number(it.qty);
      const unit_cost = Number(it.unit_cost);
      if (!(qty > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
      const line_total = round2(qty * unit_cost);
      total += line_total;
      return { product_id: it.product_id, qty, unit_cost, line_total };
    });
    total = round2(total);
    const paid = Math.min(round2(Number(paid_amount) || 0), total);

    const info = db
      .prepare(
        `INSERT INTO purchase_invoices (invoice_no, supplier_id, invoice_date, paid_amount, paid_from, total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(invoice_no, supplier_id, invoice_date, paid, paid_from || 'cash', total, notes || null);
    const invoiceId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO purchase_items (invoice_id, product_id, qty, unit_cost, line_total) VALUES (?, ?, ?, ?, ?)`
    );
    const invAccTotals = {};
    for (const line of lineData) {
      insertItem.run(invoiceId, line.product_id, line.qty, line.unit_cost, line.line_total);
      applyStockMovement({
        product_id: line.product_id,
        date: invoice_date,
        qty: line.qty,
        unit_cost: line.unit_cost,
        ref_type: 'purchase',
        ref_id: invoiceId,
      });
      const product = getProduct(line.product_id);
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + line.line_total);
    }

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
    const jLines = Object.entries(invAccTotals).map(([account_code, amount]) => ({
      account_code,
      debit: amount,
    }));
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
      `SELECT pit.*, p.name AS product_name, p.unit AS product_unit
       FROM purchase_items pit JOIN products p ON p.id = pit.product_id WHERE pit.invoice_id = ?`
    )
    .all(id);
  return invoice;
}

// ---------------------------------------------------------------------------
// أوامر التصنيع
// ---------------------------------------------------------------------------

function createProductionOrder({ product_id, qty_produced, order_date, extra_cost, paid_from, notes, items }) {
  return inTransaction(() => {
    const product = getProduct(product_id);
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
    const extraCost = round2(Number(extra_cost) || 0);
    const info = db
      .prepare(
        `INSERT INTO production_orders (order_no, product_id, qty_produced, order_date, extra_cost, paid_from, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(order_no, product_id, qtyProduced, order_date, extraCost, paid_from || 'cash', notes || null);
    const orderId = info.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO production_items (order_id, component_id, qty_used, unit_cost) VALUES (?, ?, ?, ?)`
    );
    const rawAccTotals = {};
    let rawTotal = 0;
    for (const comp of components) {
      const qtyUsed = Number(comp.qty_used);
      if (!(qtyUsed > 0)) continue;
      const compProduct = getProduct(comp.component_id);
      if (compProduct.qty_on_hand < qtyUsed) {
        throw new Error(
          `المخزون غير كافٍ من "${compProduct.name}" (متاح ${compProduct.qty_on_hand}، مطلوب ${qtyUsed})`
        );
      }
      const effectiveCost = applyStockMovement({
        product_id: comp.component_id,
        date: order_date,
        qty: -qtyUsed,
        ref_type: 'production_out',
        ref_id: orderId,
      });
      insertItem.run(orderId, comp.component_id, qtyUsed, effectiveCost);
      const lineCost = round2(qtyUsed * effectiveCost);
      rawTotal = round2(rawTotal + lineCost);
      const acc = invAccFor(compProduct);
      rawAccTotals[acc] = round2((rawAccTotals[acc] || 0) + lineCost);
    }

    const totalCost = round2(rawTotal + extraCost);
    const unitCost = totalCost / qtyProduced;
    applyStockMovement({
      product_id,
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

function createVehicle({ name, ownership, driver_name, monthly_rent, notes }) {
  const info = db
    .prepare(
      `INSERT INTO vehicles (name, ownership, driver_name, monthly_rent, notes) VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, ownership, driver_name || null, Number(monthly_rent) || 0, notes || null);
  return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid);
}

function createTrip({ vehicle_id, trip_date, notes }) {
  const trip_no = nextNumber('trips', 'TRIP');
  const info = db
    .prepare(`INSERT INTO trips (trip_no, vehicle_id, trip_date, notes) VALUES (?, ?, ?, ?)`)
    .run(trip_no, vehicle_id, trip_date, notes || null);
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(info.lastInsertRowid);
}

function requireOpenTrip(trip_id) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip_id);
  if (!trip) throw new Error('رحلة غير موجودة');
  if (trip.status !== 'open') throw new Error('الرحلة مُقفلة (متسواة) بالفعل');
  return trip;
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
      const product = getProduct(it.product_id);
      if (product.qty_on_hand < qty) {
        throw new Error(`المخزون غير كافٍ من "${product.name}" (متاح ${product.qty_on_hand}، مطلوب ${qty})`);
      }
      const effectiveCost = applyStockMovement({
        product_id: it.product_id,
        date: trip.trip_date,
        qty: -qty,
        ref_type: 'trip_load',
        ref_id: trip_id,
      });
      insertLoad.run(trip_id, it.product_id, qty, effectiveCost);
      const value = round2(qty * effectiveCost);
      totalValue = round2(totalValue + value);
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + value);
    }

    if (totalValue > 0) {
      const jLines = [{ account_code: ACC.CUSTODY, debit: totalValue }];
      for (const [account_code, amount] of Object.entries(invAccTotals)) {
        jLines.push({ account_code, credit: amount });
      }
      postEntry({
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
    const info = db
      .prepare(
        `INSERT INTO trip_expenses (trip_id, category, amount, paid_from, notes) VALUES (?, ?, ?, ?, ?)`
      )
      .run(trip_id, category, amt, paid_from || 'cash', notes || null);

    postEntry({
      date: trip.trip_date,
      ref_type: 'trip_expense',
      ref_id: info.lastInsertRowid,
      description: `مصروف رحلة ${trip.trip_no} - ${category}`,
      lines: [
        { account_code: TRIP_EXPENSE_CATEGORY_TO_ACC[category] || ACC.MISC_EXP, debit: amt },
        { account_code: cashOrBank(paid_from), credit: amt },
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
        const product = getProduct(it.product_id);
        throw new Error(`كمية الإرجاع أكبر من المتبقي في العهدة لـ "${product.name}" (المتبقي ${remaining})`);
      }
      const unitCost = tripLoadUnitCost(trip_id, it.product_id);
      applyStockMovement({
        product_id: it.product_id,
        date: trip.trip_date,
        qty,
        unit_cost: unitCost,
        ref_type: 'trip_return',
        ref_id: trip_id,
      });
      insertReturn.run(trip_id, it.product_id, qty, unitCost);
      const value = round2(qty * unitCost);
      totalValue = round2(totalValue + value);
      const product = getProduct(it.product_id);
      const acc = invAccFor(product);
      invAccTotals[acc] = round2((invAccTotals[acc] || 0) + value);
    }

    if (totalValue > 0) {
      const jLines = [{ account_code: ACC.CUSTODY, credit: totalValue }];
      for (const [account_code, amount] of Object.entries(invAccTotals)) {
        jLines.push({ account_code, debit: amount });
      }
      postEntry({
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
      const product = getProduct(row.product_id);
      const remaining = tripRemainingQty(trip_id, row.product_id);
      return { product_id: row.product_id, product_name: product.name, remaining };
    });

    if (write_off_discrepancy) {
      for (const item of reconciliation) {
        if (item.remaining > 0) {
          createDamage({
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
      `SELECT t.*, v.name AS vehicle_name, v.ownership FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ?`
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
// المبيعات / التوزيع عند العميل
// ---------------------------------------------------------------------------

function createSalesInvoice({ customer_id, trip_id, invoice_date, items, paid_amount, paid_to, notes }) {
  return inTransaction(() => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لازم تضيف بنود للفاتورة');
    if (trip_id) requireOpenTrip(trip_id);

    const invoice_no = nextNumber('sales_invoices', 'SINV');
    let total = 0;
    let totalCost = 0;
    const lineData = [];

    // تمريرة أولى: تحقق فقط + حساب التكلفة والإجمالي بدون تعديل المخزون
    for (const it of items) {
      const qty = Number(it.qty);
      const unit_price = Number(it.unit_price);
      if (!(qty > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
      const product = getProduct(it.product_id);

      let unit_cost;
      if (trip_id) {
        const remaining = tripRemainingQty(trip_id, it.product_id);
        if (qty > remaining) {
          throw new Error(`الكمية أكبر من المتاح في عهدة الرحلة لـ "${product.name}" (المتاح ${remaining})`);
        }
        unit_cost = tripLoadUnitCost(trip_id, it.product_id);
      } else {
        if (product.qty_on_hand < qty) {
          throw new Error(`المخزون غير كافٍ من "${product.name}" (متاح ${product.qty_on_hand}، مطلوب ${qty})`);
        }
        unit_cost = product.cost_price;
      }

      const line_total = round2(qty * unit_price);
      total = round2(total + line_total);
      totalCost = round2(totalCost + round2(qty * unit_cost));
      lineData.push({ product_id: it.product_id, qty, unit_price, unit_cost, line_total, product });
    }

    const paid = Math.min(round2(Number(paid_amount) || 0), total);
    const info = db
      .prepare(
        `INSERT INTO sales_invoices (invoice_no, customer_id, trip_id, invoice_date, paid_amount, paid_to, total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(invoice_no, customer_id, trip_id || null, invoice_date, paid, paid_to || 'cash', total, notes || null);
    const invoiceId = info.lastInsertRowid;

    // تمريرة ثانية: الآن بعد ما بقى عندنا رقم الفاتورة، نسجل بنود الفاتورة ونحرك المخزون فعليًا
    const insertItem = db.prepare(
      `INSERT INTO sales_items (invoice_id, product_id, qty, unit_price, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const cogsAccTotals = {};
    for (const line of lineData) {
      insertItem.run(invoiceId, line.product_id, line.qty, line.unit_price, line.unit_cost, line.line_total);
      if (!trip_id) {
        applyStockMovement({
          product_id: line.product_id,
          date: invoice_date,
          qty: -line.qty,
          ref_type: 'sale',
          ref_id: invoiceId,
        });
      }
      const value = round2(line.qty * line.unit_cost);
      const acc = trip_id ? ACC.CUSTODY : invAccFor(line.product);
      cogsAccTotals[acc] = round2((cogsAccTotals[acc] || 0) + value);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    const jLines = [];
    if (paid > 0) jLines.push({ account_code: cashOrBank(paid_to), debit: paid });
    const remaining = round2(total - paid);
    if (remaining > 0) {
      jLines.push({ account_code: ACC.AR, debit: remaining, party_type: 'customer', party_id: customer_id });
    }
    jLines.push({ account_code: ACC.SALES, credit: total });
    if (totalCost > 0) {
      jLines.push({ account_code: ACC.COGS, debit: totalCost });
      for (const [account_code, amount] of Object.entries(cogsAccTotals)) {
        jLines.push({ account_code, credit: amount });
      }
    }

    postEntry({
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
              t.trip_no
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       LEFT JOIN trips t ON t.id = si.trip_id
       WHERE si.id = ?`
    )
    .get(id);
  if (!invoice) return null;
  invoice.items = db
    .prepare(
      `SELECT sit.*, p.name AS product_name, p.unit AS product_unit
       FROM sales_items sit JOIN products p ON p.id = sit.product_id WHERE sit.invoice_id = ?`
    )
    .all(id);
  return invoice;
}

// ---------------------------------------------------------------------------
// التوالف
// ---------------------------------------------------------------------------

function createDamage({ product_id, qty, damage_date, reason, trip_id, notes }) {
  return inTransaction(() => {
    const qtyNum = Number(qty);
    if (!(qtyNum > 0)) throw new Error('الكمية لازم تكون أكبر من صفر');
    const product = getProduct(product_id);

    let unit_cost;
    let creditAcc;
    if (trip_id) {
      const remaining = tripRemainingQty(trip_id, product_id);
      if (qtyNum > remaining) {
        throw new Error(`الكمية أكبر من المتاح في عهدة الرحلة لـ "${product.name}" (المتاح ${remaining})`);
      }
      unit_cost = tripLoadUnitCost(trip_id, product_id);
      creditAcc = ACC.CUSTODY;
    } else {
      if (product.qty_on_hand < qtyNum) {
        throw new Error(`المخزون غير كافٍ من "${product.name}" (متاح ${product.qty_on_hand}، مطلوب ${qtyNum})`);
      }
      unit_cost = product.cost_price;
      creditAcc = invAccFor(product);
    }

    const damage_no = nextNumber('damages', 'DMG');
    const info = db
      .prepare(
        `INSERT INTO damages (damage_no, product_id, qty, unit_cost, damage_date, reason, trip_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(damage_no, product_id, qtyNum, unit_cost, damage_date, reason || null, trip_id || null, notes || null);

    if (!trip_id) {
      applyStockMovement({
        product_id,
        date: damage_date,
        qty: -qtyNum,
        ref_type: 'damage',
        ref_id: info.lastInsertRowid,
      });
    }

    const amount = round2(qtyNum * unit_cost);
    if (amount > 0) {
      postEntry({
        date: damage_date,
        ref_type: 'damage',
        ref_id: info.lastInsertRowid,
        description: `توالف ${damage_no} - ${product.name}${reason ? ' (' + reason + ')' : ''}`,
        lines: [
          { account_code: ACC.DAMAGE_EXP, debit: amount },
          { account_code: creditAcc, credit: amount },
        ],
      });
    }

    return db.prepare('SELECT * FROM damages WHERE id = ?').get(info.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------
// المصروفات العامة
// ---------------------------------------------------------------------------

function createExpense({ category, amount, expense_date, paid_from, notes }) {
  return inTransaction(() => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر');
    const expense_no = nextNumber('expenses', 'EXP');
    const info = db
      .prepare(
        `INSERT INTO expenses (expense_no, category, amount, expense_date, paid_from, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(expense_no, category, amt, expense_date, paid_from || 'cash', notes || null);

    postEntry({
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

function createVoucher({ voucher_type, party_type, party_id, party_name, other_account_code, amount, method, voucher_date, notes }) {
  return inTransaction(() => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر');

    if (voucher_type === 'receipt' && !['customer', 'other'].includes(party_type)) {
      throw new Error('سند القبض يكون من عميل أو طرف آخر فقط');
    }
    if (voucher_type === 'payment' && !['supplier', 'other'].includes(party_type)) {
      throw new Error('سند الصرف يكون لمورد أو طرف آخر فقط');
    }
    if (party_type === 'other' && !other_account_code) {
      throw new Error('لازم تحدد الحساب المحاسبي المقابل للطرف الآخر');
    }

    const prefix = voucher_type === 'receipt' ? 'RCV' : 'PAY';
    const voucher_no = nextNumber('vouchers', prefix);
    const info = db
      .prepare(
        `INSERT INTO vouchers (voucher_no, voucher_type, party_type, party_id, party_name, other_account_code, amount, method, voucher_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        voucher_no,
        voucher_type,
        party_type,
        party_type === 'other' ? null : party_id,
        party_name || null,
        party_type === 'other' ? other_account_code : null,
        amt,
        method || 'cash',
        voucher_date,
        notes || null
      );

    let partyName = party_name || '';
    let jLines;
    if (voucher_type === 'receipt') {
      if (party_type === 'customer') {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(party_id);
        partyName = customer ? customer.name : partyName;
        jLines = [
          { account_code: cashOrBank(method), debit: amt },
          { account_code: ACC.AR, credit: amt, party_type: 'customer', party_id },
        ];
      } else {
        jLines = [
          { account_code: cashOrBank(method), debit: amt },
          { account_code: other_account_code, credit: amt, memo: partyName },
        ];
      }
    } else {
      if (party_type === 'supplier') {
        const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(party_id);
        partyName = supplier ? supplier.name : partyName;
        jLines = [
          { account_code: ACC.AP, debit: amt, party_type: 'supplier', party_id },
          { account_code: cashOrBank(method), credit: amt },
        ];
      } else {
        jLines = [
          { account_code: other_account_code, debit: amt, memo: partyName },
          { account_code: cashOrBank(method), credit: amt },
        ];
      }
    }

    postEntry({
      date: voucher_date,
      ref_type: 'voucher',
      ref_id: info.lastInsertRowid,
      description: `سند ${voucher_type === 'receipt' ? 'قبض' : 'صرف'} ${voucher_no}${partyName ? ' - ' + partyName : ''}`,
      lines: jLines,
    });

    return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(info.lastInsertRowid);
  });
}

module.exports = {
  createSupplier,
  createCustomer,
  createProduct,
  setBom,
  createPurchaseInvoice,
  getPurchaseInvoice,
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
  createSalesInvoice,
  getSalesInvoice,
  createDamage,
  createExpense,
  createVoucher,
};
