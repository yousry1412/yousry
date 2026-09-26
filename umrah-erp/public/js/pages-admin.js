/* Umrah ERP — Administration: company, branches & taxes · users & roles · backup, versions, wipe, companies */
(function () {
  'use strict';
  const App = window.App, E = App.E, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const needOnline = (t) => `<div class="card empty-state"><h3>${t}</h3><p class="muted">متاح في النسخة الأونلاين (السيرفر).</p></div>`;

  // ============================================================ company / branches / taxes
  App.pages.settings = () => {
    const s = S(), c = s.company;
    return `<div class="page-head"><div><h2>🏢 الشركة والفروع والضرائب</h2><p>اسم الشركة وبياناتها تظهر في كل المطبوعات · الضريبة حسب دولة الشركة</p></div></div>
    <div class="grid g2">
      <div class="card"><h3>بيانات الشركة</h3><div class="grid g2">
        <div class="field"><label>اسم الشركة</label><input class="input" data-bind="company.name" value="${esc(c.name)}"></div>
        <div class="field"><label>الدولة</label><select class="input" data-bind="company.country" data-after="countryChanged">${Object.entries(Model.COUNTRIES).map(([k, v]) => opt(k, c.country, v.ar)).join('')}</select></div>
        <div class="field"><label>السجل التجاري</label><input class="input" data-bind="company.commercialNo" value="${esc(c.commercialNo)}"></div>
        <div class="field"><label>رقم ترخيص السياحة</label><input class="input" data-bind="company.licenseNo" value="${esc(c.licenseNo || '')}"></div>
        <div class="field"><label>الهاتف</label><input class="input" data-bind="company.phone" value="${esc(c.phone)}" style="direction:ltr"></div>
        <div class="field"><label>البريد</label><input class="input" data-bind="company.email" value="${esc(c.email)}" style="direction:ltr"></div>
        <div class="field" style="grid-column:1/-1"><label>العنوان</label><input class="input" data-bind="company.address" value="${esc(c.address)}"></div></div></div>
      <div class="card"><h3>🧾 الضرائب</h3>
        <label class="row"><input type="checkbox" data-bind="company.vatEnabled" ${c.vatEnabled ? 'checked' : ''}> تفعيل ضريبة القيمة المضافة على المبيعات (السعر شامل الضريبة)</label>
        <div class="grid g2" style="margin-top:8px"><div class="field"><label>نسبة الضريبة %</label><input class="input" type="number" step="0.5" data-bind="company.vatRate" value="${c.vatRate}"></div>
          <div class="field"><label>الرقم الضريبي</label><input class="input" data-bind="company.taxNo" value="${esc(c.taxNo)}" style="direction:ltr"></div></div>
        <div class="alert info small" style="margin-top:8px">عند التفعيل: يُفصل مبلغ الضريبة من إيراد كل حجز إلى حساب 2102 (ضريبة مخرجات) وتظهر في الفاتورة. النسبة الافتراضية حسب الدولة: مصر 14% · السعودية 15% · الإمارات 5% — راجع محاسبك في المعاملة الضريبية لنشاط السياحة لديك.</div>
        <h3 style="margin-top:14px">⏰ التنبيهات</h3><div class="grid g3">
          <div class="field"><label>تذكير الأقساط قبل (يوم)</label><input class="input" type="number" data-bind="settings.reminderDays" value="${s.settings.reminderDays}"></div>
          <div class="field"><label>تنبيه انتهاء التعليق قبل (ساعة)</label><input class="input" type="number" data-bind="settings.holdAlertHours" value="${s.settings.holdAlertHours}"></div>
          <div class="field"><label>تنبيه ملفات الرحلة قبل السفر (يوم)</label><input class="input" type="number" data-bind="settings.docsAlertDays" value="${s.settings.docsAlertDays}"></div></div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">🏬 الفروع</h3><span class="spacer"></span><button class="btn sm primary" data-act="branchAdd">+ فرع</button></div>
      <table class="t" style="margin-top:8px"><tr><th>الكود</th><th>الاسم</th><th>المدينة</th><th>الخزائن</th></tr>
      ${s.branches.map((b, i) => `<tr><td class="num">${esc(b.code)}</td><td><input class="input" data-bind="branches.${i}.name" value="${esc(b.name)}"></td><td><input class="input" data-bind="branches.${i}.city" value="${esc(b.city || '')}"></td>
        <td class="small">${s.cashboxes.filter((c2) => c2.branchId === b.id).map((c2) => esc(c2.name)).join('، ') || '—'}</td></tr>`).join('')}</table></div>`;
  };
  App.actions.countryChanged = () => { const c = S().company; c.vatRate = (Model.COUNTRIES[c.country] || Model.COUNTRIES.EG).vat; };
  App.actions.branchAdd = () => {
    const name = prompt('اسم الفرع:'); if (!name) return;
    const s = S(), n = s.branches.length + 1;
    s.branches.push({ id: 'BR' + Date.now().toString(36), code: 'BR-' + String(n).padStart(2, '0'), name: name.trim(), city: '' });
    App.audit(`إضافة فرع ${name}`); App.save(); App.render();
  };

  // ============================================================ users
  const ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS', 'AGENT', 'SUPERVISOR', 'HOUSING'];
  const HINT = { OWNER: 'كل الشركات والصلاحيات + النسخ الاحتياطي', MANAGER: 'كل شيء في شركته + اعتماد الخصم حتى 7% والسندات + المستخدمين', ACCOUNTANT: 'الحسابات والسندات والاعتماد والتقارير',
    HR: 'الموارد البشرية: الحضور والإجازات والتقييم والمهام والجزاءات وإعداد الرواتب', HEAD: 'مبيعات + خصم حتى 3%', SALES: 'حجوزات بدون خصم + رفع دفعات للمراجعة', OPERATIONS: 'التسكين والباص والجوازات والكشوف', AGENT: 'بوابة خاصة: حسابه + حجوزاته + رفع دفعات بالصور',
    SUPERVISOR: 'بوابة خاصة: كشف المشرف لرحلاته', HOUSING: 'بوابة خاصة: كشف مندوب التسكين لرحلاته' };
  let users = null;
  async function loadUsers() { try { users = await App.api('GET', 'api/users'); } catch (e) { users = []; App.toast(e.message, 'err'); } if (App.ui.page === 'users') App.render(); }
  const roleSel = (id, cur) => `<select class="input" id="${id}">${ROLES.filter((r) => App.me.role === 'OWNER' || !['OWNER', 'MANAGER'].includes(r)).map((r) => opt(r, cur, App.ROLE_LABEL[r])).join('')}</select>`;
  const agentSel = (id, cur) => `<select class="input" id="${id}"><option value="">—</option>${S().agents.map((a) => opt(a.id, cur, `${a.code} · ${a.name}`)).join('')}</select>`;
  App.pages.users = () => {
    if (!App.online) return needOnline('👥 المستخدمون والصلاحيات');
    if (!users) { loadUsers(); return '<div class="card muted">جارِ التحميل…</div>'; }
    const companyName = (id) => (App.companies.find((c) => c.id === id) || {}).name || (id ? '#' + id : 'كل الشركات');
    return `<div class="page-head"><div><h2>👥 المستخدمون والصلاحيات</h2><p>كل موظف ومندوب ومشرف يدخل بحسابه · الصلاحيات تُفرض على السيرفر · تغيير الدور أو كلمة السر يُخرج المستخدم من كل الأجهزة</p></div></div>
    <div class="grid g-side">
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>الشركة</th><th>الفرع</th><th>مرتبط بمندوب</th><th>نشط</th><th>كلمة سر جديدة</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td class="num">${esc(u.username)}</td><td><input class="input" id="un-${u.id}" value="${esc(u.display_name)}"></td><td>${roleSel('ur-' + u.id, u.role)}</td>
        <td class="small">${App.me.role === 'OWNER' ? `<select class="input" id="uc-${u.id}"><option value="">كل الشركات (مالك)</option>${App.companies.map((c) => opt(c.id, u.company_id, c.name)).join('')}</select>` : esc(companyName(u.company_id))}</td>
        <td><select class="input" id="ub-${u.id}"><option value="">—</option>${S().branches.map((b) => opt(b.id, u.branch_id, b.name)).join('')}</select></td>
        <td>${agentSel('ua2-' + u.id, u.agent_ref)}</td>
        <td><input type="checkbox" id="ua-${u.id}" ${u.is_active ? 'checked' : ''}></td>
        <td><input class="input" id="up-${u.id}" type="password" placeholder="اتركها فارغة" style="direction:ltr"></td>
        <td><button class="btn sm primary" data-act="saveUser" data-id="${u.id}">حفظ</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>+ إضافة مستخدم</h3>
        <div class="field"><label>اسم المستخدم (إنجليزي صغير)</label><input class="input" id="nu-user" style="direction:ltr" autocapitalize="none"></div>
        <div class="field" style="margin-top:8px"><label>الاسم الظاهر</label><input class="input" id="nu-name"></div>
        <div class="field" style="margin-top:8px"><label>كلمة السر (8+ حروف وأرقام)</label><input class="input" id="nu-pass" type="password" style="direction:ltr"></div>
        <div class="field" style="margin-top:8px"><label>الدور</label>${roleSel('nu-role', 'SALES')}</div>
        <div class="field" style="margin-top:8px"><label>الفرع</label><select class="input" id="nu-br"><option value="">—</option>${S().branches.map((b) => opt(b.id, '', b.name)).join('')}</select></div>
        <div class="field" style="margin-top:8px"><label>ربط بسجل مندوب/وكيل (لدور المندوب)</label>${agentSel('nu-agent', '')}</div>
        <button class="btn primary" style="margin-top:12px" data-act="addUser">إضافة للشركة الحالية</button>
        <div class="small muted" style="margin-top:12px">${ROLES.map((r) => `<div><b>${esc(App.ROLE_LABEL[r])}:</b> ${esc(HINT[r])}</div>`).join('')}</div></div>
    </div>`;
  };
  App.actions.addUser = async () => {
    try {
      await App.api('POST', 'api/users', { username: App.val('nu-user'), display_name: App.val('nu-name'), password: App.val('nu-pass'), role: App.val('nu-role'),
        company_id: App.companyId, branch_id: App.val('nu-br') || null, agent_ref: App.val('nu-agent') || null });
      App.toast('✅ تمت إضافة المستخدم'); loadUsers();
    } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.saveUser = async (d) => {
    const id = d.id, body = { display_name: App.val('un-' + id), role: App.val('ur-' + id), is_active: App.val('ua-' + id), branch_id: App.val('ub-' + id) || null, agent_ref: App.val('ua2-' + id) || null };
    if (App.me.role === 'OWNER') body.company_id = App.val('uc-' + id) || null;
    const pw = App.val('up-' + id); if (pw) body.password = pw;
    try { await App.api('PATCH', 'api/users/' + id, body); App.toast('✅ تم الحفظ'); loadUsers(); } catch (e) { App.toast(e.message, 'err'); }
  };

  // ============================================================ backup / versions / wipe / companies
  let versions = null;
  async function loadVersions() { try { versions = await App.api('GET', 'api/versions'); } catch (e) { versions = []; } if (App.ui.page === 'backup') App.render(); }
  App.pages.backup = () => {
    if (!App.online) return `${needOnline('💾 النسخ الاحتياطي')}<div class="card" style="margin-top:14px"><button class="btn" data-act="offlineExport">⬇️ تنزيل بيانات نسخة العرض</button></div>`;
    if (!versions) { loadVersions(); return '<div class="card muted">جارِ التحميل…</div>'; }
    const owner = App.me.role === 'OWNER';
    return `<div class="page-head"><div><h2>💾 النسخ الاحتياطي والإصدارات</h2><p>كل حفظ يحتفظ بالنسخة السابقة · نسخة يومية تلقائية على السيرفر · نسخة كاملة للفلاشة بضغطة</p></div></div>
    <div class="grid g2">
      <div class="card"><h3>💽 نسخة كاملة على فلاشة</h3><p class="muted small">ملف واحد يحتوي كل الشركات والمستخدمين وكل الصور والمرفقات — احفظه على فلاشة أو جهاز آخر في مكان آمن (يحتوي بيانات حساسة).</p>
        ${owner ? `<div class="row"><a class="btn primary" href="api/backup" download>⬇️ تنزيل النسخة الكاملة الآن</a><button class="btn" data-act="restoreBackup">⬆️ استرجاع من ملف</button></div>` : '<span class="muted">من صلاحية المالك.</span>'}
        <h3 style="margin-top:16px">📸 نقطة حفظ يدوية</h3><div class="row"><input class="input" id="snap-label" placeholder="مثال: قبل إقفال رحلة شهر رجب" style="flex:1"><button class="btn" data-act="snapNow">حفظ نقطة</button></div></div>
      <div class="card"><h3>🧹 مسح البيانات (مع الاحتفاظ بنسخة)</h3><p class="muted small">يمسح كل الرحلات والحجوزات والحسابات والعملاء لهذه الشركة ويبدأ من الصفر بشجرة حسابات نظيفة — مع حفظ نسخة كاملة يمكن استرجاعها في أي وقت من قائمة الإصدارات.</p>
        ${owner ? `<div class="field"><label>للتأكيد اكتب اسم الشركة: <b>${esc(S().company.name)}</b></label><input class="input" id="wipe-confirm"></div>
        <div class="row" style="margin-top:8px"><button class="btn danger" data-act="wipeData">🧹 مسح البيانات والبدء من جديد</button><button class="btn ghost" data-act="loadDemo">تحميل بيانات تجريبية</button></div>` : '<span class="muted">من صلاحية المالك.</span>'}
        ${owner ? `<h3 style="margin-top:16px">🏢 الشركات</h3><table class="t">${App.companies.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.id === App.companyId ? '<span class="chip ok">الحالية</span>' : ''}</td></tr>`).join('')}</table>
          <div class="row" style="margin-top:8px"><input class="input" id="nc-name" placeholder="اسم الشركة الجديدة" style="flex:1"><select class="input" id="nc-country" style="width:auto">${Object.entries(Model.COUNTRIES).map(([k, v]) => opt(k, 'EG', v.ar)).join('')}</select>
          <label class="small"><input type="checkbox" id="nc-demo"> ببيانات تجريبية</label><button class="btn primary" data-act="newCompany">+ شركة</button></div>` : ''}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>🕓 سجل الإصدارات (آخر 100)</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>الإصدار</th><th>التاريخ</th><th>بواسطة</th><th>النوع</th><th>الحجم</th><th></th></tr></thead><tbody>
      ${versions.map((v) => `<tr><td class="num">${v.id}</td><td class="num">v${v.version}</td><td class="num">${esc(v.saved_at)}</td><td>${esc(v.saved_by || '')}</td><td>${v.label ? `<span class="chip gold">📌 ${esc(v.label)}</span>` : 'حفظ تلقائي'}</td><td class="num">${Math.round(v.size / 1024)} KB</td>
        <td>${owner ? `<button class="btn sm ghost" data-act="restoreVersion" data-id="${v.id}">استرجاع</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  };
  App.actions.snapNow = async () => { try { await App.api('POST', 'api/versions/snapshot', { label: App.val('snap-label') || 'نقطة حفظ يدوية' }); App.toast('📌 تم حفظ النقطة'); versions = null; App.render(); } catch (e) { App.toast(e.message, 'err'); } };
  App.actions.restoreVersion = async (d) => {
    if (!confirm('استرجاع هذه النسخة؟ ستُحفظ النسخة الحالية أولاً ويمكن الرجوع لها.')) return;
    try { await App.api('POST', `api/versions/${d.id}/restore`, {}); versions = null; await App.reloadState(); App.toast('✅ تم الاسترجاع'); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.wipeData = async () => {
    if (!confirm('تأكيد نهائي: مسح كل بيانات الشركة والبدء من الصفر (مع حفظ نسخة)؟')) return;
    try { await App.api('POST', 'api/state/wipe', { confirm: App.val('wipe-confirm') }); versions = null; await App.reloadState(); App.toast('🧹 تم المسح — النسخة القديمة محفوظة في الإصدارات'); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.loadDemo = async () => {
    if (!confirm('استبدال بيانات الشركة الحالية ببيانات تجريبية؟ (تُحفظ نسخة قبلها)')) return;
    try { await App.api('POST', 'api/state/demo', {}); versions = null; await App.reloadState(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.newCompany = async () => {
    try {
      const c = await App.api('POST', 'api/companies', { name: App.val('nc-name'), country: App.val('nc-country'), demo: App.val('nc-demo') });
      App.companies = await App.api('GET', 'api/companies'); App.toast(`✅ تم إنشاء ${c.name} — اخترها من أعلى الشاشة`); App.render();
    } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.restoreBackup = async () => {
    const [f] = await App.pickFiles({ accept: '.json,application/json' });
    if (!f) return;
    if (!confirm(`استرجاع النسخة "${f.name}" سيستبدل كل بيانات النظام (كل الشركات والمستخدمين). تُحفظ نسخة من الوضع الحالي على السيرفر قبلها. متابعة؟`)) return;
    try {
      const text = await f.text();
      await App.api('POST', 'api/restore', JSON.parse(text));
      App.toast('✅ تم الاسترجاع — سيُعاد تحميل البرنامج'); setTimeout(() => location.reload(), 1200);
    } catch (e) { App.toast(e.message || 'ملف غير صالح', 'err'); }
  };
  App.actions.offlineExport = () => App.download('umrah-demo-data.json', Model.serialize(S()), 'application/json');
})();
