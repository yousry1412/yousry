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

Pages.expensesList = async function () {
  const rows = await Api.get('/expenses');
  UI.setContent(`
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
  `);

  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    UI.openModal('مصروف جديد', expenseFormHtml());
    document.getElementById('expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await Api.post('/expenses', Object.fromEntries(fd.entries()));
        UI.closeModal();
        UI.toast('تم تسجيل المصروف', 'success');
        Pages.expensesList();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });
};

window.Pages = Pages;
