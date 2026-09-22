var Pages = window.Pages || {};

const KIND_LABELS = {
  trade: 'بضاعة جاهزة (تُباع كما اشتُريت)',
  raw_material: 'مادة خام (تدخل في التصنيع)',
  manufactured: 'منتج مُصنّع',
};
const KIND_BADGE = { trade: 'gray', raw_material: 'orange', manufactured: 'green' };

function productFormHtml() {
  return `
    <form id="productForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم المنتج *</label><input name="name" required /></div>
        <div class="field"><label>الكود (SKU)</label><input name="sku" /></div>
        <div class="field"><label>الوحدة</label><input name="unit" value="وحدة" /></div>
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
      </div>
      <p class="muted" style="font-size:12.5px">لو المنتج "مُصنّع" تقدر تحدد تركيبة المكونات (BOM) بعد إضافته من صفحة تفاصيل المنتج.</p>
      <div class="modal-actions">
        <button type="submit" class="btn">إضافة المنتج</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openProductModal() {
  UI.openModal('منتج جديد', productFormHtml());
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

Pages.productsList = async function () {
  const products = await Api.get('/products');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>المنتجات والمخزون</h2>
        <button class="btn" id="addProductBtn">+ منتج جديد</button>
      </div>
      ${
        products.length === 0
          ? '<div class="empty-state">لا يوجد منتجات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>المنتج</th><th>النوع</th><th>المتاح</th><th>تكلفة الوحدة</th><th>سعر البيع</th><th>قيمة المخزون</th><th></th>
            </tr></thead><tbody>
              ${products
                .map(
                  (p) => `<tr>
                  <td><a href="#/products/${p.id}">${UI.escapeHtml(p.name)}</a></td>
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
  document.getElementById('addProductBtn').addEventListener('click', openProductModal);
};

Pages.productDetail = async function (id) {
  const p = await Api.get(`/products/${id}`);
  const allProducts = await Api.get('/products');
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
          <div class="field"><label>الوحدة</label><input name="unit" value="${UI.escapeHtml(p.unit)}" /></div>
          <div class="field"><label>سعر البيع</label><input name="sale_price" type="number" step="0.01" value="${p.sale_price}" /></div>
          <div class="field"><label>حد إعادة الطلب</label><input name="reorder_level" type="number" step="0.01" value="${p.reorder_level}" /></div>
        </div>
        <div class="modal-actions"><button class="btn" type="submit">حفظ التعديلات</button></div>
      </form>
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
    try {
      await Api.put(`/products/${id}`, payload);
      UI.toast('تم حفظ التعديلات', 'success');
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
