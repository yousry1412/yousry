var Pages = window.Pages || {};

const EXPENSE_CATEGORY_LABELS = {
  rent: 'إيجار',
  salaries: 'رواتب وأجور',
  utilities: 'مرافق (كهرباء/مياه/اتصالات)',
  maintenance: 'صيانة',
  fuel: 'وقود',
  other: 'أخرى',
};

function expenseFormHtml() {
  return `
    <form id="expenseForm">
      <div class="form-grid">
        <div class="field">
          <label>البند *</label>
          <select name="category" required>
            ${Object.entries(EXPENSE_CATEGORY_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>المبلغ *</label><input name="amount" type="number" step="0.01" required /></div>
        <div class="field"><label>التاريخ *</label><input name="expense_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field"><label>مدفوع من</label><select name="paid_from"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2"></textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">تسجيل المصروف</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

const TRIP_EXPENSE_CATEGORY_LABELS = {
  fuel: 'وقود',
  rent: 'إيجار سيارة',
  maintenance: 'صيانة',
  toll: 'رسوم طريق',
  other: 'أخرى',
};

async function renderGeneralExpensesTab(container) {
  const rows = await Api.get('/expenses');
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>المصروفات العامة</h2>
        <button class="btn" id="addExpenseBtn">+ مصروف جديد</button>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد مصروفات مسجّلة بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الرقم</th><th>البند</th><th>المبلغ</th><th>التاريخ</th><th>مدفوع من</th><th>سجّله</th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.expense_no)}</td>
                  <td>${EXPENSE_CATEGORY_LABELS[r.category] || r.category}</td>
                  <td>${UI.money(r.amount)}</td>
                  <td>${UI.escapeHtml(r.expense_date)}</td>
                  <td>${r.paid_from === 'cash' ? 'نقدية' : 'بنك'}</td>
                  <td class="muted">${UI.escapeHtml(r.created_by_username || '-')}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `;

  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    UI.openModal('مصروف جديد', expenseFormHtml());
    document.getElementById('expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await Api.post('/expenses', Object.fromEntries(fd.entries()));
        UI.closeModal();
        UI.toast('تم تسجيل المصروف', 'success');
        renderGeneralExpensesTab(container);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });
}

