/* Umrah ERP — Internal chat with photos, camera and attachments (shared by staff app and portal) */
(function () {
  'use strict';
  const App = window.App, h = App.h, esc = h.esc;
  const CHANNELS = { general: '🏢 فريق الشركة', field: '🧑‍✈️ الميدان (مشرفين وتسكين)', agents: '🤝 المناديب والوكلاء' };
  const ALLOWED = { general: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HEAD', 'SALES', 'OPERATIONS'], field: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HEAD', 'SALES', 'OPERATIONS', 'SUPERVISOR', 'HOUSING'], agents: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HEAD', 'SALES', 'OPERATIONS', 'AGENT'] };
  const chat = { channel: null, msgs: [], last: 0, timer: null };
  const channelsFor = (role) => Object.keys(CHANNELS).filter((c) => ALLOWED[c].includes(role));

  function msgHtml(m) {
    const me = App.me && m.user_id === App.me.id;
    const file = m.file_id ? (/^image\//.test(m.file_mime || '') ? `<a href="${App.fileUrl(m.file_id)}" target="_blank" rel="noopener"><img src="${App.fileUrl(m.file_id)}" alt="صورة" loading="lazy"></a>` : h.fileLink(m.file_id, m.file_name)) : '';
    return `<div class="msg ${me ? 'me' : ''}">${me ? '' : `<div class="who">${esc(m.user_name)}</div>`}${esc(m.text)}${file}<div class="when">${esc(String(m.created_at).slice(11, 16))} · ${esc(String(m.created_at).slice(0, 10))}</div></div>`;
  }
  App.chatView = () => {
    if (!App.online) return '<div class="card empty-state"><h3>💬 الشات الداخلي</h3><p class="muted">متاح في النسخة الأونلاين.</p></div>';
    const chans = channelsFor(App.me.role);
    if (!chat.channel || !chans.includes(chat.channel)) { chat.channel = chans[0]; chat.msgs = []; chat.last = 0; }
    setTimeout(() => { fetchMsgs(); if (!chat.timer) chat.timer = setInterval(() => { if (document.getElementById('chatMsgs')) fetchMsgs(); }, 4000); }, 0);
    return `<div class="page-head"><div><h2>💬 الشات الداخلي</h2><p>رسائل وصور من الكاميرا ومرفقات بين الفريق والمشرفين والمناديب</p></div>
      <div class="tabs" style="margin:0">${chans.map((c) => `<button class="${chat.channel === c ? 'active' : ''}" data-act="chatChan" data-c="${c}">${CHANNELS[c]}</button>`).join('')}</div></div>
      <div class="card chat-box"><div class="chat-msgs" id="chatMsgs">${chat.msgs.map(msgHtml).join('') || '<div class="muted small">لا رسائل بعد — ابدأ المحادثة.</div>'}</div>
        <div class="chat-input"><button class="btn" data-act="chatAttach" title="مرفق">📎</button><button class="btn" data-act="chatCamera" title="كاميرا">📸</button>
          <textarea class="input" id="chatText" rows="1" placeholder="اكتب رسالة… (Enter للإرسال)"></textarea><button class="btn primary" data-act="chatSend">إرسال</button></div></div>`;
  };
  App.pages.chat = App.chatView;
  async function fetchMsgs() {
    try {
      const rows = await App.api('GET', `api/chat/${chat.channel}?since=${chat.last}`);
      if (!rows.length) return;
      chat.msgs.push(...rows); chat.last = rows[rows.length - 1].id;
      const box = document.getElementById('chatMsgs');
      if (box) { box.innerHTML = chat.msgs.map(msgHtml).join(''); box.scrollTop = box.scrollHeight; }
    } catch (e) { /* ignore */ }
  }
  async function send(text, fileId) {
    try { await App.api('POST', `api/chat/${chat.channel}`, { text, fileId }); await fetchMsgs(); }
    catch (e) { App.toast(e.message, 'err'); }
  }
  App.actions.chatChan = (d) => { chat.channel = d.c; chat.msgs = []; chat.last = 0; App.rerender(); };
  App.actions.chatSend = () => { const el = document.getElementById('chatText'); const t = el.value.trim(); if (!t) return; el.value = ''; send(t); };
  App.actions.chatAttach = async () => { const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf,.xlsx,.xls,.docx,.doc,.zip' }); if (f) send('', f.id); };
  App.actions.chatCamera = async () => { const [f] = await App.uploadPicked({ accept: 'image/*', capture: true }); if (f) send('', f.id); };
  document.addEventListener('keydown', (ev) => { if (ev.target && ev.target.id === 'chatText' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); App.actions.chatSend(); } });
  App.rerender = () => (window.Portal && window.Portal.active ? window.Portal.render() : App.render());
})();
