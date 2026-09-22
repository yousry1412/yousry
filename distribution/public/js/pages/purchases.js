var Pages = window.Pages || {};

Pages.purchasesList = async function () {
  const rows = await Api.get('/purchases');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>فواتير الشراء</h2>
        <a class="btn" href="#/purchases/new">+ فاتورة شراء جديدة</a>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد فواتير شراء بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>رقم الفاتورة</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th></th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.invoice_no)}</td>
                  <td>${UI.escapeHtml(r.supplier_name)}</td>
                  <td>${UI.escapeHtml(r.invoice_date)}</td>
                  <td>${UI.money(r.total)}</td>
                  <td>${UI.money(r.paid_amount)}</td>
                  <td>${r.total - r.paid_amount > 0 ? UI.badge(UI.money(r.total - r.paid_amount), 'orange') : UI.badge('مسدد', 'green')}</td>
                  <td><a class="link-btn" href="#/purchases/${r.id}">تفاصيل</a></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
};

function itemRowHtml(products) {
  return `<tr>
    <td><select class="it-product">${UI.optionsHtml(products, 'id', 'name')}</select></td>
    <td><input class="it-qty" type="number" step="0.01" value="1" /></td>
    <td><input class="it-cost" type="number" step="0.01" value="0" /></td>
    <td class="it-total">0.00</td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

function wireItemsTable(tbody, products, onChange) {
  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => {
      tr.remove();
      onChange();
    });
    tr.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', onChange));
  }
  tbody.querySelectorAll('tr').forEach(bindRow);
  return {
    addRow() {
      const tr = document.createElement('tr');
      tr.innerHTML = itemRowHtml(products).replace('<tr>', '').replace('</tr>', '');
      tbody.appendChild(tr);
      bindRow(tr);
      onChange();
    },
    bindRow,
  };
}

function readItems(tbody) {
  return [...tbody.querySelectorAll('tr')].map((tr) => ({
    product_id: Number(tr.querySelector('.it-product').value),
    qty: Number(tr.querySelector('.it-qty').value) || 0,
    unit_cost: Number(tr.querySelector('.it-cost').value) || 0,
  }));
}

Pages.purchaseNew = async function () {
  const [suppliers, products] = await Promise.all([Api.get('/suppliers'), Api.get('/products')]);
  if (suppliers.length === 0) {
    UI.setContent('<div class="card"><div class="empty-state">لازم تضيف مورد واحد على الأقل أولاً من صفحة الموردين</div></div>');
    return;
  }
  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>فاتورة شراء جديدة</h2></div>
      <form id="purchaseForm">
        <div class="form-grid">
          <div class="field"><label>المورد *</label><select name="supplier_id" required>${UI.optionsHtml(suppliers, 'id', 'name')}</select></div>
          <div class="field"><label>التاريخ *</label><input name="invoice_date" type="date" value="${UI.todayStr()}" required /></div>
        </div>
        <p class="muted" id="geofenceHint" style="font-size:12.5px; display:none">📍 هذا المورد عليه رقابة موقع - لازم تكون فعليًا عنده وتسمح للمتصفح بموقعك عشان تقدر تسجل الفاتورة.</p>

        <table class="items-table" style="margin-top:16px" id="itemsTable">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr></thead>
          <tbody>${itemRowHtml(products)}</tbody>
        </table>
        <button type="button" class="btn secondary small" id="addRowBtn" style="margin-top:8px">+ إضافة صنف</button>

        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>المدفوع الآن</label><input name="paid_amount" type="number" step="0.01" value="0" /></div>
          <div class="field"><label>مدفوع من</label><select name="paid_from"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
          <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
        </div>

        <div class="totals-box"><div class="totals-inner">
          <div class="totals-row"><span>الإجمالي قبل الضريبة</span><span id="subTotal">0.00 ج.م</span></div>
          <div class="totals-row" id="vatRow" style="display:none"><span>ضريبة القيمة المضافة (<span id="vatRateLabel"></span>%)</span><span id="vatTotal">0.00 ج.م</span></div>
          <div class="totals-row grand"><span>إجمالي الفاتورة</span><span id="grandTotal">0.00 ج.م</span></div>
        </div></div>

        <div class="modal-actions">
          <button type="submit" class="btn">حفظ الفاتورة</button>
          <a class="btn secondary" href="#/purchases">إلغاء</a>
        </div>
      </form>
    </div>
  `);

  const tbody = document.querySelector('#itemsTable tbody');
  const company = Context.getCompany();
  function recalc() {
    let subtotal = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const qty = Number(tr.querySelector('.it-qty').value) || 0;
      const cost = Number(tr.querySelector('.it-cost').value) || 0;
      const lt = qty * cost;
      tr.querySelector('.it-total').textContent = lt.toFixed(2);
      subtotal += lt;
    });
    document.getElementById('subTotal').textContent = UI.money(subtotal);
    const vatEnabled = company && company.vat_enabled;
    const vat = vatEnabled ? subtotal * (company.vat_rate / 100) : 0;
    document.getElementById('vatRow').style.display = vatEnabled ? 'flex' : 'none';
    if (vatEnabled) {
      document.getElementById('vatRateLabel').textContent = company.vat_rate;
      document.getElementById('vatTotal').textContent = UI.money(vat);
    }
    document.getElementById('grandTotal').textContent = UI.money(subtotal + vat);
  }
  const ctl = wireItemsTable(tbody, products, recalc);
  recalc();
  document.getElementById('addRowBtn').addEventListener('click', () => ctl.addRow());

  const supplierSelect = document.querySelector('select[name="supplier_id"]');
  function updateGeofenceHint() {
    const supplier = suppliers.find((s) => String(s.id) === supplierSelect.value);
    document.getElementById('geofenceHint').style.display = supplier && supplier.latitude ? 'block' : 'none';
  }
  supplierSelect.addEventListener('change', updateGeofenceHint);
  updateGeofenceHint();

  document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = readItems(tbody).filter((it) => it.qty > 0);
    if (payload.items.length === 0) {
      UI.toast('لازم تضيف صنف واحد على الأقل', 'error');
      return;
    }
    const pos = await UI.getCurrentPosition();
    if (pos) {
      payload.latitude = pos.latitude;
      payload.longitude = pos.longitude;
    }
    try {
      const inv = await Api.post('/purchases', payload);
      UI.toast('تم حفظ فاتورة الشراء', 'success');
      location.hash = `#/purchases/${inv.id}`;
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

function purchaseReturnRowHtml(it) {
  return `<tr>
    <td>${UI.escapeHtml(it.product_name)}<input type="hidden" class="pr-product" value="${it.product_id}" /></td>
    <td class="muted">${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
    <td><input class="pr-qty" type="number" step="0.01" value="0" max="${it.qty}" /></td>
  </tr>`;
}

function openPurchaseReturnModal(inv) {
  UI.openModal(
    `تسجيل مرتجع - فاتورة ${UI.escapeHtml(inv.invoice_no)}`,
    `<form id="purchaseReturnForm">
      <table class="items-table" id="prTable">
        <thead><tr><th>الصنف</th><th>الكمية المشتراة</th><th>الكمية المرتجعة</th></tr></thead>
        <tbody>${inv.items.map(purchaseReturnRowHtml).join('')}</tbody>
      </table>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>التاريخ *</label><input name="return_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field"><label>المبلغ المسترد نقدًا/بنكًا من المورد</label><input name="refund_amount" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>إلى</label><select name="refund_to"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn" type="submit">حفظ المرتجع</button>
        <button class="btn secondary" type="button" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>`,
    { wide: true }
  );
  document.getElementById('purchaseReturnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.supplier_id = inv.supplier_id;
    payload.purchase_invoice_id = inv.id;
    payload.items = [...document.querySelectorAll('#prTable tbody tr')]
      .map((tr) => ({
        product_id: Number(tr.querySelector('.pr-product').value),
        qty: Number(tr.querySelector('.pr-qty').value) || 0,
      }))
      .filter((it) => it.qty > 0);
    if (payload.items.length === 0) return UI.toast('حدد كمية مرتجعة أكبر من صفر', 'error');
    try {
      await Api.post('/purchase-returns', payload);
      UI.closeModal();
      UI.toast('تم تسجيل المرتجع', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.purchaseDetail = async function (id) {
  const inv = await Api.get(`/purchases/${id}`);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>فاتورة شراء ${UI.escapeHtml(inv.invoice_no)}</h2>
        <div>
          <a class="btn secondary small" href="#/print/purchase/${inv.id}" target="_blank">طباعة</a>
          <button class="btn secondary small" id="purchaseReturnBtn">تسجيل مرتجع</button>
          <a class="btn secondary small" href="#/purchases">رجوع</a>
        </div>
      </div>
      <p class="muted">المورد: <strong>${UI.escapeHtml(inv.supplier_name)}</strong> · التاريخ: ${UI.escapeHtml(inv.invoice_date)}</p>
      <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>
        ${inv.items
          .map(
            (it) => `<tr>
            <td>${UI.escapeHtml(it.product_name)}</td>
            <td>${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
            <td>${UI.money(it.unit_cost)}</td>
            <td>${UI.money(it.line_total)}</td>
          </tr>`
          )
          .join('')}
      </tbody></table></div>
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>الإجمالي قبل الضريبة</span><span>${UI.money(inv.subtotal ?? inv.total)}</span></div>
        ${inv.vat_amount ? `<div class="totals-row"><span>ضريبة القيمة المضافة</span><span>${UI.money(inv.vat_amount)}</span></div>` : ''}
        <div class="totals-row"><span>الإجمالي</span><span>${UI.money(inv.total)}</span></div>
        <div class="totals-row"><span>المدفوع</span><span>${UI.money(inv.paid_amount)}</span></div>
        <div class="totals-row grand"><span>المتبقي (للمورد)</span><span>${UI.money(inv.total - inv.paid_amount)}</span></div>
      </div></div>
      ${inv.notes ? `<p class="muted">ملاحظات: ${UI.escapeHtml(inv.notes)}</p>` : ''}
      ${inv.latitude ? `<p class="muted">📍 <a href="${UI.googleMapsLink(inv.latitude, inv.longitude)}" target="_blank" rel="noopener">موقع تسجيل الفاتورة</a></p>` : ''}
    </div>
  `);

  document.getElementById('purchaseReturnBtn').addEventListener('click', () => openPurchaseReturnModal(inv));
};

window.PurchaseHelpers = { itemRowHtml, wireItemsTable, readItems };
window.Pages = Pages;
