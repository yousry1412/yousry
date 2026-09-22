var Pages = window.Pages || {};

/** بيضغط الصورة على المتصفح قبل الإرسال (أقصى عرض/ارتفاع 900px، جودة JPEG 0.6) عشان الحجم يفضل معقول */
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function damageFormHtml(products, trips, employees) {
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
        <div class="field span-2"><label>السبب *</label><input name="reason" required placeholder="مثال: كسر، انتهاء صلاحية، تلف أثناء النقل" /></div>
        <div class="field"><label>المسبب (موظف مسجّل)</label><select name="responsible_employee_id"><option value="">-</option>${UI.optionsHtml(employees, 'id', 'name')}</select></div>
        <div class="field"><label>أو اسم المسبب (لو مش موظف مسجّل)</label><input name="responsible_name" placeholder="مثال: عميل، مورد نقل..." /></div>
        <div class="field span-2">
          <label>صورة التلف</label>
          <input type="file" name="photo" accept="image/*" capture="environment" />
        </div>
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
              <th>الرقم</th><th>الصنف</th><th>الكمية</th><th>القيمة</th><th>التاريخ</th><th>السبب</th><th>المسبب</th><th>صورة</th>
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
                  <td>${UI.escapeHtml(r.responsible_employee_name || r.responsible_name || '-')}</td>
                  <td>${r.photo_data ? `<button type="button" class="link-btn" data-photo="${r.id}">عرض</button>` : '-'}</td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.querySelectorAll('[data-photo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const row = rows.find((r) => r.id === Number(btn.dataset.photo));
      UI.openModal(`صورة تلف ${UI.escapeHtml(row.damage_no)}`, `<img src="${row.photo_data}" style="max-width:100%; border-radius:8px" />`);
    })
  );

  document.getElementById('addDamageBtn').addEventListener('click', async () => {
    const [products, trips, employees] = await Promise.all([Api.get('/products'), Api.get('/trips'), Api.get('/employees/basic').catch(() => [])]);
    const openTrips = trips.filter((t) => t.status === 'open');
    UI.openModal('تسجيل تلف / هالك', damageFormHtml(products, openTrips, employees));
    document.getElementById('damageForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const photoFile = fd.get('photo');
      fd.delete('photo');
      const payload = Object.fromEntries(fd.entries());
      if (!payload.trip_id) delete payload.trip_id;
      if (!payload.responsible_employee_id) delete payload.responsible_employee_id;
      if (photoFile && photoFile.size > 0) {
        try {
          payload.photo_data = await compressImageFile(photoFile);
        } catch (_) {
          /* لو فشل ضغط الصورة، نسجل التلف من غيرها بدل ما نوقف العملية */
        }
      }
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
