var Pages = window.Pages || {};

function employeeFormHtml(e = {}) {
  return `
    <form id="employeeForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم الموظف *</label><input name="name" required value="${UI.escapeHtml(e.name || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(e.phone || '')}" /></div>
        <div class="field"><label>الوظيفة</label><input name="job_title" value="${UI.escapeHtml(e.job_title || '')}" /></div>
        <div class="field"><label>الراتب الشهري</label><input name="salary" type="number" step="0.01" value="${e.salary ?? 0}" /></div>
        <div class="field"><label>تاريخ التعيين</label><input name="hire_date" type="date" value="${UI.escapeHtml(e.hire_date || '')}" /></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${e.id ? 'حفظ التعديلات' : 'إضافة الموظف'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openEmployeeModal(existing) {
  UI.openModal(existing ? 'تعديل بيانات موظف' : 'موظف جديد', employeeFormHtml(existing || {}));
  document.getElementById('employeeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/employees/${existing.id}`, payload);
      else await Api.post('/employees', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة الموظف', 'success');
      Pages.employeesList();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.employeesList = async function () {
  const employees = await Api.get('/employees');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>الموظفون - السلف والعهدات</h2>
        <button class="btn" id="addEmpBtn">+ موظف جديد</button>
      </div>
      <p class="muted" style="font-size:13px">الرصيد هنا بيمثّل إجمالي السلف والعهدات المستحقة على الموظف (لسه معاه أو لسه مديون بيها للمنشأة).</p>
      ${
        employees.length === 0
          ? '<div class="empty-state">لا يوجد موظفون بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الاسم</th><th>الوظيفة</th><th>الراتب</th><th>مستحق عليه (سلف/عهدة)</th><th></th>
            </tr></thead><tbody>
              ${employees
                .map(
                  (e) => `<tr>
                  <td>${UI.escapeHtml(e.name)}</td>
                  <td>${UI.escapeHtml(e.job_title || '-')}</td>
                  <td>${UI.money(e.salary)}</td>
                  <td>${e.balance > 0 ? UI.badge(UI.money(e.balance), 'orange') : UI.badge('0.00 ج.م', 'gray')}</td>
                  <td>
                    <a class="link-btn" href="#/employees/${e.id}">كشف حساب</a>
                    &nbsp;·&nbsp;
                    <button class="link-btn" data-edit="${e.id}">تعديل</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addEmpBtn').addEventListener('click', () => openEmployeeModal());
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const e = employees.find((x) => x.id === Number(btn.dataset.edit));
      openEmployeeModal(e);
    })
  );
};

Pages.employeeStatement = async function (id) {
  const data = await Api.get(`/employees/${id}/statement`);
  const e = data.employee;
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>كشف حساب: ${UI.escapeHtml(e.name)}</h2>
        <a class="btn secondary small" href="#/employees">رجوع للموظفين</a>
      </div>
      <p class="muted">الوظيفة: ${UI.escapeHtml(e.job_title || '-')} · الراتب: ${UI.money(e.salary)}</p>
      <div class="grid cols-4" style="margin-bottom:14px">
        <div class="stat-card"><div class="label">رصيد السلف</div><div class="value">${UI.money(data.advancesBalance)}</div></div>
        <div class="stat-card"><div class="label">رصيد العهدة النقدية</div><div class="value">${UI.money(data.custodyBalance)}</div></div>
        <div class="stat-card"><div class="label">بضاعة تحت عهدته (سيارة)</div><div class="value">${UI.money(data.vehicleGoodsBalance)}</div></div>
        <div class="stat-card ${data.balance > 0 ? 'neg' : ''}"><div class="label">الإجمالي المستحق عليه</div><div class="value">${UI.money(data.balance)}</div></div>
      </div>
      ${
        data.rows.length === 0
          ? '<div class="empty-state">لا توجد حركات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>الحساب</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>
              ${data.rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.entry_date)}</td>
                  <td>${UI.escapeHtml(r.description || '')}</td>
                  <td class="muted">${r.account_code === '1040' ? 'سلفة' : r.account_code === '1400' ? 'بضاعة سيارة' : 'عهدة نقدية'}</td>
                  <td>${r.debit ? UI.money(r.debit) : '-'}</td>
                  <td>${r.credit ? UI.money(r.credit) : '-'}</td>
                  <td><strong>${UI.money(r.balance)}</strong></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
};

window.Pages = Pages;
