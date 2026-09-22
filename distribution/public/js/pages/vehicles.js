var Pages = window.Pages || {};

function vehicleFormHtml(v = {}) {
  return `
    <form id="vehicleForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم السيارة / رقم اللوحة *</label><input name="name" required value="${UI.escapeHtml(v.name || '')}" /></div>
        <div class="field">
          <label>الملكية *</label>
          <select name="ownership" required>
            <option value="owned" ${v.ownership === 'owned' ? 'selected' : ''}>ملك خاص</option>
            <option value="rented" ${v.ownership === 'rented' ? 'selected' : ''}>مأجورة</option>
          </select>
        </div>
        <div class="field"><label>اسم السائق</label><input name="driver_name" value="${UI.escapeHtml(v.driver_name || '')}" /></div>
        <div class="field span-2"><label>الإيجار الشهري (لو مأجورة)</label><input name="monthly_rent" type="number" step="0.01" value="${v.monthly_rent ?? 0}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(v.notes || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${v.id ? 'حفظ التعديلات' : 'إضافة السيارة'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openVehicleModal(existing) {
  UI.openModal(existing ? 'تعديل بيانات سيارة' : 'سيارة جديدة', vehicleFormHtml(existing || {}));
  document.getElementById('vehicleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/vehicles/${existing.id}`, payload);
      else await Api.post('/vehicles', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة السيارة', 'success');
      Pages.vehiclesList();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.vehiclesList = async function () {
  const vehicles = await Api.get('/vehicles');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>السيارات</h2>
        <button class="btn" id="addVehicleBtn">+ سيارة جديدة</button>
      </div>
      ${
        vehicles.length === 0
          ? '<div class="empty-state">لا يوجد سيارات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الاسم</th><th>الملكية</th><th>السائق</th><th>الإيجار الشهري</th><th></th>
            </tr></thead><tbody>
              ${vehicles
                .map(
                  (v) => `<tr>
                  <td>${UI.escapeHtml(v.name)}</td>
                  <td>${v.ownership === 'owned' ? UI.badge('ملك خاص', 'green') : UI.badge('مأجورة', 'orange')}</td>
                  <td>${UI.escapeHtml(v.driver_name || '-')}</td>
                  <td>${v.ownership === 'rented' ? UI.money(v.monthly_rent) : '-'}</td>
                  <td><button class="link-btn" data-edit="${v.id}">تعديل</button></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
  document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal());
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const v = vehicles.find((x) => x.id === Number(btn.dataset.edit));
      openVehicleModal(v);
    })
  );
};

window.Pages = Pages;
