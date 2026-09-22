var Pages = window.Pages || {};

function round2ui(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

Pages.salesList = async function () {
  const rows = await Api.get('/sales');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>فواتير المبيعات</h2>
        <a class="btn" href="#/sales/new">+ فاتورة مبيعات جديدة</a>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد فواتير مبيعات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>رقم الفاتورة</th><th>العميل</th><th>الرحلة</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th></th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.invoice_no)}</td>
                  <td>${UI.escapeHtml(r.customer_name)}</td>
                  <td>${r.trip_no ? UI.escapeHtml(r.trip_no) : '-'}</td>
                  <td>${UI.escapeHtml(r.invoice_date)}</td>
                  <td>${UI.money(r.total)}</td>
                  <td>${r.total - r.paid_amount > 0 ? UI.badge(UI.money(r.total - r.paid_amount), 'orange') : UI.badge('مسدد', 'green')}</td>
                  <td><a class="link-btn" href="#/sales/${r.id}">تفاصيل</a></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
};

function saleUnitOptionsHtml(product) {
  const base = `<option value="">${UI.escapeHtml(product.unit || 'وحدة')} (الوحدة الأساسية)</option>`;
  const extra = (product.units || [])
    .map((u) => `<option value="${u.id}">${UI.escapeHtml(u.unit_name)} (= ${UI.num(u.factor)} ${UI.escapeHtml(product.unit || 'وحدة')})</option>`)
    .join('');
  return base + extra;
}

