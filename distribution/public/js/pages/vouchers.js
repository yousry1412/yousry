var Pages = window.Pages || {};

const VOUCHER_TYPE_OPTIONS_BY_PARTY = {
  customer: [['receipt', 'سند قبض (استلام فلوس)']],
  supplier: [['payment', 'سند صرف (دفع فلوس)']],
  partner: [
    ['receipt', 'رأس مال إضافي من الشريك'],
    ['payment', 'مسحوبات شخصية للشريك'],
  ],
  employee: [
    ['advance', 'صرف سلفة لموظف'],
    ['advance_settlement', 'تسوية/استرجاع سلفة موظف'],
    ['custody_out', 'صرف عهدة لموظف'],
    ['custody_return', 'استرجاع عهدة من موظف'],
    ['salary', 'صرف راتب'],
  ],
  other: [
    ['receipt', 'سند قبض (استلام فلوس)'],
    ['payment', 'سند صرف (دفع فلوس)'],
  ],
};

function voucherFormHtml(customers, suppliers, accounts) {
  return `
    <form id="voucherForm">
      <div class="form-grid">
        <div class="field">
          <label>الطرف *</label>
          <select name="party_type" id="partyType" required>
            <option value="customer">عميل</option>
            <option value="supplier">مورد</option>
            <option value="partner">شريك</option>
            <option value="employee">موظف</option>
            <option value="other">طرف آخر</option>
          </select>
        </div>
        <div class="field">
          <label>نوع السند *</label>
          <select name="voucher_type" id="voucherType" required></select>
        </div>

        <div class="field span-2" id="partySelectWrap">
          <label>العميل *</label>
          <select name="party_id" id="partyId">${UI.optionsHtml(customers, 'id', 'name')}</select>
        </div>

        <div class="field span-2" id="otherWrap" style="display:none">
          <label>اسم الطرف / البيان</label>
          <input name="party_name" placeholder="مثال: رأس مال إضافي من المالك" />
          <label style="margin-top:8px">الحساب المحاسبي المقابل *</label>
          <select name="other_account_code">${UI.optionsHtml(accounts, 'code', 'name')}</select>
        </div>

        <div class="field"><label>المبلغ *</label><input name="amount" type="number" step="0.01" required /></div>
        <div class="field"><label>الطريقة</label><select name="method"><option value="cash">نقدية</option><option value="bank">بنك</option></select></div>
        <div class="field"><label>التاريخ *</label><input name="voucher_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2"></textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">حفظ السند</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function wireVoucherForm(customers, suppliers, partners, employees) {
  const voucherType = document.getElementById('voucherType');
  const partyType = document.getElementById('partyType');
  const partySelectWrap = document.getElementById('partySelectWrap');
  const partyIdSelect = document.getElementById('partyId');
  const otherWrap = document.getElementById('otherWrap');
  const partyLabel = partySelectWrap.querySelector('label');

  function updateFields() {
    const isOther = partyType.value === 'other';
    otherWrap.style.display = isOther ? '' : 'none';
    partySelectWrap.style.display = isOther ? 'none' : '';
    voucherType.innerHTML = VOUCHER_TYPE_OPTIONS_BY_PARTY[partyType.value]
      .map(([v, l]) => `<option value="${v}">${l}</option>`)
      .join('');
    if (!isOther) {
      const labels = { customer: 'العميل *', supplier: 'المورد *', partner: 'الشريك *', employee: 'الموظف *' };
      const lists = { customer: customers, supplier: suppliers, partner: partners, employee: employees };
      partyLabel.textContent = labels[partyType.value];
      partyIdSelect.innerHTML = UI.optionsHtml(lists[partyType.value] || [], 'id', 'name');
    }
  }

  partyType.addEventListener('change', updateFields);
  updateFields();
}

Pages.vouchersList = async function () {
  const rows = await Api.get('/vouchers');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>سندات القبض والصرف</h2>
        <button class="btn" id="addVoucherBtn">+ سند جديد</button>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد سندات مسجّلة بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الرقم</th><th>النوع</th><th>الطرف</th><th>المبلغ</th><th>الطريقة</th><th>التاريخ</th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.voucher_no)}</td>
                  <td>${r.voucher_type === 'receipt' ? UI.badge('قبض', 'green') : UI.badge('صرف', 'red')}</td>
                  <td>${UI.escapeHtml(r.party_name || (r.party_type === 'customer' ? 'عميل #' + r.party_id : r.party_type === 'supplier' ? 'مورد #' + r.party_id : r.party_type === 'partner' ? 'شريك #' + r.party_id : '-'))}</td>
                  <td>${UI.money(r.amount)}</td>
                  <td>${r.method === 'cash' ? 'نقدية' : 'بنك'}</td>
                  <td>${UI.escapeHtml(r.voucher_date)}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addVoucherBtn').addEventListener('click', async () => {
    const [customers, suppliers, partners, employees, accounts] = await Promise.all([
      Api.get('/customers'),
      Api.get('/suppliers'),
      Api.get('/partners'),
      Api.get('/employees').catch(() => []),
      Api.get('/accounts'),
    ]);
    const postable = accounts.filter((a) => a.is_postable);
    UI.openModal('سند قبض / صرف جديد', voucherFormHtml(customers, suppliers, postable), { wide: true });
    wireVoucherForm(customers, suppliers, partners, employees);

    document.getElementById('voucherForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      if (payload.party_type !== 'other') delete payload.other_account_code;
      try {
        await Api.post('/vouchers', payload);
        UI.closeModal();
        UI.toast('تم حفظ السند', 'success');
        Pages.vouchersList();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });
};

window.Pages = Pages;
