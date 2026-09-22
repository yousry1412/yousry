var Pages = window.Pages || {};

Pages.printSale = async function (id) {
  const inv = await Api.get(`/sales/${id}`);
  UI.setContent(`
    <div class="no-print" style="margin-bottom:14px">
      <button class="btn" onclick="window.print()">🖨 طباعة</button>
      <a class="btn secondary" href="#/sales/${id}">رجوع</a>
    </div>
    <div class="print-page">
      <div class="print-header">
        <div>
          <h1>فاتورة مبيعات</h1>
          <div>رقم الفاتورة: <strong>${UI.escapeHtml(inv.invoice_no)}</strong></div>
        </div>
        <div class="print-meta">
          <div>التاريخ: ${UI.escapeHtml(inv.invoice_date)}</div>
          ${inv.trip_no ? `<div>الرحلة: ${UI.escapeHtml(inv.trip_no)}</div>` : ''}
        </div>
      </div>

      <div class="print-parties">
        <div class="box">
          <strong>بيانات العميل</strong>
          <div>${UI.escapeHtml(inv.customer_name)}</div>
          ${inv.customer_phone ? `<div>هاتف: ${UI.escapeHtml(inv.customer_phone)}</div>` : ''}
          ${inv.customer_address ? `<div>${UI.escapeHtml(inv.customer_address)}</div>` : ''}
        </div>
      </div>

      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${inv.items
            .map(
              (it, i) => `<tr>
              <td>${i + 1}</td>
              <td>${UI.escapeHtml(it.product_name)}</td>
              <td>${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
              <td>${UI.money(it.unit_price)}</td>
              <td>${UI.money(it.line_total)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>

      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>الإجمالي</span><span>${UI.money(inv.total)}</span></div>
        <div class="totals-row"><span>المدفوع</span><span>${UI.money(inv.paid_amount)}</span></div>
        <div class="totals-row grand"><span>المتبقي</span><span>${UI.money(inv.total - inv.paid_amount)}</span></div>
      </div></div>

      ${inv.notes ? `<p>ملاحظات: ${UI.escapeHtml(inv.notes)}</p>` : ''}

      <div style="display:flex; justify-content:space-between; margin-top:50px;">
        <div>توقيع المندوب: ____________________</div>
        <div>توقيع العميل: ____________________</div>
      </div>
    </div>
  `);
};

Pages.printPurchase = async function (id) {
  const inv = await Api.get(`/purchases/${id}`);
  UI.setContent(`
    <div class="no-print" style="margin-bottom:14px">
      <button class="btn" onclick="window.print()">🖨 طباعة</button>
      <a class="btn secondary" href="#/purchases/${id}">رجوع</a>
    </div>
    <div class="print-page">
      <div class="print-header">
        <div>
          <h1>فاتورة شراء</h1>
          <div>رقم الفاتورة: <strong>${UI.escapeHtml(inv.invoice_no)}</strong></div>
        </div>
        <div class="print-meta">
          <div>التاريخ: ${UI.escapeHtml(inv.invoice_date)}</div>
        </div>
      </div>

      <div class="print-parties">
        <div class="box">
          <strong>بيانات المورد</strong>
          <div>${UI.escapeHtml(inv.supplier_name)}</div>
        </div>
      </div>

      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${inv.items
            .map(
              (it, i) => `<tr>
              <td>${i + 1}</td>
              <td>${UI.escapeHtml(it.product_name)}</td>
              <td>${UI.num(it.qty)} ${UI.escapeHtml(it.product_unit)}</td>
              <td>${UI.money(it.unit_cost)}</td>
              <td>${UI.money(it.line_total)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>

      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>الإجمالي</span><span>${UI.money(inv.total)}</span></div>
        <div class="totals-row"><span>المدفوع</span><span>${UI.money(inv.paid_amount)}</span></div>
        <div class="totals-row grand"><span>المتبقي</span><span>${UI.money(inv.total - inv.paid_amount)}</span></div>
      </div></div>

      ${inv.notes ? `<p>ملاحظات: ${UI.escapeHtml(inv.notes)}</p>` : ''}
    </div>
  `);
};

window.Pages = Pages;
