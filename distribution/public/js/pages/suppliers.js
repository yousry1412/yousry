var Pages = window.Pages || {};

function supplierFormHtml(s = {}) {
  return `
    <form id="supplierForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم المورد *</label><input name="name" required value="${UI.escapeHtml(s.name || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(s.phone || '')}" /></div>
        ${
          s.id
            ? ''
            : `<div class="field"><label>رصيد افتتاحي (مستحق له)</label><input name="opening_balance" type="number" step="0.01" value="0" /></div>`
        }
        <div class="field span-2"><label>العنوان</label><input name="address" value="${UI.escapeHtml(s.address || '')}" /></div>
        <div class="field"><label>نطاق الرقابة الجغرافية (متر)</label><input name="geofence_radius_m" type="number" step="1" placeholder="افتراضي المنشأة" value="${s.geofence_radius_m ?? ''}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(s.notes || '')}</textarea></div>
      </div>
      <div class="field span-2" style="margin-top:6px">
        <label>موقع المورد (لرقابة فواتير الشراء)</label>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
          <button type="button" class="btn secondary small" id="captureSupplierLoc">📍 تحديد موقعي الحالي كموقع المورد</button>
          <span id="supplierLocStatus" class="muted" style="font-size:13px">${
            s.latitude ? `مسجّل حاليًا · <a href="${UI.googleMapsLink(s.latitude, s.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>` : 'لسه متسجلش'
          }</span>
        </div>
        <input type="hidden" name="latitude" id="supplierLat" value="${s.latitude ?? ''}" />
        <input type="hidden" name="longitude" id="supplierLng" value="${s.longitude ?? ''}" />
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${s.id ? 'حفظ التعديلات' : 'إضافة المورد'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openSupplierModal(existing) {
  UI.openModal(existing ? 'تعديل بيانات مورد' : 'مورد جديد', supplierFormHtml(existing || {}));
  document.getElementById('captureSupplierLoc').addEventListener('click', async () => {
    const status = document.getElementById('supplierLocStatus');
    status.textContent = 'جارِ تحديد الموقع...';
    const pos = await UI.getCurrentPosition();
    if (!pos) {
      status.textContent = 'تعذّر تحديد الموقع - تأكد من السماح للمتصفح بالوصول لموقعك';
      return;
    }
    document.getElementById('supplierLat').value = pos.latitude;
    document.getElementById('supplierLng').value = pos.longitude;
    status.innerHTML = `تم التحديد الآن · <a href="${UI.googleMapsLink(pos.latitude, pos.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>`;
  });
  document.getElementById('supplierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/suppliers/${existing.id}`, payload);
      else await Api.post('/suppliers', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة المورد', 'success');
      Pages.suppliersList();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.suppliersList = async function () {
  const suppliers = await Api.get('/suppliers');
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>الموردون</h2>
        <button class="btn" id="addSupplierBtn">+ مورد جديد</button>
      </div>
      ${
        suppliers.length === 0
          ? '<div class="empty-state">لا يوجد موردون بعد</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>الاسم</th><th>الهاتف</th><th>المستحق له</th><th></th>
            </tr></thead><tbody>
              ${suppliers
                .map(
                  (s) => `<tr>
                  <td>${UI.escapeHtml(s.name)}</td>
                  <td>${UI.escapeHtml(s.phone || '-')}</td>
                  <td>${s.balance > 0 ? UI.badge(UI.money(s.balance), 'orange') : UI.badge('0.00 ج.م', 'gray')}</td>
                  <td>
                    <a class="link-btn" href="#/suppliers/${s.id}">كشف حساب</a>
                    &nbsp;·&nbsp;
                    <button class="link-btn" data-edit="${s.id}">تعديل</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addSupplierBtn').addEventListener('click', () => openSupplierModal());
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const s = suppliers.find((x) => x.id === Number(btn.dataset.edit));
      openSupplierModal(s);
    })
  );
};

Pages.supplierStatement = async function (id) {
  const data = await Api.get(`/suppliers/${id}/statement`);
  const s = data.supplier;
  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>كشف حساب: ${UI.escapeHtml(s.name)}</h2>
        <a class="btn secondary small" href="#/suppliers">رجوع للموردين</a>
      </div>
      <p class="muted">الهاتف: ${UI.escapeHtml(s.phone || '-')} · العنوان: ${UI.escapeHtml(s.address || '-')}</p>
      ${
        data.rows.length === 0
          ? '<div class="empty-state">لا توجد حركات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (مدفوع له)</th><th>دائن (مستحق له)</th><th>الرصيد</th></tr></thead><tbody>
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
        <div class="totals-row grand"><span>الرصيد الحالي المستحق للمورد</span><span>${UI.money(data.balance)}</span></div>
      </div></div>
    </div>
  `);
};

window.Pages = Pages;
