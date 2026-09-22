var Pages = window.Pages || {};

function damageFormHtml(products, trips) {
  return `
    <form id="damageForm">
      <div class="form-grid">
        <div class="field span-2"><label>الصنف *</label><select name="product_id" required>${UI.optionsHtml(products, 'id', 'name')}</select></div>
        <div class="field"><label>الكمية *</label><input name="qty" type="number" step="0.01" required /></div>
        <div class="field"><label>التاريخ *</label><input name="damage_date" type="date" value="${UI.todayStr()}" required /></div>
        <div class="field span-2">
          <label>مرتبط برحلة توزيع؟ (اختياري - لو التلف حصل أثناء رحلة)</label>
          <select name="trip_id"><option value="">لا - تلف بالمخزن</option>${UI.optionsHtml(trips, 'id', 'trip_no')}</select>
        </div>
        <div class="field span-2"><label>السبب</label><input name="reason" placeholder="مثال: كسر، انتهاء صلاحية، تلف أثناء النقل" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2"></textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">تسجيل التلف</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

Pages.damagesList = async function () {
  const rows = await Api.get('/damages');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>التوالف والهالك</h2>
        <button class="btn" id="addDamageBtn">+ تسجيل تلف</button>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty-state">لا توجد توالف مسجّلة - الحمد لله</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الرقم</th><th>الصنف</th><th>الكمية</th><th>القيمة</th><th>التاريخ</th><th>السبب</th>
            </tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                  <td>${UI.escapeHtml(r.damage_no)}</td>
                  <td>${UI.escapeHtml(r.product_name)}</td>
                  <td>${UI.num(r.qty)} ${UI.escapeHtml(r.product_unit)}</td>
                  <td>${UI.money(r.qty * r.unit_cost)}</td>
                  <td>${UI.escapeHtml(r.damage_date)}</td>
                  <td>${UI.escapeHtml(r.reason || '-')}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addDamageBtn').addEventListener('click', async () => {
    const [products, trips] = await Promise.all([Api.get('/products'), Api.get('/trips')]);
    const openTrips = trips.filter((t) => t.status === 'open');
    UI.openModal('تسجيل تلف / هالك', damageFormHtml(products, openTrips));
    document.getElementById('damageForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      if (!payload.trip_id) delete payload.trip_id;
      try {
        await Api.post('/damages', payload);
        UI.closeModal();
        UI.toast('تم تسجيل التلف', 'success');
        Pages.damagesList();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });
};

window.Pages = Pages;
