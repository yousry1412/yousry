var Pages = window.Pages || {};

async function renderProductionOrdersTab(container) {
  const rows = await Api.get('/production');
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>أوامر التصنيع</h2>
        <a class="btn" href="#/production/new">+ أمر تصنيع جديد</a>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد أوامر تصنيع بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>رقم الأمر</th><th>المنتج</th><th>التاريخ</th><th>الكمية المنتجة</th><th>تكلفة إضافية</th><th>سجّله</th><th></th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.order_no)}</td>
                  <td>${UI.escapeHtml(r.product_name)}</td>
                  <td>${UI.escapeHtml(r.order_date)}</td>
                  <td>${UI.num(r.qty_produced)}</td>
                  <td>${UI.money(r.extra_cost)}</td>
                  <td class="muted">${UI.escapeHtml(r.created_by_username || '-')}</td>
                  <td><a class="link-btn" href="#/production/${r.id}">تفاصيل</a></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `;
}

function manufacturingCardHtml(item) {
  return `
    <div class="card mfg-card">
      <div class="card-header">
        <h3>🏷️ ${UI.escapeHtml(item.product_name)}</h3>
        <span class="${item.margin >= 0 ? 'muted' : ''}" style="color:${item.margin >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700">${item.margin_pct}% هامش</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>المكوّن</th><th>الكمية اللازمة لوحدة واحدة</th><th>تكلفة الوحدة</th><th>إجمالي</th></tr></thead><tbody>
        ${
          item.components.length === 0
            ? '<tr><td colspan="4" class="muted">لا توجد تركيبة محفوظة لهذا المنتج</td></tr>'
            : item.components
                .map(
                  (c) => `<tr>
                <td>${UI.escapeHtml(c.component_name)}</td>
                <td>${UI.num(c.qty_per_unit)} ${UI.escapeHtml(c.component_unit)}</td>
                <td>${UI.money(c.component_cost)}</td>
                <td>${UI.money(c.qty_per_unit * c.component_cost)}</td>
              </tr>`
                )
                .join('')
        }
      </tbody></table></div>
      ${
        item.conversions.length > 0
          ? `<p class="muted" style="margin-top:8px">وحدات التحويل: ${item.conversions.map((u) => `${UI.escapeHtml(u.unit_name)} = ${UI.num(u.factor)} ${UI.escapeHtml(item.unit)}`).join(' · ')}</p>`
          : ''
      }
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>تكلفة الوحدة (من التركيبة)</span><span>${UI.money(item.cost_per_unit)}</span></div>
        <div class="totals-row"><span>سعر البيع</span><span>${UI.money(item.sale_price)}</span></div>
        <div class="totals-row grand"><span>هامش الربح للوحدة</span><span style="color:${item.margin >= 0 ? 'var(--success)' : 'var(--danger)'}">${UI.money(item.margin)}</span></div>
      </div></div>
    </div>
  `;
}

async function renderManufacturingCardsTab(container) {
  const catalog = await Api.get('/reports/manufacturing-catalog');
  container.innerHTML =
    catalog.length === 0
      ? '<div class="empty-state">لا توجد منتجات مُصنّعة بعد - أضف منتج من نوع "مُصنّع" وحدد تركيبته من صفحة المنتجات</div>'
      : `<div class="grid cols-2">${catalog.map(manufacturingCardHtml).join('')}</div>`;
}

const PRODUCTION_TABS = [
  { key: 'orders', label: 'أوامر التصنيع', render: renderProductionOrdersTab },
  { key: 'cards', label: 'كروت الأصناف (التركيبة والتسعير)', render: renderManufacturingCardsTab },
];

Pages.productionList = async function () {
  const activeTab = Pages._productionActiveTab || 'orders';
  UI.setContent(`
    <div class="tabs">
      ${PRODUCTION_TABS.map((t) => `<button class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="productionTabContent"><div class="empty-state">جارِ التحميل...</div></div>
  `);
  async function showTab(key) {
    Pages._productionActiveTab = key;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    const container = document.getElementById('productionTabContent');
    container.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    const tab = PRODUCTION_TABS.find((t) => t.key === key);
    await tab.render(container);
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  await showTab(activeTab);
};

function compRowHtml(components, componentId, qty) {
  return `<tr>
    <td><select class="comp-id">${UI.optionsHtml(components, 'id', 'name', componentId)}</select></td>
    <td><input class="comp-qty" type="number" step="0.0001" value="${qty ?? 0}" /></td>
    <td class="comp-cost muted">-</td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

Pages.productionNew = async function () {
  const products = await Api.get('/products');
  const manufactured = products.filter((p) => p.kind === 'manufactured');
  const components = products;

  if (manufactured.length === 0) {
    UI.setContent('<div class="card"><div class="empty-state">لازم تضيف منتج من نوع "مُصنّع" أولاً من صفحة المنتجات</div></div>');
    return;
  }

  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>أمر تصنيع جديد</h2></div>
      <form id="productionForm">
        <div class="form-grid">
          <div class="field"><label>المنتج الناتج *</label><select name="product_id" id="productSelect" required>${UI.optionsHtml(manufactured, 'id', 'name')}</select></div>
          <div class="field"><label>الكمية المنتجة *</label><input name="qty_produced" id="qtyProduced" type="number" step="0.01" value="1" required /></div>
          <div class="field"><label>التاريخ *</label><input name="order_date" type="date" value="${UI.todayStr()}" required /></div>
          <div class="field"><label>تكلفة إضافية (عمالة/تشغيل)</label><input name="extra_cost" type="number" step="0.01" value="0" /></div>
          <div class="field"><label>مدفوعة من</label><select name="paid_from"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        </div>

        <div class="card-header" style="margin-top:16px"><h3>المكونات المستهلكة</h3>
          <button type="button" class="btn secondary small" id="loadBomBtn">تحميل التركيبة تلقائيًا</button>
        </div>
        <table class="items-table" id="compTable">
          <thead><tr><th>المكوّن</th><th>الكمية المستخدمة</th><th>المتاح بالمخزن</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <button type="button" class="btn secondary small" id="addCompRow" style="margin-top:8px">+ إضافة مكوّن يدويًا</button>

        <div class="modal-actions">
          <button type="submit" class="btn">حفظ أمر التصنيع</button>
          <a class="btn secondary" href="#/production">إلغاء</a>
        </div>
      </form>
    </div>
  `);

  const tbody = document.querySelector('#compTable tbody');

  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
    const sel = tr.querySelector('.comp-id');
    const updateAvail = () => {
      const c = components.find((x) => x.id === Number(sel.value));
      tr.querySelector('.comp-cost').textContent = c ? `${UI.num(c.qty_on_hand)} ${c.unit}` : '-';
    };
    sel.addEventListener('change', updateAvail);
    updateAvail();
  }

  async function loadBom() {
    const productId = Number(document.getElementById('productSelect').value);
    const qtyProduced = Number(document.getElementById('qtyProduced').value) || 0;
    const product = await Api.get(`/products/${productId}`);
    tbody.innerHTML = '';
    if (product.bom.length === 0) {
      UI.toast('لا يوجد تركيبة محفوظة لهذا المنتج، أضف المكونات يدويًا', 'error');
      return;
    }
    product.bom.forEach((b) => {
      const tr = document.createElement('tr');
      tr.innerHTML = compRowHtml(components, b.component_id, (b.qty_per_unit * qtyProduced).toFixed(4));
      tbody.appendChild(tr);
      bindRow(tr);
    });
  }

  document.getElementById('loadBomBtn').addEventListener('click', loadBom);
  document.getElementById('addCompRow').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = compRowHtml(components, null, 0);
    tbody.appendChild(tr);
    bindRow(tr);
  });

  loadBom();

  document.getElementById('productionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({
        component_id: Number(tr.querySelector('.comp-id').value),
        qty_used: Number(tr.querySelector('.comp-qty').value) || 0,
      }))
      .filter((it) => it.qty_used > 0);
    if (payload.items.length === 0) {
      UI.toast('لازم تحدد مكوّن واحد على الأقل', 'error');
      return;
    }
    try {
      const order = await Api.post('/production', payload);
      UI.toast('تم حفظ أمر التصنيع', 'success');
      location.hash = `#/production/${order.id}`;
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.productionDetail = async function (id) {
  const order = await Api.get(`/production/${id}`);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>أمر تصنيع ${UI.escapeHtml(order.order_no)}</h2>
        <a class="btn secondary small" href="#/production">رجوع</a>
      </div>
      <p class="muted">المنتج: <strong>${UI.escapeHtml(order.product_name)}</strong> · الكمية: ${UI.num(order.qty_produced)} ${UI.escapeHtml(order.product_unit)} · التاريخ: ${UI.escapeHtml(order.order_date)}</p>
      <div class="table-wrap"><table><thead><tr><th>المكوّن</th><th>الكمية المستخدمة</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead><tbody>
        ${order.items
          .map(
            (it) => `<tr>
            <td>${UI.escapeHtml(it.component_name)}</td>
            <td>${UI.num(it.qty_used)} ${UI.escapeHtml(it.component_unit)}</td>
            <td>${UI.money(it.unit_cost)}</td>
            <td>${UI.money(it.qty_used * it.unit_cost)}</td>
          </tr>`
          )
          .join('')}
      </tbody></table></div>
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>تكلفة إضافية</span><span>${UI.money(order.extra_cost)}</span></div>
      </div></div>
      ${order.notes ? `<p class="muted">ملاحظات: ${UI.escapeHtml(order.notes)}</p>` : ''}
    </div>
  `);
};

window.Pages = Pages;
