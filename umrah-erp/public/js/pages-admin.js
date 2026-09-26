/* Umrah ERP — Administration: company, branches & taxes · users & roles · backup, versions, wipe, companies */
(function () {
  'use strict';
  const App = window.App, E = App.E, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const needOnline = (t) => `<div class="card empty-state"><h3>${t}</h3><p class="muted">متاح في النسخة الأونلاين (السيرفر).</p></div>`;

  // ============================================================ company / branches / taxes
  App.pages.settings = () => {
    const s = S(), c = s.company, P = Model.COUNTRIES[c.country] || Model.COUNTRIES.OTHER;
    const dom = (list, act, extra = '') => Object.entries(Model.DOMAINS).map(([k, d]) => `<label class="chk"><input type="checkbox" data-act-change="${act}" data-d="${k}" ${extra} ${list.includes(k) ? 'checked' : ''}> ${d.icon} ${d.ar}</label>`).join(' ');
    const chk = (path, on, label) => `<label class="chk"><input type="checkbox" data-bind="${path}" ${on ? 'checked' : ''}> ${label}</label>`;
    const num = (path, v, label, step = '0.01') => `<div class="field"><label>${label}</label><input class="input" type="number" step="${step}" data-bind="${path}" value="${esc(v ?? 0)}"></div>`;
    const txt = (path, v, label, ltr) => `<div class="field"><label>${label}</label><input class="input" data-bind="${path}" value="${esc(v || '')}" ${ltr ? 'style="direction:ltr"' : ''}></div>`;
    const emps = s.employees.filter((e) => (e.status || 'ACTIVE') !== 'TERMINATED');
    return `<div class="page-head"><div><h2>🏢 الشركة والفروع والضرائب</h2><p>بيانات الشركة تظهر في كل المطبوعات (وثيقة الحجز، السندات، الكشوف) · الضرائب والعملة حسب دولة الشركة · كل فرع يحدد مجالات عمله</p></div></div>
    <div class="grid g2">
      <div class="card"><h3>📜 البيانات القانونية والترخيص</h3><div class="grid g2">
        ${txt('company.name', c.name, 'الاسم التجاري (يظهر في البرنامج)')}${txt('company.legalName', c.legalName, 'الاسم القانوني (في العقود)')}
        <div class="field"><label>دولة التشغيل</label><select class="input" data-bind="company.country" data-after="countryChanged">${Object.entries(Model.COUNTRIES).map(([k, v]) => opt(k, c.country, v.ar)).join('')}</select></div>
        <div class="field"><label>العملة المحلية · مفتاح الدولة</label><input class="input" readonly value="${esc(c.currency || P.currency)} · +${esc(c.dial || P.dial)}"></div>
        ${txt('company.commercialNo', c.commercialNo, 'السجل التجاري', 1)}${txt('company.taxNo', c.taxNo, 'الرقم الضريبي / البطاقة الضريبية', 1)}
        ${txt('company.licenseNo', c.licenseNo, 'رقم ترخيص السياحة', 1)}${txt('company.licenseCategory', c.licenseCategory, 'فئة الترخيص (أ / ب / ج)')}
        ${txt('company.phone', c.phone, 'الهاتف', 1)}${txt('company.email', c.email, 'البريد', 1)}${txt('company.website', c.website, 'الموقع الإلكتروني', 1)}
        <div class="field" style="grid-column:1/-1"><label>العنوان</label><input class="input" data-bind="company.address" value="${esc(c.address)}"></div></div>
        ${P.regulator ? `<div class="alert info small" style="margin-top:8px">🏛️ الجهة المنظمة: ${esc(P.regulator)}${P.umrahAuth ? ` · العمرة: ${esc(P.umrahAuth)}` : ''}</div>` : ''}</div>
      <div class="stack">
        <div class="card"><h3>🧭 مجالات عمل الشركة</h3><div class="row" style="gap:18px">${dom(c.domains, 'companyDomain')}</div>
          <div class="small muted" style="margin-top:6px">كل مجال يظهر كتبويب مستقل في القائمة الجانبية بشاشاته الخاصة. العمرة: رحلات بتسكين مكة/المدينة والتأشيرات. السياحة الداخلية: برامج المصايف والمشاتي، حجز الفنادق والقرى، رحلات اليوم الواحد، الفنادق العائمة والرحلات الاختيارية.</div></div>
        <div class="card"><h3>🧾 الضرائب — ${esc(P.ar)}</h3>
          <div class="tax-row">${chk('company.vatEnabled', c.vatEnabled, '<b>ضريبة القيمة المضافة</b> على المبيعات (السعر شامل الضريبة)')}${num('company.vatRate', c.vatRate, 'النسبة %', '0.5')}</div>
          <div class="tax-row">${chk('company.whtEnabled', c.whtEnabled, '<b>ضريبة الخصم والإضافة</b> تُحجز من مدفوعات الموردين (فنادق، نقل، طيران) وتُورّد للمصلحة')}${num('company.whtRate', c.whtRate, 'النسبة %')}${num('company.whtThreshold', c.whtThreshold, 'من مبلغ', '1')}</div>
          <div class="tax-row">${chk('company.stampEnabled', c.stampEnabled, '<b>ضريبة الدمغة</b> على الفواتير (ضمن السعر)')}${num('company.stampRate', c.stampRate, 'النسبة %', '0.001')}</div>
          <div class="tax-row">${chk('company.incomeTaxEnabled', c.incomeTaxEnabled, `<b>${esc(c.incomeTaxLabel || 'ضريبة الدخل')}</b> — تقدير في قائمة الدخل فقط`)}${num('company.incomeTaxRate', c.incomeTaxRate, 'النسبة %', '0.5')}${txt('company.incomeTaxLabel', c.incomeTaxLabel, 'المسمى')}</div>
          <div class="alert info small" style="margin-top:8px">القيد الآلي: القيمة المضافة ← 2102 · الدمغة ← 2106 · الخصم والإضافة المحجوز ← 2105 · ما يخصمه العملاء منك ← 1108 · الدخل/الزكاة الفعلية ← 2107. النسب الافتراضية تتغير مع الدولة — راجع محاسبك في المعاملة الضريبية لنشاط السياحة (خاصة العمرة للمقيمين بالخارج).</div></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📄 شروط وأحكام وثيقة الحجز</h3><textarea class="input" rows="7" data-bind="company.terms" placeholder="سياسة الإلغاء والاسترداد، مواعيد السداد، المستندات المطلوبة…">${esc(c.terms || '')}</textarea>
        <div class="small muted">تُطبع في وثيقة الحجز التي يستلمها العميل. اتركها فارغة لاستخدام الشروط الافتراضية.</div></div>
      ${App.waSettingsCard && ['OWNER', 'MANAGER'].includes(App.role()) ? App.waSettingsCard() : ''}
      <div class="card"><h3>⏰ التنبيهات</h3><div class="grid g3">
        <div class="field"><label>تذكير الأقساط قبل (يوم)</label><input class="input" type="number" data-bind="settings.reminderDays" value="${s.settings.reminderDays}"></div>
        <div class="field"><label>تنبيه انتهاء التعليق قبل (ساعة)</label><input class="input" type="number" data-bind="settings.holdAlertHours" value="${s.settings.holdAlertHours}"></div>
        <div class="field"><label>تنبيه ملفات الرحلة قبل السفر (يوم)</label><input class="input" type="number" data-bind="settings.docsAlertDays" value="${s.settings.docsAlertDays}"></div></div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">🏬 الفروع ومجالات عملها</h3><span class="spacer"></span><button class="btn sm primary" data-act="branchAdd">+ فرع</button></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>الكود</th><th>الاسم</th><th>المدينة</th><th>الهاتف</th><th>المجالات</th><th>مدير الفرع</th><th>الخزائن</th><th>الرحلات</th><th>نشط</th></tr></thead><tbody>
      ${s.branches.map((b, i) => `<tr><td class="num">${esc(b.code)}</td><td><input class="input sm" data-bind="branches.${i}.name" value="${esc(b.name)}"></td><td><input class="input sm" data-bind="branches.${i}.city" value="${esc(b.city || '')}"></td>
        <td><input class="input sm" style="direction:ltr;width:130px" data-bind="branches.${i}.phone" value="${esc(b.phone || '')}"></td>
        <td style="white-space:nowrap">${Object.entries(Model.DOMAINS).filter(([k]) => c.domains.includes(k)).map(([k, d]) => `<label class="chk"><input type="checkbox" data-act-change="branchDomain" data-i="${i}" data-d="${k}" ${(b.domains || []).includes(k) ? 'checked' : ''}> ${d.icon} ${d.ar}</label>`).join('<br>')}</td>
        <td><select class="input sm" data-bind="branches.${i}.managerEmpId">${opt('', b.managerEmpId, '—')}${emps.map((e) => opt(e.id, b.managerEmpId, e.name)).join('')}</select></td>
        <td class="small">${s.cashboxes.filter((c2) => c2.branchId === b.id).map((c2) => esc(c2.name)).join('، ') || '—'}</td>
        <td class="num">${s.trips.filter((d) => d.trip.branchId === b.id).length}</td>
        <td><input type="checkbox" data-bind="branches.${i}.active" ${b.active !== false ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">كل فرع يرى ويبيع رحلات المجالات المفعّلة له فقط، والمستخدم المربوط بفرع يعمل على فرعه (المستخدمون والصلاحيات).</div></div>`;
  };
  App.actions.countryChanged = () => { const c = S().company; Model.applyCountry(c, c.country); App.render(); };
  App.actions.companyDomain = (d, el) => {
    const s = S(), c = s.company;
    c.domains = el.checked ? [...new Set([...c.domains, d.d])] : c.domains.filter((x) => x !== d.d);
    if (!c.domains.length) { c.domains = [d.d]; App.toast('لازم مجال واحد على الأقل', 'err'); }
    for (const b of s.branches) b.domains = (b.domains || []).filter((x) => c.domains.includes(x));
    if (el.checked) for (const b of s.branches) if (!b.domains.length) b.domains = [d.d];
    App.audit(`مجالات الشركة: ${c.domains.map((x) => Model.DOMAINS[x].ar).join('، ')}`); App.save(); App.render();
  };
  App.actions.branchDomain = (d, el) => {
    const b = S().branches[Number(d.i)];
    b.domains = el.checked ? [...new Set([...(b.domains || []), d.d])] : (b.domains || []).filter((x) => x !== d.d);
    App.save(); App.render();
  };
  App.actions.branchAdd = () => {
    const name = prompt('اسم الفرع:'); if (!name) return;
    const s = S(), n = s.branches.length + 1;
    s.branches.push({ id: 'BR' + Date.now().toString(36), code: 'BR-' + String(n).padStart(2, '0'), name: name.trim(), city: '', phone: '', address: '', domains: s.company.domains.slice(), managerEmpId: null, active: true });
    App.audit(`إضافة فرع ${name}`); App.save(); App.render();
  };

  // ============================================================ companies & their line of business
  const actChips = (ds) => (ds || ['UMRAH']).map((d) => `<span class="chip ${d === 'UMRAH' ? 'gold' : d === 'HAJJ' ? 'hold' : 'ok'}">${Model.DOMAINS[d].icon} ${Model.DOMAINS[d].ar}</span>`).join(' ');
  App.pages.companies = () => {
    if (!App.online) return needOnline('🏢 الشركات وأنشطتها');
    const nc = App.ui.nc || (App.ui.nc = { domains: ['UMRAH'], country: 'EG' });
    const choice = (k, desc) => `<button class="act-card ${nc.domains.includes(k) ? 'on' : ''}" data-act="ncAct" data-k="${k}"><span class="ic">${Model.DOMAINS[k].icon}</span><b>${nc.domains.includes(k) ? '✓ ' : ''}${Model.DOMAINS[k].ar}</b><small>${desc}</small></button>`;
    return `<div class="page-head"><div><h2>🏢 الشركات وأنشطتها</h2><p>كل شركة لها نشاطها: <b>عمرة</b> و/أو <b>حج</b> و/أو <b>سياحة داخلية</b> — والنشاط يحدد التبويبات والشاشات اللي تظهر، وكل فرع داخل الشركة يختار نشاطه من "الشركة والفروع والضرائب"</p></div></div>
    <div class="emp-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${App.companies.map((c) => `<div class="card ${c.id === App.companyId ? 'co-current' : ''}">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(c.name)}</h3>${c.id === App.companyId ? '<span class="chip ok">المفتوحة الآن</span>' : ''}</div>
      <div style="margin:8px 0">${actChips(c.domains)}</div>
      <div class="small muted">${esc((Model.COUNTRIES[c.country] || {}).ar || '')} · ${c.branches || 0} فرع · ${c.domains && c.domains.includes('UMRAH') ? `${c.trips || 0} رحلة عمرة · ` : ''}${c.domains && c.domains.includes('HAJJ') ? `${c.hajj || 0} برنامج حج · ` : ''}${c.domains && c.domains.includes('DOMESTIC') ? `${c.programs || 0} برنامج داخلي · ` : ''}${c.users || 0} مستخدم</div>
      <div class="row" style="gap:6px;margin-top:10px">${c.id === App.companyId ? '<button class="btn sm" data-act="go" data-page="settings">⚙️ تعديل النشاط والبيانات</button>' : `<button class="btn sm primary" data-act="openCompany" data-id="${c.id}">فتح الشركة</button>`}</div></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><h3>➕ شركة جديدة</h3>
      <div class="grid g2"><div class="field"><label>اسم الشركة</label><input class="input" id="nc-name" placeholder="مثال: النور للسياحة"></div>
        <div class="field"><label>دولة التشغيل (تحدد العملة والضرائب)</label><select class="input" id="nc-country">${Object.entries(Model.COUNTRIES).map(([k, v]) => opt(k, nc.country, v.ar)).join('')}</select></div></div>
      <div class="field" style="margin-top:10px"><label>نشاط الشركة (اختار واحد أو أكثر — كل نشاط تبويب مستقل)</label><div class="act-grid">
        ${choice('UMRAH', 'رحلات العمرة: التكلفة بالريال، فنادق مكة والمدينة، التسكين، التأشيرات، الباص')}
        ${choice('HAJJ', 'مواسم الحج: الحصة والتأشيرات، البرامج وكشف التكلفة، الحجاج والأهلية، التفويج والمشاعر، الإيراد المؤجل')}
        ${choice('DOMESTIC', 'مصايف ومشاتي، رحلات اليوم الواحد، حجز فنادق وقرى، فنادق عائمة')}</div></div>
      <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" id="nc-demo"> ببيانات تجريبية للتجربة</label><span class="spacer"></span><button class="btn primary" data-act="newCompany">إنشاء الشركة</button></div></div>`;
  };
  App.actions.ncAct = (d) => { const nc = App.ui.nc; nc.domains = nc.domains.includes(d.k) ? nc.domains.filter((x) => x !== d.k) : [...nc.domains, d.k]; if (!nc.domains.length) nc.domains = [d.k]; App.ui.nc.country = App.val('nc-country') || App.ui.nc.country; const n = App.val('nc-name'); App.render(); const el = document.getElementById('nc-name'); if (el) el.value = n || ''; };
  App.actions.openCompany = (d) => App.actions.switchCompany({ value: d.id });

  // ============================================================ users
  const ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS', 'AGENT', 'SUPERVISOR', 'HOUSING'];
  const HINT = { OWNER: 'كل الشركات والصلاحيات + النسخ الاحتياطي + وحده يعتمد أي خصم على أي سعر', MANAGER: 'كل شيء في شركته + اعتماد السندات + المستخدمين (الخصومات للمالك فقط)', ACCOUNTANT: 'الحسابات والسندات والاعتماد والتقارير',
    HR: 'الموارد البشرية: الحضور والإجازات والتقييم والمهام والجزاءات وإعداد الرواتب', HEAD: 'مبيعات وإدارة فريق (الخصم يُرفع للمالك)', SALES: 'حجوزات بدون خصم + رفع دفعات للمراجعة', OPERATIONS: 'التسكين والباص والجوازات والكشوف', AGENT: 'بوابة خاصة: حسابه + حجوزاته + رفع دفعات بالصور',
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
          <div class="row" style="margin-top:8px"><button class="btn primary" data-act="go" data-page="companies">🏢 إدارة الشركات وإنشاء شركة جديدة</button></div>` : ''}</div>
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
    const name = String(App.val('nc-name') || '').trim();
    if (name.length < 2) return App.toast('اكتب اسم الشركة', 'err');
    const domains = App.ui.nc ? Object.keys(Model.DOMAINS).filter((k) => App.ui.nc.domains.includes(k)) : ['UMRAH'];
    try {
      const c = await App.api('POST', 'api/companies', { name, country: App.val('nc-country'), demo: App.val('nc-demo'), domains: domains.length ? domains : ['UMRAH'] });
      App.companies = await App.api('GET', 'api/companies'); App.toast(`✅ تم إنشاء ${c.name}`);
      if (confirm(`فتح ${c.name} الآن؟`)) return App.actions.switchCompany({ value: c.id });
      App.render();
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
