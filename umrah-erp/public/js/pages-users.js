/* أفواج — Users & permissions (cards by group, 360° user file linked to HR employee file & agent record),
 * approvals (join requests from the marketing link, profile edits, agents' held bookings) and the marketing link. */
(function () {
  'use strict';
  const App = window.App, E = App.E, Model = App.Model, Hr = window.Hr, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const needOnline = (t) => `<div class="card empty-state"><h3>${t}</h3><p class="muted">متاح في النسخة الأونلاين (السيرفر).</p></div>`;

  const ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS', 'AGENT', 'SUPERVISOR', 'HOUSING'];
  const HINT = { OWNER: 'كل الشركات والصلاحيات + النسخ الاحتياطي + وحده يعتمد أي خصم على أي سعر', MANAGER: 'إدارة التشغيل: كل شيء في شركته + اعتماد السندات + المستخدمين + قبول طلبات العمل وحجوزات المناديب (الخصومات للمالك فقط)',
    ACCOUNTANT: 'الحسابات والسندات والاعتماد والتقارير', HR: 'الموارد البشرية: الحضور والإجازات والتقييم والمهام والجزاءات وإعداد الرواتب', HEAD: 'مبيعات وإدارة فريق (الخصم يُرفع للمالك)',
    SALES: 'حجوزات بدون خصم + رفع دفعات للمراجعة', OPERATIONS: 'التسكين والباص والجوازات والكشوف', AGENT: 'بوابة خاصة: حسابه + حجوزاته (معلقة لحين الموافقة) + رفع دفعات بالصور',
    SUPERVISOR: 'بوابة خاصة: كشف المشرف لرحلاته', HOUSING: 'بوابة خاصة: كشف مندوب التسكين لرحلاته' };
  /** The "right division": who runs the company · who works in the office · who works in the field · who sells from outside. */
  const GROUPS = {
    MGMT: { ar: 'الإدارة', icon: '👑', roles: ['OWNER', 'MANAGER'] },
    OFFICE: { ar: 'فريق المكتب', icon: '🏢', roles: ['ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS'] },
    FIELD: { ar: 'الميدان', icon: '🧭', roles: ['SUPERVISOR', 'HOUSING'] },
    AGENTS: { ar: 'المناديب والوكلاء', icon: '🤝', roles: ['AGENT'] },
  };
  const groupOf = (role) => Object.keys(GROUPS).find((g) => GROUPS[g].roles.includes(role)) || 'OFFICE';
  const canManage = () => ['OWNER', 'MANAGER'].includes(App.role());
  const APPROVAL = { PENDING: ['hold', '🆕 طلب عمل جديد'], CHANGED: ['hold', '✏️ عدّل بياناته — الدخول متوقف'], REJECTED: ['danger', 'مرفوض'] };

  let users = null, pending = null, link = null;
  async function loadUsers(force) {
    if (users && !force) return;
    try { users = await App.api('GET', 'api/users'); } catch (e) { users = []; App.toast(e.message, 'err'); }
    if (['users', 'userView'].includes(App.ui.page)) App.render();
  }
  async function loadPending() {
    try { pending = await App.api('GET', 'api/approvals'); } catch (e) { pending = []; }
    if (['users', 'approvals'].includes(App.ui.page)) App.render();
  }
  App.pendingCount = () => (pending || []).length;
  const empOf = (u) => S().employees.find((e) => (e.userId && Number(e.userId) === u.id) || (e.staffIds || []).includes('SU' + u.id));
  const agentOf = (u) => u.agent_ref && S().agents.find((a) => a.id === u.agent_ref);
  const branchName = (id) => (S().branches.find((b) => b.id === id) || {}).name || '';
  const companyName = (id) => (App.companies.find((c) => c.id === id) || {}).name || (id ? '#' + id : 'كل الشركات');
  const since = (t) => { if (!t) return 'لم يدخل بعد'; const d = new Date(t.replace(' ', 'T') + (t.includes('Z') ? '' : 'Z')); const m = Math.round((Date.now() - d) / 60000);
    return m < 60 ? `منذ ${Math.max(1, m)} دقيقة` : m < 1440 ? `منذ ${Math.round(m / 60)} ساعة` : `منذ ${Math.round(m / 1440)} يوم`; };
  const roleSel = (id, cur) => `<select class="input" id="${id}">${ROLES.filter((r) => App.me.role === 'OWNER' || !['OWNER', 'MANAGER'].includes(r)).map((r) => opt(r, cur, App.ROLE_LABEL[r])).join('')}</select>`;
  const agentSel = (id, cur) => `<select class="input" id="${id}"><option value="">—</option>${S().agents.map((a) => opt(a.id, cur, `${a.code} · ${a.name}`)).join('')}</select>`;
  const avatar = (u, lg) => { const e = empOf(u); return e && e.photoFileId ? `<img class="avatar ${lg ? 'lg' : ''}" src="${App.fileUrl(e.photoFileId)}" alt="">` : `<span class="avatar ph g-${groupOf(u.role)} ${lg ? 'lg' : ''}">${esc((u.display_name || '?').trim().slice(0, 1))}</span>`; };

  // ============================================================ list
  App.pages.users = () => {
    if (!App.online) return needOnline('👥 المستخدمون والصلاحيات');
    if (!users) { loadUsers(); loadPending(); return '<div class="card muted">جارِ التحميل…</div>'; }
    const list = users.filter((u) => !['PENDING', 'REJECTED'].includes(u.approval));
    const tab = App.ui.usrTab || 'ALL', q = String(App.ui.usrQ || '').trim().toLowerCase();
    const cnt = (g) => list.filter((u) => groupOf(u.role) === g).length;
    const shown = list.filter((u) => (tab === 'ALL' || (tab === 'OFF' ? !u.is_active : groupOf(u.role) === tab && u.is_active)))
      .filter((u) => !q || [u.display_name, u.username, u.phone, u.email, App.ROLE_LABEL[u.role]].join(' ').toLowerCase().includes(q));
    const nPend = (pending || []).length;
    return `<div class="page-head"><div><h2>👥 المستخدمون والصلاحيات</h2><p>كل حساب دخول مربوط بملفه: الموظف بملف الموارد البشرية، والمندوب بسجل الوكيل — اضغط على أي شخص لمراجعة كل بياناته</p></div>
      <div class="row">${canManage() ? `<button class="btn ${nPend ? 'gold' : ''}" data-act="go" data-page="approvals">📥 طلبات بانتظار الموافقة ${nPend ? `<span class="badge-inline">${nPend}</span>` : ''}</button>` : ''}
        <button class="btn" data-act="mktLink">🔗 رابط التسويق</button><button class="btn primary" data-act="userForm">+ مستخدم</button></div></div>
    <div class="usr-stats">${Object.entries(GROUPS).map(([g, x]) => `<button class="card usr-stat ${tab === g ? 'on' : ''}" data-act="usrTab" data-t="${g}"><span>${x.icon}</span><b class="num">${cnt(g)}</b><small>${x.ar}</small></button>`).join('')}
      <button class="card usr-stat ${tab === 'OFF' ? 'on' : ''}" data-act="usrTab" data-t="OFF"><span>⛔</span><b class="num">${list.filter((u) => !u.is_active).length}</b><small>موقوف</small></button></div>
    <div class="row usr-tools"><div class="seg">${[['ALL', 'الكل'], ...Object.entries(GROUPS).map(([k, x]) => [k, x.ar]), ['OFF', 'موقوف']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="usrTab" data-t="${k}">${l}</button>`).join('')}</div>
      <input class="input" data-live="usrQ" placeholder="🔎 بحث بالاسم أو الموبايل أو الدور" value="${esc(App.ui.usrQ || '')}" style="max-width:320px"></div>
    <div data-partial="usrGrid">${App.partials.usrGrid(shown)}</div>`;
  };
  App.partials.usrGrid = (pre) => {
    let shown = pre;
    if (!shown) { const tab = App.ui.usrTab || 'ALL', q = String(App.ui.usrQ || '').trim().toLowerCase();
      shown = users.filter((u) => !['PENDING', 'REJECTED'].includes(u.approval)).filter((u) => (tab === 'ALL' || (tab === 'OFF' ? !u.is_active : groupOf(u.role) === tab && u.is_active)))
        .filter((u) => !q || [u.display_name, u.username, u.phone, u.email, App.ROLE_LABEL[u.role]].join(' ').toLowerCase().includes(q)); }
    const byGroup = Object.keys(GROUPS).map((g) => [g, shown.filter((u) => groupOf(u.role) === g)]).filter(([, l]) => l.length);
    return byGroup.map(([g, l]) => `<h3 class="usr-group">${GROUPS[g].icon} ${GROUPS[g].ar} <span class="sub">${l.length}</span></h3><div class="emp-grid">${l.map(card).join('')}</div>`).join('') || '<div class="card muted">لا نتائج.</div>';
  };
  function card(u) {
    const e = empOf(u), a = agentOf(u), appr = APPROVAL[u.approval];
    return `<div class="card emp-card clickable usr-card ${u.is_active ? '' : 'off'}" data-act="go" data-page="userView" data-id="${u.id}">
      <div class="emp-top">${avatar(u)}<div style="min-width:0"><b>${esc(u.display_name)}</b><div class="small muted num" style="direction:ltr;text-align:right">${esc(u.username)}</div>
        <div class="row" style="gap:4px;margin-top:4px"><span class="chip">${esc(App.ROLE_LABEL[u.role] || u.role)}</span>${u.branch_id ? `<span class="chip">${esc(branchName(u.branch_id))}</span>` : ''}</div></div></div>
      <div class="usr-links small">${u.role === 'AGENT' ? (a ? `🤝 ${esc(a.code)} · رصيد ${h.cur(a.balance, a.currency)}` : '<span class="chip danger">غير مربوط بسجل مندوب</span>')
        : e ? `🗂️ ${esc(e.code)} · ${esc(e.job || '')}` : u.role === 'OWNER' ? '' : '<span class="chip hold">بدون ملف موظف</span>'}</div>
      <div class="row small muted" style="justify-content:space-between;margin-top:6px"><span>${u.is_active ? '<span class="dot ok"></span> نشط' : '<span class="dot danger"></span> موقوف'}</span><span>🕘 ${since(u.last_login)}</span></div>
      ${appr ? `<div class="chip ${appr[0]}" style="margin-top:6px">${appr[1]}</div>` : ''}</div>`;
  }
  App.actions.usrTab = (d) => { App.ui.usrTab = d.t; App.render(); };

  // ============================================================ 360° user file
  App.pages.userView = () => {
    if (!App.online) return needOnline('👤 ملف المستخدم');
    if (!users) { loadUsers(); return '<div class="card muted">جارِ التحميل…</div>'; }
    const u = users.find((x) => x.id === Number(App.ui.viewId));
    if (!u) return '<div class="card">المستخدم غير موجود. <button class="btn sm" data-act="go" data-page="users">رجوع</button></div>';
    const s = S(), e = empOf(u), a = agentOf(u), id = u.id, own = App.me.role === 'OWNER';
    const lockMgmt = !own && ['OWNER', 'MANAGER'].includes(u.role);
    const acts = s.audit.filter((x) => x.by === u.display_name || (e && [e.name, ...(e.aliases || [])].includes(x.by))).slice(0, 25);
    return `<div class="page-head"><div class="emp-top">${avatar(u, true)}<div><h2>${esc(u.display_name)}</h2>
        <p>${esc(App.ROLE_LABEL[u.role])} · ${esc(GROUPS[groupOf(u.role)].ar)}${u.branch_id ? ' · ' + esc(branchName(u.branch_id)) : ''} · ${u.is_active ? '🟢 نشط' : '⛔ موقوف'} · آخر دخول: ${since(u.last_login)}</p></div></div>
      <div class="row"><button class="btn" data-act="go" data-page="users">→ كل المستخدمين</button>${e ? `<button class="btn primary" data-act="go" data-page="hrEmployee" data-id="${e.id}">🗂️ ملف الموظف الكامل</button>` : ''}
        ${a ? `<button class="btn" data-act="go" data-page="partyView" data-ptype="agent" data-id="${a.id}">📄 كشف حساب المندوب</button>` : ''}${App.chatDirect && u.id !== App.me.id ? `<button class="btn" data-act="usrMsg" data-u="${u.id}">💬 رسالة</button>` : ''}</div></div>
    ${u.approval === 'CHANGED' ? `<div class="alert warn" style="margin-bottom:12px">✏️ عدّل بياناته وينتظر الموافقة — <button class="btn sm gold" data-act="go" data-page="approvals">مراجعة التعديل</button></div>` : ''}
    <div class="grid g-side">
      <div class="card"><h3>🔐 الحساب والصلاحية</h3>${lockMgmt ? '<div class="alert info">حسابات المالك والمديرين يعدلها المالك فقط.</div>' : ''}
        <div class="grid g2">
          <div class="field"><label>الاسم الظاهر</label><input class="input" id="un-${id}" value="${esc(u.display_name)}" ${lockMgmt ? 'disabled' : ''}></div>
          <div class="field"><label>اسم المستخدم</label><div class="input num" style="direction:ltr">${esc(u.username)}</div></div>
          <div class="field"><label>الموبايل</label><input class="input" id="uph-${id}" value="${esc(u.phone || '')}" style="direction:ltr" ${lockMgmt ? 'disabled' : ''}></div>
          <div class="field"><label>البريد الإلكتروني</label><input class="input" id="uem-${id}" value="${esc(u.email || '')}" style="direction:ltr" ${lockMgmt ? 'disabled' : ''}></div>
          <div class="field"><label>الدور</label>${lockMgmt ? `<div class="input">${esc(App.ROLE_LABEL[u.role])}</div>` : roleSel('ur-' + id, u.role)}</div>
          <div class="field"><label>الفرع</label><select class="input" id="ub-${id}" ${lockMgmt ? 'disabled' : ''}><option value="">—</option>${s.branches.map((b) => opt(b.id, u.branch_id, b.name)).join('')}</select></div>
          ${own ? `<div class="field"><label>الشركة</label><select class="input" id="uc-${id}"><option value="">كل الشركات (مالك)</option>${App.companies.map((c) => opt(c.id, u.company_id, c.name)).join('')}</select></div>` : `<div class="field"><label>الشركة</label><div class="input">${esc(companyName(u.company_id))}</div></div>`}
          <div class="field"><label>سجل المندوب/الوكيل</label>${agentSel('ua2-' + id, u.agent_ref)}</div>
          <div class="field"><label>كلمة سر جديدة</label><input class="input" id="up-${id}" type="password" placeholder="اتركها فارغة" autocomplete="new-password" style="direction:ltr" ${lockMgmt ? 'disabled' : ''}></div>
          <label class="chk" style="align-self:end"><input type="checkbox" id="ua-${id}" ${u.is_active ? 'checked' : ''} ${lockMgmt ? 'disabled' : ''}> الحساب نشط</label></div>
        <div class="small muted" style="margin-top:6px">${esc(HINT[u.role] || '')}</div>
        <div class="small muted">تغيير الدور أو كلمة السر أو الإيقاف يُخرج المستخدم من كل الأجهزة فوراً.</div>
        ${lockMgmt ? '' : `<button class="btn primary" style="margin-top:10px" data-act="saveUser" data-id="${id}">💾 حفظ الحساب</button>`}</div>
      <div class="stack">
        ${u.role === 'AGENT' ? agentBox(u, a) : empBox(u, e)}
        ${Object.keys(u.profile || {}).length ? `<div class="card"><h3>📝 بيانات التسجيل</h3><table class="t small"><tbody>${profileRows(u.profile)}</tbody></table>${u.signup_at ? `<div class="small muted">سجّل من رابط التسويق ${esc(u.signup_at)}</div>` : ''}</div>` : ''}
        <div class="card"><h3>🕘 الدخول</h3><table class="t small"><tbody><tr><td>آخر دخول</td><td>${esc(u.last_login || '—')}</td></tr><tr><td>تاريخ إنشاء الحساب</td><td>${esc(u.created_at || '—')}</td></tr></tbody></table></div>
      </div></div>
    <div class="card" style="margin-top:14px"><h3>🕵️ آخر ما فعله في النظام</h3><div class="small" style="max-height:280px;overflow:auto">${acts.map((x) => `<div class="task-row"><span>${esc(x.msg)}</span><span class="faint num">${h.dt(x.at)}</span></div>`).join('') || '<span class="muted">لا نشاط مسجل.</span>'}</div></div>`;
  };
  const PROFILE_LBL = { city: 'المحافظة/المدينة', nid: 'الرقم القومي', office: 'المكتب/الشركة', whatsapp: 'واتساب', address: 'العنوان', experience: 'الخبرة', expectedPax: 'عدد العملاء المتوقع شهرياً', domains: 'يهتم بـ', notes: 'ملاحظات', rejectReason: 'سبب الرفض' };
  const profileRows = (p) => Object.entries(p).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<tr><td>${esc(PROFILE_LBL[k] || k)}</td><td>${esc(Array.isArray(v) ? v.map((x) => (Model.DOMAINS[x] || {}).ar || x).join('، ') : v)}</td></tr>`).join('');
  function empBox(u, e) {
    const s = S();
    if (u.role === 'OWNER' && !e) return '';
    if (!e) {
      const free = s.employees.filter((x) => !x.userId && (x.status || 'ACTIVE') !== 'TERMINATED');
      return `<div class="card"><h3>🗂️ ملف الموظف (الموارد البشرية)</h3><div class="alert warn">الحساب غير مربوط بملف موظف — لن يُحسب حضوره ولا تقييمه ولا راتبه.</div>
        <div class="row" style="margin-top:8px">${free.length ? `<select class="input" id="ul-emp">${free.map((x) => opt(x.id, '', `${x.code} · ${x.name}`)).join('')}</select><button class="btn" data-act="usrLinkEmp" data-id="${u.id}">🔗 ربط بملف موجود</button>` : ''}
          <button class="btn primary" data-act="usrNewEmp" data-id="${u.id}">+ إنشاء ملف موظف له</button></div></div>`;
    }
    const today = Hr.localNow(s.company.country).date, p = today.slice(0, 7), sc = Hr.score(s, e, p, today), bal = Hr.leaveBalance(s, e.id, today.slice(0, 4)), at = sc.attendance, t = sc.kpis.target;
    const dept = (s.hr.departments.find((d) => d.id === e.dept) || {}).name || '—';
    return `<div class="card"><h3>🗂️ ملف الموظف <span class="chip">${esc(e.code)}</span><span class="spacer"></span><button class="btn sm" data-act="go" data-page="hrEmployee" data-id="${e.id}">فتح الملف ←</button></h3>
      <div class="grid g3 usr-kpis"><div><div class="small muted">التقييم (${esc(p)})</div><b class="num">${Math.round(sc.total)}/100</b> <span class="small">${esc(sc.rating.ar)}</span></div>
        <div><div class="small muted">الحضور</div><b class="num">${at.present}</b> <span class="small">يوم · غياب ${at.absent} · تأخير ${at.lateCount}</span></div>
        <div><div class="small muted">التارجت</div>${t ? `<b class="num">${Math.round(t.pct || 0)}%</b>` : '<span class="muted">—</span>'}</div></div>
      <table class="t small" style="margin-top:8px"><tbody><tr><td>الوظيفة / القسم</td><td>${esc(e.job || '—')} · ${esc(dept)}</td></tr>
        <tr><td>التعيين / العقد</td><td>${esc(e.hireDate || '—')}${e.contractEnd ? ' — حتى ' + esc(e.contractEnd) : ''}</td></tr>
        ${Hr.HR_ADMINS.includes(App.role()) ? `<tr><td>الراتب + البدلات</td><td>${h.egp((e.salary || 0) + (e.allowances || 0))}</td></tr>` : ''}
        <tr><td>رصيد الإجازات</td><td>اعتيادي ${bal.ANNUAL.remaining} · عارضة ${bal.CASUAL.remaining}</td></tr>
        <tr><td>الهاتف / الرقم القومي</td><td class="num">${esc(e.phone || '—')} · ${esc(e.nid || '—')}</td></tr>
        <tr><td>المستندات</td><td>${(e.docs || []).length} مستند</td></tr></tbody></table></div>`;
  }
  function agentBox(u, a) {
    if (!a) return `<div class="card"><h3>🤝 سجل المندوب</h3><div class="alert err">الحساب غير مربوط بسجل مندوب — اختر السجل من "سجل المندوب/الوكيل" واحفظ.</div></div>`;
    const s = S(), bks = [];
    for (const d of s.trips) for (const b of d.bookings) if (b.agentId === a.id) bks.push(b);
    for (const b of s.dom.bookings) if (b.agentId === a.id) bks.push(b);
    const live = bks.filter((b) => E.LIVE_STATES.includes(b.status)), pend = bks.filter((b) => b.agentRequest && b.agentRequest.state === 'PENDING');
    const st = App.Acc.partyStatement(s, 'agent', a.id);
    return `<div class="card"><h3>🤝 سجل المندوب <span class="chip">${esc(a.code)}</span><span class="spacer"></span><button class="btn sm" data-act="go" data-page="agents">المناديب ←</button></h3>
      <div class="grid g3 usr-kpis"><div><div class="small muted">حجوزات فعالة</div><b class="num">${live.length}</b></div><div><div class="small muted">بانتظار موافقتك</div><b class="num ${pend.length ? 'hold' : ''}">${pend.length}</b></div>
        <div><div class="small muted">الرصيد المحاسبي</div><b>${h.egp(Math.abs(st.balance))}</b> <span class="small">${st.balance > 0 ? 'عليه' : st.balance < 0 ? 'له' : ''}</span></div></div>
      <table class="t small" style="margin-top:8px"><tbody><tr><td>النوع</td><td>${a.tier === 'B2B' ? `وكيل معتمد (خصم جملة ${a.netDiscountPct || 0}%)` : 'وسيط/مندوب بالعمولة'}</td></tr>
        <tr><td>الهاتف</td><td class="num">${esc(a.phone || '—')}</td></tr><tr><td>الحالة</td><td>${a.blocked ? '<span class="chip danger">موقوف</span>' : '<span class="chip ok">فعال</span>'}</td></tr></tbody></table></div>`;
  }
  App.actions.usrMsg = (d) => { App.chatDirect(Number(d.u)); App.actions.go({ page: 'chat' }); };
  App.actions.usrLinkEmp = (d) => {
    const e = S().employees.find((x) => x.id === App.val('ul-emp')); if (!e) return;
    e.userId = Number(d.id); App.audit(`ربط ملف الموظف ${e.code} بحساب دخول`); App.save(); App.render(); App.toast('✅ تم الربط');
  };
  App.actions.usrNewEmp = (d) => {
    const u = users.find((x) => x.id === Number(d.id)), s = S();
    const x = { id: 'EM' + Date.now().toString(36), code: Model.nextCode(s, 'EMP', 'EMP'), docs: [], name: u.display_name, job: App.ROLE_LABEL[u.role], phone: u.phone || '', branchId: u.branch_id || 'BR1',
      dept: (s.hr.departments[0] || {}).id, status: 'ACTIVE', contractType: 'FULL', hireDate: Hr.localNow(s.company.country).date, salary: 0, allowances: 0, userId: u.id };
    s.employees.push(x); App.audit(`إنشاء ملف موظف ${x.code} من حساب ${u.username}`); App.save();
    App.toast('✅ تم إنشاء ملف الموظف — أكمل بياناته (الراتب والعقد) من الموارد البشرية');
    App.actions.go({ page: 'hrEmployee', id: x.id });
  };

  // ============================================================ add / save
  App.actions.userForm = () => {
    App.modal(`<h3>+ مستخدم جديد</h3><div class="grid g2">
      <div class="field"><label>اسم المستخدم (إنجليزي صغير أو إيميل)</label><input class="input" id="nu-user" style="direction:ltr" autocapitalize="none"></div>
      <div class="field"><label>الاسم الظاهر</label><input class="input" id="nu-name"></div>
      <div class="field"><label>كلمة السر (8+ حروف وأرقام)</label><input class="input" id="nu-pass" type="password" style="direction:ltr" autocomplete="new-password"></div>
      <div class="field"><label>الدور</label>${roleSel('nu-role', 'SALES')}</div>
      <div class="field"><label>الموبايل</label><input class="input" id="nu-phone" style="direction:ltr"></div>
      <div class="field"><label>الفرع</label><select class="input" id="nu-br"><option value="">—</option>${S().branches.map((b) => opt(b.id, '', b.name)).join('')}</select></div>
      <div class="field"><label>ربط بسجل مندوب/وكيل (لدور المندوب)</label>${agentSel('nu-agent', '')}</div>
      <div class="field"><label>ربط بملف موظف</label><select class="input" id="nu-emp"><option value="">— بدون / إنشاء لاحقاً —</option>${S().employees.filter((x) => !x.userId).map((x) => opt(x.id, '', `${x.code} · ${x.name}`)).join('')}</select></div></div>
      <details style="margin-top:8px"><summary class="small">شرح الأدوار</summary><div class="small muted">${ROLES.map((r) => `<div><b>${esc(App.ROLE_LABEL[r])}:</b> ${esc(HINT[r])}</div>`).join('')}</div></details>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="addUser">إضافة للشركة الحالية</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.addUser = async () => {
    try {
      const u = await App.api('POST', 'api/users', { username: App.val('nu-user'), display_name: App.val('nu-name'), password: App.val('nu-pass'), role: App.val('nu-role'), phone: App.val('nu-phone'),
        company_id: App.companyId, branch_id: App.val('nu-br') || null, agent_ref: App.val('nu-agent') || null });
      const empId = App.val('nu-emp');
      if (empId) { const e = S().employees.find((x) => x.id === empId); if (e) { e.userId = u.id; App.save(); } }
      App.closeModal(); App.toast('✅ تمت إضافة المستخدم'); App.hrUsers = []; await loadUsers(true);
    } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.saveUser = async (d) => {
    const id = d.id, body = { display_name: App.val('un-' + id), role: App.val('ur-' + id), is_active: App.val('ua-' + id), branch_id: App.val('ub-' + id) || null, agent_ref: App.val('ua2-' + id) || null,
      phone: App.val('uph-' + id), email: App.val('uem-' + id) };
    if (App.me.role === 'OWNER') body.company_id = App.val('uc-' + id) || null;
    const pw = App.val('up-' + id); if (pw) body.password = pw;
    try { await App.api('PATCH', 'api/users/' + id, body); App.toast('✅ تم الحفظ'); App.hrUsers = []; loadUsers(true); } catch (e) { App.toast(e.message, 'err'); }
  };

  // ============================================================ marketing link
  App.actions.mktLink = async () => {
    try { link = await App.api('GET', 'api/marketing-link'); } catch (e) { return App.toast(e.message, 'err'); }
    const url = new URL(link.path, location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')).href;
    const msg = `اكتشف عروضنا للعمرة والحج والسياحة الداخلية واحجز من خلالنا، أو قدّم طلب عمل معنا كمندوب: ${url}`;
    App.modal(`<h3>🔗 رابط التسويق — ${esc(S().company.name)}</h3>
      <p class="small muted">رابط عام تنشره على فيسبوك وواتساب: يعرض كل المتاح للبيع (رحلات العمرة، برامج الحج، السياحة الداخلية) بالأسعار والأماكن المتبقية لحظياً، وفيه زر <b>"طلب العمل"</b> — أي حد يسجل بياناته يوصلك إشعار، وتوافق عليه وتحدد له كلمة السر من "طلبات بانتظار الموافقة".</p>
      <div class="row"><input class="input num" id="mkt-url" value="${esc(url)}" readonly style="direction:ltr;flex:1"><button class="btn primary" data-act="mktCopy">📋 نسخ</button></div>
      <div class="row" style="margin-top:10px"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">👁️ فتح الصفحة</a><a class="btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">🟢 مشاركة واتساب</a>
        <a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">📘 مشاركة فيسبوك</a>
        ${App.me.role === 'OWNER' ? '<button class="btn ghost" data-act="mktRotate">♻️ تغيير الرابط (يلغي القديم)</button>' : ''}<button class="btn" data-act="closeModal">إغلاق</button></div>`, true);
  };
  App.actions.mktCopy = async () => { const el = document.getElementById('mkt-url'); try { await navigator.clipboard.writeText(el.value); } catch (e) { el.select(); document.execCommand('copy'); } App.toast('📋 تم نسخ الرابط'); };
  App.actions.mktRotate = async () => { if (!confirm('الرابط القديم سيتوقف عن العمل. متابعة؟')) return; try { await App.api('POST', 'api/marketing-link/rotate', {}); App.actions.mktLink(); } catch (e) { App.toast(e.message, 'err'); } };

  // ============================================================ approvals (owner / operations manager)
  const heldBookings = () => {
    const s = S(), out = [];
    for (const d of s.trips) for (const b of d.bookings) if (b.agentRequest && b.agentRequest.state === 'PENDING') out.push({ kind: 'UMRAH', b, where: `${d.trip.code} · ${d.trip.name}`, tripId: d.id, pax: d.pax.filter((p) => p.bookingId === b.id).length });
    for (const b of s.dom.bookings) if (b.agentRequest && b.agentRequest.state === 'PENDING') out.push({ kind: 'DOM', b, where: (window.Dom.program(s, b.programId) || {}).name || 'فندق', pax: (b.units ? b.units.adults + b.units.chd + b.units.inf : 0) });
    for (const a of s.hajj.applicants) if (a.agentRequest && a.agentRequest.state === 'PENDING') out.push({ kind: 'HAJJ', b: a, where: 'طلب حج مبدئي', pax: 1 });
    return out.sort((x, y) => (x.b.agentRequest.at || 0) - (y.b.agentRequest.at || 0));
  };
  App.heldCount = () => (App.S ? heldBookings().length : 0);
  App.pages.approvals = () => {
    if (!App.online) return needOnline('📥 طلبات بانتظار الموافقة');
    if (!canManage()) return '<div class="card">هذه الصفحة للمالك ومدير التشغيل.</div>';
    if (!pending) { loadPending(); return '<div class="card muted">جارِ التحميل…</div>'; }
    const joins = pending.filter((u) => u.approval === 'PENDING'), edits = pending.filter((u) => u.approval === 'CHANGED'), held = heldBookings();
    const tab = App.ui.apTab || (joins.length ? 'JOIN' : held.length ? 'HELD' : edits.length ? 'EDIT' : 'JOIN');
    const agentName = (id) => (S().agents.find((a) => a.id === id) || {}).name || '—';
    const body = tab === 'JOIN' ? (joins.map((u) => `<div class="card ap-card"><div class="row"><b>${esc(u.display_name)}</b><span class="chip hold">طلب عمل</span><span class="spacer"></span><span class="small muted">${esc(u.signup_at || '')}</span></div>
        <table class="t small" style="margin-top:6px"><tbody><tr><td>الموبايل</td><td class="num">${esc(u.phone || '—')}</td></tr><tr><td>البريد</td><td class="num">${esc(u.email || '—')}</td></tr>${profileRows(u.profile || {})}</tbody></table>
        <div class="row" style="margin-top:8px"><button class="btn primary" data-act="apJoinForm" data-id="${u.id}">✅ موافقة وتحديد كلمة السر</button><button class="btn danger" data-act="apReject" data-id="${u.id}">✗ رفض</button>
          ${u.phone ? `<a class="btn ghost" href="tel:${esc(u.phone)}">📞 اتصال</a>` : ''}</div></div>`).join('') || '<div class="card muted">لا طلبات عمل جديدة.</div>')
      : tab === 'EDIT' ? (edits.map((u) => { const ch = u.pending || {}; const rows = [['الاسم', u.display_name, ch.display_name], ['الموبايل', u.phone, ch.phone], ['البريد', u.email, ch.email],
          ...Object.entries(ch.profile || {}).map(([k, v]) => [PROFILE_LBL[k] || k, (u.profile || {})[k], v])].filter((r) => r[2] != null);
        return `<div class="card ap-card"><div class="row"><b>${esc(u.display_name)}</b><span class="chip hold">عدّل بياناته — الدخول متوقف</span><span class="spacer"></span><span class="small muted">${esc((ch.at || '').slice(0, 16).replace('T', ' '))}</span></div>
          <table class="t small" style="margin-top:6px"><thead><tr><th>البيان</th><th>القديم</th><th>الجديد</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="muted">${esc(r[1] || '—')}</td><td><b>${esc(r[2] || '—')}</b></td></tr>`).join('')}</tbody></table>
          <div class="row" style="margin-top:8px"><button class="btn primary" data-act="apApproveEdit" data-id="${u.id}">✅ اعتماد التعديل وفتح الدخول</button><button class="btn" data-act="apReject" data-id="${u.id}" data-edit="1">✗ رفض التعديل (يرجع للبيانات القديمة ويفتح الدخول)</button></div></div>`; }).join('') || '<div class="card muted">لا تعديلات معلقة.</div>')
      : (held.map((x, i) => `<div class="card ap-card"><div class="row"><b class="num">${esc(x.b.code)}</b><span class="chip">${x.kind === 'UMRAH' ? '🕋 عمرة' : x.kind === 'DOM' ? '🏖️ سياحة داخلية' : '🕌 حج'}</span>${x.kind === 'HAJJ' ? '' : h.statusChip(x.b.status)}
          <span class="spacer"></span>${x.b.holdUntil ? `<span class="small hold">⏱️ ${h.countdown(x.b.holdUntil)}</span>` : ''}</div>
          <div class="small" style="margin-top:4px">${esc(x.where)} · المندوب: <b>${esc(agentName(x.b.agentId))}</b> · ${x.pax} فرد${x.kind === 'HAJJ' ? ` · ${esc(x.b.nameAr)} · ${esc(x.b.nid || '')}` : ` · ${h.egp(x.b.net)}${x.b.agentCommission ? ` · عمولة ${h.egp(x.b.agentCommission)}` : ''}`}</div>
          <div class="row" style="margin-top:8px"><button class="btn primary" data-act="apHeld" data-i="${i}" data-ok="1">✅ قبول</button><button class="btn danger" data-act="apHeld" data-i="${i}">✗ رفض</button>
            ${x.kind === 'UMRAH' ? `<button class="btn ghost" data-act="go" data-page="booking" data-trip="${x.tripId}">عرض في الحجوزات</button>` : ''}</div></div>`).join('') || '<div class="card muted">لا حجوزات معلقة من المناديب.</div>');
    return `<div class="page-head"><div><h2>📥 طلبات بانتظار الموافقة</h2><p>صلاحية المالك ومدير التشغيل: طلبات العمل من رابط التسويق · تعديلات بيانات المناديب · حجوزات المناديب المعلقة</p></div>
      <div class="row"><button class="btn" data-act="mktLink">🔗 رابط التسويق</button><button class="btn" data-act="apRefresh">↻ تحديث</button></div></div>
      <div class="tabs"><button class="${tab === 'JOIN' ? 'active' : ''}" data-act="apTab" data-t="JOIN">🆕 طلبات العمل (${joins.length})</button><button class="${tab === 'HELD' ? 'active' : ''}" data-act="apTab" data-t="HELD">🟡 حجوزات المناديب (${held.length})</button>
        <button class="${tab === 'EDIT' ? 'active' : ''}" data-act="apTab" data-t="EDIT">✏️ تعديلات البيانات (${edits.length})</button></div>
      <div class="stack">${body}</div>`;
  };
  App.actions.apTab = (d) => { App.ui.apTab = d.t; App.render(); };
  App.actions.apRefresh = () => { loadPending(); };
  App.actions.apJoinForm = (d) => {
    const u = pending.find((x) => x.id === Number(d.id)), own = App.me.role === 'OWNER';
    const sugg = 'Af' + Math.random().toString(36).slice(2, 7) + Math.floor(10 + Math.random() * 89);
    App.modal(`<h3>✅ قبول ${esc(u.display_name)}</h3><div class="grid g2">
      <div class="field"><label>اسم المستخدم للدخول</label><input class="input" id="aj-user" value="${esc(u.username)}" style="direction:ltr"></div>
      <div class="field"><label>كلمة السر (أنت تحددها)</label><input class="input" id="aj-pass" value="${sugg}" style="direction:ltr"></div>
      <div class="field"><label>الاسم الظاهر</label><input class="input" id="aj-name" value="${esc(u.display_name)}"></div>
      <div class="field"><label>سجل المندوب</label><select class="input" id="aj-agent">${opt('', '', '+ إنشاء سجل مندوب جديد له')}${S().agents.map((a) => opt(a.id, '', `${a.code} · ${a.name}`)).join('')}</select></div>
      <div class="field"><label>النوع (للسجل الجديد)</label><select class="input" id="aj-tier">${opt('BROKER', 'BROKER', 'وسيط/مندوب بالعمولة')}${opt('B2B', '', 'وكيل معتمد (محفظة وخصم جملة)')}</select></div>
      ${own ? '<div class="field"><label>الحد الأدنى للعمولة لكل فرد (ج.م)</label><input class="input" id="aj-cmin" type="number" value="0"></div>' : '<div class="small muted">العمولة يحددها المالك من صفحة المناديب.</div>'}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="apJoin" data-id="${u.id}">✅ قبول وفتح الحساب</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.apJoin = async (d) => {
    const body = { username: App.val('aj-user'), password: App.val('aj-pass'), display_name: App.val('aj-name'), agentId: App.val('aj-agent') || null, tier: App.val('aj-tier'), commissionMin: App.val('aj-cmin') };
    try {
      const u = await App.api('POST', `api/approvals/${d.id}/approve`, body);
      await App.reloadState(); pending = null; users = null; loadPending();
      const url = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      const msg = `مرحباً ${u.display_name} 👋\nتمت الموافقة على طلبك للعمل مع ${S().company.name}.\nرابط الدخول: ${url}\nاسم المستخدم: ${u.username}\nكلمة السر: ${body.password}\nتقدر تحجز من البوابة وكل حجز يوصلنا للموافقة.`;
      App.modal(`<h3>✅ تم فتح حساب ${esc(u.display_name)}</h3><p class="small">ابعت له بيانات الدخول:</p><textarea class="input" rows="7" id="aj-msg" readonly>${esc(msg)}</textarea>
        <div class="row" style="margin-top:10px">${u.phone ? `<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${esc(String(u.phone).replace(/^0/, '20'))}?text=${encodeURIComponent(msg)}">🟢 إرسال واتساب</a>` : ''}<button class="btn" data-act="closeModal">تم</button></div>`);
    } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.apApproveEdit = async (d) => {
    try { await App.api('POST', `api/approvals/${d.id}/approve`, {}); App.toast('✅ تم اعتماد التعديل وفتح الدخول'); await App.reloadState(); pending = null; users = null; loadPending(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.apReject = async (d) => {
    const reason = d.edit ? '' : prompt('سبب الرفض (اختياري):') ?? null;
    if (reason === null) return;
    try { await App.api('POST', `api/approvals/${d.id}/reject`, { reason }); App.toast(d.edit ? 'تم رفض التعديل وفتح الدخول بالبيانات القديمة' : 'تم رفض الطلب'); pending = null; users = null; loadPending(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.apHeld = (d) => {
    const x = heldBookings()[Number(d.i)]; if (!x) return;
    const s = S(), b = x.b, by = App.me.display_name, ok = !!d.ok;
    let reason = '';
    if (!ok) { reason = prompt('سبب الرفض (يظهر للمندوب):'); if (reason === null) return; }
    b.agentRequest = { ...b.agentRequest, state: ok ? 'APPROVED' : 'REJECTED', by, decidedAt: Date.now(), reason };
    if (x.kind === 'UMRAH') Model.withTrip(s, x.tripId, () => {
      if (ok) { if (E.HOLD_STATES.includes(b.status)) b.holdUntil = Math.max(b.holdUntil || 0, Date.now() + 48 * 3600000); }
      else { b.status = 'CANCELLED'; b.holdUntil = null; E.freeBookingInventory(s, b.id); }
      App.Acc.syncBooking(s, s.trip, b, by);
    });
    else if (x.kind === 'DOM') { if (ok) { if (E.HOLD_STATES.includes(b.status)) b.holdUntil = Math.max(b.holdUntil || 0, Date.now() + 48 * 3600000); } else window.Dom.cancelBooking(s, b, by); }
    else if (x.kind === 'HAJJ' && !ok) { b.status = 'WITHDRAWN'; (b.log = b.log || []).push({ status: 'WITHDRAWN', at: Date.now(), by, note: 'رفض طلب المندوب: ' + reason }); }
    App.audit(`${ok ? 'قبول' : 'رفض'} ${x.kind === 'HAJJ' ? 'طلب الحج' : 'حجز'} المندوب ${b.code}${reason ? ' — ' + reason : ''}`);
    App.save(); App.render(); App.toast(ok ? '✅ تم القبول — وصل إشعار للمندوب' : 'تم الرفض وتحرير الأماكن');
  };
  // refresh the pending counter with the notification poll
  setInterval(() => { if (App.online && App.me && canManage() && App.S && !(window.Portal && window.Portal.active)) loadPending(); }, 60000);
  App.loadPending = loadPending;
})();
