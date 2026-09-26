var Pages = window.Pages || {};

// شات الفريق: يعرض نفس المحادثة لكل أعضاء الفريق في المنشأة بصرف النظر عن الفرع.
// "توجيه لشخص بالاسم" بيحدد mentioned_user_id بس الرسالة تفضل ظاهرة للجميع - مفيش رسائل خاصة.
// التحديث شبه اللحظي بيتم عن طريق استعلام دوري (polling) كل بضع ثواني، وبيتوقف تلقائيًا
// لما المستخدم يغيّر الصفحة عشان مايفضلش شغال في الخلفية من غير داعي.
let chatPollTimer = null;
let chatLastId = 0;
let chatTeamById = {};
let chatPendingAttachment = null; // { dataUri, name, mime } لحد ما يُبعت أو يتشال

const CHAT_ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024;

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}
window.addEventListener('hashchange', stopChatPolling);

// بيقرأ أي ملف عادي (PDF/Word/Excel...) كـ data URI مباشرة - الصور بس اللي بتتضغط
// أول (عن طريق compressImageFile الموجودة بالفعل وبتُستخدم في صفحات تانية بالنظام)
function readFileAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function chatAttachmentHtml(m) {
  if (!m.attachment_data) return '';
  const isImage = (m.attachment_mime || '').startsWith('image/');
  if (isImage) {
    return `<img src="${m.attachment_data}" class="chat-attachment-img" data-chat-image="${m.id}" />`;
  }
  return `
    <a class="chat-attachment-file" href="${m.attachment_data}" download="${UI.escapeHtml(m.attachment_name || 'مرفق')}">
      <span class="chat-attachment-icon">📄</span>
      <span class="chat-attachment-name">${UI.escapeHtml(m.attachment_name || 'مرفق')}</span>
      <span class="chat-attachment-dl">⬇ تحميل</span>
    </a>
  `;
}

function chatBubbleHtml(m, myUserId) {
  const isOwn = m.sender_user_id === myUserId;
  const isMentioningMe = m.mentioned_user_id === myUserId;
  const time = new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  return `
    <div class="chat-bubble-row ${isOwn ? 'own' : ''}">
      <div class="chat-bubble ${isOwn ? 'own' : ''} ${isMentioningMe ? 'mentioned' : ''}">
        ${!isOwn ? `<div class="chat-sender">${UI.escapeHtml(m.sender_username)}</div>` : ''}
        ${m.mentioned_username ? `<div class="chat-mention-tag">→ @${UI.escapeHtml(m.mentioned_username)}</div>` : ''}
        ${chatAttachmentHtml(m)}
        ${m.body ? `<div class="chat-body">${UI.escapeHtml(m.body)}</div>` : ''}
        <div class="chat-time">${time}</div>
      </div>
    </div>
  `;
}

function wireChatImageClicks(messagesEl) {
  messagesEl.querySelectorAll('[data-chat-image]').forEach((img) => {
    img.addEventListener('click', () => {
      UI.openModal('صورة', `<img src="${img.src}" style="max-width:100%; border-radius:8px" />`);
    });
  });
}

function renderChatMessages(messagesEl, messages, myUserId) {
  messagesEl.innerHTML = messages.length
    ? messages.map((m) => chatBubbleHtml(m, myUserId)).join('')
    : '<div class="empty-state">لسه مفيش رسائل - ابدأ المحادثة مع فريقك</div>';
  wireChatImageClicks(messagesEl);
}

function chatAttachPreviewHtml() {
  if (!chatPendingAttachment) return '';
  const isImage = chatPendingAttachment.mime.startsWith('image/');
  return `
    <div class="chat-attach-preview">
      ${isImage ? `<img src="${chatPendingAttachment.dataUri}" />` : `<span class="chat-attach-preview-icon">📄</span>`}
      <span class="chat-attach-preview-name">${UI.escapeHtml(chatPendingAttachment.name)}</span>
      <button type="button" class="chat-attach-remove" id="chatAttachRemoveBtn">✕</button>
    </div>
  `;
}

