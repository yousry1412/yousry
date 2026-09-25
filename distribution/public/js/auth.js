const Auth = (() => {
  let onReadyCallback = null;
  let currentUser = null;

  function authScreenHtml(mode, errorMsg) {
    const isSetup = mode === 'setup';
    return `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg);">
        <div class="card" style="width:100%; max-width:380px;">
          <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:34px;">🚚</div>
            <h2 style="margin:6px 0 0">إدارة التوزيع</h2>
            <p class="muted" style="font-size:13px">${isSetup ? 'أول استخدام - اعمل حساب المالك' : 'سجّل دخولك للمتابعة'}</p>
          </div>
          <form id="authForm">
            <div class="field" style="margin-bottom:12px">
              <label>اسم المستخدم</label>
              <input type="text" name="username" required minlength="3" autofocus autocomplete="username" />
            </div>
            <div class="field" style="margin-bottom:12px">
              <label>كلمة السر</label>
              <input type="password" name="password" required ${isSetup ? 'minlength="8"' : ''} autocomplete="${isSetup ? 'new-password' : 'current-password'}" />
            </div>
            ${
              isSetup
                ? `<div class="field" style="margin-bottom:12px">
                    <label>تأكيد كلمة السر</label>
                    <input type="password" name="confirm" required minlength="8" />
                  </div>`
                : ''
            }
            ${errorMsg ? `<p style="color:var(--danger); font-size:13px; margin:0 0 12px">${UI.escapeHtml(errorMsg)}</p>` : ''}
            <button type="submit" class="btn" style="width:100%">${isSetup ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
          </form>
        </div>
      </div>
    `;
  }

  function showAuthScreen(mode, errorMsg) {
    document.getElementById('app').style.display = 'none';
    const el = document.getElementById('authScreen');
    el.style.display = 'block';
    el.innerHTML = authScreenHtml(mode, errorMsg);
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const username = fd.get('username');
      const password = fd.get('password');
      if (mode === 'setup' && password !== fd.get('confirm')) {
        showAuthScreen('setup', 'كلمتا السر مش متطابقتين');
        return;
      }
      try {
        const res = await fetch(`/api/auth/${mode === 'setup' ? 'setup' : 'login'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showAuthScreen(mode, data.error || 'حدث خطأ');
          return;
        }
        currentUser = data.user;
        proceedToApp();
      } catch (err) {
        showAuthScreen(mode, 'تعذّر الاتصال بالسيرفر');
      }
    });
  }

  function proceedToApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (onReadyCallback) onReadyCallback();
  }

  async function init(onReady) {
    onReadyCallback = onReady;
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.needsSetup) {
        showAuthScreen('setup');
      } else if (!data.authenticated) {
        showAuthScreen('login');
      } else {
        currentUser = data.user;
        proceedToApp();
      }
    } catch (err) {
      showAuthScreen('login', 'تعذّر الاتصال بالسيرفر');
    }
  }

  function handleUnauthenticated() {
    currentUser = null;
    showAuthScreen('login', 'انتهت الجلسة، سجّل دخولك تاني');
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      /* ignore */
    }
    currentUser = null;
    showAuthScreen('login');
  }

  function getUser() {
    return currentUser;
  }

  return { init, handleUnauthenticated, logout, getUser };
})();

window.Auth = Auth;
