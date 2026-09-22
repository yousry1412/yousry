var Pages = window.Pages || {};

const STATUS_BADGE = { open: ['مفتوحة', 'orange'], settled: ['مُسوّاة', 'green'] };

Pages.tripsList = async function () {
  const trips = await Api.get('/trips');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>رحلات التوزيع</h2>
        <a class="btn" href="#/trips/new">+ رحلة جديدة</a>
      </div>
      ${
        trips.length === 0
          ? '<div class="empty-state">لا توجد رحلات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>رقم الرحلة</th><th>السيارة</th><th>التاريخ</th><th>الحالة</th><th></th>
            </tr></thead><tbody>
              ${trips
                .map((t) => {
                  const [label, color] = STATUS_BADGE[t.status];
                  return `<tr>
                    <td>${UI.escapeHtml(t.trip_no)}</td>
                    <td>${UI.escapeHtml(t.vehicle_name)}</td>
                    <td>${UI.escapeHtml(t.trip_date)}</td>
                    <td>${UI.badge(label, color)}</td>
                    <td><a class="link-btn" href="#/trips/${t.id}">فتح</a></td>
                  </tr>`;
                })
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
};

Pages.tripNew = async function () {
  const vehicles = await Api.get('/vehicles');
  if (vehicles.length === 0) {
    UI.setContent('<div class="card"><div class="empty-state">لازم تضيف سيارة واحدة على الأقل أولاً من صفحة السيارات</div></div>');
    return;
  }
  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>رحلة توزيع جديدة</h2></div>
      <form id="tripForm">
        <div class="form-grid">
          <div class="field"><label>السيارة *</label><select name="vehicle_id" required>${UI.optionsHtml(vehicles, 'id', 'name')}</select></div>
          <div class="field"><label>التاريخ *</label><input name="trip_date" type="date" value="${UI.todayStr()}" required /></div>
          <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn">إنشاء الرحلة</button>
          <a class="btn secondary" href="#/trips">إلغاء</a>
        </div>
      </form>
    </div>
  `);
  document.getElementById('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const trip = await Api.post('/trips', Object.fromEntries(fd.entries()));
      UI.toast('تم إنشاء الرحلة', 'success');
      location.hash = `#/trips/${trip.id}`;
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

function qtyRowHtml(products, qtyField, extraLabel) {
  return `<tr>
    <td><select class="row-product">${UI.optionsHtml(products, 'id', 'name')}</select></td>
    <td><input class="row-qty" type="number" step="0.01" value="0" /></td>
    <td class="row-note muted">${extraLabel || ''}</td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

function openLoadModal(tripId, products, onDone) {
  UI.openModal(
    'تحميل بضاعة على السيارة',
    `<table class="items-table" id="loadTable">
      <thead><tr><th>الصنف</th><th>الكمية</th><th>المتاح بالمخزن</th><th></th></tr></thead>
      <tbody>${qtyRowHtml(products)}</tbody>
    </table>
    <button type="button" class="btn secondary small" id="addLoadRow" style="margin-top:8px">+ إضافة صنف</button>
    <div class="modal-actions">
      <button class="btn" id="submitLoad">تحميل</button>
      <button class="btn secondary" type="button" onclick="UI.closeModal()">إلغاء</button>
    </div>`,
    { wide: true }
  );
  const tbody = document.querySelector('#loadTable tbody');
  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
    const sel = tr.querySelector('.row-product');
    const update = () => {
      const p = products.find((x) => x.id === Number(sel.value));
      tr.querySelector('.row-note').textContent = p ? `${UI.num(p.qty_on_hand)} ${p.unit}` : '';
    };
    sel.addEventListener('change', update);
    update();
  }
  tbody.querySelectorAll('tr').forEach(bindRow);
  document.getElementById('addLoadRow').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = qtyRowHtml(products).replace('<tr>', '').replace('</tr>', '');
    tbody.appendChild(tr);
    bindRow(tr);
  });
  document.getElementById('submitLoad').addEventListener('click', async () => {
    const items = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({ product_id: Number(tr.querySelector('.row-product').value), qty_loaded: Number(tr.querySelector('.row-qty').value) || 0 }))
      .filter((it) => it.qty_loaded > 0);
    if (items.length === 0) return UI.toast('حدد كمية أكبر من صفر', 'error');
    try {
      await Api.post(`/trips/${tripId}/load`, { items });
      UI.closeModal();
      UI.toast('تم تسجيل التحميل', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

function openReturnModal(tripId, loadedProducts, onDone) {
  UI.openModal(
    'تسجيل مرتجع نهاية الرحلة',
    `<table class="items-table" id="returnTable">
      <thead><tr><th>الصنف</th><th>الكمية المرتجعة</th><th>المتبقي بالعهدة</th><th></th></tr></thead>
      <tbody>${loadedProducts.map((p) => `<tr>
        <td>${UI.escapeHtml(p.product_name)}<input type="hidden" class="row-product" value="${p.product_id}" /></td>
        <td><input class="row-qty" type="number" step="0.01" value="0" /></td>
        <td class="muted">${UI.num(p.remaining)}</td>
        <td></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="modal-actions">
      <button class="btn" id="submitReturn">تسجيل المرتجع</button>
      <button class="btn secondary" type="button" onclick="UI.closeModal()">إلغاء</button>
    </div>`,
    { wide: true }
  );
  document.getElementById('submitReturn').addEventListener('click', async () => {
    const tbody = document.querySelector('#returnTable tbody');
    const items = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({ product_id: Number(tr.querySelector('.row-product').value), qty_returned: Number(tr.querySelector('.row-qty').value) || 0 }))
      .filter((it) => it.qty_returned > 0);
    if (items.length === 0) return UI.toast('حدد كمية أكبر من صفر', 'error');
    try {
      await Api.post(`/trips/${tripId}/return`, { items });
      UI.closeModal();
      UI.toast('تم تسجيل المرتجع', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

function openExpenseModal(tripId, onDone) {
  UI.openModal(
    'تسجيل مصروف على الرحلة',
    `<form id="tripExpenseForm">
      <div class="form-grid">
        <div class="field"><label>البند *</label><select name="category" required>
          <option value="fuel">وقود</option>
          <option value="rent">إيجار سيارة</option>
          <option value="maintenance">صيانة</option>
          <option value="toll">رسوم طريق</option>
          <option value="other">أخرى</option>
        </select></div>
        <div class="field"><label>المبلغ *</label><input name="amount" type="number" step="0.01" required /></div>
        <div class="field"><label>مدفوع من</label><select name="paid_from"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn" type="submit">حفظ</button>
        <button class="btn secondary" type="button" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>`
  );
  document.getElementById('tripExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.post(`/trips/${tripId}/expense`, Object.fromEntries(fd.entries()));
      UI.closeModal();
      UI.toast('تم تسجيل المصروف', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.tripDetail = async function (id) {
  const [trip, settlement, products] = await Promise.all([
    Api.get(`/trips/${id}`),
    Api.get(`/trips/${id}/settlement`),
    Api.get('/products'),
  ]);
  const [statusLabel, statusColor] = STATUS_BADGE[trip.status];
  const isOpen = trip.status === 'open';

  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>رحلة ${UI.escapeHtml(trip.trip_no)} ${UI.badge(statusLabel, statusColor)}</h2>
        <a class="btn secondary small" href="#/trips">رجوع</a>
      </div>
      <p class="muted">السيارة: <strong>${UI.escapeHtml(trip.vehicle_name)}</strong> (${trip.ownership === 'owned' ? 'ملك خاص' : 'مأجورة'}) · التاريخ: ${UI.escapeHtml(trip.trip_date)}</p>

      ${
        isOpen
          ? `<div class="no-print" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 10px;">
              <button class="btn" id="btnLoad">تحميل بضاعة</button>
              <a class="btn secondary" href="#/sales/new?trip=${id}">فاتورة بيع من الرحلة</a>
              <button class="btn secondary" id="btnExpense">تسجيل مصروف</button>
              <button class="btn secondary" id="btnReturn">تسجيل مرتجع</button>
              <button class="btn danger" id="btnSettle">تسوية وإقفال الرحلة</button>
            </div>`
          : ''
      }
    </div>

    <div class="grid cols-4">
      <div class="stat-card"><div class="label">إجمالي المبيعات</div><div class="value">${UI.money(settlement.financials.salesTotal)}</div></div>
      <div class="stat-card"><div class="label">تكلفة البضاعة المباعة</div><div class="value">${UI.money(settlement.financials.cogsTotal)}</div></div>
      <div class="stat-card"><div class="label">مصروفات الرحلة</div><div class="value">${UI.money(settlement.financials.expensesTotal)}</div></div>
      <div class="stat-card ${settlement.financials.netResult >= 0 ? 'pos' : 'neg'}"><div class="label">صافي نتيجة الرحلة</div><div class="value">${UI.money(settlement.financials.netResult)}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><h3>تسوية العهدة (تحميل مقابل بيع/مرتجع/توالف)</h3></div>
      ${
        settlement.reconciliation.length === 0
          ? '<div class="empty-state">لسه مفيش بضاعة اتحملت على الرحلة دي</div>'
          : `<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>محمّل</th><th>مباع</th><th>مرتجع</th><th>توالف</th><th>المتبقي بالعهدة</th></tr></thead><tbody>
              ${settlement.reconciliation
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.product_name)}</td>
                  <td>${UI.num(r.loaded)}</td>
                  <td>${UI.num(r.sold)}</td>
                  <td>${UI.num(r.returned)}</td>
                  <td>${UI.num(r.damaged)}</td>
                  <td>${r.remaining !== 0 ? UI.badge(UI.num(r.remaining), 'red') : UI.badge('0', 'green')}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><h3>فواتير البيع في هذه الرحلة</h3></div>
        ${
          trip.sales.length === 0
            ? '<div class="empty-state">لا توجد فواتير بعد</div>'
            : `<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>الإجمالي</th></tr></thead><tbody>
                ${trip.sales
                  .map((s) => `<tr><td><a href="#/sales/${s.id}">${UI.escapeHtml(s.invoice_no)}</a></td><td>${UI.escapeHtml(s.customer_name)}</td><td>${UI.money(s.total)}</td></tr>`)
                  .join('')}
              </tbody></table></div>`
        }
      </div>
      <div class="card">
        <div class="card-header"><h3>مصروفات الرحلة</h3></div>
        ${
          trip.expenses.length === 0
            ? '<div class="empty-state">لا توجد مصروفات بعد</div>'
            : `<div class="table-wrap"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
                ${trip.expenses.map((e) => `<tr><td>${UI.escapeHtml(e.category)}</td><td>${UI.money(e.amount)}</td></tr>`).join('')}
              </tbody></table></div>`
        }
      </div>
    </div>
  `);

  if (isOpen) {
    document.getElementById('btnLoad').addEventListener('click', () => openLoadModal(id, products, () => Pages.tripDetail(id)));
    document.getElementById('btnExpense').addEventListener('click', () => openExpenseModal(id, () => Pages.tripDetail(id)));
    document.getElementById('btnReturn').addEventListener('click', () => {
      const loadedWithRemaining = settlement.reconciliation.filter((r) => r.remaining > 0);
      if (loadedWithRemaining.length === 0) return UI.toast('لا توجد كمية متبقية بالعهدة لإرجاعها', 'error');
      openReturnModal(id, loadedWithRemaining, () => Pages.tripDetail(id));
    });
    document.getElementById('btnSettle').addEventListener('click', async () => {
      const hasDiscrepancy = settlement.reconciliation.some((r) => r.remaining !== 0);
      let writeOff = false;
      if (hasDiscrepancy) {
        writeOff = await UI.confirmAction(
          'فيه فرق بين المحمّل والمباع والمرتجع (عجز). هل تريد اعتباره توالف/هالك وإقفال الرحلة؟ (إلغاء = رجوع بدون إقفال)'
        );
        if (!writeOff) return;
      } else if (!(await UI.confirmAction('هل تريد تسوية وإقفال هذه الرحلة؟'))) {
        return;
      }
      try {
        await Api.post(`/trips/${id}/settle`, { write_off_discrepancy: writeOff });
        UI.toast('تم إقفال الرحلة', 'success');
        Pages.tripDetail(id);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }
};

window.Pages = Pages;