async function renderVehicleExpensesTab(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const overview = await Api.get('/reports/vehicle-expenses' + qs);
    return `
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>من تاريخ</label><input type="date" id="vexFrom" /></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="vexTo" value="${UI.todayStr()}" /></div>
        <div class="field" style="align-self:flex-end"><button class="btn secondary small" id="vexFilter">تصفية</button></div>
      </div>

      <div class="grid cols-2">
        <div>
          <h4>حسب السيارة</h4>
          ${
            overview.byVehicle.length === 0
              ? '<div class="empty-state">لا توجد مصاريف سيارات في هذه الفترة</div>'
              : `<div class="table-wrap"><table><thead><tr><th>السيارة</th><th>عدد الحركات</th><th>الإجمالي</th></tr></thead><tbody>
                  ${overview.byVehicle
                    .map((v) => `<tr><td>${UI.escapeHtml(v.vehicle_name)}</td><td>${v.count}</td><td>${UI.money(v.total)}</td></tr>`)
                    .join('')}
                </tbody></table></div>`
          }
        </div>
        <div>
          <h4>حسب البند</h4>
          ${
            Object.keys(overview.byCategory).length === 0
              ? '<div class="empty-state">لا توجد مصاريف</div>'
              : `<div class="table-wrap"><table><thead><tr><th>البند</th><th>الإجمالي</th></tr></thead><tbody>
                  ${Object.entries(overview.byCategory)
                    .map(([cat, amount]) => `<tr><td>${TRIP_EXPENSE_CATEGORY_LABELS[cat] || cat}</td><td>${UI.money(amount)}</td></tr>`)
                    .join('')}
                </tbody></table></div>`
          }
        </div>
      </div>

      <h4 style="margin-top:20px">كل حركات مصاريف السيارات</h4>
      ${
        overview.rows.length === 0
          ? '<div class="empty-state">لا توجد حركات</div>'
          : `<div class="table-wrap"><table><thead><tr><th>الرحلة</th><th>السيارة</th><th>البند</th><th>المبلغ</th><th>مدفوع من</th><th>ملاحظات</th></tr></thead><tbody>
              ${overview.rows
                .map(
                  (r) => `<tr>
                <td><a href="#/trips/${r.trip_id}">${UI.escapeHtml(r.trip_no)}</a></td>
                <td>${UI.escapeHtml(r.vehicle_name)}</td>
                <td>${TRIP_EXPENSE_CATEGORY_LABELS[r.category] || r.category}</td>
                <td>${UI.money(r.amount)}</td>
                <td>${r.paid_from === 'driver_custody' ? 'من عهدة المسؤول' : r.paid_from === 'cash' ? 'نقدية' : 'بنك'}</td>
                <td class="muted">${UI.escapeHtml(r.notes || '-')}</td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>
            <p class="muted" style="margin-top:8px">إجمالي مصاريف السيارات في الفترة: <strong>${UI.money(overview.total)}</strong></p>`
      }
    `;
  }
  async function bindFilter() {
    document.getElementById('vexFilter').addEventListener('click', async () => {
      const from = document.getElementById('vexFrom').value;
      const to = document.getElementById('vexTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderExpensesSummaryTab(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const summary = await Api.get('/reports/expenses-summary' + qs);
    return `
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>من تاريخ</label><input type="date" id="esFrom" /></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="esTo" value="${UI.todayStr()}" /></div>
        <div class="field" style="align-self:flex-end"><button class="btn secondary small" id="esFilter">تصفية</button></div>
      </div>
      <div class="grid cols-3">
        <div class="stat-card"><div class="label">مصروفات عامة</div><div class="value">${UI.money(summary.generalTotal)}</div></div>
        <div class="stat-card"><div class="label">مصروفات سيارات</div><div class="value">${UI.money(summary.vehicleTotal)}</div></div>
        <div class="stat-card pos"><div class="label">الإجمالي الكلي</div><div class="value">${UI.money(summary.grandTotal)}</div></div>
      </div>
      <h4 style="margin-top:20px">حسب البند (عامة)</h4>
      <div class="table-wrap"><table><thead><tr><th>البند</th><th>الإجمالي</th></tr></thead><tbody>
        ${summary.generalByCategory.map((g) => `<tr><td>${EXPENSE_CATEGORY_LABELS[g.category] || g.category}</td><td>${UI.money(g.total)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">لا توجد بيانات</td></tr>'}
      </tbody></table></div>
      <h4 style="margin-top:20px">حسب البند (سيارات)</h4>
      <div class="table-wrap"><table><thead><tr><th>البند</th><th>الإجمالي</th></tr></thead><tbody>
        ${Object.entries(summary.vehicleByCategory).map(([cat, amount]) => `<tr><td>${TRIP_EXPENSE_CATEGORY_LABELS[cat] || cat}</td><td>${UI.money(amount)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">لا توجد بيانات</td></tr>'}
      </tbody></table></div>
    `;
  }
  async function bindFilter() {
    document.getElementById('esFilter').addEventListener('click', async () => {
      const from = document.getElementById('esFrom').value;
      const to = document.getElementById('esTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

const EXPENSE_TABS = [
  { key: 'general', label: 'المصروفات العامة', render: renderGeneralExpensesTab },
  { key: 'vehicles', label: 'مصروفات السيارات', render: renderVehicleExpensesTab },
  { key: 'summary', label: 'ملخص شامل حسب البند', render: renderExpensesSummaryTab },
];

Pages.expensesList = async function () {
  const activeTab = Pages._expActiveTab || 'general';
  UI.setContent(`
    <div class="tabs">
      ${EXPENSE_TABS.map((t) => `<button class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="expTabContent"><div class="empty-state">جارِ التحميل...</div></div>
  `);
  async function showTab(key) {
    Pages._expActiveTab = key;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    const container = document.getElementById('expTabContent');
    container.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    const tab = EXPENSE_TABS.find((t) => t.key === key);
    await tab.render(container);
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  await showTab(activeTab);
};

window.Pages = Pages;