function renderChatAttachPreview() {
  document.getElementById('chatAttachPreviewSlot').innerHTML = chatAttachPreviewHtml();
  const removeBtn = document.getElementById('chatAttachRemoveBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      chatPendingAttachment = null;
      document.getElementById('chatFileInput').value = '';
      renderChatAttachPreview();
    });
  }
}

Pages.chat = async function () {
  const me = Auth.getUser();
  chatPendingAttachment = null;
  UI.setContent(`
    <div class="card chat-card">
      <div class="card-header"><h2>💬 شات الفريق</h2></div>
      <div class="chat-messages" id="chatMessages"><div class="empty-state">جاري التحميل...</div></div>
      <form id="chatForm" class="chat-compose">
        <select name="mentioned_user_id" id="chatMentionSelect">
          <option value="">توجيه لكل الفريق</option>
        </select>
        <div id="chatAttachPreviewSlot"></div>
        <div class="chat-compose-row">
          <input type="file" id="chatFileInput" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style="display:none" />
          <button type="button" class="btn secondary chat-attach-btn" id="chatAttachBtn" title="إرفاق ملف أو صورة">📎</button>
          <textarea name="body" id="chatBody" placeholder="اكتب رسالتك..." maxlength="2000" rows="1"></textarea>
          <button type="submit" class="btn">إرسال</button>
        </div>
      </form>
    </div>
  `);

  const messagesEl = document.getElementById('chatMessages');
  const mentionSelect = document.getElementById('chatMentionSelect');
  const bodyInput = document.getElementById('chatBody');
  const fileInput = document.getElementById('chatFileInput');

  const [team, messages] = await Promise.all([Api.get('/chat/team'), Api.get('/chat/messages')]);
  chatTeamById = {};
  team.forEach((u) => { chatTeamById[u.id] = u; });
  mentionSelect.innerHTML =
    '<option value="">توجيه لكل الفريق</option>' +
    team.filter((u) => u.id !== me.id).map((u) => `<option value="${u.id}">@${UI.escapeHtml(u.username)}</option>`).join('');

  chatLastId = messages.length ? messages[messages.length - 1].id : 0;
  renderChatMessages(messagesEl, messages, me.id);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  document.getElementById('chatAttachBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      UI.toast('حجم الملف كبير جدًا (٦ ميجابايت كحد أقصى)', 'error');
      fileInput.value = '';
      return;
    }
    try {
      const isImage = file.type.startsWith('image/');
      const dataUri = isImage ? await compressImageFile(file) : await readFileAsDataUri(file);
      chatPendingAttachment = { dataUri, name: file.name, mime: isImage ? 'image/jpeg' : file.type || 'application/octet-stream' };
      renderChatAttachPreview();
    } catch (err) {
      UI.toast('تعذّر قراءة الملف', 'error');
    }
  });
  renderChatAttachPreview();

  document.getElementById('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = bodyInput.value.trim();
    if (!text && !chatPendingAttachment) return;
    const mentioned_user_id = mentionSelect.value || null;
    const payload = { body: text, mentioned_user_id };
    if (chatPendingAttachment) {
      payload.attachment_data = chatPendingAttachment.dataUri;
      payload.attachment_name = chatPendingAttachment.name;
      payload.attachment_mime = chatPendingAttachment.mime;
    }
    try {
      const msg = await Api.post('/chat/messages', payload);
      bodyInput.value = '';
      mentionSelect.value = '';
      chatPendingAttachment = null;
      fileInput.value = '';
      renderChatAttachPreview();
      if (msg.id > chatLastId) {
        chatLastId = msg.id;
        messagesEl.insertAdjacentHTML('beforeend', chatBubbleHtml(msg, me.id));
        wireChatImageClicks(messagesEl);
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
        wireChatImageClicks(messagesEl);
        if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch (_) {
      /* الشات مش عملية مالية - أي فشل مؤقت في الشبكة مش لازم يزعج المستخدم */
    }
  }, 4000);
};
