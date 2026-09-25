var Pages = window.Pages || {};

// شات الفريق: يعرض نفس المحادثة لكل أعضاء الفريق في المنشأة بصرف النظر عن الفرع.
// "توجيه لشخص بالاسم" بيحدد mentioned_user_id بس الرسالة تفضل ظاهرة للجميع - مفيش رسائل خاصة.
// التحديث شبه اللحظي بيتم عن طريق استعلام دوري (polling) كل بضع ثواني، وبيتوقف تلقائيًا
// لما المستخدم يغيّر الصفحة عشان مايفضلش شغال في الخلفية من غير داعي.
let chatPollTimer = null;
let chatLastId = 0;
let chatTeamById = {};

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}
window.addEventListener('hashchange', stopChatPolling);

function chatBubbleHtml(m, myUserId) {
  const isOwn = m.sender_user_id === myUserId;
  const isMentioningMe = m.mentioned_user_id === myUserId;
  const time = new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  return `
    <div class="chat-bubble-row ${isOwn ? 'own' : ''}">
      <div class="chat-bubble ${isOwn ? 'own' : ''} ${isMentioningMe ? 'mentioned' : ''}">
        ${!isOwn ? `<div class="chat-sender">${UI.escapeHtml(m.sender_username)}</div>` : ''}
        ${m.mentioned_username ? `<div class="chat-mention-tag">→ @${UI.escapeHtml(m.mentioned_username)}</div>` : ''}
        <div class="chat-body">${UI.escapeHtml(m.body)}</div>
        <div class="chat-time">${time}</div>
      </div>
    </div>
  `;
}

function renderChatMessages(messagesEl, messages, myUserId) {
  messagesEl.innerHTML = messages.length
    ? messages.map((m) => chatBubbleHtml(m, myUserId)).join('')
    : '<div class="empty-state">لسه مفيش رسائل - ابدأ المحادثة مع فريقك</div>';
}

Pages.chat = async function () {
  const me = Auth.getUser();
  UI.setContent(`
    <div class="card chat-card">
      <div class="card-header"><h2>💬 شات الفريق</h2></div>
      <div class="chat-messages" id="chatMessages"><div class="empty-state">جاري التحميل...</div></div>
      <form id="chatForm" class="chat-compose">
        <select name="mentioned_user_id" id="chatMentionSelect">
          <option value="">توجيه لكل الفريق</option>
        </select>
        <div class="chat-compose-row">
          <textarea name="body" id="chatBody" placeholder="اكتب رسالتك..." required maxlength="2000" rows="1"></textarea>
          <button type="submit" class="btn">إرسال</button>
        </div>
      </form>
    </div>
  `);

  const messagesEl = document.getElementById('chatMessages');
  const mentionSelect = document.getElementById('chatMentionSelect');
  const bodyInput = document.getElementById('chatBody');

  const [team, messages] = await Promise.all([Api.get('/chat/team'), Api.get('/chat/messages')]);
  chatTeamById = {};
  team.forEach((u) => { chatTeamById[u.id] = u; });
  mentionSelect.innerHTML =
    '<option value="">توجيه لكل الفريق</option>' +
    team.filter((u) => u.id !== me.id).map((u) => `<option value="${u.id}">@${UI.escapeHtml(u.username)}</option>`).join('');

  chatLastId = messages.length ? messages[messages.length - 1].id : 0;
  renderChatMessages(messagesEl, messages, me.id);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  document.getElementById('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = bodyInput.value.trim();
    if (!text) return;
    const mentioned_user_id = mentionSelect.value || null;
    try {
      const msg = await Api.post('/chat/messages', { body: text, mentioned_user_id });
      bodyInput.value = '';
      mentionSelect.value = '';
      if (msg.id > chatLastId) {
        chatLastId = msg.id;
        messagesEl.insertAdjacentHTML('beforeend', chatBubbleHtml(msg, me.id));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });

  stopChatPolling();
  chatPollTimer = setInterval(async () => {
    try {
      const fresh = await Api.get(`/chat/messages?after=${chatLastId}`);
      if (fresh.length) {
        chatLastId = fresh[fresh.length - 1].id;
        const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
        fresh.forEach((m) => messagesEl.insertAdjacentHTML('beforeend', chatBubbleHtml(m, me.id)));
        if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch (_) {
      /* الشات مش عملية مالية - أي فشل مؤقت في الشبكة مش لازم يزعج المستخدم */
    }
  }, 4000);
};
