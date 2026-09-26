/* أفواج — HR: performance & monitoring dashboard, employee files, attendance, leaves, tasks,
 * targets & evaluations, rewards/penalties, payroll, activity monitoring, settings, and "My account" (self-service). */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Hr = window.Hr, h = App.h, esc = h.esc;
  const S = () => App.S;
  const today = () => Hr.localNow(S().company.country).date;
  const period = () => App.ui.hrPeriod || today().slice(0, 7);
  const emp = (id) => S().employees.find((e) => e.id === id);
  const empName = (id) => (emp(id) || { name: '—' }).name;
  const dept = (id) => (S().hr.departments.find((d) => d.id === id) || { name: '—' }).name;
  const isHrAdmin = () => Hr.HR_ADMINS.includes(App.role());
  const cls = (t) => (t >= 85 ? 'ok' : t >= 70 ? 'deposit' : t >= 55 ? 'hold' : 'danger');
  const ratingChip = (sc) => `<span class="chip ${cls(sc.total)}">${sc.rating.k} · ${sc.rating.ar}</span>`;
  const bar = (v) => `<div class="progress ${v >= 100 ? 'full' : ''}"><span style="width:${Math.max(0, Math.min(100, v || 0))}%"></span></div>`;
  const pct = (v) => (v == null ? '—' : `<span class="num">${Math.round(v)}%</span>`);
  const opt = h.opt;
  const periodPicker = (key = 'hrPeriod') => `<div class="field"><label>الشهر</label><input class="input" type="month" data-ui="${key}" value="${esc(App.ui[key] || today().slice(0, 7))}"></div>`;
  const empSelect = (id, cur, all) => `<select class="input" id="${id}">${all ? opt('', cur, 'كل الموظفين') : ''}${Hr.activeEmps(S()).map((e) => opt(e.id, cur, `${e.code} · ${e.name}`)).join('')}</select>`;
  const field = (id, label, val, extra = '') => `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></div>`;
  const DAY = { PRESENT: ['✓', 'ok', 'حاضر'], LATE: ['⏰', 'hold', 'متأخر'], ABSENT: ['✗', 'danger', 'غائب'], LEAVE: ['🌴', 'deposit', 'إجازة'], OFF: ['·', '', 'راحة'], OFF_WORK: ['＋', 'ok', 'عمل يوم راحة'], FUTURE: ['', '', ''], NA: ['', '', 'قبل التعيين'] };
  const TASK_ST = { OPEN: '<span class="chip">جديدة</span>', DOING: '<span class="chip hold">جاري التنفيذ</span>', DONE: '<span class="chip ok">منفذة</span>' };
  const LV_ST = { PENDING: '<span class="chip hold">بانتظار القرار</span>', APPROVED: '<span class="chip ok">موافق عليها</span>', REJECTED: '<span class="chip danger">مرفوضة</span>' };
  const done = (msg) => { if (msg) App.audit(msg); App.closeModal(); App.save(); App.render(); };
  const hrOnly = () => { if (!isHrAdmin()) { App.toast('من صلاحية الموارد البشرية أو المدير', 'err'); return false; } return true; };

  // directory of login accounts (for linking employees to users)
  App.hrUsers = [];
  async function loadUsers() { if (App.online && !App.hrUsers.length) try { App.hrUsers = await App.api('GET', 'api/users/directory'); } catch (e) { /* ignore */ } }

  function calendar(att) {
    return `<div class="att-cal">${att.days.map((d) => { const [ic, c, t] = DAY[d.code] || ['', '', '']; return `<div class="att-day ${c} ${d.code === 'OFF' ? 'off' : ''}" title="${esc(d.date)} ${t}${d.rec ? ` · ${d.rec.in || ''}–${d.rec.out || ''}` : ''}${d.late ? ` · تأخير ${d.late}د` : ''}">
      <span class="d">${Number(d.date.slice(8))}</span><span class="i">${ic}</span>${d.rec && d.rec.in ? `<span class="t num">${d.rec.in}</span>` : ''}</div>`; }).join('')}</div>
      <div class="small muted" style="margin-top:6px">✓ حاضر · ⏰ متأخر · ✗ غائب · 🌴 إجازة · · راحة</div>`;
  }
  function kpiTable(k) {
    return `<table class="t small"><tbody>
      <tr><td>الحجوزات المسجلة</td><td class="num">${k.bookings}</td><td>النشطة / التحويل</td><td class="num">${k.liveBookings} · ${pct(k.conversion)}</td></tr>
      <tr><td>قيمة المبيعات</td><td>${h.egp(k.sales)}</td><td>المعتمرين</td><td class="num">${k.pax}</td></tr>
      <tr><td>تحصيلات معتمدة</td><td>${h.egp(k.collections)}</td><td>إلغاء / انتهاء مهلة</td><td class="num">${k.cancelled} / ${k.expired}</td></tr>
      <tr><td>طلبات خصم</td><td class="num">${k.discountCount} (متوسط ${k.avgDiscount}%)</td><td>سندات أنشأها / مرفوضة</td><td class="num">${k.vouchersCreated} / ${k.vouchersRejected}</td></tr>
      <tr><td>سندات اعتمدها</td><td class="num">${k.vouchersApproved}${k.approveHours != null ? ` · ${k.approveHours} ساعة` : ''}</td><td>عمليات في النظام</td><td class="num">${k.actions}</td></tr>
      <tr><td>المهام (منفذة/متأخرة)</td><td class="num">${k.tasksDone}/${k.tasks} · ${k.tasksLate}</td><td>تحقيق الهدف</td><td>${pct(k.achievement)}</td></tr></tbody></table>`;
  }
  const PART_LBL = { target: 'تحقيق الأهداف', attendance: 'الانضباط والحضور', evaluation: 'تقييم المدير', tasks: 'إنجاز المهام' };
  const partsHtml = (parts, w) => Object.keys(PART_LBL).map((k) => `<div class="score-part"><span>${PART_LBL[k]} <span class="faint">(${w[k]}%)</span></span>${parts[k] == null ? '<span class="faint small">لا يوجد</span>' : `${bar(parts[k])}<b class="num">${Math.round(parts[k])}</b>`}</div>`).join('');

  // ================================================================ MY ACCOUNT (self-service)
  function myEmp() {
    const s = S(); if (!s) return null;
    return App.online ? Hr.empOfUser(s, App.me.id) : s.employees.find((e) => (e.staffIds || []).includes(App.ui.actingUser));
  }
  App.pages.me = () => {
    const e = myEmp();
    if (!e) return `<div class="card empty-state"><h3>🪪 حسابي كموظف</h3><p class="muted">حسابك غير مربوط بملف موظف بعد — اطلب من الموارد البشرية ربط حسابك من "ملفات الموظفين".</p></div>`;
    return App.meView(Hr.selfView(S(), e, App.ui.mePeriod));
  };
  App.meView = (v) => {
    const t = v.today, att = v.month, sc = v.score, k = sc.kpis;
    const next = !t ? 'IN' : !t.out ? 'OUT' : null;
    return `<div class="page-head"><div><h2>🪪 ${esc(v.emp.name)}</h2><p>${esc(v.emp.code)} · ${esc(v.emp.job || '')}${v.emp.dept ? ' · ' + esc(v.emp.dept) : ''}${v.emp.hireDate ? ' · منذ ' + esc(v.emp.hireDate) : ''}</p></div>
      <div class="row">${window.Portal && window.Portal.active ? '' : periodPicker('mePeriod')}</div></div>
    <div class="grid g-side">
      <div class="card punch-card"><h3>🕘 الحضور والانصراف <span class="sub">بتوقيت السيرفر — لا يمكن التلاعب بساعة الجهاز</span></h3>
        <div class="punch-now num">${esc(v.now.time)}</div><div class="muted small">${esc(v.now.date)} · الدوام ${esc(v.settings.workStart)}–${esc(v.settings.workEnd)} (سماح ${v.settings.graceMin} دقيقة)</div>
        <div class="row" style="justify-content:center;margin:12px 0">${next ? `<button class="btn ${next === 'IN' ? 'primary' : 'gold'} punch-btn" data-act="hrPunch">${next === 'IN' ? '👆 تسجيل حضور' : '👋 تسجيل انصراف'}</button>` : '<span class="chip ok">✅ تم تسجيل اليوم بالكامل</span>'}</div>
        <div class="row" style="justify-content:center;gap:18px"><div>الحضور <b class="num">${t && t.in ? esc(t.in) : '—'}</b></div><div>الانصراف <b class="num">${t && t.out ? esc(t.out) : '—'}</b></div></div></div>
      <div class="card"><h3>📊 تقييم أدائي — ${esc(v.period)}</h3>
        <div class="score-big"><b class="num">${Math.round(sc.total)}</b><span>/100</span> ${ratingChip(sc)}</div>
        ${partsHtml(sc.parts, { target: 40, attendance: 25, evaluation: 25, tasks: 10, ...(S() && S().hr ? S().hr.settings.weights : {}) })}
        ${sc.warnings ? `<div class="chip danger" style="margin-top:6px">خصم ${sc.warnings * 5} نقاط بسبب إنذارات/جزاءات الشهر</div>` : ''}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>🎯 التارجت بتاعي — ${esc(v.period)}</h3>${App.targetCard(k.target, k)}</div>
    <div class="grid g4" style="margin-top:14px">
      <div class="card kpi"><div class="lbl">نسبة الحضور</div><div class="val">${pct(att.attendancePct)}</div><div class="hint">${att.present} حضور · ${att.absent} غياب</div></div>
      <div class="card kpi"><div class="lbl">التأخير</div><div class="val ${att.lateCount >= 3 ? 'danger' : ''}">${att.lateCount}</div><div class="hint">${att.lateMinutes} دقيقة · إضافي ${Math.round(att.overtimeMinutes / 60)} س</div></div>
      <div class="card kpi"><div class="lbl">رصيد الإجازات الاعتيادية</div><div class="val gold">${v.balance.ANNUAL.remaining}</div><div class="hint">عارضة ${v.balance.CASUAL.remaining} · مرضية ${v.balance.SICK.remaining}</div></div>
      <div class="card kpi"><div class="lbl">مبيعاتي</div><div class="val">${h.egp(k.sales)}</div><div class="hint">${k.liveBookings} حجز نشط${k.target && k.target.sales ? ` · الهدف ${h.n0(k.target.sales)}` : ''}</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📌 مهامي <span class="sub">${v.tasks.filter((x) => x.status !== 'DONE').length} مفتوحة</span></h3>
        ${v.tasks.map((x) => `<div class="task-row ${x.status !== 'DONE' && x.due < v.now.date ? 'late' : ''}"><div><b>${esc(x.title)}</b><div class="small muted">تسليم ${esc(x.due)} · من ${esc(x.by)}${x.priority === 'HIGH' ? ' · <span class="chip danger">عاجلة</span>' : ''}</div></div>
          <div class="row" style="gap:4px">${TASK_ST[x.status]}${x.status !== 'DONE' ? `${x.status === 'OPEN' ? `<button class="btn sm" data-act="hrMyTask" data-id="${x.id}" data-s="DOING">بدأت</button>` : ''}<button class="btn sm primary" data-act="hrMyTask" data-id="${x.id}" data-s="DONE">✓ تم</button>` : ''}</div></div>`).join('') || '<div class="muted small">لا مهام.</div>'}</div>
      <div class="card"><h3>🌴 إجازاتي <span class="spacer"></span><button class="btn sm primary" data-act="hrLeaveForm">+ طلب إجازة</button></h3>
        <table class="t small"><thead><tr><th>النوع</th><th>المستحق</th><th>المستخدم</th><th>معلق</th><th>المتبقي</th></tr></thead><tbody>
        ${['ANNUAL', 'CASUAL', 'SICK'].map((k2) => `<tr><td>${Hr.LEAVE_TYPES[k2]}</td><td class="num">${v.balance[k2].entitled}</td><td class="num">${v.balance[k2].used}</td><td class="num">${v.balance[k2].pending}</td><td class="num"><b>${v.balance[k2].remaining}</b></td></tr>`).join('')}</tbody></table>
        ${v.leaves.map((l) => `<div class="task-row"><div>${Hr.LEAVE_TYPES[l.type]} · <span class="num">${esc(l.from)}${l.to !== l.from ? ' ← ' + esc(l.to) : ''}</span> (${l.days} يوم)<div class="small muted">${esc(l.reason || '')}${l.decisionNote ? ' · ' + esc(l.decisionNote) : ''}</div></div>${LV_ST[l.status]}</div>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>📅 سجل حضوري — ${esc(v.period)}</h3>${calendar(att)}</div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>🎁 المكافآت والإنذارات والجزاءات</h3>${v.adjustments.map((a) => `<div class="task-row"><div>${a.kind === 'REWARD' ? '🎁' : a.kind === 'WARNING' ? '⚠️' : '⛔'} ${Hr.ADJ_KINDS[a.kind]}: ${esc(a.reason)}<div class="small muted">${esc(a.date)} · ${esc(a.by)}</div></div>${a.amount ? `<b class="num">${h.n0(a.amount)}</b>` : ''}</div>`).join('') || '<div class="muted small">لا يوجد.</div>'}</div>
      <div class="card"><h3>📝 تقييمات المدير</h3>${v.evaluations.map((e) => `<div class="task-row"><div><b>${esc(e.period)}</b> · ${Object.keys(Hr.EVAL_CRITERIA).map((c) => `${Hr.EVAL_CRITERIA[c]} ${'★'.repeat(Number(e.scores[c]) || 0)}`).join(' · ')}<div class="small muted">${esc(e.note || '')} — ${esc(e.by)}</div></div></div>`).join('') || '<div class="muted small">لا تقييمات بعد.</div>'}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>💵 قسائم الراتب</h3><div class="tbl-wrap"><table class="t small"><thead><tr><th>الشهر</th><th>الأساسي+البدلات</th><th>إضافي+عمولة+مكافآت</th><th>الخصومات</th><th>سلف مستقطعة</th><th>الصافي</th><th></th></tr></thead><tbody>
      ${v.payslips.map(({ period: p, line: l }) => `<tr><td>${esc(p)}</td><td>${h.egp(l.basic + l.allowances)}</td><td>${h.egp(l.overtime + l.commission + (l.targetBonus || 0) + l.rewards)}</td><td>${h.egp(l.lateDed + l.absenceDed + l.unpaidDed + l.penalties)}</td><td>${h.egp(l.advances)}</td><td><b>${h.egp(l.net)}</b></td>
        <td><button class="btn sm ghost" data-act="hrSlipSelf" data-p="${esc(p)}">🖨️</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">لا قسائم مُرحّلة بعد.</td></tr>'}</tbody></table></div></div>`;
  };
  App.meData = null; // portal keeps the last server view here
  const refreshSelf = async () => { if (window.Portal && window.Portal.active && window.Portal.refreshMe) await window.Portal.refreshMe(); else if (App.online) await App.reloadState(); App.rerender(); };
  function geo() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => res(null), { timeout: 6000, maximumAge: 60000 });
    });
  }
  App.actions.hrPunch = async () => {
    const g = await geo();
    if (!App.online) { try { const e = myEmp(); const r = Hr.punch(S(), e.id, Date.now(), g); App.audit(r.kind === 'IN' ? 'تسجيل حضور' : 'تسجيل انصراف'); App.save(); App.render(); } catch (err) { App.toast(err.message, 'err'); } return; }
    try { const r = await App.api('POST', 'api/hr/punch', { geo: g }); App.toast(r.kind === 'IN' ? `✅ تم تسجيل حضورك ${r.rec.in}` : `👋 تم تسجيل انصرافك ${r.rec.out}`); await refreshSelf(); }
    catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.hrLeaveForm = () => {
    App.modal(`<h3>🌴 طلب إجازة</h3><div class="grid g2">
      <div class="field"><label>النوع</label><select class="input" id="lv-type">${Object.entries(Hr.LEAVE_TYPES).map(([k, l]) => opt(k, 'ANNUAL', l)).join('')}</select></div><div></div>
      ${field('lv-from', 'من', today(), 'type="date"')}${field('lv-to', 'إلى', today(), 'type="date"')}</div>
      ${field('lv-reason', 'السبب', '')}<div class="row" style="margin-top:8px"><button class="btn sm" data-act="hrLeaveFile">📎 إرفاق (تقرير طبي…)</button><span id="lv-file" class="small muted"></span></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrLeaveSend">إرسال الطلب</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  let leaveFile = null;
  App.actions.hrLeaveFile = async () => { const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf', capture: false }); if (f) { leaveFile = f.id; document.getElementById('lv-file').textContent = '✅ ' + f.name; } };
  App.actions.hrLeaveSend = async () => {
    const body = { type: App.val('lv-type'), from: App.val('lv-from'), to: App.val('lv-to'), reason: App.val('lv-reason'), fileId: leaveFile };
    leaveFile = null;
    if (!App.online) { try { Hr.requestLeave(S(), myEmp().id, body, App.actor().name); done('طلب إجازة'); } catch (e) { App.toast(e.message, 'err'); } return; }
    try { const l = await App.api('POST', 'api/hr/leave', body); App.closeModal(); App.toast(`تم إرسال الطلب (${l.days} يوم) للموارد البشرية`); await refreshSelf(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.hrMyTask = async (d) => {
    if (!App.online) { Hr.setTaskStatus(S(), d.id, null, d.s); done(); return; }
    try { await App.api('POST', `api/hr/task/${d.id}`, { status: d.s }); await refreshSelf(); } catch (e) { App.toast(e.message, 'err'); }
  };
  function slipHtml(company, e, p, l) {
    const row = (a, b) => `<tr><td>${a}</td><td>${h.n2(b)}</td></tr>`;
    return `<div class="head"><div><h2>قسيمة راتب ${esc(p)}</h2><div>${esc(e.code || '')} · ${esc(e.name)}${e.job ? ' · ' + esc(e.job) : ''}</div></div><div>${esc(company)}</div></div>
      <table><tr><th>المستحقات</th><th>المبلغ</th></tr>${row('الراتب الأساسي', l.basic)}${row('البدلات', l.allowances)}${row(`الإضافي (${Math.round(l.att.overtimeMinutes / 60)} ساعة)`, l.overtime)}${row('العمولة', l.commission)}${l.targetBonus ? row('حافز تحقيق التارجت', l.targetBonus) : ''}${row('المكافآت', l.rewards)}
      <tr><th>الاستقطاعات</th><th></th></tr>${row(`التأخير (${l.att.lateMinutes} دقيقة)`, l.lateDed)}${row(`الغياب (${l.att.absent} يوم)`, l.absenceDed)}${row('إجازة بدون أجر', l.unpaidDed)}${row('الجزاءات', l.penalties)}${row('استقطاع السلف', l.advances)}
      <tr><th>صافي المستحق</th><th>${h.n2(l.net)} ج.م</th></tr></table>
      <p>أيام العمل: ${l.att.workdays} · الحضور: ${l.att.present}</p><div class="sign"><div>الموارد البشرية ................</div><div>المحاسب ................</div><div>توقيع الموظف ................</div></div>`;
  }
  App.actions.hrSlipSelf = (d) => {
    const v = App.meData || Hr.selfView(S(), myEmp(), App.ui.mePeriod);
    const x = v.payslips.find((p) => p.period === d.p);
    App.printDoc('Payslip', slipHtml(App.S ? App.S.company.name : '', v.emp, d.p, x.line));
  };

  // ================================================================ DASHBOARD
  App.pages.hrDash = () => {
    const s = S(), p = period(), td = today(), emps = Hr.activeEmps(s);
    const rows = emps.map((e) => ({ e, sc: Hr.score(s, e, p, td), fl: Hr.flags(s, e, p, td) })).sort((a, b) => b.sc.total - a.sc.total);
    const todayRecs = emps.map((e) => ({ e, r: s.hr.attendance.find((a) => a.empId === e.id && a.date === td), lv: s.hr.leaves.find((l) => l.empId === e.id && l.status === 'APPROVED' && td >= l.from && td <= l.to) }));
    const start = Hr.mins(s.hr.settings.workStart) + s.hr.settings.graceMin;
    const off = s.hr.settings.offDays.includes(Hr.dow(td));
    const present = todayRecs.filter((x) => x.r), late = present.filter((x) => Hr.mins(x.r.in) > start), onLv = todayRecs.filter((x) => x.lv), missing = todayRecs.filter((x) => !x.r && !x.lv);
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.sc.total, 0) / rows.length) : 0;
    const depts = s.hr.departments.map((d) => { const rs = rows.filter((r) => r.e.dept === d.id); return { d, n: rs.length, avg: rs.length ? Math.round(rs.reduce((a, r) => a + r.sc.total, 0) / rs.length) : null }; }).filter((x) => x.n);
    return `<div class="page-head"><div><h2>👥 لوحة الأداء والمراقبة</h2><p>تقييم تلقائي من الشغل الفعلي في النظام + الحضور + تقييم المدير + المهام</p></div><div class="row">${periodPicker()}<button class="btn" data-act="hrExport" data-t="hrRank">⬇️ Excel</button></div></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">الموظفون النشطون</div><div class="val">${emps.length}</div><div class="hint">${s.employees.length - emps.length} منتهي الخدمة</div></div>
      <div class="card kpi"><div class="lbl">حضور اليوم</div><div class="val ${!off && missing.length ? 'danger' : ''}">${present.length}/${emps.length}</div><div class="hint">${off ? 'يوم راحة' : `${late.length} متأخر · ${onLv.length} إجازة · ${missing.length} لم يسجل`}</div></div>
      <div class="card kpi"><div class="lbl">طلبات إجازة معلقة</div><div class="val gold">${s.hr.leaves.filter((l) => l.status === 'PENDING').length}</div><div class="hint"><a href="#" data-act="go" data-page="hrLeaves">مراجعة ←</a></div></div>
      <div class="card kpi"><div class="lbl">متوسط الأداء</div><div class="val">${avg}</div><div class="hint">${rows.filter((r) => r.fl.some((f) => f.level === 'err')).length} موظف عليه ملاحظات حرجة</div></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>🏆 ترتيب الموظفين — ${esc(p)}</h3><div class="tbl-wrap"><table class="t" id="hrRank"><thead><tr><th>#</th><th>الموظف</th><th>القسم</th><th>الدرجة</th><th>التقدير</th><th>الأهداف</th><th>الحضور</th><th>تقييم المدير</th><th>المهام</th><th>المبيعات</th><th>ملاحظات</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="clickable" data-act="go" data-page="hrEmployee" data-id="${r.e.id}"><td class="num">${i + 1}</td><td><b>${esc(r.e.name)}</b><div class="small muted">${esc(r.e.job || '')}</div></td><td>${esc(dept(r.e.dept))}</td>
        <td style="min-width:110px">${bar(r.sc.total)}<b class="num">${Math.round(r.sc.total)}</b></td><td>${ratingChip(r.sc)}</td><td>${pct(r.sc.parts.target)}</td><td>${pct(r.sc.attendance.attendancePct)}<div class="small muted">${r.sc.attendance.lateCount} تأخير</div></td>
        <td>${pct(r.sc.evaluation)}</td><td>${r.sc.kpis.tasks ? `${r.sc.kpis.tasksDone}/${r.sc.kpis.tasks}` : '—'}</td><td>${h.egp(r.sc.kpis.sales)}</td>
        <td>${r.fl.length ? `<span class="chip ${r.fl.some((f) => f.level === 'err') ? 'danger' : 'hold'}">${r.fl.length}</span>` : '<span class="chip ok">✓</span>'}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">لا موظفين.</td></tr>'}
    </tbody></table></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>🚩 إشارات المراقبة</h3><div class="alert-list">${rows.flatMap((r) => r.fl.map((f) => `<div class="alert ${f.level === 'err' ? 'err' : f.level === 'warn' ? 'warn' : 'info'}" data-act="go" data-page="hrEmployee" data-id="${r.e.id}">${f.level === 'err' ? '⛔' : f.level === 'warn' ? '⚠️' : 'ℹ️'} <b>${esc(r.e.name)}</b>: ${esc(f.text)}</div>`)).join('') || '<div class="muted">✅ لا ملاحظات.</div>'}</div></div>
      <div class="stack">
        <div class="card"><h3>🕘 حضور اليوم ${esc(td)}</h3><div class="tbl-wrap"><table class="t small"><tbody>${todayRecs.map((x) => `<tr><td>${esc(x.e.name)}</td><td>${x.lv ? `<span class="chip deposit">🌴 ${Hr.LEAVE_TYPES[x.lv.type]}</span>` : x.r ? `<span class="chip ${Hr.mins(x.r.in) > start ? 'hold' : 'ok'}">${esc(x.r.in)}${x.r.out ? ' → ' + esc(x.r.out) : ''}</span>${x.r.geoIn ? ' 📍' : ''}` : off ? '<span class="chip">راحة</span>' : '<span class="chip danger">لم يسجل</span>'}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h3>🏢 متوسط الأقسام</h3>${depts.map((x) => `<div class="score-part"><span>${esc(x.d.name)} <span class="faint">(${x.n})</span></span>${bar(x.avg)}<b class="num">${x.avg}</b></div>`).join('') || '<div class="muted small">حدد أقسام الموظفين.</div>'}</div>
      </div>
    </div>`;
  };
  App.actions.hrExport = (d) => {
    const t = document.getElementById(d.t); if (!t) return;
    const cells = (tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
    const trs = [...t.querySelectorAll('tr')];
    App.exportTable(d.t + '-' + period(), cells(trs[0]), trs.slice(1).map(cells));
  };

  // ================================================================ EMPLOYEES
  App.pages.hrEmployees = () => {
    const s = S(), p = period(), td = today(), f = App.ui.hrEmpFilter || 'ACTIVE';
    loadUsers();
    const list = s.employees.filter((e) => f === 'ALL' || (e.status || 'ACTIVE') === f);
    return `<div class="page-head"><div><h2>🗂️ ملفات الموظفين</h2><p>البيانات والعقود والمستندات والربط بحساب الدخول — الربط هو ما يسمح بقياس أداء الموظف وتسجيل حضوره</p></div>
      <div class="row"><select class="input" data-ui="hrEmpFilter">${opt('ACTIVE', f, 'على رأس العمل')}${Object.entries(Hr.EMP_STATUS).filter(([k]) => k !== 'ACTIVE').map(([k, l]) => opt(k, f, l)).join('')}${opt('ALL', f, 'الكل')}</select>
      <button class="btn" data-act="hrDeptForm">🏢 الأقسام</button><button class="btn primary" data-act="hrEmpForm">+ موظف</button></div></div>
      <div class="emp-grid">${list.map((e) => { const sc = Hr.score(s, e, p, td); const u = App.hrUsers.find((x) => x.id === Number(e.userId));
        return `<div class="card emp-card clickable" data-act="go" data-page="hrEmployee" data-id="${e.id}"><div class="emp-top">${e.photoFileId ? `<img class="avatar" src="${App.fileUrl(e.photoFileId)}" alt="">` : `<span class="avatar ph">${esc((e.name || '?').slice(0, 1))}</span>`}
          <div><b>${esc(e.name)}</b><div class="small muted">${esc(e.code)} · ${esc(e.job || '')}</div><div class="small muted">${esc(dept(e.dept))} · ${esc(h.branch(e.branchId).name)}</div></div></div>
          <div class="row" style="justify-content:space-between;margin-top:8px"><span>${ratingChip(sc)}</span><span class="small">${e.userId ? `🔗 ${esc(u ? u.display_name : 'حساب #' + e.userId)}` : (e.staffIds || []).length ? '🔗 مستخدم تجريبي' : '<span class="chip hold">غير مربوط بحساب</span>'}</span></div>
          ${(e.status || 'ACTIVE') !== 'ACTIVE' ? `<div class="chip danger" style="margin-top:6px">${Hr.EMP_STATUS[e.status]}</div>` : ''}</div>`; }).join('') || '<div class="muted">لا موظفين.</div>'}</div>`;
  };
  App.actions.hrEmpForm = async (d) => {
    if (!hrOnly()) return;
    await loadUsers();
    const s = S(), x = d.id ? emp(d.id) : { branchId: 'BR1', status: 'ACTIVE', contractType: 'FULL', hireDate: today(), dept: (s.hr.departments[0] || {}).id };
    const linked = new Set(s.employees.filter((e) => e.userId && e.id !== x.id).map((e) => Number(e.userId)));
    App.modal(`<h3>${d.id ? 'تعديل ملف' : 'موظف جديد'} ${x.code ? `<span class="chip">${esc(x.code)}</span>` : ''}</h3><div class="grid g3">
      ${field('he-name', 'الاسم الكامل', x.name)}${field('he-job', 'المسمى الوظيفي', x.job)}
      <div class="field"><label>القسم</label><select class="input" id="he-dept">${s.hr.departments.map((dp) => opt(dp.id, x.dept, dp.name)).join('')}</select></div>
      <div class="field"><label>الفرع</label><select class="input" id="he-br">${s.branches.map((b) => opt(b.id, x.branchId, b.name)).join('')}</select></div>
      <div class="field"><label>المدير المباشر</label><select class="input" id="he-mgr">${opt('', x.manager, '—')}${s.employees.filter((e) => e.id !== x.id).map((e) => opt(e.id, x.manager, e.name)).join('')}</select></div>
      <div class="field"><label>الحالة</label><select class="input" id="he-st">${Object.entries(Hr.EMP_STATUS).map(([k, l]) => opt(k, x.status || 'ACTIVE', l)).join('')}</select></div>
      ${field('he-phone', 'الهاتف', x.phone, 'style="direction:ltr"')}${field('he-nid', 'الرقم القومي', x.nid, 'style="direction:ltr"')}${field('he-ins', 'الرقم التأميني', x.insuranceNo, 'style="direction:ltr"')}
      ${field('he-hire', 'تاريخ التعيين', x.hireDate, 'type="date"')}${field('he-prob', 'نهاية فترة الاختبار', x.probationEnd, 'type="date"')}${field('he-cend', 'نهاية العقد', x.contractEnd, 'type="date"')}
      <div class="field"><label>نوع العقد</label><select class="input" id="he-ct">${opt('FULL', x.contractType, 'دوام كامل')}${opt('PART', x.contractType, 'دوام جزئي')}${opt('TEMP', x.contractType, 'مؤقت/موسمي')}${opt('FREELANCE', x.contractType, 'بالقطعة/عمولة')}</select></div>
      ${field('he-sal', 'الراتب الأساسي', x.salary, 'type="number"')}${field('he-allow', 'البدلات الشهرية', x.allowances, 'type="number"')}${field('he-comm', 'عمولة على المبيعات %', x.commissionPct, 'type="number" step="0.1"')}
      ${field('he-bank', 'حساب بنكي/محفظة للراتب', x.payAccount, 'style="direction:ltr"')}${field('he-addr', 'العنوان', x.address)}
      <div class="field"><label>حساب الدخول المرتبط</label><select class="input" id="he-user">${opt('', x.userId, '— بدون —')}${App.hrUsers.filter((u) => !linked.has(u.id)).map((u) => opt(u.id, x.userId, `${u.display_name} (${App.ROLE_LABEL[u.role] || u.role})`)).join('')}</select></div>
      </div><div class="small muted" style="margin-top:6px">ربط الحساب يجعل حجوزات وسندات وعمليات الموظف تُحسب في تقييمه تلقائياً، ويسمح له بتسجيل الحضور وطلب الإجازات من "حسابي".</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrEmpSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.hrEmpSave = (d) => {
    const s = S(), name = String(App.val('he-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const x = d.id ? emp(d.id) : { id: 'EM' + Date.now().toString(36), code: App.Model.nextCode(s, 'EMP', 'EMP'), docs: [] };
    const uid = App.val('he-user');
    Object.assign(x, { name, job: App.val('he-job'), dept: App.val('he-dept'), branchId: App.val('he-br'), manager: App.val('he-mgr') || null, status: App.val('he-st'), phone: App.val('he-phone'), nid: App.val('he-nid'), insuranceNo: App.val('he-ins'),
      hireDate: App.val('he-hire') || null, probationEnd: App.val('he-prob') || null, contractEnd: App.val('he-cend') || null, contractType: App.val('he-ct'),
      salary: Number(App.val('he-sal')) || 0, allowances: Number(App.val('he-allow')) || 0, commissionPct: Number(App.val('he-comm')) || 0, payAccount: App.val('he-bank'), address: App.val('he-addr'), userId: uid ? Number(uid) : null });
    if (!d.id) s.employees.push(x);
    done(`${d.id ? 'تعديل' : 'إضافة'} ملف موظف ${x.code}`);
  };
  App.actions.hrDeptForm = () => {
    if (!hrOnly()) return;
    App.modal(`<h3>🏢 الأقسام</h3>${S().hr.departments.map((dp) => `<div class="task-row"><span>${esc(dp.name)}</span><span class="small muted">${S().employees.filter((e) => e.dept === dp.id).length} موظف</span></div>`).join('')}
      <div class="row" style="margin-top:10px">${field('hd-name', 'قسم جديد', '')}<button class="btn primary" data-act="hrDeptAdd">إضافة</button></div>`);
  };
  App.actions.hrDeptAdd = () => { const n = String(App.val('hd-name')).trim(); if (!n) return; S().hr.departments.push({ id: 'D' + Date.now().toString(36), name: n }); App.save(); App.actions.hrDeptForm(); };

  // ---------------------------------------------------------------- profile
  App.pages.hrEmployee = () => {
    const s = S(), e = emp(App.ui.viewId);
    if (!e) return '<div class="card">اختر موظفاً.</div>';
    const p = period(), td = today(), sc = Hr.score(s, e, p, td), fl = Hr.flags(s, e, p, td), bal = Hr.leaveBalance(s, e.id, td.slice(0, 4));
    const names = new Set([e.name, ...(e.aliases || [])]);
    const acts = s.audit.filter((a) => names.has(a.by)).slice(0, 40);
    const mgr = e.manager ? emp(e.manager) : null;
    const hr = isHrAdmin();
    return `<div class="page-head"><div class="emp-top">${e.photoFileId ? `<img class="avatar lg" src="${App.fileUrl(e.photoFileId)}" alt="">` : `<span class="avatar lg ph">${esc(e.name.slice(0, 1))}</span>`}
        <div><h2>${esc(e.name)}</h2><p>${esc(e.code)} · ${esc(e.job || '')} · ${esc(dept(e.dept))} · ${esc(h.branch(e.branchId).name)}${mgr ? ' · المدير: ' + esc(mgr.name) : ''}</p></div></div>
      <div class="row">${periodPicker()}${hr ? `<button class="btn" data-act="hrEmpForm" data-id="${e.id}">✏️ تعديل</button><button class="btn" data-act="hrPhoto" data-id="${e.id}">📸 صورة</button>` : ''}${App.online && e.userId ? `<button class="btn" data-act="hrMsg" data-u="${e.userId}">💬 رسالة خاصة</button>` : ''}<button class="btn gold" data-act="hrPrintFile" data-id="${e.id}">🖨️ ملف الأداء</button></div></div>
    ${hr ? `<div class="row" style="margin-bottom:12px"><button class="btn sm" data-act="hrEvalForm" data-id="${e.id}">📝 تقييم</button><button class="btn sm" data-act="hrTargetForm" data-id="${e.id}">🎯 هدف الشهر</button><button class="btn sm" data-act="hrTaskForm" data-id="${e.id}">📌 تكليف بمهمة</button>
      <button class="btn sm" data-act="hrAdjForm" data-id="${e.id}" data-k="REWARD">🎁 مكافأة</button><button class="btn sm" data-act="hrAdjForm" data-id="${e.id}" data-k="WARNING">⚠️ إنذار</button><button class="btn sm" data-act="hrAdjForm" data-id="${e.id}" data-k="PENALTY">⛔ جزاء</button>
      <button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="employee" data-id="${e.id}">📄 كشف الحساب المالي</button></div>` : ''}
    <div class="grid g-side">
      <div class="card"><h3>📊 الأداء — ${esc(p)}</h3><div class="score-big"><b class="num">${Math.round(sc.total)}</b><span>/100</span> ${ratingChip(sc)}</div>${partsHtml(sc.parts, s.hr.settings.weights)}
        ${sc.warnings ? `<div class="chip danger" style="margin-top:6px">−${sc.warnings * 5} نقاط إنذارات/جزاءات</div>` : ''}<h4 style="margin:14px 0 6px">مؤشرات من الشغل الفعلي في النظام</h4>${kpiTable(sc.kpis)}</div>
      <div class="stack">
        <div class="card"><h3>🎯 التارجت</h3>${App.targetCard(sc.kpis.target, sc.kpis, { admin: hr })}</div>
        <div class="card"><h3>🚩 ملاحظات المراقبة</h3><div class="alert-list">${fl.map((f) => `<div class="alert ${f.level === 'err' ? 'err' : f.level === 'warn' ? 'warn' : 'info'}">${esc(f.text)}</div>`).join('') || '<div class="muted small">✅ لا ملاحظات.</div>'}</div></div>
        <div class="card"><h3>📋 البيانات</h3><table class="t small"><tbody>
          <tr><td>التعيين</td><td>${esc(e.hireDate || '—')}</td></tr><tr><td>العقد</td><td>${esc({ FULL: 'دوام كامل', PART: 'جزئي', TEMP: 'مؤقت', FREELANCE: 'بالقطعة' }[e.contractType] || '—')}${e.contractEnd ? ' حتى ' + esc(e.contractEnd) : ''}</td></tr>
          <tr><td>الراتب + البدلات</td><td>${h.egp((e.salary || 0) + (e.allowances || 0))}${e.commissionPct ? ` + ${e.commissionPct}% عمولة` : ''}</td></tr>
          <tr><td>الهاتف</td><td class="num">${esc(e.phone || '—')}</td></tr><tr><td>الرقم القومي</td><td class="num">${esc(e.nid || '—')}</td></tr>
          <tr><td>رصيد الإجازات</td><td>اعتيادي ${bal.ANNUAL.remaining} · عارضة ${bal.CASUAL.remaining} · مرضي ${bal.SICK.remaining}</td></tr>
          <tr><td>السلف/العهد</td><td>${h.egp(Acc.partyBalance(s, 'employee', e.id))}</td></tr></tbody></table></div>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>📅 الحضور — ${esc(p)} <span class="sub">${sc.attendance.present} حضور · ${sc.attendance.absent} غياب · ${sc.attendance.lateCount} تأخير (${sc.attendance.lateMinutes} د) · إضافي ${Math.round(sc.attendance.overtimeMinutes / 60)} س</span></h3>${calendar(sc.attendance)}</div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📌 المهام</h3>${s.hr.tasks.filter((t) => t.empId === e.id).slice(-15).reverse().map((t) => `<div class="task-row ${t.status !== 'DONE' && t.due < td ? 'late' : ''}"><div>${esc(t.title)}<div class="small muted">تسليم ${esc(t.due)}</div></div>${TASK_ST[t.status]}</div>`).join('') || '<div class="muted small">لا مهام.</div>'}</div>
      <div class="card"><h3>🎁 المكافآت والجزاءات</h3>${s.hr.adjustments.filter((a) => a.empId === e.id).slice(-15).reverse().map((a) => `<div class="task-row"><div>${Hr.ADJ_KINDS[a.kind]}: ${esc(a.reason)}<div class="small muted">${esc(a.date)} · ${esc(a.by)}${a.status === 'CANCELLED' ? ' · ملغي' : ''}</div></div>${a.amount ? `<b class="num">${h.n0(a.amount)}</b>` : ''}</div>`).join('') || '<div class="muted small">لا يوجد.</div>'}</div>
      <div class="card"><h3>📝 التقييمات</h3>${s.hr.evaluations.filter((x) => x.empId === e.id).slice().reverse().map((x) => `<div class="task-row"><div><b>${esc(x.period)}</b> — ${Object.keys(Hr.EVAL_CRITERIA).map((c) => `${Hr.EVAL_CRITERIA[c]}: ${x.scores[c]}/5`).join(' · ')}<div class="small muted">${esc(x.note || '')} — ${esc(x.by)}</div></div></div>`).join('') || '<div class="muted small">لا تقييمات.</div>'}</div>
      <div class="card"><h3>📎 المستندات ${hr ? `<span class="spacer"></span><button class="btn sm" data-act="hrDocForm" data-id="${e.id}">+ مستند</button>` : ''}</h3>${(e.docs || []).map((dc, i) => `<div class="task-row"><div>${dc.fileId ? h.fileLink(dc.fileId, dc.name) : esc(dc.name)}${dc.expiry ? `<div class="small ${dc.expiry < td ? 'danger' : 'muted'}">ينتهي ${esc(dc.expiry)}</div>` : ''}</div>${hr ? `<button class="btn sm ghost" data-act="hrDocDel" data-id="${e.id}" data-i="${i}">🗑️</button>` : ''}</div>`).join('') || '<div class="muted small">عقد العمل، صورة البطاقة، المؤهل، الفيش الجنائي، شهادة الصحة…</div>'}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>🕵️ آخر نشاط في النظام</h3><div class="small" style="max-height:280px;overflow:auto">${acts.map((a) => `<div class="task-row"><span>${esc(a.msg)}</span><span class="faint num">${h.dt(a.at)}</span></div>`).join('') || '<span class="muted">لا نشاط مسجل.</span>'}</div></div>`;
  };
  App.actions.hrMsg = (d) => { App.chatDirect(d.u); App.actions.go({ page: 'chat' }); };
  App.actions.hrPhoto = async (d) => { const [f] = await App.uploadPicked({ accept: 'image/*', capture: false }); if (f) { emp(d.id).photoFileId = f.id; done('تحديث صورة موظف'); } };
  App.actions.hrDocForm = (d) => {
    App.modal(`<h3>📎 مستند موظف</h3><div class="grid g2">${field('hdc-name', 'اسم المستند', '')}${field('hdc-exp', 'تاريخ الانتهاء (اختياري)', '', 'type="date"')}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrDocSave" data-id="${d.id}">📎 اختيار الملف وحفظ</button><button class="btn" data-act="hrDocSave" data-id="${d.id}" data-nofile="1">حفظ بدون ملف</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrDocSave = async (d) => {
    const name = String(App.val('hdc-name')).trim() || 'مستند', expiry = App.val('hdc-exp') || null;
    let fileId = null;
    if (!d.nofile) { const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf' }); if (!f) return; fileId = f.id; }
    const e = emp(d.id); e.docs = e.docs || []; e.docs.push({ name, expiry, fileId, at: Date.now() });
    done(`إضافة مستند ${name} للموظف ${e.code}`);
  };
  App.actions.hrDocDel = (d) => { if (!confirm('حذف المستند؟')) return; emp(d.id).docs.splice(Number(d.i), 1); done('حذف مستند موظف'); };
  App.actions.hrPrintFile = (d) => {
    const s = S(), e = emp(d.id), p = period(), sc = Hr.score(s, e, p, today()), fl = Hr.flags(s, e, p, today());
    App.printDoc('Performance', `<div class="head"><div><h2>ملف أداء موظف — ${esc(p)}</h2><div>${esc(e.code)} · ${esc(e.name)} · ${esc(e.job || '')} · ${esc(dept(e.dept))}</div></div><div><b style="font-size:26px">${Math.round(sc.total)}/100</b><div>${sc.rating.ar}</div></div></div>
      <table><tr><th>المحور</th><th>الوزن</th><th>الدرجة</th></tr>${Object.keys(PART_LBL).map((k) => `<tr><td>${PART_LBL[k]}</td><td>${s.hr.settings.weights[k]}%</td><td>${sc.parts[k] == null ? '—' : Math.round(sc.parts[k])}</td></tr>`).join('')}</table>
      <h3>المؤشرات</h3>${kpiTable(sc.kpis).replace(/class="[^"]*"/g, '')}
      <h3>الحضور</h3><p>أيام العمل ${sc.attendance.workdays} · حضور ${sc.attendance.present} · غياب ${sc.attendance.absent} · تأخير ${sc.attendance.lateCount} مرة (${sc.attendance.lateMinutes} دقيقة) · إجازات ${sc.attendance.leaveDays}</p>
      ${fl.length ? `<h3>ملاحظات</h3><ul>${fl.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : ''}<div class="sign"><div>المدير المباشر ................</div><div>الموارد البشرية ................</div><div>توقيع الموظف ................</div></div>`);
  };

  // ================================================================ ATTENDANCE
  App.pages.hrAttendance = () => {
    const s = S(), p = period(), td = today(), days = Hr.daysOfMonth(p);
    const rows = Hr.activeEmps(s).map((e) => ({ e, a: Hr.attendanceMonth(s, e.id, p, td) }));
    return `<div class="page-head"><div><h2>🕘 الحضور والانصراف</h2><p>البصمة من "حسابي" بتوقيت السيرفر (مع الموقع إن سمح الجهاز) · أي تعديل من الموارد البشرية يُسجل بسببه</p></div>
      <div class="row">${periodPicker()}<button class="btn" data-act="hrAttForm">✏️ تعديل/إضافة بصمة</button><button class="btn" data-act="hrExport" data-t="hrAttTbl">⬇️ Excel</button></div></div>
    <div class="card"><div class="tbl-wrap"><table class="t att-matrix" id="hrAttTbl"><thead><tr><th>الموظف</th>${days.map((d) => `<th class="${s.hr.settings.offDays.includes(Hr.dow(d)) ? 'off' : ''}">${Number(d.slice(8))}</th>`).join('')}<th>حضور</th><th>غياب</th><th>تأخير (د)</th><th>إضافي (س)</th><th>%</th></tr></thead><tbody>
      ${rows.map(({ e, a }) => `<tr><td><a href="#" data-act="go" data-page="hrEmployee" data-id="${e.id}">${esc(e.name)}</a></td>${a.days.map((d) => { const [ic, c, t] = DAY[d.code] || ['', '', '']; return `<td class="att-c ${c}" title="${esc(d.date)} ${t}${d.rec ? ' ' + (d.rec.in || '') + '–' + (d.rec.out || '') : ''}${d.rec && d.rec.edits && d.rec.edits.length ? ' (معدلة)' : ''}" data-act="hrAttForm" data-emp="${e.id}" data-date="${d.date}">${ic}${d.rec && d.rec.edits && d.rec.edits.length ? '<sup>*</sup>' : ''}</td>`; }).join('')}
        <td class="num">${a.present}</td><td class="num">${a.absent}</td><td class="num">${a.lateMinutes}</td><td class="num">${Math.round(a.overtimeMinutes / 60)}</td><td class="num">${Math.round(a.attendancePct)}</td></tr>`).join('')}
    </tbody></table></div><div class="small muted" style="margin-top:6px">اضغط أي خانة لتعديلها · * بصمة معدلة يدوياً</div></div>`;
  };
  App.actions.hrAttForm = (d) => {
    if (!hrOnly()) return;
    const rec = d.emp ? S().hr.attendance.find((a) => a.empId === d.emp && a.date === d.date) : null;
    App.modal(`<h3>✏️ تعديل بصمة</h3><div class="grid g2"><div class="field"><label>الموظف</label>${empSelect('ha-emp', d.emp)}</div>${field('ha-date', 'التاريخ', d.date || today(), 'type="date"')}
      ${field('ha-in', 'الحضور (فارغ = حذف)', rec ? rec.in : S().hr.settings.workStart, 'type="time"')}${field('ha-out', 'الانصراف', rec ? rec.out : '', 'type="time"')}</div>${field('ha-reason', 'سبب التعديل (إلزامي)', '')}
      ${rec && rec.edits && rec.edits.length ? `<div class="small muted" style="margin-top:6px">${rec.edits.map((x) => `${esc(x.from)} ⇐ ${esc(x.to)} · ${esc(x.by)} · ${esc(x.reason)}`).join('<br>')}</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrAttSave">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrAttSave = () => {
    try { const e = App.val('ha-emp'); Hr.editAttendance(S(), { empId: e, date: App.val('ha-date'), inT: App.val('ha-in'), outT: App.val('ha-out'), reason: App.val('ha-reason') }, App.actor().name); done(`تعديل بصمة ${empName(e)} ${App.val('ha-date')}`); }
    catch (err) { App.toast(err.message, 'err'); }
  };

  // ================================================================ LEAVES
  App.pages.hrLeaves = () => {
    const s = S(), f = App.ui.hrLvFilter || 'PENDING', yr = today().slice(0, 4);
    const list = s.hr.leaves.filter((l) => f === 'ALL' || l.status === f).sort((a, b) => b.at - a.at);
    return `<div class="page-head"><div><h2>🌴 الإجازات</h2><p>الطلبات تصل من "حسابي" · الرصيد يُحسب تلقائياً · لا أحد يعتمد إجازته بنفسه</p></div>
      <div class="row"><select class="input" data-ui="hrLvFilter">${opt('PENDING', f, 'بانتظار القرار')}${opt('APPROVED', f, 'موافق عليها')}${opt('REJECTED', f, 'مرفوضة')}${opt('ALL', f, 'الكل')}</select><button class="btn primary" data-act="hrLeaveAdd">+ تسجيل إجازة لموظف</button></div></div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الموظف</th><th>النوع</th><th>الفترة</th><th>الأيام</th><th>السبب</th><th>مرفق</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map((l) => `<tr><td>${esc(empName(l.empId))}</td><td>${Hr.LEAVE_TYPES[l.type]}</td><td class="num">${esc(l.from)}${l.to !== l.from ? ' ← ' + esc(l.to) : ''}</td><td class="num">${l.days}</td><td>${esc(l.reason || '')}</td><td>${l.fileId ? h.fileLink(l.fileId, 'مرفق') : ''}</td>
        <td>${LV_ST[l.status]}${l.decidedBy ? `<div class="small muted">${esc(l.decidedBy)}</div>` : ''}</td>
        <td>${l.status === 'PENDING' ? `<button class="btn sm primary" data-act="hrLeaveDecide" data-id="${l.id}" data-s="APPROVED">موافقة</button> <button class="btn sm" data-act="hrLeaveDecide" data-id="${l.id}" data-s="REJECTED">رفض</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا طلبات.</td></tr>'}
    </tbody></table></div></div>
    <div class="card" style="margin-top:14px"><h3>📊 أرصدة ${esc(yr)}</h3><div class="tbl-wrap"><table class="t small"><thead><tr><th>الموظف</th>${['ANNUAL', 'CASUAL', 'SICK'].map((k) => `<th>${Hr.LEAVE_TYPES[k]} (مستخدم/متبقي)</th>`).join('')}<th>بدون أجر</th></tr></thead><tbody>
      ${Hr.activeEmps(s).map((e) => { const b = Hr.leaveBalance(s, e.id, yr); return `<tr><td>${esc(e.name)}</td>${['ANNUAL', 'CASUAL', 'SICK'].map((k) => `<td class="num">${b[k].used} / <b>${b[k].remaining}</b></td>`).join('')}<td class="num">${b.UNPAID.used}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  };
  App.actions.hrLeaveDecide = (d) => {
    if (!hrOnly()) return;
    const l = S().hr.leaves.find((x) => x.id === d.id), e = emp(l.empId);
    if (App.online && e && Number(e.userId) === App.me.id && App.role() !== 'OWNER') return App.toast('لا يمكنك اعتماد إجازتك بنفسك', 'err');
    const note = d.s === 'REJECTED' ? prompt('سبب الرفض؟') : '';
    if (d.s === 'REJECTED' && note === null) return;
    Object.assign(l, { status: d.s, decidedBy: App.actor().name, decidedAt: Date.now(), decisionNote: note || '' });
    done(`${d.s === 'APPROVED' ? 'موافقة' : 'رفض'} إجازة ${empName(l.empId)}`);
  };
  App.actions.hrLeaveAdd = () => {
    if (!hrOnly()) return;
    App.modal(`<h3>🌴 تسجيل إجازة</h3><div class="grid g2"><div class="field"><label>الموظف</label>${empSelect('hl-emp')}</div>
      <div class="field"><label>النوع</label><select class="input" id="hl-type">${Object.entries(Hr.LEAVE_TYPES).map(([k, l]) => opt(k, 'ANNUAL', l)).join('')}</select></div>
      ${field('hl-from', 'من', today(), 'type="date"')}${field('hl-to', 'إلى', today(), 'type="date"')}</div>${field('hl-reason', 'ملاحظة', '')}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrLeaveAddSave">حفظ (معتمدة)</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrLeaveAddSave = () => {
    try {
      const l = Hr.requestLeave(S(), App.val('hl-emp'), { type: App.val('hl-type'), from: App.val('hl-from'), to: App.val('hl-to'), reason: App.val('hl-reason') }, App.actor().name);
      Object.assign(l, { status: 'APPROVED', decidedBy: App.actor().name, decidedAt: Date.now() });
      done(`تسجيل إجازة ${empName(l.empId)}`);
    } catch (e) { App.toast(e.message, 'err'); }
  };

  // ================================================================ TASKS
  App.pages.hrTasks = () => {
    const s = S(), f = App.ui.hrTkFilter || 'OPEN', td = today();
    const list = s.hr.tasks.filter((t) => (f === 'ALL' ? true : f === 'OPEN' ? t.status !== 'DONE' : f === 'LATE' ? t.status !== 'DONE' && t.due < td : t.status === 'DONE')).sort((a, b) => (a.due < b.due ? -1 : 1));
    return `<div class="page-head"><div><h2>📌 المهام والتكليفات</h2><p>تصل للموظف في "حسابي" مع إشعار · التنفيذ في الموعد يدخل في تقييمه</p></div>
      <div class="row"><select class="input" data-ui="hrTkFilter">${opt('OPEN', f, 'مفتوحة')}${opt('LATE', f, 'متأخرة')}${opt('DONE', f, 'منفذة')}${opt('ALL', f, 'الكل')}</select><button class="btn primary" data-act="hrTaskForm">+ مهمة</button></div></div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>المهمة</th><th>الموظف</th><th>التسليم</th><th>الأولوية</th><th>الحالة</th><th>بواسطة</th><th></th></tr></thead><tbody>
      ${list.map((t) => `<tr class="${t.status !== 'DONE' && t.due < td ? 'row-late' : ''}"><td><b>${esc(t.title)}</b>${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ''}</td><td>${esc(empName(t.empId))}</td><td class="num">${esc(t.due)}</td><td>${t.priority === 'HIGH' ? '<span class="chip danger">عاجلة</span>' : 'عادية'}</td><td>${TASK_ST[t.status]}</td><td class="small">${esc(t.by)}</td>
        <td>${t.status !== 'DONE' ? `<button class="btn sm" data-act="hrTaskDone" data-id="${t.id}">✓ تم</button>` : ''} <button class="btn sm ghost" data-act="hrTaskDel" data-id="${t.id}">🗑️</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">لا مهام.</td></tr>'}
    </tbody></table></div></div>`;
  };
  App.actions.hrTaskForm = (d) => {
    if (!hrOnly()) return;
    App.modal(`<h3>📌 تكليف بمهمة</h3><div class="grid g2"><div class="field"><label>الموظف</label>${empSelect('ht-emp', d.id)}</div>${field('ht-due', 'موعد التسليم', E.iso(E.addDays(today(), 2)), 'type="date"')}</div>
      ${field('ht-title', 'المهمة', '')}${field('ht-note', 'تفاصيل', '')}<div class="field"><label>الأولوية</label><select class="input" id="ht-pr">${opt('NORMAL', 'NORMAL', 'عادية')}${opt('HIGH', '', 'عاجلة')}</select></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrTaskSave">إرسال</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrTaskSave = () => {
    const title = String(App.val('ht-title')).trim(); if (!title) return App.toast('اكتب المهمة', 'err');
    S().hr.tasks.push({ id: Hr.uid('TK'), empId: App.val('ht-emp'), title, note: App.val('ht-note'), due: App.val('ht-due'), priority: App.val('ht-pr'), status: 'OPEN', by: App.actor().name, at: Date.now(), doneAt: null });
    done(`تكليف ${empName(App.val('ht-emp'))}: ${title}`);
  };
  App.actions.hrTaskDone = (d) => { if (!hrOnly()) return; Hr.setTaskStatus(S(), d.id, null, 'DONE'); done(); };
  App.actions.hrTaskDel = (d) => { if (!hrOnly() || !confirm('حذف المهمة؟')) return; S().hr.tasks = S().hr.tasks.filter((t) => t.id !== d.id); done('حذف مهمة'); };

  // ================================================================ TARGETS & EVALUATIONS
  // ---------------------------------------------------------------- targets (types + 4× salary floor + incentive)
  const tgUnit = (m) => Hr.TARGET_METRICS[m].unit;
  const fmtTg = (m, v) => (Hr.TARGET_METRICS[m].money ? h.egp(v) : `<span class="num">${h.n0(v)}</span> ${tgUnit(m)}`);
  const incText = (inc) => (!inc || inc.type === 'NONE' ? 'بدون حافز' : inc.type === 'FIXED' ? `حافز ${h.n0(inc.amount)} ج.م عند التحقيق` : `حافز ${inc.pct}% من ${inc.base === 'PROFIT' ? 'الربحية' : 'المبيعات'} المحققة`);
  /** Target card (HR list, employee profile and "My account"). */
  App.targetCard = (t, k, opts = {}) => {
    if (!t) return `<div class="muted small">لم يُحدد تارجت لهذا الشهر${opts.admin ? '' : ' — تواصل مع مديرك'}.</div>`;
    if (!t.metric) return `<div class="small">تارجت قديم: مبيعات ${h.n0(t.sales || 0)} · حجوزات ${t.bookings || 0}</div>`;
    const actual = k.actuals[t.metric], p = t.value ? (actual / t.value) * 100 : 0, left = Math.max(0, t.value - actual);
    const now = new Date(), [y, m] = t.period.split('-').map(Number), last = new Date(y, m, 0).getDate();
    const daysLeft = t.period === E.iso(now).slice(0, 7) ? Math.max(1, last - now.getDate() + 1) : 0;
    return `<div class="target-card"><div class="row" style="justify-content:space-between"><b>🎯 ${esc(Hr.TARGET_METRICS[t.metric].ar)}</b><span class="chip ${p >= 100 ? 'ok' : p >= 70 ? 'hold' : 'danger'}">${Math.round(p)}%</span></div>
      <div class="tg-nums"><div><small>التارجت</small><b>${fmtTg(t.metric, t.value)}</b></div><div><small>المحقق</small><b class="ok">${fmtTg(t.metric, actual)}</b></div><div><small>المتبقي</small><b class="${left ? 'danger' : 'ok'}">${left ? fmtTg(t.metric, left) : '✅ تم'}</b></div></div>
      ${bar(p)}<div class="small muted" style="margin-top:6px">${esc(incText(t.incentive))}${daysLeft && left ? ` · باقي ${daysLeft} يوم — المطلوب يومياً ${Hr.TARGET_METRICS[t.metric].money ? h.n0(left / daysLeft) + ' ج.م' : Math.ceil(left / daysLeft) + ' ' + tgUnit(t.metric)}` : ''}${p >= 100 && t.incentive && t.incentive.type !== 'NONE' ? ` · <b class="ok">الحافز المستحق ${h.n0(Hr.targetBonus(S(), null, t.period, k))} ج.م</b>` : ''}</div></div>`;
  };
  App.pages.hrReviews = () => {
    const s = S(), p = period();
    return `<div class="page-head"><div><h2>🎯 التارجت والتقييم</h2><p>تارجت شهري لكل موظف بالنوع اللي تختاره (عدد حجوزات، عدد أفراد، قيمة مبيعات، ربحية، تحصيل) مع حافز مقطوع أو نسبة — والنظام لا يقبل تارجت أقل من ${Hr.MIN_SALARY_MULTIPLE} أضعاف الراتب</p></div>
      <div class="row">${periodPicker()}<button class="btn" data-act="hrCopyTargets">نسخ تارجت الشهر السابق</button><button class="btn primary" data-act="hrEvalForm">+ تقييم</button></div></div>
    <div class="emp-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${Hr.activeEmps(s).map((e) => { const k = Hr.kpis(s, e, p);
      return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(e.name)}</b><span class="small muted">راتب ${h.n0(Hr.monthlyPay(e))} · الحد الأدنى ${h.n0(Hr.MIN_SALARY_MULTIPLE * Hr.monthlyPay(e))}</span></div>
        <div style="margin-top:8px">${App.targetCard(k.target, k, { admin: true })}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="hrTargetForm" data-id="${e.id}">🎯 ${k.target ? 'تعديل التارجت' : 'تحديد التارجت'}</button></div></div>`; }).join('')}</div>
    <div class="card" style="margin-top:14px"><h3>📝 التقييمات</h3><div class="tbl-wrap"><table class="t small"><thead><tr><th>الفترة</th><th>الموظف</th>${Object.values(Hr.EVAL_CRITERIA).map((c) => `<th>${c}</th>`).join('')}<th>النسبة</th><th>ملاحظات</th><th>المقيّم</th></tr></thead><tbody>
      ${s.hr.evaluations.slice().reverse().map((x) => `<tr><td>${esc(x.period)}</td><td>${esc(empName(x.empId))}</td>${Object.keys(Hr.EVAL_CRITERIA).map((c) => `<td class="num">${x.scores[c]}/5</td>`).join('')}<td>${pct(Hr.evaluationScore({ hr: { evaluations: [x] } }, x.empId, x.period))}</td><td>${esc(x.note || '')}</td><td>${esc(x.by)}</td></tr>`).join('') || `<tr><td colspan="9" class="muted">لا تقييمات.</td></tr>`}
    </tbody></table></div></div>`;
  };
  App.actions.hrTargetForm = (d) => {
    if (!hrOnly()) return;
    const s = S(), e = emp(d.id), p = period(), t = s.hr.targets.find((x) => x.empId === d.id && x.period === p) || { metric: 'SALES', value: '', incentive: { type: 'NONE' } };
    const f = App.ui.tgf = { empId: d.id, metric: t.metric || 'SALES', value: t.value || '', inc: (t.incentive || {}).type || 'NONE', amount: (t.incentive || {}).amount || '', pct: (t.incentive || {}).pct || '', base: (t.incentive || {}).base || 'SALES' };
    renderTargetForm(e, p, f);
  };
  function renderTargetForm(e, p, f) {
    const s = S(), min = Hr.targetMinimum(s, e, f.metric), av = Hr.averages(s);
    App.modal(`<h3>🎯 تارجت ${esc(e.name)} — ${esc(p)}</h3>
      <div class="field"><label>نوع التارجت</label><div class="tg-types">${Object.entries(Hr.TARGET_METRICS).map(([k, x]) => `<button class="act-card ${f.metric === k ? 'on' : ''}" data-act="tgMetric" data-k="${k}"><b>${x.ar}</b><small>${x.money ? 'مبلغ' : 'عدد'}</small></button>`).join('')}</div></div>
      <div class="grid g2" style="margin-top:8px"><div class="field"><label>قيمة التارجت (${tgUnit(f.metric)})</label><input class="input" id="tg-val" type="number" min="${min}" value="${esc(f.value)}" placeholder="الحد الأدنى ${min}"></div>
        <div class="alert info small" style="margin:0">⚖️ لا يقل عن ${Hr.MIN_SALARY_MULTIPLE} × راتب ${h.n0(Hr.monthlyPay(e))} = ${h.n0(Hr.MIN_SALARY_MULTIPLE * Hr.monthlyPay(e))} ج.م${Hr.TARGET_METRICS[f.metric].money ? '' : ` — بمتوسط ${h.n0(f.metric === 'PAX' ? av.perPax : av.perBooking)} ج.م لل${f.metric === 'PAX' ? 'فرد' : 'حجز'} = <b>${min} ${tgUnit(f.metric)}</b> على الأقل`}</div></div>
      <div class="field" style="margin-top:8px"><label>حافز تحقيق التارجت (يُضاف لمسير الرواتب تلقائياً)</label><select class="input" id="tg-inc" data-act-change="tgInc">${opt('NONE', f.inc, 'بدون حافز')}${opt('FIXED', f.inc, 'مبلغ مقطوع')}${opt('PCT', f.inc, 'نسبة من المحقق')}</select></div>
      ${f.inc === 'FIXED' ? `<div class="grid g2">${field('tg-amt', 'مبلغ الحافز (ج.م)', f.amount, 'type="number"')}</div>` : ''}
      ${f.inc === 'PCT' ? `<div class="grid g2">${field('tg-pct', 'النسبة %', f.pct, 'type="number" step="0.1"')}<div class="field"><label>من</label><select class="input" id="tg-base">${opt('SALES', f.base, 'المبيعات المحققة')}${opt('PROFIT', f.base, 'الربحية المحققة')}</select></div></div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="tgSave">حفظ التارجت</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  }
  const keepTg = () => { const f = App.ui.tgf, v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    f.value = v('tg-val') ?? f.value; f.amount = v('tg-amt') ?? f.amount; f.pct = v('tg-pct') ?? f.pct; f.base = v('tg-base') ?? f.base; return f; };
  App.actions.tgMetric = (d) => { const f = keepTg(); f.metric = d.k; f.value = ''; renderTargetForm(emp(f.empId), period(), f); };
  App.actions.tgInc = (d) => { const f = keepTg(); f.inc = d.value; renderTargetForm(emp(f.empId), period(), f); };
  App.actions.tgSave = () => {
    const s = S(), f = keepTg(), e = emp(f.empId), p = period();
    const incentive = f.inc === 'FIXED' ? { type: 'FIXED', amount: Number(f.amount) } : f.inc === 'PCT' ? { type: 'PCT', pct: Number(f.pct), base: f.base } : { type: 'NONE' };
    const t = { metric: f.metric, value: Number(f.value), incentive };
    try { Hr.validateTarget(s, e, t); } catch (err) { return App.toast('⛔ ' + err.message, 'err'); }
    let x = s.hr.targets.find((y) => y.empId === e.id && y.period === p);
    if (!x) { x = { id: Hr.uid('TG'), empId: e.id, period: p }; s.hr.targets.push(x); }
    for (const k of ['sales', 'bookings', 'collections']) delete x[k];
    Object.assign(x, t, { by: App.actor().name, at: Date.now() });
    done(`تارجت ${p} لـ ${e.name}: ${Hr.TARGET_METRICS[t.metric].ar} ${t.value}`); App.toast('✅ تم حفظ التارجت وإشعار الموظف');
  };
  App.actions.hrCopyTargets = () => {
    if (!hrOnly()) return;
    const s = S(), p = period(), prev = E.iso(E.addDays(p + '-01', -1)).slice(0, 7);
    let n = 0, skipped = 0;
    for (const t of s.hr.targets.filter((x) => x.period === prev)) {
      if (s.hr.targets.some((x) => x.empId === t.empId && x.period === p)) continue;
      const e = emp(t.empId); if (!e) continue;
      if (t.metric) { try { Hr.validateTarget(s, e, t); } catch (err) { skipped++; continue; } }
      s.hr.targets.push({ ...t, id: Hr.uid('TG'), period: p }); n++;
    }
    done(`نسخ ${n} تارجت إلى ${p}`); App.toast(`تم نسخ ${n} تارجت${skipped ? ` · ${skipped} لم تُنسخ لأنها أقل من ${Hr.MIN_SALARY_MULTIPLE} أضعاف الراتب الحالي` : ''}`);
  };
  App.actions.hrEvalForm = (d) => {
    if (!hrOnly()) return;
    App.modal(`<h3>📝 تقييم أداء</h3><div class="grid g2"><div class="field"><label>الموظف</label>${empSelect('hv-emp', d.id)}</div>${field('hv-p', 'الفترة', period(), 'type="month"')}</div>
      <div class="grid g2">${Object.entries(Hr.EVAL_CRITERIA).map(([k, l]) => `<div class="field"><label>${l}</label><select class="input" id="hv-${k}">${[5, 4, 3, 2, 1].map((n) => opt(n, 3, `${n} — ${['', 'ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز'][n]}`)).join('')}</select></div>`).join('')}</div>
      ${field('hv-note', 'ملاحظات وخطة التطوير', '')}<div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrEvalSave">حفظ التقييم</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrEvalSave = () => {
    const empId = App.val('hv-emp'), e = emp(empId);
    if (App.online && e && Number(e.userId) === App.me.id && App.role() !== 'OWNER') return App.toast('لا يمكنك تقييم نفسك', 'err');
    const scores = Object.fromEntries(Object.keys(Hr.EVAL_CRITERIA).map((k) => [k, Number(App.val('hv-' + k))]));
    S().hr.evaluations.push({ id: Hr.uid('EV'), empId, period: App.val('hv-p'), scores, note: App.val('hv-note'), by: App.actor().name, at: Date.now() });
    done(`تقييم ${e.name} عن ${App.val('hv-p')}`);
  };

  // ================================================================ REWARDS / PENALTIES
  App.pages.hrAdjust = () => {
    const s = S();
    return `<div class="page-head"><div><h2>🎁 المكافآت والإنذارات والجزاءات</h2><p>المبالغ تدخل تلقائياً في مسير رواتب الشهر · الإنذار والجزاء يخصم 5 نقاط من تقييم الشهر</p></div>
      <div class="row"><button class="btn primary" data-act="hrAdjForm" data-k="REWARD">🎁 مكافأة</button><button class="btn" data-act="hrAdjForm" data-k="WARNING">⚠️ إنذار</button><button class="btn" data-act="hrAdjForm" data-k="PENALTY">⛔ جزاء مالي</button></div></div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>السبب</th><th>المبلغ</th><th>المسير</th><th>بواسطة</th><th></th></tr></thead><tbody>
      ${s.hr.adjustments.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `<tr class="${a.status === 'CANCELLED' ? 'muted' : ''}"><td class="num">${esc(a.date)}</td><td>${esc(empName(a.empId))}</td><td>${a.kind === 'REWARD' ? '<span class="chip ok">مكافأة</span>' : a.kind === 'WARNING' ? '<span class="chip hold">إنذار</span>' : '<span class="chip danger">جزاء</span>'}</td>
        <td>${esc(a.reason)}</td><td>${a.amount ? h.egp(a.amount) : '—'}</td><td>${a.payrollId ? '<span class="chip ok">مُرحّل</span>' : a.status === 'CANCELLED' ? 'ملغي' : 'الشهر الحالي'}</td><td class="small">${esc(a.by)}</td>
        <td>${!a.payrollId && a.status !== 'CANCELLED' ? `<button class="btn sm ghost" data-act="hrAdjCancel" data-id="${a.id}">إلغاء</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا يوجد.</td></tr>'}
    </tbody></table></div></div>`;
  };
  App.actions.hrAdjForm = (d) => {
    if (!hrOnly()) return;
    App.modal(`<h3>${d.k === 'REWARD' ? '🎁 مكافأة' : d.k === 'WARNING' ? '⚠️ إنذار كتابي' : '⛔ جزاء مالي'}</h3><div class="grid g2"><div class="field"><label>الموظف</label>${empSelect('hj-emp', d.id)}</div>${field('hj-date', 'التاريخ', today(), 'type="date"')}
      ${d.k !== 'WARNING' ? field('hj-amt', 'المبلغ', '', 'type="number"') : ''}</div>${field('hj-reason', 'السبب', '')}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hrAdjSave" data-k="${d.k}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hrAdjSave = (d) => {
    const empId = App.val('hj-emp'), e = emp(empId), reason = String(App.val('hj-reason')).trim(), amount = d.k === 'WARNING' ? 0 : Number(App.val('hj-amt')) || 0;
    if (!reason) return App.toast('اكتب السبب', 'err');
    if (d.k !== 'WARNING' && !(amount > 0)) return App.toast('اكتب المبلغ', 'err');
    if (App.online && e && Number(e.userId) === App.me.id && App.role() !== 'OWNER') return App.toast('لا يمكنك تسجيل ذلك لنفسك', 'err');
    S().hr.adjustments.push({ id: Hr.uid('AD'), empId, kind: d.k, amount, reason, date: App.val('hj-date'), status: 'APPROVED', by: App.actor().name, at: Date.now() });
    done(`${Hr.ADJ_KINDS[d.k]} لـ ${e.name}: ${reason}`);
  };
  App.actions.hrAdjCancel = (d) => { if (!hrOnly() || !confirm('إلغاء؟')) return; S().hr.adjustments.find((a) => a.id === d.id).status = 'CANCELLED'; done('إلغاء مكافأة/جزاء'); };

  // ================================================================ PAYROLL
  App.pages.hrPayroll = () => {
    const s = S(), p = period(), run = s.hr.payroll.filter((r) => r.period === p).slice(-1)[0];
    const lines = run ? run.lines : Hr.activeEmps(s).map((e) => Hr.payrollLine(s, e, p, today()));
    const sum = (k) => lines.reduce((a, l) => a + (l[k] || 0), 0);
    const paid = (empId) => s.vouchers.filter((v) => v.type === 'PV' && v.purpose === 'DUES' && v.party && v.party.id === empId && v.status !== 'REJECTED' && String(v.memo || '').includes(p)).reduce((a, v) => a + v.amount, 0);
    return `<div class="page-head"><div><h2>💵 مسير الرواتب</h2><p>يُحسب تلقائياً من الحضور والتأخير والغياب والإضافي والعمولات والمكافآت والجزاءات واستقطاع السلف — الموارد البشرية تُعد والمحاسب يُرحّل</p></div>
      <div class="row">${periodPicker()}
      ${!run || run.status === 'DRAFT' ? `<button class="btn" data-act="hrPrPrepare">${run ? '🔄 إعادة الحساب' : '📋 إعداد المسير'}</button>` : ''}
      ${run && run.status === 'DRAFT' ? `<button class="btn primary" data-act="hrPrPost" data-id="${run.id}">✅ اعتماد وترحيل القيد</button>` : ''}
      <button class="btn gold" data-act="hrPrPrint">🖨️ طباعة</button><button class="btn" data-act="hrExport" data-t="hrPrTbl">⬇️ Excel</button></div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">الحالة</div><div class="val">${run ? (run.status === 'POSTED' ? '<span class="chip ok">مُرحّل</span>' : '<span class="chip hold">مسودة</span>') : '<span class="chip">معاينة</span>'}</div><div class="hint">${run && run.postedBy ? 'رحّله ' + esc(run.postedBy) : run ? 'أعده ' + esc(run.preparedBy) : 'لم يُعد بعد'}</div></div>
      <div class="card kpi"><div class="lbl">الإجمالي</div><div class="val">${h.egp(sum('gross'))}</div><div class="hint">مدين مصروف الرواتب 5201</div></div>
      <div class="card kpi"><div class="lbl">سلف مستقطعة</div><div class="val">${h.egp(sum('advances'))}</div><div class="hint">دائن السلف 1105</div></div>
      <div class="card kpi"><div class="lbl">صافي المستحق</div><div class="val gold">${h.egp(sum('net'))}</div><div class="hint">دائن مستحقات الموظفين 2103</div></div></div>
    <div class="card" style="margin-top:14px"><div class="tbl-wrap"><table class="t" id="hrPrTbl"><thead><tr><th>الموظف</th><th>الأساسي</th><th>البدلات</th><th>إضافي</th><th>عمولة</th><th>حافز التارجت</th><th>مكافآت</th><th>تأخير</th><th>غياب</th><th>بدون أجر</th><th>جزاءات</th><th>الإجمالي</th><th>سلف</th><th>الصافي</th><th></th></tr></thead><tbody>
      ${lines.map((l) => { const pd = paid(l.empId); return `<tr><td><b>${esc(l.name)}</b><div class="small muted">${l.att.present}/${l.att.workdays} يوم · ${l.att.lateMinutes} د تأخير</div></td><td>${h.n0(l.basic)}</td><td>${h.n0(l.allowances)}</td><td>${h.n0(l.overtime)}</td><td>${h.n0(l.commission)}</td><td>${h.n0(l.targetBonus || 0)}</td><td>${h.n0(l.rewards)}</td>
        <td class="danger">${h.n0(l.lateDed)}</td><td class="danger">${h.n0(l.absenceDed)}</td><td class="danger">${h.n0(l.unpaidDed)}</td><td class="danger">${h.n0(l.penalties)}</td><td>${h.n0(l.gross)}</td><td>${h.n0(l.advances)}</td><td><b>${h.n0(l.net)}</b></td>
        <td class="row" style="gap:4px"><button class="btn sm ghost" data-act="hrSlip" data-emp="${l.empId}">🧾</button>${run && run.status === 'POSTED' ? (pd >= l.net - 0.01 ? '<span class="chip ok">مصروف</span>' : `<button class="btn sm" data-act="hrPrPay" data-emp="${l.empId}" data-amt="${Math.round((l.net - pd) * 100) / 100}">💸 صرف</button>`) : ''}</td></tr>`; }).join('')}
      <tr class="total"><td>الإجمالي</td>${['basic', 'allowances', 'overtime', 'commission', 'targetBonus', 'rewards', 'lateDed', 'absenceDed', 'unpaidDed', 'penalties', 'gross', 'advances', 'net'].map((k) => `<td><b>${h.n0(sum(k))}</b></td>`).join('')}<td></td></tr>
    </tbody></table></div><div class="small muted" style="margin-top:6px">قواعد الحساب من "إعدادات الدوام": يوم العمل = الأساسي ÷ ${s.hr.settings.monthDays} · كل ${s.hr.settings.lateBlockMin} دقيقة تأخير = ${s.hr.settings.lateBlockDay} يوم · الإضافي × ${s.hr.settings.overtimeRate}</div></div>`;
  };
  App.actions.hrPrPrepare = () => {
    if (!hrOnly()) return;
    try { const r = Hr.preparePayroll(S(), period(), App.actor().name, today()); done(`إعداد مسير رواتب ${r.period}`); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.hrPrPost = (d) => {
    if (!App.isApprover()) return App.toast('ترحيل الرواتب من صلاحية المحاسب أو المدير', 'err');
    const run = S().hr.payroll.find((r) => r.id === d.id);
    if (!confirm(`ترحيل مسير ${run.period} بصافي ${h.n0(run.total)}؟ لا يمكن التعديل بعد الترحيل.`)) return;
    try { Hr.postPayroll(S(), d.id, App.actor()); done(`ترحيل مسير رواتب ${run.period}`); App.toast('✅ تم الترحيل وإنشاء القيد'); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.hrPrPay = (d) => { const e = emp(d.emp); App.openVoucher({ type: 'PV', party: { type: 'employee', id: e.id }, purpose: 'DUES', amount: Number(d.amt), memo: `صرف راتب ${period()} — ${e.name}`, lockParty: true }); };
  const lineOf = (empId) => { const s = S(), p = period(), run = s.hr.payroll.filter((r) => r.period === p).slice(-1)[0]; return run ? run.lines.find((l) => l.empId === empId) : Hr.payrollLine(s, emp(empId), p, today()); };
  App.actions.hrSlip = (d) => App.printDoc('Payslip', slipHtml(S().company.name, emp(d.emp), period(), lineOf(d.emp)));
  App.actions.hrPrPrint = () => {
    const tbl = document.getElementById('hrPrTbl');
    App.printDoc('Payroll', `<div class="head"><div><h2>مسير رواتب ${esc(period())}</h2></div></div>${tbl ? tbl.outerHTML.replace(/<button[^>]*>.*?<\/button>/g, '') : ''}<div class="sign"><div>الموارد البشرية ................</div><div>المحاسب ................</div><div>المدير ................</div></div>`, true);
  };

  // ================================================================ MONITORING
  App.pages.hrMonitor = () => {
    const s = S(), q = String(App.ui.hrMonQ || '').trim(), who = App.ui.hrMonWho || '';
    if (App.online && !App.hrLogins && isHrAdmin()) { App.hrLogins = []; App.api('GET', 'api/audit?limit=1500').then((r) => { App.hrLogins = r; if (App.ui.page === 'hrMonitor') App.render(); }).catch(() => {}); }
    const people = [...new Set(s.audit.map((a) => a.by))];
    const rows = s.audit.filter((a) => (!who || a.by === who) && (!q || String(a.msg).includes(q))).slice(0, 400);
    const since = Date.now() - 7 * 86400000;
    const stats = people.map((p) => ({ p, n: s.audit.filter((a) => a.by === p && a.at >= since).length, last: (s.audit.find((a) => a.by === p) || {}).at })).sort((a, b) => b.n - a.n);
    const logins = (App.hrLogins || []).filter((a) => /تسجيل دخول/.test(a.action));
    const lastLogin = (name) => { const r = logins.find((a) => a.display_name === name); return r ? r.at : null; };
    return `<div class="page-head"><div><h2>🕵️ سجل النشاط والمراقبة</h2><p>كل عملية في النظام مسجلة باسم من نفذها ووقتها — حجوزات، سندات، اعتمادات، تعديلات، بصمات</p></div>
      <div class="row"><select class="input" data-ui="hrMonWho">${opt('', who, 'كل المستخدمين')}${people.map((p) => opt(p, who, p)).join('')}</select><input class="input" data-ui="hrMonQ" value="${esc(q)}" placeholder="بحث في العمليات…"></div></div>
    <div class="grid g-side">
      <div class="card"><h3>📜 العمليات <span class="sub">${rows.length}</span></h3><div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="t small"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th></tr></thead><tbody>
        ${rows.map((a) => `<tr><td class="num" style="white-space:nowrap">${h.dt(a.at)}</td><td>${esc(a.by)}</td><td>${esc(a.msg)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">لا عمليات.</td></tr>'}</tbody></table></div></div>
      <div class="stack"><div class="card"><h3>📈 النشاط آخر 7 أيام</h3>${stats.map((x) => `<div class="score-part"><span>${esc(x.p)}</span>${bar(Math.min(100, x.n))}<b class="num">${x.n}</b></div>`).join('')}</div>
        ${App.online ? `<div class="card"><h3>🔐 آخر دخول</h3><table class="t small"><tbody>${(App.hrUsers.length ? App.hrUsers : []).map((u) => `<tr><td>${esc(u.display_name)}</td><td class="num">${esc(lastLogin(u.display_name) || '—')}</td></tr>`).join('') || '<tr><td class="muted">افتح "ملفات الموظفين" لتحميل الحسابات.</td></tr>'}</tbody></table></div>` : ''}</div>
    </div>`;
  };

  // ================================================================ SETTINGS
  App.pages.hrSettings = () => {
    const st = S().hr.settings, days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const num = (k, l, extra = '') => `<div class="field"><label>${l}</label><input class="input" type="number" data-bind="hr.settings.${k}" value="${st[k]}" ${extra}></div>`;
    const wsum = Object.values(st.weights).reduce((a, b) => a + Number(b), 0);
    return `<div class="page-head"><div><h2>⚙️ إعدادات الدوام والتقييم</h2><p>تنطبق على الحضور ومسير الرواتب والتقييم</p></div></div>
    <div class="grid g2"><div class="card"><h3>🕘 الدوام</h3><div class="grid g2">
      <div class="field"><label>بداية الدوام</label><input class="input" type="time" data-bind="hr.settings.workStart" value="${st.workStart}"></div><div class="field"><label>نهاية الدوام</label><input class="input" type="time" data-bind="hr.settings.workEnd" value="${st.workEnd}"></div>
      ${num('graceMin', 'فترة السماح (دقيقة)')}${num('monthDays', 'أيام الشهر لحساب اليومية')}</div>
      <div class="field" style="margin-top:8px"><label>أيام الراحة الأسبوعية</label><div class="row">${days.map((d, i) => `<label class="chk"><input type="checkbox" data-act-change="hrOffDay" data-i="${i}" ${st.offDays.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div></div>
    <div class="card"><h3>💵 قواعد الخصم والإضافي</h3><div class="grid g2">${num('lateBlockMin', 'كل (دقيقة تأخير)')}${num('lateBlockDay', 'تخصم (يوم)', 'step="0.05"')}${num('absenceDays', 'يوم الغياب يخصم (يوم)', 'step="0.5"')}${num('overtimeRate', 'معامل الإضافي', 'step="0.25"')}</div></div>
    <div class="card"><h3>🌴 الإجازات السنوية</h3><div class="grid g3">${num('annual', 'اعتيادية')}${num('casual', 'عارضة')}${num('sick', 'مرضية')}</div></div>
    <div class="card"><h3>📊 أوزان التقييم <span class="chip ${wsum === 100 ? 'ok' : 'hold'}">${wsum}%</span></h3><div class="grid g2">${Object.keys(PART_LBL).map((k) => `<div class="field"><label>${PART_LBL[k]} %</label><input class="input" type="number" data-bind="hr.settings.weights.${k}" value="${st.weights[k]}"></div>`).join('')}</div>
      <div class="small muted">التقدير: ممتاز ≥ 85 · جيد جداً ≥ 70 · جيد ≥ 55 · أقل = يحتاج تحسين. كل إنذار/جزاء يخصم 5 نقاط.</div></div></div>`;
  };
  App.actions.hrOffDay = (d, el) => { const st = S().hr.settings, i = Number(d.i); st.offDays = el.checked ? [...new Set([...st.offDays, i])] : st.offDays.filter((x) => x !== i); App.save(); App.render(); };
})();
