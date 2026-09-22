var Pages = window.Pages || {};

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

function saleRowHtml(products) {
  return `<tr>
    <td><select class="it-product">${UI.optionsHtml(products, 'id', 'label')}</select></td>
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
      }));
    if (products.length === 0) {
      UI.setContent('<div class="card"><div class="empty-state">لا توجد كمية متبقية بعهدة هذه الرحلة للبيع منها</div></div>');
      return;
    }
  } else {
    const all = await Api.get('/products');
    products = all
      .filter((p) => p.qty_on_hand > 0)
      .map((p) => ({ id: p.id, label: `${p.name} (متاح: ${UI.num(p.qty_on_hand)} ${p.unit})`, sale_price: p.sale_price }));
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

        <table class="items-table" style="margin-top:16px" id="itemsTable">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr></thead>
          <tbody>${saleRowHtml(products)}</tbody>
        </table>
        <button type="button" class="btn secondary small" id="addRowBtn" style="margin-top:8px">+ إضافة صنف</button>

        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>المدفوع الآن (نقدًا عند التسليم)</label><input name="paid_amount" type="number" step="0.01" value="0" /></div>
          <div class="field"><label>يضاف إلى</label><select name="paid_to"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
          <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
        </div>

        <div class="totals-box"><div class="totals-inner">
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
    const priceInput = tr.querySelector('.it-price');
    const applyDefaultPrice = () => {
      const p = products.find((x) => x.id === Number(sel.value));
      if (p) priceInput.value = p.sale_price;
      recalc();
    };
    sel.addEventListener('change', applyDefaultPrice);
    tr.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', recalc));
    applyDefaultPrice();
  }

  function recalc() {
    let total = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const qty = Number(tr.querySelector('.it-qty').value) || 0;
      const price = Number(tr.querySelector('.it-price').value) || 0;
      const lt = qty * price;
      tr.querySelector('.it-total').textContent = lt.toFixed(2);
      total += lt;
    });
    document.getElementById('grandTotal').textContent = UI.money(total);
  }

  tbody.querySelectorAll('tr').forEach(bindRow);
  recalc();

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
        qty: Number(tr.querySelector('.it-qty').value) || 0,
        unit_price: Number(tr.querySelector('.it-price').value) || 0,
      }))
      .filter((it) => it.qty > 0);
    if (payload.items.length === 0) {
      UI.toast('لازم تضيف صنف واحد على الأقل', 'error');
      return;
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

Pages.salesDetail = async function (id) {
  const inv = await Api.get(`/sales/${id}`);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>فاتورة مبيعات ${UI.escapeHtml(inv.invoice_no)}</h2>
        <div>
          <a class="btn secondary small" href="#/print/sale/${inv.id}" target="_blank">طباعة الفاتورة</a>
          <a class="btn secondary small" href="#/sales">رجوع</a>
        </div>
      </div>
      <p class="muted">العميل: <strong>${UI.escapeHtml(inv.customer_name)}</strong> · التاريخ: ${UI.escapeHtml(inv.invoice_date)} ${inv.trip_no ? '· الرحلة: ' + UI.escapeHtml(inv.trip_no) : ''}</p>
      <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>
        ${inv.items
          .map(
            (it) => `<tr>
            <td>${UI.escapeHtml(it.product_name)}</td>
            <td>${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
            <td>${UI.money(it.unit_price)}</td>
            <td>${UI.money(it.line_total)}</td>
          </tr>`
          )
          .join('')}
      </tbody></table></div>
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>الإجمالي</span><span>${UI.money(inv.total)}</span></div>
        <div class="totals-row"><span>المدفوع</span><span>${UI.money(inv.paid_amount)}</span></div>
        <div class="totals-row grand"><span>المتبقي (على العميل)</span><span>${UI.money(inv.total - inv.paid_amount)}</span></div>
      </div></div>
      ${inv.notes ? `<p class="muted">ملاحظات: ${UI.escapeHtml(inv.notes)}</p>` : ''}
    </div>
  `);
};

window.Pages = Pages;
