var Pages = window.Pages || {};

const SETTINGS_TABS = [
  { key: 'companies', label: 'المنشآت' },
  { key: 'branches', label: 'الفروع' },
  { key: 'partners', label: 'الشركاء' },
  { key: 'users', label: 'المستخدمون' },
  { key: 'accounts', label: 'شجرة الحسابات' },
  { key: 'whatsapp', label: 'واتساب' },
  { key: 'maps', label: 'الخرائط' },
  { key: 'activity', label: 'سجل النشاط' },
];

const USER_ROLE_LABELS = {
  owner: 'مالك (صلاحية كاملة على كل المنشآت)',
  accountant: 'محاسب (كل حاجة ماعدا المستخدمين والإعدادات)',
  sales: 'مندوب مبيعات (عملاء، فواتير بيع، رحلات)',
  warehouse: 'أمين مخزن (موردين، مشتريات، مخزون، تصنيع)',
  partner: 'شريك (عرض التقارير المالية الملخّصة بس - حسب فرعه أو الشركة كلها)',
};
const USER_ROLE_ORDER = ['owner', 'accountant', 'sales', 'warehouse', 'partner'];

// خريطة الدولة -> العملة الافتراضية بتاعتها - بتتحدد تلقائيًا وقت اختيار الدولة، وتقدر
// تعدّلها يدويًا لو محتاج. العملة هنا رمز عرض بس (مفيش تحويل عملات أو أسعار صرف في
// النظام) - عشان كده كل فروع نفس المنشأة لازم يكونوا بنفس عملة المنشأة، وإلا التقارير
// المجمّعة (قائمة الدخل، الميزانية) هتجمع أرقام بعملات مختلفة كأنها نفس الوحدة.
const COUNTRY_CURRENCY = {
  'مصر': 'ج.م', 'السعودية': 'ر.س', 'الإمارات': 'د.إ', 'الكويت': 'د.ك',
  'قطر': 'ر.ق', 'البحرين': 'د.ب', 'عُمان': 'ر.ع', 'الأردن': 'د.أ',
  'لبنان': 'ل.ل', 'العراق': 'د.ع', 'المغرب': 'د.م', 'الجزائر': 'د.ج',
  'تونس': 'د.ت', 'ليبيا': 'د.ل', 'السودان': 'ج.س', 'فلسطين': '₪',
  'اليمن': 'ر.ي', 'أمريكا': '$', 'بريطانيا': '£', 'أوروبا (يورو)': '€',
};

