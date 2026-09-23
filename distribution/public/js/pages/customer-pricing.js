var Pages = window.Pages || {};

function priceListItemRowHtml(products, productId, price) {
  return `<tr>
    <td><select class="pli-product">${UI.optionsHtml(products, 'id', 'name', productId)}</select></td>
    <td><input class="pli-price" type="number" step="0.01" value="${price ?? 0}" /></td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

function priceListFormHtml(customers, existing) {
  const c = existing || {};
  return `
    <form id="priceListForm">
      <div class="form-grid">
        <div class="field"><label>العميل *</label><select name="customer_id" required ${c.id ? 'disabled' : ''}>${UI.optionsHtml(customers, 'id', 'name', c.customer_id)}</select></div>
        <div class="field"><label>عنوان القائمة *</label><input name="title" required value="${UI.escapeHtml(c.title || '')}" /></div>
        <div class="field"><label>تاريخ البداية *</label><input name="start_date" type="date" required value="${c.start_date || UI.todayStr()}" /></div>
        <div class="field"><label>تاريخ النهاية (اختياري)</label><input name="end_date" type="date" value="${c.end_date || ''}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(c.notes || '')}</textarea></div>
      </div>

      <div class="card-header" style="margin-top:16px"><h3>الأصناف وأسعارها الخاصة بهذا العميل</h3></div>
      <table class="items-table" id="priceListItemsTable">
        <thead><tr><th>الصنف</th><th>السعر لهذا العميل</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <button type="button" class="btn secondary small" id="addPriceListItemRow" style="margin-top:8px">+ إضافة صنف</button>

      <div class="modal-actions" style="margin-top:16px">
        <button type="submit" class="btn">${c.id ? 'حفظ التعديلات' : 'حفظ قائمة الأسعار'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openPriceListModal(customers, products, existing, onDone) {
  UI.openModal(existing ? `تعديل قائمة أسعار: ${UI.escapeHtml(existing.title)}` : 'قائمة أسعار عميل جديدة', priceListFormHtml(customers, existing));

  const tbody = document.querySelector('#priceListItemsTable tbody');
  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
  }
  function addRow(productId, price) {
    const tr = document.createElement('tr');
    tr.innerHTML = priceListItemRowHtml(products, productId, price).replace('<tr>', '').replace('</tr>', '');
    tbody.appendChild(tr);
    bindRow(tr);
  }
  if (existing && existing.items && existing.items.length > 0) {
    existing.items.forEach((it) => addRow(it.product_id, it.price));
  } else {
    addRow(products[0] ? products[0].id : null, 0);
  }
  document.getElementById('addPriceListItemRow').addEventListener('click', () => addRow(products[0] ? products[0].id : null, 0));

  document.getElementById('priceListForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = [...tbody.querySelectorAll('tr')].map((tr) => ({
      product_id: Number(tr.querySelector('.pli-product').value),
      price: Number(tr.querySelector('.pli-price').value) || 0,
    }));
    if (payload.items.length === 0) return UI.toast('لازم تضيف صنف واحد على الأقل', 'error');
    try {
      if (existing) await Api.put(`/customer-price-lists/${existing.id}`, payload);
      else await Api.post('/customer-price-lists', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة قائمة الأسعار', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.customerPricingList = async function () {
  const [lists, customers, products] = await Promise.all([
    Api.get('/customer-price-lists'),
    Api.get('/customers'),
    Api.get('/products'),
  ]);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>قوائم أسعار العملاء</h2>
        <button class="btn" id="addPriceListBtn">+ قائمة أسعار جديدة</button>
      </div>
      <p class="muted" style="font-size:13px">سعر تفضيلي أو بالجملة متفق عليه مع عميل معين لصنف أو أكتر - رقابة على أسعار البيع الخاصة بدل الاعتماد على الذاكرة وقت كل فاتورة.</p>
      ${
        lists.length === 0
          ? '<div class="empty-state">لا توجد قوائم أسعار مسجّلة بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الرقم</th><th>العميل</th><th>العنوان</th><th>البداية</th><th>النهاية</th><th>عدد الأصناف</th><th>الحالة</th><th></th>
            </tr></thead><tbody>
              ${lists
                .map(
                  (l) => `<tr>
                  <td>${UI.escapeHtml(l.list_no)}</td>
                  <td>${UI.escapeHtml(l.customer_name)}</td>
                  <td>${UI.escapeHtml(l.title)}</td>
                  <td>${UI.escapeHtml(l.start_date)}</td>
                  <td>${l.end_date ? UI.escapeHtml(l.end_date) : 'مفتوحة'}</td>
                  <td>${l.item_count}</td>
                  <td>${
                    !l.is_active
                      ? UI.badge('موقوفة', 'gray')
                      : l.is_expired
                      ? UI.badge('منتهية', 'red')
                      : UI.badge('نشطة', 'green')
                  }</td>
                  <td>
                    <button class="link-btn" data-edit="${l.id}">تعديل</button>
                    &nbsp;·&nbsp;
                    <button class="link-btn" data-toggle="${l.id}">${l.is_active ? 'إيقاف' : 'تفعيل'}</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addPriceListBtn').addEventListener('click', () => {
    if (customers.length === 0) return UI.toast('لازم تضيف عميل واحد على الأقل الأول', 'error');
    openPriceListModal(customers, products, null, () => Pages.customerPricingList());
  });
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const full = await Api.get(`/customer-price-lists/${btn.dataset.edit}`);
      openPriceListModal(customers, products, full, () => Pages.customerPricingList());
    })
  );
  document.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const l = lists.find((x) => x.id === Number(btn.dataset.toggle));
      try {
        await Api.put(`/customer-price-lists/${l.id}/active`, { is_active: !l.is_active });
        UI.toast(l.is_active ? 'تم إيقاف القائمة' : 'تم تفعيل القائمة', 'success');
        Pages.customerPricingList();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    })
  );
};

window.Pages = Pages;
