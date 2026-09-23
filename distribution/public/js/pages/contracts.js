var Pages = window.Pages || {};

function contractItemRowHtml(products, productId, price) {
  return `<tr>
    <td><select class="ci-product">${UI.optionsHtml(products, 'id', 'name', productId)}</select></td>
    <td><input class="ci-price" type="number" step="0.01" value="${price ?? 0}" /></td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

function contractFormHtml(suppliers, existing) {
  const c = existing || {};
  return `
    <form id="contractForm">
      <div class="form-grid">
        <div class="field"><label>المورد *</label><select name="supplier_id" required ${c.id ? 'disabled' : ''}>${UI.optionsHtml(suppliers, 'id', 'name', c.supplier_id)}</select></div>
        <div class="field"><label>عنوان/مرجع العقد *</label><input name="title" required value="${UI.escapeHtml(c.title || '')}" /></div>
        <div class="field"><label>تاريخ البداية *</label><input name="start_date" type="date" required value="${c.start_date || UI.todayStr()}" /></div>
        <div class="field"><label>تاريخ النهاية (اختياري - عقد مفتوح لو فاضي)</label><input name="end_date" type="date" value="${c.end_date || ''}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(c.notes || '')}</textarea></div>
      </div>

      <div class="card-header" style="margin-top:16px"><h3>الأصناف والأسعار المتفق عليها</h3></div>
      <table class="items-table" id="contractItemsTable">
        <thead><tr><th>الصنف</th><th>السعر المتفق عليه</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <button type="button" class="btn secondary small" id="addContractItemRow" style="margin-top:8px">+ إضافة صنف</button>

      <div class="modal-actions" style="margin-top:16px">
        <button type="submit" class="btn">${c.id ? 'حفظ التعديلات' : 'حفظ العقد'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openContractModal(suppliers, products, existing, onDone) {
  UI.openModal(existing ? `تعديل عقد: ${UI.escapeHtml(existing.title)}` : 'عقد توريد/شراء جديد', contractFormHtml(suppliers, existing));

  const tbody = document.querySelector('#contractItemsTable tbody');
  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
  }
  function addRow(productId, price) {
    const tr = document.createElement('tr');
    tr.innerHTML = contractItemRowHtml(products, productId, price).replace('<tr>', '').replace('</tr>', '');
    tbody.appendChild(tr);
    bindRow(tr);
  }
  if (existing && existing.items && existing.items.length > 0) {
    existing.items.forEach((it) => addRow(it.product_id, it.agreed_price));
  } else {
    addRow(products[0] ? products[0].id : null, 0);
  }
  document.getElementById('addContractItemRow').addEventListener('click', () => addRow(products[0] ? products[0].id : null, 0));

  document.getElementById('contractForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = [...tbody.querySelectorAll('tr')].map((tr) => ({
      product_id: Number(tr.querySelector('.ci-product').value),
      agreed_price: Number(tr.querySelector('.ci-price').value) || 0,
    }));
    if (payload.items.length === 0) return UI.toast('لازم تضيف صنف واحد على الأقل', 'error');
    try {
      if (existing) await Api.put(`/supplier-contracts/${existing.id}`, payload);
      else await Api.post('/supplier-contracts', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة العقد', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.contractsList = async function () {
  const [contracts, suppliers, products] = await Promise.all([
    Api.get('/supplier-contracts'),
    Api.get('/suppliers'),
    Api.get('/products'),
  ]);
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>عقود التوريد والشراء</h2>
        <button class="btn" id="addContractBtn">+ عقد جديد</button>
      </div>
      <p class="muted" style="font-size:13px">عقد سعر ثابت مع مورد معين لصنف أو أكتر - رقابة على الأسعار المتفق عليها بدل الاعتماد على الذاكرة وقت كل فاتورة شراء.</p>
      ${
        contracts.length === 0
          ? '<div class="empty-state">لا توجد عقود مسجّلة بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>رقم العقد</th><th>المورد</th><th>العنوان</th><th>البداية</th><th>النهاية</th><th>عدد الأصناف</th><th>الحالة</th><th></th>
            </tr></thead><tbody>
              ${contracts
                .map(
                  (c) => `<tr>
                  <td>${UI.escapeHtml(c.contract_no)}</td>
                  <td>${UI.escapeHtml(c.supplier_name)}</td>
                  <td>${UI.escapeHtml(c.title)}</td>
                  <td>${UI.escapeHtml(c.start_date)}</td>
                  <td>${c.end_date ? UI.escapeHtml(c.end_date) : 'مفتوح'}</td>
                  <td>${c.item_count}</td>
                  <td>${
                    !c.is_active
                      ? UI.badge('موقوف', 'gray')
                      : c.is_expired
                      ? UI.badge('منتهي', 'red')
                      : UI.badge('نشط', 'green')
                  }</td>
                  <td>
                    <button class="link-btn" data-edit="${c.id}">تعديل</button>
                    &nbsp;·&nbsp;
                    <button class="link-btn" data-toggle="${c.id}">${c.is_active ? 'إيقاف' : 'تفعيل'}</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addContractBtn').addEventListener('click', () => {
    if (suppliers.length === 0) return UI.toast('لازم تضيف مورد واحد على الأقل الأول', 'error');
    openContractModal(suppliers, products, null, () => Pages.contractsList());
  });
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const full = await Api.get(`/supplier-contracts/${btn.dataset.edit}`);
      openContractModal(suppliers, products, full, () => Pages.contractsList());
    })
  );
  document.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = contracts.find((x) => x.id === Number(btn.dataset.toggle));
      try {
        await Api.put(`/supplier-contracts/${c.id}/active`, { is_active: !c.is_active });
        UI.toast(c.is_active ? 'تم إيقاف العقد' : 'تم تفعيل العقد', 'success');
        Pages.contractsList();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    })
  );
};

window.Pages = Pages;
