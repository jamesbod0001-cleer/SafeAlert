/**
 * Citizen SOS — life-saving without government dispatch.
 * Uses your safety circle + WhatsApp/calls + nearby helpers (FCM).
 */
(function () {
  const CIRCLE_STORE_KEY = 'safealert_circle_phones';
  const CIRCLE_CACHE_KEY = 'safealert_circle_cache';

  function circlePhoneStore() {
    try {
      return JSON.parse(localStorage.getItem(CIRCLE_STORE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function getCircleContacts() {
    const store = circlePhoneStore();
    let members = window.circle || [];
    try {
      const cached = JSON.parse(localStorage.getItem(CIRCLE_CACHE_KEY) || '[]');
      if (cached.length) members = cached;
    } catch {
      /* ignore */
    }
    return members
      .filter((m) => m.name && m.name !== 'Sign in')
      .map((m) => ({
        name: m.name,
        relation: m.relation || m.rel || '',
        phone: normalizePhone(store[m.name] || m.phone),
      }))
      .filter((m) => m.phone);
  }

  function normalizePhone(raw) {
    if (!raw) return null;
    const s = String(raw).replace(/\s+/g, '');
    if (s.startsWith('****')) return null;
    if (/^\+?234\d{10}$/.test(s)) return s.startsWith('+') ? s : `+${s}`;
    if (/^0\d{10}$/.test(s)) return `+234${s.slice(1)}`;
    if (/^\d{10,11}$/.test(s)) return s.startsWith('0') ? `+234${s.slice(1)}` : `+234${s}`;
    return null;
  }

  function mapsUrl(lat, lng) {
    if (lat == null || lng == null) return '';
    return `https://maps.google.com/?q=${lat},${lng}`;
  }

  function buildSosMessage(opts = {}) {
    const lat = opts.lat ?? window.uLat;
    const lng = opts.lng ?? window.uLng;
    const tag = opts.shortId || window.SafeAlertUX?.activePanicShortId || '';
    const reason = opts.reason || window.SafeAlertMedical?.getPendingReason?.() || 'security';
    const idLine = tag ? `Alert #${tag}\n` : '';
    const map = mapsUrl(lat, lng);
    const time = new Date().toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos',
    });
    let headline = '🆘 SOS — I NEED HELP NOW!';
    if (reason === 'medical') headline = '🏥 MEDICAL SOS — I NEED HELP NOW!';
    else if (reason === 'road_accident') headline = '🚗 ROAD CRASH SOS — I NEED HELP NOW!';
    const ice = window.SafeAlertMedical?.buildIceShareText?.() || '';
    const lang = localStorage.getItem('safealert_lang') || 'en';
    if (lang === 'pcm') {
      return (
        `${headline}\n${idLine}` +
        (map ? `📍 My location: ${map}\n` : '') +
        `🕐 Time: ${time}${ice}\n\n` +
        `Na SafeAlert citizen alert — abeg call or come if you fit. No wait for government.\n` +
        `Share give people wey fit help.`
      );
    }
    return (
      `${headline}\n${idLine}` +
      (map ? `📍 My live location: ${map}\n` : 'Open SafeAlert for my location.\n') +
      `🕐 Time: ${time}${ice}\n\n` +
      `Citizen SafeAlert alert — please call or come if you can safely help.\n` +
      `Share with trusted people nearby. We are not waiting on government dispatch.`
    );
  }

  function openWhatsApp(text) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  function openSms(phone, text) {
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('234') ? `0${digits.slice(3)}` : phone;
    window.open(`sms:${local}?body=${encodeURIComponent(text)}`, '_self');
  }

  function callPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('234') ? `0${digits.slice(3)}` : phone;
    window.location.href = `tel:${local}`;
  }

  function cacheCircle(members) {
    if (!members?.length) return;
    localStorage.setItem(CIRCLE_CACHE_KEY, JSON.stringify(members));
  }

  function sharePanicWhatsApp() {
    const text = buildSosMessage();
    openWhatsApp(text);
    if (typeof window.toast === 'function') {
      window.toast('WhatsApp opened — send to your circle & trusted contacts', 'ok');
    }
  }

  function sharePanicToMember(index) {
    const contacts = getCircleContacts();
    const m = contacts[index];
    if (!m) return;
    const text = buildSosMessage();
    const digits = m.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  function callCircleMember(index) {
    const contacts = getCircleContacts();
    const m = contacts[index];
    if (!m) return;
    callPhone(m.phone);
  }

  function renderPovCircleActions() {
    const wrap = document.getElementById('pov-circle-actions');
    if (!wrap) return;
    const contacts = getCircleContacts();
    if (!contacts.length) {
      wrap.innerHTML =
        '<p style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.5;margin-bottom:8px">Add circle members in Profile — or use WhatsApp below to alert someone you trust.</p>';
      return;
    }
    wrap.innerHTML = contacts
      .slice(0, 5)
      .map(
        (m, i) =>
          `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <span style="font-size:12px;color:rgba(255,255,255,0.9);flex:1;min-width:120px">${window.escapeHtml ? window.escapeHtml(m.name) : m.name}</span>
            <button type="button" class="btn btn-outline btn-sm" style="font-size:11px;padding:6px 10px" onclick="SafeAlertCitizenSOS.callCircleMember(${i})">📞 Call</button>
            <button type="button" class="btn btn-outline btn-sm" style="font-size:11px;padding:6px 10px" onclick="SafeAlertCitizenSOS.sharePanicToMember(${i})">💬 WA</button>
          </div>`
      )
      .join('');
  }

  /** If API panic fails — still alert people via phone/WhatsApp (no server). */
  function activateLocalFallback(errMsg, opts = {}) {
    const alreadyVisible = opts.alreadyVisible || document.getElementById('pov')?.classList.contains('show');
    if (!alreadyVisible) {
      navigator.vibrate?.([200, 100, 200, 100, 400]);
      document.getElementById('pov')?.classList.add('show');
    }
    const hint = document.getElementById('panic-hint');
    if (hint) hint.textContent = 'Offline SOS — alert your circle on WhatsApp now';
    const sub = document.querySelector('#pov .pov-sub');
    if (sub) sub.textContent = 'Server unreachable — use WhatsApp & calls below';
    if (typeof window.toast === 'function') {
      window.toast(
        errMsg
          ? `${errMsg} — use WhatsApp SOS below`
          : 'Use WhatsApp SOS to alert your circle now',
        'err'
      );
    }
    renderPovCircleActions();
    if (!alreadyVisible) sharePanicWhatsApp();
  }

  function warnIfCircleEmpty() {
    const contacts = getCircleContacts();
    if (contacts.length) return false;
    if (typeof window.toast === 'function') {
      window.toast('Opening WhatsApp — add contacts in Profile for faster alerts next time', 'err');
    }
    setTimeout(() => sharePanicWhatsApp(), 600);
    return true;
  }

  window.SafeAlertCitizenSOS = {
    getCircleContacts,
    buildSosMessage,
    sharePanicWhatsApp,
    sharePanicToMember,
    callCircleMember,
    cacheCircle,
    renderPovCircleActions,
    activateLocalFallback,
    warnIfCircleEmpty,
    openSms,
  };
})();
