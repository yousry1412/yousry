const { db } = require('./db');

const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');
const updateStockStmt = db.prepare(
  'UPDATE products SET qty_on_hand = ?, cost_price = ? WHERE id = ?'
);
const insertMovementStmt = db.prepare(
  `INSERT INTO stock_movements (product_id, movement_date, qty, unit_cost, ref_type, ref_id, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

function getProduct(productId) {
  const p = getProductStmt.get(productId);
  if (!p) throw new Error(`منتج غير موجود: ${productId}`);
  return p;
}

/**
 * يسجل حركة مخزنية (دخول أو خروج) ويحدّث الكمية ومتوسط التكلفة المرجح للمنتج.
 * qty: موجب = وارد للمخزون (بتكلفة unitCost المُدخلة)
 *      سالب = منصرف من المخزون (بيُستخدم متوسط التكلفة الحالي تلقائيًا كـ unit_cost المُسجّل)
 * بيرجع unit_cost الفعلي المُستخدم في الحركة (مهم لحساب تكلفة البضاعة المباعة).
 */
function applyStockMovement({ product_id, date, qty, unit_cost, ref_type, ref_id, notes }) {
  const product = getProduct(product_id);
  let effectiveCost = unit_cost;

  if (qty > 0) {
    // وارد: نحسب متوسط تكلفة مرجح جديد
    const oldQty = product.qty_on_hand;
    const oldCost = product.cost_price;
    const newQty = oldQty + qty;
    const newCost = newQty > 0 ? (oldQty * oldCost + qty * unit_cost) / newQty : unit_cost;
    updateStockStmt.run(newQty, newCost, product_id);
  } else if (qty < 0) {
    // منصرف: التكلفة المستخدمة هي متوسط التكلفة الحالي وقت الصرف
    effectiveCost = product.cost_price;
    const newQty = product.qty_on_hand + qty; // qty سالبة بالفعل
    updateStockStmt.run(newQty, product.cost_price, product_id);
  }

  insertMovementStmt.run(product_id, date, qty, effectiveCost, ref_type, ref_id ?? null, notes || null);
  return effectiveCost;
}

module.exports = { getProduct, applyStockMovement };
