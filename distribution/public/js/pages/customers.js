var Pages = window.Pages || {};

function customerFormHtml(c = {}) {
  return `
    <form id="customerForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم العميل *</label><input name="name" required value="${UI.escapeHtml(c.name || '')}" /></div>
        <div class="field"><label>الهاتف *</label><input name="phone" type="tel" required value="${UI.escapeHtml(c.phone || '')}" /></div>
        <div class="field"><label>حد الائتمان</label><input name="credit_limit" type="number" step="0.01" value="${c.credit_limit ?? 0}" /></div>
        <div class="field span-2"><label>العنوان</label><input name="address" value="${UI.escapeHtml(c.address || '')}" /></div>
        ${
          c.id
            ? ''
            : `<div class="field"><label>رصيد افتتاحي (مستحق عليه)</label><input name="opening_balance" type="number" step="0.01" value="0" /></div>`
        }
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(c.notes || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${c.id ? 'حفظ التعديلات' : 'إضافة العميل'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openCustomerModal(existing) {
  UI.openModal(existing ? 'تعديل بيانات عميل' : 'عميل جديد', customerFormHtml(existing || {}));
  document.getElementById('customerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/customers/${existing.id}`, payload);
      else await Api.post('/customers', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة العميل', 'success');
      Pages.customersList();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.customersList = async function () {
  const customers = await Api.get('/customers');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>العملاء</h2>
        <button class="btn" id="addCustomerBtn">+ عميل جديد</button>
      </div>
      ${
        customers.length === 0
          ? '<div class="empty-state">لا يوجد عملاء بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الاسم</th><th>الهاتف</th><th>حد الائتمان</th><th>الرصيد المستحق</th><th></th>
            </tr></thead><tbody>
              ${customers
                .map(
                  (c) => `<tr>
                  <td>${UI.escapeHtml(c.name)}</td>
                  <td>${UI.escapeHtml(c.phone || '-')}</td>
                  <td>${UI.money(c.credit_limit)}</td>
                  <td>${c.balance > 0 ? UI.badge(UI.money(c.balance), 'orange') : UI.badge('0.00 ج.م', 'gray')}</td>
                  <td>
                    <a class="link-btn" href="#/customers/${c.id}">كشف حساب</a>
                    &nbsp;·&nbsp;
                    <button class="link-btn" data-edit="${c.id}">تعديل</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerModal());
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const c = customers.find((x) => x.id === Number(btn.dataset.edit));
      openCustomerModal(c);
    })
  );
};

Pages.customerStatement = async function (id) {
  const data = await Api.get(`/customers/${id}/statement`);
  const c = data.customer;
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>كشف حساب: ${UI.escapeHtml(c.name)}</h2>
        <a class="btn secondary small" href="#/customers">رجوع للعملاء</a>
      </div>
      <p class="muted">الهاتف: ${UI.escapeHtml(c.phone || '-')} · العنوان: ${UI.escapeHtml(c.address || '-')} · حد الائتمان: ${UI.money(c.credit_limit)}</p>
      ${
        data.rows.length === 0
          ? '<div class="empty-state">لا توجد حركات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>الرصيد</th></tr></thead><tbody>
              ${data.rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.entry_date)}</td>
                  <td>${UI.escapeHtml(r.description || '')}</td>
                  <td>${r.debit ? UI.money(r.debit) : '-'}</td>
                  <td>${r.credit ? UI.money(r.credit) : '-'}</td>
                  <td><strong>${UI.money(r.balance)}</strong></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row grand"><span>الرصيد الحالي المستحق على العميل</span><span>${UI.money(data.balance)}</span></div>
      </div></div>
    </div>
  `);
};

window.Pages = Pages;