function companyFormHtml(c = {}) {
  return `
    <form id="companyForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم المنشأة *</label><input name="name" required value="${UI.escapeHtml(c.name || '')}" /></div>
        <div class="field"><label>الاسم القانوني</label><input name="legal_name" value="${UI.escapeHtml(c.legal_name || '')}" /></div>
        <div class="field"><label>الرقم الضريبي</label><input name="tax_number" value="${UI.escapeHtml(c.tax_number || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(c.phone || '')}" /></div>
        <div class="field"><label>رابط الموقع العام (لإرسال روابط الفواتير)</label><input name="public_url" placeholder="https://example.com" value="${UI.escapeHtml(c.public_url || '')}" /></div>
        <div class="field span-2"><label>العنوان</label><input name="address" value="${UI.escapeHtml(c.address || '')}" /></div>
        <div class="field span-2">
          <label>موقع المنشأة (GPS)</label>
          <div style="display:flex; align-items:center; gap:10px">
            <button type="button" class="btn secondary small" id="companyGpsBtn">📍 تحديد موقعي الحالي</button>
            <span class="muted" id="companyGpsStatus" style="font-size:12.5px">${c.latitude ? `مسجّل حاليًا · <a href="${UI.googleMapsLink(c.latitude, c.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>` : 'لسه متسجلش'}</span>
          </div>
          <input type="hidden" name="latitude" id="companyLat" value="${c.latitude ?? ''}" />
          <input type="hidden" name="longitude" id="companyLng" value="${c.longitude ?? ''}" />
        </div>
      </div>
      <div class="card-header" style="margin:14px 0 6px"><h3 style="font-size:14px">الضرائب والعملة - حسب دولة تشغيل المنشأة</h3></div>
      <p class="muted" style="font-size:12.5px">قواعد الضريبة والعملة بتختلف من بلد لبلد - حدد الدولة، وهيتحدد شكل العملة تلقائيًا (تقدر تعدّله)، وحدد نسبة الضريبة الصحيحة لبلدك، أو سيّب الضريبة "غير مفعّلة" لو منشأتك مش خاضعة للضريبة أصلاً.</p>
      <div class="form-grid">
        <div class="field">
          <label>الدولة</label>
          <select name="country" id="companyCountrySelect">
            ${Object.keys(COUNTRY_CURRENCY).map((name) => `<option value="${name}" ${(c.country || 'مصر') === name ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>رمز العملة</label><input name="currency" id="companyCurrencyInput" value="${UI.escapeHtml(c.currency || COUNTRY_CURRENCY[c.country || 'مصر'])}" /></div>
        <div class="field"><label>خاضعة لضريبة القيمة المضافة؟</label><select name="vat_enabled"><option value="0" ${!c.vat_enabled ? 'selected' : ''}>لا</option><option value="1" ${c.vat_enabled ? 'selected' : ''}>نعم</option></select></div>
        <div class="field"><label>نسبة الضريبة %</label><input name="vat_rate" type="number" step="0.01" value="${c.vat_rate ?? 0}" /></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>خاضعة لضريبة الخصم والإضافة (WHT)؟</label><select name="wht_enabled"><option value="0" ${!c.wht_enabled ? 'selected' : ''}>لا</option><option value="1" ${c.wht_enabled ? 'selected' : ''}>نعم</option></select></div>
        <div class="field"><label>نسبة الخصم والإضافة %</label><input name="wht_rate" type="number" step="0.01" value="${c.wht_rate ?? 0}" /></div>
        <div class="field"><label>خاضعة لضريبة الدمغة؟</label><select name="stamp_duty_enabled"><option value="0" ${!c.stamp_duty_enabled ? 'selected' : ''}>لا</option><option value="1" ${c.stamp_duty_enabled ? 'selected' : ''}>نعم</option></select></div>
        <div class="field"><label>نسبة ضريبة الدمغة %</label><input name="stamp_duty_rate" type="number" step="0.01" value="${c.stamp_duty_rate ?? 0}" /></div>
        <div class="field"><label>خاضعة لضريبة الدخل السنوية؟</label><select name="income_tax_enabled"><option value="0" ${!c.income_tax_enabled ? 'selected' : ''}>لا</option><option value="1" ${c.income_tax_enabled ? 'selected' : ''}>نعم</option></select></div>
        <div class="field"><label>نسبة ضريبة الدخل %</label><input name="income_tax_rate" type="number" step="0.01" value="${c.income_tax_rate ?? 0}" /></div>
        <div class="field"><label>نطاق الرقابة الجغرافية الافتراضي (متر)</label><input name="geofence_radius_m" type="number" step="1" value="${c.geofence_radius_m ?? 300}" /></div>
      </div>
      <p class="muted" style="font-size:12px">
        ضريبة الخصم والإضافة: بتتحجز آليًا من مستحقات المورد عند تسجيل فاتورة الشراء، وبتفضل مديونية على المنشأة لحين توريدها للمصلحة.
        ضريبة الدمغة: بتُضاف آليًا على فاتورة البيع كمبلغ منفصل عن الضريبة المضافة.
        ضريبة الدخل السنوية: نسبة تقديرية بتظهر كبند تقديري في قائمة الدخل بس، ومحتاجة مراجعة المحاسب عند التوريد الفعلي - مفيش قيود محاسبية آلية بيها.
      </p>
      <p class="muted" style="font-size:12px">نطاق الرقابة الجغرافية: أقصى مسافة (بالمتر) مسموح بيها بين موقع تسجيل فاتورة الشراء وموقع المورد المسجّل، عشان تتأكد إن الفاتورة اتسجلت فعليًا عند المورد. تقدر تخصص نطاق مختلف لكل مورد من صفحة الموردين.</p>
      <div class="modal-actions">
        <button type="submit" class="btn">${c.id ? 'حفظ التعديلات' : 'إضافة المنشأة'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openCompanyModal(existing, onDone) {
  UI.openModal(existing ? 'تعديل بيانات منشأة' : 'منشأة جديدة', companyFormHtml(existing || {}));
  document.getElementById('companyGpsBtn').addEventListener('click', async () => {
    const status = document.getElementById('companyGpsStatus');
    status.textContent = 'جارِ تحديد الموقع...';
    const pos = await UI.getCurrentPosition();
    if (!pos) {
      status.textContent = 'تعذّر تحديد الموقع - تأكد من تفعيل خدمة الموقع';
      return;
    }
    document.getElementById('companyLat').value = pos.latitude;
    document.getElementById('companyLng').value = pos.longitude;
    status.innerHTML = `تم التحديد الآن · <a href="${UI.googleMapsLink(pos.latitude, pos.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>`;
  });
  document.getElementById('companyCountrySelect').addEventListener('change', (e) => {
    document.getElementById('companyCurrencyInput').value = COUNTRY_CURRENCY[e.target.value] || '';
  });
  document.getElementById('companyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/companies/${existing.id}`, payload);
      else await Api.post('/companies', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة المنشأة', 'success');
      await Context.refreshCompanies();
      renderContextSwitcher();
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

async function renderCompaniesTab() {
  const companies = Context.getCompanies();
  const html = `
    <div class="card-header"><h3>المنشآت</h3><button class="btn small" id="addCompanyBtn">+ منشأة جديدة</button></div>
    <p class="muted" style="font-size:13px">كل منشأة ليها دفاتر محاسبية وشجرة حسابات وشركاء مستقلين تمامًا، وتقدر تبدّل بينها من أعلى الصفحة.</p>
    <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الرقم الضريبي</th><th>الهاتف</th><th></th></tr></thead><tbody>
      ${companies
        .map(
          (c) => `<tr>
          <td>${UI.escapeHtml(c.name)}${c.id === Context.getCompanyId() ? ' ' + UI.badge('الحالية', 'green') : ''}</td>
          <td>${UI.escapeHtml(c.tax_number || '-')}</td>
          <td>${UI.escapeHtml(c.phone || '-')}</td>
          <td><button class="link-btn" data-edit="${c.id}">تعديل</button></td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
  `;
  document.getElementById('settingsTabContent').innerHTML = html;
  document.getElementById('addCompanyBtn').addEventListener('click', () => openCompanyModal(null, renderCompaniesTab));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const c = companies.find((x) => x.id === Number(btn.dataset.edit));
      openCompanyModal(c, renderCompaniesTab);
    })
  );
}

function branchFormHtml(b = {}) {
  return `
    <form id="branchForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم الفرع *</label><input name="name" required value="${UI.escapeHtml(b.name || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(b.phone || '')}" /></div>
        <div class="field"><label>فرع رئيسي؟</label>
          <select name="is_main"><option value="0" ${!b.is_main ? 'selected' : ''}>لا</option><option value="1" ${b.is_main ? 'selected' : ''}>نعم</option></select>
        </div>
        <div class="field span-2"><label>العنوان</label><input name="address" value="${UI.escapeHtml(b.address || '')}" /></div>
        <div class="field span-2">
          <label>موقع الفرع / المخزن (GPS)</label>
          <div style="display:flex; align-items:center; gap:10px">
            <button type="button" class="btn secondary small" id="branchGpsBtn">📍 تحديد موقعي الحالي</button>
            <span class="muted" id="branchGpsStatus" style="font-size:12.5px">${b.latitude ? `مسجّل حاليًا · <a href="${UI.googleMapsLink(b.latitude, b.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>` : 'لسه متسجلش'}</span>
          </div>
          <input type="hidden" name="latitude" id="branchLat" value="${b.latitude ?? ''}" />
          <input type="hidden" name="longitude" id="branchLng" value="${b.longitude ?? ''}" />
        </div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${b.id ? 'حفظ التعديلات' : 'إضافة الفرع'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openBranchModal(existing, onDone) {
  UI.openModal(existing ? 'تعديل بيانات فرع' : 'فرع جديد', branchFormHtml(existing || {}));
  document.getElementById('branchGpsBtn').addEventListener('click', async () => {
    const status = document.getElementById('branchGpsStatus');
    status.textContent = 'جارِ تحديد الموقع...';
    const pos = await UI.getCurrentPosition();
    if (!pos) {
      status.textContent = 'تعذّر تحديد الموقع - تأكد من تفعيل خدمة الموقع';
      return;
    }
    document.getElementById('branchLat').value = pos.latitude;
    document.getElementById('branchLng').value = pos.longitude;
    status.innerHTML = `تم التحديد الآن · <a href="${UI.googleMapsLink(pos.latitude, pos.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>`;
  });
  document.getElementById('branchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_main = payload.is_main === '1';
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/branches/${existing.id}`, payload);
      else await Api.post('/branches', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة الفرع', 'success');
      await Context.refreshBranches();
      renderContextSwitcher();
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

async function renderBranchesTab() {
  const branches = await Api.get('/branches');
  const html = `
    <div class="card-header"><h3>فروع "${UI.escapeHtml(Context.getCompany() ? Context.getCompany().name : '')}"</h3><button class="btn small" id="addBranchBtn">+ فرع جديد</button></div>
    <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>رئيسي؟</th><th>الهاتف</th><th></th></tr></thead><tbody>
      ${branches
        .map(
          (b) => `<tr>
          <td>${UI.escapeHtml(b.name)}${b.id === Context.getBranchId() ? ' ' + UI.badge('الحالي', 'green') : ''}</td>
          <td>${b.is_main ? UI.badge('نعم', 'green') : '-'}</td>
          <td>${UI.escapeHtml(b.phone || '-')}</td>
          <td><button class="link-btn" data-edit="${b.id}">تعديل</button></td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
  `;
  document.getElementById('settingsTabContent').innerHTML = html;
  document.getElementById('addBranchBtn').addEventListener('click', () => openBranchModal(null, renderBranchesTab));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const b = branches.find((x) => x.id === Number(btn.dataset.edit));
      openBranchModal(b, renderBranchesTab);
    })
  );
}

function partnerFormHtml(p = {}, branches) {
  return `
    <form id="partnerForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم الشريك *</label><input name="name" required value="${UI.escapeHtml(p.name || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(p.phone || '')}" /></div>
        <div class="field">
          <label>نطاق الشراكة</label>
          <select name="branch_id">
            <option value="">على مستوى الشركة كلها</option>
            ${UI.optionsHtml(branches, 'id', 'name', p.branch_id)}
          </select>
        </div>
        <div class="field"><label>نسبته في الأرباح (%) *</label><input name="share_percentage" type="number" step="0.01" min="0" max="100" required value="${p.share_percentage ?? ''}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(p.notes || '')}</textarea></div>
      </div>
      <p class="muted" style="font-size:12.5px">لو اخترت فرع معين، الشريك ده هياخد نصيبه بس من صافي ربح إقفال هذا
        الفرع لوحده (مش كل الشركة)، ونسبته لازم تتجمّع مع باقي شركاء نفس الفرع لتساوي ١٠٠٪.</p>
      <div class="modal-actions">
        <button type="submit" class="btn">${p.id ? 'حفظ التعديلات' : 'إضافة الشريك'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openPartnerModal(existing, branches, onDone) {
  UI.openModal(existing ? 'تعديل بيانات شريك' : 'شريك جديد', partnerFormHtml(existing || {}, branches));
  document.getElementById('partnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_active = 1;
    try {
      if (existing) await Api.put(`/partners/${existing.id}`, payload);
      else await Api.post('/partners', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة الشريك', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

function partnerScopeSummary(partners, label, scopeKey, scopeValue) {
  const scoped = partners.filter((p) => p.is_active && p[scopeKey] === scopeValue);
  if (scoped.length === 0) return '';
  const sumPct = Math.round((scoped.reduce((s, p) => s + p.share_percentage, 0) + Number.EPSILON) * 100) / 100;
  return `<p style="font-size:13px">${label}: ${UI.badge(sumPct.toFixed(2) + '%', Math.abs(sumPct - 100) < 0.5 ? 'green' : 'red')} ${Math.abs(sumPct - 100) >= 0.5 ? '(لازم يكون المجموع ١٠٠٪ قبل إقفال هذا النطاق)' : ''}</p>`;
}

async function renderPartnersTab() {
  const [partners, branches] = await Promise.all([Api.get('/partners'), Api.get('/branches')]);
  const branchIds = [...new Set(partners.filter((p) => p.branch_id).map((p) => p.branch_id))];
  const html = `
    <div class="card-header"><h3>الشركاء ونسبهم في الأرباح</h3><button class="btn small" id="addPartnerBtn">+ شريك جديد</button></div>
    ${partnerScopeSummary(partners, 'إجمالي نسب شركاء الشركة العامين', 'branch_id', null)}
    ${branchIds
      .map((bid) => {
        const branch = branches.find((b) => b.id === bid);
        return partnerScopeSummary(partners, `إجمالي نسب شركاء فرع "${branch ? branch.name : bid}"`, 'branch_id', bid);
      })
      .join('')}
    ${
      partners.length === 0
        ? '<div class="empty-state">لا يوجد شركاء مسجّلين - لو المنشأة مالكها فرد واحد مش محتاج تضيف حد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>النطاق</th><th>الهاتف</th><th>النسبة</th><th></th></tr></thead><tbody>
            ${partners
              .map(
                (p) => `<tr>
                <td>${UI.escapeHtml(p.name)}</td>
                <td>${p.branch_id ? UI.badge(UI.escapeHtml(p.branch_name || ''), 'orange') : UI.badge('كل الشركة', 'gray')}</td>
                <td>${UI.escapeHtml(p.phone || '-')}</td>
                <td>${p.share_percentage}%</td>
                <td><button class="link-btn" data-edit="${p.id}">تعديل</button></td>
              </tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;
  document.getElementById('settingsTabContent').innerHTML = html;
  document.getElementById('addPartnerBtn').addEventListener('click', () => openPartnerModal(null, branches, renderPartnersTab));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = partners.find((x) => x.id === Number(btn.dataset.edit));
      openPartnerModal(p, branches, renderPartnersTab);
    })
  );
}

function accountFormHtml(accounts) {
  const parents = accounts.filter((a) => !a.is_postable);
  return `
    <form id="accountForm">
      <div class="form-grid">
        <div class="field"><label>الكود *</label><input name="code" required placeholder="مثال: 1040" /></div>
        <div class="field span-2"><label>اسم الحساب *</label><input name="name" required /></div>
        <div class="field">
          <label>النوع *</label>
          <select name="type" required>
            <option value="asset">أصول</option>
            <option value="liability">خصوم</option>
            <option value="equity">حقوق ملكية</option>
            <option value="revenue">إيرادات</option>
            <option value="expense">مصروفات</option>
          </select>
        </div>
        <div class="field"><label>الحساب الأب (اختياري)</label><select name="parent_code"><option value="">- بدون -</option>${UI.optionsHtml(parents, 'code', 'name')}</select></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">إضافة الحساب</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function userFormHtml(u = {}, branches = [], partners = []) {
  return `
    <form id="userForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم المستخدم (للدخول به) *</label><input name="username" required minlength="3" value="${UI.escapeHtml(u.username || '')}" ${u.id ? 'disabled' : ''} /></div>
        <div class="field"><label>${u.id ? 'كلمة سر جديدة (سيبها فاضية لو مش هتغيّرها)' : 'كلمة السر *'}</label><input name="password" type="password" minlength="8" ${u.id ? '' : 'required'} /></div>
        <div class="field">
          <label>الصلاحية *</label>
          <select name="role" id="userRoleSelect" required>
            ${USER_ROLE_ORDER.map((v) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${USER_ROLE_LABELS[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field span-2" id="userBranchWrap"><label>الفرع (اختياري - سيبه فاضي لو محتاج يشتغل على كل الفروع)</label>
          <select name="branch_id"><option value="">- كل الفروع -</option>${UI.optionsHtml(branches, 'id', 'name', u.branch_id)}</select>
        </div>
        <div class="field span-2" id="userPartnerWrap">
          <label>الشريك المرتبط بالحساب ده *</label>
          <select name="partner_id">
            <option value="">- اختر الشريك -</option>
            ${partners.map((p) => `<option value="${p.id}" ${u.partner_id === p.id ? 'selected' : ''}>${UI.escapeHtml(p.name)} ${p.branch_name ? '(' + UI.escapeHtml(p.branch_name) + ')' : '(كل الفروع)'}</option>`).join('')}
          </select>
          <p class="muted" style="font-size:12px; margin:4px 0 0">الحساب هيتقفل تلقائيًا على نفس فرع الشريك (أو كل الفروع لو شراكته على مستوى الشركة).</p>
        </div>
        <div class="field"><label>رقم هاتف واتساب (لتنبيهات الفواتير الميدانية)</label><input name="phone" type="tel" value="${UI.escapeHtml(u.phone || '')}" /></div>
        <div class="field"><label>نسبة عمولة على المبيعات % (اختياري)</label><input name="commission_pct" type="number" step="0.01" min="0" max="100" value="${u.commission_pct ?? ''}" /></div>
        <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="userNotifyInvoices" name="notify_new_invoices" value="1" style="width:auto" ${u.notify_new_invoices ? 'checked' : ''} />
          <label for="userNotifyInvoices" style="margin:0">تنبيهي على واتساب بأي فاتورة ميدانية جديدة</label>
        </div>
        <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="userNotifyTripStart" name="notify_trip_start" value="1" style="width:auto" ${u.notify_trip_start ? 'checked' : ''} />
          <label for="userNotifyTripStart" style="margin:0">تنبيهي على واتساب ببداية أي رحلة توزيع جديدة</label>
        </div>
        <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="userNotifyExpenses" name="notify_new_expenses" value="1" style="width:auto" ${u.notify_new_expenses ? 'checked' : ''} />
          <label for="userNotifyExpenses" style="margin:0">تنبيهي على واتساب بأي مصروف جديد (رحلة أو عام)</label>
        </div>
        <div class="field span-2" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="userNotifyExpiry" name="notify_expiry_alerts" value="1" style="width:auto" ${u.notify_expiry_alerts ? 'checked' : ''} />
          <label for="userNotifyExpiry" style="margin:0">تنبيهي على واتساب بتنبيهات صلاحية الأصناف القريبة/المنتهية</label>
        </div>
        ${
          u.id
            ? `<div class="field"><label>الحالة</label>
                <select name="is_active"><option value="1" ${u.is_active ? 'selected' : ''}>نشط</option><option value="0" ${!u.is_active ? 'selected' : ''}>موقوف</option></select>
              </div>`
            : ''
        }
      </div>
      <p class="muted" style="font-size:12.5px">المستخدم (غير المالك) بيتقفل على المنشأة الحالية إجباريًا، وعلى الفرع لو حددته (أو فرع شريكه لو صلاحيته "شريك")، بغض النظر عن أي اختيار في الواجهة.</p>
      <div class="modal-actions">
        <button type="submit" class="btn">${u.id ? 'حفظ التعديلات' : 'إضافة المستخدم'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openUserModal(existing, branches, partners, onDone) {
  UI.openModal(existing ? `تعديل مستخدم: ${UI.escapeHtml(existing.username)}` : 'مستخدم جديد', userFormHtml(existing || {}, branches, partners));

  const roleSelect = document.getElementById('userRoleSelect');
  const branchWrap = document.getElementById('userBranchWrap');
  const partnerWrap = document.getElementById('userPartnerWrap');
  const partnerSelect = partnerWrap.querySelector('select[name=partner_id]');
  function updateFieldsVisibility() {
    const role = roleSelect.value;
    branchWrap.style.display = role === 'owner' || role === 'partner' ? 'none' : '';
    partnerWrap.style.display = role === 'partner' ? '' : 'none';
    partnerSelect.required = role === 'partner';
  }
  roleSelect.addEventListener('change', updateFieldsVisibility);
  updateFieldsVisibility();

  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (!payload.password) delete payload.password;
    if (!payload.branch_id) delete payload.branch_id;
    if (payload.role !== 'partner') delete payload.partner_id;
    payload.is_active = existing ? payload.is_active === '1' : 1;
    payload.notify_new_invoices = document.getElementById('userNotifyInvoices').checked;
    payload.notify_trip_start = document.getElementById('userNotifyTripStart').checked;
    payload.notify_new_expenses = document.getElementById('userNotifyExpenses').checked;
    payload.notify_expiry_alerts = document.getElementById('userNotifyExpiry').checked;
    try {
      if (existing) await Api.put(`/users/${existing.id}`, payload);
      else await Api.post('/users', payload);
      UI.closeModal();
      UI.toast(existing ? 'تم حفظ التعديلات' : 'تم إضافة المستخدم', 'success');
      onDone();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

async function renderUsersTab() {
  const [users, branches, partners] = await Promise.all([Api.get('/users'), Api.get('/branches'), Api.get('/partners')]);
  const container = document.getElementById('settingsTabContent');

  function userRowHtml(u) {
    const branch = branches.find((b) => b.id === u.branch_id);
    const partner = partners.find((p) => p.id === u.partner_id);
    const scopeLabel =
      u.role === 'owner' ? '- كل المنشآت -' : u.role === 'partner' ? (branch ? UI.escapeHtml(branch.name) : 'كل الفروع') + (partner ? ` · شريك: ${UI.escapeHtml(partner.name)}` : '') : branch ? UI.escapeHtml(branch.name) : 'كل الفروع';
    return `<tr>
      <td>${UI.escapeHtml(u.username)}</td>
      <td>${scopeLabel}</td>
      <td>${u.is_active ? UI.badge('نشط', 'green') : UI.badge('موقوف', 'red')}</td>
      <td><button class="link-btn" data-edit="${u.id}">تعديل</button></td>
    </tr>`;
  }

  const groupsHtml = USER_ROLE_ORDER.map((role) => {
    const roleUsers = users.filter((u) => u.role === role);
    if (roleUsers.length === 0) return '';
    return `
      <div class="card" style="margin-bottom:14px">
        <div class="card-header"><h4 style="margin:0">${USER_ROLE_LABELS[role]}</h4><span class="muted" style="font-size:12.5px">${roleUsers.length} مستخدم</span></div>
        <div class="table-wrap"><table><thead><tr><th>اسم المستخدم</th><th>النطاق</th><th>الحالة</th><th></th></tr></thead><tbody>
          ${roleUsers.map(userRowHtml).join('')}
        </tbody></table></div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="card-header"><h3>مستخدمو "${UI.escapeHtml(Context.getCompany() ? Context.getCompany().name : '')}"</h3><button class="btn small" id="addUserBtn">+ مستخدم جديد</button></div>
    <p class="muted" style="font-size:13px">المستخدمون مجمّعون حسب الصلاحية تحت كل منها. كل مستخدم (ماعدا المالك) بيشتغل بس على المنشأة الحالية، وعلى الفرع اللي تحدده له (أو فرع شريكه لو "شريك").</p>
    ${users.length === 0 ? '<div class="empty-state">لا يوجد مستخدمين بعد</div>' : groupsHtml}
  `;
  document.getElementById('addUserBtn').addEventListener('click', () => openUserModal(null, branches, partners, renderUsersTab));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const u = users.find((x) => x.id === Number(btn.dataset.edit));
      openUserModal(u, branches, partners, renderUsersTab);
    })
  );
}

async function renderAccountsTab() {
  const accounts = await Api.get('/accounts');
  const typeLabel = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
  const html = `
    <div class="card-header"><h3>شجرة الحسابات</h3><button class="btn small" id="addAccountBtn">+ إضافة حساب فرعي</button></div>
    <p class="muted" style="font-size:13px">الحسابات الأساسية جاهزة تلقائيًا. تقدر تضيف حسابات فرعية إضافية (زي بنوك متعددة أو بنود مصروفات جديدة).</p>
    <div class="table-wrap"><table><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>قابل للترحيل؟</th><th>مخصص؟</th></tr></thead><tbody>
      ${accounts
        .map(
          (a) => `<tr>
          <td>${a.code}</td>
          <td style="padding-right:${a.parent_code ? '20px' : '0'}">${UI.escapeHtml(a.name)}</td>
          <td>${typeLabel[a.type] || a.type}</td>
          <td>${a.is_postable ? 'نعم' : '-'}</td>
          <td>${a.is_system ? '-' : UI.badge('مخصص', 'orange')}</td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
  `;
  document.getElementById('settingsTabContent').innerHTML = html;
  document.getElementById('addAccountBtn').addEventListener('click', () => {
    UI.openModal('إضافة حساب جديد للشجرة', accountFormHtml(accounts));
    document.getElementById('accountForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      payload.is_postable = 1;
      if (!payload.parent_code) delete payload.parent_code;
      try {
        await Api.post('/accounts', payload);
        UI.closeModal();
        UI.toast('تم إضافة الحساب', 'success');
        renderAccountsTab();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });
}

async function renderWhatsappTab() {
  const config = await Api.get('/whatsapp/config');
  const log = await Api.get('/whatsapp/log');
  const html = `
    <div class="card-header"><h3>إعدادات واتساب بيزنس (لإرسال الفواتير للعملاء تلقائيًا)</h3></div>
    <p class="muted" style="font-size:13px">
      محتاج حساب واتساب بيزنس API رسمي من Meta: توكن دخول (Access Token)، ورقم هاتف مُسجّل (Phone Number ID)،
      وقالب رسالة (Template) معتمد من ميتا بأربع متغيرات: اسم العميل، رقم الفاتورة، المبلغ، رابط الفاتورة.
      التفاصيل خطوة بخطوة موجودة في ملف README. بمجرد ما تحفظ الإعدادات هنا، كل فاتورة بيع جديدة
      هتتبعت تلقائيًا على واتساب العميل من غير أي تدخل - وأي محاولة فشلت (رقم غلط، إعدادات ناقصة...)
      هتلاقيها في جدول "آخر محاولات الإرسال" تحت وتقدر تعيد إرسالها يدويًا من شاشة الفاتورة.
    </p>
    <form id="whatsappForm">
      <div class="form-grid">
        <div class="field span-2"><label>Access Token *</label><input name="access_token" type="password" value="${UI.escapeHtml(config.access_token || '')}" placeholder="EAAG..." /></div>
        <div class="field"><label>Phone Number ID *</label><input name="phone_number_id" value="${UI.escapeHtml(config.phone_number_id || '')}" /></div>
        <div class="field"><label>مفتاح الدولة الافتراضي</label><input name="default_country_code" value="${UI.escapeHtml(config.default_country_code || '20')}" /></div>
        <div class="field"><label>اسم القالب (Template)</label><input name="template_name" value="${UI.escapeHtml(config.template_name || 'invoice_notification')}" /></div>
        <div class="field"><label>لغة القالب</label><input name="template_lang" value="${UI.escapeHtml(config.template_lang || 'ar')}" /></div>
      </div>
      <div class="modal-actions"><button class="btn" type="submit">حفظ الإعدادات</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>اختبار الإرسال</h3></div>
    <form id="whatsappTestForm" class="form-grid">
      <div class="field"><label>رقم الموبايل</label><input name="phone" placeholder="01xxxxxxxxx" required /></div>
      <div class="field"><label>نص تجريبي</label><input name="text" value="رسالة اختبار من نظام إدارة التوزيع ✅" /></div>
      <div class="field" style="align-self:flex-end"><button class="btn secondary" type="submit">إرسال رسالة اختبار</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>آخر محاولات الإرسال</h3></div>
    ${
      log.length === 0
        ? '<div class="empty-state">لسه معملتش أي إرسال</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الرقم</th><th>الحالة</th><th>الفاتورة</th><th>التاريخ</th><th>الخطأ</th></tr></thead><tbody>
            ${log
              .map(
                (l) => `<tr>
                <td>${UI.escapeHtml(l.to_phone)}</td>
                <td>${l.status === 'sent' ? UI.badge('نجح', 'green') : UI.badge('فشل', 'red')}</td>
                <td>${l.sales_invoice_id || '-'}</td>
                <td>${UI.escapeHtml(l.created_at)}</td>
                <td class="muted">${UI.escapeHtml(l.error || '-')}</td>
              </tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;
  document.getElementById('settingsTabContent').innerHTML = html;

  document.getElementById('whatsappForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.put('/whatsapp/config', Object.fromEntries(fd.entries()));
      UI.toast('تم حفظ إعدادات واتساب', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });

  document.getElementById('whatsappTestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.post('/whatsapp/test', Object.fromEntries(fd.entries()));
      UI.toast('تم إرسال رسالة الاختبار بنجاح', 'success');
      renderWhatsappTab();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

async function renderMapsTab() {
  const config = await Api.get('/maps/config');
  const html = `
    <div class="card-header"><h3>إعدادات خرائط جوجل (لتتبع مواقع الفواتير والرحلات)</h3></div>
    <p class="muted" style="font-size:13px">
      النظام بيسجّل موقع GPS لموبايل السائق عند تسجيل كل فاتورة بيع، وبيتتبع موقعه لحظيًا أثناء
      الرحلة المفتوحة، وبيوريك كل ده على خريطة. من غير مفتاح API، النظام بيشتغل بنسخة احتياطية
      مجانية (خرائط OpenStreetMap + روابط مباشرة لفتح أي موقع في خرائط جوجل). لو عايز خريطة جوجل
      تفاعلية كاملة بكل النقاط في نفس الشاشة، هتحتاج:
    </p>
    <ol class="muted" style="font-size:13px; padding-right:18px">
      <li>اعمل مشروع في <a href="https://console.cloud.google.com" target="_blank" rel="noopener">Google Cloud Console</a> وفعّل خدمة "Maps JavaScript API".</li>
      <li>أنشئ مفتاح API (API Key)، وقيّده على دومين موقعك بس (HTTP referrer restriction) عشان محدش يستخدمه غيرك.</li>
      <li>لاصق المفتاح هنا واحفظ.</li>
    </ol>
    <p class="muted" style="font-size:13px">
      ملحوظة: تتبع موقع السائقين لحظيًا أثناء العمل بيحتاج توضيح للموظفين إنه شغال ولإيه (شفافية
      قانونية بسيطة)، ومفتاح الخريطة ده مش سر زي توكن واتساب - بيتقيّد بالدومين مش بالسرية.
    </p>
    <form id="mapsForm" class="form-grid">
      <div class="field span-2"><label>Google Maps API Key</label><input name="google_maps_api_key" value="${UI.escapeHtml(config.google_maps_api_key || '')}" placeholder="AIza..." /></div>
      <div class="field"><button class="btn" type="submit">حفظ</button></div>
    </form>
  `;
  document.getElementById('settingsTabContent').innerHTML = html;
  document.getElementById('mapsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.put('/maps/config', Object.fromEntries(fd.entries()));
      UI.toast('تم حفظ إعدادات الخرائط', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

const ACTIVITY_ACTION_LABELS = {
  login: 'تسجيل دخول',
  login_failed: 'محاولة دخول فاشلة',
  create_user: 'إنشاء مستخدم',
  update_user: 'تعديل مستخدم',
  create_supplier_contract: 'إنشاء عقد توريد',
  update_supplier_contract: 'تعديل عقد توريد',
  activate_supplier_contract: 'تفعيل عقد توريد',
  deactivate_supplier_contract: 'إيقاف عقد توريد',
  create_customer_price_list: 'إنشاء قائمة أسعار عميل',
  update_customer_price_list: 'تعديل قائمة أسعار عميل',
  activate_customer_price_list: 'تفعيل قائمة أسعار عميل',
  deactivate_customer_price_list: 'إيقاف قائمة أسعار عميل',
  reverse_damage: 'عكس قيد تلف',
  reverse_voucher: 'عكس سند',
};

async function renderActivityTab() {
  const rows = await Api.get('/activity-log?limit=300');
  const container = document.getElementById('settingsTabContent');
  container.innerHTML = `
    <div class="card-header"><h3>سجل النشاط الإداري</h3></div>
    <p class="muted" style="font-size:13px">تسجيل لحظي لعمليات الدخول والتعديلات الإدارية الحساسة (مستخدمين، عقود، قوائم أسعار، عكس قيود) - "مين عمل إيه وإمتى".</p>
    ${
      rows.length === 0
        ? '<div class="empty-state">لا يوجد نشاط مسجّل بعد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>
            ${rows
              .map(
                (r) => `<tr class="${r.action === 'login_failed' ? 'low-stock-row' : ''}">
              <td class="muted">${UI.formatDateTime(r.created_at)}</td>
              <td>${UI.escapeHtml(r.username || '-')}</td>
              <td>${ACTIVITY_ACTION_LABELS[r.action] || UI.escapeHtml(r.action)}</td>
              <td>${UI.escapeHtml(r.description || '-')}</td>
            </tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;
}

const SETTINGS_RENDERERS = {
  companies: renderCompaniesTab,
  branches: renderBranchesTab,
  partners: renderPartnersTab,
  users: renderUsersTab,
  accounts: renderAccountsTab,
  whatsapp: renderWhatsappTab,
  maps: renderMapsTab,
  activity: renderActivityTab,
};

Pages.settingsHome = async function () {
  UI.setContent(`
    <div class="card">
      <div class="tabs" id="settingsTabs">
        ${SETTINGS_TABS.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="settingsTabContent"><div class="empty-state">جارِ التحميل...</div></div>
    </div>
  `);

  async function showTab(key) {
    document.querySelectorAll('#settingsTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    try {
      await SETTINGS_RENDERERS[key]();
    } catch (err) {
      document.getElementById('settingsTabContent').innerHTML = `<p style="color:var(--danger)">${UI.escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll('#settingsTabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('companies');
};

window.Pages = Pages;
