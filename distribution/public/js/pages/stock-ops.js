var Pages = window.Pages || {};

const STOCK_OPS_TABS = [
  { key: 'transfer', label: 'تحويل بين الفروع' },
  { key: 'adjustment', label: 'جرد وتسوية' },
];

async function renderTransferTab() {
  const [branches, products, transfers] = await Promise.all([
    Api.get('/branches'),
    Api.get('/products'),
    Api.get('/stock-transfers'),
  ]);
  const otherBranches = branches.filter((b) => b.id !== Context.getBranchId());
  const container = document.getElementById('stockOpsTabContent');

  if (otherBranches.length === 0) {
    container.innerHTML = '<div class="empty-state">لازم يكون فيه فرع تاني على الأقل للمنشأة عشان تقدر تحوّل مخزون بينهم</div>';
    return;
  }

  container.innerHTML = `
    <div class="card-header"><h3>تحويل مخزون من "${UI.escapeHtml(Context.getBranch() ? Context.getBranch().name : '')}"</h3></div>
    <form id="transferForm">
      <div class="form-grid">
        <div class="field"><label>إلى الفرع *</label><select name="to_branch_id" required>${UI.optionsHtml(otherBranches, 'id', 'name')}</select></div>
        <div class="field"><label>التاريخ *</label><input name="transfer_date" type="date" value="${UI.todayStr()}" required /></div>
      </div>
      <table class="items-table" style="margin-top:16px" id="transferItemsTable">
        <thead><tr><th>الصنف</th><th>الكمية</th><th>المتاح</th><th></th></tr></thead>
        <tbody>${transferRowHtml(products)}</tbody>
      </table>
      <button type="button" class="btn secondary small" id="addTransferRow" style="margin-top:8px">+ إضافة صنف</button>
      <div class="field span-2" style="margin-top:12px"><label>ملاحظات</label><input name="notes" /></div>
      <div class="modal-actions"><button class="btn" type="submit">تنفيذ التحويل</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>آخر التحويلات</h3></div>
    ${
      transfers.length === 0
        ? '<div class="empty-state">لا توجد تحويلات بعد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الرقم</th><th>من</th><th>إلى</th><th>التاريخ</th><th>سجّله</th></tr></thead><tbody>
            ${transfers
              .map(
                (t) => `<tr><td>${UI.escapeHtml(t.transfer_no)}</td><td>${UI.escapeHtml(t.from_branch_name)}</td><td>${UI.escapeHtml(t.to_branch_name)}</td><td>${UI.escapeHtml(t.transfer_date)}</td><td class="muted">${UI.escapeHtml(t.created_by_username || '-')}</td></tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;

  const tbody = document.querySelector('#transferItemsTable tbody');
  function bindRow(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
    const sel = tr.querySelector('.t-product');
    const update = () => {
      const p = products.find((x) => x.id === Number(sel.value));
      tr.querySelector('.t-avail').textContent = p ? `${UI.num(p.qty_on_hand)} ${p.unit}` : '';
    };
    sel.addEventListener('change', update);
    update();
  }
  tbody.querySelectorAll('tr').forEach(bindRow);
  document.getElementById('addTransferRow').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = transferRowHtml(products).replace('<tr>', '').replace('</tr>', '');
    tbody.appendChild(tr);
    bindRow(tr);
  });

  document.getElementById('transferForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({ product_id: Number(tr.querySelector('.t-product').value), qty: Number(tr.querySelector('.t-qty').value) || 0 }))
      .filter((it) => it.qty > 0);
    if (payload.items.length === 0) return UI.toast('حدد كمية أكبر من صفر', 'error');
    try {
      await Api.post('/stock-transfers', payload);
      UI.toast('تم تنفيذ التحويل', 'success');
      renderTransferTab();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

function transferRowHtml(products) {
  return `<tr>
    <td><select class="t-product">${UI.optionsHtml(products, 'id', 'name')}</select></td>
    <td><input class="t-qty" type="number" step="0.01" value="0" /></td>
    <td class="t-avail muted"></td>
    <td><button type="button" class="remove-row">✕</button></td>
  </tr>`;
}

async function renderAdjustmentTab() {
  const [products, adjustments] = await Promise.all([Api.get('/products'), Api.get('/stock-adjustments')]);
  const container = document.getElementById('stockOpsTabContent');
  container.innerHTML = `
    <div class="card-header"><h3>جرد وتسوية مخزون "${UI.escapeHtml(Context.getBranch() ? Context.getBranch().name : '')}"</h3></div>
    <form id="adjustmentForm">
      <div class="form-grid">
        <div class="field span-2"><label>الصنف *</label><select name="product_id" id="adjProduct" required>${UI.optionsHtml(products, 'id', 'name')}</select></div>
        <div class="field"><label>الكمية بالنظام حاليًا</label><input id="adjCurrentQty" disabled /></div>
        <div class="field"><label>الكمية الفعلية بعد الجرد *</label><input name="qty_counted" type="number" step="0.01" required /></div>
        <div class="field"><label>التاريخ *</label><input name="adjustment_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field"><label>السبب</label><input name="reason" placeholder="مثال: فرق جرد دوري" /></div>
        <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      </div>
      <div class="modal-actions"><button class="btn" type="submit">حفظ التسوية</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>آخر التسويات</h3></div>
    ${
      adjustments.length === 0
        ? '<div class="empty-state">لا توجد تسويات بعد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الرقم</th><th>الصنف</th><th>قبل</th><th>بعد الجرد</th><th>الفرق</th><th>التاريخ</th><th>سجّله</th></tr></thead><tbody>
            ${adjustments
              .map(
                (a) => `<tr>
                <td>${UI.escapeHtml(a.adjustment_no)}</td>
                <td>${UI.escapeHtml(a.product_name)}</td>
                <td>${UI.num(a.qty_before)}</td>
                <td>${UI.num(a.qty_counted)}</td>
                <td style="color:${a.qty_diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${a.qty_diff >= 0 ? '+' : ''}${UI.num(a.qty_diff)}</td>
                <td>${UI.escapeHtml(a.adjustment_date)}</td>
                <td class="muted">${UI.escapeHtml(a.created_by_username || '-')}</td>
              </tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;

  const productSelect = document.getElementById('adjProduct');
  const currentQtyInput = document.getElementById('adjCurrentQty');
  function updateCurrentQty() {
    const p = products.find((x) => x.id === Number(productSelect.value));
    currentQtyInput.value = p ? `${UI.num(p.qty_on_hand)} ${p.unit}` : '';
  }
  productSelect.addEventListener('change', updateCurrentQty);
  updateCurrentQty();

  document.getElementById('adjustmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.post('/stock-adjustments', Object.fromEntries(fd.entries()));
      UI.toast('تم حفظ التسوية', 'success');
      renderAdjustmentTab();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

const STOCK_OPS_RENDERERS = { transfer: renderTransferTab, adjustment: renderAdjustmentTab };

Pages.stockOpsHome = async function () {
  UI.setContent(`
    <div class="card">
      <div class="tabs" id="stockOpsTabs">
        ${STOCK_OPS_TABS.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="stockOpsTabContent"><div class="empty-state">جارِ التحميل...</div></div>
    </div>
  `);

  async function showTab(key) {
    document.querySelectorAll('#stockOpsTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    try {
      await STOCK_OPS_RENDERERS[key]();
    } catch (err) {
      document.getElementById('stockOpsTabContent').innerHTML = `<p style="color:var(--danger)">${UI.escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll('#stockOpsTabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('transfer');
};

window.Pages = Pages;
