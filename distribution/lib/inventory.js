const { db } = require('./db');

const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');
const getStockStmt = db.prepare('SELECT * FROM product_stock WHERE product_id = ? AND branch_id = ?');
const insertStockStmt = db.prepare(
  'INSERT INTO product_stock (product_id, branch_id, qty_on_hand, cost_price) VALUES (?, ?, 0, 0)'
);
const updateStockStmt = db.prepare(
  'UPDATE product_stock SET qty_on_hand = ?, cost_price = ? WHERE product_id = ? AND branch_id = ?'
);
const insertMovementStmt = db.prepare(
  `INSERT INTO stock_movements (product_id, branch_id, movement_date, qty, unit_cost, ref_type, ref_id, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

/**
 * يرجّع المنتج، والمرجعية companyId إجبارية لأي كود بيتعامل مع منتج جايله id من العميل
 * (فاتورة، رحلة، تحويل...) عشان يمنع أي منشأة تتعامل مع منتج منشأة تانية بالغلط أو بالتلاعب.
 */
function getProduct(productId, companyId) {
  const p = getProductStmt.get(productId);
  if (!p) throw new Error(`منتج غير موجود: ${productId}`);
  if (companyId && p.company_id !== companyId) throw new Error('هذا المنتج لا ينتمي لهذه المنشأة');
  return p;
}

/** يرجّع صف مخزون المنتج في فرع معين (بيتنشأ تلقائيًا برصيد صفري لو مش موجود) */
function getStock(productId, branchId) {
  let row = getStockStmt.get(productId, branchId);
  if (!row) {
    insertStockStmt.run(productId, branchId);
    row = getStockStmt.get(productId, branchId);
  }
  return row;
}

/** المنتج + رصيده في فرع معين مجمّعين في كائن واحد للاستخدام المريح بالخدمات */
function getProductWithStock(productId, branchId, companyId) {
  const product = getProduct(productId, companyId);
  const stock = getStock(productId, branchId);
  return { ...product, qty_on_hand: stock.qty_on_hand, cost_price: stock.cost_price };
}

/**
 * يسجل حركة مخزنية (دخول أو خروج) في فرع معين ويحدّث الكمية ومتوسط التكلفة المرجح.
 * qty: موجب = وارد للمخزون (بتكلفة unit_cost المُدخلة)
 *      سالب = منصرف من المخزون (بيُستخدم متوسط التكلفة الحالي تلقائيًا)
 * بيرجع unit_cost الفعلي المُستخدم في الحركة.
 */
function applyStockMovement({ product_id, branch_id, date, qty, unit_cost, ref_type, ref_id, notes }) {
  const stock = getStock(product_id, branch_id);
  let effectiveCost = unit_cost;

  if (qty > 0) {
    const oldQty = stock.qty_on_hand;
    const oldCost = stock.cost_price;
    const newQty = oldQty + qty;
    const newCost = newQty > 0 ? (oldQty * oldCost + qty * unit_cost) / newQty : unit_cost;
    updateStockStmt.run(newQty, newCost, product_id, branch_id);
  } else if (qty < 0) {
    effectiveCost = stock.cost_price;
    const newQty = stock.qty_on_hand + qty;
    updateStockStmt.run(newQty, stock.cost_price, product_id, branch_id);
  }

  insertMovementStmt.run(product_id, branch_id, date, qty, effectiveCost, ref_type, ref_id ?? null, notes || null);
  return effectiveCost;
}

module.exports = { getProduct, getStock, getProductWithStock, applyStockMovement };