function saleRowHtml(products) {
  const first = products[0];
  return `<tr>
    <td><select class="it-product">${UI.optionsHtml(products, 'id', 'label')}</select></td>
    <td><select class="it-unit">${first ? saleUnitOptionsHtml(first) : ''}</select></td>
    <td><input class="it-qty" type="number" step="0.01" value="1" /></td>
    <td><input class="it-price" type="number" step="0.01" value="0" /></td>
    <td class="it-total">0.00</td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

Pages.salesNew = async function () {
  const query = new URLSearchParams((location.hash.split('?')[1] || ''));
  const tripId = query.get('trip');
  const customers = await Api.get('/customers');

  if (customers.length === 0) {
    UI.setContent('<div class="card"><div class="empty-state">لازم تضيف عميل واحد على الأقل أولاً من صفحة العملاء</div></div>');
    return;
  }

  let products;
  let tripInfo = null;
  if (tripId) {
    const [settlement, allProducts] = await Promise.all([Api.get(`/trips/${tripId}/settlement`), Api.get('/products')]);
    tripInfo = settlement.trip;
    const priceMap = Object.fromEntries(allProducts.map((p) => [p.id, p]));
    products = settlement.reconciliation
      .filter((r) => r.remaining > 0)
      .map((r) => ({
        id: r.product_id,
        label: `${r.product_name} (متاح بالعهدة: ${r.remaining})`,
        sale_price: priceMap[r.product_id] ? priceMap[r.product_id].sale_price : 0,
        unit: priceMap[r.product_id] ? priceMap[r.product_id].unit : 'وحدة',
        units: priceMap[r.product_id] ? priceMap[r.product_id].units : [],
      }));
    if (products.length === 0) {
      UI.setContent('<div class="card"><div class="empty-state">لا توجد كمية متبقية بعهدة هذه الرحلة للبيع منها</div></div>');
      return;
    }
  } else {
    const all = await Api.get('/products');
    products = all
      .filter((p) => p.qty_on_hand > 0)
      .map((p) => ({
        id: p.id,
        label: `${p.name} (متاح: ${UI.num(p.qty_on_hand)} ${p.unit})`,
        sale_price: p.sale_price,
        unit: p.unit,
        units: p.units,
      }));
    if (products.length === 0) {
      UI.setContent('<div class="card"><div class="empty-state">لا يوجد مخزون متاح للبيع حاليًا</div></div>');
      return;
    }
  }

  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>فاتورة مبيعات جديدة ${tripInfo ? `(من رحلة ${UI.escapeHtml(tripInfo.trip_no)})` : ''}</h2></div>
      <form id="saleForm">
        <div class="form-grid">
          <div class="field"><label>العميل *</label><select name="customer_id" required>${UI.optionsHtml(customers, 'id', 'name')}</select></div>
          <div class="field"><label>التاريخ *</label><input name="invoice_date" type="date" value="${UI.todayStr()}" required /></div>
        </div>
        <p class="muted" id="creditHint" style="font-size:12.5px; display:none"></p>

        <table class="items-table" style="margin-top:16px" id="itemsTable">
          <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr></thead>
          <tbody>${saleRowHtml(products)}</tbody>
        </table>
        <button type="button" class="btn secondary small" id="addRowBtn" style="margin-top:8px">+ إضافة صنف</button>

        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>المدفوع الآن (نقدًا عند التسليم)</label><input name="paid_amount" type="number" step="0.01" value="0" /></div>
          <div class="field"><label>يضاف إلى</label><select name="paid_to"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
          <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
        </div>

        <div class="totals-box"><div class="totals-inner">
          <div class="totals-row"><span>الإجمالي قبل الضريبة</span><span id="subTotal">0.00 ج.م</span></div>
          <div class="totals-row" id="vatRow" style="display:none"><span>ضريبة القيمة المضافة (<span id="vatRateLabel"></span>%)</span><span id="vatTotal">0.00 ج.م</span></div>
          <div class="totals-row grand"><span>إجمالي الفاتورة</span><span id="grandTotal">0.00 ج.م</span></div>
        </div></div>

        <div class="modal-actions">
          <button type="submit" class="btn">حفظ الفاتورة</button>
          <a class="btn secondary" href="${tripId ? '#/trips/' + tripId : '#/sales'}">إلغاء</a>
        </div>
      </form>
    </div>
  `);

  const tbody = document.querySelector('#itemsTable tbody');

  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => {
      tr.remove();
      recalc();
    });
    const sel = tr.querySelector('.it-product');
    const unitSel = tr.querySelector('.it-unit');
    const priceInput = tr.querySelector('.it-price');
    const applyDefaultPrice = () => {
      const p = products.find((x) => x.id === Number(sel.value));
      const factor = p && unitSel.value ? Number((p.units || []).find((u) => String(u.id) === unitSel.value)?.factor) || 1 : 1;
      if (p) priceInput.value = round2ui(p.sale_price * factor);
      recalc();
    };
    sel.addEventListener('change', () => {
      const p = products.find((x) => x.id === Number(sel.value));
      unitSel.innerHTML = p ? saleUnitOptionsHtml(p) : '';
      applyDefaultPrice();
    });
    unitSel.addEventListener('change', applyDefaultPrice);
    tr.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', recalc));
    applyDefaultPrice();
  }

  const company = Context.getCompany();
  const customerSelect = document.querySelector('select[name="customer_id"]');
  const paidInput = document.querySelector('input[name="paid_amount"]');
  const creditHint = document.getElementById('creditHint');

  function updateCreditHint(total) {
    const customer = customers.find((c) => c.id === Number(customerSelect.value));
    if (!customer || !(customer.credit_limit > 0)) {
      creditHint.style.display = 'none';
      return;
    }
    const paid = Number(paidInput.value) || 0;
    const remaining = Math.max(0, round2ui(total - paid));
    const currentBalance = customer.balance || 0;
    const after = round2ui(currentBalance + remaining);
    creditHint.style.display = 'block';
    creditHint.style.color = after > customer.credit_limit ? 'var(--danger)' : '';
    creditHint.textContent = `رصيد العميل الحالي ${UI.money(currentBalance)} + متبقي هذه الفاتورة ${UI.money(remaining)} = ${UI.money(after)} من حد ائتمانه ${UI.money(customer.credit_limit)}${after > customer.credit_limit ? ' - تجاوز الحد المسموح!' : ''}`;
  }

  function recalc() {
    let subtotal = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const qty = Number(tr.querySelector('.it-qty').value) || 0;
      const price = Number(tr.querySelector('.it-price').value) || 0;
      const lt = qty * price;
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
    const total = subtotal + vat;
    document.getElementById('grandTotal').textContent = UI.money(total);
    updateCreditHint(total);
  }

  tbody.querySelectorAll('tr').forEach(bindRow);
  recalc();
  customerSelect.addEventListener('change', recalc);
  paidInput.addEventListener('input', recalc);

  document.getElementById('addRowBtn').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = saleRowHtml(products).replace('<tr>', '').replace('</tr>', '');
    tbody.appendChild(tr);
    bindRow(tr);
  });

  document.getElementById('saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (tripId) payload.trip_id = Number(tripId);
    payload.items = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({
        product_id: Number(tr.querySelector('.it-product').value),
        unit_id: tr.querySelector('.it-unit').value || null,
        qty: Number(tr.querySelector('.it-qty').value) || 0,
        unit_price: Number(tr.querySelector('.it-price').value) || 0,
      }))
      .filter((it) => it.qty > 0);
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
      const inv = await Api.post('/sales', payload);
      UI.toast('تم حفظ فاتورة المبيعات', 'success');
      location.hash = `#/sales/${inv.id}`;
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

