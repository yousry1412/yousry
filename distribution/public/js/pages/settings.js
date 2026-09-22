var Pages = window.Pages || {};

const SETTINGS_TABS = [
  { key: 'companies', label: 'المنشآت' },
  { key: 'branches', label: 'الفروع' },
  { key: 'partners', label: 'الشركاء' },
  { key: 'accounts', label: 'شجرة الحسابات' },
  { key: 'whatsapp', label: 'واتساب' },
];

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
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${c.id ? 'حفظ التعديلات' : 'إضافة المنشأة'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openCompanyModal(existing, onDone) {
  UI.openModal(existing ? 'تعديل بيانات منشأة' : 'منشأة جديدة', companyFormHtml(existing || {}));
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

function partnerFormHtml(p = {}) {
  return `
    <form id="partnerForm">
      <div class="form-grid">
        <div class="field span-2"><label>اسم الشريك *</label><input name="name" required value="${UI.escapeHtml(p.name || '')}" /></div>
        <div class="field"><label>الهاتف</label><input name="phone" value="${UI.escapeHtml(p.phone || '')}" /></div>
        <div class="field"><label>نسبته في الأرباح (%) *</label><input name="share_percentage" type="number" step="0.01" min="0" max="100" required value="${p.share_percentage ?? ''}" /></div>
        <div class="field span-2"><label>ملاحظات</label><textarea name="notes" rows="2">${UI.escapeHtml(p.notes || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn">${p.id ? 'حفظ التعديلات' : 'إضافة الشريك'}</button>
        <button type="button" class="btn secondary" onclick="UI.closeModal()">إلغاء</button>
      </div>
    </form>
  `;
}

function openPartnerModal(existing, onDone) {
  UI.openModal(existing ? 'تعديل بيانات شريك' : 'شريك جديد', partnerFormHtml(existing || {}));
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

async function renderPartnersTab() {
  const partners = await Api.get('/partners');
  const sumPct = partners.filter((p) => p.is_active).reduce((s, p) => s + p.share_percentage, 0);
  const html = `
    <div class="card-header"><h3>الشركاء ونسبهم في الأرباح</h3><button class="btn small" id="addPartnerBtn">+ شريك جديد</button></div>
    ${
      partners.length > 0
        ? `<p style="font-size:13px">إجمالي النسب النشطة: ${UI.badge(sumPct.toFixed(2) + '%', Math.abs(sumPct - 100) < 0.5 ? 'green' : 'red')} ${Math.abs(sumPct - 100) >= 0.5 ? '(لازم يكون المجموع ١٠٠٪ قبل عمل إقفال مالي)' : ''}</p>`
        : ''
    }
    ${
      partners.length === 0
        ? '<div class="empty-state">لا يوجد شركاء مسجّلين - لو المنشأة مالكها فرد واحد مش محتاج تضيف حد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>النسبة</th><th></th></tr></thead><tbody>
            ${partners
              .map(
                (p) => `<tr>
                <td>${UI.escapeHtml(p.name)}</td>
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
  document.getElementById('addPartnerBtn').addEventListener('click', () => openPartnerModal(null, renderPartnersTab));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = partners.find((x) => x.id === Number(btn.dataset.edit));
      openPartnerModal(p, renderPartnersTab);
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
      التفاصيل خطوة بخطوة موجودة في ملف README.
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

const SETTINGS_RENDERERS = {
  companies: renderCompaniesTab,
  branches: renderBranchesTab,
  partners: renderPartnersTab,
  accounts: renderAccountsTab,
  whatsapp: renderWhatsappTab,
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
