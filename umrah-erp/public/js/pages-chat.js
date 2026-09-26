/* Umrah ERP — Internal chat with photos, camera and attachments (shared by staff app and portal) */
(function () {
  'use strict';
  const App = window.App, h = App.h, esc = h.esc;
  const CHANNELS = { general: '🏢 فريق الشركة', field: '🧑‍✈️ الميدان (مشرفين وتسكين)', agents: '🤝 المناديب والوكلاء', dm: '💌 الرسائل الخاصة' };
  const STAFF = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HR', 'HEAD', 'SALES', 'OPERATIONS'];
  const ALLOWED = { general: STAFF, field: [...STAFF, 'SUPERVISOR', 'HOUSING'], agents: [...STAFF, 'AGENT'], dm: [...STAFF, 'AGENT', 'SUPERVISOR', 'HOUSING'] };
  // to: addressed person (null = everyone) · priv: only the two of us can read it
  const chat = { channel: null, msgs: [], last: 0, timer: null, people: null, to: '', priv: false, with: '' };
  async function loadPeople() { if (chat.people) return; chat.people = []; try { chat.people = await App.api('GET', 'api/chat/people'); App.rerender(); } catch (e) { /* ignore */ } }
  const roleLbl = (r) => (App.ROLE_LABEL && App.ROLE_LABEL[r]) || r;
  const channelsFor = (role) => Object.keys(CHANNELS).filter((c) => ALLOWED[c].includes(role));

  function msgHtml(m) {
    const me = App.me && m.user_id === App.me.id, toMe = App.me && m.to_user_id === App.me.id;
    const to = m.to_user_id ? `<div class="to">${m.private ? '🔒 خاصة' : '👁️'} ${me ? 'إلى' : toMe ? 'إليك' : 'إلى'} ${esc(toMe ? '' : m.to_name || '')}${m.channel !== 'dm' && chat.channel === 'dm' ? ` · من ${esc(CHANNELS[m.channel] || '')}` : ''}</div>` : '';
    const file = m.file_id ? (/^image\//.test(m.file_mime || '') ? `<a href="${App.fileUrl(m.file_id)}" target="_blank" rel="noopener"><img src="${App.fileUrl(m.file_id)}" alt="صورة" loading="lazy"></a>` : h.fileLink(m.file_id, m.file_name)) : '';
    return `<div class="msg ${me ? 'me' : ''} ${m.private ? 'private' : toMe ? 'mention' : ''}">${me ? '' : `<div class="who">${esc(m.user_name)}</div>`}${to}${esc(m.text)}${file}<div class="when">${esc(String(m.created_at).slice(11, 16))} · ${esc(String(m.created_at).slice(0, 10))}</div></div>`;
  }
  App.chatView = () => {
    if (!App.online) return '<div class="card empty-state"><h3>💬 الشات الداخلي</h3><p class="muted">متاح في النسخة الأونلاين.</p></div>';
    const chans = channelsFor(App.me.role);
    if (!chat.channel || !chans.includes(chat.channel)) { chat.channel = chans[0]; chat.msgs = []; chat.last = 0; }
    loadPeople();
    setTimeout(() => { fetchMsgs(); if (!chat.timer) chat.timer = setInterval(() => { if (document.getElementById('chatMsgs')) fetchMsgs(); }, 4000); }, 0);
    const people = (chat.people || []).filter((u) => chat.channel === 'dm' || ALLOWED[chat.channel].includes(u.role));
    const dm = chat.channel === 'dm';
    const target = dm
      ? `<div class="chat-target">🔒 رسالة خاصة إلى: <select class="input sm" data-act-change="chatWith">${h.opt('', chat.with, '— اختر الشخص —')}${(chat.people || []).map((u) => h.opt(u.id, chat.with, `${u.display_name} · ${roleLbl(u.role)}`)).join('')}</select>
          <span class="small muted">${chat.with ? 'تظهر محادثتكما فقط' : 'تظهر هنا كل رسائلك الخاصة من كل المحادثات'}</span></div>`
      : `<div class="chat-target">إلى: <select class="input sm" data-act-change="chatTo">${h.opt('', chat.to, '👥 الكل')}${people.map((u) => h.opt(u.id, chat.to, `${u.display_name} · ${roleLbl(u.role)}`)).join('')}</select>
          ${chat.to ? `<span class="seg"><button class="${chat.priv ? '' : 'on'}" data-act="chatPriv" data-v="0" title="تظهر لكل أعضاء المحادثة وموجهة للشخص">👁️ الكل يشوفها</button><button class="${chat.priv ? 'on' : ''}" data-act="chatPriv" data-v="1" title="لا يراها أحد غيركما">🔒 هو فقط</button></span>` : ''}</div>`;
    return `<div class="page-head"><div><h2>💬 الشات الداخلي</h2><p>رسائل وصور من الكاميرا ومرفقات · وجّه رسالة لشخص معين واختر: الكل يشوفها أو هو فقط</p></div>
      <div class="tabs" style="margin:0">${chans.map((c) => `<button class="${chat.channel === c ? 'active' : ''}" data-act="chatChan" data-c="${c}">${CHANNELS[c]}${App.chatUnreadBy && App.chatUnreadBy[c] ? ` <span class="badge-inline">${App.chatUnreadBy[c]}</span>` : ''}</button>`).join('')}</div></div>
      <div class="card chat-box"><div class="chat-msgs" id="chatMsgs">${chat.msgs.map(msgHtml).join('') || `<div class="muted small">${dm ? 'لا رسائل خاصة بعد — اختر شخصاً وابدأ.' : 'لا رسائل بعد — ابدأ المحادثة.'}</div>`}</div>
        ${target}
        <div class="chat-input"><button class="btn" data-act="chatAttach" title="مرفق">📎</button><button class="btn" data-act="chatCamera" title="كاميرا">📸</button>
          <textarea class="input" id="chatText" rows="1" placeholder="${dm ? 'رسالة خاصة…' : chat.to ? (chat.priv ? 'رسالة خاصة لا يراها غيره…' : 'رسالة موجهة يراها الجميع…') : 'اكتب رسالة… (Enter للإرسال)'}"></textarea><button class="btn primary" data-act="chatSend">إرسال</button></div></div>`;
  };
  App.pages.chat = App.chatView;
  async function fetchMsgs() {
    try {
      const ch = chat.channel;
      const rows = await App.api('GET', `api/chat/${ch}?since=${chat.last}${ch === 'dm' && chat.with ? '&with=' + chat.with : ''}`);
      if (ch !== chat.channel) return;
      if (!rows.length) return;
      chat.msgs.push(...rows); chat.last = rows[rows.length - 1].id;
      const box = document.getElementById('chatMsgs');
      if (box) { box.innerHTML = chat.msgs.map(msgHtml).join(''); box.scrollTop = box.scrollHeight; }
    } catch (e) { /* ignore */ }
  }
  async function send(text, fileId) {
    const dm = chat.channel === 'dm', to = dm ? chat.with : chat.to;
    if (dm && !to) return App.toast('اختر الشخص أولاً', 'err');
    try { await App.api('POST', `api/chat/${chat.channel}`, { text, fileId, to: to ? Number(to) : null, private: dm || (to && chat.priv) }); await fetchMsgs(); }
    catch (e) { App.toast(e.message, 'err'); }
  }
  const reset = () => { chat.msgs = []; chat.last = 0; };
  App.actions.chatChan = (d) => { chat.channel = d.c; chat.to = ''; chat.priv = false; reset(); App.rerender(); };
  App.actions.chatTo = (d) => { chat.to = d.value; if (!chat.to) chat.priv = false; App.rerender(); };
  App.actions.chatPriv = (d) => { chat.priv = d.v === '1'; App.rerender(); };
  App.actions.chatWith = (d) => { chat.with = d.value; reset(); App.rerender(); };
  /** Open a private conversation with a user from anywhere (e.g. HR employee file). */
  App.chatDirect = (userId) => { chat.channel = 'dm'; chat.with = String(userId); reset(); };
  App.actions.chatSend = () => { const el = document.getElementById('chatText'); const t = el.value.trim(); if (!t) return; el.value = ''; send(t); };
  App.actions.chatAttach = async () => { const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf,.xlsx,.xls,.docx,.doc,.zip' }); if (f) send('', f.id); };
  App.actions.chatCamera = async () => { const [f] = await App.uploadPicked({ accept: 'image/*', capture: true }); if (f) send('', f.id); };
  document.addEventListener('keydown', (ev) => { if (ev.target && ev.target.id === 'chatText' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); App.actions.chatSend(); } });
  App.rerender = () => (window.Portal && window.Portal.active ? window.Portal.render() : App.render());
})();
