/* Umrah ERP — Home: dashboard KPIs, alerts centre (collection, documents, approvals), notifications, global FX */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc;
  const S = () => App.S;

  App.pages.home = () => {
    const s = S(), role = App.role();
    const alerts = Model.alerts(s, role);
    const b = Acc.balances(s);
    const bal = (c) => (b.get(c) ? b.get(c).bal : 0);
    const cash = s.cashboxes.reduce((x, c) => x + Acc.cashboxBalance(s, c), 0);
    const live = s.trips.flatMap((d) => d.bookings.filter((x) => E.LIVE_STATES.includes(x.status)));
    const paxN = s.trips.reduce((x, d) => x + d.pax.filter((p) => live.some((bk) => bk.id === p.bookingId)).length, 0);
    const due = live.reduce((x, bk) => x + Math.max(0, (bk.net || 0) - (bk.paid || 0)), 0);
    const groups = {};
    for (const a of alerts) (groups[a.group] = groups[a.group] || []).push(a);
    const fin = App.isApprover();
    const g = App.fxGlobal;
    return `
    <div class="page-head"><div><h2>🏠 ${esc(s.company.name)}</h2><p>${esc(App.online ? App.me.display_name : h.user().name)} · ${esc(App.ROLE_LABEL[role])} · ${new Date().toLocaleDateString('ar-EG', { dateStyle: 'full' })}</p></div>
      <div class="row"><button class="btn primary" data-act="go" data-page="booking">+ حجز</button>${fin ? '<button class="btn" data-act="newVoucher" data-type="RV">+ سند قبض</button><button class="btn" data-act="newVoucher" data-type="EXP">+ مصروف</button>' : '<button class="btn" data-act="newVoucher" data-type="RV">📤 رفع دفعة</button>'}</div></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">الرحلات المفتوحة</div><div class="val">${s.trips.filter((d) => d.trip.status !== 'CLOSED').length}</div><div class="hint">${paxN} معتمر في حجوزات نشطة</div></div>
      <div class="card kpi"><div class="lbl">مستحقات التحصيل من العملاء</div><div class="val ${due ? 'danger' : ''}">${h.egp(due)}</div><div class="hint">${live.filter((x) => (x.net || 0) > (x.paid || 0)).length} حجز عليه متبقي</div></div>
      ${fin ? `<div class="card kpi"><div class="lbl">النقدية بالخزائن والبنوك</div><div class="val gold">${h.egp(cash)}</div><div class="hint">مستحق للموردين ${h.egp(bal('2101'))}</div></div>
      <div class="card kpi"><div class="lbl">سندات بانتظار الاعتماد</div><div class="val">${s.vouchers.filter((v) => v.status === 'PENDING').length}</div><div class="hint"><a href="#" data-act="go" data-page="vouchers">مراجعة واعتماد ←</a></div></div>`
        : `<div class="card kpi"><div class="lbl">حجوزاتي النشطة</div><div class="val">${live.filter((x) => x.createdBy === App.actor().name).length}</div></div><div class="card kpi"><div class="lbl">تنبيهات</div><div class="val">${alerts.length}</div></div>`}
    </div>
    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>🔔 مركز التنبيهات <span class="sub">${alerts.length} تنبيه — اضغط للفتح</span></h3>
        ${Object.keys(groups).length ? Object.entries(groups).map(([gname, list]) => `<details ${list.some((a) => a.level === 'err') || gname === 'مالية' ? 'open' : ''} style="margin-bottom:8px"><summary><b>${esc(gname)}</b> <span class="chip ${list.some((a) => a.level === 'err') ? 'danger' : 'hold'}">${list.length}</span></summary>
          <div class="alert-list" style="margin-top:6px">${list.slice(0, 60).map((a) => `<div class="alert ${a.level === 'err' ? 'err' : a.level === 'warn' ? 'warn' : 'info'}" data-act="go" data-page="${a.page}" data-id="${a.ref || ''}" data-trip="${a.tripId || ''}">${a.level === 'err' ? '⛔' : a.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(a.text)}</div>`).join('')}</div></details>`).join('')
          : '<div class="muted">✅ لا توجد تنبيهات.</div>'}
      </div>
      <div class="stack">
        ${App.online ? `<div class="card"><h3>📨 الإشعارات <span class="sub">${App.notifications.unread} جديد</span>${App.notifications.unread ? '<span class="spacer"></span><button class="btn sm ghost" data-act="notifRead">تعليم كمقروء</button>' : ''}</h3>
          <div class="small" style="max-height:300px;overflow:auto">${App.notifications.items.slice(0, 30).map((n) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)" ${n.link ? `data-act="go" data-page="${esc(n.link)}"` : ''}>${esc(n.text)}<div class="faint">${esc(n.created_at)}</div></div>`).join('') || '<span class="muted">لا إشعارات.</span>'}</div></div>` : ''}
        <div class="card"><h3>💱 سعر الصرف</h3>
          <table class="t"><tr><td>سعر السوق المستخدم (SAR→EGP)</td><td><b class="num">${s.fx.current}</b></td></tr>
          ${s.trip ? `<tr><td>سعر التشغيل المرجعي للرحلة ${esc(s.trip.code)} (تكتبه أنت)</td><td><b class="num">${s.trip.fxRef}</b></td></tr>` : ''}
          <tr><td>السعر العالمي الحي</td><td>${g && g.rate ? `<b class="num gold">${g.rate}</b><div class="faint small">${new Date(g.at).toLocaleString('ar-EG')}${g.usd ? ` · USD ${g.usd}` : ''}</div>` : '<span class="muted">غير متاح الآن</span>'}</td></tr></table>
          <div class="row" style="margin-top:8px">${App.online ? '<button class="btn sm" data-act="fxRefresh">↻ تحديث من السوق العالمي</button>' : ''}${g && g.rate && fin ? '<button class="btn sm gold" data-act="fxApply">اعتماد السعر العالمي كسعر السوق</button>' : ''}</div>
          <div class="small muted" style="margin-top:6px">سعر السوق يُستخدم لتقييم المستحقات المفتوحة بالريال وفروق العملة؛ سعر التشغيل المرجعي يثبت تكلفة وتسعير الرحلة ولا يتغير تلقائياً.</div></div>
      </div>
    </div>`;
  };
  App.actions.notifRead = async () => { const last = (App.notifications.items[0] || {}).id; await App.api('POST', 'api/notifications/read', { lastId: last }); App.notifications.unread = 0; App.render(); };
  App.actions.fxRefresh = async () => { const r = await App.refreshFx(true); App.render(); App.toast(r && r.rate ? `السعر العالمي الآن ${r.rate}` : 'تعذر الوصول لمصدر السعر العالمي', r && r.rate ? '' : 'err'); };
  App.actions.fxApply = () => {
    const g = App.fxGlobal; if (!g || !g.rate) return;
    S().fx.current = g.rate; S().fx.global = g;
    App.audit(`تحديث سعر السوق للسعر العالمي ${g.rate}`); App.save(); App.render();
  };
})();
