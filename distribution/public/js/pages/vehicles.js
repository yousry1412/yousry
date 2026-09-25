var Pages = window.Pages || {};

function vehicleFormHtml(v = {}, employees = []) {
  return `
    <form id="vehicleForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم السيارة *</label><input name="name" required value="${UI.escapeHtml(v.name || '')}" /></div>
        <div class="field"><label>رقم اللوحة</label><input name="plate_number" value="${UI.escapeHtml(v.plate_number || '')}" /></div>
        <div class="field"><label>الحجم / الحمولة</label><input name="capacity" placeholder="مثال: 3 طن، دبل كابينة" value="${UI.escapeHtml(v.capacity || '')}" /></div>
        <div class="field">
          <label>الملكية *</label>
          <select name="ownership" required>
            <option value="owned" ${v.ownership === 'owned' ? 'selected' : ''}>ملك خاص</option>
            <option value="rented" ${v.ownership === 'rented' ? 'selected' : ''}>مأجورة</option>
          </select>
        </div>
        <div class="field">
          <label>السائق الافتراضي</label>
          <select name="default_driver_id"><option value="">- بدون -</option>${UI.optionsHtml(employees, 'id', 'name', v.default_driver_id)}</select>
        </div>
        <div class="field span-2"><label>الإيجار الشهري (لو مأجورة)</label><input name="monthly_rent" type="number" step="0.01" value="${v.monthly_rent ?? 0}" /></div>
        <div class="field span-2">
          <label>صورة السيارة (اختياري)</label>
          <input type="file" name="photo_file" accept="image/*" />
          ${v.photo ? `<div style="margin-top:6px"><button type="button" class="link-btn" data-view-photo="vehicle">عرض الصورة الحالية</button></div>` : ''}
        </div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(v.notes || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${v.id ? 'حفظ التعديلات' : 'إضافة السيارة'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openVehicleModal(existing, employees) {
  UI.openModal(existing ? 'تعديل بيانات سيارة' : 'سيارة جديدة', vehicleFormHtml(existing || {}, employees));

  const viewPhotoBtn = document.querySelector('[data-view-photo="vehicle"]');
  if (viewPhotoBtn) {
    viewPhotoBtn.addEventListener('click', () => {
      UI.openModal('صورة السيارة', `<img src="${existing.photo}" style="max-width:100%; border-radius:8px" />`);
    });
  }

  document.getElementById('vehicleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const photoFile = fd.get('photo_file');
    fd.delete('photo_file');
    const payload = Object.fromEntries(fd.entries());
    if (!payload.default_driver_id) delete payload.default_driver_id;
    payload.is_active = 1;
    try {
      if (photoFile && photoFile.size > 0) payload.photo = await compressImageFile(photoFile);
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
  const [vehicles, employees] = await Promise.all([Api.get('/vehicles'), Api.get('/employees/basic').catch(() => [])]);
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
              <th></th><th>الاسم</th><th>رقم اللوحة</th><th>الحجم/الحمولة</th><th>الملكية</th><th>السائق</th><th>الإيجار الشهري</th><th></th>
            </tr></thead><tbody>
              ${vehicles
                .map(
                  (v) => `<tr>
                  <td>${v.photo ? `<img src="${v.photo}" style="width:36px; height:36px; object-fit:cover; border-radius:6px" />` : '-'}</td>
                  <td>${UI.escapeHtml(v.name)}</td>
                  <td>${UI.escapeHtml(v.plate_number || '-')}</td>
                  <td>${UI.escapeHtml(v.capacity || '-')}</td>
                  <td>${v.ownership === 'owned' ? UI.badge('ملك خاص', 'green') : UI.badge('مأجورة', 'orange')}</td>
                  <td>
                    ${v.driver_photo ? `<img src="${v.driver_photo}" style="width:22px; height:22px; object-fit:cover; border-radius:50%; vertical-align:middle; margin-left:6px" />` : ''}
                    ${UI.escapeHtml(v.driver_name || '-')}
                  </td>
                  <td>${v.ownership === 'rented' ? UI.money(v.monthly_rent) : '-'}</td>
                  <td><button class="link-btn" data-edit="${v.id}">تعديل</button></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);
  document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal(null, employees));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const v = vehicles.find((x) => x.id === Number(btn.dataset.edit));
      openVehicleModal(v, employees);
    })
  );
};

window.Pages = Pages;
