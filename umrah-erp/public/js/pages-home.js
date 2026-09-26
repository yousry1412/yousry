/* Umrah ERP — Home: dashboard KPIs, alerts centre (collection, documents, approvals), notifications, global FX */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc;
  const S = () => App.S;

  App.pages.home = () => {
    const s = S(), role = App.role();
    const dom = App.domain(), UMRAH_GROUPS = ['تحصيل', 'حجوزات', 'مستندات', 'ملفات الرحلة'];
    // each line of business sees its own alerts; finance & HR alerts show in both
    const alerts = Model.alerts(s, role).filter((a) => (dom === 'UMRAH' ? !['السياحة الداخلية', 'الحج'].includes(a.group) : dom === 'HAJJ' ? !UMRAH_GROUPS.includes(a.group) && a.group !== 'السياحة الداخلية' : !UMRAH_GROUPS.includes(a.group) && a.group !== 'الحج'));
    if (dom === 'HAJJ') return App.pages.hajjDash() + `<div class="card" style="margin-top:14px"><h3>🔔 التنبيهات <span class="sub">${alerts.length}</span></h3><div class="alert-list">${alerts.slice(0, 40).map((a) => `<div class="alert ${a.level === 'err' ? 'err' : a.level === 'warn' ? 'warn' : 'info'}" data-act="go" data-page="${a.page}" data-id="${a.ref || ''}">${esc(a.text)}</div>`).join('') || '<div class="muted">✅ لا توجد تنبيهات.</div>'}</div></div>`;
    const b = Acc.balances(s);
    const bal = (c) => (b.get(c) ? b.get(c).bal : 0);
    const cash = s.cashboxes.reduce((x, c) => x + Acc.cashboxBalance(s, c), 0);
    const Dom = window.Dom, today = E.iso(new Date());
    const live = dom === 'DOMESTIC' ? s.dom.bookings.filter((x) => E.LIVE_STATES.includes(x.status)) : s.trips.flatMap((d) => d.bookings.filter((x) => E.LIVE_STATES.includes(x.status)));
    const paxN = dom === 'DOMESTIC' ? live.reduce((x, bk) => x + (bk.units ? bk.units.adults + bk.units.chd + bk.units.inf : 0), 0) : s.trips.reduce((x, d) => x + d.pax.filter((p) => live.some((bk) => bk.id === p.bookingId)).length, 0);
    const upcoming = dom === 'DOMESTIC' ? s.dom.programs.filter((p) => p.status === 'OPEN' && p.startDate >= today).sort((a, c) => (a.startDate < c.startDate ? -1 : 1)).slice(0, 5)
      : s.trips.filter((d) => d.trip.status !== 'CLOSED' && d.trip.departDate >= today).sort((a, c) => (a.trip.departDate < c.trip.departDate ? -1 : 1)).slice(0, 5);
    const due = live.reduce((x, bk) => x + Math.max(0, (bk.net || 0) - (bk.paid || 0)), 0);
    const groups = {};
    for (const a of alerts) (groups[a.group] = groups[a.group] || []).push(a);
    const fin = App.isApprover();
    const g = App.fxGlobal;
    return `
    <div class="page-head"><div><h2>${Model.DOMAINS[dom].icon} ${esc(s.company.name)} <span class="chip gold">${Model.DOMAINS[dom].ar}</span></h2><p>${esc(App.online ? App.me.display_name : h.user().name)} · ${esc(App.ROLE_LABEL[role])} · ${new Date().toLocaleDateString('ar-EG', { dateStyle: 'full' })}</p></div>
      <div class="row"><button class="btn primary" data-act="go" data-page="${dom === 'DOMESTIC' ? 'domBooking' : 'booking'}">+ حجز ${dom === 'DOMESTIC' ? 'سياحة داخلية' : 'عمرة'}</button>${fin ? '<button class="btn" data-act="newVoucher" data-type="RV">+ سند قبض</button><button class="btn" data-act="newVoucher" data-type="EXP">+ مصروف</button>' : '<button class="btn" data-act="newVoucher" data-type="RV">📤 رفع دفعة</button>'}</div></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">${dom === 'DOMESTIC' ? 'البرامج المفتوحة' : 'رحلات العمرة المفتوحة'}</div><div class="val">${dom === 'DOMESTIC' ? s.dom.programs.filter((p) => p.status === 'OPEN').length : s.trips.filter((d) => d.trip.status !== 'CLOSED').length}</div><div class="hint">${paxN} ${dom === 'DOMESTIC' ? 'فرد' : 'معتمر'} في حجوزات نشطة</div></div>
      <div class="card kpi"><div class="lbl">مستحقات التحصيل من العملاء</div><div class="val ${due ? 'danger' : ''}">${h.egp(due)}</div><div class="hint">${live.filter((x) => (x.net || 0) > (x.paid || 0)).length} حجز عليه متبقي</div></div>
      ${fin ? `<div class="card kpi"><div class="lbl">النقدية بالخزائن والبنوك</div><div class="val gold">${h.egp(cash)}</div><div class="hint">مستحق للموردين ${h.egp(bal('2101'))}</div></div>
      <div class="card kpi"><div class="lbl">سندات بانتظار الاعتماد</div><div class="val">${s.vouchers.filter((v) => v.status === 'PENDING').length}</div><div class="hint"><a href="#" data-act="go" data-page="vouchers">مراجعة واعتماد ←</a></div></div>`
        : `<div class="card kpi"><div class="lbl">حجوزاتي النشطة</div><div class="val">${live.filter((x) => x.createdBy === App.actor().name).length}</div></div><div class="card kpi"><div class="lbl">تنبيهات</div><div class="val">${alerts.length}</div></div>`}
    </div>
    ${upcoming.length ? `<div class="card" style="margin-top:14px"><h3>🗓️ ${dom === 'DOMESTIC' ? 'البرامج القادمة' : 'رحلات العمرة القادمة'}</h3><div class="tbl-wrap"><table class="t small"><tbody>
      ${dom === 'DOMESTIC' ? upcoming.map((p) => { const pl = Dom.programPnl(s, p), left = Dom.capacityLeft(s, p); return `<tr class="clickable" data-act="domOpsOpen" data-p="${p.id}"><td>${Dom.KINDS[p.kind].icon} <b>${esc(p.name)}</b></td><td class="num">${esc(p.startDate)}</td><td>${pl.pax} فرد${left != null ? ` · متبقي ${left}` : ''}</td><td class="${pl.due > 0 ? 'danger' : 'ok'}">متبقي تحصيل ${h.n0(pl.due)}</td></tr>`; }).join('')
        : upcoming.map((d) => `<tr class="clickable" data-act="go" data-page="trips" data-trip="${d.id}"><td>🕋 <b>${esc(d.trip.name)}</b></td><td class="num">${esc(d.trip.departDate)}</td><td>${d.pax.filter((p) => d.bookings.some((x) => x.id === p.bookingId && E.LIVE_STATES.includes(x.status))).length} معتمر</td><td>${esc(d.trip.code)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>🔔 مركز التنبيهات <span class="sub">${alerts.length} تنبيه — اضغط للفتح</span></h3>
        ${Object.keys(groups).length ? Object.entries(groups).map(([gname, list]) => `<details ${list.some((a) => a.level === 'err') || gname === 'مالية' ? 'open' : ''} style="margin-bottom:8px"><summary><b>${esc(gname)}</b> <span class="chip ${list.some((a) => a.level === 'err') ? 'danger' : 'hold'}">${list.length}</span></summary>
          <div class="alert-list" style="margin-top:6px">${list.slice(0, 60).map((a) => `<div class="alert ${a.level === 'err' ? 'err' : a.level === 'warn' ? 'warn' : 'info'}" data-act="go" data-page="${a.page}" data-id="${a.ref || ''}" data-trip="${a.tripId || ''}">${a.level === 'err' ? '⛔' : a.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(a.text)}</div>`).join('')}</div></details>`).join('')
          : '<div class="muted">✅ لا توجد تنبيهات.</div>'}
      </div>
      <div class="stack">
        ${App.online ? `<div class="card"><h3>📨 الإشعارات <span class="sub">${App.notifications.unread} جديد</span>${App.notifications.unread ? '<span class="spacer"></span><button class="btn sm ghost" data-act="notifRead">تعليم كمقروء</button>' : ''}</h3>
          <div class="small" style="max-height:300px;overflow:auto">${App.notifications.items.slice(0, 30).map((n) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)" ${n.link ? `data-act="go" data-page="${esc(n.link)}"` : ''}>${esc(n.text)}<div class="faint">${esc(n.created_at)}</div></div>`).join('') || '<span class="muted">لا إشعارات.</span>'}</div></div>` : ''}
        <div class="card"><h3>💱 سعر الصرف <span class="spacer"></span><button class="btn sm ghost" data-act="go" data-page="fx">التفاصيل ←</button></h3>
          ${(() => { const fx = Model.fxInfo(s); return `<div class="grid g2"><div class="fx-mini exec"><span>التنفيذي</span><b class="num">${fx.exec}</b></div><div class="fx-mini global"><span>العالمي</span><b class="num">${fx.global ?? '—'}</b></div></div>
            ${fx.spreadPct != null ? `<div class="chip ${fx.alert ? 'danger' : 'ok'}" style="margin-top:8px">الفرق ${fx.spreadPct > 0 ? '+' : ''}${fx.spreadPct}%</div>` : ''}
            ${s.trip ? `<div class="small muted" style="margin-top:6px">سعر تسعير ${esc(s.trip.code)}: <b class="num">${s.trip.fxRef}</b></div>` : ''}`; })()}</div>
      </div>
    </div>`;
  };
  App.actions.notifRead = async () => { const last = (App.notifications.items[0] || {}).id; await App.api('POST', 'api/notifications/read', { lastId: last }); App.notifications.unread = 0; App.render(); };
  App.actions.fxRefresh = async () => { const r = await App.refreshFx(true); App.render(); App.toast(r && r.rate ? `السعر العالمي الآن ${r.rate}` : 'تعذر الوصول لمصدر السعر العالمي', r && r.rate ? '' : 'err'); };
  App.actions.fxApply = () => {
    const g = S().fx.global; if (!g || !g.rate) return;
    if (!App.isApprover()) return App.toast('من صلاحية المحاسب أو المدير', 'err');
    if (!confirm(`نسخ السعر العالمي ${g.rate} ليصبح السعر التنفيذي؟`)) return;
    Model.setExecRate(S(), g.rate, App.actor().name, 'نسخ من السعر العالمي');
    App.audit(`السعر التنفيذي = العالمي ${g.rate}`); App.save(); App.render();
  };
})();