function salesReturnRowHtml(it) {
  return `<tr>
    <td>${UI.escapeHtml(it.product_name)}<input type="hidden" class="sr-product" value="${it.product_id}" /></td>
    <td class="muted">${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
    <td><input class="sr-qty" type="number" step="0.01" value="0" max="${it.qty}" /></td>
    <td><input class="sr-price" type="number" step="0.01" value="${it.unit_price}" /></td>
  </tr>`;
}

function openSalesReturnModal(inv) {
  UI.openModal(
    `تسجيل مرتجع - فاتورة ${UI.escapeHtml(inv.invoice_no)}`,
    `<form id="salesReturnForm">
      <table class="items-table" id="srTable">
        <thead><tr><th>الصنف</th><th>الكمية المباعة</th><th>الكمية المرتجعة</th><th>سعر الوحدة</th></tr></thead>
        <tbody>${inv.items.map(salesReturnRowHtml).join('')}</tbody>
      </table>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>التاريخ *</label><input name="return_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field"><label>المبلغ المسترجع نقدًا/بنكًا للعميل</label><input name="refund_amount" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>من</label><select name="refund_from"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn" type="submit">حفظ المرتجع</button>
        <button class="btn secondary" type="button" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>`,
    { wide: true }
  );
  document.getElementById('salesReturnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.customer_id = inv.customer_id;
    payload.sales_invoice_id = inv.id;
    payload.items = [...document.querySelectorAll('#srTable tbody tr')]
      .map((tr) => ({
        product_id: Number(tr.querySelector('.sr-product').value),
        qty: Number(tr.querySelector('.sr-qty').value) || 0,
        unit_price: Number(tr.querySelector('.sr-price').value) || 0,
      }))
      .filter((it) => it.qty > 0);
    if (payload.items.length === 0) return UI.toast('حدد كمية مرتجعة أكبر من صفر', 'error');
    try {
      await Api.post('/sales-returns', payload);
      UI.closeModal();
      UI.toast('تم تسجيل المرتجع', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.salesDetail = async function (id) {
  const inv = await Api.get(`/sales/${id}`);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>فاتورة مبيعات ${UI.escapeHtml(inv.invoice_no)}</h2>
        <div>
          <a class="btn secondary small" href="#/print/sale/${inv.id}" target="_blank">طباعة الفاتورة</a>
          <button class="btn secondary small" id="sendWhatsappBtn">إعادة إرسال واتساب</button>
          <button class="btn secondary small" id="salesReturnBtn">تسجيل مرتجع</button>
          <a class="btn secondary small" href="#/sales">رجوع</a>
        </div>
      </div>
      <p class="muted">العميل: <strong>${UI.escapeHtml(inv.customer_name)}</strong> · التاريخ: ${UI.escapeHtml(inv.invoice_date)} ${inv.trip_no ? '· الرحلة: ' + UI.escapeHtml(inv.trip_no) : ''}</p>
      <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>
        ${inv.items
          .map(
            (it) => `<tr>
            <td>${UI.escapeHtml(it.product_name)}</td>
            <td>${it.unit_qty ? `${UI.num(it.unit_qty)} ${UI.escapeHtml(it.entered_unit_name)} = ` : ''}${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
            <td>${UI.money(it.unit_qty ? it.line_total / it.unit_qty : it.unit_price)}</td>
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
        <div class="totals-row grand"><span>المتبقي (على العميل)</span><span>${UI.money(inv.total - inv.paid_amount)}</span></div>
      </div></div>
      ${inv.notes ? `<p class="muted">ملاحظات: ${UI.escapeHtml(inv.notes)}</p>` : ''}
    </div>

    ${
      inv.latitude && inv.longitude
        ? `<div class="card">
            <div class="card-header"><h3>📍 موقع تسجيل الفاتورة</h3></div>
            <div id="invoiceMap"></div>
          </div>`
        : ''
    }
  `);

  if (inv.latitude && inv.longitude) {
    UI.renderMap(document.getElementById('invoiceMap'), [
      { lat: inv.latitude, lng: inv.longitude, title: inv.invoice_no, info: inv.customer_name },
    ]);
  }

  document.getElementById('salesReturnBtn').addEventListener('click', () => openSalesReturnModal(inv));
  document.getElementById('sendWhatsappBtn').addEventListener('click', async () => {
    try {
      await Api.post(`/sales/${id}/send-whatsapp`, {});
      UI.toast('تم إرسال الفاتورة على واتساب', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

window.Pages = Pages;
