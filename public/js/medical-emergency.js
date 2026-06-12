/**
 * Medical & road crash — Nigeria-realistic citizen layer.
 * Tap-to-call only; no auto-dispatch. Numbers vary by state — verify locally.
 */
(function () {
  const ICE_KEY = 'sa_medical_ice';
  const REASON_KEY = 'sa_pending_panic_reason';

  const REASON_LABELS = {
    medical: 'Medical emergency',
    road_accident: 'Road accident',
    security: 'Security SOS',
    other: 'Emergency',
  };

  let emergencyGroups = null;

  function getPendingReason() {
    return window.pendingPanicReason || localStorage.getItem(REASON_KEY) || 'security';
  }

  function setPendingReason(reason) {
    const r = reason || 'security';
    window.pendingPanicReason = r;
    localStorage.setItem(REASON_KEY, r);
  }

  function getMedicalIce() {
    if (window.state?.preferences?.medical_ice && Object.keys(window.state.preferences.medical_ice).length) {
      return window.state.preferences.medical_ice;
    }
    if (window.state?.user?.medical_ice && Object.keys(window.state.user.medical_ice).length) {
      return window.state.user.medical_ice;
    }
    try {
      return JSON.parse(localStorage.getItem(ICE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveGuestIce(ice) {
    localStorage.setItem(ICE_KEY, JSON.stringify(ice || {}));
  }

  function syncIceProfileUI() {
    const ice = getMedicalIce();
    const fields = ['ice-blood', 'ice-allergies', 'ice-conditions', 'ice-name', 'ice-phone'];
    const keys = ['blood_group', 'allergies', 'conditions', 'ice_name', 'ice_phone'];
    keys.forEach((k, i) => {
      const el = document.getElementById(fields[i]);
      if (el) el.value = ice[k] || '';
    });
  }

  async function saveMedicalIce() {
    const payload = {
      blood_group: document.getElementById('ice-blood')?.value?.trim() || '',
      allergies: document.getElementById('ice-allergies')?.value?.trim() || '',
      conditions: document.getElementById('ice-conditions')?.value?.trim() || '',
      ice_name: document.getElementById('ice-name')?.value?.trim() || '',
      ice_phone: document.getElementById('ice-phone')?.value?.trim() || '',
    };
    saveGuestIce(payload);
    if (window.state?.preferences) window.state.preferences.medical_ice = payload;
    if (!window.state?.token) {
      toast('Medical info saved on this device — sign in to sync', 'ok');
      return;
    }
    try {
      await api('/user/medical-ice', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Medical ICE saved', 'ok');
    } catch (e) {
      toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
    }
  }

  async function loadEmergencyDirectory() {
    if (emergencyGroups) return emergencyGroups;
    try {
      const cfg = await window.api('/config/public');
      emergencyGroups = cfg.emergency_contacts_grouped || [];
      window._emergencyDisclaimer = cfg.emergency_contacts_disclaimer || '';
    } catch {
      emergencyGroups = [
        {
          id: 'national',
          label: 'National',
          contacts: [{ name: '112 Emergency', phone: '112', note: 'Availability varies by state' }],
        },
      ];
    }
    return emergencyGroups;
  }

  function callEmergency(phone) {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
  }

  async function renderEmergencyContacts(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const groups = await loadEmergencyDirectory();
    const disc = window._emergencyDisclaimer;
    wrap.innerHTML =
      (disc
        ? `<p style="font-size:10px;color:var(--text3);line-height:1.45;margin-bottom:10px">${window.escapeHtml ? window.escapeHtml(disc) : disc}</p>`
        : '') +
      groups
        .map(
          (g) => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:800;color:var(--text2);margin-bottom:6px">${window.escapeHtml ? window.escapeHtml(g.label) : g.label}</div>
          ${(g.contacts || [])
            .map((c) => {
              const phone = c.phone || '';
              const btn = phone
                ? `<button type="button" class="btn btn-outline btn-sm" style="font-size:11px;padding:6px 10px" onclick="SafeAlertMedical.call('${phone}')">📞 ${window.escapeHtml ? window.escapeHtml(c.name) : c.name}</button>`
                : `<span style="font-size:11px;color:var(--text2)">${window.escapeHtml ? window.escapeHtml(c.name) : c.name}</span>`;
              return `<div style="margin-bottom:8px">${btn}${c.note ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.4">${window.escapeHtml ? window.escapeHtml(c.note) : c.note}</div>` : ''}</div>`;
            })
            .join('')}
        </div>`
        )
        .join('');
  }

  function openMedicalCrashSheet() {
    const sheet = document.getElementById('medical-crash-sheet');
    const bg = document.getElementById('sheet-bg');
    if (!sheet || !bg) return;
    renderEmergencyContacts('medical-emergency-list');
    sheetOpenedAt = Date.now();
    window.sheetOpenedAt = sheetOpenedAt;
    bg.classList.add('show');
    sheet.classList.add('show');
  }

  function closeMedicalCrashSheet() {
    document.getElementById('medical-crash-sheet')?.classList.remove('show');
    if (!document.querySelector('.sheet.show')) document.getElementById('sheet-bg')?.classList.remove('show');
  }

  function activateSosWithReason(reason) {
    setPendingReason(reason);
    closeMedicalCrashSheet();
    if (typeof doPanic === 'function') doPanic();
    else toast('Hold PANIC on home to activate SOS', 'ok');
  }

  function witnessReport(typeId) {
    closeMedicalCrashSheet();
    if (typeof go === 'function') go('report');
    setTimeout(() => {
      if (typeof pickType === 'function') pickType(typeId);
      const ta = document.getElementById('rdesc');
      if (ta && typeId === 'road_accident') {
        ta.value = 'Witnessed road crash — sharing location for community awareness. Verify before travel.';
      } else if (ta && typeId === 'medical_emergency') {
        ta.value = 'Medical emergency reported — community alert only, not ambulance dispatch.';
      }
    }, 400);
  }

  async function findNearestHospital() {
    const { lat, lng } = typeof effectiveCoords === 'function' ? effectiveCoords() : { lat: window.uLat, lng: window.uLng };
    if (lat == null || lng == null) return toast('Turn on GPS first', 'err');
    try {
      const res = await api(`/resources/nearby?lat=${lat}&lng=${lng}&radius_km=40`);
      const items = (res.resources || []).filter((r) => ['hospital', 'clinic'].includes(r.type));
      const sheet = document.getElementById('nearest-hospital-sheet');
      const list = document.getElementById('nearest-hospital-list');
      const bg = document.getElementById('sheet-bg');
      if (!sheet || !list) return;
      if (!items.length) {
        list.innerHTML =
          '<p style="font-size:12px;color:var(--text2);line-height:1.5">No curated hospitals nearby yet. Call <strong>112</strong> or ask your circle — lists vary by LGA.</p>';
      } else {
        list.innerHTML = items
          .slice(0, 8)
          .map(
            (h) => `
          <div class="card card-sm" style="margin-bottom:8px;padding:10px">
            <div style="font-weight:700;font-size:13px">${window.escapeHtml ? window.escapeHtml(h.name) : h.name}</div>
            <div style="font-size:11px;color:var(--text2)">${h.distance_km} km · ${window.escapeHtml ? window.escapeHtml(h.state || '') : h.state || ''}${h.note ? ` — ${window.escapeHtml ? window.escapeHtml(h.note) : h.note}` : ''}</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
              ${h.phone ? `<button type="button" class="btn btn-green btn-sm" onclick="SafeAlertMedical.call('${h.phone}')">📞 Call</button>` : ''}
              <button type="button" class="btn btn-outline btn-sm" onclick="window.open('https://maps.google.com/?q=${h.lat},${h.lng}','_blank')">🗺 Map</button>
            </div>
          </div>`
          )
          .join('');
      }
      sheetOpenedAt = Date.now();
      bg?.classList.add('show');
      sheet.classList.add('show');
    } catch (e) {
      toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message, 'err');
    }
  }

  function buildIceShareText() {
    const ice = getMedicalIce();
    const parts = [];
    if (ice.blood_group) parts.push(`Blood group: ${ice.blood_group}`);
    if (ice.allergies) parts.push(`Allergies: ${ice.allergies}`);
    if (ice.conditions) parts.push(`Conditions: ${ice.conditions}`);
    if (ice.ice_name) parts.push(`ICE contact: ${ice.ice_name}${ice.ice_phone ? ` (${ice.ice_phone})` : ''}`);
    return parts.length ? `\n\n🏥 Medical info:\n${parts.join('\n')}` : '';
  }

  function shareIceWhatsApp() {
    const base = window.SafeAlertCitizenSOS?.buildSosMessage?.({ reason: getPendingReason() }) || '🆘 SOS';
    const text = base + buildIceShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  function applyReasonUI(reason) {
    const r = reason || 'security';
    if (r === 'security' || r === 'other') {
      const wrap = document.getElementById('pov-medical-actions');
      if (wrap) wrap.style.display = 'none';
      return;
    }
    const wrap = document.getElementById('pov-medical-actions');
    if (wrap) wrap.style.display = 'block';
    const label = REASON_LABELS[r] || 'Citizen SOS';
    const status = document.querySelector('#pov .pov-status');
    if (status) {
      if (r === 'medical') status.textContent = '● MEDICAL SOS ACTIVE';
      else if (r === 'road_accident') status.textContent = '● ROAD CRASH SOS ACTIVE';
      else status.textContent = '● CITIZEN SOS ACTIVE';
    }
    const sub = document.querySelector('#pov .pov-sub');
    if (sub) {
      sub.textContent =
        r === 'medical'
          ? `${label} — circle + first-aid helpers · you choose who to call (112, hospital)`
          : r === 'road_accident'
            ? `${label} — circle + road helpers · FRSC/112 lines vary by state`
            : 'Your circle + nearby helpers — not government dispatch';
    }
    renderPovMedicalActions(r);
  }

  function renderPovMedicalActions(reason) {
    const wrap = document.getElementById('pov-medical-actions');
    if (!wrap) return;
    const r = reason || getPendingReason();
    const ice = getMedicalIce();
    const iceHint =
      ice.blood_group || ice.allergies
        ? `<p style="font-size:10px;color:rgba(255,255,255,0.7);margin:0 0 8px;line-height:1.4">ICE on file — tap Share ICE to send with WhatsApp SOS</p>`
        : '';
    wrap.innerHTML =
      iceHint +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <button type="button" class="btn btn-green btn-sm" onclick="SafeAlertMedical.call('112')">📞 Call 112</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="SafeAlertMedical.nearestHospital()">🏥 Nearest hospital</button>
        ${r === 'road_accident' ? `<button type="button" class="btn btn-outline btn-sm" onclick="SafeAlertMedical.call('122')">🚗 FRSC 122</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" onclick="SafeAlertMedical.shareIce()">📋 Share ICE</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="SafeAlertMedical.showTips('${r}')">💡 What to do</button>
      </div>`;
  }

  function showTips(reason) {
    const tips =
      reason === 'medical'
        ? 'Medical SOS tips (Nigeria):\n• Call 112 if conscious — response varies\n• Ask circle to call nearest hospital YOU trust\n• Do not move someone with neck/back injury\n• Share ICE info via WhatsApp\n• Red Cross is disaster aid — not a taxi ambulance'
        : reason === 'road_accident'
          ? 'Road crash tips:\n• Secure scene — hazard lights, warning triangle if safe\n• Call 112, then FRSC 122 on highways\n• Do not move injured unless fire risk\n• Bystanders: mark location on map for others\n• Official response times vary — circle is often faster'
          : 'Stay visible, share live location, call 112 for immediate danger. SafeAlert alerts your people — not government dispatch.';
    alert(tips);
  }

  function firstAidTips() {
    showTips('medical');
  }

  window.SafeAlertMedical = {
    getPendingReason,
    setPendingReason,
    getMedicalIce,
    saveMedicalIce,
    syncIceProfileUI,
    openSheet: openMedicalCrashSheet,
    closeSheet: closeMedicalCrashSheet,
    activateSosWithReason,
    witnessReport,
    call: callEmergency,
    nearestHospital: findNearestHospital,
    shareIce: shareIceWhatsApp,
    applyReasonUI,
    renderPovMedicalActions,
    showTips,
    firstAidTips,
    buildIceShareText,
    renderEmergencyContacts,
  };

  window.openMedicalCrashSheet = openMedicalCrashSheet;
  window.saveMedicalIce = saveMedicalIce;
  window.activateSosWithReason = activateSosWithReason;
})();
