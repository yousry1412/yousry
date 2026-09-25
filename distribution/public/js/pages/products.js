var Pages = window.Pages || {};

const KIND_LABELS = {
  trade: 'بضاعة جاهزة (تُباع كما اشتُريت)',
  raw_material: 'مادة خام (تدخل في التصنيع)',
  manufactured: 'منتج مُصنّع',
};
const KIND_BADGE = { trade: 'gray', raw_material: 'orange', manufactured: 'green' };

function categoryOptionsHtml(categories, selectedId) {
  return `<option value="">بدون تصنيف</option>` + UI.optionsHtml(categories, 'id', 'name', selectedId);
}

function productFormHtml(categories) {
  return `
    <form id="productForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم المنتج *</label><input name="name" required /></div>
        <div class="field"><label>الكود (SKU)</label><input name="sku" /></div>
        <div class="field">
          <label>التصنيف</label>
          <select name="category_id">${categoryOptionsHtml(categories)}</select>
        </div>
        <div class="field"><label>الوحدة الأساسية (الصغرى)</label><input name="unit" value="وحدة" /></div>
        <div class="field">
          <label>نوع المنتج *</label>
          <select name="kind" required>
            <option value="trade">${KIND_LABELS.trade}</option>
            <option value="raw_material">${KIND_LABELS.raw_material}</option>
            <option value="manufactured">${KIND_LABELS.manufactured}</option>
          </select>
        </div>
        <div class="field"><label>سعر البيع</label><input name="sale_price" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>تكلفة الوحدة (تقديرية)</label><input name="cost_price" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>حد إعادة الطلب</label><input name="reorder_level" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>الكمية الافتتاحية بالمخزون</label><input name="opening_qty" type="number" step="0.01" value="0" /></div>
        <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="productTrackExpiry" name="track_expiry" value="1" style="width:auto" />
          <label for="productTrackExpiry" style="margin:0">صنف بيتلف وليه تاريخ صلاحية (زي الدجاج الطازج) - تتبّع دفعاته وتنبيهات صلاحيتها</label>
        </div>
      </div>
      <p class="muted" style="font-size:12.5px">لو المنتج "مُصنّع" تقدر تحدد تركيبة المكونات (BOM)، ولو محتاج وحدات قياس
        إضافية أكبر (زي كرتونة) تقدر تضيفها، كل ده بعد إضافة المنتج من صفحة تفاصيله.</p>
      <div class="modal-actions">
        <button type="submit" class="btn">إضافة المنتج</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openProductModal(categories) {
  UI.openModal('منتج جديد', productFormHtml(categories));
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      const p = await Api.post('/products', payload);
      UI.closeModal();
      UI.toast('تم إضافة المنتج', 'success');
      location.hash = `#/products/${p.id}`;
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

function openCategoryModal(onDone) {
  UI.openModal(
    'تصنيف منتجات جديد',
    `<form id="categoryForm">
      <div class="field"><label>اسم التصنيف *</label><input name="name" required /></div>
      <div class="modal-actions">
        <button type="submit" class="btn">إضافة</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>`
  );
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.post('/product-categories', Object.fromEntries(fd.entries()));
      UI.closeModal();
      UI.toast('تم إضافة التصنيف', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.productsList = async function () {
  const [products, categories] = await Promise.all([Api.get('/products'), Api.get('/product-categories')]);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>المنتجات والمخزون</h2>
        <div>
          <button class="btn secondary" id="addCategoryBtn">+ تصنيف</button>
          <button class="btn" id="addProductBtn">+ منتج جديد</button>
        </div>
      </div>
      ${
        products.length === 0
          ? '<div class="empty-state">لا يوجد منتجات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>المنتج</th><th>التصنيف</th><th>النوع</th><th>المتاح</th><th>تكلفة الوحدة</th><th>سعر البيع</th><th>قيمة المخزون</th><th></th>
            </tr></thead><tbody>
              ${products
                .map(
                  (p) => `<tr>
                  <td><a href="#/products/${p.id}">${UI.escapeHtml(p.name)}</a></td>
                  <td class="muted">${UI.escapeHtml(p.category_name || '-')}</td>
                  <td>${UI.badge(KIND_LABELS[p.kind], KIND_BADGE[p.kind])}</td>
                  <td>${p.qty_on_hand <= p.reorder_level ? UI.badge(UI.num(p.qty_on_hand) + ' ' + p.unit, 'red') : UI.num(p.qty_on_hand) + ' ' + UI.escapeHtml(p.unit)}</td>
                  <td>${UI.money(p.cost_price)}</td>
                  <td>${UI.money(p.sale_price)}</td>
                  <td>${UI.money(p.qty_on_hand * p.cost_price)}</td>
                  <td><a class="link-btn" href="#/products/${p.id}">تفاصيل</a></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
  document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(categories));
  document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal(() => Pages.productsList()));
};

Pages.productDetail = async function (id) {
  const [p, allProducts, categories] = await Promise.all([
    Api.get(`/products/${id}`),
    Api.get('/products'),
    Api.get('/product-categories'),
  ]);
  const components = allProducts.filter((c) => c.id !== p.id);

  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>${UI.escapeHtml(p.name)} ${UI.badge(KIND_LABELS[p.kind], KIND_BADGE[p.kind])}</h2>
        <a class="btn secondary small" href="#/products">رجوع للمنتجات</a>
      </div>
      <div class="grid cols-4">
        <div class="stat-card"><div class="label">المتاح بالمخزن</div><div class="value">${UI.num(p.qty_on_hand)} ${UI.escapeHtml(p.unit)}</div></div>
        <div class="stat-card"><div class="label">متوسط تكلفة الوحدة</div><div class="value">${UI.money(p.cost_price)}</div></div>
        <div class="stat-card"><div class="label">سعر البيع</div><div class="value">${UI.money(p.sale_price)}</div></div>
        <div class="stat-card"><div class="label">قيمة المخزون</div><div class="value">${UI.money(p.qty_on_hand * p.cost_price)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>بيانات أساسية</h3></div>
      <form id="editProductForm">
        <div class="form-grid">
          <div class="field span-2"><label>اسم المنتج</label><input name="name" value="${UI.escapeHtml(p.name)}" required /></div>
          <div class="field"><label>الكود (SKU)</label><input name="sku" value="${UI.escapeHtml(p.sku || '')}" /></div>
          <div class="field"><label>التصنيف</label><select name="category_id">${categoryOptionsHtml(categories, p.category_id)}</select></div>
          <div class="field"><label>الوحدة الأساسية (الصغرى)</label><input name="unit" value="${UI.escapeHtml(p.unit)}" /></div>
          <div class="field"><label>سعر البيع</label><input name="sale_price" type="number" step="0.01" value="${p.sale_price}" /></div>
          <div class="field"><label>حد إعادة الطلب</label><input name="reorder_level" type="number" step="0.01" value="${p.reorder_level}" /></div>
          <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
            <input type="checkbox" id="editTrackExpiry" style="width:auto" ${p.track_expiry ? 'checked' : ''} />
            <label for="editTrackExpiry" style="margin:0">صنف بيتلف وليه تاريخ صلاحية - تتبّع دفعاته وتنبيهات صلاحيتها</label>
          </div>
        </div>
        <div class="modal-actions"><button class="btn" type="submit">حفظ التعديلات</button></div>
      </form>
    </div>

    ${
      p.track_expiry
        ? `<div class="card">
            <div class="card-header"><h3>دفعات الصلاحية المسجّلة</h3></div>
            ${
              (p.batches || []).length === 0
                ? '<div class="empty-state">لا توجد دفعات مسجّلة بعد - هتتسجل تلقائيًا لما تحدد تاريخ صلاحية عند شراء الصنف</div>'
                : `<div class="table-wrap"><table><thead><tr><th>رقم الدفعة</th><th>تاريخ الإنتاج</th><th>تاريخ الصلاحية</th><th>الكمية المستلمة</th><th>المتبقي</th></tr></thead><tbody>
                    ${p.batches
                      .map(
                        (b) => `<tr class="${b.qty_remaining > 0 && b.expiry_date < UI.todayStr() ? 'low-stock-row' : ''}">
                      <td>${UI.escapeHtml(b.batch_no || '-')}</td>
                      <td>${UI.escapeHtml(b.production_date || '-')}</td>
                      <td>${UI.escapeHtml(b.expiry_date)}</td>
                      <td>${UI.num(b.qty_received)}</td>
                      <td>${UI.num(b.qty_remaining)}</td>
                    </tr>`
                      )
                      .join('')}
                  </tbody></table></div>`
            }
          </div>`
        : ''
    }

    <div class="card">
      <div class="card-header"><h3>وحدات القياس الإضافية (أكبر من الوحدة الأساسية)</h3></div>
      <p class="muted" style="font-size:12.5px">مثلًا لو الوحدة الأساسية "قطعة" وبتتباع كمان بالكرتونة، أضف وحدة
        "كرتونة" ومعامل التحويل (كام قطعة في الكرتونة) - وهتلاقيها متاحة كخيار عند تسجيل فواتير الشراء والبيع.</p>
      <table class="items-table" id="unitsTable">
        <thead><tr><th>اسم الوحدة</th><th>معامل التحويل (كام "${UI.escapeHtml(p.unit)}")</th><th></th></tr></thead>
        <tbody>
          ${p.units
            .map(
              (u) => `<tr>
              <td><input class="unit-name" value="${UI.escapeHtml(u.unit_name)}" /></td>
              <td><input class="unit-factor" type="number" step="0.0001" value="${u.factor}" /></td>
              <td><button type="button" class="remove-row">✕</button></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn secondary small" id="addUnitRow">+ إضافة وحدة</button>
        <button class="btn small" id="saveUnits">حفظ الوحدات</button>
      </div>
    </div>

    ${
      p.kind === 'manufactured'
        ? `<div class="card">
            <div class="card-header"><h3>تركيبة المنتج (BOM)</h3></div>
            <table class="items-table" id="bomTable">
              <thead><tr><th>المكوّن</th><th>الكمية لكل وحدة</th><th></th></tr></thead>
              <tbody>
                ${p.bom
                  .map(
                    (b) => `<tr>
                    <td><select class="bom-component">${UI.optionsHtml(components, 'id', 'name', b.component_id)}</select></td>
                    <td><input class="bom-qty" type="number" step="0.0001" value="${b.qty_per_unit}" /></td>
                    <td><button type="button" class="remove-row">✕</button></td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
            <div style="margin-top:10px; display:flex; gap:8px;">
              <button class="btn secondary small" id="addBomRow">+ إضافة مكوّن</button>
              <button class="btn small" id="saveBom">حفظ التركيبة</button>
            </div>
          </div>`
        : ''
    }

    <div class="card">
      <div class="card-header"><h3>حركة المخزون (آخر 200 حركة)</h3></div>
      ${
        p.movements.length === 0
          ? '<div class="empty-state">لا توجد حركات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>تكلفة الوحدة</th><th>القيمة</th></tr></thead><tbody>
              ${p.movements
                .map(
                  (m) => `<tr>
                  <td>${UI.escapeHtml(m.movement_date)}</td>
                  <td>${movementLabel(m.ref_type)}</td>
                  <td style="color:${m.qty >= 0 ? 'var(--success)' : 'var(--danger)'}">${m.qty >= 0 ? '+' : ''}${UI.num(m.qty)}</td>
                  <td>${UI.money(m.unit_cost)}</td>
                  <td>${UI.money(m.qty * m.unit_cost)}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('editProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    payload.track_expiry = document.getElementById('editTrackExpiry').checked;
    try {
      await Api.put(`/products/${id}`, payload);
      UI.toast('تم حفظ التعديلات', 'success');
      Pages.productDetail(id);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });

  const unitsBody = document.querySelector('#unitsTable tbody');
  function addUnitRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="unit-name" placeholder="مثال: كرتونة" /></td>
      <td><input class="unit-factor" type="number" step="0.0001" value="1" /></td>
      <td><button type="button" class="remove-row">✕</button></td>`;
    unitsBody.appendChild(tr);
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
  }
  document.getElementById('addUnitRow').addEventListener('click', addUnitRow);
  document.querySelectorAll('#unitsTable .remove-row').forEach((btn) =>
    btn.addEventListener('click', (e) => e.target.closest('tr').remove())
  );
  document.getElementById('saveUnits').addEventListener('click', async () => {
    const items = [...unitsBody.querySelectorAll('tr')]
      .map((tr) => ({
        unit_name: tr.querySelector('.unit-name').value.trim(),
        factor: Number(tr.querySelector('.unit-factor').value),
      }))
      .filter((it) => it.unit_name);
    try {
      await Api.put(`/products/${id}/units`, { items });
      UI.toast('تم حفظ الوحدات', 'success');
      Pages.productDetail(id);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });

  if (p.kind === 'manufactured') {
    const bomBody = document.querySelector('#bomTable tbody');
    function addBomRow() {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select class="bom-component">${UI.optionsHtml(components, 'id', 'name')}</select></td>
        <td><input class="bom-qty" type="number" step="0.0001" value="1" /></td>
        <td><button type="button" class="remove-row">✕</button></td>`;
      bomBody.appendChild(tr);
      tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
    }
    document.getElementById('addBomRow').addEventListener('click', addBomRow);
    document.querySelectorAll('#bomTable .remove-row').forEach((btn) =>
      btn.addEventListener('click', (e) => e.target.closest('tr').remove())
    );
    document.getElementById('saveBom').addEventListener('click', async () => {
      const rows = [...bomBody.querySelectorAll('tr')];
      const items = rows.map((tr) => ({
        component_id: Number(tr.querySelector('.bom-component').value),
        qty_per_unit: Number(tr.querySelector('.bom-qty').value),
      }));
      try {
        await Api.put(`/products/${id}/bom`, { items });
        UI.toast('تم حفظ التركيبة', 'success');
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }
};

function movementLabel(refType) {
  const labels = {
    purchase: 'شراء',
    sale: 'بيع',
    production_in: 'إنتاج (وارد)',
    production_out: 'إنتاج (منصرف مكوّن)',
    trip_load: 'تحميل رحلة',
    trip_return: 'مرتجع رحلة',
    damage: 'توالف',
    opening: 'رصيد افتتاحي',
    adjustment: 'تسوية',
  };
  return labels[refType] || refType;
}

window.Pages = Pages;
