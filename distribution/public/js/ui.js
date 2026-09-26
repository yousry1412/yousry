// حماية من الضغط المزدوج على "حفظ": بتعطّل زرار الإرسال فورًا وقت الضغط عليه (بيترجع
// يشتغل تلقائيًا بعد ثوانٍ لو فضل الفورم مفتوح - يعني مش هيتعطّل للأبد لو حصل خطأ)،
// دفاع أول قبل الحماية الأقوى في السيرفر (dedupe-guard) اللي بتغطي أي حالة تانية.
document.addEventListener(
  'submit',
  (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    setTimeout(() => {
      btn.disabled = false;
    }, 4500);
  },
  true
);

const UI = (() => {
  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function money(n) {
    const v = Number(n) || 0;
    const currency = (typeof Context !== 'undefined' && Context.getCompany && Context.getCompany()?.currency) || 'ج.م';
    return v.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
  }

  function num(n, digits = 2) {
    const v = Number(n) || 0;
    return v.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateTime(s) {
    if (!s) return '';
    return s.replace('T', ' ').slice(0, 16);
  }

  function optionsHtml(list, valueKey, labelKey, selected) {
    return list
      .map((item) => {
        const v = item[valueKey];
        const sel = String(v) === String(selected) ? 'selected' : '';
        return `<option value="${escapeHtml(v)}" ${sel}>${escapeHtml(item[labelKey])}</option>`;
      })
      .join('');
  }

  function openModal(titleHtml, bodyHtml, opts = {}) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    box.style.maxWidth = opts.wide ? '820px' : '640px';
    box.innerHTML = `<h3>${titleHtml}</h3>${bodyHtml}`;
    overlay.classList.add('open');
    return box;
  }

  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('modalBox').innerHTML = '';
  }

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  async function confirmAction(message) {
    return window.confirm(message);
  }

  /** بياخد سبب نصي إجباري من المستخدم (زي سبب عكس سند/تلف) - بيرجع null لو المستخدم لغى أو سايبه فاضي */
  async function promptReason(message) {
    const value = window.prompt(message);
    if (!value || !value.trim()) return null;
    return value.trim();
  }

  function badge(text, color) {
    return `<span class="badge ${color}">${escapeHtml(text)}</span>`;
  }

  function setContent(html) {
    document.getElementById('content').innerHTML = html;
  }

  /** بيحاول ياخد موقع GPS الجهاز، وبيرجع null بهدوء لو المستخدم رفض أو الجهاز/المتصفح ملهوش دعم - من غير ما يوقف أي عملية */
  function getCurrentPosition(timeoutMs = 6000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const timer = setTimeout(() => resolve(null), timeoutMs);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
      );
    });
  }

  // ---------- الخرائط (خرائط جوجل مع نسخة احتياطية بدون مفتاح API) ----------

  let mapsApiKeyPromise = null;
  function getMapsApiKey() {
    if (!mapsApiKeyPromise) {
      mapsApiKeyPromise = Api.get('/maps/config')
        .then((c) => c.google_maps_api_key || '')
        .catch(() => '');
    }
    return mapsApiKeyPromise;
  }

  let gmapsLoaderPromise = null;
  function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (!gmapsLoaderPromise) {
      gmapsLoaderPromise = new Promise((resolve, reject) => {
        window.__onGmapsLoaded = resolve;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__onGmapsLoaded`;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    return gmapsLoaderPromise;
  }

  function googleMapsLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  function googleDirectionsLink(lat, lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  function osmEmbedHtml(points, height) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const pad = 0.01;
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLng = Math.min(...lngs) - pad;
    const maxLng = Math.max(...lngs) + pad;
    const last = points[points.length - 1];
    const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${last.lat},${last.lng}`;
    return `<iframe src="${src}" style="width:100%; height:${height}; border:1px solid var(--border); border-radius:8px" loading="lazy"></iframe>`;
  }

  function fallbackMapHtml(points, { height = '320px' } = {}) {
    const list = points
      .slice()
      .reverse()
      .slice(0, 20)
      .map(
        (p) => `<tr>
        <td>${escapeHtml(p.title || '-')}</td>
        <td class="muted">${escapeHtml(p.info || '')}</td>
        <td><a class="link-btn" href="${googleMapsLink(p.lat, p.lng)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a></td>
      </tr>`
      )
      .join('');
    return `
      ${osmEmbedHtml(points, height)}
      <p class="muted" style="font-size:12px; margin:8px 0 4px">
        عرض تقريبي بخرائط OpenStreetMap المجانية. لعرض خريطة جوجل تفاعلية كاملة، أضف مفتاح Google Maps API من صفحة الإعدادات ← تبويب "الخرائط".
      </p>
      <div class="table-wrap"><table><thead><tr><th>البيان</th><th>تفاصيل</th><th></th></tr></thead><tbody>${list}</tbody></table></div>
    `;
  }

  /**
   * points: [{ lat, lng, title, info }]. opts: { height, polyline }
   * لو فيه مفتاح Google Maps API متسجل: خريطة جوجل تفاعلية كاملة بكل النقاط.
   * لو مفيش: نسخة احتياطية بخرائط OpenStreetMap + روابط مباشرة لفتح كل نقطة في خرائط جوجل.
   */
  async function renderMap(container, points, opts = {}) {
    const height = opts.height || '320px';
    if (!points || points.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد مواقع مسجّلة بعد</div>';
      return;
    }
    const apiKey = await getMapsApiKey();
    if (!apiKey) {
      container.innerHTML = fallbackMapHtml(points, { height });
      return;
    }
    try {
      await Promise.race([
        loadGoogleMaps(apiKey),
        new Promise((_, reject) => setTimeout(() => reject(new Error('gmaps-timeout')), 8000)),
      ]);
      if (!window.google || !window.google.maps) throw new Error('gmaps-unavailable');
    } catch (_) {
      container.innerHTML = fallbackMapHtml(points, { height });
      return;
    }
    const mapId = `gmap_${Math.random().toString(36).slice(2)}`;
    container.innerHTML = `<div id="${mapId}" style="width:100%; height:${height}; border-radius:8px"></div>`;
    const g = window.google.maps;
    const map = new g.Map(document.getElementById(mapId), {
      zoom: 12,
      center: { lat: points[0].lat, lng: points[0].lng },
    });
    const bounds = new g.LatLngBounds();
    const infoWindow = new g.InfoWindow();
    points.forEach((p) => {
      const position = { lat: p.lat, lng: p.lng };
      const marker = new g.Marker({ position, map, title: p.title || '' });
      if (p.title || p.info) {
        marker.addListener('click', () => {
          infoWindow.setContent(`<strong>${escapeHtml(p.title || '')}</strong><br>${escapeHtml(p.info || '')}`);
          infoWindow.open(map, marker);
        });
      }
      bounds.extend(position);
    });
    if (opts.polyline && points.length > 1) {
      new g.Polyline({
        path: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        map,
        strokeColor: '#1d6f5e',
        strokeWeight: 3,
      });
    }
    if (points.length > 1) map.fitBounds(bounds);
  }

  return {
    toast,
    money,
    num,
    escapeHtml,
    todayStr,
    formatDateTime,
    optionsHtml,
    openModal,
    closeModal,
    confirmAction,
    promptReason,
    badge,
    setContent,
    renderMap,
    googleMapsLink,
    googleDirectionsLink,
    getCurrentPosition,
  };
})();
